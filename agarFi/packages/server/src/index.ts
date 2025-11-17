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

// REST API Endpoints
app.get('/api/health', (req: any, res: any) => {
  res.json({ status: 'healthy', timestamp: Date.now() });
});

app.get('/api/lobbies', (req: any, res: any) => {
  res.json(lobbyManager.getLobbiesStatus());
});

app.get('/api/game-modes', (req: any, res: any) => {
  res.json(config.gameModes);
});

// Socket.io Events
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

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
    console.log(`Spectator ${socket.id} leaving game ${gameId}`);
    const game = lobbyManager.getGame(gameId);
    if (game) {
      game.gameState.spectators.delete(socket.id);
      console.log(`Spectator count now: ${game.gameState.spectators.size}`);
    }
  });

  // Player disconnects
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // Remove from spectators in all games
    for (const game of lobbyManager['games'].values()) {
      if (game.gameState.spectators.has(socket.id)) {
        game.gameState.spectators.delete(socket.id);
        console.log(`Removed spectator ${socket.id} from game ${game.id} (${game.gameState.spectators.size} remaining)`);
      }
    }
  });
});

// Start lobby broadcast loop
lobbyManager.broadcastLobbyUpdates();

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

