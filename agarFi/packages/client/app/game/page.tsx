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
  const [gameEnd, setGameEnd] = useState<GameEndResult | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [gameId, setGameId] = useState<string>('');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [camera, setCamera] = useState({ x: 2500, y: 2500, zoom: 1 });
  const [gameStarted, setGameStarted] = useState(false);
  const [lobbyStatus, setLobbyStatus] = useState({ players: 1, max: 25, countdown: null as number | null });

  useEffect(() => {
    const playerId = localStorage.getItem('playerId');
    const playerName = localStorage.getItem('playerName');
    const tier = localStorage.getItem('selectedTier');
    const existingGameId = localStorage.getItem('currentGameId');

    if (!playerId || !playerName || !tier) {
      router.push('/');
      return;
    }

    setMyPlayerId(playerId);
    playerIdRef.current = playerId;

    // Connect to Socket.io
    const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to server');
      
      // Try to reconnect to existing game first
      if (existingGameId) {
        console.log('Attempting to reconnect to game:', existingGameId);
        socket.emit('playerReconnect', { playerId, gameId: existingGameId });
      } else {
        // Join lobby
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

      // Update camera to follow player
      const myBlobs = newBlobs.filter((b: Blob) => b.playerId === playerId);
      if (myBlobs.length > 0) {
        const avgX = myBlobs.reduce((sum: number, b: Blob) => sum + b.x, 0) / myBlobs.length;
        const avgY = myBlobs.reduce((sum: number, b: Blob) => sum + b.y, 0) / myBlobs.length;
        const totalMass = myBlobs.reduce((sum: number, b: Blob) => sum + b.mass, 0);
        
        // Zoom out as mass increases (more mass = more zoom out)
        // Starting mass 100 = zoom 1.0, mass 1000 = zoom 0.5, mass 10000 = zoom 0.2
        const zoom = Math.max(0.2, Math.min(1.5, 200 / Math.sqrt(totalMass)));
        
        setCamera({ x: avgX, y: avgY, zoom });
      }
    });

    socket.on('gameEnd', (result: GameEndResult) => {
      console.log('Game ended:', result);
      setGameEnd(result);
      localStorage.removeItem('currentGameId'); // Clear game ID on end
    });

    socket.on('error', ({ message }) => {
      console.error('Server error:', message);
      alert(message);
      router.push('/');
    });

    return () => {
      socket.disconnect();
    };
  }, [router]);

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
      
      // Only send if game has started
      if (gameStartedRef.current && socket?.connected && gameIdRef.current && playerIdRef.current && canvas) {
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
  }, []); // Empty deps - runs once, never recreated

  // Handle keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
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
  }, []);

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

      // Draw blobs
      blobs.forEach(blob => {
        // Match server-side radius calculation (3x bigger)
        const radius = Math.sqrt(blob.mass / Math.PI) * 3;
        
        // Draw blob
        ctx.fillStyle = blob.color;
        ctx.beginPath();
        ctx.arc(blob.x, blob.y, radius, 0, Math.PI * 2);
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
          ctx.fillText(player.name, blob.x, blob.y + radius + 20 / camera.zoom);
        }
      });

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
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen">
      <canvas ref={canvasRef} className="absolute inset-0" />
      
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

