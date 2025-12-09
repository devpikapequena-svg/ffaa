// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { LayoutClient } from "./LayoutClient";

export const metadata: Metadata = {
  title: "Recarga Jogo",
  description: "Site oficial de recarga",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-background font-sans antialiased">
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}
