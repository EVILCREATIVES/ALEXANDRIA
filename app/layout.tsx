import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ALEXANDRIA — AI-Powered Archival & Research",
  description: "Ingest multilingual sources, extract and catalog images, map them geographically, and place them on historical timelines.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
