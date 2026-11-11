import { auth } from "@/auth";

// Toutes les routes /api/* (sauf /api/auth) exigent une session Google valide.
// La page d'accueil gère elle-même l'écran de connexion.
export default auth((req) => {
  if (req.auth?.user) return;
  return Response.json({ error: "Non authentifié" }, { status: 401 });
});

export const config = {
  matcher: ["/api/((?!auth).*)"],
};
