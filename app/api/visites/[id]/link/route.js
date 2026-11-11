import HC from "@/public/hc-core.js";
import { handle, requireToken, HttpError } from "@/lib/session";
import { zoho } from "@/lib/zoho";
import { drive, FOLDER } from "@/lib/google";
import { loadVisite, saveVisite, moveVisite } from "@/lib/store";
import { crmInfo, applyCrm } from "@/lib/prefill";

export const runtime = "nodejs";
export const maxDuration = 60;

// Lie une visite créée sans opportunité à une opportunité Zoho et déplace son dossier Drive.
export const POST = handle(async (req, { params }) => {
  const { token } = await requireToken();
  const { id } = await params;
  const body = await req.json();
  const deal = await zoho.record("Deals", String(body.dealId || ""));
  if (!deal) throw new HttpError(404, "Opportunité introuvable");
  const v = body.visite ? HC.ensure(body.visite) : await loadVisite(token, id);
  if (!v._drive?.fileId) {
    const cur = await loadVisite(token, id);
    v._drive = { ...(cur._drive || {}), ...(v._drive || {}) };
  }
  const [immeuble, contact, onsite, account] = await Promise.all([
    zoho.record("Immeubles", deal.Immeuble?.id).catch(() => null),
    zoho.record("Contacts", deal.Contact_Name?.id).catch(() => null),
    zoho.record("Contacts", deal.Nom_de_la_personne_sur_place_visite?.id).catch(() => null),
    zoho.record("Accounts", deal.Account_Name?.id).catch(() => null),
  ]);
  v.crm = crmInfo(deal);
  applyCrm(v, { deal, immeuble, contact, onsite, account });
  if (deal.Google_drive) {
    const f = await drive.get(token, deal.Google_drive).catch(() => null);
    if (f && !f.trashed && f.mimeType === FOLDER && f.id !== v._drive.folderId) await moveVisite(token, v, f.id);
  }
  v.maj = Date.now();
  await saveVisite(token, v);
  return Response.json(v);
});
