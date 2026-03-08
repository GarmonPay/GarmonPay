import "./globals.css";
import { Inter } from "next/font/google";
import Footer from "@/components/Footer";
import { AuthStateProvider } from "@/components/AuthStateProvider";
import { PwaRegistration } from "@/components/PwaRegistration";

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
  themeColor: "#ff0000",
};

export const metadata = {
  title: "GarmonPay",
  description: "Earn with ads, rewards, and referrals",
  manifest: "/manifest.json",
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <meta name="theme-color" content="#ff0000" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GarmonPay" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="font-sans antialiased flex min-h-screen flex-col">
        <AuthStateProvider>
          {children}
        </AuthStateProvider>
        <PwaRegistration />
        <Footer />
      </body>
    </html>
  );
}
