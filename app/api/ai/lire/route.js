import { handle, requireToken, HttpError } from "@/lib/session";
import { lireImage } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 120;

export const POST = handle(async (req) => {
  await requireToken();
  const fd = await req.formData();
  const image = fd.get("image");
  if (!image || typeof image === "string") throw new HttpError(400, "Image manquante");
  let spec;
  try {
    spec = JSON.parse(String(fd.get("spec") || "{}"));
  } catch (e) {
    throw new HttpError(400, "Spécification invalide");
  }
  if (!Array.isArray(spec.fields) || spec.fields.length > 40) throw new HttpError(400, "Spécification invalide");
  const buf = Buffer.from(await image.arrayBuffer());
  if (buf.length > 20 * 1024 * 1024) throw new HttpError(413, "Image trop lourde");
  const result = await lireImage({ spec, image: buf, mime: /^image\/(jpeg|png|webp|gif)$/.test(image.type) ? image.type : "image/jpeg" });
  return Response.json({ result });
});
