import { GameRoom } from './gameRoom.js';

export class BotManager {
  private bots: Map<string, { gameRoom: GameRoom; intervalId: NodeJS.Timeout; lastSplit: number }>;

  constructor() {
    this.bots = new Map();
  }

  addBot(botId: string, gameRoom: GameRoom): void {
    const intervalId = setInterval(() => {
      this.updateBot(botId, gameRoom);
    }, 100);

    this.bots.set(botId, { gameRoom, intervalId, lastSplit: 0 });
  }

  private updateBot(botId: string, gameRoom: GameRoom): void {
    const player = gameRoom.players.get(botId);
    const botData = this.bots.get(botId);
    if (!player || player.blobs.length === 0 || !botData) {
      this.removeBot(botId);
      return;
    }

    const now = Date.now();
    const largestBlob = player.blobs.reduce((prev, current) => 
      current.mass > prev.mass ? current : prev
    );

    const botName = player.name;
    const botPos = `(${Math.floor(largestBlob.x)}, ${Math.floor(largestBlob.y)})`;

    // Get safe bounds
    const bounds = gameRoom.currentMapBounds;
    const SAFE_MARGIN = 200;

    // Find nearest pellet that's WITHIN safe bounds
    let nearestPellet: { x: number; y: number } | null = null;
    let minPelletDist = Infinity;

    for (const pellet of gameRoom.pellets.values()) {
      // Skip pellets outside safe zone
      if (pellet.x < bounds.minX + SAFE_MARGIN || pellet.x > bounds.maxX - SAFE_MARGIN ||
          pellet.y < bounds.minY + SAFE_MARGIN || pellet.y > bounds.maxY - SAFE_MARGIN) {
        continue;
      }

      const dist = Math.sqrt(
        (pellet.x - largestBlob.x) ** 2 + (pellet.y - largestBlob.y) ** 2
      );
      if (dist < 500 && dist < minPelletDist) {
        minPelletDist = dist;
        nearestPellet = pellet;
      }
    }

    // Find attackable player and nearby bots
    let attackTarget: { x: number; y: number; mass: number; dist: number } | null = null;
    let nearbyBots: Array<{ x: number; y: number }> = [];

    for (const p of gameRoom.players.values()) {
      if (p.id === botId) continue;
      
      for (const blob of p.blobs) {
        const dist = Math.sqrt(
          (blob.x - largestBlob.x) ** 2 + (blob.y - largestBlob.y) ** 2
        );

        // Detect nearby bots (prevent clustering)
        if (p.isBot && dist < 150) {
          const massRatio = Math.abs(blob.mass - largestBlob.mass) / Math.max(largestBlob.mass, 1);
          // Similar mass bots that can't eat each other
          if (massRatio < 0.25) {
            nearbyBots.push({ x: blob.x, y: blob.y });
          }
        }

        // Find prey to attack
        if (blob.mass < largestBlob.mass * 0.85 && dist < 250) {
          if (!attackTarget || dist < attackTarget.dist) {
            attackTarget = { x: blob.x, y: blob.y, mass: blob.mass, dist };
          }
        }
      }
    }

    // Decision making
    let targetX: number;
    let targetY: number;

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    // Priority 1: Chase pellets (primary behavior)
    if (nearestPellet) {
      targetX = nearestPellet.x;
      targetY = nearestPellet.y;
    }
    // Priority 2: Wander
    else {
      // Add avoidance randomness if near bots
      let randomOffset = 400;
      if (nearbyBots.length > 0) {
        // Add extra randomness to break symmetry
        randomOffset = 600;
      }
      
      targetX = centerX + (Math.random() - 0.5) * randomOffset;
      targetY = centerY + (Math.random() - 0.5) * randomOffset;
    }

    // Calculate distance to target
    const distToTarget = Math.sqrt(
      (targetX - largestBlob.x) ** 2 + (targetY - largestBlob.y) ** 2
    );

    // STUCK RECOVERY: If bot hasn't moved, force new target
    if (distToTarget < 5) {
      console.log(`⚠️ ${botName} STUCK! Forcing wander to center`);
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      targetX = centerX + (Math.random() - 0.5) * 500;
      targetY = centerY + (Math.random() - 0.5) * 500;
    }

    gameRoom.handlePlayerMove(botId, targetX, targetY);

    // Split to attack - ONLY when very close
    if (attackTarget && now - botData.lastSplit > 1200) {
      const halfMass = largestBlob.mass / 2;
      const canEat = attackTarget.mass < halfMass * 0.9;
      // Much tighter range: 110-160 units (optimal hitting distance)
      const inRange = attackTarget.dist >= 110 && attackTarget.dist <= 160;

      if (canEat && inRange && largestBlob.mass > 60 && player.blobs.length < 8) {
        gameRoom.handlePlayerSplit(botId, attackTarget.x, attackTarget.y);
        botData.lastSplit = now;
        console.log(`⚡ ${botName} split at ${Math.floor(attackTarget.dist)} units`);
      }
    }
  }

  removeBot(botId: string): void {
    const bot = this.bots.get(botId);
    if (bot) {
      clearInterval(bot.intervalId);
      this.bots.delete(botId);
    }
  }

  removeAllBots(): void {
    for (const [botId] of this.bots) {
      this.removeBot(botId);
    }
  }

  clearAll(): void {
    console.log(`Clearing ${this.bots.size} bots...`);
    this.removeAllBots();
  }
}

