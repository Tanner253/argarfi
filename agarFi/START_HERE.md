# 🎮 START HERE - AgarFi Phase 1

## ⚡ Fastest Way to Demo (3 Commands)

```bash
# 1. Navigate to project
cd C:\Users\perci\source\repos\ShitcoinApps\AGARw3\agarFi

# 2. Install everything (first time only)
npm install && cd packages\server && npm install && cd ..\.. && cd packages\client && npm install && cd ..\..

# 3. Run the game
npm run dev
```

Then open: **http://localhost:3000**

---

## 🎯 What You'll See

1. **Homepage** with 6 game modes + Whale Mode (locked)
2. **Enter your name**
3. **Click any game mode**
4. **Bots auto-fill** (you'll see players count jump to 10)
5. **Countdown starts** (120 seconds, shows in lobby)
6. **Game begins** - Full agar.io gameplay!
7. **Stats at end** - See all your metrics

---

## 🎮 Controls

| Action | Control |
|--------|---------|
| Move | Mouse cursor |
| Split | SPACE bar |
| Eject Mass | W key |
| Mobile Split | Tap "SPLIT" button |
| Mobile Eject | Tap "EJECT" button |

---

## ✨ What Works

✅ Multiplayer (open multiple browsers)  
✅ Real-time leaderboard  
✅ 60Hz server physics  
✅ 60fps client rendering  
✅ AI bots for testing  
✅ Stats tracking  
✅ Tie-breakers  
✅ Mobile touch controls  
✅ 6 game tiers  
✅ 120s auto-start  
✅ Dynamic lobbies

---

## 🏆 Win Conditions

- **Elimination**: Last player alive wins
- **Time**: After 30 minutes, highest mass wins

**Tie-Breakers** (in order):
1. Time Survived (longer wins)
2. Cells Eaten (more wins)
3. Pellets Eaten (more wins)

---

## 🔧 Configuration

Edit `.env` file:

```env
# Quick testing (2 players, bots fill)
MIN_PLAYERS_DEV=2
AUTO_FILL_BOTS=true

# Realistic (10 players)
MIN_PLAYERS_DEV=10
AUTO_FILL_BOTS=true

# Pure multiplayer (no bots)
MIN_PLAYERS_DEV=2
AUTO_FILL_BOTS=false
```

---

## 📞 Troubleshooting

**Problem**: npm run dev fails  
**Solution**: Run installs manually (see QUICK_START.md)

**Problem**: Can't connect to server  
**Solution**: Check http://localhost:3001/api/health

**Problem**: Game won't start  
**Solution**: Make sure `.env` file exists with AUTO_FILL_BOTS=true

**Problem**: Port already in use  
**Solution**: Change SERVER_PORT in `.env` or kill process

---

## 📚 Documentation

- `README.md` - Full documentation
- `QUICK_START.md` - Installation guide
- `DEMO_INSTRUCTIONS.md` - Detailed demo flow
- `PHASE1_COMPLETE.md` - What's included
- `ENV_CONFIG.md` - All environment variables

---

## 🎊 Ready to Demo!

Phase 1 is **fully functional** and matches the feature spec 100%.

**Next**: Get feedback, then build Phase 2 (auth) and Phase 3 (payments).

---

**Press START and demo away!** 🚀

