// Zoho CRM (API v8) avec un jeton d'actualisation « self-client » propre à l'application.
// Centre de données : accounts.zoho.com / www.zohoapis.com (First Block). Surcharger au besoin.
import { HttpError } from "./session.js";

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.com";
const API = process.env.ZOHO_API_URL || "https://www.zohoapis.com";
let cache = { token: null, exp: 0 };

async function accessToken() {
  if (!process.env.ZOHO_REFRESH_TOKEN) throw new HttpError(503, "Zoho CRM n'est pas configuré (ZOHO_REFRESH_TOKEN)");
  if (cache.token && Date.now() < cache.exp - 60_000) return cache.token;
  const r = await fetch(`${ACCOUNTS}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new HttpError(502, "Zoho : jeton refusé (" + (j.error || r.status) + ")");
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return j.access_token;
}

async function z(path, init = {}) {
  const t = await accessToken();
  const r = await fetch(`${API}/crm/v8${path}`, { ...init, headers: { Authorization: "Zoho-oauthtoken " + t, ...(init.headers || {}) } });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new HttpError(r.status === 401 ? 502 : 502, `Zoho ${r.status} : ${(j && (j.message || j.code)) || "erreur"}`);
  return j;
}

const DEAL_FIELDS = "Deal_Name,Stage,Account_Name,Contact_Name,Modified_Time,Google_drive,Type,Immeuble";

export const zoho = {
  configured: () => !!process.env.ZOHO_REFRESH_TOKEN,

  async searchDeals(word) {
    const w = String(word || "").trim();
    const j =
      w.length >= 2
        ? await z(`/Deals/search?word=${encodeURIComponent(w)}&fields=${DEAL_FIELDS}&per_page=40`)
        : await z(`/Deals?fields=${DEAL_FIELDS}&sort_by=Modified_Time&sort_order=desc&per_page=40`);
    return ((j && j.data) || []).map((d) => ({
      id: d.id,
      name: d.Deal_Name,
      stage: d.Stage,
      account: d.Account_Name?.name || "",
      contact: d.Contact_Name?.name || "",
      driveId: d.Google_drive || null,
      type: d.Type || "",
    }));
  },

  async record(module, id) {
    if (!id) return null;
    const j = await z(`/${module}/${encodeURIComponent(id)}`);
    return (j && j.data && j.data[0]) || null;
  },

  async notes(module, id) {
    const j = await z(`/${module}/${encodeURIComponent(id)}/Notes?fields=Note_Title,Note_Content,Created_Time,Modified_Time&per_page=200`);
    return (j && j.data) || [];
  },

  async attachments(module, id) {
    const j = await z(`/${module}/${encodeURIComponent(id)}/Attachments?fields=File_Name,Size,Created_Time&per_page=100`).catch(() => null);
    return (j && j.data) || [];
  },

  async updateDeal(id, data) {
    return z(`/Deals/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [data] }),
    });
  },
};
