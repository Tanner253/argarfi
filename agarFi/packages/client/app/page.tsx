'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface GameMode {
  tier: string;
  buyIn: number;
  name: string;
  maxPlayers: number;
  locked?: boolean;
}

interface LobbyStatus {
  tier: string;
  playersLocked: number;
  realPlayerCount?: number;
  botCount?: number;
  maxPlayers: number;
  status: string;
  countdown: number | null;
  spectatorCount?: number;
}

export default function HomePage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameModes, setGameModes] = useState<GameMode[]>([]);
  const [lobbies, setLobbies] = useState<LobbyStatus[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [showRoadmap, setShowRoadmap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const CONTRACT_ADDRESS = '6WQxQRguwYVwrHpFkNJsLK2XRnWLuqaLuQ8VBGXupump';

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(CONTRACT_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    // Particle animation
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
    }> = [];

    const colors = ['#39FF14', '#00F0FF', '#BC13FE', '#FF10F0'];

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        // Draw connections
        particles.slice(i + 1).forEach((p2) => {
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = (150 - dist) / 150 * 0.3;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        });
      });

      requestAnimationFrame(animate);
    }

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    // Fetch game modes
    fetch('http://localhost:3001/api/game-modes')
      .then(res => res.json())
      .then(setGameModes)
      .catch(console.error);

    // Initial fetch
    fetch('http://localhost:3001/api/lobbies')
      .then(res => res.json())
      .then(setLobbies)
      .catch(console.error);

    // Connect to Socket.io for real-time updates
    const socket = require('socket.io-client').io('http://localhost:3001');
    
    socket.on('lobbyUpdate', (update: LobbyStatus) => {
      setLobbies(prev => {
        const index = prev.findIndex(l => l.tier === update.tier);
        if (index >= 0) {
          const newLobbies = [...prev];
          newLobbies[index] = update;
          return newLobbies;
        } else {
          return [...prev, update];
        }
      });
    });

    // Update when player dies in active game
    socket.on('playerCountUpdate', ({ tier }: { tier: string }) => {
      // Refetch lobby status for this tier
      fetch('http://localhost:3001/api/lobbies')
        .then(res => res.json())
        .then(updatedLobbies => {
          setLobbies(updatedLobbies);
        })
        .catch(console.error);
    });

    return () => {
      socket.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const joinLobby = (tier: string) => {
    if (!playerName.trim()) {
      setToastMessage('Please enter a name');
      return;
    }

    const playerId = `player_${Date.now()}`;
    localStorage.setItem('playerId', playerId);
    localStorage.setItem('playerName', playerName);
    localStorage.setItem('selectedTier', tier);
    
    router.push('/game');
  };

  const spectateGame = (tier: string) => {
    console.log('🎥 Spectate button clicked for tier:', tier);
    console.log('Setting localStorage: spectateMode=true, selectedTier=' + tier);
    localStorage.setItem('spectateMode', 'true');
    localStorage.setItem('selectedTier', tier);
    console.log('Navigating to /game...');
    router.push('/game');
  };

  // Handle ESC key to close roadmap modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showRoadmap) {
        setShowRoadmap(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showRoadmap]);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const getLobbyStatus = (tier: string): LobbyStatus | undefined => {
    return lobbies.find(l => l.tier === tier);
  };

  return (
    <main className="relative min-h-screen">
      <canvas ref={canvasRef} id="particles" className="fixed inset-0 z-0" />
      
      {/* Background blobs */}
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-6xl w-full">
        {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-6xl md:text-7xl font-black mb-4 gradient-text text-glow-strong tracking-tight">
            AgarFi
          </h1>
            <p className="text-xl md:text-2xl text-neon-green text-glow mb-2">Skill-Based GameFi • Phase 1 Demo</p>
            <p className="text-sm text-gray-400 mt-2">Free play - No payments required</p>
          </div>

          {/* Action Buttons - Top */}
          <div className="mb-8 flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://agarfi.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative px-8 py-4 bg-gradient-to-r from-neon-green to-neon-blue hover:from-neon-blue hover:to-neon-green rounded-lg font-bold text-black transition-all hover:scale-105 hover:box-glow shadow-xl"
            >
              <span className="flex items-center gap-3 justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-lg">Why Should I Buy This?</span>
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </span>
            </a>
            
            <button
              onClick={() => setShowRoadmap(true)}
              className="group relative px-8 py-4 bg-gradient-to-r from-neon-purple to-neon-pink hover:from-neon-pink hover:to-neon-purple rounded-lg font-bold text-white transition-all hover:scale-105 hover:box-glow shadow-xl"
            >
              <span className="flex items-center gap-3 justify-center">
                <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span className="text-lg">View Roadmap</span>
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            </button>
          </div>

          {/* Contract Address Card */}
          <div className="mb-8">
            <div className="max-w-2xl mx-auto bg-cyber-dark/50 backdrop-blur-lg border border-neon-green/30 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 mb-1">Contract Address</p>
                  <p className="text-xs md:text-sm text-neon-green font-mono break-all">
                    {CONTRACT_ADDRESS}
                  </p>
                </div>
                <button
                  onClick={copyToClipboard}
                  className="flex-shrink-0 px-4 py-2 bg-neon-green/20 hover:bg-neon-green/30 border border-neon-green/50 text-neon-green rounded-lg transition-all hover:scale-105"
                >
                  {copied ? (
                    <span className="flex items-center gap-1 text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy
                    </span>
                  )}
                </button>
              </div>
            </div>
        </div>

        {/* Player Name Input */}
        <div className="mb-8 max-w-md mx-auto">
            <label className="block text-sm font-medium mb-2 text-gray-300">Your Name</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
              className="w-full px-4 py-3 bg-cyber-dark/50 backdrop-blur-lg border border-neon-green/30 rounded-lg focus:outline-none focus:border-neon-green focus:box-glow text-white transition-all"
            maxLength={20}
          />
        </div>

        {/* Game Modes Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {gameModes.map((mode) => {
            const lobby = getLobbyStatus(mode.tier);
            const isLocked = mode.locked;

            return (
              <div
                key={mode.tier}
                  className={`bg-cyber-dark/50 backdrop-blur-lg border ${isLocked ? 'border-neon-purple/30' : 'border-neon-green/30'} rounded-xl p-6 ${
                    isLocked ? 'opacity-50' : 'hover:border-neon-green hover:box-glow transition-all'
                }`}
              >
                <div className="mb-4">
                  <h3 className="text-2xl font-bold text-white mb-1">
                    {mode.tier === 'whale' ? '🐋 Whale Mode' : `$${mode.buyIn} Stakes`}
                  </h3>
                  <p className="text-sm text-gray-400">{mode.name}</p>
                  {isLocked && (
                      <p className="text-xs text-neon-purple mt-2">🔒 Unlocks at $1M Market Cap</p>
                  )}
                </div>

                {!isLocked && lobby && (
                  <div className="mb-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Players</span>
                      <span className="text-neon-green font-bold">
                        {lobby.realPlayerCount || 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Bots</span>
                      <span className="text-purple-400 font-bold">
                        {lobby.botCount || 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Total</span>
                      <span className="text-white font-bold">
                        {lobby.playersLocked}/{lobby.maxPlayers}
                      </span>
                    </div>
                    {lobby.status === 'playing' && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Spectators</span>
                        <span className="text-neon-blue font-bold">
                          {lobby.spectatorCount || 0}
                        </span>
                      </div>
                    )}
                    {lobby.countdown !== null && lobby.countdown > 0 && (
                      <div className="text-center py-2 bg-neon-green/20 rounded text-neon-green font-bold">
                        Starting in {lobby.countdown}s
                      </div>
                    )}
                    {lobby.status === 'playing' && (
                      <div className="text-center py-2 bg-neon-blue/20 rounded text-neon-blue font-bold">
                        🎮 Game In Progress
                      </div>
                    )}
                  </div>
                )}

                {lobby && lobby.status === 'playing' ? (
                  <button
                    onClick={() => spectateGame(mode.tier)}
                    className="w-full py-3 rounded-lg font-bold transition-all bg-gradient-to-r from-neon-blue to-neon-purple hover:from-neon-blue hover:to-neon-purple text-white hover:box-glow hover:scale-105"
                  >
                    👁️ Spectate Game
                  </button>
                ) : (
                <button
                  onClick={() => joinLobby(mode.tier)}
                  disabled={isLocked}
                  className={`w-full py-3 rounded-lg font-bold transition-all ${
                    isLocked
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-neon-green to-neon-blue hover:from-neon-green hover:to-neon-blue text-black hover:box-glow hover:scale-105'
                  }`}
                >
                    {isLocked ? 'Coming Soon' : lobby?.status === 'countdown' ? 'Join Starting Game' : 'Join Lobby'}
                </button>
                )}

                <div className="mt-4 text-xs text-gray-500">
                  <div>Max Players: {mode.maxPlayers}</div>
                  <div>Phase 1: Free Play</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Info */}
          <div className="mt-12 text-center text-gray-400 text-sm">
          <p>Phase 1 Demo - Core gameplay mechanics only</p>
            <p className="mt-2">Press <kbd className="px-2 py-1 bg-neon-green/20 border border-neon-green/50 rounded text-neon-green">SPACE</kbd> to split • Press <kbd className="px-2 py-1 bg-neon-blue/20 border border-neon-blue/50 rounded text-neon-blue">W</kbd> to eject mass</p>
          </div>
        </div>
      </div>

      {/* Roadmap Modal */}
      {showRoadmap && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowRoadmap(false)}
        >
          <div 
            className="relative w-full max-w-6xl max-h-[90vh] bg-gradient-to-br from-cyber-darker to-cyber-dark rounded-2xl border-2 border-neon-purple/50 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gradient-to-r from-neon-purple via-neon-pink to-neon-blue p-6 border-b-2 border-neon-purple/50">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-4xl font-black text-white mb-2">🚀 AgarFi Roadmap</h2>
                  <p className="text-sm text-white/80">From Concept to GameFi Domination in 7 Days</p>
                </div>
                <button
                  onClick={() => setShowRoadmap(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(90vh-120px)] p-6 space-y-6">
              {/* Days 1-2: Core Game System */}
              <div className="relative pl-8 border-l-4 border-neon-green">
                <div className="absolute -left-3 top-0 w-6 h-6 bg-neon-green rounded-full animate-pulse" />
                <div className="bg-cyber-dark/50 backdrop-blur-lg rounded-xl p-6 border border-neon-green/30 hover:border-neon-green hover:box-glow transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="px-3 py-1 bg-neon-green/20 text-neon-green rounded-full text-sm font-bold">Days 1-2</span>
                    <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold">✓ COMPLETE</span>
                  </div>
                  <h3 className="text-2xl font-bold text-neon-green mb-3">Core Game System</h3>
                  <div className="space-y-2 text-gray-300">
                    <p className="flex items-start gap-2">
                      <span className="text-neon-green mt-1">✓</span>
                      <span>60fps Canvas rendering with vanilla JS physics</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-neon-green mt-1">✓</span>
                      <span>Socket.io real-time multiplayer (60Hz server tick)</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-neon-green mt-1">✓</span>
                      <span>Blob mechanics: eat, split, merge, eject pellets</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-neon-green mt-1">✓</span>
                      <span>Four standard game modes ($5, $25, $50, $100)</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-neon-green mt-1">✓</span>
                      <span>Dynamic lobby system with auto-scaling</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Days 3-4: x403 Authentication */}
              <div className="relative pl-8 border-l-4 border-neon-blue">
                <div className="absolute -left-3 top-0 w-6 h-6 bg-neon-blue rounded-full animate-pulse" />
                <div className="bg-cyber-dark/50 backdrop-blur-lg rounded-xl p-6 border border-neon-blue/30 hover:border-neon-blue hover:box-glow transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="px-3 py-1 bg-neon-blue/20 text-neon-blue rounded-full text-sm font-bold">Days 3-4</span>
                    <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-bold">⚡ IN PROGRESS</span>
                  </div>
                  <h3 className="text-2xl font-bold text-neon-blue mb-3">🔥 x403 Authentication & Anti-Bot</h3>
                  <div className="bg-neon-blue/10 border border-neon-blue/30 rounded-lg p-4 mb-4">
                    <p className="text-sm font-bold text-neon-blue mb-2">🚀 Revolutionary Technology:</p>
                    <p className="text-sm text-gray-300">
                      x403 uses ECDSA signature verification to prove wallet ownership WITHOUT passwords or email. 
                      Bot-resistant, zero PII, one wallet = one concurrent game. This is Web3 authentication done RIGHT.
                    </p>
                  </div>
                  <div className="space-y-2 text-gray-300">
                    <p className="flex items-start gap-2">
                      <span className="text-neon-blue mt-1">→</span>
                      <span>Wallet signature verification flow</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-neon-blue mt-1">→</span>
                      <span>User profiles with stats tracking</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-neon-blue mt-1">→</span>
                      <span>Real-time leaderboards</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-neon-blue mt-1">→</span>
                      <span>35-minute session caching</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Days 5-6: Payments & Token Economy */}
              <div className="relative pl-8 border-l-4 border-neon-purple">
                <div className="absolute -left-3 top-0 w-6 h-6 bg-neon-purple rounded-full" />
                <div className="bg-cyber-dark/50 backdrop-blur-lg rounded-xl p-6 border border-neon-purple/30 hover:border-neon-purple hover:box-glow transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="px-3 py-1 bg-neon-purple/20 text-neon-purple rounded-full text-sm font-bold">Days 5-6</span>
                    <span className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded-full text-xs font-bold">○ SCHEDULED</span>
                  </div>
                  <h3 className="text-2xl font-bold text-neon-purple mb-3">💰 Payments & Token Economy</h3>
                  <div className="bg-gradient-to-r from-neon-purple/10 to-neon-pink/10 border border-neon-purple/30 rounded-lg p-4 mb-4">
                    <p className="text-sm font-bold text-neon-purple mb-2">🔥 x402 Payment Protocol:</p>
                    <p className="text-sm text-gray-300">
                      Programmatic crypto payments over HTTP using status code 402. No accounts, no sessions, no KYC. 
                      Just pure frictionless USDC payments via SPL tokens on Solana.
                    </p>
                  </div>
                  <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-lg p-4 mb-4">
                    <p className="text-xl font-black text-yellow-400 mb-2">💎 Win 20x Your Bet!</p>
                    <p className="text-sm text-gray-300">
                      Bet $5, win $100. Bet $100, win $2,000. Winner takes 80% of the pot. 
                      Pure skill-based gameplay with deterministic physics. No RNG, no luck—just YOU vs THE WORLD.
                    </p>
                  </div>
                  <div className="space-y-2 text-gray-300">
                    <p className="flex items-start gap-2">
                      <span className="text-neon-purple mt-1">→</span>
                      <span>Solana USDC payment integration</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-neon-purple mt-1">→</span>
                      <span>Server-managed prize pools with instant payouts</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-neon-purple mt-1">→</span>
                      <span>Automatic AGAR buyback mechanism (Raydium SDK)</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-neon-purple mt-1">→</span>
                      <span>30-day staking smart contract</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Day 7: Launch */}
              <div className="relative pl-8 border-l-4 border-neon-pink">
                <div className="absolute -left-3 top-0 w-6 h-6 bg-neon-pink rounded-full" />
                <div className="bg-cyber-dark/50 backdrop-blur-lg rounded-xl p-6 border border-neon-pink/30 hover:border-neon-pink hover:box-glow transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="px-3 py-1 bg-neon-pink/20 text-neon-pink rounded-full text-sm font-bold">Day 7</span>
                    <span className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded-full text-xs font-bold">○ SCHEDULED</span>
                  </div>
                  <h3 className="text-2xl font-bold text-neon-pink mb-3">🎉 Testing, Polish & Launch</h3>
                  <div className="space-y-2 text-gray-300">
                    <p className="flex items-start gap-2">
                      <span className="text-neon-pink mt-1">→</span>
                      <span>End-to-end testing with real mainnet USDC/AGAR</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-neon-pink mt-1">→</span>
                      <span>Security audits and penetration testing</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-neon-pink mt-1">→</span>
                      <span>Performance optimization (60fps guarantee)</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-neon-pink mt-1">→</span>
                      <span>Production deployment (Vercel + Render)</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-neon-pink mt-1">→</span>
                      <span className="font-bold text-neon-pink">🚀 PUBLIC BETA LAUNCH</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Whale Mode */}
              <div className="relative pl-8 border-l-4 border-yellow-400">
                <div className="absolute -left-3 top-0 w-6 h-6 bg-yellow-400 rounded-full animate-float" />
                <div className="bg-gradient-to-br from-yellow-500/20 via-orange-500/20 to-red-500/20 backdrop-blur-lg rounded-xl p-6 border-2 border-yellow-400/50 hover:border-yellow-400 hover:box-glow-strong transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-4xl animate-float">🐋</span>
                    <span className="px-3 py-1 bg-yellow-400/20 text-yellow-400 rounded-full text-sm font-bold">@ $1M Market Cap</span>
                  </div>
                  <h3 className="text-3xl font-black text-yellow-400 mb-3">WHALE MODE UNLOCKS</h3>
                  <div className="bg-black/30 border border-yellow-400/30 rounded-lg p-4 mb-4">
                    <p className="text-2xl font-black text-white mb-2">$500 Buy-In • 50 Players • $20,000 Winner</p>
                    <p className="text-sm text-gray-300">
                      The ultimate high-stakes arena. Live spectator mode. Hall of fame. Auto-recorded replays. 
                      This is Web3 gaming's Super Bowl. 🏆
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 animate-slideIn">
          <div className="bg-gradient-to-r from-red-500 to-rose-600 text-white px-6 py-4 rounded-lg shadow-2xl border border-white/20 backdrop-blur-md max-w-md">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{toastMessage}</p>
              </div>
              <button
                onClick={() => setToastMessage(null)}
                className="flex-shrink-0 text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
        </div>
      </div>
    </div>
      )}
    </main>
  );
}

