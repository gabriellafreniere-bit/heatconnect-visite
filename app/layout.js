export const metadata = {
  title: "Visite technique HeatConnect",
  description: "Dossier de visite technique HeatConnect pour la firme d'ingénierie : saisie sur place, photos lues par Claude, préremplissage depuis Zoho CRM, Google Drive et Gmail.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "HeatConnect" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#313749",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr-CA">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" />
        <link rel="stylesheet" href="/app.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
