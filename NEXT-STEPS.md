# Reprise de la mise en service (pour la prochaine session Claude)

État au 11 novembre 2026 : le code est complet, compilé (`next build` passe), testé sur un backend simulé et validé par des tests unitaires. Il reste à le publier sur GitHub et Vercel, puis à laisser l'administrateur fournir les trois clés par la page `/setup`.

## Ce que la session précédente n'a pas pu faire

- Pousser sur GitHub : aucun jeton GitHub valide dans la session.
- Créer le projet Vercel : aucun `VERCEL_TOKEN` dans l'environnement.

## Étapes à exécuter, dans l'ordre

1. **Récupérer le code.** Soit il est déjà dans le dépôt GitHub (`git clone`), soit il est dans le Drive partagé HeatConnect, dossier « Heatconnect », fichier `heatconnect-visite-code-<date>.zip` : le télécharger avec le connecteur Google Drive, le décompresser dans un dossier vide, puis `npm install`.
2. **GitHub.** Vérifier `gh auth status`. Si le dépôt `heatconnect-visite` est attaché à la session (outil `add_repo` ou dépôt choisi au démarrage), pousser :
   ```bash
   git remote add origin https://github.com/<owner>/heatconnect-visite.git
   git push -u origin main
   ```
3. **Vercel.** Avec `VERCEL_TOKEN` présent dans l'environnement :
   ```bash
   node scripts/vercel-bootstrap.mjs --repo <owner>/heatconnect-visite
   ```
   Le script crée le projet, le relie au dépôt si l'intégration GitHub de Vercel est installée (sinon il déploie par envoi direct), pose les variables de base (`AUTH_SECRET`, `SETUP_TOKEN`, `VERCEL_*`, `DRIVE_ROOT_FOLDER_ID=1kKEXC0KziKS2HUfC31ZPtfTtIRi-hWbj`, `ADMIN_EMAILS`) et déploie. Il imprime l'URL de l'application et le **lien de mise en service** `/setup?key=…`.
   Si le compte Vercel est une équipe, ajouter `--team <team_id>` (visible dans `GET https://api.vercel.com/v2/teams`).
4. **Vérifier** : `curl -s https://<domaine>/` doit renvoyer la page de connexion ; `curl -s "https://<domaine>/api/setup?key=<clé>"` doit renvoyer `{"mode":"token",...,"vercel":true}`.
5. **Transmettre à Gabriel** le lien de mise en service et lui dire que la page le guide pour les trois clés (Google OAuth avec l'URI de redirection affichée, clé Anthropic, code Zoho Self Client). Rien n'est à coller dans le clavardage.
6. Après « Terminer la mise en service » : attendre le redéploiement (environ une minute), puis vérifier que la connexion Google fonctionne et que `/api/me` renvoie `crm:true, claude:true`.
7. Si l'intégration GitHub de Vercel n'était pas installée (déploiement par envoi direct), proposer à Gabriel d'installer Vercel pour GitHub sur le dépôt afin que chaque modification poussée se déploie seule.

## Rappels

- Ne jamais demander de coller un jeton, une clé ou un mot de passe dans le clavardage : la page `/setup` existe pour cela.
- Les secrets d'environnement (`VERCEL_TOKEN`) se lisent depuis les variables d'environnement de la session.
- Dossier Drive des visites sans opportunité : `1kKEXC0KziKS2HUfC31ZPtfTtIRi-hWbj` (déjà créé dans le Drive partagé HeatConnect).
