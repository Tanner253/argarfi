import { GameRoom } from './gameRoom.js';

export class BotManager {
  private bots: Map<string, { gameRoom: GameRoom; intervalId: NodeJS.Timeout }>;

  constructor() {
    this.bots = new Map();
  }

  /**
   * Add bot to game and start AI behavior
   */
  addBot(botId: string, gameRoom: GameRoom): void {
    // Simple AI: Random movement with occasional splits/ejects
    const intervalId = setInterval(() => {
      this.updateBot(botId, gameRoom);
    }, 100); // Update bot AI every 100ms

    this.bots.set(botId, { gameRoom, intervalId });
  }

  /**
   * Update bot AI behavior
   */
  private updateBot(botId: string, gameRoom: GameRoom): void {
    const player = gameRoom.players.get(botId);
    if (!player || player.blobs.length === 0) {
      this.removeBot(botId);
      return;
    }

    // Get largest blob position
    const largestBlob = player.blobs.reduce((prev, current) => 
      current.mass > prev.mass ? current : prev
    );

    // Store current target to smooth movement
    if (!this.bots.has(botId)) return;
    const botData = this.bots.get(botId);
    if (!botData) return;

    // Store last target position for smoother movement
    if (!(botData as any).lastTarget) {
      (botData as any).lastTarget = { x: largestBlob.x, y: largestBlob.y };
    }
    const lastTarget = (botData as any).lastTarget;

    // Random movement with some strategy (but update target less frequently for smooth movement)
    const strategy = Math.random();

    if (strategy < 0.7) {
      // Move toward nearest pellet (70% of the time)
      let nearestPellet: { x: number; y: number } | null = null;
      let minDistance = Infinity;

      for (const pellet of gameRoom.pellets.values()) {
        const dist = Math.sqrt(
          (pellet.x - largestBlob.x) ** 2 + (pellet.y - largestBlob.y) ** 2
        );
        if (dist < minDistance && dist < 500) { // Only look at nearby pellets
          minDistance = dist;
          nearestPellet = pellet;
        }
      }

      if (nearestPellet) {
        // Smooth transition to new target
        lastTarget.x += (nearestPellet.x - lastTarget.x) * 0.3;
        lastTarget.y += (nearestPellet.y - lastTarget.y) * 0.3;
      }
    } else if (strategy < 0.85) {
      // Move in current direction with slight variation (15% of the time)
      const angle = Math.random() * Math.PI * 2;
      const distance = 200;
      lastTarget.x += Math.cos(angle) * distance * 0.1;
      lastTarget.y += Math.sin(angle) * distance * 0.1;
      
      // Keep within map bounds
      lastTarget.x = Math.max(100, Math.min(4900, lastTarget.x));
      lastTarget.y = Math.max(100, Math.min(4900, lastTarget.y));
    } else {
      // Chase smaller players (15% of the time)
      let targetBlob: { x: number; y: number } | null = null;

      for (const p of gameRoom.players.values()) {
        if (p.id === botId) continue;
        for (const blob of p.blobs) {
          if (blob.mass < largestBlob.mass * 0.9) {
            const dist = Math.sqrt((blob.x - largestBlob.x) ** 2 + (blob.y - largestBlob.y) ** 2);
            if (dist < 800) { // Only chase if close
              targetBlob = blob;
              break;
            }
          }
        }
        if (targetBlob) break;
      }

      if (targetBlob) {
        lastTarget.x += (targetBlob.x - lastTarget.x) * 0.2;
        lastTarget.y += (targetBlob.y - lastTarget.y) * 0.2;
      }
    }

    // Send smoothed target to server
    gameRoom.handlePlayerMove(botId, lastTarget.x, lastTarget.y);

    // Occasionally split or eject (5% chance each tick, reduced from 10%)
    if (Math.random() < 0.05 && player.blobs[0].mass > 100) {
      const targetX = lastTarget.x;
      const targetY = lastTarget.y;
      
      if (Math.random() < 0.5) {
        gameRoom.handlePlayerSplit(botId, targetX, targetY);
      } else {
        gameRoom.handlePlayerEject(botId, targetX, targetY);
      }
    }
  }

  /**
   * Remove bot from tracking
   */
  removeBot(botId: string): void {
    const bot = this.bots.get(botId);
    if (bot) {
      clearInterval(bot.intervalId);
      this.bots.delete(botId);
    }
  }

  /**
   * Remove all bots
   */
  removeAllBots(): void {
    for (const [botId] of this.bots) {
      this.removeBot(botId);
    }
  }
}

