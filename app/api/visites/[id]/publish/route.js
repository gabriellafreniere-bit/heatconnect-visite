import HC from "@/public/hc-core.js";
import { handle, requireToken, HttpError } from "@/lib/session";
import { drive } from "@/lib/google";
import { loadVisite, saveVisite } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

async function putFile(token, folderId, name, mimeType, data) {
  const existing = await drive.findChild(token, folderId, name);
  if (existing) return drive.update(token, existing.id, { metadata: {}, mimeType, data });
  return drive.upload(token, { name, parentId: folderId, mimeType, data });
}

// Écrit Rapport.html et donnees.json dans le dossier « Visite technique » du Drive.
export const POST = handle(async (req, { params }) => {
  const { token } = await requireToken();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const v = body.visite ? HC.ensure(body.visite) : await loadVisite(token, id);
  if (!v._drive?.fileId) {
    const cur = await loadVisite(token, id);
    v._drive = { ...(cur._drive || {}), ...(v._drive || {}) };
  }
  const folderId = v._drive?.visiteFolderId;
  if (!folderId) throw new HttpError(400, "Dossier « Visite technique » introuvable");
  const files = HC.photoFiles(v);
  const html = HC.rapportHTML(v, files, {
    src: (f) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(f.id)}&sz=w1600`,
    href: (f) => `https://drive.google.com/file/d/${encodeURIComponent(f.id)}/view`,
  });
  v.publie = Date.now();
  const rapport = await putFile(token, folderId, "Rapport.html", "text/html", Buffer.from(html));
  await putFile(token, folderId, "donnees.json", "application/json", Buffer.from(JSON.stringify(HC.stripPending(v), null, 2)));
  await saveVisite(token, v);
  return Response.json({ ok: true, url: rapport.webViewLink || `https://drive.google.com/file/d/${rapport.id}/view`, folder: `https://drive.google.com/drive/folders/${folderId}` });
});
