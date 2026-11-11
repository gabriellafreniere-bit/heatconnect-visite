// Appels à Claude (API Anthropic) : préremplissage structuré, lecture de photos, synthèse.
import Anthropic from "@anthropic-ai/sdk";
import HC from "@/public/hc-core.js";
import { HttpError } from "./session.js";

const { S } = HC;
export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const BETAS = ["server-side-fallback-2026-07-01"];
let _client = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, "ANTHROPIC_API_KEY manquante");
  return (_client = _client || new Anthropic());
}

const CONTEXTE = `HeatConnect (First Block, Québec) ajoute au système de chauffage existant d'un bâtiment un module de récupération de chaleur de serveurs informatiques (module V4, 100 kW). Le système existant reste en place comme redondance. Avant la visite technique, un gestionnaire de compte remplit un dossier (document HC-REQ-RENO rév. A) que la firme d'ingénierie utilise pour estimer l'économie de chauffage et les subventions. Les sections : 01 le bâtiment ; 02 la consommation d'énergie (factures Hydro-Québec et Énergir) ; 03 le chauffage et l'eau chaude (chauffe-eau, chaudières) ; 04 les autres charges (unités de toit, aérothermes de garage, piscine, fonte de neige) ; 05 les plans ; 06 l'espace et l'électricité.`;

// ---------- Schéma JSON pour le préremplissage ----------
const jtype = (f) => (f.t === "number" ? { type: ["number", "null"] } : f.t === "multi" ? { type: ["array", "null"], items: { type: "string" } } : { type: ["string", "null"] });
function sectionSchema(sid) {
  const props = {};
  for (const f of S[sid].champs) {
    if (!f.k || f.t === "liste") continue;
    const sch = jtype(f);
    sch.description = f.l + (f.opts ? ` (valeurs possibles : ${f.opts.join(" | ")})` : "") + (f.t === "bool" ? " (Oui ou Non)" : "") + (f.unit ? ` en ${f.unit}` : "");
    props[f.k] = sch;
  }
  return { type: "object", properties: props, required: Object.keys(props), additionalProperties: false };
}
function listSchema(sid, key, extra = {}) {
  const def = S[sid].champs.find((f) => f.k === key);
  const props = { ...extra };
  for (const c of def.champs) {
    if (c.k === "notes" || c.k === "qte") { props[c.k] = c.t === "number" ? { type: ["number", "null"] } : { type: ["string", "null"] }; continue; }
    const sch = jtype(c);
    sch.description = c.l + (c.opts ? ` (valeurs possibles : ${c.opts.join(" | ")})` : "") + (c.unit ? ` en ${c.unit}` : "");
    props[c.k] = sch;
  }
  props.source = { type: ["string", "null"], description: "D'où vient l'information (ex. : note CRM du 4 nov., courriel de X du 10 nov., fichier Facture_HQ.pdf)" };
  return { type: "array", items: { type: "object", properties: props, required: Object.keys(props), additionalProperties: false } };
}
export function prefillSchema() {
  return {
    type: "object",
    properties: {
      bat: sectionSchema("bat"),
      ene: sectionSchema("ene"),
      chauf: sectionSchema("chauf"),
      air: sectionSchema("air"),
      plans: sectionSchema("plans"),
      esp: sectionSchema("esp"),
      factures: listSchema("ene", "factures", { fichier: { type: ["string", "null"], description: "Nom du fichier du Drive d'où vient la facture" } }),
      chauffe_eau: listSchema("chauf", "chauffe_eau"),
      chaudieres: listSchema("chauf", "chaudieres"),
      unites_air: listSchema("air", "unites_air"),
      aerothermes: listSchema("air", "aerothermes"),
      sources: { type: "array", items: { type: "object", properties: { champ: { type: "string", description: "section.champ, ex. bat.nb_unites" }, source: { type: "string" } }, required: ["champ", "source"], additionalProperties: false } },
      resume: { type: "string", description: "3 à 6 phrases en français : ce qu'on sait du bâtiment et du projet avant la visite" },
      manquants: { type: "array", items: { type: "string" }, description: "Informations obligatoires encore inconnues, à relever sur place ou à demander au client" },
    },
    required: ["bat", "ene", "chauf", "air", "plans", "esp", "factures", "chauffe_eau", "chaudieres", "unites_air", "aerothermes", "sources", "resume", "manquants"],
    additionalProperties: false,
  };
}

function parseJson(message) {
  if (message.stop_reason === "refusal") throw new HttpError(502, "Claude a refusé la demande" + (message.stop_details?.explanation ? " : " + message.stop_details.explanation : ""));
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return JSON.parse(text);
  } catch (e) {
    const m = text.match(/[\{\[][\s\S]*[\}\]]/);
    if (m) return JSON.parse(m[0]);
    throw new HttpError(502, "Réponse de Claude illisible");
  }
}

