'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet } from './components/useWallet';
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { TransactionLog } from './components/TransactionLog';
import { Leaderboard } from './components/Leaderboard';
import { payEntryFee, checkUSDCBalance } from './utils/payment';

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
  realPlayerCount: number; // Human players only
  botCount?: number;
  maxPlayers: number;
  min?: number;
  status: string;
  countdown: number | null;
  spectatorCount?: number;
  timeRemaining?: number | null;
  dreamCooldown?: number | null;
  potSize?: number;
}

interface GameEvent {
  id: string;
  type: 'elimination' | 'win' | 'game_start';
  message: string;
  timestamp: number;
  tier?: string;
}

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: number;
}

export default function HomePage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { connected, walletAddress, disconnect, connect } = useWallet();
  const solanaWallet = useSolanaWallet(); // For signing transactions
  const [gameModes, setGameModes] = useState<GameMode[]>([]);
  const [lobbies, setLobbies] = useState<LobbyStatus[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [payingForTier, setPayingForTier] = useState<string | null>(null);
  const [showCountdownWarning, setShowCountdownWarning] = useState(false);
  const [pendingJoinTier, setPendingJoinTier] = useState<string | null>(null);

  // Fetch username from database when wallet connects
  useEffect(() => {
    const fetchUsername = async () => {
      if (connected && walletAddress) {
        try {
          const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
          const response = await fetch(`${serverUrl}/api/user/${walletAddress}`);
          const data = await response.json();
          
          if (data.user && data.user.username) {
            setPlayerName(data.user.username);
          }
        } catch (error) {
          // Silent fail - user can enter name manually
        }
      } else {
        // Clear name when wallet disconnects
        setPlayerName('');
      }
    };
    
    fetchUsername();
  }, [connected, walletAddress]);

  // Fetch USDC balance when wallet connects
  useEffect(() => {
    let balanceInterval: NodeJS.Timeout | null = null;
    let isMounted = true;
    
    if (connected && walletAddress) {
      const fetchBalance = async () => {
        try {
          const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC;
          
          if (!rpcUrl) {
            console.error('❌ RPC endpoint not configured. Please add NEXT_PUBLIC_SOLANA_RPC to .env');
            if (isMounted) {
            setToastMessage('RPC endpoint not configured. Please add NEXT_PUBLIC_SOLANA_RPC to .env');
            setUsdcBalance(0);
            }
            return;
          }
          
          console.log('🔄 Fetching USDC balance for homepage...');
          const result = await checkUSDCBalance(walletAddress, 0, rpcUrl);
          
          if (isMounted) {
          setUsdcBalance(result.balance);
          }
        } catch (error: any) {
          console.error('❌ Error fetching USDC balance:', error.message || error);
          if (isMounted) {
          setUsdcBalance(0); // Show 0 instead of null on error
          }
        }
      };
      
      // Fetch immediately
      fetchBalance();
      
      // Refresh balance every 30 seconds
      balanceInterval = setInterval(fetchBalance, 30000);
    } else {
      // Clear balance when wallet disconnects
      setUsdcBalance(null);
    }
    
    return () => {
      isMounted = false;
      if (balanceInterval) {
        clearInterval(balanceInterval);
      }
    };
  }, [connected, walletAddress]);
  const [showRoadmap, setShowRoadmap] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showTransactionLog, setShowTransactionLog] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [currentEvent, setCurrentEvent] = useState<GameEvent | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [connectedClients, setConnectedClients] = useState(0);
  const [playersInGame, setPlayersInGame] = useState(0);
  const [totalSpectators, setTotalSpectators] = useState(0);
  const [platformStatus, setPlatformStatus] = useState<{ canPay: boolean; message: string } | null>(null);
  const [bgPosition, setBgPosition] = useState({ x: 50, y: 50 }); // Parallax background position
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);

  const CONTRACT_ADDRESS = '6WQxQRguwYVwrHpFkNJsLK2XRnWLuqaLuQ8VBGXupump';

  const calculateWinnings = (buyIn: number, maxPlayers: number) => {
    // 80% of full pot (all players paying) - return as number with 2 decimals
    return Number((buyIn * maxPlayers * 0.8).toFixed(2));
  };

  const getActualWinnings = (lobby: LobbyStatus | undefined, tier: string) => {
    // For Dream Mode, return fixed amount from env
    if (tier === 'dream') {
      return parseInt(process.env.NEXT_PUBLIC_DREAM_PAYOUT || process.env.NEXT_PUBLIC_WINNER_REWARD_USDC || '1');
    }
    
    // For paid tiers, show 80% of current pot - return as number with 2 decimals
    if (lobby?.potSize) {
      return Number((lobby.potSize * 0.8).toFixed(2));
    }
    
    // Fallback: show potential winnings if pot is full
    const gameMode = gameModes.find(m => m.tier === tier);
    if (gameMode) {
      return calculateWinnings(gameMode.buyIn, gameMode.maxPlayers);
    }
    
    return 0;
  };

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

    const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

    fetch(`${serverUrl}/api/game-modes`)
      .then(res => res.json())
      .then(setGameModes)
      .catch(console.error);

    fetch(`${serverUrl}/api/lobbies`)
      .then(res => res.json())
      .then(setLobbies)
      .catch(console.error);

    const socket = require('socket.io-client').io(serverUrl);
    
    socket.on('lobbyUpdate', (update: LobbyStatus) => {
      setLobbies(prev => {
        const index = prev.findIndex(l => l.tier === update.tier);
        if (index >= 0) {
          // Check if data actually changed
          if (JSON.stringify(prev[index]) === JSON.stringify(update)) {
            return prev; // No change, prevent re-render
          }
          const newLobbies = [...prev];
          newLobbies[index] = update;
          return newLobbies;
        } else {
          return [...prev, update];
        }
      });
    });

    socket.on('playerCountUpdate', ({ tier }: { tier: string }) => {
      // Only fetch lobbies, don't trigger full re-render unless data actually changed
      fetch(`${serverUrl}/api/lobbies`)
        .then(res => res.json())
        .then(updatedLobbies => {
          setLobbies(prev => {
            // Deep comparison - only update if data actually changed
            const prevLobby = prev.find(l => l.tier === tier);
            const newLobby = updatedLobbies.find((l: LobbyStatus) => l.tier === tier);
            
            if (JSON.stringify(prevLobby) === JSON.stringify(newLobby)) {
              return prev; // No change, don't trigger re-render
            }
            
            return updatedLobbies;
          });
        })
        .catch(console.error);
    });

    socket.on('gameEvent', (event: { type: string; killer?: string; victim?: string; winner?: string; prize?: number; players?: number; tier?: string }) => {
      const newEvent: GameEvent = {
        id: Date.now().toString(),
        type: event.type as 'elimination' | 'win' | 'game_start',
        message: '',
        timestamp: Date.now(),
        tier: event.tier
      };

      if (event.type === 'elimination' && event.killer && event.victim) {
        const shortVictim = event.victim.length > 10 ? event.victim.substring(0, 10) + '...' : event.victim;
        const shortKiller = event.killer.length > 10 ? event.killer.substring(0, 10) + '...' : event.killer;
        newEvent.message = `${shortVictim} ← ${shortKiller}`;
      } else if (event.type === 'win' && event.winner && event.prize && event.players) {
        const shortWinner = event.winner.length > 10 ? event.winner.substring(0, 10) + '...' : event.winner;
        newEvent.message = `${shortWinner} won $${event.prize.toLocaleString()}`;
      } else if (event.type === 'game_start' && event.tier) {
        newEvent.message = `$${event.tier} game starting!`;
      }

      // Show only one event at a time
      setCurrentEvent(newEvent);
      
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setCurrentEvent(prev => prev?.id === newEvent.id ? null : prev);
      }, 5000);
    });

    socket.on('chatMessage', (msg: { username: string; message: string }) => {
      const newMsg: ChatMessage = {
        id: Date.now().toString(),
        username: msg.username,
        message: msg.message,
        timestamp: Date.now()
      };
      setChatMessages(prev => {
        const newMessages = [...prev, newMsg];
        // Keep only the most recent 100 messages
        return newMessages.slice(-100);
      });
    });

    // Listen for stats updates
    socket.on('statsUpdate', (stats: { connectedClients: number; playersInGame: number; totalSpectators: number }) => {
      setConnectedClients(stats.connectedClients);
      setPlayersInGame(stats.playersInGame);
      setTotalSpectators(stats.totalSpectators);
    });

    // Fetch initial stats
    fetch(`${serverUrl}/api/stats`)
      .then(res => res.json())
      .then((stats: { connectedClients: number; playersInGame: number; totalSpectators: number }) => {
        setConnectedClients(stats.connectedClients);
        setPlayersInGame(stats.playersInGame);
        setTotalSpectators(stats.totalSpectators);
      })
      .catch(console.error);

    // Fetch platform status
    fetch(`${serverUrl}/api/platform-status`)
      .then(res => res.json())
      .then((status: { canPay: boolean; message: string }) => {
        setPlatformStatus(status);
      })
      .catch(console.error);

    (window as any).gameSocket = socket;

    return () => {
      socket.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Username is saved to DB when joining lobby, no localStorage needed

  // Load chat history from database on mount
  useEffect(() => {
    const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    fetch(`${serverUrl}/api/chat`)
      .then(res => res.json())
      .then(data => {
        if (data.messages && Array.isArray(data.messages)) {
          // Take last 100 messages only
          const recentMessages = data.messages.slice(-100).map((msg: any) => ({
            id: msg._id || msg.timestamp.toString(),
            username: msg.username,
            message: msg.message,
            timestamp: msg.timestamp
          }));
          setChatMessages(recentMessages);
        }
      })
      .catch(console.error);
  }, []);

  // Auto-scroll chat to bottom only when opening chat
  useEffect(() => {
    if (showChat) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [showChat]);

  const sendChatMessage = () => {
    // Require wallet connection for chat
    if (!connected) {
      setToastMessage('Connect wallet to chat');
      return;
    }
    
    if (!chatInput.trim() || !playerName.trim()) return;
    
    const socket = (window as any).gameSocket;
    if (socket) {
      socket.emit('chatMessage', {
        username: playerName,
        message: chatInput.trim(),
        walletAddress: walletAddress || null
      });
      setChatInput('');
    }
  };

  const joinLobby = async (tier: string) => {
    // Require wallet connection
    if (!connected) {
      connect(); // Opens official wallet modal
      return;
    }

    if (!playerName.trim()) {
      setToastMessage('Please enter a name');
      return;
    }

    // Check if tier requires payment (all except Dream)
    const gameMode = gameModes.find(m => m.tier === tier);
    const requiresPayment = tier !== 'dream';
    
    if (requiresPayment && gameMode) {
      // Check if countdown already started - show warning
      const lobby = getLobbyStatus(tier);
      if (lobby?.countdown !== null && lobby?.countdown !== undefined && lobby.countdown > 0) {
        // Show warning dialog
        setPendingJoinTier(tier);
        setShowCountdownWarning(true);
        return;
      }
      
      // Process payment
      await handlePaymentAndJoin(tier, gameMode.buyIn);
    } else {
      // Free tier (Dream Mode) - join directly
      const playerId = `player_${Date.now()}`;
      localStorage.setItem('playerId', playerId);
      localStorage.setItem('playerName', playerName);
      localStorage.setItem('selectedTier', tier);
      localStorage.setItem('playerWallet', walletAddress || '');
      
      router.push('/game');
    }
  };
  
  const handlePaymentAndJoin = async (tier: string, entryFee: number) => {
    setPayingForTier(tier);
    
    try {
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC;
      
      if (!rpcUrl) {
        setToastMessage('RPC endpoint not configured. Please add NEXT_PUBLIC_SOLANA_RPC to .env');
        setPayingForTier(null);
        return;
      }
      
      // Check USDC balance
      const balanceCheck = await checkUSDCBalance(walletAddress!, entryFee, rpcUrl);
      
      if (!balanceCheck.hasEnough) {
        setToastMessage(`Insufficient USDC balance. You have $${balanceCheck.balance.toFixed(2)}, need $${entryFee}`);
        setPayingForTier(null);
        return;
      }
      
      // Send payment
      const paymentResult = await payEntryFee(solanaWallet, entryFee, rpcUrl);
      
      if (!paymentResult.success) {
        setToastMessage(`Payment failed: ${paymentResult.error}`);
        setPayingForTier(null);
        return;
      }
      
      // Update balance immediately (optimistic update)
      if (usdcBalance !== null) {
        setUsdcBalance(usdcBalance - entryFee);
      }
      
      // Payment confirmed - join lobby
      const playerId = `player_${Date.now()}`;
      localStorage.setItem('playerId', playerId);
      localStorage.setItem('playerName', playerName);
      localStorage.setItem('selectedTier', tier);
      localStorage.setItem('playerWallet', walletAddress || '');
      localStorage.setItem('entryPaymentTx', paymentResult.signature || '');
      
      router.push('/game');
      
    } catch (error: any) {
      setToastMessage(`Payment error: ${error.message}`);
    } finally {
      setPayingForTier(null);
    }
  };
  
  const confirmJoinDuringCountdown = async () => {
    setShowCountdownWarning(false);
    if (pendingJoinTier) {
      const gameMode = gameModes.find(m => m.tier === pendingJoinTier);
      if (gameMode) {
        await handlePaymentAndJoin(pendingJoinTier, gameMode.buyIn);
      }
      setPendingJoinTier(null);
    }
  };

  const spectateGame = (tier: string) => {
    localStorage.setItem('spectateMode', 'true');
    localStorage.setItem('selectedTier', tier);
    router.push('/game');
  };

  // Parallax background effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const _w = window.innerWidth / 2;
      const _h = window.innerHeight / 2;
      const _mouseX = e.clientX;
      const _mouseY = e.clientY;
      
      // Smooth parallax calculation
      const bgX = 50 - (_mouseX - _w) * 0.01;
      const bgY = 50 - (_mouseY - _h) * 0.01;
      
      setBgPosition({ x: bgX, y: bgY });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowRoadmap(false);
        setShowChat(false);
        setShowLeaderboard(false);
        setShowTransactionLog(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const getLobbyStatus = (tier: string): LobbyStatus | undefined => {
    return lobbies.find(l => l.tier === tier);
  };

  const getGameStatus = (lobby: LobbyStatus | undefined) => {
    if (!lobby) return 'READY TO PLAY';
    if (lobby.countdown !== null && lobby.countdown > 0) return 'STARTING SOON';
    if (lobby.status === 'playing') return 'GAME IN PROGRESS';
    if (lobby.playersLocked >= lobby.maxPlayers) return 'LOBBY FULL';
    if (lobby.playersLocked > 0) return `${lobby.playersLocked}/${lobby.maxPlayers} PLAYERS`;
    return 'READY TO PLAY';
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Parallax Background Image */}
      <div 
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: 'url(/bg.jpg)',
          backgroundSize: '120%', // 20% zoom in
          backgroundPosition: `${bgPosition.x}% ${bgPosition.y}%`,
          backgroundRepeat: 'no-repeat',
        }}
      />
      
      {/* Dark overlay for better readability */}
      <div className="fixed inset-0 z-0 bg-black/40" />
      
      {/* Particle Canvas on top of background */}
      <canvas ref={canvasRef} id="particles" className="fixed inset-0 z-1" />
      
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      {/* Top Bar - Minimal */}
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50 bg-cyber-dark/60 backdrop-blur-xl border-b border-neon-green/10 shadow-xl"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
      >
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-4">
            <h1 className="text-xl md:text-2xl font-black gradient-text">AgarFi</h1>
            <div className="hidden lg:flex items-center gap-2 md:gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-gray-400">
                <div className="w-2 h-2 bg-gray-400 rounded-full" />
                <span className="font-bold text-white">{connectedClients}</span> online
              </span>
              <span className="text-gray-600">•</span>
              <span className="flex items-center gap-1.5 text-gray-400">
                <svg className="w-3 h-3 text-neon-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                </svg>
                <span className="font-bold text-neon-blue">{playersInGame}</span> in game
              </span>
              <span className="text-gray-600">•</span>
              <span className="flex items-center gap-1.5 text-gray-400">
                <svg className="w-3 h-3 text-neon-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span className="font-bold text-neon-purple">{totalSpectators}</span> spectating
              </span>
              <span className="text-gray-600">•</span>
              <span className="flex items-center gap-1.5 text-gray-400">
                <svg className="w-3 h-3 text-neon-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span className="font-bold text-neon-green">{connectedClients - playersInGame - totalSpectators}</span> browsing
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 md:gap-2">
            {/* Leaderboard Button */}
            <motion.button
              onClick={() => setShowLeaderboard(true)}
              className="px-2 md:px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-xs font-bold hover:bg-yellow-500/20 transition-all flex items-center gap-1"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              <span className="hidden sm:inline">🏆 Top 50</span>
              <span className="sm:hidden">🏆</span>
            </motion.button>

            {/* Transaction Log Button */}
            <motion.button
              onClick={() => setShowTransactionLog(true)}
              className="px-2 md:px-3 py-1.5 bg-neon-blue/10 border border-neon-blue/30 rounded-lg text-neon-blue text-xs font-bold hover:bg-neon-blue/20 transition-all flex items-center gap-1"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="hidden sm:inline">Payouts</span>
            </motion.button>
            
            {/* Roadmap Button */}
            <motion.button
              onClick={() => setShowRoadmap(true)}
              className="px-2 md:px-3 py-1.5 bg-neon-purple/10 border border-neon-purple/30 rounded-lg text-neon-purple text-xs font-bold hover:bg-neon-purple/20 transition-all flex items-center gap-1 md:gap-1.5"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span className="hidden sm:inline">Roadmap</span>
            </motion.button>
            
            {/* Whitepaper Link */}
            <motion.a
              href="https://agarfi.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 md:px-3 py-1.5 bg-neon-green/10 border border-neon-green/30 rounded-lg text-neon-green text-xs font-bold hover:bg-neon-green/20 transition-all flex items-center gap-1"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="hidden sm:inline">Whitepaper</span>
              <span className="sm:hidden">📄</span>
            </motion.a>
            
            {/* USDC Balance (when connected) */}
            {connected && (
              <div className="px-2 md:px-3 py-1.5 bg-neon-green/10 border border-neon-green/30 rounded-lg flex items-center gap-1.5">
                <svg className="w-3 h-3 text-neon-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {usdcBalance === null ? (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-neon-green rounded-full animate-pulse" />
                    <span className="text-gray-400 text-xs">Loading...</span>
                  </div>
                ) : (
                  <>
                    <span className={`font-bold text-xs ${usdcBalance > 0 ? 'text-neon-green' : 'text-gray-400'}`}>
                      ${usdcBalance.toFixed(2)}
                    </span>
                    <span className="hidden sm:inline text-gray-400 text-xs">USDC</span>
                  </>
                )}
              </div>
            )}
            
            {/* Wallet Button */}
            {connected ? (
              <motion.button
                onClick={disconnect}
                className="px-2 md:px-3 py-1.5 bg-gradient-to-r from-neon-green to-neon-blue rounded-lg text-black text-xs font-bold hover:opacity-90 transition-all flex items-center gap-1.5"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="hidden md:inline font-mono">{walletAddress?.slice(0, 4)}...{walletAddress?.slice(-4)}</span>
                <span className="md:hidden">💼</span>
              </motion.button>
            ) : (
              <motion.button
                onClick={connect}
                className="px-2 md:px-3 py-1.5 bg-neon-green/10 border border-neon-green/30 rounded-lg text-neon-green text-xs font-bold hover:bg-neon-green/20 transition-all flex items-center gap-1.5"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="hidden sm:inline">Connect</span>
              </motion.button>
            )}
          </div>
        </div>
      </motion.nav>

      {/* Main Content */}
      <div className="relative z-10 pt-16 px-4 pb-8">
        <div className="max-w-[1400px] mx-auto">
          
          {/* Hero - Centered */}
          <motion.div
            className="text-center mb-6 md:mb-8 mt-4 md:mt-8 px-4"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-black gradient-text text-glow-strong mb-2 drop-shadow-2xl">
              Choose Your Battle
            </h2>
            <p className="text-sm md:text-base text-gray-200 mb-2 drop-shadow-lg">
              Pick your stakes, dominate the arena, win big
            </p>
            <p className="text-xs text-gray-300 mb-3 drop-shadow">
              Bots will not be in live games when in production
            </p>
            
            {/* Platform Status Banner */}
            {platformStatus && !platformStatus.canPay && (
              <div className="max-w-md mx-auto mb-3">
                <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg px-4 py-2 text-center shadow-lg">
                  <p className="text-xs font-bold text-yellow-400 drop-shadow">
                    ⚠️ {platformStatus.message}
                  </p>
                </div>
              </div>
            )}
            
            {/* Player Name - Inline */}
            <motion.div 
              className="max-w-md mx-auto"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onBlur={async () => {
                  // Save username to database when user finishes typing
                  if (connected && walletAddress && playerName.trim()) {
                    try {
                      const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
                      await fetch(`${serverUrl}/api/user/update-username`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          walletAddress,
                          username: playerName.trim()
                        })
                      });
                    } catch (error) {
                      // Silent fail
                    }
                  }
                }}
                placeholder="Enter your name to play..."
                className="w-full px-4 md:px-6 py-3 md:py-4 bg-cyber-dark/70 backdrop-blur-xl border-2 border-neon-green/30 rounded-xl focus:outline-none focus:border-neon-green focus:shadow-lg focus:shadow-neon-green/30 text-white text-center text-base md:text-lg transition-all placeholder-gray-500"
                maxLength={20}
              />
            </motion.div>
          </motion.div>

          {/* Game Modes - Hero Cards */}
          <div className="space-y-8 md:space-y-10">
            {/* Dream Mode First (Free hourly) */}
            {(() => {
              const dreamLobby = getLobbyStatus('dream');
              const dreamStatus = getGameStatus(dreamLobby);

              return (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="relative"
                >
                  {/* Rainbow Magical Glow */}
                  <div className="absolute -inset-2 rounded-3xl opacity-60 group-hover:opacity-80 transition-opacity duration-700 blur-2xl bg-gradient-to-r from-pink-300 via-purple-300 via-blue-300 to-cyan-300 animate-pulse" />
                  <div className="absolute -inset-1 rounded-3xl opacity-40 blur-xl bg-gradient-to-tr from-yellow-200 via-pink-200 to-purple-200" />

                  <div className="relative bg-gradient-to-br from-pink-400/30 via-purple-400/30 via-blue-400/30 to-cyan-400/30 backdrop-blur-2xl border-2 border-white/40 rounded-3xl overflow-hidden shadow-2xl">
                    {/* Dark overlay for text readability */}
                    <div className="absolute inset-0 bg-black/40" />
                    
                    {/* Sparkle Overlay */}
                    <div className="absolute inset-0 opacity-20" style={{
                  backgroundImage: `radial-gradient(circle at 20% 50%, rgba(255,255,255,0.8) 0%, transparent 50%),
                                   radial-gradient(circle at 80% 80%, rgba(255,192,203,0.8) 0%, transparent 50%),
                                   radial-gradient(circle at 40% 20%, rgba(147,51,234,0.6) 0%, transparent 50%)`
                    }} />
                    
                    {/* Floating Badge */}
                    <motion.div 
                  className="absolute top-4 left-1/2 -translate-x-1/2 z-10"
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <div className="px-4 py-2 bg-white/90 border-2 border-pink-300 rounded-full backdrop-blur-sm shadow-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">✨</span>
                      <div className="text-sm font-black bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
                        FREE • Every {process.env.NEXT_PUBLIC_DREAM_INTERVAL_HOURS || '1'} Hour{parseInt(process.env.NEXT_PUBLIC_DREAM_INTERVAL_HOURS || '1') > 1 ? 's' : ''}
                      </div>
                      <span className="text-lg">✨</span>
                    </div>
                    </div>
                  </motion.div>

                  <div className="relative p-6 md:p-10 flex flex-col items-center pt-20 md:pt-16">
                  {/* Title Section */}
                  <div className="text-center mb-6">
                    <motion.div
                      animate={{ 
                        scale: [1, 1.05, 1],
                      }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                      className="text-6xl md:text-7xl mb-4"
                    >
                      ☁️💭✨
                    </motion.div>
                    <div className="bg-black/60 backdrop-blur-sm px-6 py-3 rounded-2xl border border-white/20 mb-3">
                      <h3 className="text-4xl md:text-5xl lg:text-6xl font-black">
                        <span className="bg-gradient-to-r from-pink-400 via-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
                          DREAM MODE
                        </span>
                      </h3>
                    </div>
                    <div className="text-2xl md:text-3xl font-bold text-white drop-shadow-lg">
                      Win ${process.env.NEXT_PUBLIC_DREAM_PAYOUT || '1'} USDC
                    </div>
                    <div className="text-sm text-white/80 mt-2 drop-shadow">
                      Free game every {process.env.NEXT_PUBLIC_DREAM_INTERVAL_HOURS || '1'} hour!
                    </div>
                  </div>

                  {/* Countdown Timer (if counting down) */}
                  {dreamLobby?.countdown !== null && dreamLobby?.countdown !== undefined && dreamLobby.countdown > 0 && (
                    <div className="bg-pink-400/20 border-2 border-pink-400/50 rounded-xl p-4 mb-4 text-center">
                      <div className="text-2xl md:text-3xl font-black text-pink-300 mb-1">
                        Starting in {dreamLobby.countdown}s
                      </div>
                      <div className="text-xs text-white/80">Get ready! ✨</div>
                    </div>
                  )}

                  {/* Stats Row */}
                  {dreamLobby && (
                    <div className="grid grid-cols-4 gap-2 mb-4 max-w-2xl mx-auto">
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center border border-white/20">
                        <div className="text-lg font-black text-pink-300">{dreamLobby.realPlayerCount || 0}</div>
                        <div className="text-xs text-white/70">Players</div>
                      </div>
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center border border-white/20">
                        <div className="text-lg font-black text-purple-300">{dreamLobby.botCount || 0}</div>
                        <div className="text-xs text-white/70">Bots</div>
                      </div>
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center border border-white/20">
                        <div className="text-lg font-black text-cyan-300">{dreamLobby.spectatorCount || 0}</div>
                        <div className="text-xs text-white/70">Spectators</div>
                      </div>
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center border border-white/20">
                        <div className="text-lg font-black text-white">{dreamLobby.playersLocked || 0}/{process.env.NEXT_PUBLIC_DREAM_MAX_PLAYERS || '25'}</div>
                        <div className="text-xs text-white/70">Total</div>
                      </div>
                    </div>
                  )}

                  {/* Progress Bar */}
                  {dreamLobby && (
                    <div className="mb-6 max-w-2xl mx-auto">
                      <div className="h-2 bg-black/40 rounded-full overflow-hidden border border-white/20">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400"
                          initial={false}
                          animate={{ width: `${((dreamLobby.playersLocked || 0) / parseInt(process.env.NEXT_PUBLIC_DREAM_MAX_PLAYERS || '25')) * 100}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Cooldown Timer (if on cooldown) */}
                  {dreamLobby?.dreamCooldown && dreamLobby.dreamCooldown > 0 ? (
                    <div className="bg-purple-500/20 border-2 border-purple-400/50 rounded-xl p-4 mb-4 text-center">
                      <div className="text-xl md:text-2xl font-black text-purple-300 mb-1">
                        Next game in {Math.ceil(dreamLobby.dreamCooldown / (1000 * 60))} minutes
                      </div>
                      <div className="text-xs text-white/80">One game per {process.env.NEXT_PUBLIC_DREAM_INTERVAL_HOURS || '1'} hour ⏰</div>
                    </div>
                  ) : null}

                  {/* CTA Buttons */}
                  {dreamLobby?.dreamCooldown && dreamLobby.dreamCooldown > 0 ? (
                    <motion.button
                      className="px-8 md:px-16 py-3 md:py-5 bg-gray-600/70 border-2 border-gray-500/50 text-gray-400 cursor-not-allowed rounded-2xl font-black text-lg md:text-2xl shadow-2xl"
                      disabled
                    >
                      ⏰ On Cooldown
                    </motion.button>
                  ) : dreamLobby && dreamLobby.status === 'playing' ? (
                    <motion.button
                      className="px-8 md:px-16 py-3 md:py-5 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-white rounded-2xl font-black text-lg md:text-2xl shadow-2xl border-2 border-white/30"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => spectateGame('dream')}
                    >
                      👁️ Spectate Dream
                    </motion.button>
                  ) : (
                    <motion.button
                      className="px-8 md:px-16 py-3 md:py-5 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 hover:from-pink-600 hover:via-purple-600 hover:to-cyan-600 text-white rounded-2xl font-black text-lg md:text-2xl shadow-2xl border-2 border-white/30"
                      whileHover={{ scale: 1.05, boxShadow: "0 0 40px rgba(236, 72, 153, 0.6)" }}
                      whileTap={{ scale: 0.95 }}
                      animate={{
                        boxShadow: [
                          "0 0 20px rgba(236, 72, 153, 0.3)",
                          "0 0 40px rgba(147, 51, 234, 0.4)",
                          "0 0 20px rgba(236, 72, 153, 0.3)"
                        ]
                      }}
                      transition={{ duration: 3, repeat: Infinity }}
                      onClick={() => {
                        if (!connected) {
                          setToastMessage('Connect wallet to play');
                          return;
                        }
                        if (!playerName.trim()) {
                          setToastMessage('Enter your name to play');
                          return;
                        }
                        joinLobby('dream');
                      }}
                    >
                      ✨ Play FREE ✨
                    </motion.button>
                  )}
                  </div>
                </div>
              </motion.div>
            );
            })()}

            {/* Whale Mode (if exists) */}
            {gameModes.filter(m => m.tier === 'whale').map((mode, index) => {
              const lobby = getLobbyStatus(mode.tier);
              const isLocked = mode.locked;
              const actualWinnings = getActualWinnings(lobby, mode.tier);

              return (
                <motion.div
                  key={mode.tier}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="relative"
                >
                  {/* Epic Golden Glow */}
                  <div className="absolute -inset-2 rounded-3xl opacity-60 group-hover:opacity-80 transition-opacity duration-700 blur-2xl bg-gradient-to-r from-yellow-300 via-orange-300 to-red-400 animate-pulse" />
                  <div className="absolute -inset-1 rounded-3xl opacity-40 blur-xl bg-gradient-to-tr from-yellow-200 via-orange-200 to-red-300" />

                  <div className="relative bg-gradient-to-br from-yellow-400/30 via-orange-400/30 to-red-400/30 backdrop-blur-2xl border-2 border-yellow-400/60 rounded-3xl overflow-hidden shadow-2xl">
                    {/* Gold Sparkle Overlay */}
                    <div className="absolute inset-0 opacity-20" style={{
                      backgroundImage: `radial-gradient(circle at 20% 50%, rgba(251,191,36,0.8) 0%, transparent 50%),
                                       radial-gradient(circle at 80% 80%, rgba(249,115,22,0.6) 0%, transparent 50%),
                                       radial-gradient(circle at 40% 20%, rgba(234,179,8,0.7) 0%, transparent 50%)`
                    }} />
                    
                    {/* Floating Badge */}
                    <motion.div 
                      className="absolute top-4 left-1/2 -translate-x-1/2 z-10"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    >
                      {isLocked ? (
                        <div className="px-4 py-2 bg-purple-500/90 border-2 border-purple-300 rounded-full backdrop-blur-sm shadow-lg">
                          <div className="flex items-center gap-2">
                            <span className="text-lg animate-pulse">💎</span>
                            <div className="text-sm font-black text-white">
                              Unlocks at $1M Market Cap
                            </div>
                            <span className="text-lg animate-pulse">💎</span>
                          </div>
                        </div>
                      ) : (
                        <div className="px-4 py-2 bg-yellow-500/90 border-2 border-yellow-300 rounded-full backdrop-blur-sm shadow-lg">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🔥</span>
                            <div className="text-sm font-black bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent">
                              LIVE NOW
                            </div>
                            <span className="text-lg">🔥</span>
                          </div>
                        </div>
                      )}
                    </motion.div>

                    <div className="relative p-6 md:p-10 flex flex-col items-center pt-20 md:pt-16">
                      {/* Title Section */}
                      <div className="text-center mb-6">
                        <motion.div
                          animate={{ 
                            scale: [1, 1.05, 1],
                          }}
                          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                          className="text-6xl md:text-7xl mb-4"
                        >
                          🐋💰👑
                        </motion.div>
                         <div className="bg-black/60 backdrop-blur-sm px-6 py-3 rounded-2xl border border-white/20 mb-3">
                           <h3 className="text-4xl md:text-5xl lg:text-6xl font-black">
                             <span className="bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 bg-clip-text text-transparent">
                                WHALE MODE
                              </span>
                            </h3>
                          </div>
                        <div className="text-2xl md:text-3xl font-bold text-white drop-shadow-lg">
                          Win ${actualWinnings.toLocaleString()}
                        </div>
                        <div className="text-sm text-white/80 mt-2 drop-shadow">
                          The ultimate high-stakes battle
                        </div>
                      </div>

                      {/* Info Pills */}
                      <div className="flex flex-wrap justify-center gap-3 mb-6">
                        <div className="px-4 py-2 bg-white/20 border border-white/30 rounded-full backdrop-blur-sm">
                          <span className="text-white font-bold text-sm">💵 $500 Entry</span>
                        </div>
                        <div className="px-4 py-2 bg-white/20 border border-white/30 rounded-full backdrop-blur-sm">
                          <span className="text-white font-bold text-sm">👥 50 Players</span>
                        </div>
                        <div className="px-4 py-2 bg-white/20 border border-white/30 rounded-full backdrop-blur-sm">
                          <span className="text-white font-bold text-sm">💰 $25K Pool</span>
                        </div>
                        <div className="px-4 py-2 bg-gradient-to-r from-yellow-400 to-orange-400 border border-white/50 rounded-full">
                          <span className="text-white font-black text-sm drop-shadow">👑 $20K</span>
                        </div>
                      </div>

                      {/* CTA Button */}
                      <motion.button
                        className="px-8 md:px-16 py-3 md:py-5 bg-gray-800/70 border-2 border-gray-600/50 text-gray-400 cursor-not-allowed rounded-2xl font-black text-lg md:text-2xl shadow-2xl"
                        disabled
                      >
                        🔒 Coming Soon
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {/* Regular Game Modes Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 auto-rows-fr">
            {gameModes.filter(m => m.tier !== 'whale' && m.tier !== 'dream').map((mode, index) => {
              const lobby = getLobbyStatus(mode.tier);
              const isLocked = mode.locked;
              const actualWinnings = getActualWinnings(lobby, mode.tier);
              const gameStatus = getGameStatus(lobby);

              return (
                <motion.div
                  key={mode.tier}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.05 }}
                  className="relative group"
                >
                  {/* Hover Glow */}
                  <div className="absolute -inset-0.5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur bg-neon-green" />

                  <div className="relative bg-cyber-dark/85 backdrop-blur-xl border border-neon-green/30 hover:border-neon-green rounded-xl p-3 md:p-4 transition-all h-full flex flex-col shadow-xl">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-2 md:mb-3">
                      <div>
                        <h3 className="text-xl md:text-2xl font-black mb-1 text-white">
                          ${mode.buyIn} Entry
                        </h3>
                        <div className="text-lg md:text-xl font-bold text-neon-green">
                          Win ${actualWinnings.toLocaleString()}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-1">
                        {/* Status or Timer */}
                        {lobby?.status === 'playing' && lobby.timeRemaining !== null && lobby.timeRemaining !== undefined ? (
                          <div className="px-3 py-1.5 rounded-lg bg-neon-blue/20 border border-neon-blue/50 text-center">
                            <div className="text-xs font-bold text-neon-blue mb-0.5">GAME IN PROGRESS</div>
                            <div className="text-sm font-black text-white">
                              ⏱ {Math.floor(lobby.timeRemaining / 60000)}:{String(Math.floor((lobby.timeRemaining % 60000) / 1000)).padStart(2, '0')}
                            </div>
                          </div>
                        ) : (
                          <div className={`px-2 py-1 rounded text-xs font-bold ${
                            lobby?.countdown
                              ? 'bg-yellow-400/20 text-yellow-400'
                              : 'bg-neon-green/20 text-neon-green'
                          }`}>
                            {gameStatus}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Countdown Timer (if counting down) */}
                    {lobby?.countdown !== null && lobby?.countdown !== undefined && lobby.countdown > 0 && (
                      <div className="bg-yellow-400/20 border border-yellow-400/50 rounded-lg p-3 mb-3 text-center">
                        <div className="text-xl md:text-2xl font-black text-yellow-400 mb-1">
                          Starting in {lobby.countdown}s
                        </div>
                      <div className="text-xs text-gray-400">Game is starting soon - join now!</div>
                    </div>
                  )}

                    {/* Stats Row */}
                    {lobby && (
                      <div className="grid grid-cols-4 gap-1.5 md:gap-2 mb-3 md:mb-4">
                        <div className="bg-cyber-darker/50 rounded p-1.5 md:p-2 text-center">
                          <div className="text-xs md:text-sm font-bold text-neon-green">{lobby.realPlayerCount || 0}</div>
                          <div className="text-xs text-gray-500">Players</div>
                        </div>
                        <div className="bg-cyber-darker/50 rounded p-1.5 md:p-2 text-center">
                          <div className="text-xs md:text-sm font-bold text-purple-400">{lobby.botCount || 0}</div>
                          <div className="text-xs text-gray-500">Bots</div>
                        </div>
                        <div className="bg-cyber-darker/50 rounded p-1.5 md:p-2 text-center">
                          <div className="text-xs md:text-sm font-bold text-neon-blue">{lobby.spectatorCount || 0}</div>
                          <div className="text-xs text-gray-500">Spectators</div>
                        </div>
                        <div className="bg-cyber-darker/50 rounded p-1.5 md:p-2 text-center">
                          <div className="text-xs md:text-sm font-bold text-white">{lobby.playersLocked}/{lobby.maxPlayers}</div>
                          <div className="text-xs text-gray-500">Total</div>
                        </div>
                      </div>
                    )}

                    {/* Pot Size Display (for paid tiers) */}
                    {lobby && mode.tier !== 'dream' && (
                      <div className="mb-3">
                        <div className={`bg-gradient-to-r p-3 rounded-lg text-center border-2 ${
                          lobby.countdown !== null && lobby.countdown > 0
                            ? 'from-red-500/20 to-orange-500/20 border-red-500/50'
                            : 'from-neon-green/10 to-neon-blue/10 border-neon-green/30'
                        }`}>
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-2xl">💰</span>
                            <div>
                              <div className="text-lg md:text-xl font-black text-neon-green">
                                ${lobby.potSize || 0} POT
                              </div>
                              {lobby.countdown !== null && lobby.countdown > 0 && (
                                <div className="text-xs font-bold text-red-400 mt-1">
                                  🔒 LOCKED - No Refunds
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Progress Bar - Shows combined bots + players */}
                    {lobby && (
                      <div className="mb-4">
                        <div className="h-1.5 bg-cyber-darker rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-gradient-to-r from-neon-green to-neon-blue"
                            initial={false}
                            animate={{ width: `${((lobby.playersLocked || 0) / lobby.maxPlayers) * 100}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Spacer to push button to bottom */}
                    <div className="flex-grow"></div>

                    {/* Action Button */}
                    {lobby && lobby.status === 'playing' ? (
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => spectateGame(mode.tier)}
                        className="w-full py-2.5 md:py-3 rounded-xl font-bold text-sm md:text-base bg-gradient-to-r from-neon-blue to-neon-purple text-white shadow-lg"
                      >
                        👁️ Spectate
                      </motion.button>
                    ) : (
                      <motion.button
                        whileHover={{ scale: payingForTier === mode.tier ? 1 : 1.03 }}
                        whileTap={{ scale: payingForTier === mode.tier ? 1 : 0.97 }}
                        onClick={() => joinLobby(mode.tier)}
                        disabled={payingForTier === mode.tier}
                        className={`w-full py-2.5 md:py-3 rounded-xl font-bold text-sm md:text-base shadow-lg ${
                          payingForTier === mode.tier
                            ? 'bg-gray-600 text-gray-400 cursor-wait'
                            : 'bg-gradient-to-r from-neon-green to-neon-blue text-black'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1.5 md:gap-2">
                          {payingForTier === mode.tier ? (
                            <>
                              <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                              <span>Processing Payment...</span>
                            </>
                          ) : (
                            <>
                              <span className="text-lg">💰</span>
                              <span>${mode.buyIn} • Join Game</span>
                            </>
                          )}
                        </div>
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              );
            })}
            </div>
          </div>

          {/* Footer Info - Minimal */}
          <motion.div
            className="mt-6 md:mt-8 text-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <button
              onClick={copyToClipboard}
              className="inline-flex items-center gap-2 px-3 md:px-4 py-2 bg-cyber-dark/50 border border-gray-600/30 rounded-lg text-xs text-gray-400 hover:border-neon-blue/50 hover:text-neon-blue transition-all"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="font-mono hidden sm:inline">{copied ? 'Copied!' : CONTRACT_ADDRESS.slice(0, 8) + '...' + CONTRACT_ADDRESS.slice(-6)}</span>
              <span className="font-mono sm:hidden">{copied ? 'Copied!' : CONTRACT_ADDRESS.slice(0, 6) + '...' + CONTRACT_ADDRESS.slice(-4)}</span>
            </button>
          </motion.div>

        </div>
      </div>

      {/* Rolling Event Feed - Single Item with Slot Machine Animation */}
      {currentEvent && (
        <motion.div
          key={currentEvent.id}
          initial={{ y: -100, opacity: 0, scale: 0.8 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -100, opacity: 0, scale: 0.8 }}
          transition={{ 
            type: 'spring', 
            stiffness: 400, 
            damping: 20,
            opacity: { duration: 0.2 }
          }}
          className="fixed top-14 md:top-16 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-[calc(100%-2rem)] md:w-full px-2 md:px-4"
        >
          <div className={`relative overflow-hidden rounded-xl border-2 backdrop-blur-xl shadow-2xl ${
            currentEvent.type === 'win'
              ? 'bg-gradient-to-r from-yellow-400/30 to-orange-500/30 border-yellow-400/80'
              : currentEvent.type === 'elimination'
              ? 'bg-gradient-to-r from-red-500/30 to-rose-600/30 border-red-500/80'
              : 'bg-gradient-to-r from-neon-blue/30 to-neon-purple/30 border-neon-blue/80'
          }`}>
            {/* Animated shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
            
            <div className="relative p-3 md:p-4 flex items-center justify-between gap-2 md:gap-4">
              <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                <motion.div 
                  className="text-2xl md:text-3xl flex-shrink-0"
                  animate={{ 
                    rotate: [0, 10, -10, 10, 0],
                    scale: [1, 1.2, 1]
                  }}
                  transition={{ duration: 0.5 }}
                >
                  {currentEvent.type === 'win' && '🏆'}
                  {currentEvent.type === 'elimination' && '💀'}
                  {currentEvent.type === 'game_start' && '🚀'}
                </motion.div>
                <div className={`flex-1 font-bold text-sm md:text-base truncate ${
                  currentEvent.type === 'win' ? 'text-yellow-400' :
                  currentEvent.type === 'elimination' ? 'text-red-400' :
                  'text-neon-blue'
                }`}>
                  {currentEvent.message}
                </div>
              </div>

              {/* Spectate Button for Game Starts */}
              {currentEvent.type === 'game_start' && currentEvent.tier && (
                <motion.button
                  onClick={() => spectateGame(currentEvent.tier!)}
                  className="px-3 md:px-5 py-2 md:py-2.5 bg-neon-blue/40 hover:bg-neon-blue/60 border-2 border-neon-blue/80 rounded-lg text-white font-bold text-xs md:text-sm transition-all shadow-lg flex-shrink-0"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="hidden sm:inline">👁️ Spectate Now</span>
                  <span className="sm:hidden">👁️ Watch</span>
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>
      )}

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
            <div className="bg-gradient-to-r from-neon-blue to-neon-purple p-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Global Chat
              </h3>
              <button onClick={() => setShowChat(false)} className="p-1 hover:bg-white/20 rounded transition-colors">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              {!connected && (
                <div className="mb-2 text-center text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 rounded p-2">
                  Connect wallet to chat
                </div>
              )}
              {connected && !playerName.trim() && (
                <div className="mb-2 text-center text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 rounded p-2">
                  Enter your name above to chat
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                  placeholder={connected ? "Type message..." : "Connect wallet to chat"}
                  disabled={!connected || !playerName.trim()}
                  className="flex-1 px-3 py-2 bg-cyber-darker/50 border border-neon-blue/30 rounded-lg focus:outline-none focus:border-neon-blue text-white text-sm placeholder-gray-600 disabled:opacity-50"
                  maxLength={200}
                />
                <motion.button
                  onClick={sendChatMessage}
                  disabled={!connected || !playerName.trim() || !chatInput.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-neon-blue to-neon-purple text-white rounded-lg font-bold text-sm disabled:opacity-50"
                  whileHover={{ scale: connected && playerName.trim() && chatInput.trim() ? 1.05 : 1 }}
                >
                  Send
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Roadmap Modal - Comprehensive */}
      {showRoadmap && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setShowRoadmap(false)}
        >
          <motion.div 
            className="relative w-full max-w-5xl max-h-[90vh] bg-gradient-to-br from-cyber-darker to-cyber-dark rounded-2xl border-2 border-neon-purple/50 shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 50 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gradient-to-r from-neon-purple via-neon-pink to-neon-blue p-6 border-b-2 border-neon-purple/50">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-3xl font-black text-white mb-2">🚀 AgarFi Roadmap</h2>
                  <p className="text-sm text-white/80">From Concept to GameFi Domination in 7 Days</p>
                </div>
                <button onClick={() => setShowRoadmap(false)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(90vh-120px)] p-6 space-y-6">
              
              {/* Lightning Fast Banner */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-neon-green/20 via-neon-blue/20 to-neon-purple/20 border-2 border-neon-green/50 rounded-2xl p-6 text-center"
              >
                <h3 className="text-3xl font-bold mb-3 gradient-text">⚡ Lightning Fast Development</h3>
                <p className="text-xl text-neon-green font-bold mb-2">Complete Platform in Just 1 Week</p>
                <p className="text-sm text-gray-300">
                  Leveraging cutting-edge protocols (x403, x402) and modern tooling, AgarFi goes from concept to production-ready in 7 days.
                </p>
              </motion.div>

              {/* Phase 1: Days 1-2 */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="relative pl-8 border-l-4 border-neon-green"
              >
                <div className="absolute -left-3 top-0 w-6 h-6 bg-neon-green rounded-full animate-pulse" />
                <div className="bg-cyber-dark/70 backdrop-blur-lg rounded-xl p-6 border border-neon-green/30 hover:border-neon-green transition-all">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                    <div>
                      <h3 className="text-2xl font-bold text-neon-green mb-2">Days 1-2</h3>
                      <p className="text-xl text-gray-300">Core Game System</p>
                    </div>
                    <div className="mt-3 md:mt-0 text-right">
                      <p className="text-sm text-gray-400">48 Hours</p>
                      <span className="inline-block px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold mt-1">
                        ✓ COMPLETE
                      </span>
                    </div>
                  </div>
                  <ul className="space-y-2 text-gray-300 text-sm">
                    {[
                      '60fps Canvas rendering with vanilla JS physics',
                      'Socket.io real-time multiplayer (60Hz server tick)',
                      'Blob mechanics: eat, split, merge, eject pellets',
                      'Seven game modes ($1, $5, $10, $25, $50, $100, Whale)',
                      'Whale Mode infrastructure (50 player lobbies)',
                      'Dynamic lobby system with auto-scaling',
                      'Mobile-optimized touch controls'
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-neon-green mt-0.5">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>

              {/* Phase 2: Days 3-4 */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="relative pl-8 border-l-4 border-neon-blue"
              >
                <div className="absolute -left-3 top-0 w-6 h-6 bg-neon-blue rounded-full animate-pulse" />
                <div className="bg-cyber-dark/70 backdrop-blur-lg rounded-xl p-6 border border-neon-blue/30 hover:border-neon-blue transition-all">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                    <div>
                      <h3 className="text-2xl font-bold text-neon-blue mb-2">Days 3-4</h3>
                      <p className="text-xl text-gray-300">x403 Authentication & Anti-Bot</p>
                    </div>
                    <div className="mt-3 md:mt-0 text-right">
                      <p className="text-sm text-gray-400">48 Hours</p>
                      <span className="inline-block px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-bold mt-1">
                        ⚡ IN PROGRESS
                      </span>
                    </div>
                  </div>
                  
                  {/* x403 Explainer */}
                  <div className="bg-neon-blue/10 border border-neon-blue/30 rounded-lg p-4 mb-4">
                    <p className="text-sm font-bold text-neon-blue mb-2">🔥 Revolutionary x403 Protocol:</p>
                    <p className="text-xs text-gray-300">
                      ECDSA signature verification proves wallet ownership WITHOUT passwords or email. 
                      Bot-resistant, zero PII, one wallet = one concurrent game. Web3 authentication done RIGHT.
                    </p>
                  </div>

                  <ul className="space-y-2 text-gray-300 text-sm">
                    {[
                      'x403 protocol integration (trending Web3 auth)',
                      'Wallet signature verification flow',
                      'User profiles with stats tracking',
                      'Real-time leaderboards (top players)',
                      'One game per wallet enforcement',
                      '35-minute session caching',
                      'Anti-farming pattern detection'
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-neon-blue mt-0.5">→</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>

              {/* Phase 3: Days 5-6 */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="relative pl-8 border-l-4 border-neon-purple"
              >
                <div className="absolute -left-3 top-0 w-6 h-6 bg-neon-purple rounded-full" />
                <div className="bg-cyber-dark/70 backdrop-blur-lg rounded-xl p-6 border border-neon-purple/30 hover:border-neon-purple transition-all">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                    <div>
                      <h3 className="text-2xl font-bold text-neon-purple mb-2">Days 5-6</h3>
                      <p className="text-xl text-gray-300">Payments & Token Economy</p>
                    </div>
                    <div className="mt-3 md:mt-0 text-right">
                      <p className="text-sm text-gray-400">48 Hours</p>
                      <span className="inline-block px-3 py-1 bg-gray-500/20 text-gray-400 rounded-full text-xs font-bold mt-1">
                        ○ SCHEDULED
                      </span>
                    </div>
                  </div>

                  {/* x402 Explainer */}
                  <div className="bg-gradient-to-r from-neon-purple/10 to-neon-pink/10 border border-neon-purple/30 rounded-lg p-4 mb-3">
                    <p className="text-sm font-bold text-neon-purple mb-2">💰 x402 Payment Protocol:</p>
                    <p className="text-xs text-gray-300">
                      Programmatic crypto payments over HTTP using status code 402. No accounts, no sessions, no KYC. 
                      Pure frictionless USDC payments via SPL tokens on Solana.
                    </p>
                  </div>

                  {/* Winning Potential */}
                  <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-lg p-4 mb-4">
                    <p className="text-lg font-black text-yellow-400 mb-2">💎 Win 20x Your Bet!</p>
                    <p className="text-xs text-gray-300">
                      Bet $5, win $100. Bet $100, win $2,000. Winner takes 80% of pot. 
                      Pure skill-based gameplay with deterministic physics. No RNG, no luck.
                    </p>
                  </div>

                  <ul className="space-y-2 text-gray-300 text-sm">
                    {[
                      'Solana USDC payment integration (SPL tokens)',
                      'x402-inspired payment UX (viral prompts)',
                      'Server-managed prize pools with instant payouts',
                      'Automatic AGAR buyback mechanism (Raydium SDK)',
                      '30-day staking smart contract (Anchor)',
                      'Public transaction dashboards',
                      'Real-time pot tracking and transparency'
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-neon-purple mt-0.5">→</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>

              {/* Phase 4: Day 7 */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className="relative pl-8 border-l-4 border-neon-pink"
              >
                <div className="absolute -left-3 top-0 w-6 h-6 bg-neon-pink rounded-full" />
                <div className="bg-cyber-dark/70 backdrop-blur-lg rounded-xl p-6 border border-neon-pink/30 hover:border-neon-pink transition-all">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                    <div>
                      <h3 className="text-2xl font-bold text-neon-pink mb-2">Day 7</h3>
                      <p className="text-xl text-gray-300">Testing, Polish & Launch</p>
                    </div>
                    <div className="mt-3 md:mt-0 text-right">
                      <p className="text-sm text-gray-400">24 Hours</p>
                      <span className="inline-block px-3 py-1 bg-gray-500/20 text-gray-400 rounded-full text-xs font-bold mt-1">
                        ○ SCHEDULED
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-2 text-gray-300 text-sm">
                    {[
                      'End-to-end testing with real mainnet USDC/AGAR',
                      'Security audits and penetration testing',
                      'Performance optimization (60fps guarantee)',
                      'Mobile device testing (iOS/Android browsers)',
                      'Marketing materials and social media setup',
                      'Production deployment (Vercel + Render)',
                      '🎉 PUBLIC BETA LAUNCH'
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-neon-pink mt-0.5">→</span>
                        <span className={i === 6 ? 'font-bold text-neon-pink' : ''}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>

              {/* Whale Mode Unlock */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="relative pl-8 border-l-4 border-yellow-400"
              >
                <div className="absolute -left-3 top-0 w-6 h-6 bg-yellow-400 rounded-full animate-float" />
                <div className="bg-gradient-to-br from-yellow-500/20 via-orange-500/20 to-red-500/20 backdrop-blur-lg rounded-xl p-6 border-2 border-yellow-400/50">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-4xl animate-float">🐋</span>
                    <div>
                      <h3 className="text-3xl font-black gradient-text mb-1">WHALE MODE UNLOCKS</h3>
                      <p className="text-sm text-yellow-400 font-bold">@ $1M Market Cap • Live Service Global Event</p>
                    </div>
                  </div>
                  
                  <div className="bg-black/40 border border-yellow-400/30 rounded-lg p-4 mb-4">
                    <p className="text-xl font-black text-white mb-2">$500 Buy-In • 50 Players • $20,000 Winner</p>
                    <p className="text-sm text-gray-300">
                      The ultimate high-stakes arena. Live spectator mode. Hall of fame. Auto-recorded replays. 
                      This is Web3 gaming's Super Bowl. 🏆
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3 text-sm">
                    {[
                      { icon: '📺', title: 'Live Spectator Mode', desc: 'Watch elite players compete in real-time' },
                      { icon: '🏆', title: 'Hall of Fame', desc: 'Permanent leaderboard of Whale victors' },
                      { icon: '🎥', title: 'Auto-Recorded Replays', desc: 'Every match saved for community' },
                      { icon: '🌐', title: 'Global Event', desc: 'Community notifications when lobby opens' }
                    ].map((feature, i) => (
                      <div key={i} className="flex items-start gap-2 bg-black/30 rounded-lg p-3 border border-yellow-400/20">
                        <span className="text-xl">{feature.icon}</span>
                        <div>
                          <p className="font-bold text-yellow-400 text-xs">{feature.title}</p>
                          <p className="text-gray-400 text-xs">{feature.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

            </div>
          </motion.div>
        </div>
      )}

      {/* Error Toast */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50">
          <motion.div 
            className="bg-red-500 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-2"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {toastMessage}
          </motion.div>
        </div>
      )}

      {/* Transaction Log Modal */}
      <TransactionLog
        isOpen={showTransactionLog}
        onClose={() => setShowTransactionLog(false)}
      />

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowLeaderboard(false)}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-cyber-dark border-2 border-yellow-500/50 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-yellow-500 to-orange-500 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-black text-white flex items-center gap-2">
                <span>🏆</span>
                Top 50 Winners
              </h2>
              <button
                onClick={() => setShowLeaderboard(false)}
                className="text-white/70 hover:text-white transition-colors p-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)] bg-gradient-to-b from-cyber-dark to-cyber-darker">
              <Leaderboard />
            </div>
          </motion.div>
        </div>
      )}

      {/* Countdown Warning - Pot Locked Dialog */}
      <AnimatePresence>
        {showCountdownWarning && pendingJoinTier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gradient-to-br from-red-500/20 to-orange-500/20 border-2 border-red-500/50 rounded-2xl p-6 max-w-md w-full"
            >
              <div className="text-center mb-6">
                <div className="text-6xl mb-4">⚠️</div>
                <h2 className="text-2xl font-black text-red-400 mb-2">POT IS LOCKED!</h2>
                <p className="text-white mb-4">
                  Game is starting soon. Once you join, <span className="font-bold text-red-400">NO REFUNDS</span> will be given.
                </p>
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-4">
                  <p className="text-sm text-red-300 font-bold">⚠️ WARNING</p>
                  <p className="text-xs text-gray-300 mt-1">
                    By clicking "OK", you agree that your entry fee is non-refundable.
                    You must play the game to completion.
                  </p>
                </div>
                {gameModes.find(m => m.tier === pendingJoinTier) && (
                  <p className="text-neon-green font-black text-xl mb-4">
                    Entry Fee: ${gameModes.find(m => m.tier === pendingJoinTier)!.buyIn} USDC
                  </p>
                )}
              </div>
              
              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setShowCountdownWarning(false);
                    setPendingJoinTier(null);
                  }}
                  className="flex-1 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-bold"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={confirmJoinDuringCountdown}
                  className="flex-1 py-3 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white rounded-xl font-bold"
                >
                  OK - Join Now
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
