import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from './config.js';
import { LobbyManager } from './lobbyManager.js';
import { WalletManager } from './wallet/walletManager.js';
import { PaymentService } from './wallet/paymentService.js';
import { getAllTransactions, getRecentTransactions } from './wallet/transactionLogger.js';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Map to track player wallet addresses
const playerWallets = new Map<string, string>();

// Map to track which lobby each player is in (for cleanup on disconnect)
const playerToLobby = new Map<string, string>(); // playerId -> lobbyId

// Anti-farming: Track active players by IP address
const activePlayersByIP = new Map<string, Set<string>>(); // IP -> Set of playerIds

// Whitelist dev IPs (set via environment variable)
// Localhost is always whitelisted for testing
const DEV_IP_WHITELIST = [
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  ...(process.env.DEV_IP_WHITELIST?.split(',').map(ip => ip.trim()).filter(ip => ip) || [])
];

const lobbyManager = new LobbyManager(io);

// Initialize payment service (if configured)
let paymentService: PaymentService | null = null;
if (process.env.PLATFORM_WALLET_PRIVATE_KEY && process.env.SOLANA_RPC_URL) {
  try {
    const walletManager = new WalletManager(
      process.env.SOLANA_RPC_URL,
      process.env.PLATFORM_WALLET_PRIVATE_KEY,
      process.env.USDC_MINT_ADDRESS || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      parseFloat(process.env.WINNER_REWARD_USDC || '1')
    );
    paymentService = new PaymentService(walletManager);
    console.log('💰 Payment service initialized');
    console.log(`   Platform wallet: ${walletManager.getPlatformAddress()}`);
    console.log(`   Winner reward: ${walletManager.getRewardAmount()} USDC`);
    
    // Set winner payout callback on lobby manager
    lobbyManager.setWinnerPayoutCallback(async (winnerId, winnerName, gameId, tier, playersCount) => {
      const walletAddress = playerWallets.get(winnerId);
      
      if (!walletAddress) {
        console.error(`❌ No wallet address found for winner ${winnerName} (${winnerId})`);
        return;
      }
      
      console.log(`💰 Processing payout for winner: ${winnerName} (${walletAddress})`);
      
      const result = await paymentService!.sendWinnerPayout(
        winnerId,
        winnerName,
        walletAddress,
        gameId,
        tier,
        playersCount
      );
      
      if (result.success) {
        console.log(`✅ Winner ${winnerName} paid ${walletManager.getRewardAmount()} USDC`);
        console.log(`   TX: ${result.txSignature}`);
      } else {
        console.error(`❌ Failed to pay winner ${winnerName}: ${result.error}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize payment service:', error);
    console.error('   Games will run without payouts');
  }
}

// Track total connected clients
let connectedClients = 0;

// Helper function to broadcast stats
const broadcastStats = () => {
  io.emit('statsUpdate', {
    connectedClients,
    playersInGame: lobbyManager.getPlayersInGameCount(),
    totalSpectators: lobbyManager.getTotalSpectators()
  });
};

// REST API Endpoints
app.get('/api/health', (req: any, res: any) => {
  res.json({ status: 'healthy', timestamp: Date.now() });
});

app.get('/api/lobbies', (req: any, res: any) => {
  res.json(lobbyManager.getLobbiesStatus());
});

app.get('/api/stats', (req: any, res: any) => {
  res.json({
    connectedClients,
    playersInGame: lobbyManager.getPlayersInGameCount(),
    totalSpectators: lobbyManager.getTotalSpectators()
  });
});

app.get('/api/debug/spectators', (req: any, res: any) => {
  const games = lobbyManager['games'];
  const spectatorDebug: any = {};
  
  for (const [gameId, game] of games.entries()) {
    spectatorDebug[gameId] = {
      spectatorCount: game.gameState.spectators.size,
      spectatorIds: Array.from(game.gameState.spectators),
      connectedSockets: Array.from(game.gameState.spectators).map(id => {
        const socket = io.sockets.sockets.get(id);
        return {
          socketId: id,
          connected: socket ? socket.connected : false
        };
      })
    };
  }
  
  res.json({
    totalGames: games.size,
    totalSpectators: lobbyManager.getTotalSpectators(),
    games: spectatorDebug
  });
});

app.get('/api/game-modes', (req: any, res: any) => {
  res.json(config.gameModes);
});

// Transaction log endpoint
app.get('/api/transactions', (req: any, res: any) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 50;
  const transactions = getRecentTransactions(limit);
  res.json({ transactions });
});

// Platform wallet status endpoint
app.get('/api/platform-status', async (req: any, res: any) => {
  if (!paymentService) {
    res.json({
      enabled: false,
      balance: 0,
      canPay: false,
      message: 'Payment service not configured'
    });
    return;
  }

  try {
    const balance = await paymentService.getPlatformBalance();
    const canPay = await paymentService.canPayWinners();
    
    res.json({
      enabled: true,
      balance,
      canPay,
      message: canPay ? 'Creator rewards available' : 'Waiting for more creator rewards to fund games'
    });
  } catch (error) {
    res.status(500).json({
      enabled: true,
      balance: 0,
      canPay: false,
      error: 'Failed to check platform status'
    });
  }
});

// Socket.io Events
io.on('connection', (socket) => {
  connectedClients++;
  
  // Get client IP address
  const clientIP = socket.handshake.address || socket.handshake.headers['x-forwarded-for'] || 'unknown';
  console.log(`Client connected: ${socket.id} from IP: ${clientIP} (Total: ${connectedClients})`);
  
  broadcastStats();

  // Player reconnects to existing game
  socket.on('playerReconnect', ({ playerId, gameId }) => {
    const game = lobbyManager.getGame(gameId);
    if (game && game.players.has(playerId)) {
      // Update socket ID for reconnected player
      const player = game.players.get(playerId);
      if (player) {
        player.socketId = socket.id;
        socket.join(gameId);
        socket.emit('reconnected', { gameId });
        console.log(`Player ${playerId} reconnected to game ${gameId}`);
      }
    } else {
      // Game doesn't exist or player not in it, join new lobby
      socket.emit('gameNotFound');
    }
  });

  // Player joins lobby (with optional wallet address)
  socket.on('playerJoinLobby', ({ playerId, playerName, tier, walletAddress }) => {
    // Get client IP
    const clientIP = socket.handshake.address || socket.handshake.headers['x-forwarded-for'] || 'unknown';
    const ipString = Array.isArray(clientIP) ? clientIP[0] : clientIP;
    
    // Check if IP is whitelisted (dev testing)
    const isWhitelisted = DEV_IP_WHITELIST.includes(ipString);
    
    // Anti-farming: Check if this IP already has an active player in a lobby or game
    if (!isWhitelisted && ipString !== 'unknown') {
      const existingPlayers = activePlayersByIP.get(ipString) || new Set();
      
      if (existingPlayers.size > 0) {
        console.log(`🚫 IP ${ipString} already has ${existingPlayers.size} active player(s) - blocking ${playerName}`);
        socket.emit('error', { 
          message: 'Only one game per connection allowed. Please wait for your current game to finish.',
          code: 429 
        });
        return;
      }
    }
    
    // Store wallet address if provided
    if (walletAddress) {
      playerWallets.set(playerId, walletAddress);
      console.log(`💼 Wallet registered for ${playerName}: ${walletAddress}`);
    }
    
    const result = lobbyManager.joinLobby(socket.id, playerId, playerName, tier);
    
    if (result.success) {
      const lobbyId = `lobby_${tier}`;
      socket.join(lobbyId);
      
      // Track which lobby this player is in
      playerToLobby.set(playerId, lobbyId);
      
      // Track this player under their IP address
      const clientIP = socket.handshake.address || socket.handshake.headers['x-forwarded-for'] || 'unknown';
      const ipString = Array.isArray(clientIP) ? clientIP[0] : clientIP;
      
      if (ipString !== 'unknown') {
        if (!activePlayersByIP.has(ipString)) {
          activePlayersByIP.set(ipString, new Set());
        }
        activePlayersByIP.get(ipString)!.add(playerId);
        console.log(`📊 IP ${ipString} now has ${activePlayersByIP.get(ipString)!.size} active player(s)`);
      }
      
      socket.emit('lobbyJoined', { lobbyId, tier });
      
      // Immediately send lobby status to this player
      const status = lobbyManager.getLobbiesStatus().find(l => l.tier === tier);
      if (status) {
        socket.emit('lobbyUpdate', {
          tier: status.tier,
          playersLocked: status.playersCount,
          maxPlayers: status.maxPlayers,
          countdown: status.countdown,
          status: status.status,
          spectatorCount: status.spectatorCount,
        });
      }
    } else {
      socket.emit('error', { message: result.message, code: 400 });
    }
  });

  // Join as spectator (from homepage)
  socket.on('joinAsSpectator', ({ tier }) => {
    console.log(`🎥 NEW SPECTATOR request for tier ${tier} from socket ${socket.id}`);
    const result = lobbyManager.joinAsSpectator(socket.id, tier);
    
    console.log(`Spectator join result:`, result);
    
    if (result.success && result.gameId) {
      socket.join(result.gameId);
      socket.emit('spectatorJoined', { gameId: result.gameId, tier });
      console.log(`✅ SPECTATOR ${socket.id} joined game ${result.gameId}`);
      broadcastStats();
    } else {
      console.error(`❌ SPECTATOR JOIN FAILED: ${result.message}`);
      socket.emit('error', { message: result.message || 'Could not join as spectator', code: 400 });
    }
  });

  // Player becomes spectator after dying
  socket.on('becomeSpectator', ({ playerId, gameId }) => {
    console.log(`💀 Player ${playerId} became spectator in game ${gameId}`);
    const game = lobbyManager.getGame(gameId);
    if (game) {
      game.gameState.spectators.add(socket.id);
      console.log(`Spectator count now: ${game.gameState.spectators.size}`);
      broadcastStats();
    }
  });

  // Player movement
  socket.on('playerMove', ({ playerId, x, y, gameId }) => {
    const game = lobbyManager.getGame(gameId);
    if (game) {
      game.handlePlayerMove(playerId, x, y);
    }
  });

  // Player split
  socket.on('playerSplit', ({ playerId, gameId, targetX, targetY }) => {
    const game = lobbyManager.getGame(gameId);
    if (game) {
      game.handlePlayerSplit(playerId, targetX, targetY);
    }
  });

  // Player eject
  socket.on('playerEject', ({ playerId, gameId, targetX, targetY }) => {
    const game = lobbyManager.getGame(gameId);
    if (game) {
      game.handlePlayerEject(playerId, targetX, targetY);
    }
  });

  // Player leaves lobby (explicit)
  socket.on('playerLeaveLobby', ({ playerId }) => {
    console.log(`👋 Player ${playerId} explicitly leaving lobby`);
    lobbyManager.leaveLobby(playerId);
    playerToLobby.delete(playerId);
    
    // Remove from IP tracking
    const clientIP = socket.handshake.address || socket.handshake.headers['x-forwarded-for'] || 'unknown';
    const ipString = Array.isArray(clientIP) ? clientIP[0] : clientIP;
    
    if (ipString !== 'unknown' && activePlayersByIP.has(ipString)) {
      activePlayersByIP.get(ipString)!.delete(playerId);
      if (activePlayersByIP.get(ipString)!.size === 0) {
        activePlayersByIP.delete(ipString);
      }
      console.log(`📊 IP ${ipString} now has ${activePlayersByIP.get(ipString)?.size || 0} active player(s)`);
    }
    
    broadcastStats();
  });

  // Player leaves spectate mode
  socket.on('leaveSpectate', ({ gameId }) => {
    console.log(`👁️ Spectator ${socket.id} requesting to leave game ${gameId}`);
    const game = lobbyManager.getGame(gameId);
    if (game) {
      const hadSpectator = game.gameState.spectators.has(socket.id);
      game.gameState.spectators.delete(socket.id);
      console.log(`Spectator removed: ${hadSpectator ? 'YES' : 'NO (was not in set)'}`);
      console.log(`Spectator count now: ${game.gameState.spectators.size}`);
      console.log(`Total spectators across all games: ${lobbyManager.getTotalSpectators()}`);
      broadcastStats();
    } else {
      console.log(`⚠️ Game ${gameId} not found for spectator leave`);
    }
  });

  // Global chat message
  socket.on('chatMessage', ({ username, message }) => {
    if (!username || !message || message.length > 200) return;
    
    // Broadcast to all connected clients
    io.emit('chatMessage', {
      username: username.trim(),
      message: message.trim()
    });
    
    console.log(`💬 Chat: ${username}: ${message}`);
  });

  // Player disconnects
  socket.on('disconnect', () => {
    connectedClients--;
    console.log(`🔌 Client disconnected: ${socket.id} (Total: ${connectedClients})`);
    
    // Find and remove player from lobby if they were in one
    let playerIdToRemove: string | null = null;
    for (const [playerId, lobbyId] of playerToLobby.entries()) {
      // Find player by socket ID
      const lobby = lobbyManager['lobbies'].get(lobbyId);
      if (lobby) {
        for (const [pid, player] of lobby.players.entries()) {
          if (player.socketId === socket.id) {
            playerIdToRemove = pid;
            break;
          }
        }
      }
      if (playerIdToRemove) break;
    }
    
    if (playerIdToRemove) {
      console.log(`👋 Removing disconnected player ${playerIdToRemove} from lobby`);
      lobbyManager.leaveLobby(playerIdToRemove);
      playerToLobby.delete(playerIdToRemove);
      
      // Remove from IP tracking
      const clientIP = socket.handshake.address || socket.handshake.headers['x-forwarded-for'] || 'unknown';
      const ipString = Array.isArray(clientIP) ? clientIP[0] : clientIP;
      
      if (ipString !== 'unknown' && activePlayersByIP.has(ipString)) {
        activePlayersByIP.get(ipString)!.delete(playerIdToRemove);
        if (activePlayersByIP.get(ipString)!.size === 0) {
          activePlayersByIP.delete(ipString);
        }
        console.log(`📊 IP ${ipString} now has ${activePlayersByIP.get(ipString)?.size || 0} active player(s)`);
      }
      
      // Keep wallet address for payout even if disconnected
    }
    
    let wasSpectator = false;
    
    // Remove from spectators in all games
    for (const game of lobbyManager['games'].values()) {
      if (game.gameState.spectators.has(socket.id)) {
        game.gameState.spectators.delete(socket.id);
        wasSpectator = true;
        console.log(`👁️ Removed spectator ${socket.id} from game ${game.id} (${game.gameState.spectators.size} remaining)`);
      }
    }
    
    if (wasSpectator) {
      console.log(`Total spectators after cleanup: ${lobbyManager.getTotalSpectators()}`);
    }
    
    // Broadcast updated stats after cleanup
    console.log(`📊 Broadcasting stats: ${connectedClients} connected, ${lobbyManager.getPlayersInGameCount()} in game, ${lobbyManager.getTotalSpectators()} spectating`);
    broadcastStats();
  });
});

// Start lobby broadcast loop
lobbyManager.broadcastLobbyUpdates();

// Start stats broadcast loop (every 2 seconds to keep counts accurate)
let statsBroadcastCount = 0;
setInterval(() => {
  statsBroadcastCount++;
  
  // Clean up disconnected spectators before calculating stats
  lobbyManager.cleanupDisconnectedSpectators(io);
  
  const playersInGame = lobbyManager.getPlayersInGameCount();
  const totalSpectators = lobbyManager.getTotalSpectators();
  
  // Only log every 10 broadcasts (every 20 seconds) to avoid spam
  if (statsBroadcastCount % 10 === 0) {
    console.log(`📊 [Periodic] Stats: ${connectedClients} connected | ${playersInGame} in game | ${totalSpectators} spectating | ${connectedClients - playersInGame - totalSpectators} browsing`);
  }
  
  broadcastStats();
}, 2000);

// Start server
const PORT = config.server.port;
httpServer.listen(PORT, () => {
  console.log(`🚀 AgarFi Server running on port ${PORT}`);
  console.log(`   Tick Rate: ${config.server.tickRate}Hz`);
  console.log(`   Map Size: ${config.game.mapWidth}x${config.game.mapHeight}`);
  console.log(`   Min Players: ${config.lobby.minPlayers}`);
  console.log(`   Auto-fill Bots: ${config.dev.autoFillBots}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`   MIN_PLAYERS_DEV: ${process.env.MIN_PLAYERS_DEV}`);
});

// Graceful shutdown handlers
const shutdown = (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  httpServer.close(() => {
    console.log('HTTP server closed');
  });

  // Shutdown lobby manager and all games
  lobbyManager.shutdown();

  // Give time for cleanup then exit
  setTimeout(() => {
    console.log('Graceful shutdown complete');
    process.exit(0);
  }, 2000);
};

// Handle various shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));  // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // Kill command
process.on('SIGUSR2', () => shutdown('SIGUSR2')); // Nodemon restart

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('UNHANDLED_REJECTION');
});


