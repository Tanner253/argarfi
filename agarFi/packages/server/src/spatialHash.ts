import { Blob, Pellet } from './types.js';

/**
 * Spatial hashing for efficient collision detection
 * Divides the map into grid cells and only checks collisions within same/adjacent cells
 */
export class SpatialHash {
  private gridSize: number;
  private grid: Map<string, Array<Blob | Pellet>>;

  constructor(gridSize: number) {
    this.gridSize = gridSize;
    this.grid = new Map();
  }

  /**
   * Get grid key for coordinates
   */
  private getKey(x: number, y: number): string {
    const gridX = Math.floor(x / this.gridSize);
    const gridY = Math.floor(y / this.gridSize);
    return `${gridX},${gridY}`;
  }

  /**
   * Clear all buckets
   */
  clear(): void {
    this.grid.clear();
  }

  /**
   * Insert entity into grid
   */
  insert(entity: Blob | Pellet): void {
    const key = this.getKey(entity.x, entity.y);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key)!.push(entity);
  }

  /**
   * Get all entities in same and adjacent cells
   */
  getNearby(x: number, y: number): Array<Blob | Pellet> {
    const nearby: Array<Blob | Pellet> = [];
    const gridX = Math.floor(x / this.gridSize);
    const gridY = Math.floor(y / this.gridSize);

    // Check 3x3 grid around position
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${gridX + dx},${gridY + dy}`;
        const bucket = this.grid.get(key);
        if (bucket) {
          nearby.push(...bucket);
        }
      }
    }

    return nearby;
  }

  /**
   * Get all entities in grid
   */
  getAll(): Array<Blob | Pellet> {
    const all: Array<Blob | Pellet> = [];
    for (const bucket of this.grid.values()) {
      all.push(...bucket);
    }
    return all;
  }
}

