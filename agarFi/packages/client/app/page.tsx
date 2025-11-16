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

  // Particle animation
  useEffect(() => {
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

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        // Draw connections
        particles.forEach((p2) => {
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
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    
    // Fetch game modes
    fetch(`${SOCKET_URL}/api/game-modes`)
      .then(res => res.json())
      .then(setGameModes)
      .catch(console.error);

    // Initial fetch
    fetch(`${SOCKET_URL}/api/lobbies`)
      .then(res => res.json())
      .then(setLobbies)
      .catch(console.error);

    // Connect to Socket.io for real-time updates
    const socket = require('socket.io-client').io(SOCKET_URL);
    
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

    return () => {
      socket.disconnect();
    };
  }, []);

  const joinLobby = (tier: string) => {
    if (!playerName.trim()) {
      alert('Please enter a name');
      return;
    }

    const playerId = `player_${Date.now()}`;
    localStorage.setItem('playerId', playerId);
    localStorage.setItem('playerName', playerName);
    localStorage.setItem('selectedTier', tier);
    localStorage.removeItem('spectatorMode'); // Clear spectator flag
    
    router.push('/game');
  };

  const spectateGame = (tier: string) => {
    localStorage.setItem('selectedTier', tier);
    localStorage.setItem('spectatorMode', 'true');
    
    router.push('/game');
  };

  const getLobbyStatus = (tier: string): LobbyStatus | undefined => {
    return lobbies.find(l => l.tier === tier);
  };

  return (
    <div className="min-h-screen bg-cyber-darker flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Particle canvas */}
      <canvas ref={canvasRef} id="particles" className="fixed inset-0 z-0" />
      
      {/* Background blobs */}
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      <div className="max-w-6xl w-full relative z-10">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="mb-6">
            <h1 className="text-7xl md:text-9xl font-black mb-4 bg-gradient-to-r from-neon-green via-neon-blue to-neon-purple bg-clip-text text-transparent drop-shadow-2xl" style={{ textShadow: '0 0 40px rgba(57, 255, 20, 0.5)' }}>
              AgarFi
            </h1>
          </div>
          <p className="text-2xl md:text-3xl font-bold mb-2" style={{ color: '#39FF14', textShadow: '0 0 20px rgba(57, 255, 20, 0.8)' }}>
            Skill-Based GameFi
          </p>
          <p className="text-lg text-neon-blue mb-4">Phase 1 Demo • Live on Render</p>
          <p className="text-sm text-gray-400 bg-cyber-dark/50 backdrop-blur-sm inline-block px-6 py-2 rounded-full border border-neon-green/30">
            Free play - No payments required
          </p>
        </div>

        {/* Player Name Input */}
        <div className="mb-12 max-w-md mx-auto">
          <label className="block text-sm font-bold mb-3 text-neon-green">Your Name</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name..."
            className="w-full px-6 py-4 bg-cyber-dark/80 backdrop-blur-sm border-2 border-neon-blue/30 rounded-xl focus:outline-none focus:border-neon-green text-white placeholder-gray-500 transition-all shadow-lg shadow-neon-blue/10 hover:shadow-neon-green/20"
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
                className={`bg-cyber-dark/50 backdrop-blur-lg border-2 ${
                  isLocked ? 'border-neon-purple/30' : lobby?.status === 'playing' ? 'border-neon-blue/50' : 'border-gray-700/50'
                } rounded-2xl p-6 transition-all duration-300 ${
                  isLocked ? 'opacity-60' : 'hover:border-neon-green/80 hover:shadow-2xl hover:shadow-neon-green/20 hover:scale-105'
                }`}
              >
                <div className="mb-4">
                  <h3 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-neon-green to-neon-blue mb-2">
                    {mode.tier === 'whale' ? '🐋 Whale Mode' : `$${mode.buyIn}`}
                  </h3>
                  <p className="text-sm text-gray-400 font-semibold">{mode.name}</p>
                  {isLocked && (
                    <div className="mt-3 px-3 py-1 bg-purple-500/20 border border-purple-500/40 rounded-full inline-block">
                      <p className="text-xs text-purple-300 font-bold">🔒 $1M Market Cap</p>
                    </div>
                  )}
                </div>

                {!isLocked && lobby && (
                  <div className="mb-4 space-y-3">
                    <div className="bg-gray-950/50 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-400 text-sm">👥 Players</span>
                        <span className="text-green-400 font-black text-lg">
                          {lobby.playersLocked}/{lobby.maxPlayers}
                        </span>
                      </div>
                      {lobby.spectatorCount !== undefined && lobby.spectatorCount > 0 && (
                        <div className="flex justify-between items-center border-t border-gray-700/50 pt-2">
                          <span className="text-gray-400 text-sm">👁️ Watching</span>
                          <span className="text-purple-400 font-bold text-lg">
                            {lobby.spectatorCount}
                          </span>
                        </div>
                      )}
                    </div>
                    {lobby.countdown !== null && lobby.countdown > 0 && (
                      <div className="text-center py-3 bg-gradient-to-r from-green-500/20 to-blue-500/20 border border-green-500/50 rounded-lg animate-pulse">
                        <div className="text-green-400 font-black text-xl">
                          {Math.ceil(lobby.countdown / 1000)}s
                        </div>
                        <div className="text-xs text-green-300">Starting...</div>
                      </div>
                    )}
                    {lobby.status === 'playing' && (
                      <div className="text-center py-3 bg-gradient-to-r from-yellow-500/20 to-red-500/20 border border-yellow-500/50 rounded-lg">
                        <div className="text-yellow-400 font-bold flex items-center justify-center gap-2">
                          <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                          LIVE
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  {/* Show Join button ONLY if not locked and not playing */}
                  {!isLocked && (!lobby || lobby.status !== 'playing') && (
                    <button
                      onClick={() => joinLobby(mode.tier)}
                      className="w-full py-4 rounded-xl font-black text-lg transition-all bg-neon-green hover:bg-neon-green/80 text-black shadow-lg shadow-neon-green/30 hover:shadow-neon-green/60 hover:scale-105 transform"
                    >
                      🎮 Join Game
                    </button>
                  )}

                  {/* Show Spectate button if game is in progress */}
                  {!isLocked && lobby && lobby.status === 'playing' && (
                    <button
                      onClick={() => spectateGame(mode.tier)}
                      className="w-full py-4 border-2 border-neon-blue rounded-xl text-neon-blue font-black text-lg transition-all hover:bg-neon-blue hover:text-black hover:shadow-lg hover:shadow-neon-blue/40 hover:scale-105 transform"
                    >
                      👁️ Watch Live
                    </button>
                  )}

                  {/* Show Coming Soon for locked modes */}
                  {isLocked && (
                    <button
                      disabled
                      className="w-full py-4 rounded-xl font-bold bg-gradient-to-r from-gray-800 to-gray-700 text-gray-500 cursor-not-allowed border-2 border-gray-600/30"
                    >
                      🔒 Coming Soon
                    </button>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-gray-500">Max: {mode.maxPlayers} players</span>
                  <span className="px-2 py-1 bg-neon-green/20 text-neon-green rounded-full font-bold border border-neon-green/30">FREE</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Info */}
        <div className="mt-16 text-center">
          <div className="inline-block bg-gray-900/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl px-8 py-6">
            <p className="text-gray-400 mb-3 font-semibold">Controls</p>
            <div className="flex gap-6 text-sm">
              <div className="flex items-center gap-2">
                <kbd className="px-3 py-1 bg-gray-800 border border-gray-600 rounded-lg text-green-400 font-mono font-bold">MOUSE</kbd>
                <span className="text-gray-300">Move</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-3 py-1 bg-gray-800 border border-gray-600 rounded-lg text-green-400 font-mono font-bold">SPACE</kbd>
                <span className="text-gray-300">Split</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-3 py-1 bg-gray-800 border border-gray-600 rounded-lg text-green-400 font-mono font-bold">W</kbd>
                <span className="text-gray-300">Eject</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

