// Page de mise en service : reçoit les clés (Google, Anthropic, Zoho), les vérifie,
// les enregistre dans Vercel et relance le déploiement. Protégée par SETUP_TOKEN (lien
// unique) ou par une connexion Google d'un administrateur (ADMIN_EMAILS).
import Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "node:crypto";
import { auth } from "@/auth";
import { HttpError, handle } from "@/lib/session";
import { vercelLinked, setEnv, deleteEnv, redeploy, resolveProject, useCredentials } from "@/lib/vercel";

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

function projectName(req) {
  if (process.env.VERCEL_PROJECT_NAME) return process.env.VERCEL_PROJECT_NAME;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL || "";
  const m = prod.match(/^([a-z0-9-]+)\.vercel\.app$/i);
  if (m) return m[1];
  const h = host(req);
  const m2 = h.match(/^([a-z0-9-]+?)(?:-[a-z0-9]{9}-[a-z0-9-]+)?\.vercel\.app$/i);
  return m2 ? m2[1] : "heatconnect-visite";
}

function host(req) {
  return (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim();
}

// Vérifie l'ID client et le secret Google sans connexion : Google répond invalid_client
// si le couple est faux, invalid_grant si le couple est bon (le code bidon est rejeté).
async function googleCheck() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) return "absent";
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.AUTH_GOOGLE_ID, client_secret: process.env.AUTH_GOOGLE_SECRET, grant_type: "authorization_code", code: "verification", redirect_uri: "https://localhost/" }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.error === "invalid_client") return "invalid_client";
    if (j.error === "invalid_grant" || j.error === "redirect_uri_mismatch") return "ok";
    return j.error || "inconnu";
  } catch (e) {
    return "erreur";
  }
}

export const GET = handle(async (req) => {
  const mode = await authorize(req);
  const h = host(req);
  const gcheck = new URL(req.url).searchParams.get("check") === "google" ? await googleCheck() : undefined;
  return Response.json({
    googleCheck: gcheck,
    lastAuthError: globalThis.__hcLastAuthError || null,
    mode,
    host: h,
    redirectUri: `https://${h}/api/auth/callback/google`,
    vercel: vercelLinked(),
    projectName: projectName(req),
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
  if (body.vercel?.token) {
    const token = String(body.vercel.token).trim();
    const name = String(body.vercel.project || projectName(req)).trim();
    const c = await resolveProject(token, name);
    useCredentials({ token: c.token, project: c.project, team: c.team });
    vars.VERCEL_TOKEN = c.token;
    vars.VERCEL_PROJECT_ID = c.project;
    vars.VERCEL_TEAM_ID = c.team || "";
    vars.VERCEL_PROJECT_NAME = c.name;
    vars.AUTH_TRUST_HOST = "true";
    if (!process.env.AUTH_SECRET) vars.AUTH_SECRET = randomBytes(32).toString("base64");
    vars.ALLOWED_EMAIL_DOMAINS = process.env.ALLOWED_EMAIL_DOMAINS || "firstblock.com";
    vars.ADMIN_EMAILS = process.env.ADMIN_EMAILS || "gabriel.lafreniere@firstblock.com";
    vars.DRIVE_ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID || "1kKEXC0KziKS2HUfC31ZPtfTtIRi-hWbj";
    vars.CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
    done.push("Vercel (" + c.account + ")");
  }
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
  if (vars.VERCEL_TEAM_ID === "") delete vars.VERCEL_TEAM_ID;
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
