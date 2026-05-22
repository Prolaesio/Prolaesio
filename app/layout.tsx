import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { AuthGate } from "@/components/AuthGate";
import { DataProvider } from "@/lib/DataContext";
import { BottomNav } from "@/components/BottomNav";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OnboardingGate } from "@/components/OnboardingGate";

const outfit = Outfit({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Prolaesio",
  description: "Mobile-first soccer training tracker and guidance app for young athletes.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Prolaesio",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0e27",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.className} antialiased min-h-screen bg-black`}>
        <AuthProvider>
          <AuthGate>
            <DataProvider>
              <OnboardingGate>
                <div className="max-w-md mx-auto min-h-screen relative shadow-2xl bg-[var(--background)] overflow-hidden flex flex-col">
                  <OfflineBanner />
                  <main className="flex-1 overflow-y-auto pb-24">
                    {children}
                  </main>
                  <BottomNav />
                </div>
              </OnboardingGate>
            </DataProvider>
          </AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
