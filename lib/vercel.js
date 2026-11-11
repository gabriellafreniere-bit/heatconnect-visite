// Accès à l'API Vercel depuis l'application (page de configuration) : variables d'environnement et redéploiement.
import { HttpError } from "./session.js";

const API = "https://api.vercel.com";

function cfg() {
  const token = process.env.VERCEL_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  const team = process.env.VERCEL_TEAM_ID || "";
  if (!token || !project) return null;
  return { token, project, team };
}
export const vercelLinked = () => !!cfg();

async function v(path, init = {}) {
  const c = cfg();
  if (!c) throw new HttpError(503, "Vercel n'est pas relié (VERCEL_TOKEN / VERCEL_PROJECT_ID)");
  const url = new URL(API + path);
  if (c.team) url.searchParams.set("teamId", c.team);
  const r = await fetch(url, { ...init, headers: { Authorization: "Bearer " + c.token, "Content-Type": "application/json", ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, `Vercel ${r.status} : ${j.error?.message || j.error?.code || "erreur"}`);
  return j;
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
