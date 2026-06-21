import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Friend Circle Chat",
  description: "Private chat, calls, and screen sharing for up to 10 friends."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
