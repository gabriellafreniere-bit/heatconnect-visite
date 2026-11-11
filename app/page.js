import { auth, signIn, signOut } from "@/auth";

export const dynamic = "force-dynamic";

const SHELL = `
<header class="top">
  <button class="tbtn" id="btn-retour" hidden aria-label="Retour à la liste">‹ Visites</button>
  <div class="brand" id="brand">HeatConnect <small>Visite technique</small></div>
  <div class="title" id="top-title"></div>
  <div class="status" id="status"></div>
  <a class="tbtn user" id="btn-user" href="/api/auth/signout" title="Se déconnecter">__USER__</a>
</header>
<main>
  <section id="vue-liste">
    <div class="hero">
      <div>
        <h1>Visites techniques</h1>
        <p>Un dossier par bâtiment, rangé dans le Drive de l'opportunité. Choisissez l'opportunité Zoho : le CRM, les documents du Drive et les courriels préremplissent le formulaire. Sur place, photographiez les plaques signalétiques, puis publiez le dossier pour la firme d'ingénierie.</p>
      </div>
      <button class="btn accent" id="btn-nouvelle"><span class="ico">+</span> Nouvelle visite</button>
    </div>
    <div id="offline-note" class="offline" hidden></div>
    <div class="vlist" id="vlist"></div>
    <div class="empty" id="vempty" hidden><b>Aucune visite pour l'instant.</b><br>Appuyez sur « Nouvelle visite » et choisissez l'opportunité.</div>
  </section>
  <section id="vue-visite" hidden>
    <div class="strip" id="strip"></div>
    <div id="sec"></div>
  </section>
</main>
<div class="bnav" id="bnav" hidden>
  <button class="btn" id="btn-prev">‹ Précédent</button>
  <button class="btn primary" id="btn-next">Suivant ›</button>
</div>
<div class="toast" id="toast" role="status"></div>
<div class="modal" id="modal" hidden></div>
`;

function Login({ reason }) {
  return (
    <div className="login">
      <div className="box">
        <h1>Visite technique HeatConnect</h1>
        <p>{reason || "Connectez-vous avec votre compte Google First Block pour accéder aux visites, au Drive et au CRM."}</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="btn primary" type="submit">Se connecter avec Google</button>
        </form>
      </div>
    </div>
  );
}

export default async function Page() {
  const session = await auth();
  if (!session?.user) return <Login />;
  if (session.error) {
    return (
      <div className="login">
        <div className="box">
          <h1>Session Google expirée</h1>
          <p>Reconnectez-vous pour renouveler l'accès au Drive et à Gmail.</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="btn primary" type="submit">Se reconnecter</button>
          </form>
        </div>
      </div>
    );
  }
  const name = (session.user.name || session.user.email || "").split(" ")[0];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const html = SHELL.replace("__USER__", esc(name));
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <script dangerouslySetInnerHTML={{ __html: `window.HC_USER=${JSON.stringify({ name: session.user.name || "", email: session.user.email || "" })};` }} />
      <script src="/hc-core.js" defer></script>
      <script src="/jszip.min.js" defer></script>
      <script src="/app.js" defer></script>
    </>
  );
}
