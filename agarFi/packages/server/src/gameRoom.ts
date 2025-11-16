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
  spectators: Set<string>; // Track spectator socket IDs
  
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
    this.spectators = new Set();
    
    this.gameState = {
      players: this.players,
      pellets: this.pellets,
      startTime: this.gameStartTime,
      lastTickTime: Date.now(),
    };

    this.initializePellets();
  }

  /**
   * Add spectator
   */
  addSpectator(socketId: string): void {
    this.spectators.add(socketId);
    console.log(`Spectator added to ${this.id}. Total: ${this.spectators.size}`);
  }

  /**
   * Remove spectator
   */
  removeSpectator(socketId: string): void {
    this.spectators.delete(socketId);
    console.log(`Spectator removed from ${this.id}. Total: ${this.spectators.size}`);
  }

  /**
   * Get spectator count
   */
  getSpectatorCount(): number {
    return this.spectators.size;
  }

  /**
   * Initialize pellets across the map
   */
  private initializePellets(): void {
    for (let i = 0; i < config.game.pelletCount; i++) {
      const pellet: Pellet = {
        id: `pellet_${i}`,
        x: Math.random() * config.game.mapWidth,
        y: Math.random() * config.game.mapHeight,
        mass: 1,
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
      isMerging: false,
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

    // Update all players
    for (const player of this.players.values()) {
      this.updatePlayer(player, deltaTime);
    }

    // Handle blob merging
    this.handleMerging();

    // Handle collisions
    this.handleCollisions();

    // Update stats
    this.updateStats(deltaTime);

    // Check win condition
    this.checkWinCondition();

    // Broadcast state EVERY tick (60Hz) for smooth gameplay
    this.broadcastFullState();

    // Respawn pellets
    this.respawnPellets();
  }

  /**
   * Update player blobs
   */
  private updatePlayer(player: Player, deltaTime: number): void {
    let totalMass = 0;

    // Get player's target position
    const target = this.playerTargets.get(player.id);
    
    for (const blob of player.blobs) {
      // Apply movement (15% slower if merging)
      const moveSpeedMultiplier = blob.isMerging ? 0.85 : 1.0;
      
      // Always apply normal movement toward mouse
      if (target) {
        const adjustedDeltaTime = deltaTime * moveSpeedMultiplier;
        Physics.moveToward(blob, target.x, target.y, adjustedDeltaTime);
      }

      // Additionally check if blob has split launch velocity
      const launchSpeed = Math.sqrt(blob.splitVelocity.x ** 2 + blob.splitVelocity.y ** 2);
      
      if (launchSpeed > 5) {
        // Add split velocity on top of normal movement
        const adjustedDeltaTime = deltaTime * moveSpeedMultiplier;
        blob.x += blob.splitVelocity.x * adjustedDeltaTime;
        blob.y += blob.splitVelocity.y * adjustedDeltaTime;
        
        // Decay split velocity smoothly
        const decay = 0.94; // 6% decay per tick = smoother slowdown
        blob.splitVelocity.x *= decay;
        blob.splitVelocity.y *= decay;
      } else {
        // Split launch complete, clear split velocity
        blob.splitVelocity.x = 0;
        blob.splitVelocity.y = 0;
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
   * Handle merging of same-player blobs with 0.5s animation
   */
  private handleMerging(): void {
    const now = Date.now();
    const MERGE_COOLDOWN = 30000; // 30 seconds
    const MERGE_ANIMATION_TIME = 500; // 0.5 seconds

    for (const player of this.players.values()) {
      // Update merge eligibility
      for (const blob of player.blobs) {
        if (now - blob.splitTime > MERGE_COOLDOWN) {
          blob.canMerge = true;
        }

        // Check if merge animation complete
        if (blob.isMerging && blob.mergeStartTime) {
          if (now - blob.mergeStartTime >= MERGE_ANIMATION_TIME) {
            // Animation complete, actually merge
            const targetBlob = player.blobs.find(b => b.id === blob.mergeTargetId);
            if (targetBlob && !targetBlob.isMerging) {
              targetBlob.mass += blob.mass;
              player.blobs = player.blobs.filter(b => b.id !== blob.id);
              console.log(`Merge animation complete for player ${player.name}`);
            }
          }
        }
      }

      // Start merge animations when blobs are 50% overlapped
      for (let i = 0; i < player.blobs.length; i++) {
        for (let j = i + 1; j < player.blobs.length; j++) {
          const blob1 = player.blobs[i];
          const blob2 = player.blobs[j];

          // Skip if already merging
          if (blob1.isMerging || blob2.isMerging) continue;

          if (blob1.canMerge && blob2.canMerge) {
            const r1 = Physics.calculateRadius(blob1.mass);
            const r2 = Physics.calculateRadius(blob2.mass);
            const dist = Physics.distance(blob1.x, blob1.y, blob2.x, blob2.y);

            // Check for 50% overlap: distance < 50% of combined radii
            const minOverlapDist = (r1 + r2) * 0.5;
            
            if (dist < minOverlapDist) {
              // Start merge animation - blob2 merges into blob1
              blob2.isMerging = true;
              blob2.mergeTargetId = blob1.id;
              blob2.mergeStartTime = now;
              console.log(`Starting merge animation for player ${player.name} (${Math.floor((1 - dist/(r1+r2)) * 100)}% overlap)`);
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
    // Skip collision if either blob is merging (let them pass through during merge animation)
    if (blob1.isMerging || blob2.isMerging) {
      return;
    }

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
    // Skip if either blob is merging (invulnerable during merge animation)
    if (predator.isMerging || prey.isMerging) return;
    
    const predatorRadius = Physics.calculateRadius(predator.mass);
    const preyRadius = Physics.calculateRadius(prey.mass);

    if (Physics.checkCollision(predator.x, predator.y, predatorRadius, prey.x, prey.y, preyRadius)) {
      if (Physics.canEat(predator.mass, prey.mass)) {
        // Mark prey as being eaten (for animation)
        prey.isMerging = true;
        prey.mergeTargetId = predator.id;
        prey.mergeStartTime = Date.now();
        
        // Immediately transfer mass and remove (animation shown on client)
        predator.mass += prey.mass;
        
        // Update stats
        const predatorPlayer = this.players.get(predator.playerId);
        if (predatorPlayer) {
          predatorPlayer.stats.cellsEaten++;
        }

        // Remove prey blob
        const preyPlayer = this.players.get(prey.playerId);
        if (preyPlayer) {
          preyPlayer.blobs = preyPlayer.blobs.filter(b => b.id !== prey.id);
          
          // If player has no more blobs, they're eliminated
          if (preyPlayer.blobs.length === 0) {
            this.eliminatePlayer(prey.playerId);
            console.log(`Player ${preyPlayer.name} eliminated by ${predatorPlayer?.name || 'unknown'}`);
            
            // Broadcast elimination event for particle effects
            this.io.to(this.id).emit('playerEliminated', {
              eliminatedId: prey.playerId,
              eliminatedBy: predator.playerId,
              x: prey.x,
              y: prey.y,
            });
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
   * Check win condition
   */
  private checkWinCondition(): void {
    const alivePlayers = Array.from(this.players.values()).filter(p => p.blobs.length > 0);
    const elapsed = Date.now() - this.gameStartTime;

    // No players left (everyone disconnected)
    if (alivePlayers.length === 0) {
      console.log('Win condition: No players left - everyone disconnected');
      this.endGame(null);
      return;
    }

    // Last player standing
    if (alivePlayers.length === 1 && this.players.size > 1) {
      console.log(`Win condition: Last player standing (${alivePlayers[0].name})`);
      this.endGame(alivePlayers[0].id);
      return;
    }

    // Time limit reached (5 minutes)
    if (elapsed >= this.maxDuration) {
      const leaderboard = this.getLeaderboard();
      const winner = leaderboard.length > 0 ? leaderboard[0] : null;
      console.log(`Win condition: Time limit reached (${elapsed / 1000}s). Winner by mass: ${winner?.name || 'None'} (${winner?.mass || 0} mass)`);
      this.endGame(winner?.id || null);
      return;
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
    
    console.log(`Game ${this.id} ended. Winner: ${winnerId || 'None'}`);
    
    // Notify lobby manager to cleanup (this will be called externally)
  }

  /**
   * Get game ID
   */
  getGameId(): string {
    return this.id;
  }

  /**
   * Check if game is still running
   */
  isRunning(): boolean {
    return this.tickInterval !== null;
  }

  /**
   * Force win condition check (called when player disconnects)
   */
  forceWinCheck(): void {
    console.log('Force checking win condition');
    this.checkWinCondition();
  }

  /**
   * Respawn pellets to maintain count
   */
  private respawnPellets(): void {
    const target = config.game.pelletCount;
    const current = this.pellets.size;

    for (let i = 0; i < target - current; i++) {
      const pellet: Pellet = {
        id: `pellet_${Date.now()}_${i}`,
        x: Math.random() * config.game.mapWidth,
        y: Math.random() * config.game.mapHeight,
        mass: 1,
        vx: 0,
        vy: 0,
      };
      this.pellets.set(pellet.id, pellet);
    }
    
    // Update ejected mass positions (apply velocity)
    for (const pellet of this.pellets.values()) {
      if (pellet.isEjected && pellet.vx !== undefined && pellet.vy !== undefined) {
        const speed = Math.sqrt(pellet.vx ** 2 + pellet.vy ** 2);
        
        if (speed > 5) {
          // Apply velocity to position
          pellet.x += pellet.vx * (1 / config.server.tickRate);
          pellet.y += pellet.vy * (1 / config.server.tickRate);
          
          // Decay velocity
          const decay = 0.94;
          pellet.vx *= decay;
          pellet.vy *= decay;
        } else {
          // Velocity has decayed, become normal pellet
          pellet.vx = 0;
          pellet.vy = 0;
          pellet.isEjected = false;
        }
        
        // Clamp to map
        pellet.x = Math.max(0, Math.min(config.game.mapWidth, pellet.x));
        pellet.y = Math.max(0, Math.min(config.game.mapHeight, pellet.y));
      }
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
          x: Math.round(blob.x * 10) / 10, // Round to 1 decimal for bandwidth
          y: Math.round(blob.y * 10) / 10,
          mass: Math.round(blob.mass * 10) / 10,
          velocity: blob.velocity,
          color: blob.color,
          isMerging: blob.isMerging,
          mergeTargetId: blob.mergeTargetId,
        });
      }
    }

    const pelletsArray = Array.from(this.pellets.values()).map(p => ({
      x: Math.round(p.x),
      y: Math.round(p.y),
    }));

    const leaderboard = this.getLeaderboard().slice(0, 10);

    this.io.to(this.id).emit('gameState', {
      blobs,
      pellets: pelletsArray,
      leaderboard,
      spectatorCount: this.spectators.size,
      serverTime: Date.now(), // For debugging sync
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
          isMerging: false,
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

        // Add random angle spread (±30 degrees = ±0.524 radians)
        const spreadAngle = (Math.random() - 0.5) * (Math.PI / 3); // ±30 degrees
        const cos = Math.cos(spreadAngle);
        const sin = Math.sin(spreadAngle);
        
        // Rotate direction vector by spread angle
        const spreadDirX = directionX * cos - directionY * sin;
        const spreadDirY = directionX * sin + directionY * cos;

        // Eject 10 mass
        blob.mass -= 10;
        
        // Create ejected mass with velocity (like split)
        const ejectSpeed = 400; // High velocity like split
        const ejectedMass: any = {
          id: `ejected_${Date.now()}_${Math.random()}`,
          x: blob.x + spreadDirX * 30,
          y: blob.y + spreadDirY * 30,
          mass: 10,
          vx: spreadDirX * ejectSpeed,
          vy: spreadDirY * ejectSpeed,
          isEjected: true,
        };
        
        this.pellets.set(ejectedMass.id, ejectedMass);
      }
    }
  }

  /**
   * Stop game
   */
  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }
}

