import type { Metadata } from "next";
import "./globals.css";
import "./arcade.css";
export const metadata: Metadata = {
  title: "Our Little Arcade",
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
