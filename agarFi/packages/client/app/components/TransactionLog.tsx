'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Transaction {
  id: string;
  timestamp: number;
  winnerId: string;
  winnerName: string;
  walletAddress: string;
  amountUSDC: number;
  txSignature: string | null;
  gameId: string;
  tier: string;
  playersCount: number;
  status: 'success' | 'failed' | 'pending';
  retries: number;
  error?: string;
}

interface TransactionLogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TransactionLog({ isOpen, onClose }: TransactionLogProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadTransactions();
    }
  }, [isOpen]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
      const response = await fetch(`${serverUrl}/api/transactions?limit=100`);
      const data = await response.json();
      setTransactions(data.transactions || []);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const openSolscan = (signature: string) => {
    window.open(`https://solscan.io/tx/${signature}`, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 50 }}
        className="relative w-full max-w-4xl max-h-[90vh] bg-gradient-to-br from-cyber-darker to-cyber-dark rounded-2xl border-2 border-neon-green/50 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-neon-green via-neon-blue to-neon-purple p-6 border-b-2 border-neon-green/50">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-black text-white mb-2">💰 Transaction Log</h2>
              <p className="text-sm text-white/80">All winner payouts verified on Solana blockchain</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6">
          {loading ? (
            <div className="text-center py-16">
              <div className="inline-block w-8 h-8 border-4 border-neon-green border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-400">Loading transactions...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-16">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-400 text-lg mb-2">No transactions yet</p>
              <p className="text-gray-500 text-sm">Be the first to win and earn $1 USDC!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx, index) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`bg-cyber-dark/70 backdrop-blur-lg rounded-xl p-4 md:p-5 border transition-all hover:scale-[1.01] ${
                    tx.status === 'success'
                      ? 'border-neon-green/30 hover:border-neon-green'
                      : tx.status === 'failed'
                      ? 'border-red-500/30 hover:border-red-500'
                      : 'border-yellow-500/30 hover:border-yellow-500'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    {/* Left Side - Winner Info */}
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        tx.status === 'success' ? 'bg-neon-green/20' :
                        tx.status === 'failed' ? 'bg-red-500/20' :
                        'bg-yellow-500/20'
                      }`}>
                        {tx.status === 'success' ? '🏆' : tx.status === 'failed' ? '❌' : '⏳'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-white text-lg">{tx.winnerName}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            tx.status === 'success' ? 'bg-neon-green/20 text-neon-green' :
                            tx.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {tx.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-sm text-gray-400 space-y-1">
                          <div className="flex items-center gap-2">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-mono">{truncateAddress(tx.walletAddress)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{formatDate(tx.timestamp)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Side - Amount & Action */}
                    <div className="flex items-center gap-4 md:flex-col md:items-end">
                      <div className="text-right">
                        <div className="text-2xl font-black text-neon-green">
                          ${tx.amountUSDC}
                        </div>
                        <div className="text-xs text-gray-500">
                          ${tx.tier} • {tx.playersCount}p
                        </div>
                      </div>
                      {tx.txSignature && (
                        <button
                          onClick={() => openSolscan(tx.txSignature!)}
                          className="px-4 py-2 bg-neon-blue/20 hover:bg-neon-blue/30 border border-neon-blue/50 text-neon-blue rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          View TX
                        </button>
                      )}
                      {tx.status === 'failed' && tx.error && (
                        <div className="text-xs text-red-400 text-right max-w-[200px]">
                          {tx.error}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Stats */}
        <div className="sticky bottom-0 bg-cyber-dark/90 backdrop-blur-lg border-t-2 border-neon-green/30 p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-black text-neon-green">
                {transactions.filter(tx => tx.status === 'success').length}
              </div>
              <div className="text-xs text-gray-400">Successful</div>
            </div>
            <div>
              <div className="text-2xl font-black text-neon-blue">
                ${transactions.filter(tx => tx.status === 'success').reduce((sum, tx) => sum + tx.amountUSDC, 0)}
              </div>
              <div className="text-xs text-gray-400">Total Paid</div>
            </div>
            <div>
              <div className="text-2xl font-black text-white">
                {transactions.length}
              </div>
              <div className="text-xs text-gray-400">Total Games</div>
            </div>
            <div>
              <div className="text-2xl font-black text-neon-purple">
                {new Set(transactions.map(tx => tx.walletAddress)).size}
              </div>
              <div className="text-xs text-gray-400">Unique Winners</div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

