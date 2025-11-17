import { Server, Socket } from 'socket.io';
import { Player, Blob, Pellet, GameState, PlayerStats, GameEndResult, LeaderboardEntry, Vector2 } from './types.js';
import { Physics } from './physics.js';
import { SpatialHash } from './spatialHash.js';
import { config } from './config.js';

export class GameRoom {
  id: string;
  tier: string;
  io: Server;
  players: Map<string, Player>;
  pellets: Map<string, Pellet>;
  spatialHash: SpatialHash;
  gameState: GameState;
  tickInterval: NodeJS.Timeout | null;
  gameStartTime: number;
  maxDuration: number;
  playerTargets: Map<string, Vector2>;
  currentMapBounds: { minX: number; maxX: number; minY: number; maxY: number };
  onGameEnd?: () => void;
  onWinnerDetermined?: (winnerId: string, winnerName: string, gameId: string, tier: string, playersCount: number) => Promise<void>;
  private lastWinCheckTime: number = 0;
  
  constructor(id: string, tier: string, io: Server) {
    this.id = id;
    this.tier = tier;
    this.io = io;
    this.players = new Map();
    this.pellets = new Map();
    this.spatialHash = new SpatialHash(config.game.spatialHashGridSize);
    this.tickInterval = null;
    this.gameStartTime = Date.now();
    this.maxDuration = config.game.maxGameDuration;
    this.playerTargets = new Map();
    this.currentMapBounds = { 
      minX: 0, 
      maxX: config.game.mapWidth, 
      minY: 0, 
      maxY: config.game.mapHeight 
    };
    
    this.gameState = {
      players: this.players,
      pellets: this.pellets,
      spectators: new Set(),
      startTime: this.gameStartTime,
      lastTickTime: Date.now(),
    };

    this.initializePellets();
  }

  /**
   * Initialize pellets across the map
   */
  private initializePellets(): void {
    const pelletColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
      '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
      '#F8B739', '#52B788', '#E63946', '#A8DADC'
    ];

