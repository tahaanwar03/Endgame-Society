import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Endgame Society",
  description: "A live university chess tournament portal with remote administration."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
