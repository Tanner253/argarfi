export interface Vector2 {
  x: number;
  y: number;
}

export interface PlayerStats {
  pelletsEaten: number;
  cellsEaten: number;
  maxMass: number;
  leaderTime: number;
  bestRank: number;
  timeSurvived: number;
}

export interface Blob {
  id: string;
  playerId: string;
  x: number;
  y: number;
  mass: number;
  velocity: Vector2;
  color: string;
  splitTime: number; // When this blob was created via split
  canMerge: boolean; // Can merge with other blobs from same player
  splitVelocity: Vector2; // Separate velocity for split launch
  isMerging: boolean; // Currently in merge animation
  mergeTargetId?: string; // ID of blob merging into
  mergeStartTime?: number; // When merge animation started
}

export interface Player {
  id: string;
  socketId: string;
  name: string;
  blobs: Blob[];
  totalMass: number;
  stats: PlayerStats;
  joinTime: number;
  lastInputTime: number;
  isBot: boolean;
}

export interface Pellet {
  id: string;
  x: number;
  y: number;
  mass: number;
  vx?: number; // Velocity for ejected mass
  vy?: number;
  isEjected?: boolean;
}

export interface GameConfig {
  mapWidth: number;
  mapHeight: number;
  startingMass: number;
  pelletCount: number;
  tickRate: number;
  maxGameDuration: number;
  spatialHashGridSize: number;
}

export interface LobbyConfig {
  minPlayers: number;
  maxPlayers: number;
  maxWaitTime: number;
  autoStartCountdown: number;
}

export interface Lobby {
  id: string;
  tier: string;
  players: Map<string, Player>;
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  countdownStartTime: number | null;
  gameStartTime: number | null;
  maxPlayers: number;
}

export interface GameState {
  players: Map<string, Player>;
  pellets: Map<string, Pellet>;
  startTime: number;
  lastTickTime: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  mass: number;
  cellsEaten: number;
  rank: number;
}

export interface GameEndResult {
  winnerId: string | null;
  finalRankings: Array<{
    id: string;
    name: string;
    mass: number;
    timeSurvived: number;
    cellsEaten: number;
  }>;
  playerStats: Record<string, PlayerStats>;
}

