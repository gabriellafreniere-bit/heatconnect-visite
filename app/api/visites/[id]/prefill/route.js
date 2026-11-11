import { handle, requireToken } from "@/lib/session";
import { loadVisite, saveVisite } from "@/lib/store";
import { prefillVisite } from "@/lib/prefill";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = handle(async (req, { params }) => {
  const { token } = await requireToken();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const v = await loadVisite(token, id, body.fileId);
  await prefillVisite(token, v, { scope: "all" });
  v.maj = Date.now();
  await saveVisite(token, v);
  return Response.json(v);
});
