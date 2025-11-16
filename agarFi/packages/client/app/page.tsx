'use client';

import { useState, useEffect } from 'react';
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
  const [gameModes, setGameModes] = useState<GameMode[]>([]);
  const [lobbies, setLobbies] = useState<LobbyStatus[]>([]);
  const [playerName, setPlayerName] = useState('');

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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-8">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-black mb-4 bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            AgarFi
          </h1>
          <p className="text-xl text-gray-400">Skill-Based GameFi • Phase 1 Demo</p>
          <p className="text-sm text-gray-500 mt-2">Free play - No payments required</p>
        </div>

        {/* Player Name Input */}
        <div className="mb-8 max-w-md mx-auto">
          <label className="block text-sm font-medium mb-2">Your Name</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-green-500 text-white"
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
                className={`bg-gray-800 border ${isLocked ? 'border-purple-500/30' : 'border-gray-700'} rounded-xl p-6 ${
                  isLocked ? 'opacity-50' : 'hover:border-green-500 transition-all'
                }`}
              >
                <div className="mb-4">
                  <h3 className="text-2xl font-bold text-white mb-1">
                    {mode.tier === 'whale' ? '🐋 Whale Mode' : `$${mode.buyIn} Stakes`}
                  </h3>
                  <p className="text-sm text-gray-400">{mode.name}</p>
                  {isLocked && (
                    <p className="text-xs text-purple-400 mt-2">🔒 Unlocks at $1M Market Cap</p>
                  )}
                </div>

                {!isLocked && lobby && (
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-400">Players</span>
                      <span className="text-green-400 font-bold">
                        {lobby.playersLocked}/{lobby.maxPlayers}
                      </span>
                    </div>
                    {lobby.spectatorCount !== undefined && lobby.spectatorCount > 0 && (
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-400">👁️ Spectators</span>
                        <span className="text-purple-400 font-bold">
                          {lobby.spectatorCount}
                        </span>
                      </div>
                    )}
                    {lobby.countdown !== null && lobby.countdown > 0 && (
                      <div className="text-center py-2 bg-green-500/20 rounded text-green-400 font-bold">
                        Starting in {Math.ceil(lobby.countdown / 1000)}s
                      </div>
                    )}
                    {lobby.status === 'playing' && (
                      <div className="text-center py-2 bg-yellow-500/20 rounded text-yellow-400 font-bold">
                        In Progress
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  {/* Show Join button ONLY if not locked and not playing */}
                  {!isLocked && (!lobby || lobby.status !== 'playing') && (
                    <button
                      onClick={() => joinLobby(mode.tier)}
                      className="w-full py-3 rounded-lg font-bold transition-all bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white"
                    >
                      Join Lobby
                    </button>
                  )}

                  {/* Show Spectate button if game is in progress */}
                  {!isLocked && lobby && lobby.status === 'playing' && (
                    <button
                      onClick={() => spectateGame(mode.tier)}
                      className="w-full py-3 bg-purple-500/20 border-2 border-purple-500/50 hover:bg-purple-500/30 rounded-lg text-purple-400 font-bold transition-all"
                    >
                      👁️ Spectate Game
                    </button>
                  )}

                  {/* Show Coming Soon for locked modes */}
                  {isLocked && (
                    <button
                      disabled
                      className="w-full py-3 rounded-lg font-bold bg-gray-700 text-gray-500 cursor-not-allowed"
                    >
                      Coming Soon
                    </button>
                  )}
                </div>

                <div className="mt-4 text-xs text-gray-500">
                  <div>Max Players: {mode.maxPlayers}</div>
                  <div>Phase 1: Free Play</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Info */}
        <div className="mt-12 text-center text-gray-500 text-sm">
          <p>Phase 1 Demo - Core gameplay mechanics only</p>
          <p className="mt-2">Press SPACE to split • Press W to eject mass</p>
        </div>
      </div>
    </div>
  );
}

