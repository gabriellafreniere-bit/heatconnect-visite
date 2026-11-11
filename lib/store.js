// Les visites vivent dans Google Drive : un dossier « Visite technique » dans le dossier
// de l'opportunité, avec visite-technique.json, un sous-dossier Photos et, après publication,
// Rapport.html et donnees.json. Les propriétés d'application du JSON servent d'index.
import HC from "@/public/hc-core.js";
import { drive, q } from "./google.js";
import { HttpError } from "./session.js";

export const FILE_NAME = "visite-technique.json";
export const FOLDER_NAME = "Visite technique";
export const PHOTOS_NAME = "Photos";

const clip = (s, n) => String(s || "").slice(0, n);

export function summary(v) {
  const sc = HC.score(v);
  return {
    heatconnect: "visite",
    vid: v.id,
    nom: clip(v.bat?.nom, 80),
    adresse: clip(v.bat?.adresse, 80),
    pct: String(sc.pct),
    dealId: clip(v.crm?.dealId, 40),
    dealName: clip(v.crm?.dealName, 80),
  };
}

export async function listVisites(token) {
  const files = await drive.list(token, `appProperties has { key='heatconnect' and value='visite' } and trashed=false`, {
    fields: "files(id,name,modifiedTime,appProperties)",
    orderBy: "modifiedTime desc",
    max: 400,
  });
  return files
    .map((f) => ({
      id: f.appProperties?.vid,
      fileId: f.id,
      nom: f.appProperties?.nom || "",
      adresse: f.appProperties?.adresse || "",
      pct: Number(f.appProperties?.pct || 0),
      dealName: f.appProperties?.dealName || "",
      maj: Date.parse(f.modifiedTime) || 0,
    }))
    .filter((x) => x.id);
}

export async function findFile(token, vid) {
  const files = await drive.list(token, `appProperties has { key='vid' and value='${q(vid)}' } and trashed=false`, { max: 3 });
  return files[0] || null;
}

export async function loadVisite(token, vid, fileId) {
  let file = null;
  if (fileId) file = await drive.get(token, fileId).catch(() => null);
  if (!file || file.trashed || file.appProperties?.vid !== vid) file = await findFile(token, vid);
  if (!file) throw new HttpError(404, "Visite introuvable dans le Drive");
  const r = await drive.download(token, file.id);
  const v = HC.ensure(await r.json());
  v._drive = v._drive || {};
  v._drive.fileId = file.id;
  if (!v._drive.visiteFolderId && file.parents?.[0]) v._drive.visiteFolderId = file.parents[0];
  return v;
}

export async function saveVisite(token, v) {
  const id = v._drive?.fileId;
  if (!id) throw new HttpError(400, "Identifiant Drive manquant");
  const clean = HC.stripPending(v);
  await drive.update(token, id, { metadata: { appProperties: summary(clean) }, mimeType: "application/json", data: Buffer.from(JSON.stringify(clean)) });
  return clean;
}

// Crée la structure dans le dossier parent (dossier de l'opportunité) et le JSON initial.
export async function createVisite(token, { parentFolderId, crm, patch }) {
  const visiteFolder = await drive.ensureFolder(token, parentFolderId, FOLDER_NAME);
  const photosFolder = await drive.ensureFolder(token, visiteFolder.id, PHOTOS_NAME);
  const v = HC.nouvelleVisite();
  v.crm = crm || null;
  v._drive = { folderId: parentFolderId, visiteFolderId: visiteFolder.id, photosFolderId: photosFolder.id };
  if (patch) patch(v);
  const f = await drive.upload(token, {
    name: FILE_NAME,
    parentId: visiteFolder.id,
    mimeType: "application/json",
    data: Buffer.from(JSON.stringify(v)),
    appProperties: summary(v),
    description: "Visite technique HeatConnect (données de l'application)",
  });
  v._drive.fileId = f.id;
  return v;
}

// Déplace le dossier « Visite technique » d'une visite vers un autre dossier d'opportunité.
export async function moveVisite(token, v, newParentId) {
  if (!v._drive?.visiteFolderId) throw new HttpError(400, "Dossier de visite manquant");
  await drive.move(token, v._drive.visiteFolderId, v._drive.folderId, newParentId);
  v._drive.folderId = newParentId;
  return v;
}

export async function deleteVisite(token, { folderId, fileId }) {
  if (folderId) await drive.trash(token, folderId);
  else if (fileId) await drive.trash(token, fileId);
}
