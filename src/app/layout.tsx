import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./arcade.css";
import "./block-battle.css";
import "./connections.css";
import "./keepsakes.css";
import "./install.css";
import "./together.css";
export const metadata: Metadata = {
  title: "Our Little Arcade",
  description: "A little place to play, make things, and be together.",
  robots: { index: false, follow: false },
  icons: { icon: "/icons/favicon.png", apple: "/icons/icon-192.png" },
  appleWebApp: {
    capable: true,
    title: "Little Arcade",
    statusBarStyle: "default",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f8c9d8",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
