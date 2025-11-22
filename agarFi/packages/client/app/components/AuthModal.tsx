'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface AuthModalProps {
  isOpen: boolean;
  onSign: () => void;
  onCancel: () => void;
  isLoading: boolean;
  error?: string | null;
  challengeMessage?: string;
}

export function AuthModal({ isOpen, onSign, onCancel, isLoading, error, challengeMessage }: AuthModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={!isLoading ? onCancel : undefined}
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative bg-gradient-to-br from-cyber-dark to-black border-2 border-neon-green rounded-2xl shadow-2xl max-w-lg w-full"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-neon-green/20 to-neon-blue/20 border-b border-neon-green/30 p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="text-4xl">🔐</div>
                <h2 className="text-2xl font-black text-white">
                  Wallet Verification Required
                </h2>
              </div>
              <p className="text-sm text-gray-300">
                x403 Protocol - Cryptographic Authentication
              </p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Explanation */}
              <div className="bg-neon-blue/10 border border-neon-blue/30 rounded-lg p-4">
                <h3 className="text-sm font-bold text-neon-blue mb-2">
                  Why This Is Safe:
                </h3>
                <ul className="text-xs text-gray-300 space-y-1">
                  <li>• <strong>NOT a transaction</strong> - Costs $0, no blockchain interaction</li>
                  <li>• <strong>Just verification</strong> - Proves you own this wallet</li>
                  <li>• <strong>No fund access</strong> - This signature cannot move your money</li>
                  <li>• <strong>Standard protocol</strong> - Industry-standard x403 authentication</li>
                </ul>
              </div>

              {/* Benefits */}
              <div className="bg-neon-green/10 border border-neon-green/30 rounded-lg p-4">
                <h3 className="text-sm font-bold text-neon-green mb-2">
                  How x403 Protects You:
                </h3>
                <ul className="text-xs text-gray-300 space-y-1">
                  <li>✓ Prevents bot farming and multi-accounting</li>
                  <li>✓ Ensures fair matchmaking</li>
                  <li>✓ Tracks your game history and winnings</li>
                  <li>✓ One wallet = one active game session</li>
                </ul>
              </div>

              {/* Authorization */}
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <h3 className="text-sm font-bold text-yellow-400 mb-2">
                  By Signing, You Authorize AgarFi To:
                </h3>
                <ul className="text-xs text-gray-300 space-y-1">
                  <li>• Create a 30-minute authentication session</li>
                  <li>• Track your game statistics and winnings</li>
                  <li>• Enforce one-wallet-per-game rules</li>
                  <li>• Prevent unfair play and bot activity</li>
                </ul>
              </div>

              {/* Security Warning */}
              <div className="bg-red-500/10 border-2 border-red-500/50 rounded-lg p-4">
                <h3 className="text-sm font-bold text-red-400 mb-2 flex items-center gap-2">
                  ⚠️ SECURITY: Verify Domain
                </h3>
                <p className="text-xs text-gray-300 mb-2">
                  <strong className="text-red-400">Always check the domain before signing!</strong>
                </p>
                <div className="bg-black/50 rounded px-3 py-2 font-mono text-xs text-white break-all">
                  {typeof window !== 'undefined' ? window.location.hostname : 'agarfi.com'}
                </div>
                <p className="text-xs text-red-300 mt-2">
                  ✗ Never sign if the domain looks suspicious!
                </p>
              </div>

              {/* Technical Details (Collapsible) */}
              {challengeMessage && (
                <details className="bg-black/30 border border-gray-700 rounded-lg p-3">
                  <summary className="text-xs font-bold text-gray-400 cursor-pointer hover:text-white">
                    🔍 View Full Message (Advanced)
                  </summary>
                  <pre className="mt-3 text-xs text-gray-400 font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                    {challengeMessage}
                  </pre>
                </details>
              )}

              {/* Error Display */}
              {error && (
                <div className="bg-red-500/20 border border-red-500 rounded-lg p-3">
                  <p className="text-sm text-red-400">❌ {error}</p>
                </div>
              )}

              {/* Session Info */}
              <div className="text-xs text-gray-500 text-center space-y-1">
                <div>⏰ You have 3 minutes to read and sign this challenge</div>
                <div>🔒 Session lasts 30 minutes after signing</div>
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-gray-700 p-6 flex gap-3">
              <button
                onClick={onCancel}
                disabled={isLoading}
                className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={onSign}
                disabled={isLoading}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-neon-green to-neon-blue hover:opacity-90 text-black rounded-lg font-bold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                    Signing...
                  </>
                ) : (
                  <>
                    <span>✍️</span>
                    Sign with Phantom
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

