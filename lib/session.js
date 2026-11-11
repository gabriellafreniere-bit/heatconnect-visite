import { auth } from "@/auth";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function requireToken() {
  const session = await auth();
  if (!session?.user) throw new HttpError(401, "Non authentifié");
  if (session.error || !session.accessToken) throw new HttpError(401, "Session Google expirée : reconnectez-vous");
  return { token: session.accessToken, user: session.user };
}

// Enveloppe un gestionnaire de route : erreurs -> JSON {error}, statut HTTP cohérent.
export function handle(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
      if (status >= 500) console.error(e);
      return Response.json({ error: e.message || "Erreur serveur" }, { status });
    }
  };
}
