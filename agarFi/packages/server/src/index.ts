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
    origin: process.env.NODE_ENV === 'production' 
      ? [process.env.CLIENT_URL || 'https://agarfi-client.onrender.com']
      : '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const lobbyManager = new LobbyManager(io);

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: Date.now() });
});

app.get('/api/lobbies', (req, res) => {
  res.json(lobbyManager.getLobbiesStatus());
});

app.get('/api/game-modes', (req, res) => {
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
        });
      }
    } else {
      socket.emit('error', { message: result.message, code: 400 });
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

  // Player disconnects
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    // TODO: Handle disconnect grace period
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

