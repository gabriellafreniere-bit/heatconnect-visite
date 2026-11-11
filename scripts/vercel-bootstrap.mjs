#!/usr/bin/env node
// Crée (ou retrouve) le projet Vercel, le relie au dépôt GitHub si l'intégration existe,
// pose les variables de base et lance le premier déploiement. Usage :
//   VERCEL_TOKEN=... node scripts/vercel-bootstrap.mjs --repo owner/heatconnect-visite [--name heatconnect-visite] [--team team_xxx] [--drive-root ID]
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true"] : [])).filter((x) => x.length));
const TOKEN = process.env.VERCEL_TOKEN;
if (!TOKEN) throw new Error("VERCEL_TOKEN manquant");
const NAME = args.name || "heatconnect-visite";
const TEAM = args.team || process.env.VERCEL_TEAM_ID || "";
const REPO = args.repo || "";
const API = "https://api.vercel.com";

async function v(path, init = {}) {
  const url = new URL(API + path);
  if (TEAM) url.searchParams.set("teamId", TEAM);
  const r = await fetch(url, { ...init, headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json", ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(`Vercel ${r.status} ${path} : ${j.error?.message || j.error?.code}`);
    e.code = j.error?.code;
    throw e;
  }
  return j;
}

const user = await v("/v2/user");
console.log("Compte Vercel :", user.user?.username || user.user?.email);

let project = await v(`/v9/projects/${NAME}`).catch(() => null);
if (!project) {
  const body = { name: NAME, framework: "nextjs" };
  if (REPO) body.gitRepository = { type: "github", repo: REPO };
  try {
    project = await v("/v10/projects", { method: "POST", body: JSON.stringify(body) });
    console.log("Projet créé", REPO ? "et relié à " + REPO : "(sans Git)");
  } catch (e) {
    if (!REPO) throw e;
    console.log("Liaison GitHub impossible (" + e.message + "). Création sans Git ; le déploiement se fera par envoi direct des fichiers.");
    project = await v("/v10/projects", { method: "POST", body: JSON.stringify({ name: NAME, framework: "nextjs" }) });
  }
} else console.log("Projet existant :", project.id);

const setupToken = randomBytes(24).toString("base64url");
const authSecret = randomBytes(32).toString("base64");
const existing = (await v(`/v9/projects/${project.id}/env`)).envs || [];
const has = (k) => existing.some((e) => e.key === k);
const vars = {
  AUTH_SECRET: has("AUTH_SECRET") ? null : authSecret,
  AUTH_TRUST_HOST: "true",
  ALLOWED_EMAIL_DOMAINS: process.env.ALLOWED_EMAIL_DOMAINS || "firstblock.com",
  ADMIN_EMAILS: process.env.ADMIN_EMAILS || "gabriel.lafreniere@firstblock.com",
  SETUP_TOKEN: setupToken,
  VERCEL_TOKEN: TOKEN,
  VERCEL_PROJECT_ID: project.id,
  VERCEL_TEAM_ID: TEAM || null,
  VERCEL_PROJECT_NAME: NAME,
  DRIVE_ROOT_FOLDER_ID: args["drive-root"] || process.env.DRIVE_ROOT_FOLDER_ID || null,
  CLAUDE_MODEL: "claude-opus-5-5",
};
const body = Object.entries(vars).filter(([, val]) => val).map(([key, value]) => ({ key, value: String(value), type: "encrypted", target: ["production", "preview", "development"] }));
await v(`/v10/projects/${project.id}/env?upsert=true`, { method: "POST", body: JSON.stringify(body) });
console.log("Variables posées :", body.map((b) => b.key).join(", "));

// Déploiement : par Git si relié, sinon envoi direct des fichiers avec la CLI Vercel.
fs.mkdirSync(".vercel", { recursive: true });
fs.writeFileSync(".vercel/project.json", JSON.stringify({ projectId: project.id, orgId: project.accountId || TEAM || user.user?.id }, null, 2));
let url = "";
try {
  const out = execSync(`npx --yes vercel@latest deploy --prod --yes --token ${TOKEN}${TEAM ? " --scope " + TEAM : ""}`, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });
  url = out.trim().split("\n").pop();
} catch (e) {
  console.error("Déploiement CLI échoué :", e.message);
}
const domains = (await v(`/v9/projects/${project.id}/domains`)).domains || [];
const prodDomain = domains.find((d) => d.name.endsWith(".vercel.app"))?.name || (url ? url.replace(/^https?:\/\//, "") : `${NAME}.vercel.app`);
console.log("\nApplication :", "https://" + prodDomain);
console.log("Lien de mise en service (à transmettre à l'administrateur) :", `https://${prodDomain}/setup?key=${setupToken}`);
console.log("URI de redirection Google à déclarer :", `https://${prodDomain}/api/auth/callback/google`);
