import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL('https://agarfi.vercel.app'),
  title: "AgarFi | Skill-Based GameFi on Solana",
  description: "The first truly skill-based Web3 game. Play, compete, and earn real USDC in this revolutionary GameFi experience powered by Solana.",
  keywords: "GameFi, Web3, Solana, Skill-based gaming, Play-to-earn, USDC, Blockchain gaming",
  openGraph: {
    title: "AgarFi | Skill-Based GameFi on Solana",
    description: "The first truly skill-based Web3 game. Play, compete, and earn real USDC.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AgarFi | Skill-Based GameFi on Solana",
    description: "The first truly skill-based Web3 game. Play, compete, and earn real USDC.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${inter.className} bg-cyber-darker text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}

