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
  const [mounted, setMounted] = useState(false);

  const [blobs, setBlobs] = useState<Blob[]>([]);
  const [pellets, setPellets] = useState<Pellet[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [gameEnd, setGameEnd] = useState<GameEndResult | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [gameId, setGameId] = useState<string>('');
  const [camera, setCamera] = useState({ x: 2500, y: 2500, zoom: 1 });
  const [gameStarted, setGameStarted] = useState(false);
  const [lobbyStatus, setLobbyStatus] = useState({ players: 1, realPlayers: 1, max: 25, min: 10, countdown: null as number | null });
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
  const [winnerPayout, setWinnerPayout] = useState<{ amount: number; txSignature: string | null } | null>(null);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickBase, setJoystickBase] = useState({ x: 0, y: 0 }); // Where user first touched
  const [joystickHandle, setJoystickHandle] = useState({ x: 0, y: 0 }); // Current drag position
  const [minimapHidden, setMinimapHidden] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; username: string; message: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [currentUsername, setCurrentUsername] = useState('');

  // Ensure component only renders on client side
  useEffect(() => {
    setMounted(true);
  }, []);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch username and chat history from DB on mount
  useEffect(() => {
    const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    
    // Load username
    const walletAddress = localStorage.getItem('playerWallet');
    if (walletAddress) {
      fetch(`${serverUrl}/api/user/${walletAddress}`)
        .then(res => res.json())
        .then(data => {
          if (data.user && data.user.username) {
            setCurrentUsername(data.user.username);
          }
        })
        .catch(console.error);
    }
    
    // Load chat history
    fetch(`${serverUrl}/api/chat`)
      .then(res => res.json())
      .then(data => {
        if (data.messages && Array.isArray(data.messages)) {
          // Take last 100 messages
          const recentMessages = data.messages.slice(-100).map((msg: any) => ({
            id: msg._id || msg.timestamp?.toString() || Date.now().toString(),
            username: msg.username,
            message: msg.message,
            timestamp: msg.timestamp
          }));
          setChatMessages(recentMessages);
        }
      })
      .catch(console.error);
  }, []);

  const mousePosRef = useRef({ x: 2500, y: 2500 });
  const mouseScreenPosRef = useRef({ x: 0, y: 0 });
  const joystickPositionRef = useRef({ x: 0, y: 0 });
  const lastMovementDirectionRef = useRef({ x: 0, y: 0 }); // For split/eject on mobile
  const gameIdRef = useRef<string>('');
  const playerIdRef = useRef<string>('');
  const gameStartedRef = useRef<boolean>(false);
  const cameraRef = useRef(camera);
  const autoRedirectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMobileRef = useRef(false);

  // Update camera ref when camera changes
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  // Detect mobile on mount (use ref to avoid re-renders)
  useEffect(() => {
    isMobileRef.current = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }, []);
  
  // For rendering purposes (doesn't trigger camera updates)
  const isMobile = isMobileRef.current;

  useEffect(() => {
    const playerId = localStorage.getItem('playerId');
    const playerName = localStorage.getItem('playerName');
    const tier = localStorage.getItem('selectedTier');
    const walletAddress = localStorage.getItem('playerWallet');
    const existingGameId = localStorage.getItem('currentGameId');
    const spectateMode = localStorage.getItem('spectateMode');

    // Game page initialization

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
        // Join lobby using x402-verified lobby token
        const lobbyToken = localStorage.getItem('lobbyToken');
        
        if (!lobbyToken) {
          console.error('❌ No lobby token found - redirecting to homepage');
          router.push('/');
          return;
        }
        
        console.log('🎟️  Joining lobby with verified token');
        
        socket.emit('playerJoinLobby', { 
          lobbyToken
        });
        
        // Clear lobby token after use (one-time)
        localStorage.removeItem('lobbyToken');
        localStorage.removeItem('entryPaymentTx'); // Clean up old field
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

    socket.on('lobbyError', ({ message }) => {
      alert(`Unable to join: ${message}`);
      // Redirect back to homepage
      router.push('/');
    });

    socket.on('refundProcessed', ({ amount, tx }) => {
      alert(`✅ Refund processed: $${amount} USDC sent back to your wallet`);
    });

    socket.on('refundFailed', ({ error }) => {
      alert(`⚠️ Refund failed: ${error}. Please contact support.`);
    });

    // Listen for payout transaction signature from server
    socket.on('payoutReceived', ({ amount, txSignature }) => {
      setWinnerPayout({
        amount,
        txSignature
      });
    });

    socket.on('lobbyUpdate', ({ tier, playersLocked, realPlayerCount, maxPlayers, minPlayers, countdown, status }) => {
      const currentTier = localStorage.getItem('selectedTier');
      if (tier === currentTier) {
        setLobbyStatus({ 
          players: playersLocked, 
          realPlayers: realPlayerCount || playersLocked, // Use real player count for calculations
          max: maxPlayers, 
          min: minPlayers || 10, 
          countdown 
        });
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

    // Player elimination broadcast (for all players to see)
    socket.on('playerEliminatedBroadcast', ({ victimName, killerName, remainingPlayers }) => {
      // Shorten names if needed for mobile
      const shortVictim = victimName.length > 12 ? victimName.substring(0, 12) + '...' : victimName;
      const shortKiller = killerName.length > 12 ? killerName.substring(0, 12) + '...' : killerName;
      
      if (killerName === 'Boundary') {
        setToastMessage({ 
          message: `${shortVictim} out (${remainingPlayers} left)`, 
          type: 'warning' 
        });
      } else {
        setToastMessage({ 
          message: `${shortVictim} ← ${shortKiller} (${remainingPlayers} left)`, 
          type: 'info' 
        });
      }
    });

    // Global chat messages
    socket.on('chatMessage', (msg: { username: string; message: string }) => {
      setChatMessages(prev => {
        const newMessages = [...prev, {
        id: Date.now().toString(),
        username: msg.username,
          message: msg.message,
          timestamp: Date.now()
        }];
        // Keep only the most recent 100 messages
        return newMessages.slice(-100);
      });
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
          
          let zoom = Math.max(0.2, Math.min(1.5, 200 / Math.sqrt(totalMass)));
          
          // Platform-specific zoom adjustments
          if (isMobileRef.current) {
            // Mobile: zoom out 2x
            zoom = zoom * 0.5;
          } else {
            // Desktop: zoom out 1.5x
            zoom = zoom * 0.67;
          }
          
          setCamera({ x: avgX, y: avgY, zoom });
        }
      }
      // Spectator camera update handled by separate useEffect
    });

    socket.on('gameEnd', (result: GameEndResult) => {
      setGameEnd(result);
      
      const isWinner = result.winnerId === playerId;
      
      // Payout amount will be set via 'payoutReceived' event from server
      
      // Clear any existing timer
      if (autoRedirectTimerRef.current) {
        clearTimeout(autoRedirectTimerRef.current);
      }
      
      // Only auto-redirect NON-winners (losers and spectators)
      if (!isWinner) {
        autoRedirectTimerRef.current = setTimeout(() => {
          localStorage.clear();
          window.location.href = '/';
        }, 10000);
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

  // Auto-scroll chat to bottom only when opening chat
  useEffect(() => {
    if (showChat) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [showChat]);

  // SPECTATOR CAMERA LOCK - Smoothly interpolates to follow spectated player
  useEffect(() => {
    if (!isSpectating || !spectatingPlayerId || blobs.length === 0) return;

    const targetBlobs = blobs.filter(b => b.playerId === spectatingPlayerId);
    
    if (targetBlobs.length > 0) {
      const avgX = targetBlobs.reduce((sum, b) => sum + b.x, 0) / targetBlobs.length;
      const avgY = targetBlobs.reduce((sum, b) => sum + b.y, 0) / targetBlobs.length;
      const totalMass = targetBlobs.reduce((sum, b) => sum + b.mass, 0);
      let zoom = Math.max(0.2, Math.min(1.5, 200 / Math.sqrt(totalMass)));
      
      // Zoom out 2x for all platforms
      zoom = zoom * 0.5;
      
      // Smooth camera movement with lerp (linear interpolation) - reduces jitter
      const currentCam = cameraRef.current;
      const lerp = 0.15; // Smoothing factor (lower = smoother but slower)
      
      const smoothX = currentCam.x + (avgX - currentCam.x) * lerp;
      const smoothY = currentCam.y + (avgY - currentCam.y) * lerp;
      const smoothZoom = currentCam.zoom + (zoom - currentCam.zoom) * lerp;
      
      setCamera({ x: smoothX, y: smoothY, zoom: smoothZoom });
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
        
        let worldX, worldY;
        let shouldMove = false;
        
        // Mobile joystick movement
        if (isMobileRef.current) {
          if (joystickActive) {
            const pos = joystickPositionRef.current;
            const directionX = pos.x; // Already normalized
            const directionY = pos.y;
            
            worldX = cam.x + directionX * 1000;
            worldY = cam.y + directionY * 1000;
            
            // Store last direction for split/eject
            lastMovementDirectionRef.current = { x: directionX, y: directionY };
            shouldMove = true;
          }
        } else {
          // Desktop mouse movement (always active)
        const screenPos = mouseScreenPosRef.current;
        
          worldX = cam.x + (screenPos.x - canvas.width / 2) / cam.zoom;
          worldY = cam.y + (screenPos.y - canvas.height / 2) / cam.zoom;
        
          // Calculate direction vector for split/eject
          const dirX = screenPos.x - canvas.width / 2;
          const dirY = screenPos.y - canvas.height / 2;
          const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);
          if (magnitude > 0) {
            lastMovementDirectionRef.current = { x: dirX / magnitude, y: dirY / magnitude };
          }
          shouldMove = true;
        }
        
        // Only emit movement if we should move
        if (shouldMove) {
        socket.emit('playerMove', {
          playerId: playerIdRef.current,
          x: worldX,
          y: worldY,
          gameId: gameIdRef.current,
        });
        }
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isSpectating, joystickActive]);

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
      
      // Filter animations locally - don't call setState in render loop!
      const activeKillAnimations = killAnimations.filter(a => now - a.startTime < 400);
      const activeShrinkAnimations = shrinkAnimations.filter(a => now - a.startTime < 300);
      const activeMergeAnimations = mergeAnimations.filter(a => now - a.startTime < 500);

      // Sort blobs by mass (smallest to largest) so bigger blobs render on top
      const sortedBlobs = [...blobs].sort((a, b) => a.mass - b.mass);

      // Draw blobs
      sortedBlobs.forEach(blob => {
        const baseRadius = Math.sqrt(blob.mass / Math.PI) * 3;
        let radius = baseRadius;
        
        // Check for merge animation
        const mergeAnim = activeMergeAnimations.find(a => a.blobId === blob.id);
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
        const shrinkAnim = activeShrinkAnimations.find(a => a.blobId === blob.id);
        if (shrinkAnim) {
          const elapsed = now - shrinkAnim.startTime;
          const progress = Math.min(1, elapsed / 300);
          // Shrink to 0 with fade
          radius = baseRadius * (1 - progress);
          
          // Fade out the blob
          ctx.globalAlpha = 1 - progress;
        }
        
        // Check for kill animation (sun rays + absorption)
        const killAnim = activeKillAnimations.find(a => a.blobId === blob.id);
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

  // Cleanup old animations periodically (separate from render loop)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setKillAnimations(prev => prev.filter(a => now - a.startTime < 400));
      setShrinkAnimations(prev => prev.filter(a => now - a.startTime < 300));
      setMergeAnimations(prev => prev.filter(a => now - a.startTime < 500));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Handle back button / ESC to leave lobby or close chat - MUST BE BEFORE EARLY RETURNS
  useEffect(() => {
    if (!gameStarted) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (showChat) {
            setShowChat(false);
          } else {
            leaveLobby();
          }
        } else if (e.key === 'Backspace' && !showChat) {
          leaveLobby();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [gameStarted, showChat, router]);

  // Function to leave lobby - MUST BE BEFORE EARLY RETURNS
  const leaveLobby = () => {
    // Can't leave if countdown started (pot locked)
    if (lobbyStatus.countdown !== null && lobbyStatus.countdown > 0) {
      return; // Blocked - no refunds
    }
    
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
      
      // Use calculated payout amount (already set in gameEnd handler)
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
    const generateLobbyTweet = () => {
      // Calculate actual winner amount based on tier
      let rewardAmount = '1';
      if (typeof window !== 'undefined') {
        const tier = localStorage.getItem('selectedTier');
        if (tier === 'dream') {
          rewardAmount = process.env.NEXT_PUBLIC_DREAM_PAYOUT || '1';
        } else if (tier) {
          const entryFee = parseInt(tier);
          const realPlayers = lobbyStatus.realPlayers || 1;
          rewardAmount = (entryFee * realPlayers * 0.80).toFixed(2);
        }
      }
      
      const tweetText = `🎮 Join my AgarFi lobby NOW!\n\n` +
        `💰 Winner gets $${rewardAmount} USDC\n` +
        `👥 ${lobbyStatus.players}/${lobbyStatus.max} players\n` +
        `🔥 Compete for real prizes!\n\n` +
        `Join before it fills up 👇\n` +
        `https://agarfi.io\n\n` +
        `@osknyo_dev @agarfi_dev`;
      
      const encodedTweet = encodeURIComponent(tweetText);
      window.open(`https://twitter.com/intent/tweet?text=${encodedTweet}`, '_blank');
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-cyber-darker to-cyber-dark flex items-center justify-center p-4 md:p-8">
        <div className="max-w-md w-full bg-cyber-dark/50 backdrop-blur-lg border border-neon-green/30 rounded-2xl p-6 md:p-8 text-center">
          <div className="mb-6">
            <div className="text-6xl mb-4">⏳</div>
            <h2 className="text-3xl font-bold text-white mb-2">Waiting for Game</h2>
            <p className="text-gray-400">Get ready to play!</p>
          </div>

          {/* Winner Reward Banner */}
          <div className="bg-gradient-to-r from-neon-green/20 to-neon-blue/20 border border-neon-green/50 rounded-xl p-4 mb-6">
            <div className="text-2xl font-black text-neon-green mb-1">
              💰 Winner Gets ${(() => {
                if (typeof window === 'undefined') return '1.00';
                const tier = localStorage.getItem('selectedTier');
                if (tier === 'dream') {
                  return parseInt(process.env.NEXT_PUBLIC_DREAM_PAYOUT || '1').toFixed(2);
                } else if (tier) {
                  // Calculate 80% of pot (entry fee × REAL players only, bots don't pay!)
                  const entryFee = parseInt(tier);
                  const realPlayers = lobbyStatus.realPlayers || 1;
                  return (entryFee * realPlayers * 0.80).toFixed(2);
                }
                return '1.00';
              })()} USDC
            </div>
            <div className="text-xs text-gray-400">
              {(() => {
                if (typeof window === 'undefined') return 'Loading...';
                const tier = localStorage.getItem('selectedTier');
                if (tier === 'dream') {
                  return 'Free hourly game - Winner takes all';
                } else {
                  const realPlayers = lobbyStatus.realPlayers || 1;
                  const botCount = (lobbyStatus.players || 1) - realPlayers;
                  return `80% of pot (${realPlayers} paid player${realPlayers !== 1 ? 's' : ''}${botCount > 0 ? ` + ${botCount} bot${botCount > 1 ? 's' : ''}` : ''})`;
                }
              })()}
            </div>
          </div>

          <div className="bg-cyber-darker rounded-lg p-6 mb-6 border border-neon-green/30">
            <div className="text-4xl font-black text-neon-green mb-2">
              {lobbyStatus.players}/{lobbyStatus.max}
            </div>
            <div className="text-sm text-gray-400">Players in Lobby</div>
          </div>

          {lobbyStatus.countdown !== null && lobbyStatus.countdown > 0 && (
            <div className="bg-red-500/20 border-2 border-red-500/50 rounded-lg p-4 mb-6">
              <div className="text-2xl font-bold text-red-400 mb-2">
                Starting in {lobbyStatus.countdown}s
              </div>
              <div className="text-sm font-bold text-red-300">🔒 POT LOCKED - No Refunds!</div>
              <div className="text-xs text-gray-400 mt-1">Entry fee is non-refundable</div>
            </div>
          )}

          {lobbyStatus.players < lobbyStatus.min && (
            <div className="bg-neon-blue/20 border border-neon-blue/50 rounded-lg p-4 mb-4">
              <div className="text-sm text-neon-blue mb-3">
                Waiting for {lobbyStatus.min - lobbyStatus.players} more player(s)...
              </div>
              
              {/* Share on X Button */}
              <motion.button
                onClick={generateLobbyTweet}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-lg font-bold text-white transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Share on 𝕏 - Get More Players!
                <span className="text-lg">📢</span>
              </motion.button>
            </div>
          )}

          {/* Leave Lobby Button */}
          {lobbyStatus.countdown !== null && lobbyStatus.countdown > 0 ? (
            <div className="w-full py-3 bg-gray-600/50 border border-gray-500/50 text-gray-400 rounded-xl font-bold text-center mb-4 cursor-not-allowed">
              🔒 Locked - No Refunds
            </div>
          ) : (
            <button
              onClick={leaveLobby}
              className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 rounded-xl font-bold transition-all mb-4"
            >
              ← Leave Lobby & Get Refund
            </button>
          )}

          <div className="text-xs text-gray-500 text-center">
            {lobbyStatus.countdown !== null && lobbyStatus.countdown > 0 ? (
              <p className="text-red-400 font-bold">⚠️ No refunds after countdown starts</p>
            ) : (
              <p>Press <kbd className="px-2 py-0.5 bg-gray-700 rounded">ESC</kbd> or <kbd className="px-2 py-0.5 bg-gray-700 rounded">Backspace</kbd> to leave</p>
            )}
          </div>
        </div>

        {/* Chat Bubble */}
        <motion.button
          onClick={() => setShowChat(true)}
          className="fixed bottom-4 md:bottom-6 right-4 md:right-6 z-40 w-12 h-12 md:w-14 md:h-14 bg-gradient-to-r from-neon-blue to-neon-purple rounded-full shadow-2xl flex items-center justify-center"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {chatMessages.length > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold">
              {chatMessages.length > 9 ? '9+' : chatMessages.length}
            </div>
          )}
        </motion.button>

        {/* Chat Modal */}
        {showChat && (
          <div 
            className="fixed inset-0 z-50 flex items-end md:items-end md:justify-end p-2 md:p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowChat(false)}
          >
            <motion.div 
              className="w-full md:max-w-md bg-cyber-dark/95 backdrop-blur-xl border-2 border-neon-blue/50 rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden"
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-neon-blue to-neon-purple px-4 py-3 flex items-center justify-between">
                <h3 className="text-white font-bold text-base md:text-lg">Global Chat</h3>
                <button onClick={() => setShowChat(false)} className="text-white/70 hover:text-white transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="h-[350px] overflow-y-auto p-4 space-y-2 bg-cyber-darker/50">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-16 text-gray-500 text-sm">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p>Be the first to chat!</p>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className="bg-cyber-dark/50 rounded-lg p-2 border border-neon-blue/20">
                      <span className="text-neon-green font-bold text-xs">{msg.username}:</span>{' '}
                      <span className="text-gray-300 text-xs">{msg.message}</span>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-3 bg-cyber-dark border-t border-neon-blue/30">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && chatInput.trim()) {
                        if (socketRef.current && typeof window !== 'undefined') {
                          socketRef.current.emit('chatMessage', {
                            username: currentUsername || 'Anonymous',
                            message: chatInput.trim(),
                            walletAddress: localStorage.getItem('playerWallet') || null
                          });
                        }
                        setChatInput('');
                      }
                    }}
                    placeholder="Type a message..."
                    className="flex-1 bg-cyber-darker border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-neon-blue text-sm"
                  />
                  <button
                    onClick={() => {
                      if (chatInput.trim() && socketRef.current && typeof window !== 'undefined') {
                        socketRef.current.emit('chatMessage', {
                          username: currentUsername || 'Anonymous',
                          message: chatInput.trim(),
                          walletAddress: localStorage.getItem('playerWallet') || null
                        });
                        setChatInput('');
                      }
                    }}
                    className="px-6 py-3 bg-gradient-to-r from-neon-blue to-neon-purple rounded-lg text-white font-bold hover:opacity-90 transition-opacity text-sm"
                  >
                    Send
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    );
  }

  // Prevent SSR - only render on client
  if (!mounted) {
    return (
      <div className="relative w-screen h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
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
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex flex-col gap-3 z-50" style={{ pointerEvents: 'auto' }}>
            {/* Spectator Info Card */}
            <div className="flex items-center gap-2">
              {/* Previous Player Button */}
              <button
                onClick={() => switchPlayer('left')}
                onTouchStart={(e) => e.stopPropagation()}
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
                onTouchStart={(e) => e.stopPropagation()}
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
            onTouchStart={(e) => e.stopPropagation()}
              className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold px-6 py-3 rounded-lg shadow-lg border border-red-400/50 transition-all hover:scale-105 active:scale-95"
            >
              ← Return to Lobby
            </button>
          </div>
        );
      })()}

      {/* Leaderboard - Top Left (Mobile & Desktop) */}
      {leaderboardVisible && (
        <div className="absolute top-4 left-4 bg-gray-800/95 backdrop-blur-md rounded-xl border border-gray-700 shadow-xl overflow-hidden w-32 sm:w-40 md:w-56 z-40" style={{ pointerEvents: 'auto' }}>
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-3 md:px-4 py-1.5 md:py-2 flex justify-between items-center">
            <h3 className="text-white font-bold text-xs md:text-sm uppercase tracking-wide">Leaderboard</h3>
            <button
              onClick={() => setLeaderboardVisible(false)}
              onTouchStart={(e) => e.stopPropagation()}
              className="text-white/70 hover:text-white transition-colors"
              aria-label="Hide leaderboard"
            >
              <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-2 md:p-3 space-y-1 max-h-80 overflow-y-auto">
            {leaderboard.slice(0, 10).map((entry, index) => {
              const isMe = entry.id === myPlayerId;
              const isSpectated = entry.id === spectatingPlayerId;
              return (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between px-2 md:px-3 py-1.5 md:py-2 rounded-lg transition-all ${
                    isMe 
                      ? 'bg-yellow-500/20 border border-yellow-500/50' 
                      : isSpectated
                      ? 'bg-blue-500/20 border border-blue-500/50'
                      : 'bg-gray-700/30 hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <span className={`text-xs md:text-sm font-bold ${
                      index === 0 ? 'text-yellow-400' : 
                      index === 1 ? 'text-gray-300' : 
                      index === 2 ? 'text-orange-400' : 
                      'text-gray-400'
                    }`}>
                      #{index + 1}
                    </span>
                    <span className={`text-xs md:text-sm truncate max-w-[50px] sm:max-w-[70px] md:max-w-[100px] ${
                      isMe ? 'text-yellow-400 font-bold' : 
                      isSpectated ? 'text-blue-400 font-bold' : 
                      'text-white'
                    }`}>
                      {entry.name}
                    </span>
                  </div>
                  <span className="text-xs md:text-sm font-semibold text-blue-400 flex-shrink-0">
                    {Math.floor(entry.mass)}
                  </span>
                </div>
              );
            })}
          </div>
          {spectatorCount > 0 && (
            <div className="px-3 md:px-4 py-1.5 md:py-2 bg-gray-900/50 border-t border-gray-700">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Spectators</span>
                <span className="text-blue-400 font-semibold">👁️ {spectatorCount}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Show Leaderboard Button (Mobile & Desktop) */}
      {!leaderboardVisible && (
        <button
          onClick={() => setLeaderboardVisible(true)}
          onTouchStart={(e) => e.stopPropagation()}
          className="absolute top-4 left-4 bg-gray-800/90 backdrop-blur-md rounded-lg px-3 md:px-4 py-2 border border-gray-700 shadow-xl hover:bg-gray-700 transition-colors z-40"
          style={{ pointerEvents: 'auto' }}
          aria-label="Show leaderboard"
        >
          <svg className="w-4 h-4 md:w-5 md:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* HUD Top Right - Mass & Timer */}
      <div className="absolute top-4 right-4 left-auto flex items-start gap-2 md:gap-3 z-40" style={{ pointerEvents: 'auto' }}>
        {/* Game Timer */}
        {timeRemaining !== null && (
          <div className="bg-gray-800/90 backdrop-blur-md rounded-xl border border-gray-700 shadow-xl px-3 md:px-5 py-2 md:py-3">
            <div className="text-center">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Time Left</div>
              <div className="text-lg md:text-xl font-bold text-white">
                {Math.floor(timeRemaining / 60000)}:{String(Math.floor((timeRemaining % 60000) / 1000)).padStart(2, '0')}
              </div>
            </div>
          </div>
        )}

        {/* Mass Counter */}
        {!isSpectating && myMass > 0 && (
          <div className="bg-gray-800/90 backdrop-blur-md rounded-xl border border-gray-700 shadow-xl px-3 md:px-5 py-2 md:py-3">
            <div className="text-center">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Your Mass</div>
              <div className="text-xl md:text-2xl font-black text-white">{Math.floor(myMass)}</div>
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

      {/* Minimap - Bottom Left (with hide button on mobile) */}
      {!minimapHidden && (
        <div className="absolute bottom-4 left-4 bg-gray-800/90 backdrop-blur-md rounded-xl border border-gray-700 shadow-xl overflow-hidden z-40" style={{ pointerEvents: 'auto' }}>
          <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-3 py-1.5 border-b border-gray-600 flex justify-between items-center">
          <h4 className="text-white font-semibold text-xs uppercase tracking-wide">Map</h4>
            {isMobile && (
              <button
                onClick={() => setMinimapHidden(true)}
                onTouchStart={(e) => e.stopPropagation()}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
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
      )}

      {/* Show Minimap Button (Mobile Only, when hidden) */}
      {minimapHidden && isMobile && (
          <button
          onClick={() => setMinimapHidden(false)}
          onTouchStart={(e) => e.stopPropagation()}
          className="absolute bottom-4 left-4 bg-gray-800/90 backdrop-blur-md rounded-lg px-3 py-2 border border-gray-700 shadow-xl z-40"
          style={{ pointerEvents: 'auto' }}
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </button>
      )}

      {/* Mobile Controls */}
      {!isSpectating && isMobile && (
        <>
          {/* Floating Joystick Zone - Full Screen */}
          <div
            className="absolute inset-0 md:hidden z-30"
            style={{ touchAction: 'none', pointerEvents: joystickActive ? 'auto' : 'auto' }}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              setJoystickBase({ x: touch.clientX, y: touch.clientY });
              setJoystickHandle({ x: touch.clientX, y: touch.clientY });
              setJoystickActive(true);
            }}
            onTouchMove={(e) => {
              if (!joystickActive) return;
              
              const touch = e.touches[0];
              const deltaX = touch.clientX - joystickBase.x;
              const deltaY = touch.clientY - joystickBase.y;
              
              const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
              const maxRadius = 60;
              
              let handleX = touch.clientX;
              let handleY = touch.clientY;
              
              if (distance > maxRadius) {
                handleX = joystickBase.x + (deltaX / distance) * maxRadius;
                handleY = joystickBase.y + (deltaY / distance) * maxRadius;
              }
              
              setJoystickHandle({ x: handleX, y: handleY });
              
              const normalizedX = (handleX - joystickBase.x) / maxRadius;
              const normalizedY = (handleY - joystickBase.y) / maxRadius;
              joystickPositionRef.current = { x: normalizedX, y: normalizedY };
              lastMovementDirectionRef.current = { x: normalizedX, y: normalizedY };
            }}
            onTouchEnd={() => {
              setJoystickActive(false);
              joystickPositionRef.current = { x: 0, y: 0 };
            }}
          />
          
          {/* Visual Joystick (appears dynamically) */}
          {joystickActive && (
            <>
              <div
                className="absolute w-32 h-32 rounded-full bg-gray-800/40 backdrop-blur-sm border-2 border-gray-600/50 pointer-events-none z-40"
                style={{
                  left: joystickBase.x - 64,
                  top: joystickBase.y - 64
                }}
              />
              <div
                className="absolute w-16 h-16 rounded-full bg-gradient-to-br from-neon-green to-neon-blue border-2 border-white/50 shadow-lg pointer-events-none z-40"
                style={{
                  left: joystickHandle.x - 32,
                  top: joystickHandle.y - 32
                }}
              />
            </>
          )}

          {/* Action Buttons - Bottom Right (High z-index to prevent click-through) */}
          <div className="absolute bottom-4 right-4 flex gap-3 md:hidden z-50" style={{ pointerEvents: 'auto' }}>
            <button
              onPointerDown={(e) => {
                e.stopPropagation(); // Don't let click propagate to joystick zone
                e.preventDefault();
                if (!socketRef.current) return;
                
              const cam = cameraRef.current;
                const dir = lastMovementDirectionRef.current;
              
                // IMPORTANT: Use STORED direction, don't update movement
                // This ensures tapping button doesn't change where player is moving
                const worldX = cam.x + dir.x * 500;
                const worldY = cam.y + dir.y * 500;
              
              socketRef.current.emit('playerSplit', { 
                playerId: playerIdRef.current, 
                gameId: gameIdRef.current,
                targetX: worldX,
                targetY: worldY
              });
            }}
              className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full font-bold text-white shadow-lg border-2 border-green-400/50 active:scale-95 transition-transform"
          >
            <div className="text-xs">SPLIT</div>
          </button>
          <button
              onPointerDown={(e) => {
                e.stopPropagation(); // Don't let click propagate to joystick zone
                e.preventDefault();
                if (!socketRef.current) return;
              
              const cam = cameraRef.current;
                const dir = lastMovementDirectionRef.current;
              
                // IMPORTANT: Use STORED direction, don't update movement
                // This ensures tapping button doesn't change where player is moving
                const worldX = cam.x + dir.x * 500;
                const worldY = cam.y + dir.y * 500;
              
              socketRef.current.emit('playerEject', { 
                playerId: playerIdRef.current, 
                gameId: gameIdRef.current,
                targetX: worldX,
                targetY: worldY
              });
            }}
              className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full font-bold text-white shadow-lg border-2 border-blue-400/50 active:scale-95 transition-transform"
          >
            <div className="text-xs">EJECT</div>
          </button>
        </div>
        </>
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
        <div className="fixed top-16 left-1/2 -translate-x-1/2 md:top-4 md:left-auto md:right-4 md:translate-x-0 z-50 animate-slideIn px-4 md:px-0">
          <div className={`bg-gradient-to-r ${
            toastMessage.type === 'error' ? 'from-red-500 to-rose-600' :
            toastMessage.type === 'success' ? 'from-green-500 to-emerald-600' :
            toastMessage.type === 'warning' ? 'from-yellow-500 to-orange-500' :
            'from-blue-500 to-cyan-500'
          } text-white px-4 py-3 rounded-lg shadow-2xl border border-white/20 backdrop-blur-md`}>
            <p className="text-sm font-medium text-center md:text-left">{toastMessage.message}</p>
          </div>
        </div>
      )}

      {/* Chat Bubble - Only for Spectators with wallet */}
      {isSpectating && currentUsername && typeof window !== 'undefined' && localStorage.getItem('playerWallet') && (
        <motion.button
          onClick={() => setShowChat(true)}
          className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 w-12 h-12 md:w-14 md:h-14 bg-gradient-to-r from-neon-blue to-neon-purple rounded-full shadow-2xl flex items-center justify-center"
          style={{ pointerEvents: 'auto' }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {chatMessages.length > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold">
              {chatMessages.length > 9 ? '9+' : chatMessages.length}
            </div>
          )}
        </motion.button>
      )}

      {/* Chat Modal - Only for Spectators */}
      {showChat && isSpectating && (
        <div 
          className="fixed inset-0 z-50 flex items-end md:items-end md:justify-end p-2 md:p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setShowChat(false)}
          style={{ pointerEvents: 'auto' }}
        >
          <motion.div 
            className="w-full md:max-w-md bg-cyber-dark/95 backdrop-blur-xl border-2 border-neon-blue/50 rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-neon-blue to-neon-purple px-4 py-3 flex items-center justify-between">
              <h3 className="text-white font-bold text-base md:text-lg">Global Chat</h3>
              <button onClick={() => setShowChat(false)} className="text-white/70 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="h-[350px] overflow-y-auto p-4 space-y-2 bg-cyber-darker/50">
              {chatMessages.length === 0 ? (
                <div className="text-center py-16 text-gray-500 text-sm">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p>Be the first to chat!</p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="bg-cyber-dark/50 rounded-lg p-2 border border-neon-blue/20">
                    <span className="text-neon-green font-bold text-xs">{msg.username}:</span>{' '}
                    <span className="text-gray-300 text-xs">{msg.message}</span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-3 bg-cyber-dark border-t border-neon-blue/30">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && chatInput.trim()) {
                      if (socketRef.current && typeof window !== 'undefined') {
                        socketRef.current.emit('chatMessage', {
                          username: currentUsername,
                          message: chatInput.trim(),
                          walletAddress: localStorage.getItem('playerWallet')
                        });
                      }
                      setChatInput('');
                    }
                  }}
                  placeholder="Type a message..."
                  className="flex-1 bg-cyber-darker border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-neon-blue text-sm"
                />
                  <button
                    onClick={() => {
                      if (chatInput.trim() && socketRef.current && typeof window !== 'undefined') {
                        socketRef.current.emit('chatMessage', {
                          username: currentUsername,
                          message: chatInput.trim(),
                          walletAddress: localStorage.getItem('playerWallet')
                        });
                        setChatInput('');
                      }
                    }}
                  className="px-6 py-3 bg-gradient-to-r from-neon-blue to-neon-purple rounded-lg text-white font-bold hover:opacity-90 transition-opacity text-sm"
                >
                  Send
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
