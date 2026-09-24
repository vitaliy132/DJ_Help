import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DJ Help",
  description: "Find the tracks in a set, then the closest SoundCloud upload.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
