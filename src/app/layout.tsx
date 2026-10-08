import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { OfflineBanner } from "@/components/offline-banner";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  // Lets the mobile tab bar sit above the iPhone home indicator via env(safe-area-inset-bottom).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eceffd" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b1e" },
  ],
};

export const metadata: Metadata = {
  title: "Pixel Direct — Inventory",
  description: "Camera testing, dispatch, and stock count inventory system",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <div className="aurora" aria-hidden="true">
            <div className="absolute -top-40 -left-32 size-120 animate-float rounded-full bg-(--blob-1) blur-3xl" />
            <div className="absolute top-1/3 -right-40 size-130 animate-float-slow rounded-full bg-(--blob-2) blur-3xl" />
            <div className="absolute -bottom-40 left-1/4 size-120 animate-float rounded-full bg-(--blob-3) blur-3xl" />
          </div>
          <ServiceWorkerRegister />
          <OfflineBanner />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
