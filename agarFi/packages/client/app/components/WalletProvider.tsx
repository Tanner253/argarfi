'use client';

import { useMemo, type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  // Use a safe default for SSR, will be replaced on client
  const endpoint = useMemo(() => {
    if (typeof window === 'undefined') {
      return 'https://api.mainnet-beta.solana.com';
    }
    
    const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
    
    if (!rpc) {
      console.warn(
        'NEXT_PUBLIC_SOLANA_RPC is not configured! Using public RPC. ' +
        'For production, get a dedicated RPC from: https://www.alchemy.com/ or https://www.quicknode.com/'
      );
      return 'https://api.mainnet-beta.solana.com';
    }
    
    return rpc;
  }, []);

  // Support Phantom and Solflare wallets (with mobile support)
  // Only instantiate on client side
  const wallets = useMemo(
    () => {
      if (typeof window === 'undefined') {
        return [];
      }
      return [
        new PhantomWalletAdapter(),
        new SolflareWalletAdapter(),
      ];
    },
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
