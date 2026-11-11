import { handle, requireToken } from "@/lib/session";
import { zoho } from "@/lib/zoho";

export const GET = handle(async () => {
  const { user } = await requireToken();
  return Response.json({ user: { name: user.name, email: user.email }, crm: zoho.configured(), claude: !!process.env.ANTHROPIC_API_KEY });
});
