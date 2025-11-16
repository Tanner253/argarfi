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

    // Random movement with some strategy
    const strategy = Math.random();

    if (strategy < 0.7) {
      // Move toward nearest pellet (70% of the time)
      let nearestPellet: { x: number; y: number } | null = null;
      let minDistance = Infinity;

      for (const pellet of gameRoom.pellets.values()) {
        const dist = Math.sqrt(
          (pellet.x - largestBlob.x) ** 2 + (pellet.y - largestBlob.y) ** 2
        );
        if (dist < minDistance) {
          minDistance = dist;
          nearestPellet = pellet;
        }
      }

      if (nearestPellet) {
        gameRoom.handlePlayerMove(botId, nearestPellet.x, nearestPellet.y);
      }
    } else if (strategy < 0.85) {
      // Random movement (15% of the time)
      const randomX = Math.random() * 5000;
      const randomY = Math.random() * 5000;
      gameRoom.handlePlayerMove(botId, randomX, randomY);
    } else {
      // Chase smaller players (15% of the time)
      let targetBlob: { x: number; y: number } | null = null;

      for (const p of gameRoom.players.values()) {
        if (p.id === botId) continue;
        for (const blob of p.blobs) {
          if (blob.mass < largestBlob.mass * 0.9) {
            targetBlob = blob;
            break;
          }
        }
        if (targetBlob) break;
      }

      if (targetBlob) {
        gameRoom.handlePlayerMove(botId, targetBlob.x, targetBlob.y);
      }
    }

    // Occasionally split or eject (10% chance each tick)
    if (Math.random() < 0.1 && player.blobs[0].mass > 100) {
      if (Math.random() < 0.5) {
        gameRoom.handlePlayerSplit(botId);
      } else {
        gameRoom.handlePlayerEject(botId);
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

