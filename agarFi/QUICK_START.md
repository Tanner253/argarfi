# ⚡ AgarFi - Quick Start Guide

## Installation (One Time)

```bash
cd C:\Users\perci\source\repos\ShitcoinApps\AGARw3\agarFi

# Install root dependencies
npm install

# Install server dependencies
cd packages\server
npm install
cd ..\..

# Install client dependencies
cd packages\client
npm install
cd ..\..
```

## Run the Demo

```bash
# From agarFi/ directory
npm run dev
```

This starts both server (port 3001) and client (port 3000).

## Open and Play

1. Open: http://localhost:3000
2. Enter your name
3. Click any game mode
4. Wait ~5 seconds (bots auto-fill)
5. Game starts!

## Controls

- **Mouse**: Move blob
- **SPACE**: Split
- **W**: Eject mass

## Demo Features

✅ Eat pellets to grow  
✅ Eat smaller players  
✅ Split to catch enemies  
✅ Eject mass to escape  
✅ Real-time leaderboard  
✅ Full stats at game end  
✅ Works with bots or multiplayer

## Troubleshooting

**Can't start?**
- Run commands one at a time
- Check all npm installs completed
- Verify .env file exists (copy from ENV_CONFIG.md if needed)

**Game won't start?**
- Check server is running (you'll see "🚀 AgarFi Server running")
- Open http://localhost:3001/api/health
- Try refreshing browser

**Ready to demo!** 🎮

