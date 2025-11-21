# Mobile Payment Debug Guide

## How to View Console on Mobile

### Chrome Android:
1. Connect phone to computer via USB
2. Enable USB debugging on phone
3. On computer: Open Chrome → `chrome://inspect`
4. Click "inspect" under your phone's browser
5. Console tab shows all logs

### Safari iOS:
1. Enable Web Inspector: Settings → Safari → Advanced → Web Inspector
2. Connect iPhone to Mac via USB
3. On Mac: Safari → Develop → [Your iPhone] → [AgarFi]
4. Console shows all logs

### Alternative (No Computer):
1. Use Eruda (mobile console): Add this to browser URL bar:
```
javascript:(function(){var script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/eruda';document.body.appendChild(script);script.onload=function(){eruda.init()}})()
```

## What to Look For

When you click "Join Game", you should see:

```
🔍 Pre-payment validation:
   publicKey: EndD214b...
   signTransaction: function
   signTransaction exists: true

🔄 Starting payment flow...
   All validations passed, calling payEntryFee...

💳 Processing payment...
   Amount: $1 USDC
   Wallet: EndD214b...
   RPC: https://api.mainnet-beta.solana.com...
   signTransaction exists: true
   signTransaction type: function

🔨 Constructing USDC transfer transaction...
📥 From: 8fS689S3...
📤 To: FcAENdG4...
✅ Transaction constructed

✍️  Signing transaction with wallet...
```

**← Phantom should open HERE**

If you see an error BEFORE "Signing transaction with wallet...", send me the exact error message.

## Common Issues

### If you see: `signTransaction is null/undefined`
**Fix:** Wallet adapter not properly connected. Try:
1. Disconnect wallet
2. Refresh page
3. Reconnect wallet
4. Try again

### If you see: `publicKey is null`
**Fix:** Wallet connection lost. Reconnect wallet.

### If Phantom opens but transaction fails
**Fix:** Might be insufficient SOL for gas fees (need ~0.00001 SOL)

