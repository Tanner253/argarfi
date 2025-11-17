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
  boundaryTouchTime?: number; // When player started touching boundary
}

export interface Pellet {
  id: string;
  x: number;
  y: number;
  mass: number;
  color?: string; // Random color for pellets
  velocity?: Vector2; // For ejected pellets that move (like splitVelocity)
  createdAt?: number; // When pellet was created
  splitVelocity?: Vector2; // Launch velocity for ejected pellets
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
  spectators: Set<string>; // Socket IDs of spectators
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  countdownStartTime: number | null;
  gameStartTime: number | null;
  maxPlayers: number;
}

export interface GameState {
  players: Map<string, Player>;
  pellets: Map<string, Pellet>;
  spectators: Set<string>; // Socket IDs of spectators
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

