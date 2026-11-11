// Page de mise en service : reçoit les clés (Google, Anthropic, Zoho), les vérifie,
// les enregistre dans Vercel et relance le déploiement. Protégée par SETUP_TOKEN (lien
// unique) ou par une connexion Google d'un administrateur (ADMIN_EMAILS).
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { HttpError, handle } from "@/lib/session";
import { vercelLinked, setEnv, deleteEnv, redeploy } from "@/lib/vercel";

export const runtime = "nodejs";
export const maxDuration = 120;

const ADMINS = (process.env.ADMIN_EMAILS || "gabriel.lafreniere@firstblock.com").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function authorize(req) {
  const key = new URL(req.url).searchParams.get("key") || req.headers.get("x-setup-key") || "";
  if (process.env.SETUP_TOKEN && key && key === process.env.SETUP_TOKEN) return "token";
  const session = await auth().catch(() => null);
  const email = String(session?.user?.email || "").toLowerCase();
  if (email && ADMINS.includes(email)) return "admin";
  throw new HttpError(403, "Accès refusé");
}

function host(req) {
  return (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim();
}

export const GET = handle(async (req) => {
  const mode = await authorize(req);
  const h = host(req);
  return Response.json({
    mode,
    host: h,
    redirectUri: `https://${h}/api/auth/callback/google`,
    vercel: vercelLinked(),
    configured: {
      google: !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      zoho: !!process.env.ZOHO_REFRESH_TOKEN,
      drive: !!process.env.DRIVE_ROOT_FOLDER_ID,
    },
  });
});

async function verifyAnthropic(key) {
  const client = new Anthropic({ apiKey: key });
  await client.models.retrieve(process.env.CLAUDE_MODEL || "claude-opus-5-5");
}

async function zohoExchange({ clientId, clientSecret, code, accountsUrl }) {
  const acc = (accountsUrl || process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.com").replace(/\/$/, "");
  const r = await fetch(`${acc}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, code }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.refresh_token) throw new HttpError(400, "Zoho : " + (j.error || "le code n'a pas donné de jeton (il expire après 10 minutes ; générez-en un nouveau)"));
  const apiDomain = (j.api_domain || process.env.ZOHO_API_URL || "https://www.zohoapis.com").replace(/\/$/, "");
  const t = await fetch(`${apiDomain}/crm/v8/org`, { headers: { Authorization: "Zoho-oauthtoken " + j.access_token } });
  if (!t.ok) throw new HttpError(400, "Zoho : jeton obtenu mais l'API CRM refuse (" + t.status + "). Vérifiez les portées ZohoCRM.modules.ALL,ZohoCRM.settings.READ.");
  return { refreshToken: j.refresh_token, apiDomain, accountsUrl: acc };
}

export const POST = handle(async (req) => {
  await authorize(req);
  const body = await req.json().catch(() => ({}));
  const vars = {};
  const done = [];
  if (body.google?.id || body.google?.secret) {
    const id = String(body.google.id || "").trim();
    const secret = String(body.google.secret || "").trim();
    if (!/\.apps\.googleusercontent\.com$/.test(id)) throw new HttpError(400, "Google : l'ID client doit se terminer par .apps.googleusercontent.com");
    if (secret.length < 10) throw new HttpError(400, "Google : secret client manquant");
    vars.AUTH_GOOGLE_ID = id;
    vars.AUTH_GOOGLE_SECRET = secret;
    done.push("Google");
  }
  if (body.anthropic?.key) {
    const key = String(body.anthropic.key).trim();
    try {
      await verifyAnthropic(key);
    } catch (e) {
      throw new HttpError(400, "Clé Anthropic refusée : " + (e.message || "vérifiez la clé"));
    }
    vars.ANTHROPIC_API_KEY = key;
    done.push("Claude");
  }
  if (body.zoho?.code) {
    const z = await zohoExchange({
      clientId: String(body.zoho.clientId || "").trim(),
      clientSecret: String(body.zoho.clientSecret || "").trim(),
      code: String(body.zoho.code || "").trim(),
      accountsUrl: body.zoho.accountsUrl,
    });
    vars.ZOHO_CLIENT_ID = String(body.zoho.clientId).trim();
    vars.ZOHO_CLIENT_SECRET = String(body.zoho.clientSecret).trim();
    vars.ZOHO_REFRESH_TOKEN = z.refreshToken;
    vars.ZOHO_API_URL = z.apiDomain;
    vars.ZOHO_ACCOUNTS_URL = z.accountsUrl;
    done.push("Zoho CRM");
  }
  if (body.driveRoot) {
    vars.DRIVE_ROOT_FOLDER_ID = String(body.driveRoot).trim();
    done.push("Drive");
  }
  if (!done.length) throw new HttpError(400, "Rien à enregistrer");
  if (!vercelLinked()) return Response.json({ ok: false, saved: false, done, message: "Vercel n'est pas relié : copiez ces variables à la main dans Vercel > Settings > Environment Variables.", vars: Object.keys(vars) });
  await setEnv(vars);
  let redeployed = false;
  try {
    await redeploy();
    redeployed = true;
  } catch (e) {
    console.error("redeploy:", e.message);
  }
  if (body.finish && process.env.SETUP_TOKEN) await deleteEnv("SETUP_TOKEN").catch(() => {});
  return Response.json({ ok: true, saved: true, done, redeployed });
});
