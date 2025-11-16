import { Server } from 'socket.io';
import { Lobby, Player } from './types.js';
import { config } from './config.js';
import { GameRoom } from './gameRoom.js';
import { BotManager } from './botManager.js';

export class LobbyManager {
  private lobbies: Map<string, Lobby>;
  private games: Map<string, GameRoom>;
  private io: Server;
  private botManager: BotManager;

  constructor(io: Server) {
    this.lobbies = new Map();
    this.games = new Map();
    this.io = io;
    this.botManager = new BotManager();

    // Initialize lobbies for each game mode
    this.initializeLobbies();
  }

  /**
   * Initialize lobbies for all game modes
   */
  private initializeLobbies(): void {
    for (const mode of config.gameModes) {
      if (mode.locked) continue; // Skip Whale Mode for now

      const lobbyId = `lobby_${mode.tier}`;
      
      // Only create lobby if it doesn't exist
      if (!this.lobbies.has(lobbyId)) {
        const lobby: Lobby = {
          id: lobbyId,
          tier: mode.tier,
          players: new Map(),
          status: 'waiting',
          countdownStartTime: null,
          gameStartTime: null,
          maxPlayers: mode.maxPlayers,
        };

        this.lobbies.set(lobbyId, lobby);
        console.log(`Initialized lobby: ${lobbyId}`);
      }
    }
  }

  /**
   * Get all lobbies status
   */
  getLobbiesStatus() {
    return Array.from(this.lobbies.values()).map(lobby => ({
      id: lobby.id,
      tier: lobby.tier,
      playersCount: lobby.players.size,
      maxPlayers: lobby.maxPlayers,
      status: lobby.status,
      countdown: lobby.countdownStartTime 
        ? Math.max(0, config.lobby.autoStartCountdown - (Date.now() - lobby.countdownStartTime))
        : null,
    }));
  }

  /**
   * Join player to lobby
   */
  joinLobby(socketId: string, playerId: string, playerName: string, tier: string): { success: boolean; message?: string } {
    const lobbyId = `lobby_${tier}`;
    const lobby = this.lobbies.get(lobbyId);

    if (!lobby) {
      return { success: false, message: 'Invalid game mode' };
    }

    // If game is in progress, join as spectator instead
    if (lobby.status === 'playing') {
      const game = this.games.get(lobbyId);
      if (game) {
        return { success: false, message: 'Game in progress - spectating not yet implemented' };
      }
    }

    if (lobby.status !== 'waiting' && lobby.status !== 'countdown') {
      return { success: false, message: 'Lobby not accepting players' };
    }

    if (lobby.players.size >= lobby.maxPlayers) {
      return { success: false, message: 'Lobby is full' };
    }

    // Check if player already in another lobby
    for (const l of this.lobbies.values()) {
      if (l.players.has(playerId)) {
        return { success: false, message: 'Already in a lobby' };
      }
    }

    // Join socket to lobby room for updates
    const socket = Array.from(this.io.sockets.sockets.values()).find(s => s.id === socketId);
    if (socket) {
      socket.join(lobbyId);
    }

    // Add player to lobby
    lobby.players.set(playerId, {
      id: playerId,
      socketId,
      name: playerName,
      blobs: [],
      totalMass: 0,
      stats: {
        pelletsEaten: 0,
        cellsEaten: 0,
        maxMass: 0,
        leaderTime: 0,
        bestRank: 999,
        timeSurvived: 0,
      },
      joinTime: Date.now(),
      lastInputTime: Date.now(),
      isBot: false,
    });

    console.log(`Player ${playerName} joined ${tier} lobby (${lobby.players.size}/${lobby.maxPlayers})`);

    // Immediately broadcast lobby update
    this.broadcastSingleLobbyUpdate(lobby);

    // Check if we should start countdown
    this.checkLobbyCountdown(lobby);

    // Auto-fill bots in dev mode
    if (config.dev.autoFillBots && lobby.players.size < config.lobby.minPlayers) {
      this.fillWithBots(lobby);
    }

    return { success: true };
  }

  /**
   * Fill lobby with bots for testing
   */
  private fillWithBots(lobby: Lobby): void {
    const needed = config.lobby.minPlayers - lobby.players.size;
    
    for (let i = 0; i < needed; i++) {
      const botId = `bot_${Date.now()}_${i}`;
      const botName = `Bot ${i + 1}`;

      lobby.players.set(botId, {
        id: botId,
        socketId: '',
        name: botName,
        blobs: [],
        totalMass: 0,
        stats: {
          pelletsEaten: 0,
          cellsEaten: 0,
          maxMass: 0,
          leaderTime: 0,
          bestRank: 999,
          timeSurvived: 0,
        },
        joinTime: Date.now(),
        lastInputTime: Date.now(),
        isBot: true,
      });
    }

    console.log(`Filled ${lobby.tier} lobby with ${needed} bots`);
    this.checkLobbyCountdown(lobby);
  }

  /**
   * Check if lobby should start countdown
   */
  private checkLobbyCountdown(lobby: Lobby): void {
    // Don't start countdown if game is already playing
    if (lobby.status === 'playing') {
      console.log(`Lobby ${lobby.id} already has active game - ignoring countdown check`);
      return;
    }

    // In dev mode with MIN_PLAYERS_DEV=1, start immediately
    if (lobby.status === 'waiting' && config.lobby.minPlayers === 1 && lobby.players.size >= 1) {
      console.log(`Dev mode: Starting game immediately with ${lobby.players.size} player(s)`);
      this.startGame(lobby);
      return;
    }

    if (lobby.status === 'waiting' && lobby.players.size >= config.lobby.minPlayers) {
      lobby.status = 'countdown';
      lobby.countdownStartTime = Date.now();

      console.log(`Lobby ${lobby.id} countdown started (${lobby.players.size}/${lobby.maxPlayers})`);

      // Start countdown timer
      setTimeout(() => {
        // Double-check lobby status before starting
        if (lobby.status === 'countdown') {
          this.startGame(lobby);
        } else {
          console.log(`Lobby ${lobby.id} countdown aborted - status changed to ${lobby.status}`);
        }
      }, config.lobby.autoStartCountdown);
    }
  }

