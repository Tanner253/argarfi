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
  private onWinnerDetermined?: (winnerId: string, winnerName: string, gameId: string, tier: string, playersCount: number) => Promise<void>;
  private onLobbyReset?: (playerIds: string[]) => void;

  constructor(io: Server) {
    this.lobbies = new Map();
    this.games = new Map();
    this.io = io;
    this.botManager = new BotManager();

    // Initialize lobbies for each game mode
    this.initializeLobbies();
  }

  /**
   * Set winner payout callback
   */
  setWinnerPayoutCallback(callback: (winnerId: string, winnerName: string, gameId: string, tier: string, playersCount: number) => Promise<void>): void {
    this.onWinnerDetermined = callback;
  }

  /**
   * Set lobby reset callback (for clearing IP tracking)
   */
  setLobbyResetCallback(callback: (playerIds: string[]) => void): void {
    this.onLobbyReset = callback;
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
        spectators: new Set(),
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
    return Array.from(this.lobbies.values()).map(lobby => {
      // Get game if playing
      const game = lobby.status === 'playing' ? this.games.get(lobby.id) : null;
      const spectatorCount = game ? game.gameState.spectators.size : lobby.spectators.size;
      
      let realPlayerCount = 0;
      let botCount = 0;
      
      if (game && lobby.status === 'playing') {
        // Count alive players and bots in active game
        for (const player of game.players.values()) {
          if (player.blobs.length > 0) {
            if (player.isBot) {
              botCount++;
            } else {
              realPlayerCount++;
            }
          }
        }
      } else {
        // Count players in lobby
        for (const player of lobby.players.values()) {
          if (player.isBot) {
            botCount++;
          } else {
            realPlayerCount++;
          }
        }
      }
      
      return {
        id: lobby.id,
        tier: lobby.tier,
        playersCount: realPlayerCount + botCount,
        realPlayerCount,
        botCount,
        maxPlayers: lobby.maxPlayers,
        status: lobby.status,
        spectatorCount,
        countdown: lobby.countdownStartTime 
          ? Math.max(0, config.lobby.autoStartCountdown - (Date.now() - lobby.countdownStartTime))
          : null,
      };
    });
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

    if (lobby.status === 'playing') {
      return { success: false, message: 'Game in progress - join as spectator instead' };
    }

    if (lobby.status !== 'waiting' && lobby.status !== 'countdown') {
      return { success: false, message: 'Lobby not available' };
    }

    // Check if player already in another lobby
    for (const l of this.lobbies.values()) {
      if (l.players.has(playerId)) {
        return { success: false, message: 'Already in a lobby' };
      }
    }

    // During countdown, replace a bot if lobby is full
    if (lobby.players.size >= lobby.maxPlayers) {
      if (lobby.status === 'countdown') {
        // Find and remove a bot
        const botToReplace = Array.from(lobby.players.values()).find(p => p.isBot);
        if (botToReplace) {
          lobby.players.delete(botToReplace.id);
          console.log(`Replaced bot ${botToReplace.name} with player ${playerName}`);
        } else {
          return { success: false, message: 'Lobby is full' };
        }
      } else {
        return { success: false, message: 'Lobby is full' };
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

    // Auto-fill bots in dev mode (only if lobby is waiting and no game exists)
    if (config.dev.autoFillBots && 
        lobby.status === 'waiting' && 
        !this.games.has(lobby.id) &&
        lobby.players.size < config.lobby.minPlayers) {
      this.fillWithBots(lobby);
    }

    return { success: true };
  }

  /**
   * Fill lobby with bots for testing (max 10 bots)
   */
  private fillWithBots(lobby: Lobby): void {
    const MAX_BOTS = 10;
    const currentBotCount = Array.from(lobby.players.values()).filter(p => p.isBot).length;
    const needed = Math.min(config.lobby.minPlayers - lobby.players.size, MAX_BOTS - currentBotCount);
    
    if (needed <= 0) return;
    
    // SAFEGUARD: Don't fill if game already exists or not waiting
    if (this.games.has(lobby.id) || lobby.status !== 'waiting') {
      return;
    }
    
    for (let i = 0; i < needed; i++) {
      const botId = `bot_${Date.now()}_${i}`;
      const botName = `Bot ${currentBotCount + i + 1}`;

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

    console.log(`Filled ${lobby.tier} lobby with ${needed} bots (max 10)`);
    this.checkLobbyCountdown(lobby);
  }

  /**
   * Check if lobby should start countdown
   */
  private checkLobbyCountdown(lobby: Lobby): void {
    // SAFEGUARD: Don't start countdown if game already exists
    if (this.games.has(lobby.id)) {
      console.log(`⚠️ Game ${lobby.id} already exists - skipping countdown`);
      return;
    }
    
    // SAFEGUARD: Only start from 'waiting' status
    if (lobby.status !== 'waiting') {
      return;
    }
    
    // In dev mode with MIN_PLAYERS_DEV=1, start immediately
    if (config.lobby.minPlayers === 1 && lobby.players.size >= 1) {
      console.log(`Dev mode: Starting game immediately with ${lobby.players.size} player(s)`);
      this.startGame(lobby);
      return;
    }

    if (lobby.players.size >= config.lobby.minPlayers) {
      lobby.status = 'countdown';
      lobby.countdownStartTime = Date.now();

      console.log(`Lobby ${lobby.id} countdown started (${lobby.players.size}/${lobby.maxPlayers})`);

      // Start countdown timer
      setTimeout(() => {
        // Double-check before starting
        if (lobby.status === 'countdown' && !this.games.has(lobby.id)) {
        this.startGame(lobby);
        } else {
          console.log(`⚠️ Countdown finished but lobby ${lobby.id} status is ${lobby.status} or game exists - skipping start`);
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

    // SAFEGUARD: Don't start if a game already exists
    if (this.games.has(lobby.id)) {
      console.log(`⚠️ Game ${lobby.id} already exists - aborting start`);
      return;
    }
    
    // SAFEGUARD: Only start from 'waiting' or 'countdown' status
    if (lobby.status !== 'waiting' && lobby.status !== 'countdown') {
      console.log(`⚠️ Lobby ${lobby.id} status is ${lobby.status} - aborting start`);
      return;
    }

    lobby.status = 'playing';
    lobby.gameStartTime = Date.now();
    
    const humanPlayers = Array.from(lobby.players.values()).filter(p => !p.isBot);
    const botPlayers = Array.from(lobby.players.values()).filter(p => p.isBot);
    console.log(`✅ STARTING GAME ${lobby.id}`);
    console.log(`   Tier: ${lobby.tier}`);
    console.log(`   Players: ${humanPlayers.length} human, ${botPlayers.length} bots`);
    console.log(`   Human players: ${humanPlayers.map(p => p.name).join(', ')}`);

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

    // Emit global game start event for feed
    this.io.emit('gameEvent', {
      type: 'game_start',
      tier: lobby.tier
    });

    console.log(`Game ${game.id} started with ${lobby.players.size} players`);

    // Set up winner payout callback
    if (this.onWinnerDetermined) {
      game.onWinnerDetermined = this.onWinnerDetermined;
    }

    // Set up game end cleanup - remove game and reset lobby when done
    game.onGameEnd = () => {
      console.log(`🎮 Game ${game.id} ended callback - removing from games map`);
      this.games.delete(game.id);
      this.resetLobby(lobby);
      this.broadcastSingleLobbyUpdate(lobby);
    };

  }

  /**
   * Reset lobby to waiting state
   */
  private resetLobby(lobby: Lobby): void {
    console.log(`Resetting lobby ${lobby.id} - clearing ${lobby.players.size} players, ${lobby.spectators.size} spectators`);
    
    // Call callback to clear IP tracking for these players
    const playerIds = Array.from(lobby.players.keys());
    if (playerIds.length > 0 && this.onLobbyReset) {
      this.onLobbyReset(playerIds);
    }
    
    // Clear all lobby state
    lobby.players.clear();
    lobby.spectators.clear();
    lobby.status = 'waiting';
    lobby.countdownStartTime = null;
    lobby.gameStartTime = null;
    
    // SAFEGUARD: Ensure no game exists for this lobby
    if (this.games.has(lobby.id)) {
      console.log(`⚠️ Found orphaned game ${lobby.id} during reset - removing it`);
      const game = this.games.get(lobby.id);
      if (game) {
        game.stop();
      }
      this.games.delete(lobby.id);
    }
    
    console.log(`Lobby ${lobby.id} now in WAITING state, ready for new players`);
  }

  /**
   * Join as spectator
   */
  joinAsSpectator(socketId: string, tier: string): { success: boolean; message?: string; gameId?: string } {
    const lobbyId = `lobby_${tier}`;
    const lobby = this.lobbies.get(lobbyId);

    console.log(`Spectator attempting to join lobby: ${lobbyId}, Status: ${lobby?.status}`);

    if (!lobby) {
      console.error(`Spectator error: Lobby not found for tier ${tier}`);
      return { success: false, message: 'Invalid game mode' };
    }

    if (lobby.status !== 'playing') {
      console.error(`Spectator error: Lobby status is ${lobby.status}, not 'playing'`);
      return { success: false, message: `Game is ${lobby.status}, not in progress. Please wait for game to start.` };
    }

    const game = this.games.get(lobby.id);
    if (!game) {
      console.error(`Spectator error: Game not found in games map for ${lobby.id}`);
      return { success: false, message: 'Game not found in active games' };
    }

    // Add to spectators
    game.gameState.spectators.add(socketId);
    
    console.log(`✅ Spectator ${socketId} joined ${tier} game (${game.gameState.spectators.size} spectators)`);

    return { success: true, gameId: game.id };
  }

  /**
   * Get game by ID
   */
  getGame(gameId: string): GameRoom | undefined {
    return this.games.get(gameId);
  }

  /**
   * Remove ended game and clean up
   */
  removeGame(gameId: string): void {
    const game = this.games.get(gameId);
    if (game) {
      game.stop();
      this.games.delete(gameId);
      console.log(`Game ${gameId} removed from games map`);
    }
  }

  /**
   * Shutdown all active games and lobbies
   */
  shutdown(): void {
    console.log('Shutting down LobbyManager...');
    
    // Stop all active games
    for (const [gameId, game] of this.games.entries()) {
      console.log(`Stopping game ${gameId}...`);
      game.stop();
      this.io.to(gameId).emit('serverShutdown', { message: 'Server is shutting down' });
    }
    this.games.clear();

    // Reset all lobbies
    for (const lobby of this.lobbies.values()) {
      console.log(`Resetting lobby ${lobby.id}...`);
      this.io.to(lobby.id).emit('lobbyCancelled', { message: 'Server is shutting down' });
      this.resetLobby(lobby);
    }

    // Clear bot manager
    this.botManager.clearAll();

    console.log('LobbyManager shutdown complete');
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

    // Get game if playing
    const game = lobby.status === 'playing' ? this.games.get(lobby.id) : null;
    const spectatorCount = game ? game.gameState.spectators.size : lobby.spectators.size;
    
    // Calculate time remaining for active games
    let timeRemaining: number | null = null;
    if (game && lobby.status === 'playing') {
      const elapsed = Date.now() - game.gameStartTime;
      timeRemaining = Math.max(0, game.maxDuration - elapsed);
    }
    
    let realPlayerCount = 0;
    let botCount = 0;
    
    if (game && lobby.status === 'playing') {
      // Count alive players and bots in active game
      for (const player of game.players.values()) {
        if (player.blobs.length > 0) {
          if (player.isBot) {
            botCount++;
          } else {
            realPlayerCount++;
          }
        }
      }
    } else {
      // Count players in lobby
      for (const player of lobby.players.values()) {
        if (player.isBot) {
          botCount++;
        } else {
          realPlayerCount++;
        }
      }
    }

    const update = {
      tier: lobby.tier,
      playersLocked: realPlayerCount + botCount,
      realPlayerCount,
      botCount,
      maxPlayers: lobby.maxPlayers,
      minPlayers: config.lobby.minPlayers,
      status: lobby.status,
      countdown,
      spectatorCount,
      timeRemaining,
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

  /**
   * Get count of active games
   */
  getActiveGamesCount(): number {
    return this.games.size;
  }

  /**
   * Get count of players currently in active games (alive and playing)
   */
  getPlayersInGameCount(): number {
    let count = 0;
    for (const game of this.games.values()) {
      // Count alive real players only (not bots, and not yet spectating)
      for (const player of game.players.values()) {
        if (player.blobs.length > 0 && !player.isBot) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Get total spectator count across all games
   */
  getTotalSpectators(): number {
    let count = 0;
    for (const game of this.games.values()) {
      count += game.gameState.spectators.size;
    }
    return count;
  }

  /**
   * Clean up disconnected spectators from all games
   */
  cleanupDisconnectedSpectators(io: Server): number {
    let removedCount = 0;
    
    for (const game of this.games.values()) {
      const toRemove: string[] = [];
      
      for (const socketId of game.gameState.spectators) {
        const socket = io.sockets.sockets.get(socketId);
        if (!socket || !socket.connected) {
          toRemove.push(socketId);
        }
      }
      
      for (const socketId of toRemove) {
        game.gameState.spectators.delete(socketId);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} disconnected spectators`);
    }
    
    return removedCount;
  }
}

