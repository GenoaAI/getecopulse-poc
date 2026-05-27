import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GetEcoPulse — Audit énergétique bâtiment",
  description: "Audit énergétique automatisé depuis une adresse postale.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <footer className="border-t border-slate-800 bg-[#0f172a] px-6 py-5 text-center text-xs text-slate-500">
          <p>
            © 2026 GetEcoPulse —{" "}
            <Link href="/mentions-legales" className="hover:text-slate-300 transition-colors">Mentions légales</Link>
            {" · "}
            <Link href="/cgv" className="hover:text-slate-300 transition-colors">CGV</Link>
            {" · "}
            <Link href="/politique-confidentialite" className="hover:text-slate-300 transition-colors">Politique de confidentialité</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
