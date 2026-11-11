# Visite technique HeatConnect

Application web (Next.js) pour remplir sur place, au téléphone ou à l'iPad, le dossier de visite technique HeatConnect (document HC-REQ-RENO rév. A) et le transmettre à la firme d'ingénierie.

Ce qu'elle fait :

- **Une visite par opportunité Zoho CRM.** À la création, l'opportunité, la fiche Immeuble, le contact et le compte remplissent le bâtiment, la personne-ressource, le combustible, la tension, etc.
- **Préremplissage par Claude.** Les notes du CRM (qui contiennent déjà les synthèses Wispr Flow, Slack et courriels produites par vos automatisations), les courriels Gmail échangés avec le contact et les documents du dossier Drive de l'opportunité sont lus par Claude, qui complète les champs vides et extrait **chaque facture d'énergie** déposée dans le Drive. Chaque champ prérempli porte sa source et reste surligné jusqu'à vérification.
- **Photos lues par Claude.** Plaques signalétiques, factures et panneau électrique photographiés sur place sont lus et remplissent les champs.
- **Tout vit dans le Drive de l'opportunité**, sous-dossier `Visite technique` : `visite-technique.json`, `Photos/`, puis `Rapport.html` et `donnees.json` à la publication. Les collègues voient donc le même dossier, dans l'application comme dans le Drive.
- **Rapport** : liste des éléments obligatoires manquants, synthèse rédigée par Claude, publication dans le Drive ou téléchargement d'un `.zip` (rapport, données, photos nommées par sujet).

## Architecture

| Rôle | Service |
|---|---|
| Hébergement | Vercel (Next.js 15, routes API Node) |
| Connexion | Google (Auth.js), limitée au domaine `firstblock.com` |
| Données et photos | Google Drive de l'opportunité (jeton Google de la personne connectée) |
| Opportunités, immeubles, contacts, notes | Zoho CRM API v8 (jeton d'actualisation d'application) |
| Courriels | Gmail API en lecture seule (jeton de la personne connectée) |
| Lecture de documents, photos et synthèse | API Claude (`claude-opus-5-5`) |

Aucune base de données à provisionner : le Drive sert de stockage et Zoho reste la source de vérité des opportunités.

## Mise en place (environ 45 minutes)

### 1. Google Cloud (OAuth)

1. Dans la console Google Cloud du Workspace First Block, créez un projet « HeatConnect Visite ».
2. Activez les API **Google Drive API** et **Gmail API**.
3. Écran de consentement OAuth : type **Interne** (réservé au Workspace ; aucune vérification Google requise). Ajoutez les portées `.../auth/drive` et `.../auth/gmail.readonly`.
4. Identifiants > Créer un ID client OAuth > **Application Web**. URI de redirection autorisée : `https://<votre-domaine>/api/auth/callback/google` (ajoutez aussi `http://localhost:3000/api/auth/callback/google` pour le développement).
5. Copiez l'ID client et le secret dans `AUTH_GOOGLE_ID` et `AUTH_GOOGLE_SECRET`.

### 2. Zoho CRM (client « self-client »)

1. Sur https://api-console.zoho.com, créez un client **Self Client**.
2. Générez un code avec les portées `ZohoCRM.modules.ALL,ZohoCRM.settings.READ` (durée 10 minutes).
3. Échangez le code contre un jeton d'actualisation :

```bash
curl -X POST https://accounts.zoho.com/oauth/v2/token \
  -d grant_type=authorization_code \
  -d client_id=VOTRE_CLIENT_ID \
  -d client_secret=VOTRE_CLIENT_SECRET \
  -d code=LE_CODE_GENERE
```

4. Copiez `refresh_token`, l'ID client et le secret dans `ZOHO_REFRESH_TOKEN`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`. Le compte First Block est sur le centre de données `.com` (valeurs par défaut).

### 3. Claude

Créez une clé API sur https://platform.claude.com et mettez-la dans `ANTHROPIC_API_KEY`.

### 4. Google Drive

