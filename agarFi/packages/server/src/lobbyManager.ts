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

      const lobby: Lobby = {
        id: `lobby_${mode.tier}`,
        tier: mode.tier,
        players: new Map(),
        status: 'waiting',
        countdownStartTime: null,
        gameStartTime: null,
        maxPlayers: mode.maxPlayers,
      };

      this.lobbies.set(lobby.id, lobby);
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

    if (lobby.status !== 'waiting' && lobby.status !== 'countdown') {
      return { success: false, message: 'Lobby is full or game in progress' };
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
        this.startGame(lobby);
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

    // Clear lobby after game starts
    setTimeout(() => {
      this.resetLobby(lobby);
    }, 1000);
  }

  /**
   * Reset lobby to waiting state
   */
  private resetLobby(lobby: Lobby): void {
    lobby.players.clear();
    lobby.status = 'waiting';
    lobby.countdownStartTime = null;
    lobby.gameStartTime = null;
  }

  /**
   * Get game by ID
   */
  getGame(gameId: string): GameRoom | undefined {
    return this.games.get(gameId);
  }

  /**
   * Remove player from lobby
   */
  leaveLobby(playerId: string): void {
    for (const lobby of this.lobbies.values()) {
      if (lobby.players.has(playerId)) {
        lobby.players.delete(playerId);
        console.log(`Player ${playerId} left lobby ${lobby.id}`);

        // If in countdown and drops below minimum, cancel
        if (lobby.status === 'countdown' && lobby.players.size < config.lobby.minPlayers) {
          lobby.status = 'waiting';
          lobby.countdownStartTime = null;
          console.log(`Lobby ${lobby.id} countdown cancelled - below minimum`);
        }
        break;
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

