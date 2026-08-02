import "./globals.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { DemoCapabilityProvider } from "@/lib/demo/capability-context";
import CopilotMount from "@/components/copilot/CopilotMount";

const SITE_URL = "https://co-videopro.com";
const SITE_NAME = "Co-VideoPro";
const SITE_DESCRIPTION =
  "All-in-one video production workspace for planning, review, approval, editing, and delivery.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Co-VideoPro | Content Co-op",
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Co-VideoPro | Content Co-op",
    description: SITE_DESCRIPTION,
    images: [{ url: "/icon.svg", alt: "Co-VideoPro" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Co-VideoPro | Content Co-op",
    description: SITE_DESCRIPTION,
    images: ["/icon.svg"],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const demoCapability = requestHeaders.get("x-codeliver-demo-preview") === "1";

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Inter:opsz,wght@14..32,400..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[var(--bg)]">
        <DemoCapabilityProvider enabled={demoCapability}>
          {children}
          <CopilotMount />
        </DemoCapabilityProvider>
      </body>
    </html>
  );
}