// ---------- Préremplissage ----------
export async function prefillWithClaude({ visite, crmText, emailsText, blocks, scope }) {
  const content = [];
  const courant = JSON.stringify(visite, (k, val) => (k === "_photos" || k === "_ai" || k === "_src" || k === "docs" || k === "sources" || k === "_drive" || k === "synthese" ? undefined : val));
  content.push({ type: "text", text: `FORMULAIRE DÉJÀ REMPLI (ne pas contredire ce qui est saisi, compléter seulement ce qui manque) :\n${courant.slice(0, 60_000)}` });
  if (crmText) content.push({ type: "text", text: `=== SOURCE : ZOHO CRM ===\n${crmText.slice(0, 120_000)}` });
  if (emailsText) content.push({ type: "text", text: `=== SOURCE : COURRIELS GMAIL AVEC LE CLIENT ===\n${emailsText.slice(0, 80_000)}` });
  for (const b of blocks || []) {
    content.push({ type: "text", text: `=== SOURCE : DOCUMENT DU DRIVE « ${b.name} » ===` });
    if (b.kind === "pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b.data.toString("base64") }, title: b.name });
    else if (b.kind === "image") content.push({ type: "image", source: { type: "base64", media_type: b.mime, data: b.data.toString("base64") } });
    else content.push({ type: "text", text: b.text });
  }
  content.push({
    type: "text",
    text:
      (scope === "drive"
        ? "Tâche : à partir des documents du Drive seulement, extrais chaque facture d'énergie (une entrée par facture : fournisseur, numéro de compte, période, consommation avec unité, montant total) et toute information sur le bâtiment ou ses équipements. "
        : "Tâche : prépare le préremplissage du formulaire de visite technique à partir de toutes les sources ci-dessus. ") +
      "Règles : n'invente rien ; laisse null tout ce qui n'est pas explicitement dans une source ; respecte exactement les valeurs possibles des listes ; les nombres sans unité ; pour chaque champ rempli, donne la source dans « sources » (section.champ) ; une facture par entrée de « factures » avec le nom du fichier ; les équipements (chauffe-eau, chaudières, unités de toit, aérothermes) seulement s'ils sont décrits dans une source, un objet par modèle distinct. Dans « manquants », liste ce qui reste à relever sur place parmi les éléments obligatoires. Réponds en français.",
  });
  const stream = client().beta.messages.stream({
    model: MODEL,
    max_tokens: 24_000,
    betas: BETAS,
    fallbacks: "default",
    system: [{ type: "text", text: `${CONTEXTE}\n\nTu es l'assistant de préremplissage. Tu lis des données CRM, des courriels et des documents (factures d'énergie, plans, études) et tu produis un objet JSON conforme au schéma demandé.`, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: prefillSchema() }, effort: "medium" },
    messages: [{ role: "user", content }],
  });
  const message = await stream.finalMessage();
  return parseJson(message);
}

// ---------- Lecture d'une photo (plaque signalétique, facture, panneau) ----------
export async function lireImage({ spec, image, mime }) {
  const props = {};
  for (const f of spec.fields || []) {
    const sch = f.t === "number" ? { type: ["number", "null"] } : { type: ["string", "null"] };
    sch.description = f.l + (f.opts ? ` (valeurs possibles : ${f.opts.join(" | ")})` : "") + (f.unit ? ` en ${f.unit}` : "");
    props[f.k] = sch;
  }
  props.lisible = { type: "boolean" };
  props.remarque = { type: "string", description: "courte phrase en français, ou chaîne vide" };
  const schema = { type: "object", properties: props, required: Object.keys(props), additionalProperties: false };
  const intro =
    spec.kind === "facture"
      ? "Tu lis la photo d'une facture d'énergie d'un bâtiment au Québec (Hydro-Québec, Énergir, mazout ou propane)."
      : spec.kind === "panneau"
        ? "Tu lis la photo du panneau électrique principal d'un bâtiment (entrée électrique) et de sa plaque : tension et ampérage nominal."
        : `Tu lis la photo de la plaque signalétique d'un équipement de type « ${spec.sing || "équipement"} » (visite technique, Québec). Si l'année de fabrication est encodée dans le numéro de série selon une convention connue du fabricant, déduis-la seulement si tu es confiant. Capacités en gallons US ; puissances avec leur unité telle qu'écrite (BTU/h, MBH, kW).`;
  const message = await client().beta.messages.create({
    model: MODEL,
    max_tokens: 4_000,
    betas: BETAS,
    fallbacks: "default",
    output_config: { format: { type: "json_schema", schema }, effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime || "image/jpeg", data: image.toString("base64") } },
          { type: "text", text: `${intro} Extrais uniquement ce qui est lisible ; null pour le reste ; respecte les valeurs possibles des listes. Réponds en JSON.` },
        ],
      },
    ],
  });
  return parseJson(message);
}

// ---------- Synthèse (texte en continu) ----------
export function syntheseStream(visite) {
  const data = JSON.stringify(visite, (k, val) => (k === "_photos" || k === "_ai" || k === "_src" || k === "_drive" || k === "synthese" || k === "docs" ? undefined : val));
  const prompt = `${CONTEXTE}\n\nVoici les données relevées lors d'une visite technique (JSON ; les champs vides n'ont pas été relevés ; « contexte » et « sources » décrivent ce qui venait du CRM, du Drive et des courriels) :\n\n${data.slice(0, 150_000)}\n\nRédige en français, pour l'ingénieur qui ne visitera pas le bâtiment, une synthèse structurée de 250 à 450 mots avec ces titres : CONTEXTE DU BÂTIMENT ; ÉQUIPEMENTS DE CHAUFFAGE ET D'EAU CHAUDE RELEVÉS ; AUTRES CHARGES DE CHAUFFAGE ; POINTS DE RACCORDEMENT ENVISAGEABLES POUR HEATCONNECT ; CONTRAINTES D'ESPACE, D'ACCÈS ET D'ÉLECTRICITÉ ; INFORMATIONS MANQUANTES OU À CONFIRMER. N'invente aucune donnée : si une information manque, dis-le. Pas de tableau, pas de Markdown, texte brut avec titres en majuscules.`;
  return client().beta.messages.stream({
    model: MODEL,
    max_tokens: 6_000,
    betas: BETAS,
    fallbacks: "default",
    output_config: { effort: "medium" },
    messages: [{ role: "user", content: prompt }],
  });
}
