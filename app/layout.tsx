import "./globals.css";
import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import Script from "next/script";
import OpeningSplash from "@/components/brand/OpeningSplash";

const openingSplashBootstrap = `
  (function () {
    try {
      var key = "co-videopro-opening-seen-v1";
      var seen = window.sessionStorage.getItem(key) === "true";
      document.documentElement.dataset.openingSplash = seen ? "seen" : "pending";
      if (!seen) window.sessionStorage.setItem(key, "true");
    } catch (error) {
      document.documentElement.dataset.openingSplash = "pending";
    }
  })();
`;

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
  fallback: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
  variable: "--font-manrope",
  fallback: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Co-VideoPro | Content Co-op",
  description: "All-in-one video production workspace for planning, review, approval, editing, and delivery.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${manrope.variable}`}
      data-theme="light"
      data-opening-splash="pending"
      suppressHydrationWarning
    >
      <head>
        <Script id="co-videopro-opening-bootstrap" strategy="beforeInteractive">
          {openingSplashBootstrap}
        </Script>
      </head>
      <body className="min-h-screen bg-[var(--bg)]">
        <OpeningSplash />
        <div id="co-videopro-app-root">{children}</div>
      </body>
    </html>
  );
}
