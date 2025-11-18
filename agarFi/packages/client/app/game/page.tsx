'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { motion } from 'framer-motion';

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
  color?: string;
}

interface KillAnimation {
  blobId: string;
  victimX: number;
  victimY: number;
  startTime: number;
}

interface MergeAnimation {
  blobId: string;
  startTime: number;
}

interface ShrinkAnimation {
  blobId: string;
  startTime: number;
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
  const [camera, setCamera] = useState({ x: 2500, y: 2500, zoom: 1 });
  const [gameStarted, setGameStarted] = useState(false);
  const [lobbyStatus, setLobbyStatus] = useState({ players: 1, max: 25, countdown: null as number | null });
  const [isSpectating, setIsSpectating] = useState(false);
  const [spectatingPlayerId, setSpectatingPlayerId] = useState<string>('');
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [leaderboardVisible, setLeaderboardVisible] = useState(true);
  const [killAnimations, setKillAnimations] = useState<KillAnimation[]>([]);
  const [mergeAnimations, setMergeAnimations] = useState<MergeAnimation[]>([]);
  const [shrinkAnimations, setShrinkAnimations] = useState<ShrinkAnimation[]>([]);
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'info' | 'error' | 'success' | 'warning' } | null>(null);
  const [mapBounds, setMapBounds] = useState<{ minX: number; maxX: number; minY: number; maxY: number } | null>(null);
  const [boundaryWarning, setBoundaryWarning] = useState<{ startTime: number } | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [winnerPayout, setWinnerPayout] = useState<{ amount: number; txSignature: string | null } | null>(null);

  const mousePosRef = useRef({ x: 2500, y: 2500 });
  const mouseScreenPosRef = useRef({ x: 0, y: 0 });
  const gameIdRef = useRef<string>('');
  const playerIdRef = useRef<string>('');
  const gameStartedRef = useRef<boolean>(false);
  const cameraRef = useRef(camera);
  const autoRedirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Update camera ref when camera changes
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  // Detect mobile on mount
  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    const playerId = localStorage.getItem('playerId');
    const playerName = localStorage.getItem('playerName');
    const tier = localStorage.getItem('selectedTier');
    const walletAddress = localStorage.getItem('playerWallet');
    const existingGameId = localStorage.getItem('currentGameId');
    const spectateMode = localStorage.getItem('spectateMode');

    console.log('🔍 Game page useEffect - spectateMode:', spectateMode, 'tier:', tier, 'wallet:', walletAddress);

    // DON'T clear spectate flag yet - need it for socket connection
    const isSpectator = spectateMode === 'true';

    if (isSpectator) {
      // Joining as spectator
      console.log('🎥 SPECTATOR MODE ACTIVE - tier:', tier);
      if (!tier) {
        console.error('❌ No tier selected for spectating, redirecting');
        router.push('/');
        return;
      }
      // Set spectating immediately
      setIsSpectating(true);
    } else {
      // Joining as player
      console.log('🎮 PLAYER MODE - playerId:', playerId);
      if (!playerId || !playerName || !tier) {
        console.error('❌ Missing player credentials, redirecting');
        router.push('/');
        return;
      }
      setMyPlayerId(playerId);
      playerIdRef.current = playerId;
    }

    // Connect to Socket.io
    const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
    console.log('🔌 Connecting to Socket.io server:', serverUrl);
    const socket = io(serverUrl);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Socket connected! ID:', socket.id);
      
      if (isSpectator) {
        // Join as spectator
        console.log('🎥 Emitting joinAsSpectator event for tier:', tier);
        socket.emit('joinAsSpectator', { tier });
        // Now clear the flag
        localStorage.removeItem('spectateMode');
      } else if (existingGameId) {
        // Try to reconnect to existing game
        console.log('Attempting to reconnect to game:', existingGameId);
        socket.emit('playerReconnect', { playerId, gameId: existingGameId });
      } else {
        // Join lobby (with wallet address for payouts)
        console.log('Joining lobby for tier:', tier, 'wallet:', walletAddress);
        socket.emit('playerJoinLobby', { playerId, playerName, tier, walletAddress });
      }
    });

    socket.on('spectatorJoined', ({ gameId, tier: joinedTier }) => {
      console.log('✅ Successfully joined as spectator for game:', gameId);
      setGameId(gameId);
      gameIdRef.current = gameId;
      setGameStarted(true);
      gameStartedRef.current = true;
      setIsSpectating(true);
      
      // Join the game room to receive updates
      socket.emit('join', gameId);
      console.log('Spectator joined room:', gameId);
      
      // Note: spectatingPlayerId will be set when first gameState arrives
    });

    socket.on('lobbyJoined', ({ lobbyId, tier: joinedTier }) => {
      console.log('Joined lobby:', lobbyId);
      setGameId(lobbyId);
      gameIdRef.current = lobbyId;
      socket.emit('join', lobbyId);
      socket.emit('requestLobbyStatus', { lobbyId });
    });

    socket.on('lobbyUpdate', ({ tier, playersLocked, maxPlayers, countdown, status }) => {
      const currentTier = localStorage.getItem('selectedTier');
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
      console.log('Game not found, redirecting to lobby NOW');
      socket.disconnect();
      localStorage.clear();
      // Immediate redirect
      window.location.href = '/';
    });

    socket.on('serverShutdown', ({ message }) => {
      console.log('Server shutdown, redirecting to lobby NOW');
      socket.disconnect();
      localStorage.clear();
      // Immediate redirect
      window.location.href = '/';
    });

    socket.on('lobbyCancelled', ({ message }) => {
      console.log('Lobby cancelled, redirecting to lobby NOW');
      socket.disconnect();
      localStorage.clear();
      // Immediate redirect
      window.location.href = '/';
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

    socket.on('boundaryWarning', ({ startTime }) => {
      console.log('⚠️ BOUNDARY WARNING - 3 second countdown!');
      setBoundaryWarning({ startTime });
    });

    socket.on('boundarySafe', () => {
      console.log('✅ Moved away from boundary');
      setBoundaryWarning(null);
    });

    socket.on('boundaryKilled', () => {
      console.log('💀 Killed by boundary!');
      setBoundaryWarning(null);
    });

    socket.on('playerEliminated', ({ killerId, killerName }) => {
      console.log(`💀 YOU DIED!`);
      
      setIsSpectating(true);
      // Don't set spectatingPlayerId here - let auto-select choose leader
      setBoundaryWarning(null);
      playerIdRef.current = '';
      
      if (socketRef.current && gameIdRef.current) {
        socketRef.current.emit('becomeSpectator', { 
          playerId: myPlayerId,
          gameId: gameIdRef.current 
        });
      }
      
      console.log('✅ Spectator mode active');
    });

    // Server tells us when a blob kills another
    socket.on('blobKilled', ({ killerBlobId, victimBlobId, victimX, victimY }) => {
      const now = Date.now();
      
      // Killer gets sun rays animation
      setKillAnimations(prev => [...prev, {
        blobId: killerBlobId,
        victimX,
        victimY,
        startTime: now,
      }]);

      // Victim gets shrink animation
      setShrinkAnimations(prev => [...prev, {
        blobId: victimBlobId,
        startTime: now,
      }]);
    });

    // Server tells us when blobs merge
    socket.on('blobMerged', ({ remainingBlobId, mergedBlobId }) => {
      const now = Date.now();
      
      // Remaining blob gets shrink-grow animation
      setMergeAnimations(prev => [...prev, {
        blobId: remainingBlobId,
        startTime: now,
      }]);
    });

    socket.on('gameState', ({ blobs: newBlobs, pellets: newPellets, leaderboard: newLeaderboard, spectatorCount: specCount, mapBounds: newMapBounds, timeRemaining: timeLeft }) => {
      setBlobs(newBlobs);
      setPellets(newPellets);
      setLeaderboard(newLeaderboard);
      if (specCount !== undefined) {
        setSpectatorCount(specCount);
      }
      if (newMapBounds) {
        setMapBounds(newMapBounds);
      }
      if (timeLeft !== undefined) {
        setTimeRemaining(timeLeft);
      }

      // Check if player is dead (only if not already spectating)
      if (!isSpectating && playerId) {
        const myBlobs = newBlobs.filter((b: Blob) => b.playerId === playerId);
        if (myBlobs.length === 0 && gameStartedRef.current) {
          // Player died but didn't get elimination event - spectate leader
          setIsSpectating(true);
          if (newLeaderboard.length > 0) {
            setSpectatingPlayerId(newLeaderboard[0].id);
          }
        }
      }

      // ONLY auto-select if we don't have anyone selected
      if (isSpectating && !spectatingPlayerId && newLeaderboard.length > 0) {
        const leader = newLeaderboard[0];
        console.log('👁️ AUTO-SELECTING leader:', leader.name, leader.id);
        setSpectatingPlayerId(leader.id);
      }

      // Check if current spectated player is still alive
      if (isSpectating && spectatingPlayerId) {
        const current = newLeaderboard.find((p: LeaderboardEntry) => p.id === spectatingPlayerId);
        const currentBlobs = newBlobs.filter((b: Blob) => b.playerId === spectatingPlayerId);
        
        console.log(`📊 Current spectate: ${spectatingPlayerId}, Found in leaderboard: ${!!current}, Has blobs: ${currentBlobs.length}`);
        
        // ONLY auto-switch if player is confirmed dead
        if (!current || current.mass === 0 || currentBlobs.length === 0) {
          const alivePlayers = newLeaderboard.filter((p: LeaderboardEntry) => p.mass > 0);
          if (alivePlayers.length > 0) {
            console.log(`⚠️ ${spectatingPlayerId} is DEAD, switching to ${alivePlayers[0].name}`);
            setSpectatingPlayerId(alivePlayers[0].id);
          }
        }
      }

      // Camera update for non-spectators (playing mode)
      if (!isSpectating && playerId) {
        const targetBlobs = newBlobs.filter((b: Blob) => b.playerId === playerId);
        if (targetBlobs.length > 0) {
          const avgX = targetBlobs.reduce((sum: number, b: Blob) => sum + b.x, 0) / targetBlobs.length;
          const avgY = targetBlobs.reduce((sum: number, b: Blob) => sum + b.y, 0) / targetBlobs.length;
          const totalMass = targetBlobs.reduce((sum: number, b: Blob) => sum + b.mass, 0);
          
          const zoom = Math.max(0.2, Math.min(1.5, 200 / Math.sqrt(totalMass)));
          setCamera({ x: avgX, y: avgY, zoom });
        }
      }
      // Spectator camera update handled by separate useEffect
    });

    socket.on('gameEnd', (result: GameEndResult) => {
      console.log('Game ended:', result);
      setGameEnd(result);
      
      const isWinner = result.winnerId === playerId;
      
      // Check if I'm the winner - fetch payout info
      if (isWinner) {
        console.log('🏆 I won! Checking for payout transaction...');
        // Give server a moment to process payout, then fetch transaction
        setTimeout(async () => {
          try {
            const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
            const response = await fetch(`${serverUrl}/api/transactions?limit=1`);
            const data = await response.json();
            
            if (data.transactions && data.transactions.length > 0) {
              const latestTx = data.transactions[0];
              // Check if this transaction is for me
              const myWallet = localStorage.getItem('playerWallet');
              if (latestTx.walletAddress === myWallet && latestTx.winnerId === playerId) {
                setWinnerPayout({
                  amount: latestTx.amountUSDC,
                  txSignature: latestTx.txSignature
                });
              }
            }
          } catch (error) {
            console.error('Failed to fetch payout info:', error);
          }
        }, 3000); // Wait 3 seconds for payout to process
      }
      
      // Don't clear localStorage yet - need it for game end screen
      
      // Clear any existing timer
      if (autoRedirectTimerRef.current) {
        clearTimeout(autoRedirectTimerRef.current);
      }
      
      // Only auto-redirect NON-winners (losers and spectators)
      if (!isWinner) {
        console.log('Auto-redirecting non-winner to lobby after 10 seconds');
      autoRedirectTimerRef.current = setTimeout(() => {
        localStorage.clear();
        window.location.href = '/';
      }, 10000);
      } else {
        console.log('🏆 Winner - no auto-redirect, let them enjoy the moment!');
      }
    });

    socket.on('error', ({ message }) => {
      console.error('❌ Server error:', message);
      
      // Don't redirect if we're trying to spectate - show toast instead
      if (spectateMode === 'true') {
        setToastMessage({ message: `Cannot spectate: ${message}`, type: 'error' });
        console.log('Spectate failed, staying on page to show error');
        return;
      }
      
      socket.disconnect();
      localStorage.clear();
      // Immediate redirect for non-spectator errors
      window.location.href = '/';
    });

    return () => {
      console.log('🔌 Disconnecting socket and cleaning up');
      
      // Clear auto-redirect timer if it exists
      if (autoRedirectTimerRef.current) {
        clearTimeout(autoRedirectTimerRef.current);
        autoRedirectTimerRef.current = null;
      }
      
      // Remove from spectators if we were spectating
      if (isSpectating && gameIdRef.current) {
        socket.emit('leaveSpectate', { gameId: gameIdRef.current });
      }
      
      socket.disconnect();
    };
  }, [router]);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // SPECTATOR CAMERA LOCK - Updates whenever blobs or spectated player changes
  useEffect(() => {
    if (!isSpectating || !spectatingPlayerId || blobs.length === 0) return;

    const targetBlobs = blobs.filter(b => b.playerId === spectatingPlayerId);
    
    if (targetBlobs.length > 0) {
      const avgX = targetBlobs.reduce((sum, b) => sum + b.x, 0) / targetBlobs.length;
      const avgY = targetBlobs.reduce((sum, b) => sum + b.y, 0) / targetBlobs.length;
      const totalMass = targetBlobs.reduce((sum, b) => sum + b.mass, 0);
      const zoom = Math.max(0.2, Math.min(1.5, 200 / Math.sqrt(totalMass)));
      
      setCamera({ x: avgX, y: avgY, zoom });
    }
  }, [blobs, isSpectating, spectatingPlayerId]);

  // Update mouse screen position on move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      
      mouseScreenPosRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Movement system
  useEffect(() => {
    const interval = setInterval(() => {
      const socket = socketRef.current;
      const canvas = canvasRef.current;
      
      if (!isSpectating && gameStartedRef.current && socket?.connected && gameIdRef.current && playerIdRef.current && canvas) {
        const cam = cameraRef.current;
        const screenPos = mouseScreenPosRef.current;
        
        const worldX = cam.x + (screenPos.x - canvas.width / 2) / cam.zoom;
        const worldY = cam.y + (screenPos.y - canvas.height / 2) / cam.zoom;
        
        socket.emit('playerMove', {
          playerId: playerIdRef.current,
          x: worldX,
          y: worldY,
          gameId: gameIdRef.current,
        });
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isSpectating]);

  // Handle keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Spectator controls - cycle through players (ALWAYS available when spectating)
      if (isSpectating) {
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
          e.preventDefault();
          console.log('⌨️ Arrow key pressed, isSpectating:', isSpectating, 'spectatingPlayerId:', spectatingPlayerId);
          
          const alivePlayers = leaderboard.filter(p => p.mass > 0);
          console.log(`Found ${alivePlayers.length} alive players to spectate`);
          
          if (alivePlayers.length === 0) {
            console.log('❌ No alive players to switch to');
            return;
          }
          
          const currentIndex = alivePlayers.findIndex(p => p.id === spectatingPlayerId);
          console.log(`Current spectating index: ${currentIndex}`);
          
          let newIndex;
          if (e.code === 'ArrowRight') {
            newIndex = (currentIndex + 1) % alivePlayers.length;
          } else {
            newIndex = (currentIndex - 1 + alivePlayers.length) % alivePlayers.length;
          }
          
          const newPlayer = alivePlayers[newIndex];
          console.log(`✅ MANUAL SWITCH via keyboard to ${newPlayer.name} (${newPlayer.id})`);
          console.log(`   Previous: ${spectatingPlayerId}, New: ${newPlayer.id}`);
          setSpectatingPlayerId(newPlayer.id);
        }
        return; // Don't process game controls if spectating
      }

      // Game controls (only if NOT spectating)

      if (!socketRef.current || !gameIdRef.current || !playerIdRef.current) return;
      if (!canvasRef.current) return;

      if (e.code === 'Space') {
        e.preventDefault();
        
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
  }, [isSpectating, spectatingPlayerId, leaderboard, blobs]);

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
      // Clear canvas with dark theme
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Save context
      ctx.save();

      // Apply camera transform
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      // Draw grid (subtle)
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

      // Draw shrinking map boundaries (red danger zone outside)
      if (mapBounds && (mapBounds.minX > 0 || mapBounds.maxX < 5000 || mapBounds.minY > 0 || mapBounds.maxY < 5000)) {
        // Red tint for danger zone
        ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
        
        // Left danger zone
        if (mapBounds.minX > 0) {
          ctx.fillRect(0, 0, mapBounds.minX, 5000);
        }
        // Right danger zone
        if (mapBounds.maxX < 5000) {
          ctx.fillRect(mapBounds.maxX, 0, 5000 - mapBounds.maxX, 5000);
        }
        // Top danger zone
        if (mapBounds.minY > 0) {
          ctx.fillRect(mapBounds.minX, 0, mapBounds.maxX - mapBounds.minX, mapBounds.minY);
        }
        // Bottom danger zone
        if (mapBounds.maxY < 5000) {
          ctx.fillRect(mapBounds.minX, mapBounds.maxY, mapBounds.maxX - mapBounds.minX, 5000 - mapBounds.maxY);
        }
        
        // Draw boundary lines
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 6 / camera.zoom;
        ctx.setLineDash([]);
        ctx.strokeRect(mapBounds.minX, mapBounds.minY, mapBounds.maxX - mapBounds.minX, mapBounds.maxY - mapBounds.minY);
      }

      // Draw pellets as diamonds
      pellets.forEach(pellet => {
        const pelletSize = 3; // Reduced to 50% of previous size
        
        ctx.fillStyle = pellet.color || '#4ECDC4';
        ctx.beginPath();
        ctx.moveTo(pellet.x, pellet.y - pelletSize); // Top
        ctx.lineTo(pellet.x + pelletSize, pellet.y); // Right
        ctx.lineTo(pellet.x, pellet.y + pelletSize); // Bottom
        ctx.lineTo(pellet.x - pelletSize, pellet.y); // Left
        ctx.closePath();
        ctx.fill();
        
        // Add slight glow with pellet's color
        ctx.strokeStyle = pellet.color || '#4ECDC4';
        ctx.lineWidth = 0.5 / camera.zoom;
        ctx.stroke();
      });

      const now = Date.now();
      
      // Clean up old animations (400ms for kill, 300ms for shrink, 500ms for merge)
      setKillAnimations(prev => prev.filter(a => now - a.startTime < 400));
      setShrinkAnimations(prev => prev.filter(a => now - a.startTime < 300));
      setMergeAnimations(prev => prev.filter(a => now - a.startTime < 500));

      // Draw blobs
      blobs.forEach(blob => {
        const baseRadius = Math.sqrt(blob.mass / Math.PI) * 3;
        let radius = baseRadius;
        
        // Check for merge animation
        const mergeAnim = mergeAnimations.find(a => a.blobId === blob.id);
        if (mergeAnim) {
          const elapsed = now - mergeAnim.startTime;
          const progress = Math.min(1, elapsed / 500);
          // Shrink then grow: 1.0 -> 0.7 -> 1.0
          const scale = 1 - 0.3 * Math.sin(progress * Math.PI);
          radius = baseRadius * scale;
          
          // Neon glow effect during merge
          ctx.save();
          const glowAlpha = Math.sin(progress * Math.PI) * 0.6;
          ctx.globalAlpha = glowAlpha;
          ctx.shadowBlur = 30 / camera.zoom;
          ctx.shadowColor = '#00F0FF'; // Neon blue
          ctx.fillStyle = '#00F0FF';
          ctx.beginPath();
          ctx.arc(blob.x, blob.y, radius * 1.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Check for shrink animation (victim being eaten)
        const shrinkAnim = shrinkAnimations.find(a => a.blobId === blob.id);
        if (shrinkAnim) {
          const elapsed = now - shrinkAnim.startTime;
          const progress = Math.min(1, elapsed / 300);
          // Shrink to 0 with fade
          radius = baseRadius * (1 - progress);
          
          // Fade out the blob
          ctx.globalAlpha = 1 - progress;
        }
        
        // Check for kill animation (sun rays + absorption)
        const killAnim = killAnimations.find(a => a.blobId === blob.id);
        if (killAnim) {
          const elapsed = now - killAnim.startTime;
          const progress = Math.min(1, elapsed / 400);
          
          // Killer blob shrinks then grows (absorption effect)
          const absorptionScale = 1 - 0.2 * Math.sin(progress * Math.PI);
          radius = baseRadius * absorptionScale;
          
          // Fade in then fade out
          let alpha;
          if (progress < 0.2) {
            // Fade in
            alpha = progress / 0.2;
          } else {
            // Fade out
            alpha = 1 - ((progress - 0.2) / 0.8);
          }
          
          // Draw 8 clean neon sun rays with gap from blob
          ctx.save();
          ctx.globalAlpha = alpha * 0.9;
          ctx.shadowBlur = 10 / camera.zoom;
          ctx.shadowColor = '#39FF14';
          ctx.strokeStyle = '#39FF14';
          ctx.lineWidth = 2 / camera.zoom;
          ctx.lineCap = 'round';
          
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const rayStart = radius * 1.25; // Gap between blob and rays
            const rayEnd = radius * 1.65;   // Shorter, cleaner rays
            
            ctx.beginPath();
            ctx.moveTo(
              blob.x + Math.cos(angle) * rayStart,
              blob.y + Math.sin(angle) * rayStart
            );
            ctx.lineTo(
              blob.x + Math.cos(angle) * rayEnd,
              blob.y + Math.sin(angle) * rayEnd
            );
            ctx.stroke();
          }
          
          ctx.restore();
        }
        
        // Draw blob (only if not completely shrunk)
        if (radius > 0) {
          ctx.fillStyle = blob.color;
          ctx.beginPath();
          ctx.arc(blob.x, blob.y, radius, 0, Math.PI * 2);
          ctx.fill();

          // Draw border
          ctx.strokeStyle = blob.playerId === myPlayerId ? '#FFD700' : (isSpectating && blob.playerId === spectatingPlayerId ? '#4ECDC4' : '#333');
          ctx.lineWidth = 3 / camera.zoom;
          ctx.stroke();
        }
        
        // Reset alpha after shrink animation
        ctx.globalAlpha = 1;

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

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [blobs, pellets, camera, killAnimations, mergeAnimations, shrinkAnimations, leaderboard, myPlayerId, isSpectating, spectatingPlayerId]);

  // Handle back button / ESC to leave lobby - MUST BE BEFORE EARLY RETURNS
  useEffect(() => {
    if (!gameStarted) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Backspace' || e.key === 'Escape') {
          // Leave lobby properly
          leaveLobby();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [gameStarted, router]);

  // Function to leave lobby - MUST BE BEFORE EARLY RETURNS
  const leaveLobby = () => {
    console.log('👋 Leaving lobby, emitting playerLeaveLobby event');
    
    const playerId = localStorage.getItem('playerId');
    
    if (socketRef.current && playerId) {
      // Notify server we're leaving
      socketRef.current.emit('playerLeaveLobby', { playerId });
      
      // Small delay to let server process
      setTimeout(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
        localStorage.clear();
    router.push('/');
      }, 100);
    } else {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      localStorage.clear();
      router.push('/');
    }
  };

  if (gameEnd) {
    const myStats = gameEnd.playerStats[myPlayerId];
    const myRanking = gameEnd.finalRankings.findIndex(r => r.id === myPlayerId) + 1;
    const isWinner = gameEnd.winnerId === myPlayerId;

    // Confetti pieces (simple, clean)
    const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 2 + Math.random() * 2,
      color: ['#39FF14', '#00F0FF', '#BC13FE', '#FFD700'][Math.floor(Math.random() * 4)]
    }));

    // Generate share tweet
    const generateTweet = () => {
      const stats = myStats || { pelletsEaten: 0, cellsEaten: 0, maxMass: 0, timeSurvived: 0 };
      const payoutAmount = winnerPayout?.amount || 1;
      const solscanLink = winnerPayout?.txSignature 
        ? `\nhttps://solscan.io/tx/${winnerPayout.txSignature}`
        : '';
      
      const tweetText = isWinner
        ? `🏆 Just won $${payoutAmount} USDC on @agarfi_dev!\n\n` +
          `📊 Stats:\n` +
          `• Rank: #${myRanking}\n` +
          `• Food Eaten: ${stats.pelletsEaten}\n` +
          `• Cells Eaten: ${stats.cellsEaten}\n` +
          `• Max Mass: ${Math.floor(stats.maxMass)}\n` +
          `• Survived: ${Math.floor(stats.timeSurvived)}s\n\n` +
          `Play free, win crypto 👉 https://agarfi.io\n` +
          `Join community: https://x.com/i/communities/1989932677966041578${solscanLink}\n\n` +
          `@osknyo_dev`
        : `Just played @agarfi_dev - ranked #${myRanking}!\n\n` +
          `📊 ${stats.pelletsEaten} food • ${stats.cellsEaten} cells • ${Math.floor(stats.maxMass)} mass\n\n` +
          `Free to play, winners earn USDC 💰\n` +
          `https://agarfi.io\n\n` +
          `@osknyo_dev`;
      
      const encodedTweet = encodeURIComponent(tweetText);
      window.open(`https://twitter.com/intent/tweet?text=${encodedTweet}`, '_blank');
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-cyber-darker to-cyber-dark flex items-center justify-center p-4 md:p-8 relative overflow-hidden">
        {/* Confetti (Winners Only) */}
        {isWinner && (
          <div className="fixed inset-0 pointer-events-none overflow-hidden">
            {confettiPieces.map(piece => (
              <motion.div
                key={piece.id}
                initial={{ y: -20, x: `${piece.left}vw`, opacity: 1, rotate: 0 }}
                animate={{ 
                  y: '110vh',
                  rotate: 360 * 3,
                  opacity: [1, 1, 0.5, 0]
                }}
                transition={{
                  duration: piece.duration,
                  delay: piece.delay,
                  ease: 'linear'
                }}
                className="absolute w-2 h-2 md:w-3 md:h-3"
                style={{ 
                  backgroundColor: piece.color,
                  left: 0
                }}
              />
            ))}
          </div>
        )}

        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', duration: 0.6 }}
          className="max-w-2xl w-full bg-cyber-dark/50 backdrop-blur-lg border border-neon-green/30 rounded-2xl p-6 md:p-8 relative z-10"
        >
          {/* Floating Trophy (Winners Only) */}
          {isWinner && (
            <motion.div
              initial={{ y: -100, scale: 0 }}
              animate={{ y: 0, scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5, duration: 1 }}
              className="absolute -top-12 md:-top-16 left-1/2 -translate-x-1/2 text-6xl md:text-8xl"
            >
              <motion.div
                animate={{ 
                  y: [0, -10, 0],
                  rotate: [0, 5, 0, -5, 0]
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
              >
                🏆
              </motion.div>
            </motion.div>
          )}

          <h2 className="text-3xl md:text-4xl font-black text-center mb-4 md:mb-6 mt-4">
            {isWinner ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.3 }}
              >
                <span className="gradient-text text-glow">
                  VICTORY!
                </span>
              </motion.div>
            ) : (
              <span className="text-white">Game Over</span>
            )}
          </h2>

          {/* Winner Payout Banner */}
          {isWinner && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="bg-gradient-to-r from-neon-green/20 to-neon-blue/20 border-2 border-neon-green/50 rounded-xl p-4 md:p-6 mb-6 text-center"
            >
              <div className="text-4xl md:text-5xl font-black text-neon-green mb-2">
                +${winnerPayout?.amount || 1} USDC
              </div>
              <div className="text-sm text-gray-400 mb-3">
                {winnerPayout?.txSignature ? '✅ Sent to your wallet' : '⏳ Processing payout...'}
              </div>
              {winnerPayout?.txSignature && (
                <a
                  href={`https://solscan.io/tx/${winnerPayout.txSignature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs text-neon-blue hover:text-neon-green transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View on Solscan
                </a>
              )}
            </motion.div>
          )}

          <div className="text-center mb-6 md:mb-8">
            <div className="text-5xl md:text-6xl font-black text-neon-green mb-2">
              #{myRanking}
            </div>
            <div className="text-gray-400">Final Placement</div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-cyber-darker rounded-lg p-4 border border-neon-green/30">
              <div className="text-sm text-gray-400">Food Eaten</div>
              <div className="text-2xl font-bold text-neon-green">{myStats?.pelletsEaten || 0}</div>
            </div>
            <div className="bg-cyber-darker rounded-lg p-4 border border-neon-pink/30">
              <div className="text-sm text-gray-400">Cells Eaten</div>
              <div className="text-2xl font-bold text-neon-pink">{myStats?.cellsEaten || 0}</div>
            </div>
            <div className="bg-cyber-darker rounded-lg p-4 border border-neon-blue/30">
              <div className="text-sm text-gray-400">Highest Mass</div>
              <div className="text-2xl font-bold text-neon-blue">{Math.floor(myStats?.maxMass || 0)}</div>
            </div>
            <div className="bg-cyber-darker rounded-lg p-4 border border-neon-purple/30">
              <div className="text-sm text-gray-400">Time Survived</div>
              <div className="text-2xl font-bold text-neon-purple">
                {Math.floor(myStats?.timeSurvived || 0)}s
              </div>
            </div>
            <div className="bg-cyber-darker rounded-lg p-4 border border-neon-green/30">
              <div className="text-sm text-gray-400">Leader Time</div>
              <div className="text-2xl font-bold text-neon-green">
                {Math.floor(myStats?.leaderTime || 0)}s
              </div>
            </div>
            <div className="bg-cyber-darker rounded-lg p-4 border border-neon-pink/30">
              <div className="text-sm text-gray-400">Best Rank</div>
              <div className="text-2xl font-bold text-neon-pink">
                #{myStats?.bestRank === 999 ? '-' : myStats?.bestRank}
              </div>
            </div>
          </div>

          {/* Final Rankings */}
          <div className="mb-8">
            <h3 className="text-xl font-bold mb-4 text-neon-green">Final Rankings</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {gameEnd.finalRankings.map((player, index) => (
                <div
                  key={player.id}
                  className={`flex justify-between items-center p-3 rounded ${
                    player.id === myPlayerId ? 'bg-neon-green/20 border border-neon-green/50' : 'bg-cyber-darker border border-neon-green/10'
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

          {/* Share on X Button */}
          {isWinner && (
            <motion.button
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.7 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={generateTweet}
              className="w-full py-4 md:py-5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-xl font-bold text-white transition-all mb-4 flex items-center justify-center gap-2 text-base md:text-lg shadow-lg"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Share Win on 𝕏
              <span className="text-xl">🚀</span>
            </motion.button>
          )}

          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: isWinner ? 0.9 : 0.3 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              console.log('Return to lobby clicked (game end)');
              
              // Clear auto-redirect timer
              if (autoRedirectTimerRef.current) {
                clearTimeout(autoRedirectTimerRef.current);
                autoRedirectTimerRef.current = null;
              }
              
              if (socketRef.current) {
                socketRef.current.disconnect();
              }
              localStorage.clear();
              window.location.href = '/';
            }}
            className="w-full py-4 bg-gradient-to-r from-neon-green to-neon-blue hover:from-neon-green hover:to-neon-blue rounded-lg font-bold text-black transition-all"
          >
            Return to Lobby
          </motion.button>
          {!isWinner && (
           <p className="text-xs text-gray-500 text-center mt-3">
             Auto-redirecting in a few seconds...
           </p>
          )}
        </motion.div>
      </div>
    );
  }

  // Show lobby waiting screen if game hasn't started
  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cyber-darker to-cyber-dark flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-cyber-dark/50 backdrop-blur-lg border border-neon-green/30 rounded-2xl p-8 text-center">
          <div className="mb-6">
            <div className="text-6xl mb-4">⏳</div>
            <h2 className="text-3xl font-bold text-white mb-2">Waiting for Game</h2>
            <p className="text-gray-400">Get ready to play!</p>
          </div>

          {/* Winner Reward Banner */}
          <div className="bg-gradient-to-r from-neon-green/20 to-neon-blue/20 border border-neon-green/50 rounded-xl p-4 mb-6">
            <div className="text-2xl font-black text-neon-green mb-1">
              💰 Winner Gets $1 USDC
            </div>
            <div className="text-xs text-gray-400">
              Automatically sent to your wallet
            </div>
          </div>

          <div className="bg-cyber-darker rounded-lg p-6 mb-6 border border-neon-green/30">
            <div className="text-4xl font-black text-neon-green mb-2">
              {lobbyStatus.players}/{lobbyStatus.max}
            </div>
            <div className="text-sm text-gray-400">Players in Lobby</div>
          </div>

          {lobbyStatus.countdown !== null && lobbyStatus.countdown > 0 && (
            <div className="bg-neon-green/20 border border-neon-green/50 rounded-lg p-4 mb-6">
              <div className="text-2xl font-bold text-neon-green mb-1">
                Starting in {lobbyStatus.countdown}s
              </div>
              <div className="text-sm text-gray-400">Get ready!</div>
            </div>
          )}

          {lobbyStatus.players < 10 && (
            <div className="bg-neon-blue/20 border border-neon-blue/50 rounded-lg p-4 mb-6">
              <div className="text-sm text-neon-blue">
                Waiting for {10 - lobbyStatus.players} more player(s)...
              </div>
            </div>
          )}

          {/* Leave Lobby Button */}
          <button
            onClick={leaveLobby}
            className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 rounded-xl font-bold transition-all mb-4"
          >
            ← Leave Lobby
          </button>

          <div className="text-xs text-gray-500">
            <p>Press <kbd className="px-2 py-0.5 bg-gray-700 rounded">ESC</kbd> or <kbd className="px-2 py-0.5 bg-gray-700 rounded">Backspace</kbd> to leave</p>
          </div>
        </div>
      </div>
    );
  }

  const myMass = blobs
    .filter(b => b.playerId === myPlayerId)
    .reduce((sum, b) => sum + b.mass, 0);

  return (
    <div className="relative w-screen h-screen bg-gray-900">
      <canvas ref={canvasRef} className="absolute inset-0" />
      
      {/* Spectator UI - Top Center */}
      {isSpectating && (() => {
        const spectatedPlayer = leaderboard.find(p => p.id === spectatingPlayerId);
        
        const switchPlayer = (direction: 'left' | 'right') => {
          const alivePlayers = leaderboard.filter(p => p.mass > 0);
          if (alivePlayers.length === 0) return;
          
          const currentIndex = alivePlayers.findIndex(p => p.id === spectatingPlayerId);
          let newIndex;
          if (direction === 'right') {
            newIndex = (currentIndex + 1) % alivePlayers.length;
          } else {
            newIndex = (currentIndex - 1 + alivePlayers.length) % alivePlayers.length;
          }
          const newPlayer = alivePlayers[newIndex];
          console.log(`🔄 MANUAL SWITCH via button to ${newPlayer.name} (${newPlayer.id})`);
          console.log(`   Previous: ${spectatingPlayerId}, New: ${newPlayer.id}`);
          setSpectatingPlayerId(newPlayer.id);
        };
        
        // Show UI even if player not found yet (loading state)
        return (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex flex-col gap-3">
            {/* Spectator Info Card */}
            <div className="flex items-center gap-2">
              {/* Previous Player Button */}
              <button
                onClick={() => switchPlayer('left')}
                className="w-10 h-10 bg-gray-700/90 hover:bg-gray-600 backdrop-blur-md rounded-lg border border-gray-600 shadow-lg transition-all hover:scale-110 active:scale-95 flex items-center justify-center"
                aria-label="Previous player"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              {/* Spectator Info */}
              <div className="bg-gray-800/90 backdrop-blur-md rounded-lg px-6 py-3 border border-gray-700 shadow-xl">
                <div className="text-center">
                  <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">Spectating</div>
                  {spectatedPlayer ? (
                    <>
                      <div className="text-lg font-bold text-white">{spectatedPlayer.name}</div>
                      <div className="text-sm text-gray-400">{Math.floor(spectatedPlayer.mass)} mass</div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-400">Loading...</div>
                  )}
                  <div className="text-xs text-gray-500 mt-2 hidden md:block">← → to switch players</div>
                </div>
              </div>
              
              {/* Next Player Button */}
              <button
                onClick={() => switchPlayer('right')}
                className="w-10 h-10 bg-gray-700/90 hover:bg-gray-600 backdrop-blur-md rounded-lg border border-gray-600 shadow-lg transition-all hover:scale-110 active:scale-95 flex items-center justify-center"
                aria-label="Next player"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            
            {/* Return to Lobby Button */}
          <button
            onClick={() => {
              console.log('🏠 Return to lobby clicked (spectator mode)');
              console.log('Current gameId:', gameIdRef.current);
              console.log('Socket connected:', socketRef.current?.connected);
              
              // Emit leave spectate event and wait for server to process
              if (socketRef.current && gameIdRef.current) {
                console.log('📤 Emitting leaveSpectate for game:', gameIdRef.current);
                socketRef.current.emit('leaveSpectate', { gameId: gameIdRef.current });
                
                // Wait for server to process (200ms should be enough)
                setTimeout(() => {
                  console.log('⏱️ Delay complete, disconnecting socket');
                  if (socketRef.current) {
                    socketRef.current.disconnect();
                  }
                  localStorage.clear();
                  window.location.href = '/';
                }, 200);
              } else {
                console.warn('⚠️ No gameId or socket, disconnecting immediately');
                if (socketRef.current) {
                  socketRef.current.disconnect();
                }
                localStorage.clear();
                window.location.href = '/';
              }
            }}
              className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold px-6 py-3 rounded-lg shadow-lg border border-red-400/50 transition-all hover:scale-105 active:scale-95"
            >
              ← Return to Lobby
            </button>
          </div>
        );
      })()}

      {/* Leaderboard - Top Left (Desktop Only) */}
      {leaderboardVisible && !isMobile && (
        <div className="absolute top-4 left-4 bg-gray-800/90 backdrop-blur-md rounded-xl border border-gray-700 shadow-xl overflow-hidden w-64">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 flex justify-between items-center">
            <h3 className="text-white font-bold text-sm uppercase tracking-wide">Leaderboard</h3>
            <button
              onClick={() => setLeaderboardVisible(false)}
              className="text-white/70 hover:text-white transition-colors"
              aria-label="Hide leaderboard"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-3 space-y-1 max-h-80 overflow-y-auto">
            {leaderboard.slice(0, 10).map((entry, index) => {
              const isMe = entry.id === myPlayerId;
              const isSpectated = entry.id === spectatingPlayerId;
              return (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
                    isMe 
                      ? 'bg-yellow-500/20 border border-yellow-500/50' 
                      : isSpectated
                      ? 'bg-blue-500/20 border border-blue-500/50'
                      : 'bg-gray-700/30 hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${
                      index === 0 ? 'text-yellow-400' : 
                      index === 1 ? 'text-gray-300' : 
                      index === 2 ? 'text-orange-400' : 
                      'text-gray-400'
                    }`}>
                      #{index + 1}
                    </span>
                    <span className={`text-sm truncate max-w-[120px] ${
                      isMe ? 'text-yellow-400 font-bold' : 
                      isSpectated ? 'text-blue-400 font-bold' : 
                      'text-white'
                    }`}>
                      {entry.name}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-blue-400">
                    {Math.floor(entry.mass)}
                  </span>
                </div>
              );
            })}
          </div>
          {spectatorCount > 0 && (
            <div className="px-4 py-2 bg-gray-900/50 border-t border-gray-700">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Spectators</span>
                <span className="text-blue-400 font-semibold">👁️ {spectatorCount}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Show Leaderboard Button (Desktop Only) */}
      {!leaderboardVisible && !isMobile && (
        <button
          onClick={() => setLeaderboardVisible(true)}
          className="absolute top-4 left-4 bg-gray-800/90 backdrop-blur-md rounded-lg px-4 py-2 border border-gray-700 shadow-xl hover:bg-gray-700 transition-colors"
          aria-label="Show leaderboard"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* HUD Top Right - Mass & Timer */}
      <div className="absolute top-4 right-4 flex items-start gap-3">
        {/* Game Timer */}
        {timeRemaining !== null && (
          <div className="bg-gray-800/90 backdrop-blur-md rounded-xl border border-gray-700 shadow-xl px-5 py-3">
            <div className="text-center">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Time Left</div>
              <div className="text-xl font-bold text-white">
                {Math.floor(timeRemaining / 60000)}:{String(Math.floor((timeRemaining % 60000) / 1000)).padStart(2, '0')}
              </div>
            </div>
          </div>
        )}

        {/* Mass Counter */}
        {!isSpectating && myMass > 0 && (
          <div className="bg-gray-800/90 backdrop-blur-md rounded-xl border border-gray-700 shadow-xl px-5 py-3">
            <div className="text-center">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Your Mass</div>
              <div className="text-2xl font-black text-white">{Math.floor(myMass)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Boundary Warning */}
      {boundaryWarning && !isSpectating && (() => {
        const elapsed = Date.now() - boundaryWarning.startTime;
        const remaining = Math.max(0, 3 - Math.floor(elapsed / 1000));
        
        return (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="bg-red-600/90 backdrop-blur-md rounded-xl border-4 border-red-400 shadow-2xl px-12 py-8 animate-pulse">
              <div className="text-center">
                <div className="text-6xl font-black text-white mb-4">{remaining}</div>
                <div className="text-2xl font-bold text-white mb-2">⚠️ BOUNDARY WARNING ⚠️</div>
                <div className="text-lg text-white">Move away from edge or die!</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Minimap - Bottom Left */}
      <div className="absolute bottom-4 left-4 bg-gray-800/90 backdrop-blur-md rounded-xl border border-gray-700 shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-3 py-1.5 border-b border-gray-600">
          <h4 className="text-white font-semibold text-xs uppercase tracking-wide">Map</h4>
        </div>
        <div className="relative w-48 h-48 bg-gray-900 p-2">
          {blobs.map(blob => {
            const x = (blob.x / 5000) * 192;
            const y = (blob.y / 5000) * 192;
            const size = Math.max(3, Math.min(10, Math.sqrt(blob.mass) / 3));
            const isMe = blob.playerId === myPlayerId;
            const isSpectated = blob.playerId === spectatingPlayerId;
            
            return (
              <div
                key={blob.id}
                className="absolute rounded-full"
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  width: `${size}px`,
                  height: `${size}px`,
                  backgroundColor: isMe ? '#FFD700' : (isSpectated ? '#4ECDC4' : blob.color),
                  transform: 'translate(-50%, -50%)',
                  boxShadow: isMe ? '0 0 8px #FFD700' : isSpectated ? '0 0 8px #4ECDC4' : 'none',
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

      {/* Controls Overlay - Mobile Only */}
      {!isSpectating && (
        <div className="absolute bottom-4 right-4 flex gap-3 md:hidden">
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
            className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 rounded-full font-bold text-white shadow-lg border-2 border-green-400/50 active:scale-95 transition-transform"
          >
            <div className="text-xs">SPLIT</div>
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
            className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 rounded-full font-bold text-white shadow-lg border-2 border-blue-400/50 active:scale-95 transition-transform"
          >
            <div className="text-xs">EJECT</div>
          </button>
        </div>
      )}

      {/* Keyboard Controls Info - Desktop only */}
      {!isSpectating && (
        <div className="absolute bottom-4 right-4 bg-gray-800/90 backdrop-blur-md rounded-lg px-4 py-3 border border-gray-700 shadow-xl hidden md:block">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-gray-700 text-white rounded font-mono text-xs border border-gray-600">SPACE</kbd>
              <span className="text-gray-300">Split</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-gray-700 text-white rounded font-mono text-xs border border-gray-600">W</kbd>
              <span className="text-gray-300">Eject Mass</span>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 animate-slideIn">
          <div className={`bg-gradient-to-r ${
            toastMessage.type === 'error' ? 'from-red-500 to-rose-600' :
            toastMessage.type === 'success' ? 'from-green-500 to-emerald-600' :
            toastMessage.type === 'warning' ? 'from-yellow-500 to-orange-500' :
            'from-blue-500 to-cyan-500'
          } text-white px-6 py-4 rounded-lg shadow-2xl border border-white/20 backdrop-blur-md max-w-md`}>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                {toastMessage.type === 'error' && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {toastMessage.type === 'success' && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {toastMessage.type === 'warning' && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
                {toastMessage.type === 'info' && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{toastMessage.message}</p>
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
    </div>
  );
}
