'use client';

import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

/**
 * Custom hook that wraps Solana wallet adapter
 * Provides simplified interface for AgarFi
 * Also exposes full wallet adapter for transaction signing
 */
export function useWallet() {
  const walletAdapter = useSolanaWallet();
  const { publicKey, connected, connecting, disconnect, sendTransaction, signTransaction } = walletAdapter;
  const { setVisible } = useWalletModal();

  return {
    connected,
    walletAddress: publicKey?.toBase58() || null,
    connecting,
    connect: () => setVisible(true), // Opens wallet modal
    disconnect,
    error: null, // Adapter handles errors internally
    // Expose transaction methods for payment operations
    sendTransaction,
    signTransaction,
    publicKey,
    // Full wallet adapter for advanced usage
    walletAdapter,
  };
}

