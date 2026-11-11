import { handle, requireToken, HttpError } from "@/lib/session";
import { drive } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 60;

// Téléverse une photo (JPEG redimensionnée par le client) dans le dossier Photos de la visite.
export const POST = handle(async (req) => {
  const { token } = await requireToken();
  const fd = await req.formData();
  const file = fd.get("file");
  const folderId = String(fd.get("folderId") || "");
  if (!file || typeof file === "string") throw new HttpError(400, "Fichier manquant");
  if (!folderId) throw new HttpError(400, "Dossier manquant");
  const mime = /^image\/(jpeg|png|webp)$/.test(file.type) ? file.type : "image/jpeg";
  const data = Buffer.from(await file.arrayBuffer());
  if (data.length > 20 * 1024 * 1024) throw new HttpError(413, "Photo trop lourde");
  const name = (file.name || "photo.jpg").replace(/[^\w.\-àâçéèêëîïôûùüÿœÀÂÇÉÈÊËÎÏÔÛÙÜŸŒ]/g, "_");
  const f = await drive.upload(token, { name, parentId: folderId, mimeType: mime, data });
  return Response.json({ id: f.id, name: f.name });
});
