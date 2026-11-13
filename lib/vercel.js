// Accès à l'API Vercel depuis l'application (page de configuration) : variables d'environnement et redéploiement.
import { HttpError } from "./session.js";

const API = "https://api.vercel.com";

let override = null; // identifiants fournis par la page de mise en service (avant redéploiement)
export function useCredentials(c) {
  override = c;
}
function cfg() {
  if (override) return override;
  const token = process.env.VERCEL_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  const team = process.env.VERCEL_TEAM_ID || "";
  if (!token || !project) return null;
  return { token, project, team };
}
export const vercelLinked = () => !!cfg();

async function raw(token, path, team, init = {}) {
  const url = new URL(API + path);
  if (team) url.searchParams.set("teamId", team);
  const r = await fetch(url, { ...init, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, `Vercel ${r.status} : ${j.error?.message || j.error?.code || "erreur"}`);
  return j;
}
async function v(path, init = {}) {
  const c = cfg();
  if (!c) throw new HttpError(503, "Vercel n'est pas relié (VERCEL_TOKEN / VERCEL_PROJECT_ID)");
  return raw(c.token, path, c.team, init);
}

// Vérifie un jeton et retrouve le projet (compte personnel puis chaque équipe) par son nom.
export async function resolveProject(token, name) {
  let user = null;
  try {
    user = await raw(token, "/v2/user", "");
  } catch (e) {
    if (e.message.includes("403") || e.message.includes("401")) throw new HttpError(400, "Jeton refusé par Vercel. Créez un jeton dont la portée (SCOPE) est votre compte complet, pas seulement le projet, avec une expiration d'un an ou « No Expiration ».");
  }
  const scopes = [""];
  const teams = await raw(token, "/v2/teams", "").catch(() => ({ teams: [] }));
  for (const t of teams.teams || []) scopes.push(t.id);
  let lastErr = "";
  for (const team of scopes) {
    try {
      const p = await raw(token, `/v9/projects/${encodeURIComponent(name)}`, team);
      if (p && p.id) return { token, project: p.id, team, name: p.name, account: user?.user?.username || user?.user?.email || "compte Vercel" };
    } catch (e) {
      lastErr = e.message;
    }
  }
  throw new HttpError(400, `Jeton accepté, mais le projet Vercel « ${name} » n'est pas accessible avec ce jeton (${lastErr || "introuvable"}). Créez un jeton avec la portée de votre compte complet (« Full Account »), pas seulement du projet.`);
}

export async function setEnv(vars, { targets = ["production", "preview", "development"] } = {}) {
  const body = Object.entries(vars)
    .filter(([, val]) => val != null && val !== "")
    .map(([key, value]) => ({ key, value: String(value), type: "encrypted", target: targets }));
  if (!body.length) return { created: [] };
  return v(`/v10/projects/${cfg().project}/env?upsert=true`, { method: "POST", body: JSON.stringify(body) });
}

export async function deleteEnv(key) {
  const list = await v(`/v9/projects/${cfg().project}/env`);
  for (const e of list.envs || []) if (e.key === key) await v(`/v9/projects/${cfg().project}/env/${e.id}`, { method: "DELETE" });
}

// Redéploie la dernière production (les nouvelles variables prennent effet).
export async function redeploy() {
  const c = cfg();
  const list = await v(`/v6/deployments?projectId=${c.project}&target=production&limit=1&state=READY`);
  const last = list.deployments?.[0];
  if (!last) throw new HttpError(502, "Aucun déploiement de production à relancer");
  const name = last.name || process.env.VERCEL_PROJECT_NAME || "heatconnect-visite";
  return v(`/v13/deployments?forceNew=1`, { method: "POST", body: JSON.stringify({ name, deploymentId: last.uid, target: "production" }) });
}
