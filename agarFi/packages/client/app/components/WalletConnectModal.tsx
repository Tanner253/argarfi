'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useWallet } from './WalletProvider';

interface WalletConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

export function WalletConnectModal({ isOpen, onClose, onConnected }: WalletConnectModalProps) {
  const { connect, connecting, error } = useWallet();

  const handleConnect = async (walletType: 'phantom' | 'solflare') => {
    try {
      await connect();
      onConnected?.();
      onClose();
    } catch (err) {
      console.error('Connection failed:', err);
    }
  };

  const openWalletSite = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="relative w-full max-w-md bg-gradient-to-br from-cyber-dark to-cyber-darker rounded-2xl border-2 border-neon-green/50 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-neon-green via-neon-blue to-neon-purple p-6 border-b-2 border-neon-green/50">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-black text-white mb-1">Connect Wallet</h2>
                  <p className="text-sm text-white/80">Required to play and earn rewards</p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  disabled={connecting}
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Info Box */}
              <div className="bg-neon-blue/10 border border-neon-blue/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-neon-blue mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-gray-300">
                    <p className="font-bold text-neon-blue mb-1">Win $1 USDC per game!</p>
                    <p className="text-xs text-gray-400">
                      Play for free. Winners automatically receive rewards to their wallet.
                    </p>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                </div>
              )}

              {/* Wallet Options */}
              <div className="space-y-3">
                {/* Phantom */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleConnect('phantom')}
                  disabled={connecting}
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-between transition-all shadow-lg disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-7 h-7" viewBox="0 0 128 128" fill="none">
                        <path d="M105.3 43.1c-5.5-10.5-17.7-17.6-31.6-17.6H54.3c-19.4 0-35.2 15.8-35.2 35.2v8.6c0 19.4 15.8 35.2 35.2 35.2h19.4c13.9 0 26.1-7.1 31.6-17.6 3.1-5.9 4.9-12.6 4.9-19.8s-1.7-13.9-4.9-19.8z" fill="#AB9FF2"/>
                      </svg>
                    </div>
                    <div className="text-left">
                      <div className="font-black text-lg">Phantom</div>
                      <div className="text-xs text-white/70">Recommended</div>
                    </div>
                  </div>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </motion.button>

                {/* Solflare */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleConnect('solflare')}
                  disabled={connecting}
                  className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-between transition-all shadow-lg disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-7 h-7" viewBox="0 0 128 128" fill="none">
                        <path d="M64 0L24 40l40 40 40-40z" fill="#FC9965"/>
                        <path d="M24 88l40-40 40 40-40 40z" fill="#FC9965"/>
                      </svg>
                    </div>
                    <div className="text-left">
                      <div className="font-black text-lg">Solflare</div>
                      <div className="text-xs text-white/70">Alternative</div>
                    </div>
                  </div>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </motion.button>
              </div>

              {/* Connecting State */}
              {connecting && (
                <div className="text-center py-2">
                  <div className="inline-flex items-center gap-2 text-neon-blue">
                    <div className="w-4 h-4 border-2 border-neon-blue border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm font-medium">Connecting...</span>
                  </div>
                </div>
              )}

              {/* Help Text */}
              <div className="bg-cyber-darker/50 rounded-lg p-4 border border-neon-green/20">
                <p className="text-xs text-gray-400 mb-3">
                  Don't have a wallet?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => openWalletSite('https://phantom.app/')}
                    className="flex-1 px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 rounded-lg text-xs font-bold transition-all"
                  >
                    Get Phantom
                  </button>
                  <button
                    onClick={() => openWalletSite('https://solflare.com/')}
                    className="flex-1 px-3 py-2 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-300 rounded-lg text-xs font-bold transition-all"
                  >
                    Get Solflare
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

