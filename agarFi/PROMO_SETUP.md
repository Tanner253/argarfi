# 🚀 AgarFi Promotional Event - Setup Guide

This guide will help you configure and test the promotional $1 USDC winner payout system.

---

## 📋 Prerequisites

Before starting, you need:

1. **Platform Wallet** (Mainnet):
   - A Solana wallet with private key (this pays winners)
   - Fund it with:
     - ~0.5 SOL (for transaction fees + ATA creation costs)
     - At least $10-20 USDC (for winner payouts)

2. **RPC Endpoint**:
   - Mainnet RPC URL (Helius, QuickNode, or public)
   - Example: `https://api.mainnet-beta.solana.com`
   - Or premium: `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY`

3. **Testing Wallet** (for testing):
   - Personal Phantom/Solflare wallet to test winning
   - Should have USDC account (or we'll create it automatically)

---

## ⚙️ Configuration

### 1. Create `.env` File

In `agarFi/` directory, add these variables to your `.env`:

```env
# Solana Configuration (Promotional Event)
SOLANA_RPC_URL=https://your-mainnet-rpc-endpoint-here
SOLANA_NETWORK=mainnet-beta
PLATFORM_WALLET_PRIVATE_KEY=your_base58_private_key_here_KEEP_SECRET
USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
WINNER_REWARD_USDC=1
```

### 2. Get Your Platform Wallet Private Key

**Option A - From Phantom Wallet (Export):**
1. Open Phantom
2. Settings → Security & Privacy → Export Private Key
3. Enter password
4. Copy base58 private key

**Option B - Generate New Keypair (Recommended):**

```bash
# Install Solana CLI (if not installed)
# Visit: https://docs.solana.com/cli/install-solana-cli-tools

# Generate new keypair
solana-keygen new --outfile ~/agarfi-platform-wallet.json

# Get public address
solana-keygen pubkey ~/agarfi-platform-wallet.json

# Get base58 private key (first array in JSON file)
# Or use: cat ~/agarfi-platform-wallet.json
```

Then copy the entire JSON array as base58 string, or use a tool to convert.

**⚠️ SECURITY WARNING:**
- **NEVER commit** private keys to git
- **NEVER share** private keys
- Use a dedicated wallet for the platform (not your personal wallet)
- Consider hardware wallet for production

### 3. Fund Platform Wallet

```bash
# Send SOL for fees
solana transfer <PLATFORM_WALLET_ADDRESS> 0.5 --url mainnet-beta

# Send USDC for payouts (you'll need a wallet with USDC)
# Use Phantom or Solflare UI to transfer 10-20 USDC
```

---

## 🧪 Testing

### Step 1: Start the Server

```bash
cd agarFi
npm run dev
```

You should see:
```
💰 Payment service initialized
   Platform wallet: AbCdEf...XyZ123
   Winner reward: 1 USDC
🚀 AgarFi Server running on port 3001
```

If you DON'T see the payment service message, check your `.env` configuration.

### Step 2: Check Platform Balance

Open browser console and run:
```javascript
fetch('http://localhost:3001/api/platform-status')
  .then(r => r.json())
  .then(console.log)
```

Should return:
```json
{
  "enabled": true,
  "balance": 10.5,
  "canPay": true,
  "message": "Creator rewards available"
}
```

### Step 3: Connect Wallet

1. Open http://localhost:3000
2. Click "Connect" button in top-right
3. Select Phantom or Solflare
4. Approve connection

### Step 4: Play a Game

1. Enter your name
2. Click "Play Now" on any tier (e.g., $5 Low Stakes)
3. Wait for game to start (bots will auto-fill)
4. Play and **WIN** the game!

### Step 5: Verify Payout

**Check Server Console:**
```
💰 Processing payout for winner: YourName (AbCdEf...XyZ123)
🔄 Transfer attempt 1/3...
✅ Payout successful: 5Kqm7...signature
✅ Winner YourName paid 1 USDC
   TX: 5Kqm7...signature
```

**Check Transaction Log:**
1. Click "Payouts" button in top nav
2. Your win should appear with:
   - Your wallet address
   - $1 USDC amount
   - "SUCCESS" status
   - "View TX" button

**Check Your Wallet:**
- Open Phantom/Solflare
- Check USDC balance
- Should see +1 USDC

**Verify on Blockchain:**
- Click "View TX" in transaction log
- Opens Solscan with full transaction details

---

## 🐛 Troubleshooting

### "Payment service not configured"

**Problem:** `.env` variables missing or invalid

**Solution:**
1. Check `.env` file exists in `agarFi/` directory
2. Verify all Solana variables are present
3. Restart server after updating `.env`

### "Insufficient platform funds"

**Problem:** Platform wallet has < $1 USDC

**Solution:**
```bash
# Check balance
solana balance <PLATFORM_WALLET_ADDRESS> --url mainnet-beta

# Send more USDC to platform wallet using Phantom UI
```

### "Failed to transfer USDC"

**Possible Causes:**
1. **Network congestion** - Wait and retry
2. **Insufficient SOL** for fees - Add more SOL to platform wallet
3. **RPC rate limit** - Use premium RPC endpoint
4. **Invalid private key** - Double-check `.env` format

**Check Logs:**
- Server console shows detailed error messages
- `transactions.json` file logs all attempts

### Winner doesn't have USDC account

**This is handled automatically!**
- Server creates ATA automatically
- Costs ~0.002 SOL from platform wallet
- Winner receives $1 USDC in new account

### "All 3 attempts failed"

**Problem:** Persistent transfer failure

**Solution:**
1. Check `transactions.json` for error details
2. Verify platform wallet has SOL for fees
3. Test with different RPC endpoint
4. Manual payout:
   ```bash
   # Use Phantom to manually send 1 USDC to winner's wallet
   # Reference transaction ID from transactions.json
   ```

---

## 📊 Monitoring

### Check Platform Balance

```bash
# Via API
curl http://localhost:3001/api/platform-status

# Direct Solana
solana balance <PLATFORM_WALLET_ADDRESS> --url mainnet-beta
```

### View All Transactions

```bash
# Via API
curl http://localhost:3001/api/transactions?limit=100

# Direct file
cat agarFi/packages/server/transactions.json
```

### Transaction JSON Format

```json
{
  "transactions": [
    {
      "id": "tx_1700000000000",
      "timestamp": 1700000000000,
      "winnerId": "player_123456789",
      "winnerName": "CryptoChamp",
      "walletAddress": "7xKXtg2CW9UqpKBjKK5yDqNF5sU3vXqpMxJGMNxQc",
      "amountUSDC": 1,
      "txSignature": "5Kqm7...",
      "gameId": "lobby_5",
      "tier": "5",
      "playersCount": 12,
      "status": "success",
      "retries": 0
    }
  ]
}
```

---

## 💡 Tips

### Testing Without Spending USDC

1. Use **Solana Devnet** (free SOL/USDC):
   ```env
   SOLANA_RPC_URL=https://api.devnet.solana.com
   SOLANA_NETWORK=devnet
   USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
   ```

2. Get devnet SOL: https://faucet.solana.com/
3. Get devnet USDC: Use `spl-token` CLI

### Low Balance Alerts

Watch server console for:
```
⚠️ Platform balance low: 2.5 USDC remaining
```

### Production Checklist

- [ ] Use premium RPC (99.9% uptime)
- [ ] Hardware wallet for platform key (Ledger/Trezor)
- [ ] Set up balance monitoring alerts
- [ ] Regular balance checks (daily)
- [ ] Archive `transactions.json` when >1000 entries
- [ ] Test payout flow end-to-end before launch

---

## 🔐 Security Best Practices

1. **Private Key Storage:**
   - Store in `.env` (never commit to git)
   - Use environment variables in production
   - Consider key management service (AWS Secrets Manager, etc.)

2. **Wallet Separation:**
   - Platform wallet = dedicated for game payouts only
   - Don't use personal wallet
   - Keep only necessary funds (~$50 USDC buffer)

3. **Transaction Monitoring:**
   - Review `transactions.json` regularly
   - Verify all payouts on Solscan
   - Watch for unusual patterns

4. **Backup:**
   - Keep encrypted backup of private key
   - Store recovery phrase offline
   - Document wallet address for reference

---

## 📈 Expected Costs

**Per Winner:**
- USDC payout: $1
- Transaction fee: ~$0.000005 SOL
- ATA creation (if needed): ~0.002 SOL (~$0.20)

**Daily Budget (100 games):**
- USDC: $100
- SOL fees: ~0.2 SOL (~$20)

**Monthly (3000 games):**
- USDC: $3,000
- SOL fees: ~6 SOL (~$600)

---

## 🎉 Ready to Launch!

Once configured:
1. ✅ Server shows "Payment service initialized"
2. ✅ Platform balance shows sufficient USDC
3. ✅ Test payout works (win a game, receive $1)
4. ✅ Transaction appears in log with Solscan link

**You're ready to run the promotional event!** 🚀

For questions or issues, reference `PROMO_IMPLEMENTATION.md` for technical details.

