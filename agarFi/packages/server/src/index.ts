import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from './config.js';
import { LobbyManager } from './lobbyManager.js';

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

const lobbyManager = new LobbyManager(io);

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

// Socket.io Events
io.on('connection', (socket) => {
  connectedClients++;
  console.log(`Client connected: ${socket.id} (Total: ${connectedClients})`);
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

  // Player joins lobby
  socket.on('playerJoinLobby', ({ playerId, playerName, tier }) => {
    const result = lobbyManager.joinLobby(socket.id, playerId, playerName, tier);
    
    if (result.success) {
      const lobbyId = `lobby_${tier}`;
      socket.join(lobbyId);
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


