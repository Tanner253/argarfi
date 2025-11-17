# Environment Variables for Phase 1

Create a `.env` file in the root `agarFi/` directory with these variables:

```env
# Development Configuration
NODE_ENV=development
MIN_PLAYERS_DEV=1
AUTO_FILL_BOTS=false

# Server Configuration
SERVER_PORT=3001
SERVER_TICK_RATE=60
MAX_GAME_DURATION_MS=1800000

# Game Configuration
MAP_WIDTH=5000
MAP_HEIGHT=5000
STARTING_MASS=100
PELLET_COUNT=500
SPATIAL_HASH_GRID_SIZE=200

# Lobby Configuration
LOBBY_MIN_PLAYERS=10
LOBBY_MAX_PLAYERS_STANDARD=25
LOBBY_MAX_PLAYERS_WHALE=50
LOBBY_MAX_WAIT_MS=600000
LOBBY_AUTO_START_COUNTDOWN_MS=5000

# Client Configuration
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
NEXT_PUBLIC_TARGET_FPS=60

# Game Modes (Phase 1 - Free play, prices for display only)
GAME_MODE_1=1
GAME_MODE_2=5
GAME_MODE_3=10
GAME_MODE_4=25
GAME_MODE_5=50
GAME_MODE_6=100
GAME_MODE_WHALE=500

# Solana Configuration (Promotional Event - See PROMO_IMPLEMENTATION.md)
SOLANA_RPC_URL=https://your-mainnet-rpc-endpoint-here
SOLANA_NETWORK=mainnet-beta
PLATFORM_WALLET_PRIVATE_KEY=your_base58_private_key_here_KEEP_SECRET
USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
WINNER_REWARD_USDC=1
```

