import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "co-deliver | content co-op",
  description: "Executive content review and delivery platform. Timecoded feedback, version control, approval workflows, and stakeholder sign-off.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-[var(--bg)]">{children}</body>
    </html>
  );
}
