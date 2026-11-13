import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Connexion Google réservée aux domaines de First Block. Les jetons Google de la
// personne connectée servent à lire et écrire dans le Drive partagé et à lire
// ses courriels (Gmail) pour le préremplissage. Rien n'est stocké côté serveur :
// les jetons vivent dans le cookie de session chiffré (JWT).
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

export const ALLOWED_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || "firstblock.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

async function refreshGoogleToken(token) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID,
      client_secret: process.env.AUTH_GOOGLE_SECRET,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || "refresh refusé");
  return {
    ...token,
    access_token: j.access_token,
    expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    refresh_token: j.refresh_token ?? token.refresh_token,
    error: undefined,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  logger: {
    error(err) {
      const detail = [err?.name || "", err?.message || String(err), err?.cause?.err?.message || err?.cause?.message || ""].filter(Boolean).join(" | ");
      console.error("[auth]", detail);
      globalThis.__hcLastAuthError = { at: new Date().toISOString(), detail: detail.slice(0, 600) };
    },
    warn(code) {
      console.warn("[auth]", code);
    },
    debug() {},
  },
  // Avant la mise en service, SETUP_TOKEN sert de secret provisoire ; /setup pose ensuite un AUTH_SECRET fort.
  secret: process.env.AUTH_SECRET || process.env.SETUP_TOKEN || "heatconnect-non-configure",
  session: { strategy: "jwt", maxAge: 30 * 24 * 3600 },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          scope: SCOPES,
          access_type: "offline",
          prompt: "consent",
          hd: ALLOWED_DOMAINS[0],
        },
      },
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      const email = String(profile?.email || "").toLowerCase();
      const domain = email.split("@")[1];
      if (!domain || !ALLOWED_DOMAINS.includes(domain)) return false;
      if (profile?.email_verified === false) return false;
      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          access_token: account.access_token,
          refresh_token: account.refresh_token ?? token.refresh_token,
          expires_at: account.expires_at,
          error: undefined,
        };
      }
      if (token.expires_at && Date.now() < (token.expires_at - 90) * 1000) return token;
      if (!token.refresh_token) return { ...token, error: "RefreshTokenMissing" };
      try {
        return await refreshGoogleToken(token);
      } catch (e) {
        console.error("Google refresh:", e.message);
        return { ...token, error: "RefreshAccessTokenError" };
      }
    },
    session({ session, token }) {
      session.accessToken = token.access_token;
      session.error = token.error;
      return session;
    },
  },
});
