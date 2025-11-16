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
    return Array.from(this.lobbies.values()).map(lobby => {
      const game = this.games.get(lobby.id);
      const spectatorCount = game ? game.getSpectatorCount() : 0;
      
      return {
        id: lobby.id,
        tier: lobby.tier,
        playersCount: lobby.players.size,
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

    // Check if player already in another lobby
    for (const l of this.lobbies.values()) {
      if (l.players.has(playerId)) {
        return { success: false, message: 'Already in a lobby' };
      }
    }

    // Check if lobby is full (but allow joining during countdown if bots can be replaced)
    if (lobby.players.size >= lobby.maxPlayers) {
      // If in countdown with autofill, check if there are bots to replace
      if (lobby.status === 'countdown' && config.dev.autoFillBots) {
        const bots = Array.from(lobby.players.values()).filter(p => p.isBot);
        if (bots.length === 0) {
          return { success: false, message: 'Lobby is full' };
        }
        // Has bots, can replace - continue
      } else {
        return { success: false, message: 'Lobby is full' };
      }
    }

    // Join socket to lobby room for updates
    const socket = Array.from(this.io.sockets.sockets.values()).find(s => s.id === socketId);
    if (socket) {
      socket.join(lobbyId);
    }

    // If in countdown and autofill is on, replace a bot with this real player
    let replacedBot = false;
    if (lobby.status === 'countdown' && config.dev.autoFillBots) {
      const bots = Array.from(lobby.players.values()).filter(p => p.isBot);
      if (bots.length > 0) {
        const botToRemove = bots[0];
        lobby.players.delete(botToRemove.id);
        console.log(`Replacing bot ${botToRemove.id} with real player ${playerName}`);
        replacedBot = true;
      }
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

    console.log(`Player ${playerName} joined ${tier} lobby (${lobby.players.size}/${lobby.maxPlayers})${replacedBot ? ' - replaced bot' : ''}`);

    // Don't auto-fill bots if already in countdown (bots already filled)
    if (lobby.status === 'countdown') {
      // Just broadcast update
      this.broadcastSingleLobbyUpdate(lobby);
      return { success: true };
    }

    // Immediately broadcast lobby update
    this.broadcastSingleLobbyUpdate(lobby);

    // Auto-fill bots in dev mode to reach minimum
    if (config.dev.autoFillBots && lobby.status === 'waiting' && lobby.players.size < config.lobby.minPlayers) {
      this.fillWithBots(lobby);
    }

    // Check if we should start countdown (after bot fill)
    this.checkLobbyCountdown(lobby);

    return { success: true };
  }

  /**
   * Fill lobby with bots for testing (max 10 bots)
   */
  private fillWithBots(lobby: Lobby): void {
    const MAX_BOTS = 10;
    const currentBots = Array.from(lobby.players.values()).filter(p => p.isBot).length;
    const realPlayers = lobby.players.size - currentBots;
    
    // Calculate how many bots needed to reach minimum players (but max 10 bots total)
    const targetTotal = Math.max(config.lobby.minPlayers, realPlayers);
    const botsNeeded = Math.min(targetTotal - realPlayers, MAX_BOTS - currentBots);
    
    if (botsNeeded <= 0) return;

    for (let i = 0; i < botsNeeded; i++) {
      const botId = `bot_${Date.now()}_${Math.random()}`;
      const botNumber = currentBots + i + 1;
      const botName = `Bot ${botNumber}`;

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

    const totalBots = currentBots + botsNeeded;
    console.log(`Added ${botsNeeded} bot(s) to ${lobby.tier} lobby (${totalBots}/${MAX_BOTS} max bots, ${lobby.players.size}/${lobby.maxPlayers} total)`);
  }

  /**
   * Check if lobby should start countdown
   */
  private checkLobbyCountdown(lobby: Lobby): void {
    // Don't start countdown if already in countdown or playing
    if (lobby.status === 'countdown' || lobby.status === 'playing') {
      return;
    }

    // Start countdown when minimum players reached (bots or real)
    if (lobby.status === 'waiting' && lobby.players.size >= config.lobby.minPlayers) {
      lobby.status = 'countdown';
      lobby.countdownStartTime = Date.now();

      const realPlayers = Array.from(lobby.players.values()).filter(p => !p.isBot).length;
      const botCount = lobby.players.size - realPlayers;
      
      console.log(`Lobby ${lobby.id} countdown started: ${realPlayers} real player(s), ${botCount} bot(s). Countdown: ${config.lobby.autoStartCountdown / 1000}s`);

      // Start countdown timer (120 seconds by default)
      setTimeout(() => {
        // Double-check lobby status before starting
        if (lobby.status === 'countdown') {
          const finalReal = Array.from(lobby.players.values()).filter(p => !p.isBot).length;
          const finalBots = lobby.players.size - finalReal;
          console.log(`Starting game: ${finalReal} real player(s), ${finalBots} bot(s)`);
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
    
    // Remove all bots from BotManager
    for (const player of game.players.values()) {
      if (player.isBot) {
        this.botManager.removeBot(player.id);
      }
    }
    
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

        // If in countdown and drops below minimum, cancel and remove bots
        if (lobby.status === 'countdown' && lobby.players.size < config.lobby.minPlayers) {
          lobby.status = 'waiting';
          lobby.countdownStartTime = null;
          
          // Remove all bots
          const botsToRemove = Array.from(lobby.players.entries())
            .filter(([_, p]) => p.isBot)
            .map(([id, _]) => id);
          
          botsToRemove.forEach(botId => lobby.players.delete(botId));
          
          console.log(`Lobby ${lobby.id} countdown cancelled - removed ${botsToRemove.length} bots`);
          this.io.to(lobby.id).emit('lobbyCancelled', { message: 'Countdown cancelled - not enough players' });
          
          // Broadcast update
          this.broadcastSingleLobbyUpdate(lobby);
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
      // First check if this is a spectator
      if (game.spectators.has(socketId)) {
        game.removeSpectator(socketId);
        return;
      }

      // Then check if this is a player
      for (const player of game.players.values()) {
        if (player.socketId === socketId && !player.isBot) {
          console.log(`Player ${player.name} disconnected from game ${game.id} - eliminating`);
          
          // Remove all blobs (eliminates player)
          player.blobs = [];
          player.stats.timeSurvived = (Date.now() - player.joinTime) / 1000;
          
          // Check if game should end (all players gone)
          const alivePlayers = Array.from(game.players.values()).filter(p => p.blobs.length > 0);
          console.log(`${alivePlayers.length} players still alive in game ${game.id}`);
          
          // If only 1 or 0 players left, trigger game end check immediately
          if (alivePlayers.length <= 1) {
            game.forceWinCheck();
          }
          
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

    const game = this.games.get(lobby.id);
    const spectatorCount = game ? game.getSpectatorCount() : 0;

    const update = {
      tier: lobby.tier,
      playersLocked: lobby.players.size,
      maxPlayers: lobby.maxPlayers,
      status: lobby.status,
      countdown,
      spectatorCount,
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

