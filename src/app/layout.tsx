import "./globals.css";
import { Inter } from "next/font/google";
import { PublicNavbarWrapper } from "@/components/PublicNavbarWrapper";
import Footer from "@/components/Footer";
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
  themeColor: "#7C3AED",
};

export const metadata = {
  title: "GarmonPay",
  description: "Get Seen. Get Known. Get Rewarded.",
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
        <meta name="theme-color" content="#7C3AED" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GarmonPay" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="font-sans antialiased flex min-h-screen flex-col">
        <ClientErrorBoundary>
          <AuthStateProvider>
            <PublicNavbarWrapper />
            {children}
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
        <Footer />
      </body>
    </html>
  );
}
