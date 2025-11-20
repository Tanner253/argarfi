# Environment Variables for Phase 3 (Payment System)

Create a `.env` file in the root `agarFi/` directory with these variables:

```env
# ============================================
# CLIENT-SIDE VARIABLES (NEXT_PUBLIC_ prefix)
# ============================================
# These are exposed to the browser - DO NOT put secrets here

NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
NEXT_PUBLIC_TARGET_FPS=60
NEXT_PUBLIC_SOLANA_RPC=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_WINNER_REWARD_USDC=1
NEXT_PUBLIC_DREAM_PAYOUT=1
NEXT_PUBLIC_DREAM_MAX_PLAYERS=25
NEXT_PUBLIC_DREAM_INTERVAL_HOURS=1

# For better performance, use a premium RPC (recommended):
# NEXT_PUBLIC_SOLANA_RPC=https://solana-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# ============================================
# SERVER-SIDE VARIABLES
# ============================================
# These are NEVER exposed to the browser - safe for secrets

# Development Configuration
NODE_ENV=development
MIN_PLAYERS_DEV=2
AUTO_FILL_BOTS=true
DEV_IP_WHITELIST=

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
SHRINKING_ENABLED=true
SHRINK_START_PERCENT=0.5

# Lobby Configuration
LOBBY_MIN_PLAYERS=10
LOBBY_MAX_PLAYERS_STANDARD=25
LOBBY_MAX_PLAYERS_WHALE=50
LOBBY_MAX_WAIT_MS=600000
LOBBY_AUTO_START_COUNTDOWN_MS=120000

# Database Configuration
MONGODB_URI=mongodb+srv://user:<db_password>@agarfi.n1mmpxz.mongodb.net/?appName=Agarfi

# Solana Configuration (Treasury Wallet - KEEP SECRET!)
SOLANA_RPC_URL=https://your-mainnet-rpc-endpoint-here
SOLANA_NETWORK=mainnet-beta
PLATFORM_WALLET_PRIVATE_KEY=your_base58_private_key_here_KEEP_SECRET
USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# Game Modes Entry Fees (USDC)
GAME_MODE_1_ENTRY=1
GAME_MODE_5_ENTRY=5
GAME_MODE_10_ENTRY=10
GAME_MODE_25_ENTRY=25
GAME_MODE_50_ENTRY=50
GAME_MODE_100_ENTRY=100
GAME_MODE_WHALE_ENTRY=500

# Payment Distribution (Percentage)
WINNER_PERCENTAGE=80
PLATFORM_PERCENTAGE=15
BURN_PERCENTAGE=5
BURN_WALLET_ADDRESS=H1KqwEHWJNBxnbuiVQi4iTEaR7p1nVXi3aPv34zzBrPE

# Dream Mode Configuration (Free hourly game)
DREAM_ENABLED=true
DREAM_PAYOUT_USDC=1
DREAM_MIN_PLAYERS=10
DREAM_MAX_PLAYERS=25
DREAM_GAME_DURATION_MS=1800000
DREAM_INTERVAL_HOURS=1
```

## 🔐 Security Notes

**Client-side variables (NEXT_PUBLIC_*):**
- ⚠️ Visible in browser
- ⚠️ Never put secrets here
- ✅ Safe for RPC URLs, display values, public addresses

**Server-side variables:**
- ✅ Only accessible to Node.js server
- ✅ Safe for private keys, database credentials
- ✅ Never sent to browser


