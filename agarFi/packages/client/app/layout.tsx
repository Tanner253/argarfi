import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "./components/WalletProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AgarFi | Skill-Based GameFi",
  description: "Competitive multiplayer game on Solana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}

