import HC from "@/public/hc-core.js";
import { handle, requireToken, HttpError } from "@/lib/session";
import { loadVisite, saveVisite, deleteVisite } from "@/lib/store";

export const runtime = "nodejs";

export const GET = handle(async (req, { params }) => {
  const { token } = await requireToken();
  const { id } = await params;
  const fileId = new URL(req.url).searchParams.get("fileId") || undefined;
  return Response.json(await loadVisite(token, id, fileId));
});

export const PUT = handle(async (req, { params }) => {
  const { token } = await requireToken();
  const { id } = await params;
  const body = await req.json();
  if (!body || body.id !== id) throw new HttpError(400, "Identifiant incohérent");
  const v = HC.ensure(body);
  if (!v._drive?.fileId) {
    const current = await loadVisite(token, id);
    v._drive = { ...(current._drive || {}), ...(v._drive || {}) };
  }
  const saved = await saveVisite(token, v);
  return Response.json({ ok: true, maj: saved.maj });
});

export const DELETE = handle(async (req, { params }) => {
  const { token } = await requireToken();
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  let folderId = sp.get("folderId") || "";
  let fileId = sp.get("fileId") || "";
  if (!folderId && !fileId) {
    const v = await loadVisite(token, id);
    folderId = v._drive?.visiteFolderId || "";
    fileId = v._drive?.fileId || "";
  }
  await deleteVisite(token, { folderId, fileId });
  return Response.json({ ok: true });
});
