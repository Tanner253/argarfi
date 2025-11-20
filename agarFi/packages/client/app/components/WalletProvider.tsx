'use client';

import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  // Require RPC endpoint - no fallback to force proper configuration
  const endpoint = useMemo(() => {
    const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
    
    if (!rpc) {
      throw new Error(
        'NEXT_PUBLIC_SOLANA_RPC is not configured! ' +
        'Please add it to your .env file. ' +
        'Get a free RPC from: https://www.alchemy.com/ or https://www.quicknode.com/'
      );
    }
    
    return rpc;
  }, []);

  // Support Phantom and Solflare wallets (with mobile support)
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
