'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

interface SwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  requiredBalance: number;
}

export function SwapModal({ isOpen, onClose, currentBalance, requiredBalance }: SwapModalProps) {
  const [copySuccess, setCopySuccess] = useState(false);
  const AGARFI_CA = '6WQxQRguwYVwrHpFkNJsLK2XRnWLuqaLuQ8VBGXupump';
  const tokensNeeded = Math.max(0, requiredBalance - currentBalance);

  const copyCA = async () => {
    try {
      await navigator.clipboard.writeText(AGARFI_CA);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const openJupiter = () => {
    // Open Jupiter with AgarFi pre-filled
    const jupiterUrl = `https://jup.ag/swap/SOL-${AGARFI_CA}`;
    window.open(jupiterUrl, '_blank');
  };

  const openRaydium = () => {
    // Open Raydium with AgarFi pre-filled
    const raydiumUrl = `https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${AGARFI_CA}`;
    window.open(raydiumUrl, '_blank');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 50 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 50 }}
          className="relative w-full max-w-md bg-gradient-to-br from-cyber-darker to-cyber-dark rounded-2xl border-2 border-neon-purple/50 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-neon-purple via-neon-pink to-neon-blue p-6 border-b-2 border-neon-purple/50">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-black text-white mb-2">🎮 Buy $AgarFi</h2>
                <p className="text-sm text-white/80">Get tokens to unlock gameplay</p>
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
          <div className="p-6 space-y-6">
            {/* Status */}
            <div className="bg-red-500/10 border-2 border-red-500/50 rounded-xl p-4 text-center">
              <div className="text-4xl mb-2">🔒</div>
              <p className="text-red-400 font-bold text-lg mb-2">Insufficient Tokens</p>
              <p className="text-sm text-gray-400">
                You have <span className="text-white font-bold">{currentBalance.toLocaleString()}</span> $AgarFi
              </p>
              <p className="text-sm text-gray-400">
                Need <span className="text-neon-green font-bold">{tokensNeeded.toLocaleString()}</span> more to play
              </p>
            </div>

            {/* Token CA */}
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Contract Address</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={AGARFI_CA}
                  readOnly
                  className="flex-1 px-3 py-2 bg-cyber-dark border border-gray-600 rounded-lg text-white text-sm font-mono"
                />
                <button
                  onClick={copyCA}
                  className="px-4 py-2 bg-neon-blue/20 border border-neon-blue/50 text-neon-blue rounded-lg text-sm font-bold hover:bg-neon-blue/30 transition-all"
                >
                  {copySuccess ? '✓' : '📋'}
                </button>
              </div>
            </div>

            {/* Quick Swap Options */}
            <div className="space-y-3">
              <p className="text-xs text-gray-400 text-center">Quick Swap Options:</p>
              
              <button
                onClick={openJupiter}
                className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
              >
                <span className="text-lg">🪐</span>
                <span>Swap on Jupiter</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>

              <button
                onClick={openRaydium}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
              >
                <span className="text-lg">⚡</span>
                <span>Swap on Raydium</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            </div>

            {/* Info */}
            <div className="bg-neon-blue/10 border border-neon-blue/30 rounded-lg p-3">
              <p className="text-xs text-gray-300 text-center">
                💡 After purchasing, close this modal and your balance will refresh automatically
              </p>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-full py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-bold transition-all"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

