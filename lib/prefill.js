// Préremplissage : (1) correspondances directes CRM -> visite, (2) collecte des sources
// (notes CRM, documents du Drive, courriels), (3) extraction par Claude, (4) fusion
// prudente (ne remplace jamais une valeur saisie à la main).
import HC from "@/public/hc-core.js";
import { zoho } from "./zoho.js";
import { drive, gmail, threadToText } from "./google.js";
import { prefillWithClaude } from "./claude.js";

const { S, isEmpty } = HC;

export function crmInfo(deal) {
  return deal
    ? {
        dealId: deal.id,
        dealName: deal.Deal_Name || "",
        stage: deal.Stage || "",
        accountName: deal.Account_Name?.name || "",
        contactName: deal.Contact_Name?.name || "",
        immeubleId: deal.Immeuble?.id || null,
        url: deal.URL_de_l_opportunit || `https://crm.zoho.com/crm/org756477569/tab/Potentials/${deal.id}`,
      }
    : null;
}

function set(obj, k, val, src, force = false) {
  if (val == null || val === "" || (typeof val === "number" && isNaN(val))) return false;
  obj._ai = obj._ai || {};
  obj._src = obj._src || {};
  if (!isEmpty(obj[k]) && !obj._ai[k] && !force) return false; // saisi à la main : on ne touche pas
  obj[k] = val;
  obj._ai[k] = "prefill";
  obj._src[k] = src;
  return true;
}
const pickOpt = (opts, val) => {
  if (!val) return null;
  const v = String(val).toLowerCase();
  return opts.find((o) => o.toLowerCase() === v) || opts.find((o) => v.includes(o.toLowerCase().slice(0, 6)) || o.toLowerCase().includes(v.slice(0, 6))) || null;
};
const num = (x) => {
  if (x == null || x === "") return null;
  const n = parseFloat(String(x).replace(/[^\d.,-]/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
};

// Correspondances directes depuis Zoho (Deal, Immeuble, Contacts, Compte).
export function applyCrm(v, { deal, immeuble, contact, onsite, account }) {
  const b = v.bat;
  const srcD = "CRM · opportunité";
  const srcI = "CRM · fiche Immeuble";
  if (immeuble) {
    set(b, "nom", immeuble.Name, srcI);
    const addr = [immeuble.Adresse, immeuble.Ville, immeuble.Province, immeuble.Code_postal].filter(Boolean).join(", ");
    set(b, "adresse", addr, srcI);
    set(b, "type", mapType(immeuble.Type_d_immeuble), srcI);
    set(b, "etages_hs", num(immeuble.Nombre_d_tages), srcI);
    set(b, "superficie_totale", num(immeuble.Superficie_pieds_carr_s), srcI);
    if (num(immeuble.Superficie_pieds_carr_s)) set(b, "unite_surface", "pi²", srcI);
    set(v.ene, "combustible", mapComb(immeuble.Source_d_nergie), srcI);
    set(v.chauf, "chauffage_centralise", mapOuiNon(immeuble.Chauffage_centralis), srcI);
    set(v.esp, "tension", mapTension(immeuble.Voltage_lectrique_Volts), srcI);
    set(v.esp, "amperage", num(immeuble.Capacit_lectrique_totale_Amp_res), srcI);
    const notes = [immeuble.Description_du_chauffage, immeuble.Type_de_distribution && "Distribution : " + immeuble.Type_de_distribution, immeuble.Comment_le_chauffage_est_il_zon && "Zonage : " + immeuble.Comment_le_chauffage_est_il_zon].filter(Boolean).join("\n");
    set(v.chauf, "notes", notes, srcI);
    const infos = [immeuble.Informations_suppl_mentaires, immeuble.Informations_suppl_mentaires_sur_la_capacit_lect && "Électricité : " + immeuble.Informations_suppl_mentaires_sur_la_capacit_lect].filter(Boolean).join("\n");
    set(b, "notes", infos, srcI);
    if (immeuble.Co_t_annuel_de_chauffage) set(v.ene, "notes", `Coût annuel de chauffage selon le CRM : ${immeuble.Co_t_annuel_de_chauffage} $`, srcI);
  }
  if (deal) {
    if (isEmpty(b.nom)) set(b, "nom", (deal.Deal_Name || "").replace(/\s+-\s+(HeatConnect|Hashlink|HashLink)[^-]*-\s*\d+\s*$/i, "").trim(), srcD);
    if (!immeuble && deal.Type_d_immeuble?.length) set(b, "type", mapType(deal.Type_d_immeuble[0]), srcD);
    set(b, "nb_unites", num(deal.Nombre_de_portes_multilogements), srcD);
    if (deal.Co_t_annuel_de_chauffage && isEmpty(v.ene.notes)) set(v.ene, "notes", `Coût annuel de chauffage selon le CRM : ${deal.Co_t_annuel_de_chauffage} $`, srcD);
    if (deal.Description_du_projet && isEmpty(b.notes)) set(b, "notes", deal.Description_du_projet, srcD);
  }
  const c = onsite || contact;
  if (c) {
    const srcC = onsite ? "CRM · personne sur place" : "CRM · contact de l'opportunité";
    set(b, "contact_nom", c.Full_Name || [c.First_Name, c.Last_Name].filter(Boolean).join(" "), srcC);
    set(b, "contact_courriel", c.Email, srcC);
    set(b, "contact_tel", c.Mobile || c.Phone, srcC);
    set(b, "contact_role", pickOpt(S.bat.champs.find((f) => f.k === "contact_role").opts, c.Title), srcC);
  }
  if (account && isEmpty(b.nom)) set(b, "nom", account.Account_Name, "CRM · compte");
  return v;
}
function mapType(t) {
  if (!t) return null;
  const s = String(t).toLowerCase();
  if (s.includes("bureau")) return "Bureaux";
  if (s.includes("résidentiel") || s.includes("residentiel") || s.includes("logement")) return "Logements locatifs";
  if (s.includes("commercial")) return "Commercial";
  if (s.includes("industriel")) return "Industriel";
  if (s.includes("institution")) return "Institutionnel";
  if (s.includes("hôtel") || s.includes("hotel")) return "Hôtel";
  if (s.includes("aîné") || s.includes("aine") || s.includes("rpa")) return "Résidence pour aînés";
  return "Autre";
}
function mapComb(s) {
  if (!s) return null;
  const x = String(s).toLowerCase();
  if (x.includes("gaz")) return "Gaz naturel (Énergir)";
  if (x.includes("mazout") || x.includes("huile")) return "Mazout";
  if (x.includes("propane")) return "Propane";
  if (x.includes("élec") || x.includes("elec") || x.includes("hydro")) return "Électricité seulement";
  return "Autre";
}
function mapOuiNon(s) {
  if (!s) return null;
  const x = String(s).toLowerCase();
  if (x.startsWith("oui") || x === "yes" || x === "true") return "Oui";
  if (x.startsWith("non") || x === "no" || x === "false") return "Non";
  return null;
}
function mapTension(s) {
  if (!s) return null;
  const x = String(s).replace(/\s/g, "");
  if (x.includes("600") && x.includes("347")) return "347/600 V";
  if (x.includes("600")) return "600 V";
  if (x.includes("208")) return "120/208 V";
  if (x.includes("240")) return "120/240 V";
  return "Autre";
}

// ---------- Collecte des sources ----------
const PDF_MAX = 12 * 1024 * 1024, IMG_MAX = 8 * 1024 * 1024, TOTAL_MAX = 26 * 1024 * 1024;
const IGNORE = /contrat|loi|lettre d'intention|soumission|devis|facture first ?block|heatconnect_contrat|deck|présentation|presentation/i;

export async function collectDriveDocs(token, folderId, { maxPdf = 8, maxImg = 6, maxText = 6 } = {}) {
  if (!folderId) return { docs: [], blocks: [] };
  const files = await drive.tree(token, folderId, { depth: 2, exclude: ["Visite technique"] });
  const docs = [];
  const blocks = [];
  let total = 0, nPdf = 0, nImg = 0, nTxt = 0;
  for (const f of files.sort((a, b) => (b.modifiedTime || "").localeCompare(a.modifiedTime || ""))) {
    const size = Number(f.size || 0);
    const rec = { id: f.id, name: f.path || f.name, mime: f.mimeType, size, modifiedTime: f.modifiedTime, analyse: null };
    docs.push(rec);
    if (IGNORE.test(f.name)) { rec.analyse = "ignoré"; continue; }
    try {
      if (f.mimeType === "application/pdf" && nPdf < maxPdf && size <= PDF_MAX && total + size <= TOTAL_MAX) {
        const buf = Buffer.from(await (await drive.download(token, f.id)).arrayBuffer());
        blocks.push({ kind: "pdf", name: rec.name, data: buf });
        total += size; nPdf++; rec.analyse = "lu";
      } else if (/^image\/(jpeg|png|webp|gif)$/.test(f.mimeType) && nImg < maxImg && size <= IMG_MAX && total + size <= TOTAL_MAX) {
        const buf = Buffer.from(await (await drive.download(token, f.id)).arrayBuffer());
        blocks.push({ kind: "image", name: rec.name, mime: f.mimeType, data: buf });
        total += size; nImg++; rec.analyse = "lu";
      } else if (f.mimeType === "application/vnd.google-apps.document" && nTxt < maxText) {
        const t = await drive.exportText(token, f.id, "text/plain");
        blocks.push({ kind: "text", name: rec.name, text: t.slice(0, 40_000) });
        nTxt++; rec.analyse = "lu";
      } else if (f.mimeType === "application/vnd.google-apps.spreadsheet" && nTxt < maxText) {
        const t = await drive.exportText(token, f.id, "text/csv");
        blocks.push({ kind: "text", name: rec.name, text: t.slice(0, 40_000) });
        nTxt++; rec.analyse = "lu";
      } else if (/text\/(plain|csv)/.test(f.mimeType) && nTxt < maxText && size < 2_000_000) {
        const t = await (await drive.download(token, f.id)).text();
        blocks.push({ kind: "text", name: rec.name, text: t.slice(0, 40_000) });
        nTxt++; rec.analyse = "lu";
      }
    } catch (e) {
      rec.analyse = "erreur";
    }
  }
  return { docs, blocks };
}

export async function collectEmails(token, addresses, { maxThreads = 8 } = {}) {
  const addrs = [...new Set(addresses.filter(Boolean).map((a) => a.toLowerCase()))];
  if (!addrs.length) return { text: "", count: 0 };
  const query = "(" + addrs.map((a) => `from:${a} OR to:${a}`).join(" OR ") + ") newer_than:450d";
  const threads = await gmail.threads(token, query, maxThreads).catch(() => []);
  const parts = [];
  let total = 0;
  for (const t of threads) {
    try {
      const full = await gmail.thread(token, t.id);
      const txt = threadToText(full).slice(0, 14_000);
      if (total + txt.length > 70_000) break;
      parts.push(txt);
      total += txt.length;
    } catch (e) {}
  }
  return { text: parts.join("\n\n==========\n\n"), count: parts.length };
}

export function crmText({ deal, immeuble, contact, onsite, account, notes, attachments }) {
  const keep = (o, keys) => Object.fromEntries(keys.filter((k) => o && o[k] != null && o[k] !== "").map((k) => [k, typeof o[k] === "object" && o[k]?.name ? o[k].name : o[k]]));
  const d = keep(deal, ["Deal_Name", "Stage", "Type", "Account_Name", "Contact_Name", "Description", "Description_du_projet", "Type_d_immeuble", "Nombre_de_portes_multilogements", "Co_t_annuel_de_chauffage", "KW_total", "Capacit_disponible_KW", "Nombre_de_cabinets", "Source_du_lead", "Created_Time"]);
  const i = keep(immeuble, ["Name", "Adresse", "Ville", "Province", "Code_postal", "Type_d_immeuble", "Nombre_d_tages", "Superficie_pieds_carr_s", "Hauteur_des_plafonds_pieds", "Source_d_nergie", "Chauffage_centralis", "Type_de_distribution", "Comment_le_chauffage_est_il_zon", "Description_du_chauffage", "Voltage_lectrique_Volts", "Capacit_lectrique_totale_Amp_res", "Capacit_lectrique_disponible_Amp_res", "Informations_suppl_mentaires_sur_la_capacit_lect", "Tarif_lectrique", "Co_t_annuel_de_chauffage", "tes_vous_propri_taire_ou_locataire", "Informations_suppl_mentaires"]);
  const c = keep(contact, ["Full_Name", "Title", "Email", "Phone", "Mobile", "Account_Name"]);
  const o = keep(onsite, ["Full_Name", "Title", "Email", "Phone", "Mobile"]);
  const a = keep(account, ["Account_Name", "Website", "Billing_Street", "Billing_City", "Description"]);
  const n = (notes || [])
    .sort((x, y) => (y.Modified_Time || "").localeCompare(x.Modified_Time || ""))
    .slice(0, 40)
    .map((x) => `[${(x.Created_Time || "").slice(0, 10)}] ${x.Note_Title || ""}\n${(x.Note_Content || "").slice(0, 6000)}`)
    .join("\n\n");
  const att = (attachments || []).map((x) => x.File_Name).join(", ");
  return `OPPORTUNITÉ (Zoho CRM)\n${JSON.stringify(d, null, 1)}\n\nFICHE IMMEUBLE\n${JSON.stringify(i, null, 1)}\n\nCONTACT PRINCIPAL\n${JSON.stringify(c, null, 1)}\n\nPERSONNE SUR PLACE\n${JSON.stringify(o, null, 1)}\n\nCOMPTE\n${JSON.stringify(a, null, 1)}\n\nPIÈCES JOINTES CRM (noms seulement)\n${att || "aucune"}\n\nNOTES DU CRM (les plus récentes d'abord ; elles contiennent les synthèses de rencontres, de Slack et de courriels)\n${n || "aucune"}`;
}

// ---------- Fusion du résultat de Claude ----------
function applyFields(target, secId, res, srcMap, prefix) {
  let n = 0;
  for (const f of S[secId].champs) {
    if (!f.k || f.t === "liste" || f.h || f.info) continue;
    let val = res?.[f.k];
    if (val == null || val === "") continue;
    if (f.t === "select" || f.t === "bool") val = f.t === "bool" ? mapOuiNon(val) : pickOpt(f.opts, val);
    else if (f.t === "multi") val = Array.isArray(val) ? val.map((x) => pickOpt(f.opts, x)).filter(Boolean) : [pickOpt(f.opts, val)].filter(Boolean);
    else if (f.t === "number") val = num(val);
    if (val == null || (Array.isArray(val) && !val.length)) continue;
    if (set(target, f.k, val, srcMap[`${prefix}${f.k}`] || srcMap[f.k] || "Préremplissage Claude")) n++;
  }
  return n;
}
function applyList(v, secId, listKey, items, srcMap) {
  const def = S[secId].champs.find((f) => f.k === listKey);
  const list = v[secId][listKey];
  let n = 0;
  for (const it of items || []) {
    const sig = (x) => [x.marque, x.modele, x.compte, x.periode, x.fichier].filter(Boolean).join("|").toLowerCase();
    let target = list.find((x) => sig(x) && sig(x) === sig(it));
    if (!target) {
      if (list.some((x) => !Object.keys(x._ai || {}).length && !sig(x))) continue; // un élément saisi à la main sans signature : on ne devine pas
      target = { id: HC.uid(), _photos: [], _ai: {}, _src: {} };
      for (const c of def.champs) if (c.def != null) target[c.k] = c.def;
      list.push(target);
    }
    for (const c of def.champs) {
      let val = it[c.k];
      if (val == null || val === "") continue;
      if (c.t === "select") val = pickOpt(c.opts, val);
      else if (c.t === "number") val = num(val);
      if (val == null) continue;
      if (set(target, c.k, val, it.source || srcMap[listKey] || "Préremplissage Claude")) n++;
    }
    if (it.fichier) target.fichier = it.fichier;
  }
  return n;
}

export function applyPrefill(v, res) {
  const srcMap = {};
  for (const s of res.sources || []) if (s && s.champ) srcMap[s.champ] = s.source;
  let n = 0;
  for (const sid of ["bat", "ene", "chauf", "air", "plans", "esp"]) n += applyFields(v[sid], sid, res[sid], srcMap, sid + ".");
  n += applyList(v, "ene", "factures", res.factures, srcMap);
  n += applyList(v, "chauf", "chauffe_eau", res.chauffe_eau, srcMap);
  n += applyList(v, "chauf", "chaudieres", res.chaudieres, srcMap);
  n += applyList(v, "air", "unites_air", res.unites_air, srcMap);
  n += applyList(v, "air", "aerothermes", res.aerothermes, srcMap);
  if (res.factures?.length) {
    const fournisseurs = new Set(res.factures.map((f) => String(f.fournisseur || "").toLowerCase()));
    if ([...fournisseurs].some((f) => f.includes("hydro"))) set(v.ene, "hq_factures", "Reçues", "Factures trouvées dans le Drive");
    if ([...fournisseurs].some((f) => f.includes("énergir") || f.includes("energir") || f.includes("gaz"))) set(v.ene, "gaz_factures", "Reçues", "Factures trouvées dans le Drive");
  }
  if (res.resume && isEmpty(v.contexte)) v.contexte = res.resume;
  if (Array.isArray(res.manquants)) v.manquants = res.manquants.slice(0, 30);
  return n;
}

// ---------- Orchestration ----------
export async function prefillVisite(token, v, { scope = "all" } = {}) {
  const dealId = v.crm?.dealId;
  const sources = [];
  let crm = null, crmTxt = "", emails = { text: "", count: 0 };
  if (dealId && zoho.configured()) {
    const deal = await zoho.record("Deals", dealId);
    if (!deal) throw new Error("Opportunité introuvable dans Zoho");
    const [immeuble, contact, onsite, account, notes, attachments] = await Promise.all([
      zoho.record("Immeubles", deal.Immeuble?.id).catch(() => null),
      zoho.record("Contacts", deal.Contact_Name?.id).catch(() => null),
      zoho.record("Contacts", deal.Nom_de_la_personne_sur_place_visite?.id).catch(() => null),
      zoho.record("Accounts", deal.Account_Name?.id).catch(() => null),
      zoho.notes("Deals", dealId).catch(() => []),
      zoho.attachments("Deals", dealId),
    ]);
    crm = { deal, immeuble, contact, onsite, account, notes, attachments };
    v.crm = { ...(v.crm || {}), ...crmInfo(deal) };
    applyCrm(v, crm);
    crmTxt = crmText(crm);
    sources.push(`CRM (${notes.length} notes)`);
    if (scope === "all") {
      const addresses = [contact?.Email, onsite?.Email, contact?.Secondary_Email].filter(Boolean);
      emails = await collectEmails(token, addresses);
      if (emails.count) sources.push(`Gmail (${emails.count} fils)`);
    }
  }
  const { docs, blocks } = await collectDriveDocs(token, v._drive?.folderId);
  v.docs = docs;
  if (blocks.length) sources.push(`Drive (${blocks.length} documents lus)`);
  let n = 0;
  if (crmTxt || blocks.length || emails.text) {
    const res = await prefillWithClaude({ visite: HC.stripPending(v), crmText: crmTxt, emailsText: emails.text, blocks, scope });
    n = applyPrefill(v, res);
    for (const d of v.docs) if (d.analyse === "lu") d.analyse = (res.factures || []).some((f) => f.fichier && d.name.toLowerCase().includes(String(f.fichier).toLowerCase().slice(0, 20))) ? "facture" : "document";
  }
  v.sources.push(`${new Date().toLocaleString("fr-CA", { timeZone: "America/Toronto" })} : ${sources.join(", ") || "aucune source"} · ${n} champs préremplis`);
  if (v.sources.length > 20) v.sources = v.sources.slice(-20);
  return v;
}
