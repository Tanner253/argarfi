# Production Environment Variables

## ✅ REQUIRED Production .env Settings

Copy this to your **production server .env** file:

```env
# ============================================
# ENVIRONMENT (CRITICAL - SET THIS FIRST!)
# ============================================
NODE_ENV=production

# ============================================
# LOBBY CONFIGURATION (Production Values)
# ============================================
LOBBY_MIN_PLAYERS=10          # Minimum 10 players to start
LOBBY_MAX_PLAYERS_STANDARD=25
LOBBY_MAX_PLAYERS_WHALE=50
LOBBY_AUTO_START_COUNTDOWN_MS=120000

# ⚠️ DO NOT SET MIN_PLAYERS_DEV IN PRODUCTION!
# If NODE_ENV=production, MIN_PLAYERS_DEV is ignored automatically

# ============================================
# DREAM MODE
# ============================================
DREAM_ENABLED=true
DREAM_PAYOUT_USDC=1
DREAM_MAX_PLAYERS=25
DREAM_GAME_DURATION_MS=1800000
DREAM_INTERVAL_HOURS=1

# ============================================
# BOTS (Production Should Disable)
# ============================================
AUTO_FILL_BOTS=false         # ⚠️ MUST be false in production!

# ============================================
# SECURITY SECRETS (Generate New Ones!)
# ============================================
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=GENERATE_NEW_SECRET_HERE

# ============================================
# SOLANA WALLET (KEEP SECRET!)
# ============================================
PLATFORM_WALLET_PRIVATE_KEY=your_base58_private_key_KEEP_SECRET
SOLANA_RPC_URL=https://your-premium-rpc.com
USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# ============================================
# DATABASE
# ============================================
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/agarfi

# ============================================
# PAYMENT DISTRIBUTION
# ============================================
WINNER_PERCENTAGE=80
PLATFORM_PERCENTAGE=15
BURN_PERCENTAGE=5
BURN_WALLET_ADDRESS=H1KqwEHWJNBxnbuiVQi4iTEaR7p1nVXi3aPv34zzBrPE

# ============================================
# GAME MODES (Entry Fees in USDC)
# ============================================
GAME_MODE_1_ENTRY=1
GAME_MODE_5_ENTRY=5
GAME_MODE_10_ENTRY=10
GAME_MODE_25_ENTRY=25
GAME_MODE_50_ENTRY=50
GAME_MODE_100_ENTRY=100
GAME_MODE_WHALE_ENTRY=500
```

---

## 🚨 CRITICAL Production Settings:

| Variable | Dev Value | Production Value | Why Important |
|----------|-----------|------------------|---------------|
| `NODE_ENV` | `development` | **`production`** | Disables dev overrides |
| `MIN_PLAYERS_DEV` | `2` or `25` | **REMOVE THIS** | Ignored in production anyway |
| `AUTO_FILL_BOTS` | `true` | **`false`** | No bots in real games! |
| `LOBBY_MIN_PLAYERS` | `10` | **`10`** | Real minimum for fair games |
| `JWT_SECRET` | Default | **Generate new!** | Security critical |

---

## 🎯 Config Logic (Now Fixed):

### Development Mode:
```typescript
NODE_ENV=development (or not set)
MIN_PLAYERS_DEV=2
LOBBY_MIN_PLAYERS=10

Result: minPlayers = 2 (uses MIN_PLAYERS_DEV)
Auto-fill bots: YES (if AUTO_FILL_BOTS=true)
```

### Production Mode:
```typescript
NODE_ENV=production
MIN_PLAYERS_DEV=2           ← IGNORED!
LOBBY_MIN_PLAYERS=10

Result: minPlayers = 10 (uses LOBBY_MIN_PLAYERS)
Auto-fill bots: NO (always false in production)
```

---

## ✅ Deployment Checklist:

Before deploying to production:

1. ✅ Set `NODE_ENV=production`
2. ✅ Remove or comment out `MIN_PLAYERS_DEV`
3. ✅ Set `AUTO_FILL_BOTS=false`
4. ✅ Set `LOBBY_MIN_PLAYERS=10`
5. ✅ Generate new `JWT_SECRET`
6. ✅ Verify `PLATFORM_WALLET_PRIVATE_KEY` is set
7. ✅ Set premium `SOLANA_RPC_URL`
8. ✅ Double-check `MONGODB_URI`

**Your production deployment is now foolproof!** 🔒

