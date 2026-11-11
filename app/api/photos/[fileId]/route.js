import { handle, requireToken, HttpError } from "@/lib/session";
import { drive } from "@/lib/google";

export const runtime = "nodejs";

const ID = /^[\w-]{10,}$/;

export const GET = handle(async (req, { params }) => {
  const { token } = await requireToken();
  const { fileId } = await params;
  if (!ID.test(fileId)) throw new HttpError(400, "Identifiant invalide");
  const r = await drive.download(token, fileId);
  const headers = new Headers();
  headers.set("Content-Type", r.headers.get("content-type") || "image/jpeg");
  headers.set("Cache-Control", "private, max-age=86400");
  const len = r.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  return new Response(r.body, { status: 200, headers });
});

export const DELETE = handle(async (req, { params }) => {
  const { token } = await requireToken();
  const { fileId } = await params;
  if (!ID.test(fileId)) throw new HttpError(400, "Identifiant invalide");
  await drive.trash(token, fileId);
  return Response.json({ ok: true });
});
