'use client';

import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

/**
 * Custom hook that wraps Solana wallet adapter
 * Provides simplified interface for AgarFi
 */
export function useWallet() {
  const { publicKey, connected, connecting, disconnect } = useSolanaWallet();
  const { setVisible } = useWalletModal();

  return {
    connected,
    walletAddress: publicKey?.toBase58() || null,
    connecting,
    connect: () => setVisible(true), // Opens wallet modal
    disconnect,
    error: null, // Adapter handles errors internally
  };
}

