import { handle, requireToken } from "@/lib/session";
import { zoho } from "@/lib/zoho";

export const GET = handle(async (req) => {
  await requireToken();
  const q = new URL(req.url).searchParams.get("q") || "";
  return Response.json(await zoho.searchDeals(q));
});