  /**
   * Start game from lobby
   */
  private startGame(lobby: Lobby): void {
    // Check if still have minimum players
    if (lobby.players.size < config.lobby.minPlayers) {
      console.log(`Lobby ${lobby.id} cancelled - insufficient players`);
      lobby.status = 'waiting';
      lobby.countdownStartTime = null;
      this.io.to(lobby.id).emit('lobbyCancelled', { message: 'Not enough players' });
      return;
    }

    lobby.status = 'playing';
    lobby.gameStartTime = Date.now();

    // Create game room
    const game = new GameRoom(lobby.id, lobby.tier, this.io);

    // Add all players to game
    for (const player of lobby.players.values()) {
      game.addPlayer(player.socketId, player.id, player.name, player.isBot);
      
      // If bot, start AI behavior
      if (player.isBot) {
        this.botManager.addBot(player.id, game);
      }
    }

    this.games.set(game.id, game);

    // Start game
    game.start();

    // Emit game start
    this.io.to(lobby.id).emit('gameStart', { startTime: game.gameStartTime, gameId: game.id });

    console.log(`Game ${game.id} started with ${lobby.players.size} players`);

    // DON'T reset lobby - keep it in 'playing' status
    // When game ends, we'll handle cleanup
  }

  /**
   * Reset lobby to waiting state
   */
  resetLobby(lobbyId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    console.log(`Resetting lobby ${lobbyId} to waiting state`);
    lobby.players.clear();
    lobby.status = 'waiting';
    lobby.countdownStartTime = null;
    lobby.gameStartTime = null;
    
    // Broadcast update
    this.broadcastSingleLobbyUpdate(lobby);
  }

  /**
   * Handle game end
   */
  handleGameEnd(gameId: string): void {
    const game = this.games.get(gameId);
    if (!game) return;

    console.log(`Game ${gameId} ended, cleaning up`);
    
    // Stop game
    game.stop();
    
    // Remove from games map
    this.games.delete(gameId);
    
    // Reset the lobby for this tier
    this.resetLobby(gameId);
  }

  /**
   * Get game by ID
   */
  getGame(gameId: string): GameRoom | undefined {
    return this.games.get(gameId);
  }

  /**
   * Remove player from lobby by player ID (ONLY for lobby, not active games)
   */
  leaveLobby(playerId: string): void {
    for (const lobby of this.lobbies.values()) {
      // Only remove from lobby if game hasn't started yet
      if (lobby.status === 'playing') {
        console.log(`Cannot leave lobby ${lobby.id} - game is already playing`);
        continue; // Skip lobbies with active games
      }

      if (lobby.players.has(playerId)) {
        lobby.players.delete(playerId);
        console.log(`Player ${playerId} left lobby ${lobby.id} (${lobby.players.size}/${lobby.maxPlayers} remaining)`);

        // Broadcast immediate update
        this.broadcastSingleLobbyUpdate(lobby);

        // If in countdown and drops below minimum, cancel
        if (lobby.status === 'countdown' && lobby.players.size < config.lobby.minPlayers) {
          lobby.status = 'waiting';
          lobby.countdownStartTime = null;
          console.log(`Lobby ${lobby.id} countdown cancelled - below minimum`);
          this.io.to(lobby.id).emit('lobbyCancelled', { message: 'Countdown cancelled - not enough players' });
        }
        break;
      }
    }
  }

  /**
   * Handle socket disconnection - remove from lobby or game
   */
  handleDisconnect(socketId: string): void {
    // Check lobbies
    for (const lobby of this.lobbies.values()) {
      for (const [playerId, player] of lobby.players.entries()) {
        if (player.socketId === socketId) {
          this.leaveLobby(playerId);
          return;
        }
      }
    }

    // Check active games - eliminate player when they disconnect
    for (const game of this.games.values()) {
      for (const player of game.players.values()) {
        if (player.socketId === socketId && !player.isBot) {
          console.log(`Player ${player.name} disconnected from game ${game.id} - eliminating`);
          
          // Remove all blobs (eliminates player)
          player.blobs = [];
          player.stats.timeSurvived = (Date.now() - player.joinTime) / 1000;
          
          return;
        }
      }
    }
  }

  /**
   * Broadcast single lobby update immediately
   */
  private broadcastSingleLobbyUpdate(lobby: Lobby): void {
    const countdown = lobby.countdownStartTime
      ? Math.max(0, Math.floor((config.lobby.autoStartCountdown - (Date.now() - lobby.countdownStartTime)) / 1000))
      : null;

    const update = {
      tier: lobby.tier,
      playersLocked: lobby.players.size,
      maxPlayers: lobby.maxPlayers,
      status: lobby.status,
      countdown,
    };

    this.io.emit('lobbyUpdate', update); // Global for homepage
    this.io.to(lobby.id).emit('lobbyUpdate', update); // To lobby room
  }

  /**
   * Broadcast lobby updates
   */
  broadcastLobbyUpdates(): void {
    setInterval(() => {
      for (const lobby of this.lobbies.values()) {
        // Only broadcast if lobby has players or is in countdown
        if (lobby.players.size > 0 || lobby.status !== 'waiting') {
          this.broadcastSingleLobbyUpdate(lobby);
        }
      }
    }, 1000);
  }
}

