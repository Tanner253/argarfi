'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

interface Blob {
  id: string;
  playerId: string;
  x: number;
  y: number;
  mass: number;
  velocity: { x: number; y: number };
  color: string;
}

interface Pellet {
  x: number;
  y: number;
}

interface LeaderboardEntry {
  id: string;
  name: string;
  mass: number;
  cellsEaten: number;
  rank: number;
}

interface PlayerStats {
  pelletsEaten: number;
  cellsEaten: number;
  maxMass: number;
  leaderTime: number;
  bestRank: number;
  timeSurvived: number;
}

interface GameEndResult {
  winnerId: string | null;
  finalRankings: Array<{
    id: string;
    name: string;
    mass: number;
    timeSurvived: number;
    cellsEaten: number;
  }>;
  playerStats: Record<string, PlayerStats>;
}

export default function GamePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const router = useRouter();

  const [blobs, setBlobs] = useState<Blob[]>([]);
  const [pellets, setPellets] = useState<Pellet[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const smoothBlobsRef = useRef<Map<string, { x: number; y: number; mass: number }>>(new Map());
  const [gameEnd, setGameEnd] = useState<GameEndResult | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [gameId, setGameId] = useState<string>('');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [camera, setCamera] = useState({ x: 2500, y: 2500, zoom: 1 });
  const [gameStarted, setGameStarted] = useState(false);
  const [lobbyStatus, setLobbyStatus] = useState({ players: 1, max: 25, countdown: null as number | null });
  const [isSpectator, setIsSpectator] = useState(false);
  const [isEliminated, setIsEliminated] = useState(false);
  const [followingPlayerId, setFollowingPlayerId] = useState<string>('');

  useEffect(() => {
    const playerId = localStorage.getItem('playerId');
    const playerName = localStorage.getItem('playerName');
    const tier = localStorage.getItem('selectedTier');
    const existingGameId = localStorage.getItem('currentGameId');

    if (!playerId || !playerName || !tier) {
      router.push('/');
      return;
    }

    const spectatorMode = localStorage.getItem('spectatorMode') === 'true';
    setIsSpectator(spectatorMode);

    setMyPlayerId(playerId || 'spectator');
    playerIdRef.current = playerId || 'spectator';

    // Connect to Socket.io
    const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to server');
      
      if (spectatorMode) {
        // Join as spectator
        const lobbyId = `lobby_${tier}`;
        socket.emit('spectateGame', { lobbyId });
        setGameId(lobbyId);
        setGameStarted(true);
        socket.emit('join', lobbyId);
        console.log('Joined as spectator');
      } else if (existingGameId && playerId) {
        // Try to reconnect to existing game
        console.log('Attempting to reconnect to game:', existingGameId);
        socket.emit('playerReconnect', { playerId, gameId: existingGameId });
      } else if (playerId && playerName) {
        // Join lobby as player
        socket.emit('playerJoinLobby', { playerId, playerName, tier });
      }
    });

    socket.on('lobbyJoined', ({ lobbyId, tier: joinedTier }) => {
      console.log('Joined lobby:', lobbyId);
      setGameId(lobbyId);
      gameIdRef.current = lobbyId;
      socket.emit('join', lobbyId); // Join Socket.io room
      
      // Request immediate lobby status
      socket.emit('requestLobbyStatus', { lobbyId });
    });

    socket.on('lobbyUpdate', ({ tier, playersLocked, maxPlayers, countdown, status }) => {
      const currentTier = localStorage.getItem('selectedTier');
      // Only update if this update is for our tier
      if (tier === currentTier) {
        setLobbyStatus({ players: playersLocked, max: maxPlayers, countdown });
      }
    });

    socket.on('reconnected', ({ gameId: reconnectedGameId }) => {
      console.log('Reconnected to game:', reconnectedGameId);
      setGameId(reconnectedGameId);
      gameIdRef.current = reconnectedGameId;
      setGameStarted(true);
      gameStartedRef.current = true;
      socket.emit('join', reconnectedGameId);
    });

    socket.on('gameNotFound', () => {
      localStorage.removeItem('currentGameId');
      // Rejoin lobby
      const playerId = localStorage.getItem('playerId');
      const playerName = localStorage.getItem('playerName');
      const tier = localStorage.getItem('selectedTier');
      if (socketRef.current && playerId && playerName && tier) {
        socketRef.current.emit('playerJoinLobby', { playerId, playerName, tier });
      }
    });

    socket.on('gameStart', ({ startTime, gameId: startedGameId }) => {
      console.log('Game starting!');
      const finalGameId = startedGameId || gameIdRef.current;
      setGameId(finalGameId);
      gameIdRef.current = finalGameId;
      setGameStarted(true);
      gameStartedRef.current = true;
      localStorage.setItem('currentGameId', finalGameId);
    });

    socket.on('gameState', ({ blobs: newBlobs, pellets: newPellets, leaderboard: newLeaderboard }) => {
      setBlobs(newBlobs);
      setPellets(newPellets);
      setLeaderboard(newLeaderboard);

      const currentPlayerId = playerIdRef.current;

      // Check if player is eliminated
      if (!spectatorMode && currentPlayerId && currentPlayerId !== 'spectator') {
        const myBlobs = newBlobs.filter((b: Blob) => b.playerId === currentPlayerId);
        
        if (myBlobs.length === 0 && newBlobs.length > 0) {
          // Player eliminated, become spectator
          console.log('Player eliminated, switching to spectator mode');
          setIsEliminated(true);
          setIsSpectator(true);
          // Follow leader
          if (leaderboard.length > 0) {
            setFollowingPlayerId(leaderboard[0].id);
          }
        }
      }

      // Update camera - moved to separate effect below for better control
    });

    socket.on('gameEnd', (result: GameEndResult) => {
      console.log('Game ended:', result);
      setGameEnd(result);
      localStorage.removeItem('currentGameId'); // Clear game ID on end
    });

    socket.on('lobbyCancelled', ({ message }) => {
      alert(message);
      localStorage.removeItem('currentGameId');
      router.push('/');
    });

    socket.on('error', ({ message }) => {
      console.error('Server error:', message);
      alert(message);
      localStorage.removeItem('currentGameId');
      router.push('/');
    });

    return () => {
      // Cleanup when leaving page
      if (playerId && !localStorage.getItem('spectatorMode')) {
        socket.emit('leaveLobby', { playerId });
      }
      socket.disconnect();
      localStorage.removeItem('currentGameId');
    };
  }, [router]);

  // Update camera based on spectator mode or player position
  useEffect(() => {
    if (blobs.length === 0) return;

    let targetPlayerId = myPlayerId;
    
    if (isSpectator || isEliminated) {
      // Follow selected player or leader
      targetPlayerId = followingPlayerId || (leaderboard.length > 0 ? leaderboard[0].id : '');
    }

    const followBlobs = blobs.filter((b: Blob) => b.playerId === targetPlayerId);
    if (followBlobs.length > 0) {
      const avgX = followBlobs.reduce((sum: number, b: Blob) => sum + b.x, 0) / followBlobs.length;
      const avgY = followBlobs.reduce((sum: number, b: Blob) => sum + b.y, 0) / followBlobs.length;
      const totalMass = followBlobs.reduce((sum: number, b: Blob) => sum + b.mass, 0);
      
      const zoom = Math.max(0.2, Math.min(1.5, 200 / Math.sqrt(totalMass)));
      
      setCamera({ x: avgX, y: avgY, zoom });
    }
  }, [blobs, followingPlayerId, isSpectator, isEliminated, myPlayerId, leaderboard]);

  // Track mouse position
  const mousePosRef = useRef({ x: 2500, y: 2500 });
  const mouseScreenPosRef = useRef({ x: 0, y: 0 }); // Screen position (doesn't change with camera)
  const gameIdRef = useRef<string>('');
  const playerIdRef = useRef<string>('');
  const gameStartedRef = useRef<boolean>(false);
  const cameraRef = useRef(camera);

  // Update camera ref when camera changes
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  // Update mouse screen position on move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      
      // Store SCREEN position (relative to canvas)
      mouseScreenPosRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []); // No dependencies - mouse position independent of game state

  // Continuously calculate and send target position - NEVER stops until unmount
  useEffect(() => {
    console.log('Movement system initialized');
    
    const interval = setInterval(() => {
      const socket = socketRef.current;
      const canvas = canvasRef.current;
      
      // Only send if game has started AND not spectating/eliminated
      if (!isSpectator && !isEliminated && gameStartedRef.current && socket?.connected && gameIdRef.current && playerIdRef.current && canvas) {
        // Calculate world position from screen position
        const cam = cameraRef.current;
        const screenPos = mouseScreenPosRef.current;
        
        // Convert screen to world coordinates
        const worldX = cam.x + (screenPos.x - canvas.width / 2) / cam.zoom;
        const worldY = cam.y + (screenPos.y - canvas.height / 2) / cam.zoom;
        
        socket.emit('playerMove', {
          playerId: playerIdRef.current,
          x: worldX,
          y: worldY,
          gameId: gameIdRef.current,
        });
      }
    }, 50); // Send position 20 times per second

    return () => {
      clearInterval(interval);
    };
  }, [isSpectator, isEliminated]); // Update when spectator state changes

  // Handle keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't allow controls if spectating or eliminated
      if (isSpectator || isEliminated) return;
      
      if (!socketRef.current || !gameIdRef.current || !playerIdRef.current) return;
      if (!canvasRef.current) return;

      if (e.code === 'Space') {
        e.preventDefault();
        
        // Calculate direction toward mouse
        const canvas = canvasRef.current;
        const cam = cameraRef.current;
        const screenPos = mouseScreenPosRef.current;
        
        const worldX = cam.x + (screenPos.x - canvas.width / 2) / cam.zoom;
        const worldY = cam.y + (screenPos.y - canvas.height / 2) / cam.zoom;
        
        socketRef.current.emit('playerSplit', { 
          playerId: playerIdRef.current, 
          gameId: gameIdRef.current,
          targetX: worldX,
          targetY: worldY
        });
      }

      if (e.code === 'KeyW') {
        e.preventDefault();
        
        // Calculate direction toward mouse
        const canvas = canvasRef.current;
        const cam = cameraRef.current;
        const screenPos = mouseScreenPosRef.current;
        
        const worldX = cam.x + (screenPos.x - canvas.width / 2) / cam.zoom;
        const worldY = cam.y + (screenPos.y - canvas.height / 2) / cam.zoom;
        
        socketRef.current.emit('playerEject', { 
          playerId: playerIdRef.current, 
          gameId: gameIdRef.current,
          targetX: worldX,
          targetY: worldY
        });
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isSpectator, isEliminated]);

  // Canvas rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let animationFrameId: number;

    const render = () => {
      // Clear canvas
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Save context
      ctx.save();

      // Apply camera transform
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      // Draw grid
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1 / camera.zoom;
      for (let x = 0; x <= 5000; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 5000);
        ctx.stroke();
      }
      for (let y = 0; y <= 5000; y += 100) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(5000, y);
        ctx.stroke();
      }

      // Draw pellets
      pellets.forEach(pellet => {
        ctx.fillStyle = '#4ECDC4';
        ctx.beginPath();
        ctx.arc(pellet.x, pellet.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw blobs with interpolation for smooth movement
      blobs.forEach(blob => {
        // Get or create smooth position for this blob
        let smooth = smoothBlobsRef.current.get(blob.id);
        if (!smooth) {
          smooth = { x: blob.x, y: blob.y, mass: blob.mass };
          smoothBlobsRef.current.set(blob.id, smooth);
        }

        // Interpolate (lerp) toward server position for smooth movement
        const lerpFactor = 0.3; // Higher = snappier, lower = smoother
        smooth.x += (blob.x - smooth.x) * lerpFactor;
        smooth.y += (blob.y - smooth.y) * lerpFactor;
        smooth.mass += (blob.mass - smooth.mass) * lerpFactor;

        // Match server-side radius calculation (3x bigger)
        const radius = Math.sqrt(smooth.mass / Math.PI) * 3;
        
        // Draw blob at interpolated position
        ctx.fillStyle = blob.color;
        ctx.beginPath();
        ctx.arc(smooth.x, smooth.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw border
        ctx.strokeStyle = blob.playerId === myPlayerId ? '#FFD700' : '#333';
        ctx.lineWidth = 3 / camera.zoom;
        ctx.stroke();

        // Draw player name
        const player = leaderboard.find(p => p.id === blob.playerId);
        if (player) {
          ctx.fillStyle = '#fff';
          ctx.font = `${Math.max(12, 14 / camera.zoom)}px Arial`;
          ctx.textAlign = 'center';
          ctx.fillText(player.name, smooth.x, smooth.y + radius + 20 / camera.zoom);
        }
      });

      // Clean up smooth positions for blobs that no longer exist
      const currentBlobIds = new Set(blobs.map(b => b.id));
      for (const [id] of smoothBlobsRef.current) {
        if (!currentBlobIds.has(id)) {
          smoothBlobsRef.current.delete(id);
        }
      }

      ctx.restore();

      // Draw HUD
      drawHUD(ctx, canvas);

      animationFrameId = requestAnimationFrame(render);
    };

    const drawHUD = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      // Leaderboard
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(10, 10, 200, Math.min(leaderboard.length * 30 + 40, 340));
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Leaderboard', 20, 35);

      leaderboard.slice(0, 10).forEach((entry, i) => {
        const y = 60 + i * 30;
        const isMe = entry.id === myPlayerId;
        
        ctx.fillStyle = isMe ? '#FFD700' : '#fff';
        ctx.font = isMe ? 'bold 14px Arial' : '14px Arial';
        ctx.fillText(`${i + 1}. ${entry.name}`, 20, y);
        
        ctx.fillStyle = '#4ECDC4';
        ctx.fillText(Math.floor(entry.mass).toString(), 160, y);
      });

      // Current mass
      const myMass = blobs
        .filter(b => b.playerId === myPlayerId)
        .reduce((sum, b) => sum + b.mass, 0);

      if (myMass > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(canvas.width - 210, 10, 200, 60);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`Mass: ${Math.floor(myMass)}`, canvas.width - 20, 45);
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [blobs, pellets, leaderboard, camera, myPlayerId]);

  if (gameEnd) {
    const myStats = gameEnd.playerStats[myPlayerId];
    const myRanking = gameEnd.finalRankings.findIndex(r => r.id === myPlayerId) + 1;
    const isWinner = gameEnd.winnerId === myPlayerId;

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-8">
        <div className="max-w-2xl w-full bg-gray-800 border border-gray-700 rounded-2xl p-8">
          <h2 className="text-4xl font-black text-center mb-6">
            {isWinner ? (
              <span className="bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
                🏆 Victory! 🏆
              </span>
            ) : (
              <span className="text-white">Game Over</span>
            )}
          </h2>

          <div className="text-center mb-8">
            <div className="text-6xl font-black text-green-400 mb-2">
              #{myRanking}
            </div>
            <div className="text-gray-400">Final Placement</div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="text-sm text-gray-400">Food Eaten</div>
              <div className="text-2xl font-bold text-green-400">{myStats?.pelletsEaten || 0}</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="text-sm text-gray-400">Cells Eaten</div>
              <div className="text-2xl font-bold text-red-400">{myStats?.cellsEaten || 0}</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="text-sm text-gray-400">Highest Mass</div>
              <div className="text-2xl font-bold text-blue-400">{Math.floor(myStats?.maxMass || 0)}</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="text-sm text-gray-400">Time Survived</div>
              <div className="text-2xl font-bold text-purple-400">
                {Math.floor(myStats?.timeSurvived || 0)}s
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="text-sm text-gray-400">Leader Time</div>
              <div className="text-2xl font-bold text-yellow-400">
                {Math.floor(myStats?.leaderTime || 0)}s
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="text-sm text-gray-400">Best Rank</div>
              <div className="text-2xl font-bold text-pink-400">
                #{myStats?.bestRank === 999 ? '-' : myStats?.bestRank}
              </div>
            </div>
          </div>

          {/* Final Rankings */}
          <div className="mb-8">
            <h3 className="text-xl font-bold mb-4">Final Rankings</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {gameEnd.finalRankings.map((player, index) => (
                <div
                  key={player.id}
                  className={`flex justify-between items-center p-3 rounded ${
                    player.id === myPlayerId ? 'bg-green-900/30 border border-green-500' : 'bg-gray-900'
                  }`}
                >
                  <span className="font-bold">#{index + 1} {player.name}</span>
                  <span className="text-gray-400">
                    {Math.floor(player.mass)} mass • {player.cellsEaten} kills
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => router.push('/')}
            className="w-full py-4 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 rounded-lg font-bold text-white transition-all"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    );
  }

  // Handle leave lobby
  const leaveLobby = () => {
    if (socketRef.current) {
      socketRef.current.emit('leaveLobby', { playerId: myPlayerId });
      socketRef.current.disconnect();
    }
    localStorage.removeItem('currentGameId');
    router.push('/');
  };

  // Show lobby waiting screen if game hasn't started
  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-gray-800 border border-gray-700 rounded-2xl p-8 text-center">
          <div className="mb-6">
            <div className="text-6xl mb-4">⏳</div>
            <h2 className="text-3xl font-bold text-white mb-2">Waiting for Game</h2>
            <p className="text-gray-400">Get ready to play!</p>
          </div>

          <div className="bg-gray-900 rounded-lg p-6 mb-6">
            <div className="text-4xl font-black text-green-400 mb-2">
              {lobbyStatus.players}/{lobbyStatus.max}
            </div>
            <div className="text-sm text-gray-400">Players in Lobby</div>
          </div>

          {lobbyStatus.countdown !== null && lobbyStatus.countdown > 0 && (
            <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 mb-6">
              <div className="text-2xl font-bold text-green-400 mb-1">
                Starting in {lobbyStatus.countdown}s
              </div>
              <div className="text-sm text-gray-400">Get ready!</div>
            </div>
          )}

          {lobbyStatus.players < 10 && (
            <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4 mb-6">
              <div className="text-sm text-yellow-400">
                Waiting for {10 - lobbyStatus.players} more player(s)...
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Or the game will start automatically
              </div>
            </div>
          )}

          <div className="text-xs text-gray-500">
            <p>Controls:</p>
            <p className="mt-1">Move: Mouse • Split: SPACE • Eject: W</p>
          </div>

          <button
            onClick={leaveLobby}
            className="mt-6 w-full py-3 bg-red-500/20 border border-red-500/50 hover:bg-red-500/30 rounded-lg text-red-400 font-bold transition-all"
          >
            Leave Lobby
          </button>
        </div>
      </div>
    );
  }

  // Spectator controls
  const switchSpectatorTarget = () => {
    if (leaderboard.length === 0) return;
    
    const currentIndex = leaderboard.findIndex(p => p.id === followingPlayerId);
    const nextIndex = (currentIndex + 1) % leaderboard.length;
    
    const nextPlayer = leaderboard[nextIndex];
    if (nextPlayer) {
      console.log('Switching spectator to:', nextPlayer.name);
      setFollowingPlayerId(nextPlayer.id);
    }
  };

  return (
    <div className="relative w-screen h-screen">
      <canvas ref={canvasRef} className="absolute inset-0" />
      
      {/* Spectator Indicator */}
      {(isSpectator || isEliminated) && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-purple-500/80 backdrop-blur-sm rounded-lg px-6 py-3">
          <div className="text-white font-bold">
            {isEliminated ? '💀 Eliminated - Spectating' : '👁️ Spectator Mode'}
          </div>
          {followingPlayerId && (
            <div className="text-sm text-purple-200">
              Following: {leaderboard.find(p => p.id === followingPlayerId)?.name || 'Unknown'}
            </div>
          )}
        </div>
      )}

      {/* Spectator Controls */}
      {(isSpectator || isEliminated) && leaderboard.length > 1 && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2">
          <button
            onClick={switchSpectatorTarget}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-lg text-white font-bold transition-all"
          >
            Switch Player
          </button>
        </div>
      )}
      
      {/* Controls Overlay - Mobile Only */}
      <div className="absolute bottom-8 right-8 flex gap-4 md:hidden">
        <button
          onClick={() => {
            if (!socketRef.current || !canvasRef.current) return;
            
            const canvas = canvasRef.current;
            const cam = cameraRef.current;
            const screenPos = mouseScreenPosRef.current;
            
            const worldX = cam.x + (screenPos.x - canvas.width / 2) / cam.zoom;
            const worldY = cam.y + (screenPos.y - canvas.height / 2) / cam.zoom;
            
            socketRef.current.emit('playerSplit', { 
              playerId: playerIdRef.current, 
              gameId: gameIdRef.current,
              targetX: worldX,
              targetY: worldY
            });
          }}
          className="w-16 h-16 bg-green-500 hover:bg-green-600 rounded-full font-bold text-white shadow-lg"
        >
          SPLIT
        </button>
        <button
          onClick={() => {
            if (!socketRef.current || !canvasRef.current) return;
            
            const canvas = canvasRef.current;
            const cam = cameraRef.current;
            const screenPos = mouseScreenPosRef.current;
            
            const worldX = cam.x + (screenPos.x - canvas.width / 2) / cam.zoom;
            const worldY = cam.y + (screenPos.y - canvas.height / 2) / cam.zoom;
            
            socketRef.current.emit('playerEject', { 
              playerId: playerIdRef.current, 
              gameId: gameIdRef.current,
              targetX: worldX,
              targetY: worldY
            });
          }}
          className="w-16 h-16 bg-blue-500 hover:bg-blue-600 rounded-full font-bold text-white shadow-lg"
        >
          EJECT
        </button>
      </div>

      {/* Keyboard Controls Info */}
      <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm rounded-lg p-3 text-sm hidden md:block">
        <div className="text-gray-300">
          <div><kbd className="bg-gray-700 px-2 py-1 rounded">SPACE</kbd> Split</div>
          <div className="mt-1"><kbd className="bg-gray-700 px-2 py-1 rounded">W</kbd> Eject</div>
        </div>
      </div>

      {/* Minimap - Development Tool */}
      <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg p-3">
        <div className="text-xs text-gray-400 mb-2">Minimap (Dev)</div>
        <div className="relative w-48 h-48 bg-gray-900 border border-gray-700">
          {/* Map boundaries */}
          <div className="absolute inset-0">
            {/* Players */}
            {blobs.map(blob => {
              const x = (blob.x / 5000) * 192; // Scale to minimap size (192px = w-48)
              const y = (blob.y / 5000) * 192;
              const size = Math.max(2, Math.min(8, Math.sqrt(blob.mass) / 3));
              const isMe = blob.playerId === myPlayerId;
              
              return (
                <div
                  key={blob.id}
                  className="absolute rounded-full"
                  style={{
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${size}px`,
                    height: `${size}px`,
                    backgroundColor: isMe ? '#FFD700' : blob.color,
                    transform: 'translate(-50%, -50%)',
                    border: isMe ? '2px solid #FFF' : 'none',
                  }}
                />
              );
            })}
            
            {/* Camera viewport indicator */}
            <div
              className="absolute border-2 border-white/30"
              style={{
                left: `${((camera.x - 400/camera.zoom) / 5000) * 192}px`,
                top: `${((camera.y - 300/camera.zoom) / 5000) * 192}px`,
                width: `${(800/camera.zoom / 5000) * 192}px`,
                height: `${(600/camera.zoom / 5000) * 192}px`,
              }}
            />
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          Yellow = You • White box = Viewport
        </div>
      </div>
    </div>
  );
}