    for (let i = 0; i < config.game.pelletCount; i++) {
      const pellet: Pellet = {
        id: `pellet_${i}`,
        x: Math.random() * config.game.mapWidth,
        y: Math.random() * config.game.mapHeight,
        mass: 1,
        color: pelletColors[Math.floor(Math.random() * pelletColors.length)],
      };
      this.pellets.set(pellet.id, pellet);
    }
  }

  /**
   * Add player to game
   */
  addPlayer(socketId: string, playerId: string, name: string, isBot: boolean = false): void {
    const startX = Math.random() * config.game.mapWidth;
    const startY = Math.random() * config.game.mapHeight;

    const blob: Blob = {
      id: `${playerId}_0`,
      playerId,
      x: startX,
      y: startY,
      mass: config.game.startingMass,
      velocity: { x: 0, y: 0 },
      color: this.randomColor(),
      splitTime: 0,
      canMerge: true,
      splitVelocity: { x: 0, y: 0 },
    };

    const player: Player = {
      id: playerId,
      socketId,
      name,
      blobs: [blob],
      totalMass: config.game.startingMass,
      stats: {
        pelletsEaten: 0,
        cellsEaten: 0,
        maxMass: config.game.startingMass,
        leaderTime: 0,
        bestRank: 999,
        timeSurvived: 0,
      },
      joinTime: Date.now(),
      lastInputTime: Date.now(),
      isBot,
    };

    this.players.set(playerId, player);
  }

  /**
   * Generate random color for blob
   */
  private randomColor(): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
      '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
      '#F8B739', '#52B788', '#E63946', '#A8DADC'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Start game loop
   */
  start(): void {
    console.log(`Game ${this.id} (Tier: $${this.tier}) starting with ${this.players.size} players`);
    
    const tickRate = config.server.tickRate;
    const tickInterval = 1000 / tickRate;

    this.tickInterval = setInterval(() => {
      this.tick();
    }, tickInterval);
  }

  /**
   * Main game tick (runs at 60Hz)
   */
  private tick(): void {
    const now = Date.now();
    const deltaTime = (now - this.gameState.lastTickTime) / 1000;
    this.gameState.lastTickTime = now;

    // Update shrinking safe zone
    if (config.game.shrinkingEnabled) {
      this.updateSafeZone();
      this.cleanPelletsOutsideBounds();
    }

    // Update all players
    for (const player of this.players.values()) {
      this.updatePlayer(player, deltaTime);
    }

    // Update ejected pellets with velocity
    this.updateEjectedPellets(deltaTime);

    // Handle blob merging
    this.handleMerging();

    // Handle collisions
    this.handleCollisions();

    // Damage players outside safe zone
    if (config.game.shrinkingEnabled) {
      this.handleSafeZoneDamage();
    }

    // Update stats
    this.updateStats(deltaTime);

    // Check win condition (only once per second to reduce overhead)
    if (now - this.lastWinCheckTime >= 1000) {
      this.checkWinCondition();
      this.lastWinCheckTime = now;
    }

    // Broadcast state (full state every 500ms, deltas otherwise)
    if (now % 500 < 20) {
      this.broadcastFullState();
    } else {
      this.broadcastDeltaState();
    }

    // Respawn pellets
    this.respawnPellets();
  }

  /**
   * Update shrinking map boundaries based on game time
   */
  private updateSafeZone(): void {
    const elapsed = Date.now() - this.gameStartTime;
    const progress = elapsed / this.maxDuration; // 0 to 1

    // Shrink from 0% to 90% of game time (leaves 10% for final battle)
    const shrinkProgress = Math.min(1, progress / 0.9); // 0 to 1, caps at 90% elapsed
    
    // Shrink map from full size to 10% of original (centered)
    const shrinkAmount = shrinkProgress * 0.9; // 0 to 0.9 (90% shrink, leaving 10%)
    const centerX = config.game.mapWidth / 2;
    const centerY = config.game.mapHeight / 2;
    const halfWidth = (config.game.mapWidth / 2) * (1 - shrinkAmount);
    const halfHeight = (config.game.mapHeight / 2) * (1 - shrinkAmount);
    
    this.currentMapBounds = {
      minX: centerX - halfWidth,
      maxX: centerX + halfWidth,
      minY: centerY - halfHeight,
      maxY: centerY + halfHeight,
    };
    
    // Log only every 10 seconds
    if (Math.floor(elapsed / 1000) % 10 === 0 && elapsed % 1000 < 100) {
      console.log(`🔴 Map: ${Math.floor(this.currentMapBounds.maxX - this.currentMapBounds.minX)}x${Math.floor(this.currentMapBounds.maxY - this.currentMapBounds.minY)} (${(progress * 100).toFixed(1)}% elapsed)`);
    }
  }

  /**
   * Handle players touching boundaries (3 second kill timer)
   */
  private handleSafeZoneDamage(): void {
    const now = Date.now();
    const BOUNDARY_MARGIN = 10; // How close is "touching"
    const KILL_TIME = 3000; // 3 seconds
    
    for (const player of this.players.values()) {
      let isTouchingBoundary = false;
      
      for (const blob of player.blobs) {
        // Check if any blob is touching the boundary walls
        const touchingLeft = blob.x - BOUNDARY_MARGIN <= this.currentMapBounds.minX;
        const touchingRight = blob.x + BOUNDARY_MARGIN >= this.currentMapBounds.maxX;
        const touchingTop = blob.y - BOUNDARY_MARGIN <= this.currentMapBounds.minY;
        const touchingBottom = blob.y + BOUNDARY_MARGIN >= this.currentMapBounds.maxY;
        
        if (touchingLeft || touchingRight || touchingTop || touchingBottom) {
          isTouchingBoundary = true;
          break;
        }
      }
      
      if (isTouchingBoundary) {
        // Start or continue boundary timer
        if (!player.boundaryTouchTime) {
          player.boundaryTouchTime = now;
          console.log(`⚠️ ${player.name} touching boundary - 3s countdown started`);
          
          // Send warning to player
          const socket = Array.from(this.io.sockets.sockets.values()).find(s => s.id === player.socketId);
          if (socket) {
            socket.emit('boundaryWarning', { startTime: now });
          }
        }
        
        const timeOnBoundary = now - player.boundaryTouchTime;
        
        // Kill after 3 seconds
        if (timeOnBoundary >= KILL_TIME) {
          console.log(`💀 ${player.name} eliminated by boundary (3s timeout)`);
          player.blobs = [];
          this.eliminatePlayer(player.id);
          
          const socket = Array.from(this.io.sockets.sockets.values()).find(s => s.id === player.socketId);
          if (socket) {
            socket.emit('boundaryKilled');
          }
        }
      } else {
        // Moved away from boundary - reset timer
        if (player.boundaryTouchTime) {
          console.log(`✅ ${player.name} moved away from boundary`);
          player.boundaryTouchTime = undefined;
          
          const socket = Array.from(this.io.sockets.sockets.values()).find(s => s.id === player.socketId);
          if (socket) {
            socket.emit('boundarySafe');
          }
        }
      }
    }
  }

  /**
   * Update player blobs
   */
  private updatePlayer(player: Player, deltaTime: number): void {
    let totalMass = 0;

    // Get player's target position
    const target = this.playerTargets.get(player.id);
    
    for (const blob of player.blobs) {
      // Check if blob has split launch velocity
      const launchSpeed = Math.sqrt(blob.splitVelocity.x ** 2 + blob.splitVelocity.y ** 2);
      
      if (launchSpeed > 10) {
        // Blob is still in split launch mode - apply launch velocity
        blob.x += blob.splitVelocity.x * deltaTime;
        blob.y += blob.splitVelocity.y * deltaTime;
        
        // Decay split velocity over time (friction effect)
        const decay = 0.95; // 5% decay per tick
        blob.splitVelocity.x *= decay;
        blob.splitVelocity.y *= decay;
      } else {
        // Launch complete, clear split velocity
        blob.splitVelocity.x = 0;
        blob.splitVelocity.y = 0;
      }
      
      // Always apply normal movement (unless launching)
      if (launchSpeed < 100 && target) {
        Physics.moveToward(blob, target.x, target.y, deltaTime);
      }

      // Clamp to map boundaries
      const radius = Physics.calculateRadius(blob.mass);
      const clamped = Physics.clampToMap(
        blob.x,
        blob.y,
        radius,
        config.game.mapWidth,
        config.game.mapHeight
      );
      blob.x = clamped.x;
      blob.y = clamped.y;

      totalMass += blob.mass;
    }

    player.totalMass = totalMass;

    // Update maxMass stat
    if (totalMass > player.stats.maxMass) {
      player.stats.maxMass = totalMass;
    }
  }

  /**
   * Handle merging of same-player blobs (agar.io style)
   */
  private handleMerging(): void {
    const now = Date.now();
    const MERGE_COOLDOWN = 30000; // 30 seconds like agar.io

    for (const player of this.players.values()) {
      // Update merge eligibility for all blobs (each blob tracked individually)
      for (const blob of player.blobs) {
        const timeSinceSplit = now - blob.splitTime;
        if (timeSinceSplit >= MERGE_COOLDOWN) {
          blob.canMerge = true;
        } else {
          blob.canMerge = false; // Still on cooldown
        }
      }

      // Check all blob pairs for merging
      for (let i = 0; i < player.blobs.length; i++) {
        for (let j = i + 1; j < player.blobs.length; j++) {
          const blob1 = player.blobs[i];
          const blob2 = player.blobs[j];

          // BOTH blobs must have passed their individual 30s cooldown
          if (blob1.canMerge && blob2.canMerge) {
            const r1 = Physics.calculateRadius(blob1.mass);
            const r2 = Physics.calculateRadius(blob2.mass);
            
            // Calculate distance between centers
            const dist = Physics.distance(blob1.x, blob1.y, blob2.x, blob2.y);
            
            // Agar.io style: Blobs must be TOUCHING (overlapping)
            // Touching = distance less than sum of radii
            const touching = dist < (r1 + r2);
            
            if (touching) {
              console.log(`🔄 Merging ${player.name}'s blobs: dist=${Math.floor(dist)}, r1+r2=${Math.floor(r1+r2)}, blob1Time=${Math.floor((now-blob1.splitTime)/1000)}s, blob2Time=${Math.floor((now-blob2.splitTime)/1000)}s`);
              // Merge blob2 into blob1
              const oldMass = blob1.mass;
              blob1.mass += blob2.mass;
              
              // Reset split time since this is now a "new" merged blob
              blob1.splitTime = now;
              blob1.canMerge = false; // New merged blob gets 30s cooldown
              
              // Send merge animation event
              this.io.to(this.id).emit('blobMerged', {
                remainingBlobId: blob1.id,
                mergedBlobId: blob2.id,
              });
              
              player.blobs.splice(j, 1);
              j--; // Adjust index after removal
              
              const playerType = player.isBot ? 'Bot' : 'Player';
              console.log(`✅ ${playerType} ${player.name} MERGED: ${Math.floor(oldMass)} + ${Math.floor(blob2.mass)} = ${Math.floor(blob1.mass)} mass (after 30s cooldown)`);
            }
          }
        }
      }
    }
  }

  /**
   * Handle all collisions using spatial hashing
   */
  private handleCollisions(): void {
    // Clear and rebuild spatial hash
    this.spatialHash.clear();

    // Insert all blobs and pellets
    for (const player of this.players.values()) {
      for (const blob of player.blobs) {
        this.spatialHash.insert(blob);
      }
    }
    for (const pellet of this.pellets.values()) {
      this.spatialHash.insert(pellet);
    }

    // Check collisions
    for (const player of this.players.values()) {
      for (const blob of player.blobs) {
        const nearby = this.spatialHash.getNearby(blob.x, blob.y);
        
        for (const entity of nearby) {
          // Skip self
          if ('playerId' in entity && entity.id === blob.id) continue;
          
          if ('playerId' in entity) {
            if (entity.playerId === blob.playerId) {
              // Same player blobs - handle collision (push apart, don't eat)
              this.handleSamePlayerCollision(blob, entity);
            } else {
              // Different player blobs - can eat
              this.handleBlobCollision(blob, entity);
            }
          } else {
            // Blob vs Pellet
            this.handlePelletCollision(blob, entity, player);
          }
        }
      }
    }
  }

  /**
   * Handle collision between same-player blobs (push apart)
   */
  private handleSamePlayerCollision(blob1: Blob, blob2: Blob): void {
    const r1 = Physics.calculateRadius(blob1.mass);
    const r2 = Physics.calculateRadius(blob2.mass);

    // Check if overlapping
    const dist = Physics.distance(blob1.x, blob1.y, blob2.x, blob2.y);
    const overlap = (r1 + r2) - dist;

    if (overlap > 0) {
      // Push blobs apart
      const dx = blob2.x - blob1.x;
      const dy = blob2.y - blob1.y;
      
      if (dist > 0) {
        const pushX = (dx / dist) * overlap * 0.5;
        const pushY = (dy / dist) * overlap * 0.5;
        
        blob1.x -= pushX;
        blob1.y -= pushY;
        blob2.x += pushX;
        blob2.y += pushY;
      }
    }
  }

  /**
   * Handle blob eating another blob
   */
  private handleBlobCollision(predator: Blob, prey: Blob): void {
    
    const predatorRadius = Physics.calculateRadius(predator.mass);
    const preyRadius = Physics.calculateRadius(prey.mass);

    if (Physics.checkCollision(predator.x, predator.y, predatorRadius, prey.x, prey.y, preyRadius)) {
      if (Physics.canEat(predator.mass, prey.mass)) {
        // Predator eats prey
        predator.mass += prey.mass;
        
        // Update stats
        const predatorPlayer = this.players.get(predator.playerId);
        if (predatorPlayer) {
          predatorPlayer.stats.cellsEaten++;
        }

        // Send kill animation event to all players in room
        this.io.to(this.id).emit('blobKilled', {
          killerBlobId: predator.id,
          victimBlobId: prey.id,
          victimX: prey.x,
          victimY: prey.y,
        });

        // Remove prey blob
        const preyPlayer = this.players.get(prey.playerId);
        if (preyPlayer) {
          preyPlayer.blobs = preyPlayer.blobs.filter(b => b.id !== prey.id);
          
          // If player has no more blobs, they're eliminated
          if (preyPlayer.blobs.length === 0) {
            this.eliminatePlayer(prey.playerId);
            
            // Send simple elimination event (no killer info)
            const preySocket = Array.from(this.io.sockets.sockets.values()).find(s => s.id === preyPlayer.socketId);
            if (preySocket) {
              preySocket.emit('playerEliminated', {});
            }
            
            // Emit global game event for feed
            this.io.emit('gameEvent', {
              type: 'elimination',
              victim: preyPlayer.name,
              killer: predatorPlayer?.name || 'Unknown'
            });
            
            console.log(`Player ${preyPlayer.name} eliminated by ${predatorPlayer?.name}`);
          }
        }
      }
    }
  }

  /**
   * Handle blob eating pellet
   */
  private handlePelletCollision(blob: Blob, pellet: Pellet, player: Player): void {
    const blobRadius = Physics.calculateRadius(blob.mass);
    
    if (Physics.checkCollision(blob.x, blob.y, blobRadius, pellet.x, pellet.y, 2)) {
      blob.mass += pellet.mass;
      player.stats.pelletsEaten++;
      this.pellets.delete(pellet.id);
    }
  }

  /**
   * Eliminate player from game
   */
  private eliminatePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) {
      player.stats.timeSurvived = (Date.now() - player.joinTime) / 1000;
      console.log(`Player ${player.name} eliminated after ${player.stats.timeSurvived}s`);
      
      // Broadcast player count update to all lobbies
      this.io.emit('playerCountUpdate', {
        gameId: this.id,
        tier: this.tier,
      });
    }
  }

  /**
   * Update player stats
   */
  private updateStats(deltaTime: number): void {
    const leaderboard = this.getLeaderboard();
    
    for (let i = 0; i < leaderboard.length; i++) {
      const player = this.players.get(leaderboard[i].id);
      if (!player) continue;

      const rank = i + 1;

      // Update bestRank (lower is better)
      if (rank < player.stats.bestRank) {
        player.stats.bestRank = rank;
      }

      // Update leaderTime if player is #1
      if (rank === 1) {
        player.stats.leaderTime += deltaTime;
      }
    }
  }

  /**
   * Get current leaderboard
   */
  getLeaderboard(): LeaderboardEntry[] {
    return Array.from(this.players.values())
      .filter(p => p.blobs.length > 0)
      .map(p => ({
        id: p.id,
        name: p.name,
        mass: p.totalMass,
        cellsEaten: p.stats.cellsEaten,
        rank: 0,
      }))
      .sort((a, b) => b.mass - a.mass)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  /**
   * Check win condition (called once per second)
   */
  private checkWinCondition(): void {
    const alivePlayers = Array.from(this.players.values()).filter(p => p.blobs.length > 0);
    const elapsed = Date.now() - this.gameStartTime;

    // Last player standing (ONLY if game started with multiple players)
    if (alivePlayers.length === 1 && this.players.size > 1) {
      console.log(`🏆 WIN: Last player standing (${alivePlayers[0].name})`);
      this.endGame(alivePlayers[0].id);
      return;
    }

    // Time limit reached
    if (elapsed >= this.maxDuration) {
      const leaderboard = this.getLeaderboard();
      const winner = leaderboard.length > 0 ? leaderboard[0] : null;
      console.log(`⏰ WIN: Time limit reached. Winner: ${winner?.name || 'None'} with ${winner?.mass || 0} mass`);
      this.endGame(winner?.id || null);
      return;
    }

    // No players left (all eliminated)
    if (alivePlayers.length === 0) {
      console.log('💀 WIN: No players left (draw)');
      this.endGame(null);
    }
  }

  /**
   * End game and calculate results
   */
  private endGame(winnerId: string | null): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    // Finalize timeSurvived for all players
    for (const player of this.players.values()) {
      if (player.blobs.length > 0) {
        player.stats.timeSurvived = (Date.now() - player.joinTime) / 1000;
      }
    }

    // Calculate final rankings with tie-breakers
    const rankings = Array.from(this.players.values())
      .map(p => ({
        id: p.id,
        name: p.name,
        mass: p.totalMass,
        timeSurvived: p.stats.timeSurvived,
        cellsEaten: p.stats.cellsEaten,
        pelletsEaten: p.stats.pelletsEaten,
      }))
      .sort((a, b) => {
        // Primary: mass
        if (b.mass !== a.mass) return b.mass - a.mass;
        // Tie-breaker 1: timeSurvived
        if (b.timeSurvived !== a.timeSurvived) return b.timeSurvived - a.timeSurvived;
        // Tie-breaker 2: cellsEaten
        if (b.cellsEaten !== a.cellsEaten) return b.cellsEaten - a.cellsEaten;
        // Tie-breaker 3: pelletsEaten
        return b.pelletsEaten - a.pelletsEaten;
      });

    // Collect all player stats
    const playerStats: Record<string, PlayerStats> = {};
    for (const player of this.players.values()) {
      playerStats[player.id] = { ...player.stats };
    }

    const result: GameEndResult = {
      winnerId,
      finalRankings: rankings,
      playerStats,
    };

    // Broadcast game end
    this.io.to(this.id).emit('gameEnd', result);
    
    // Emit global win event for feed
    if (winnerId) {
      const winner = this.players.get(winnerId);
      if (winner) {
        const tierNum = this.tier === 'whale' ? 500 : parseInt(this.tier);
        const prize = Math.floor(tierNum * this.players.size * 0.8);
        
        this.io.emit('gameEvent', {
          type: 'win',
          winner: winner.name,
          prize: prize,
          players: this.players.size
        });
      }
    }
    
    console.log(`🏁 Game ${this.id} ended. Winner: ${winnerId || 'None'}`);
    
    // Trigger winner payout if callback provided
    if (winnerId && this.onWinnerDetermined) {
      const winner = this.players.get(winnerId);
      if (winner && !winner.isBot) {
        // Trigger payout asynchronously (don't block game end)
        this.onWinnerDetermined(winnerId, winner.name, this.id, this.tier, this.players.size)
          .catch(error => {
            console.error(`Failed to process winner payout:`, error);
          });
      }
    }
    
    // Clear spectators immediately since game is over
    console.log(`Clearing ${this.gameState.spectators.size} spectators from ended game`);
    this.gameState.spectators.clear();
    
    // Schedule cleanup and removal after players see results
    setTimeout(() => {
      console.log(`Stopping game ${this.id}`);
      this.stop();
      
      // Call lobby manager callback to remove game and reset lobby
      if (this.onGameEnd) {
        this.onGameEnd();
      }
    }, 10000); // 10 seconds to view results
  }

  /**
   * Clean pellets outside bounds (including ejected mass)
   */
  private cleanPelletsOutsideBounds(): void {
    for (const [id, pellet] of this.pellets.entries()) {
      if (pellet.x < this.currentMapBounds.minX || pellet.x > this.currentMapBounds.maxX ||
          pellet.y < this.currentMapBounds.minY || pellet.y > this.currentMapBounds.maxY) {
        this.pellets.delete(id);
      }
    }
  }

  /**
   * Respawn pellets to maintain count (only within current map bounds)
   */
  private respawnPellets(): void {
    const pelletColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
      '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
      '#F8B739', '#52B788', '#E63946', '#A8DADC'
    ];

    const target = config.game.pelletCount;
    const current = this.pellets.size;

    // Spawn new pellets ONLY within current bounds
    const MARGIN = 100;
    for (let i = 0; i < target - current; i++) {
      const pellet: Pellet = {
        id: `pellet_${Date.now()}_${i}`,
        x: this.currentMapBounds.minX + MARGIN + Math.random() * (this.currentMapBounds.maxX - this.currentMapBounds.minX - MARGIN * 2),
        y: this.currentMapBounds.minY + MARGIN + Math.random() * (this.currentMapBounds.maxY - this.currentMapBounds.minY - MARGIN * 2),
        mass: 1,
        color: pelletColors[Math.floor(Math.random() * pelletColors.length)],
      };
      this.pellets.set(pellet.id, pellet);
    }
  }

  /**
   * Broadcast full game state
   */
  private broadcastFullState(): void {
    const blobs = [];
    for (const player of this.players.values()) {
      for (const blob of player.blobs) {
        blobs.push({
          id: blob.id,
          playerId: blob.playerId,
          x: blob.x,
          y: blob.y,
          mass: blob.mass,
          velocity: blob.velocity,
          color: blob.color,
        });
      }
    }

    const pelletsArray = Array.from(this.pellets.values()).map(p => ({
      x: p.x,
      y: p.y,
      color: p.color,
    }));

    const leaderboard = this.getLeaderboard().slice(0, 10);

    const timeRemaining = Math.max(0, this.maxDuration - (Date.now() - this.gameStartTime));

    this.io.to(this.id).emit('gameState', {
      blobs,
      pellets: pelletsArray,
      leaderboard,
      spectatorCount: this.gameState.spectators.size,
      mapBounds: config.game.shrinkingEnabled ? this.currentMapBounds : null,
      timeRemaining, // Milliseconds remaining
    });
  }

  /**
   * Broadcast delta state (only changed entities)
   */
  private broadcastDeltaState(): void {
    // For Phase 1, we'll just broadcast full state
    // Delta optimization can be added later
    this.broadcastFullState();
  }

  /**
   * Handle player movement input
   */
  handlePlayerMove(playerId: string, targetX: number, targetY: number): void {
    const player = this.players.get(playerId);
    if (!player) {
      console.warn(`Player ${playerId} not found in game ${this.id}`);
      return;
    }

    player.lastInputTime = Date.now();

    // Store target position for continuous movement
    this.playerTargets.set(playerId, { x: targetX, y: targetY });
  }

  /**
   * Handle player split action
   */
  handlePlayerSplit(playerId: string, targetX?: number, targetY?: number): void {
    const player = this.players.get(playerId);
    if (!player || player.blobs.length >= 16) return;

    const newBlobs: Blob[] = [];
    const now = Date.now();

    for (const blob of player.blobs) {
      if (blob.mass >= 36) { // Minimum mass to split (ensures each piece is at least 18)
        // Calculate direction toward mouse (or use velocity if no target)
        let directionX, directionY;
        
        if (targetX !== undefined && targetY !== undefined) {
          // Direction from blob to mouse cursor
          directionX = targetX - blob.x;
          directionY = targetY - blob.y;
          const magnitude = Math.sqrt(directionX * directionX + directionY * directionY);
          if (magnitude > 0) {
            directionX /= magnitude;
            directionY /= magnitude;
          }
        } else {
          // Fallback to velocity direction
          const direction = Physics.normalize(blob.velocity);
          directionX = direction.x;
          directionY = direction.y;
        }

        // Split blob in half
        const halfMass = blob.mass / 2;
        blob.mass = halfMass;
        blob.splitTime = now;
        blob.canMerge = false;

        // Calculate the radius to spawn the new blob just outside the original
        const radius = Physics.calculateRadius(halfMass);
        
        // Create new blob shooting toward mouse with high velocity
        // Split velocity reduced by 80% as requested: 1200 * 0.2 = 240
        const splitSpeed = 240;
        const newBlob: Blob = {
          id: `${playerId}_${Date.now()}_${Math.random()}`,
          playerId: blob.playerId,
          x: blob.x + directionX * radius * 1.5, // Start slightly offset
          y: blob.y + directionY * radius * 1.5,
          mass: halfMass,
          velocity: { x: 0, y: 0 }, // Normal movement velocity
          splitVelocity: {
            x: directionX * splitSpeed,
            y: directionY * splitSpeed,
          },
          color: blob.color,
          splitTime: now,
          canMerge: false,
        };
        newBlobs.push(newBlob);
        
        // Also give the original blob a small backwards push
        blob.splitVelocity.x = -directionX * 48; // Also reduced by 80%
        blob.splitVelocity.y = -directionY * 48;
      }
    }

    player.blobs.push(...newBlobs);
  }

  /**
   * Handle player eject action
   */
  handlePlayerEject(playerId: string, targetX?: number, targetY?: number): void {
    const player = this.players.get(playerId);
    if (!player) return;

    for (const blob of player.blobs) {
      if (blob.mass > 20) {
        // Calculate direction toward mouse
        let directionX, directionY;
        
        if (targetX !== undefined && targetY !== undefined) {
          directionX = targetX - blob.x;
          directionY = targetY - blob.y;
          const magnitude = Math.sqrt(directionX * directionX + directionY * directionY);
          if (magnitude > 0) {
            directionX /= magnitude;
            directionY /= magnitude;
          }
        } else {
          const direction = Physics.normalize(blob.velocity);
          directionX = direction.x;
          directionY = direction.y;
        }

        // Eject 10 mass per blob
        blob.mass -= 10;
        
        // Create ejected mass pellet with shotgun spread
        // Random angle within 30 degrees left/right of cursor
        const spreadAngle = (Math.random() - 0.5) * (Math.PI / 3); // ±30 degrees in radians
        
        // Apply rotation to direction vector
        const cos = Math.cos(spreadAngle);
        const sin = Math.sin(spreadAngle);
        const spreadDirX = directionX * cos - directionY * sin;
        const spreadDirY = directionX * sin + directionY * cos;
        
        // Use same speed as split velocity (240)
        const ejectSpeed = 240;
        
        // Use blob's color for ejected mass
        const pellet: Pellet = {
          id: `ejected_${Date.now()}_${Math.random()}`,
          x: blob.x + spreadDirX * 30,
          y: blob.y + spreadDirY * 30,
          mass: 10,
          color: blob.color, // Match the blob's color
          velocity: { x: 0, y: 0 },
          splitVelocity: {
            x: spreadDirX * ejectSpeed,
            y: spreadDirY * ejectSpeed,
          },
          createdAt: Date.now(),
        };
        this.pellets.set(pellet.id, pellet);
      }
    }
  }

  /**
   * Update ejected pellets with velocity (same logic as blob split velocity)
   */
  private updateEjectedPellets(deltaTime: number): void {
    for (const [id, pellet] of this.pellets.entries()) {
      // Only update pellets with splitVelocity (ejected ones)
      if (pellet.splitVelocity) {
        // Check if pellet has split launch velocity (same as blob logic)
        const launchSpeed = Math.sqrt(pellet.splitVelocity.x ** 2 + pellet.splitVelocity.y ** 2);
        
        if (launchSpeed > 10) {
          // Pellet is still in launch mode - apply launch velocity
          pellet.x += pellet.splitVelocity.x * deltaTime;
          pellet.y += pellet.splitVelocity.y * deltaTime;
          
          // Decay split velocity over time (friction effect) - same as blobs
          const decay = 0.95; // 5% decay per tick
          pellet.splitVelocity.x *= decay;
          pellet.splitVelocity.y *= decay;
        } else {
          // Launch complete, clear split velocity
          pellet.splitVelocity.x = 0;
          pellet.splitVelocity.y = 0;
        }
        
        // Clamp to map boundaries
        const clamped = Physics.clampToMap(pellet.x, pellet.y, 2, config.game.mapWidth, config.game.mapHeight);
        pellet.x = clamped.x;
        pellet.y = clamped.y;
        
        // Ejected pellets stay on map permanently - never disappear
      }
    }
  }

  /**
   * Stop game and clean up resources
   */
  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    
    // Clear all game state
    this.players.clear();
    this.pellets.clear();
    this.spatialHash.clear();
    this.playerTargets.clear();
    this.gameState.spectators.clear();
    
    console.log(`🛑 Game ${this.id} stopped and cleaned up`);
  }
  
  /**
   * Get game ID for cleanup
   */
  getId(): string {
    return this.id;
  }
}

