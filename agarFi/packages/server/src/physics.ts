import { Vector2, Blob, Pellet } from './types.js';

export class Physics {
  /**
   * Calculate speed based on mass
   * Formula: speed = 2.2 × (32 / sqrt(mass)) × 10 (boosted for gameplay)
   */
  static calculateSpeed(mass: number): number {
    return 2.2 * (32 / Math.sqrt(mass)) * 10;
  }

  /**
   * Calculate radius from mass
   * radius = sqrt(mass / PI) × 3 (3x bigger sprites)
   */
  static calculateRadius(mass: number): number {
    return Math.sqrt(mass / Math.PI) * 3;
  }

  /**
   * Check if predator can eat prey (must be 10% larger)
   */
  static canEat(predatorMass: number, preyMass: number): boolean {
    return predatorMass > preyMass * 1.1;
  }

  /**
   * Calculate distance between two points
   */
  static distance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Check collision between two circular objects
   */
  static checkCollision(
    x1: number,
    y1: number,
    r1: number,
    x2: number,
    y2: number,
    r2: number
  ): boolean {
    return this.distance(x1, y1, x2, y2) <= r1 + r2;
  }

  /**
   * Normalize a vector
   */
  static normalize(v: Vector2): Vector2 {
    const length = Math.sqrt(v.x * v.x + v.y * v.y);
    if (length === 0) return { x: 0, y: 0 };
    return {
      x: v.x / length,
      y: v.y / length,
    };
  }

  /**
   * Move blob in direction of target (continuous movement, doesn't stop at target)
   */
  static moveToward(
    blob: Blob,
    targetX: number,
    targetY: number,
    deltaTime: number
  ): void {
    const direction: Vector2 = {
      x: targetX - blob.x,
      y: targetY - blob.y,
    };

    const distance = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
    
    // Only move if target is far enough (prevents jitter when close)
    if (distance < 5) {
      return; // Don't move if already very close to target
    }

    // Get direction (normalized)
    const normalized = this.normalize(direction);
    const speed = this.calculateSpeed(blob.mass);

    // Smoothly adjust velocity toward target direction
    const targetVelX = normalized.x * speed;
    const targetVelY = normalized.y * speed;
    
    // Smooth velocity change (prevents instant direction changes)
    const velocityLerp = 0.7; // Smooth but responsive
    blob.velocity.x += (targetVelX - blob.velocity.x) * velocityLerp;
    blob.velocity.y += (targetVelY - blob.velocity.y) * velocityLerp;

    // Update position
    blob.x += blob.velocity.x * deltaTime;
    blob.y += blob.velocity.y * deltaTime;
  }

  /**
   * Clamp position within map boundaries
   */
  static clampToMap(
    x: number,
    y: number,
    radius: number,
    mapWidth: number,
    mapHeight: number
  ): Vector2 {
    return {
      x: Math.max(radius, Math.min(mapWidth - radius, x)),
      y: Math.max(radius, Math.min(mapHeight - radius, y)),
    };
  }
}

