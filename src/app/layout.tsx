import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://orbit-theta-lyart.vercel.app").replace(/\/$/, "");
const SHARE_TITLE = "ORBIT: Everything happening around you. Turned into something worth saying.";
const SHARE_DESCRIPTION = "Turn industry news into source-checked posts in your own voice, published through Buffer.";
const SHARE_IMAGE = { url: "/screens/studio.png", width: 1440, height: 900, alt: "ORBIT Studio editing an X thread with Guardian checks passed" };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "ORBIT", template: "%s · ORBIT" },
  description: SHARE_DESCRIPTION,
  openGraph: { type: "website", siteName: "ORBIT", url: "/", title: SHARE_TITLE, description: SHARE_DESCRIPTION, images: [SHARE_IMAGE] },
  twitter: { card: "summary_large_image", title: SHARE_TITLE, description: SHARE_DESCRIPTION, images: [SHARE_IMAGE] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster theme="dark" position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
