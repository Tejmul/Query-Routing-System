import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { AppProvider } from "@/components/app-provider";
import { TopNav } from "@/components/top-nav";
import "./globals.css";

// Display for headlines and big figures, a quiet grotesque for the interface, and a mono for data.
const display = Bricolage_Grotesque({ variable: "--font-display-face", subsets: ["latin"], axes: ["opsz"] });
const sans = Hanken_Grotesk({ variable: "--font-sans-face", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono-face", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Routing Desk",
  description: "Classifies customer banking messages and routes them to the right team in real time, from one message to millions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} antialiased`}>
      <body>
        <div className="backdrop" aria-hidden="true" />
        <AppProvider>
          <TopNav />
          <main className="min-w-0">{children}</main>
        </AppProvider>
      </body>
    </html>
  );
}
