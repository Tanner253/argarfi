'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface WalletContextType {
  connected: boolean;
  walletAddress: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for existing connection on mount
  useEffect(() => {
    const savedAddress = localStorage.getItem('walletAddress');
    if (savedAddress) {
      setWalletAddress(savedAddress);
      setConnected(true);
      console.log('💼 Wallet restored from localStorage:', savedAddress);
    }

    // Listen for Phantom wallet changes
    if (typeof window !== 'undefined') {
      const handleAccountChanged = (publicKey: any) => {
        if (publicKey) {
          const address = publicKey.toString();
          setWalletAddress(address);
          setConnected(true);
          localStorage.setItem('walletAddress', address);
          console.log('💼 Wallet changed:', address);
        } else {
          handleDisconnect();
        }
      };

      const handleDisconnect = () => {
        setWalletAddress(null);
        setConnected(false);
        localStorage.removeItem('walletAddress');
        console.log('💼 Wallet disconnected');
      };

      // @ts-ignore - Phantom wallet API
      if (window.solana) {
        // @ts-ignore
        window.solana.on('accountChanged', handleAccountChanged);
        // @ts-ignore
        window.solana.on('disconnect', handleDisconnect);

        return () => {
          // @ts-ignore
          if (window.solana) {
            // @ts-ignore
            window.solana.off('accountChanged', handleAccountChanged);
            // @ts-ignore
            window.solana.off('disconnect', handleDisconnect);
          }
        };
      }
    }
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);

    try {
      // Try Phantom first
      // @ts-ignore
      if (window.solana?.isPhantom) {
        // @ts-ignore
        const response = await window.solana.connect();
        const address = response.publicKey.toString();
        
        setWalletAddress(address);
        setConnected(true);
        localStorage.setItem('walletAddress', address);
        console.log('✅ Phantom wallet connected:', address);
        return;
      }

      // Try Solflare
      // @ts-ignore
      if (window.solflare?.isSolflare) {
        // @ts-ignore
        await window.solflare.connect();
        // @ts-ignore
        const address = window.solflare.publicKey.toString();
        
        setWalletAddress(address);
        setConnected(true);
        localStorage.setItem('walletAddress', address);
        console.log('✅ Solflare wallet connected:', address);
        return;
      }

      throw new Error('No Solana wallet detected. Please install Phantom or Solflare.');
    } catch (err: any) {
      console.error('Wallet connection error:', err);
      setError(err.message || 'Failed to connect wallet');
      setConnected(false);
      setWalletAddress(null);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWalletAddress(null);
    setConnected(false);
    localStorage.removeItem('walletAddress');
    
    // @ts-ignore
    if (window.solana?.disconnect) {
      // @ts-ignore
      window.solana.disconnect();
    }
    
    console.log('💼 Wallet disconnected by user');
  }, []);

  return (
    <WalletContext.Provider
      value={{
        connected,
        walletAddress,
        connecting,
        connect,
        disconnect,
        error,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}

