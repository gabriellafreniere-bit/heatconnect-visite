import HC from "@/public/hc-core.js";
import { requireToken } from "@/lib/session";
import { syntheseStream } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 300;

// Diffuse la synthèse en texte brut au fur et à mesure.
export async function POST(req) {
  try {
    await requireToken();
  } catch (e) {
    return new Response(e.message, { status: e.status || 401 });
  }
  let visite;
  try {
    visite = HC.ensure((await req.json()).visite);
  } catch (e) {
    return new Response("Données invalides", { status: 400 });
  }
  const enc = new TextEncoder();
  let stream;
  try {
    stream = syntheseStream(HC.stripPending(visite));
  } catch (e) {
    return new Response(e.message, { status: e.status || 500 });
  }
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta") controller.enqueue(enc.encode(event.delta.text));
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(enc.encode("\n\n[Claude a refusé de produire la synthèse.]"));
      } catch (e) {
        controller.enqueue(enc.encode("\n\n[Erreur : " + (e.message || "synthèse interrompue") + "]"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      try {
        stream.abort();
      } catch (e) {}
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
