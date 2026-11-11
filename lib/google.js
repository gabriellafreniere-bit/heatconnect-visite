// Accès Google Drive (v3) et Gmail (v1) avec le jeton OAuth de la personne connectée.
// REST direct, sans bibliothèque : seules quelques routes sont utilisées.
import { HttpError } from "./session.js";

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
export const FOLDER = "application/vnd.google-apps.folder";

async function g(token, url, init = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: "Bearer " + token, ...(init.headers || {}) } });
  if (!r.ok) {
    let msg = "";
    try {
      const j = await r.json();
      msg = j.error?.message || j.error_description || JSON.stringify(j).slice(0, 200);
    } catch (e) {}
    const status = r.status === 401 ? 401 : r.status === 403 ? 403 : r.status === 404 ? 404 : 502;
    throw new HttpError(status, `Google ${r.status}${msg ? " : " + msg : ""}`);
  }
  return r;
}

export const q = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

function multipart(metadata, mimeType, data) {
  const boundary = "hc" + Math.random().toString(36).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--`);
  return { body: Buffer.concat([head, Buffer.isBuffer(data) ? data : Buffer.from(data), tail]), type: `multipart/related; boundary=${boundary}` };
}

const FIELDS = "id,name,mimeType,size,modifiedTime,parents,appProperties,webViewLink,trashed";

export const drive = {
  async list(token, query, { fields = `files(${FIELDS})`, pageSize = 200, orderBy, max = 1000 } = {}) {
    const files = [];
    let pageToken;
    do {
      const u = new URL(DRIVE + "/files");
      u.searchParams.set("q", query);
      u.searchParams.set("fields", "nextPageToken," + fields);
      u.searchParams.set("pageSize", String(pageSize));
      u.searchParams.set("supportsAllDrives", "true");
      u.searchParams.set("includeItemsFromAllDrives", "true");
      u.searchParams.set("corpora", "allDrives");
      if (orderBy) u.searchParams.set("orderBy", orderBy);
      if (pageToken) u.searchParams.set("pageToken", pageToken);
      const j = await (await g(token, u)).json();
      files.push(...(j.files || []));
      pageToken = j.nextPageToken;
    } while (pageToken && files.length < max);
    return files;
  },
  async get(token, id, fields = FIELDS) {
    return (await g(token, `${DRIVE}/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`)).json();
  },
  async download(token, id) {
    return g(token, `${DRIVE}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`);
  },
  async exportText(token, id, mimeType = "text/plain") {
    return (await g(token, `${DRIVE}/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(mimeType)}`)).text();
  },
  async createFolder(token, name, parentId) {
    const body = { name, mimeType: FOLDER, parents: parentId ? [parentId] : undefined };
    return (
      await g(token, `${DRIVE}/files?supportsAllDrives=true&fields=${FIELDS}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ).json();
  },
  async findChild(token, parentId, name, mimeType) {
    const files = await drive.list(
      token,
      `'${q(parentId)}' in parents and name='${q(name)}' and trashed=false${mimeType ? ` and mimeType='${mimeType}'` : ""}`,
      { max: 5 },
    );
    return files[0] || null;
  },
  async ensureFolder(token, parentId, name) {
    return (await drive.findChild(token, parentId, name, FOLDER)) || (await drive.createFolder(token, name, parentId));
  },
  async upload(token, { name, parentId, mimeType, data, appProperties, description }) {
    const meta = { name, parents: parentId ? [parentId] : undefined, appProperties, description };
    const { body, type } = multipart(meta, mimeType, data);
    return (
      await g(token, `${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=${FIELDS}`, {
        method: "POST",
        headers: { "Content-Type": type },
        body,
      })
    ).json();
  },
  async update(token, id, { metadata = {}, mimeType, data }) {
    const { body, type } = multipart(metadata, mimeType, data);
    return (
      await g(token, `${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=multipart&supportsAllDrives=true&fields=${FIELDS}`, {
        method: "PATCH",
        headers: { "Content-Type": type },
        body,
      })
    ).json();
  },
  async patch(token, id, metadata, extraQuery = "") {
    return (
      await g(token, `${DRIVE}/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=${FIELDS}${extraQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      })
    ).json();
  },
  async move(token, id, fromParent, toParent) {
    return drive.patch(token, id, {}, `&addParents=${encodeURIComponent(toParent)}&removeParents=${encodeURIComponent(fromParent || "")}`);
  },
  async trash(token, id) {
    return drive.patch(token, id, { trashed: true });
  },
  // Liste récursive (profondeur limitée) des fichiers d'un dossier, en excluant certains sous-dossiers.
  async tree(token, folderId, { depth = 2, exclude = [] } = {}) {
    const out = [];
    const walk = async (id, level, path) => {
      const files = await drive.list(token, `'${q(id)}' in parents and trashed=false`, { max: 400 });
      for (const f of files) {
        if (f.mimeType === FOLDER) {
          if (exclude.includes(f.name) || exclude.includes(f.id)) continue;
          if (level < depth) await walk(f.id, level + 1, path + f.name + "/");
        } else out.push({ ...f, path: path + f.name });
      }
    };
    await walk(folderId, 0, "");
    return out;
  },
};

export const gmail = {
  async threads(token, query, max = 8) {
    const j = await (await g(token, `${GMAIL}/threads?q=${encodeURIComponent(query)}&maxResults=${max}`)).json();
    return j.threads || [];
  },
  async thread(token, id) {
    return (await g(token, `${GMAIL}/threads/${encodeURIComponent(id)}?format=full`)).json();
  },
};

function b64url(s) {
  return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function findPart(part, mime) {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) return b64url(part.body.data);
  for (const p of part.parts || []) {
    const r = findPart(p, mime);
    if (r) return r;
  }
  return null;
}
export function threadToText(thread, { perMessage = 3500 } = {}) {
  const lines = [];
  for (const m of thread.messages || []) {
    const h = Object.fromEntries((m.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]));
    let body = findPart(m.payload, "text/plain");
    if (!body) {
      const html = findPart(m.payload, "text/html");
      if (html) body = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+\n/g, "\n");
    }
    body = (body || m.snippet || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
    // Coupe les citations des messages précédents pour éviter les répétitions.
    const cut = body.search(/\n(Le .{0,80} a écrit|On .{0,80} wrote|-----Original Message|De :|From:)/);
    if (cut > 0) body = body.slice(0, cut);
    lines.push(`--- ${h.date || ""} | De : ${h.from || ""} | À : ${h.to || ""}\nObjet : ${h.subject || ""}\n${body.slice(0, perMessage)}`);
  }
  return lines.join("\n\n");
}
