import "./globals.css";
import "./design-system.css";
import "./solana.css";
import "./kingdom-site.css";
import { Inter } from "next/font/google";
import { PublicNavbarWrapper } from "@/components/PublicNavbarWrapper";
import { PublicFooterWrapper } from "@/components/PublicFooterWrapper";
import { AuthStateProvider } from "@/components/AuthStateProvider";
import { KeepAlive } from "@/components/KeepAlive";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#100818",
};

export const metadata = {
  title: "GarmonPay",
  description: "Explore GarmonPay’s Solana ecosystem: token projects, prepaid advertising, verified participation and games. Financial features await activation.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GarmonPay",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "GarmonPay",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#100818" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GarmonPay" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="gp-app font-sans antialiased flex min-h-screen flex-col">
        <ClientErrorBoundary>
          <AuthStateProvider>
            <PublicNavbarWrapper />
            <div className="gp-kingdom-stage">{children}</div>
          </AuthStateProvider>
        </ClientErrorBoundary>
        <KeepAlive />
        <script
          dangerouslySetInnerHTML={{
            __html: `
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker
          .register('/sw.js')
          .then(function(reg) {
            console.log('SW registered');
          });
      });
    }
  `,
          }}
        />
        <PwaInstallPrompt />
        <PublicFooterWrapper />
      </body>
    </html>
  );
}