`DRIVE_ROOT_FOLDER_ID` : l'identifiant d'un dossier du Drive partagé HeatConnect où ranger les visites sans opportunité (ou les opportunités dont le champ « Google drive » est vide). L'identifiant est la fin de l'URL du dossier.

### 5. Déploiement sur Vercel

```bash
npm install -g vercel
vercel login
vercel link
vercel env add AUTH_SECRET        # etc., pour chaque variable de .env.example
vercel --prod
```

Ou bien : poussez ce dossier dans un dépôt GitHub, importez-le dans Vercel (Add New > Project), collez les variables de `.env.example` dans Settings > Environment Variables, déployez.

Les routes de préremplissage et de synthèse déclarent `maxDuration = 300`. Sur le forfait Hobby, Vercel limite les fonctions à 300 s avec Fluid compute (activé par défaut sur les nouveaux projets) ; vérifiez dans Settings > Functions.

### 6. Développement local

```bash
cp .env.example .env.local   # remplir
npm install
npm run dev                  # http://localhost:3000
```

## Utilisation

1. **Nouvelle visite** : choisissez l'opportunité Zoho. La visite est créée dans son dossier Drive et le préremplissage démarre (une à trois minutes : CRM, Drive, Gmail, Claude).
2. **Section 02** : les factures PDF déposées dans le Drive de l'opportunité apparaissent dans « Documents du Drive ». Déposez-en de nouvelles, puis **Synchroniser le Drive**.
3. Sur place : photographiez les plaques (lecture automatique), remplissez le reste, le tout s'enregistre dans le Drive au fil de la saisie.
4. **Rapport** : vérifiez ce qui manque, générez la synthèse, **Publiez dans le Drive** (Rapport.html et donnees.json à côté des photos) ou téléchargez le `.zip` à envoyer à la firme d'ingénierie.

Sur iPhone ou iPad, ajoutez la page à l'écran d'accueil : elle se lance comme une application.

## Limites connues

- Il faut une connexion réseau : un brouillon local est conservé si l'enregistrement échoue, et renvoyé à la reconnexion.
- Wispr Flow n'offre pas d'API publique. Les notes de rencontre arrivent dans l'application par les notes du CRM que vos automatisations Claude y écrivent déjà (mémoires de dossier, synchros, jalons). Pour une opportunité, vérifiez que ces notes existent dans Zoho avant de lancer le préremplissage.
- Le préremplissage ne remplace jamais une valeur saisie à la main ; il complète les champs vides et remet à jour ceux qu'il avait lui-même remplis.
- Les photos sont redimensionnées à 2 000 px avant l'envoi (plaques lisibles, poids d'environ 0,5 à 1 Mo).
- Les sessions Google durent 30 jours ; le jeton Drive et Gmail est renouvelé automatiquement.

## Structure

```
auth.js                 Connexion Google, domaine autorisé, renouvellement du jeton
middleware.js           Protège /api/*
app/page.js             Écran de connexion et coquille de l'application
app/api/visites         Liste, création, lecture, sauvegarde, suppression
app/api/visites/[id]/prefill     Préremplissage complet (CRM + Drive + Gmail + Claude)
app/api/visites/[id]/drive-sync  Relecture des documents du Drive (factures)
app/api/visites/[id]/link        Lier une visite à une opportunité
app/api/visites/[id]/publish     Rapport.html et donnees.json dans le Drive
app/api/photos          Téléversement, lecture, suppression des photos (Drive)
app/api/ai/lire         Lecture d'une photo par Claude
app/api/ai/synthese     Synthèse en continu
app/api/deals           Recherche d'opportunités Zoho
lib/google.js           Drive et Gmail (REST)
lib/zoho.js             Zoho CRM v8
lib/store.js            Visites dans le Drive
lib/prefill.js          Correspondances CRM, collecte des sources, fusion
lib/claude.js           Appels Claude (schémas JSON, images, synthèse)
public/hc-core.js       Schéma du formulaire, complétude, rapport (partagé client et serveur)
public/app.js, app.css  Application cliente
```
