import { handle, requireToken, HttpError } from "@/lib/session";
import { zoho } from "@/lib/zoho";
import { drive, FOLDER } from "@/lib/google";
import { listVisites, createVisite } from "@/lib/store";
import { crmInfo, applyCrm } from "@/lib/prefill";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = handle(async () => {
  const { token } = await requireToken();
  return Response.json(await listVisites(token));
});

// Trouve (ou crée) le dossier Drive de l'opportunité. Le champ Google_drive de Zoho
// contient l'identifiant du dossier créé par l'automatisation à l'ouverture de l'opportunité.
async function dealFolder(token, deal) {
  if (deal.Google_drive) {
    const f = await drive.get(token, deal.Google_drive).catch(() => null);
    if (f && !f.trashed && f.mimeType === FOLDER) return f.id;
  }
  const root = process.env.DRIVE_ROOT_FOLDER_ID;
  if (!root) throw new HttpError(400, "Cette opportunité n'a pas de dossier Drive et DRIVE_ROOT_FOLDER_ID n'est pas défini");
  const f = await drive.createFolder(token, deal.Deal_Name || "Opportunité " + deal.id, root);
  if (process.env.ZOHO_WRITE_DRIVE_ID === "true") await zoho.updateDeal(deal.id, { Google_drive: f.id }).catch((e) => console.error("Zoho Google_drive:", e.message));
  return f.id;
}

export const POST = handle(async (req) => {
  const { token } = await requireToken();
  const body = await req.json().catch(() => ({}));
  const dealId = body.dealId ? String(body.dealId) : null;
  if (dealId) {
    const deal = await zoho.record("Deals", dealId);
    if (!deal) throw new HttpError(404, "Opportunité introuvable");
    const [immeuble, contact, onsite, account] = await Promise.all([
      zoho.record("Immeubles", deal.Immeuble?.id).catch(() => null),
      zoho.record("Contacts", deal.Contact_Name?.id).catch(() => null),
      zoho.record("Contacts", deal.Nom_de_la_personne_sur_place_visite?.id).catch(() => null),
      zoho.record("Accounts", deal.Account_Name?.id).catch(() => null),
    ]);
    const parentFolderId = await dealFolder(token, deal);
    const v = await createVisite(token, { parentFolderId, crm: crmInfo(deal), patch: (x) => applyCrm(x, { deal, immeuble, contact, onsite, account }) });
    return Response.json(v);
  }
  const root = process.env.DRIVE_ROOT_FOLDER_ID;
  if (!root) throw new HttpError(400, "Définissez DRIVE_ROOT_FOLDER_ID pour créer une visite sans opportunité");
  const name = `Visite sans opportunité · ${new Date().toISOString().slice(0, 10)}`;
  const folder = await drive.createFolder(token, name, root);
  const v = await createVisite(token, { parentFolderId: folder.id, crm: null });
  return Response.json(v);
});
