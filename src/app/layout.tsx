import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Our Little Arcade · Lance & Elaine",
  description: "A little place to play, make things, and be together.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
