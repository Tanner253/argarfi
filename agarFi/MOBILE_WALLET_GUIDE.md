# 📱 Mobile Wallet Integration Guide

This guide explains how wallet connection works on mobile devices and how to test it.

---

## 🎯 How It Works

### **Desktop (Browser Extension)**
1. User clicks "Connect"
2. Phantom/Solflare extension popup appears
3. User approves connection
4. Wallet connected ✅

### **Mobile (Deep Linking)**
1. User clicks "Connect" 
2. **Detects mobile device** (iOS/Android)
3. **Opens Phantom app** via deep link
4. User approves in Phantom app
5. Returns to site in Phantom in-app browser
6. Wallet connected ✅

---

## 🔧 Implementation Details

### Mobile Detection

```typescript
function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
```

### Deep Link Format

```typescript
// Redirects to Phantom app and loads your site inside it
const deepLink = `https://phantom.app/ul/browse/${encodeURIComponent(yourSiteUrl)}`;
window.location.href = deepLink;
```

### Mobile Wallet Connection Flow

```typescript
if (isMobile()) {
  // Check if already in Phantom browser
  if (window.phantom?.solana?.isPhantom) {
    await window.phantom.solana.connect(); // ✅ Connect directly
  } else {
    openPhantomDeepLink(); // ✅ Redirect to Phantom app
  }
}
```

---

## 📱 Testing Mobile Wallet

### **Prerequisites:**
1. **Install Phantom Mobile App:**
   - iOS: https://apps.apple.com/app/phantom-solana-wallet/1598432977
   - Android: https://play.google.com/store/apps/details?id=app.phantom

2. **Create/Import Wallet** in Phantom app

3. **Fund with test USDC** (optional, for receiving payouts)

---

### **Testing Steps:**

#### **Method 1: Test on Phone (Real Mobile)**

1. **Deploy to Vercel** or use **ngrok** to expose localhost:
   ```bash
   # Install ngrok (if needed)
   # Then expose your local server
   ngrok http 3000
   ```

2. **Open ngrok URL** on your phone:
   - Example: https://abc123.ngrok.io

3. **Click "Play Now"** → Wallet connect modal appears

4. **Tap "Phantom"** → Redirects to Phantom app

5. **Approve connection** in Phantom

6. **Automatically returns** to site in Phantom browser

7. **Play game and win** → Check Phantom app for $1 USDC

---

#### **Method 2: Test in Phantom Mobile Browser (Easiest)**

1. **Open Phantom app** on your phone

2. **Tap browser icon** (🌐) at bottom

3. **Enter URL:**
   - Production: https://agarfi.io
   - Local (via ngrok): https://abc123.ngrok.io

4. **Site loads in Phantom browser** → `window.phantom.solana` available

5. **Click "Play Now"** → Wallet connects immediately (no deep link needed)

6. **Play and win** → USDC appears in Phantom wallet

---

### **Method 3: Chrome DevTools Mobile Emulation**

⚠️ **Limited Testing** - Simulates mobile UI but can't test actual wallet connection.

1. Chrome DevTools → Toggle Device Toolbar (Ctrl+Shift+M)
2. Select iPhone or Android device
3. Refresh page
4. See mobile-specific UI
5. **Can't actually connect wallet** (no Phantom provider in emulator)

**Use for:** UI/layout testing only

---

## 🐛 Troubleshooting

### "No Solana wallet detected" on mobile

**Problem:** Not in Phantom in-app browser

**Solution:** 
- Tap "Phantom" button → Opens Phantom app
- Or manually open site in Phantom browser

### Deep link doesn't work

**Problem:** User doesn't have Phantom installed

**Solution:**
- Show "Download Phantom Mobile" button
- Links to App Store / Play Store

### Wallet connects but disconnects immediately

**Problem:** User left Phantom browser

**Solution:**
- Wallet state persists in localStorage
- Reconnects automatically if returning to Phantom browser

### Can't test locally on mobile

**Problem:** localhost:3000 not accessible from phone

**Solutions:**
1. **Use ngrok** (recommended):
   ```bash
   ngrok http 3000
   # Use HTTPS url on phone
   ```

2. **Use local IP** (same WiFi):
   ```bash
   # Find your IP: ipconfig (Windows) or ifconfig (Mac/Linux)
   # Open http://192.168.1.X:3000 on phone
   ```

3. **Deploy to Vercel** (easiest for testing):
   ```bash
   cd agarFi/packages/client
   vercel deploy
   # Use preview URL on phone
   ```

---

## 📊 Supported Mobile Wallets

| Wallet | iOS | Android | Deep Link Support |
|--------|-----|---------|-------------------|
| **Phantom** | ✅ | ✅ | ✅ Fully supported |
| **Solflare** | ✅ | ✅ | ⚠️ Requires WalletConnect |
| **Backpack** | ✅ | ✅ | ⚠️ Not implemented yet |

Currently **Phantom** has the best mobile support and is **recommended**.

---

## 🔍 How to Verify Mobile Connection

### In Server Console:
```
💼 Wallet registered for YourName: 56FDih...HSSdR
```

### In Browser Console (on phone):
```javascript
// Check if in Phantom browser
console.log(window.phantom?.solana?.isPhantom); // true

// Check connected address
console.log(window.phantom?.solana?.publicKey?.toString());
```

### After Winning:
- Check Phantom app → USDC balance increased by $1
- Transaction appears in "Activity" tab
- Can view on Solscan directly from Phantom

---

## 💡 Best Practices

### For Mobile Users:
1. **Always use Phantom in-app browser** (most reliable)
2. Keep Phantom app updated
3. Enable notifications for transaction confirmations
4. Check "Activity" tab for payout history

### For Developers:
1. Test on **real devices** (not just emulators)
2. Test both iOS and Android
3. Test with and without Phantom installed
4. Verify deep links work correctly
5. Test poor network conditions (mobile data)

---

## 📲 QR Code Support (Future Enhancement)

For easier mobile connection, we could add:

```typescript
// Generate WalletConnect QR code
// User scans with Phantom mobile
// Automatically connects desktop browser
```

**Not needed for current promo**, but good for future.

---

## ✅ Current Mobile Support Status

- ✅ **Mobile detection** working
- ✅ **Phantom deep linking** implemented
- ✅ **Phantom in-app browser** supported
- ✅ **Mobile-specific UI** in connect modal
- ✅ **Persistent connection** via localStorage
- ✅ **Payout works** on mobile (same backend)
- ⚠️ **Solflare mobile** needs WalletConnect (not implemented)

**Phantom mobile is fully functional!** 🎉

---

## 🧪 Quick Mobile Test Checklist

- [ ] Install Phantom on phone
- [ ] Open site in Phantom browser
- [ ] Click "Play Now"
- [ ] Wallet connects without redirect
- [ ] Enter name and join game
- [ ] Play and win
- [ ] Check Phantom → See +$1 USDC
- [ ] Open transaction in Phantom → View on Solscan

**Ready for mobile users!** 📱

