# 🎮 AgarFi

<div align="center">

![Solana](https://img.shields.io/badge/Solana-14F195?style=for-the-badge&logo=solana&logoColor=black)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white)

**Skill-Based GameFi on Solana**

[🎯 Live Demo](https://agarfi.vercel.app) • [📖 Whitepaper](https://agarfi.vercel.app) • [🐦 Twitter](https://x.com/osknyo_dev)

</div>

---

## 📋 Table of Contents

- [About](#about)
- [How It Works](#how-it-works)
- [Game Mechanics](#game-mechanics)
- [x403 Authentication](#x403-authentication)
- [x402 Payments](#x402-payments)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Roadmap](#roadmap)
- [License](#license)

---

## 🎯 About

AgarFi is a competitive multiplayer game where players wager USDC and compete in skill-based matches. Winners receive 80% of the pot. Built on Solana blockchain with deterministic gameplay mechanics—no random elements, pure skill.

### Key Features

- 🎮 **Skill-Based Gameplay**: Winner determined by survival time and mass accumulated
- 💰 **Winner-Takes-All**: 80% to winner, 15% platform fees, 5% token buyback
- 🔐 **x403 Authentication**: Cryptographic wallet signatures for identity
- 💳 **x402 Payments**: HTTP-based crypto payments without accounts
- ⚡ **60Hz Server Tick**: Server-authoritative physics at 60 updates/second
- 🌐 **Solana Blockchain**: All transactions recorded on-chain

---

## 🎲 How It Works

### Game Flow

```
1. Connect Wallet (x403 signature authentication)
   ↓
2. Select Game Mode ($5, $25, $50, or $100 USDC)
   ↓
3. Join Lobby (minimum 10 players, maximum 25)
   ↓
4. Pay Entry Fee (x402 HTTP payment protocol)
   ↓
5. Game Starts (30 minute maximum duration)
   ↓
6. Compete (eat pellets, consume smaller players)
   ↓
7. Winner Determined (last alive OR highest mass)
   ↓
8. Payout (80% of pot sent to winner's wallet)
```

### Prize Distribution

**Example: 25-player game at $25 USDC each:**

| Recipient | Percentage | Amount (USDC) |
|-----------|------------|---------------|
| Winner | 80% | $500.00 |
| Platform Fees | 15% | $93.75 |
| AGAR Buyback | 5% | $31.25 |
| **Total Pot** | **100%** | **$625.00** |

### All Game Mode Projections

**Standard Modes (25 players max):**

| Buy-In | Total Pot | Winner Takes | Platform Fees | AGAR Buyback |
|--------|-----------|--------------|---------------|--------------|
| **$5** | $125 | $100.00 | $18.75 | $6.25 |
| **$25** | $625 | $500.00 | $93.75 | $31.25 |
| **$50** | $1,250 | $1,000.00 | $187.50 | $62.50 |
| **$100** | $2,500 | $2,000.00 | $375.00 | $125.00 |

**🐋 WHALE MODE (50 players max - Unlocked at $1M Market Cap):**

| Buy-In | Total Pot | Winner Takes | Platform Fees | AGAR Buyback |
|--------|-----------|--------------|---------------|--------------|
| **$500** | **$25,000** | **$20,000.00** | **$3,750.00** | **$1,250.00** |

> **Whale Mode** is a special high-stakes lobby that unlocks when AGAR token reaches $1M market cap. With up to 50 players competing for a potential **$25,000 prize pool**, this is the ultimate test of skill in Web3 gaming.

---

## 🎮 Game Mechanics

### What is Agar.io?

AgarFi is based on **[Agar.io](https://agar.io)**, a massively multiplayer online action game created by Matheus Valadares in 2015. The game became a viral sensation with millions of players controlling cells in a petri dish-like environment.

**Original Agar.io Resources:**
- 🎮 [Play Original](https://agar.io)
- 📖 [Agar.io Wiki](https://agario.fandom.com/wiki/Agar.io_Wiki)
- 📝 [Game Mechanics Guide](https://agario.fandom.com/wiki/Mechanics)

### Core Gameplay

Players control a circular cell (or "blob") that moves toward their cursor on a 2D map. The objective is simple: **eat and grow bigger**.

#### Movement Mechanics

- **Cursor Control**: Your blob follows your mouse/touch position
- **Speed**: Inversely proportional to mass: `speed = 2.2 × (32 / sqrt(mass))`
  - Small cells: Fast and agile
  - Large cells: Slow but powerful
- **Physics**: Smooth acceleration/deceleration based on mass

#### Growth Mechanics

- **Food Pellets**: Small colored dots scattered across map (+1 mass each)
- **Consuming Players**: Eat cells smaller than you (absorb their entire mass)
- **Size Requirement**: Must be at least 10% larger to consume another player
- **Mass Transfer**: 100% of consumed mass transfers to eater

#### Advanced Mechanics

**🔀 Splitting**
- Press `SPACE` to divide your cell into two equal parts
- Split cells shoot forward at high speed
- Used to catch faster opponents or escape danger
- Maximum 16 cells per player
- Cells automatically recombine after ~30 seconds

**💨 Ejecting Mass**
- Press `W` to shoot ~10 mass units forward
- Used to:
  - Feed teammates in team modes
  - Reduce mass to escape predators
  - Feed viruses to split enemies
- Ejected mass becomes food pellets

**🦠 Viruses (Not in AgarFi MVP)**
- Green spiky circles on map
- Players larger than 140 mass split when hitting virus
- Can be "fed" with ejected mass to shoot them at enemies

### AgarFi Modifications

AgarFi implements core Agar.io mechanics with these changes:

| Feature | Original Agar.io | AgarFi |
|---------|------------------|--------|
| Game Mode | Free-for-all, endless | Timed matches (30 min max) |
| Objective | Reach top of leaderboard | Last alive OR highest mass wins |
| Entry | Free to play | USDC buy-in ($5/$25/$50/$100) |
| Players | 100+ per server | 10-25 per match |
| Rewards | Leaderboard fame | 80% of USDC pot |
| Map Size | Varies by player count | Fixed 5000×5000 units |
| Viruses | Yes | No (Phase 1) |

### Win Conditions

1. **Elimination Victory**: Last player alive wins immediately
2. **Time Victory**: After 30 minutes, highest mass wins

### Tie-Breaker Rules

If multiple players survive with equal mass at 30 minutes:

1. **Primary**: Longest survival time (earliest spawn wins)
2. **Secondary**: Most total mass consumed (pellets + players)
3. **Final**: Pot split equally among tied players

### Deterministic Physics

AgarFi uses deterministic, server-authoritative physics:

- **Server Tick Rate**: 60Hz (updates every 16.67ms)
- **Client Prediction**: Smooths movement on client-side
- **Collision Detection**: Spatial hashing for O(n) complexity
- **Mass Formula**: `velocity = 2.2 × (32 / sqrt(mass))`
- **Merge Timer**: 30 seconds after split
- **No RNG**: All outcomes deterministic based on player inputs

**Technical Implementation:**
```typescript
// Mass-based speed calculation
function calculateSpeed(mass: number): number {
  return 2.2 * (32 / Math.sqrt(mass));
}

// Collision detection (can eat if 10% larger)
function canEat(predator: Cell, prey: Cell): boolean {
  return predator.mass > prey.mass * 1.1;
}

// Mass transfer on consumption
function consumeCell(predator: Cell, prey: Cell): void {
  predator.mass += prey.mass;
  prey.destroyed = true;
}
```

---

## 🔐 x403 Authentication

**Protocol**: Cryptographic wallet signature verification for Web3 authentication

> **Note**: x403 is a wallet-based authentication pattern being developed for Web3 applications. AgarFi implements the core signature verification approach.

### What is x403?

x403 is an authentication protocol that uses ECDSA (Elliptic Curve Digital Signature Algorithm) signatures to verify wallet ownership without requiring passwords, usernames, or personal information. The wallet's cryptographic signature serves as proof of identity.

### How x403 Works

```
┌─────────┐                           ┌─────────┐
│ Client  │                           │ Server  │
└────┬────┘                           └────┬────┘
     │                                     │
     │  1. Request Authentication          │
     ├────────────────────────────────────►│
     │                                     │
     │  2. Challenge Message               │
     │     "Sign this to authenticate:     │
     │      nonce_abc123xyz"               │
     │◄────────────────────────────────────┤
     │                                     │
     │  3. Sign with Private Key           │
     │     (ECDSA secp256k1)               │
     │                                     │
     │  4. Send Signature                  │
     │     signature: "0x4f3a2..."         │
     ├────────────────────────────────────►│
     │                                     │
     │                            5. Verify Signature
     │                               recovered_address
     │                               === claimed_address?
     │                                     │
     │  6. JWT Token (35 min)              │
     │     Bearer eyJhbGc...               │
     │◄────────────────────────────────────┤
     │                                     │
```

**Steps:**

1. **Challenge Generation**: Server creates unique message with nonce
2. **Client Signing**: User signs message with private key (only they possess)
3. **Signature Verification**: Server recovers address from signature
4. **Session Token**: Server issues JWT with 35-minute expiration
5. **Authorization**: Token included in subsequent API requests

### Implementation in AgarFi

```typescript
// 1. Server generates challenge
import { randomBytes } from 'crypto';

function generateChallenge(walletAddress: string): string {
  const nonce = randomBytes(16).toString('hex');
  return `Sign this message to authenticate with AgarFi:\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
}

// 2. Client signs challenge (using Phantom wallet)
async function signAuthChallenge(wallet: PhantomWallet, message: string) {
  const encodedMessage = new TextEncoder().encode(message);
  const signature = await wallet.signMessage(encodedMessage, 'utf8');
  return {
    signature: Buffer.from(signature.signature).toString('hex'),
    publicKey: wallet.publicKey.toString()
  };
}

// 3. Server verifies signature
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

function verifySignature(
  message: string,
  signature: string,
  publicKey: string
): boolean {
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = Buffer.from(signature, 'hex');
  const publicKeyBytes = new PublicKey(publicKey).toBytes();
  
  return nacl.sign.detached.verify(
    messageBytes,
    signatureBytes,
    publicKeyBytes
  );
}

// 4. Server issues session token
import jwt from 'jsonwebtoken';

function createSession(walletAddress: string): string {
  return jwt.sign(
    { 
      wallet: walletAddress,
      type: 'player' 
    },
    process.env.JWT_SECRET!,
    { expiresIn: '35m' }
  );
}
```

### AgarFi x403 Implementation

**🎯 Use Cases:**

1. **Initial Wallet Connection**
   - User clicks "Connect Wallet"
   - Phantom wallet prompts for signature
   - Server verifies and creates session
   - User redirected to lobby selection

2. **Lobby Join Authorization**
   - JWT token validated on every lobby join request
   - Token includes wallet address as identity
   - Server checks: one active game per wallet
   - Expired tokens require re-authentication

3. **In-Game Identity**
   - Player's wallet address = player ID
   - Game state tracked by wallet address
   - Leaderboard displays truncated wallet (e.g., "AbCd...XyZ2")
   - Winner payouts sent to authenticated wallet

4. **Session Management**
   - 35-minute TTL balances security vs. UX
   - Redis cache stores active sessions
   - Sessions cleared on game completion
   - Auto-refresh on activity

**🛡️ Anti-Bot Protection:**

- **Signature Requirement**: Bots can't generate valid ECDSA signatures without private key
- **Unique Challenges**: Each auth attempt uses fresh nonce (replay attack prevention)
- **Rate Limiting**: Max 5 auth attempts per IP per minute
- **Pattern Detection**: Monitor for rapid wallet creation/auth patterns
- **One Game Rule**: Wallet can only join one active lobby at a time

### Benefits of x403

✅ **No Passwords**: Wallet's private key is the credential  
✅ **No Registration**: First connection auto-creates user  
✅ **No Email**: Zero PII required  
✅ **No Database Leaks**: No passwords to compromise  
✅ **Wallet = Identity**: Address serves as unique identifier  
✅ **Bot-Resistant**: Requires actual wallet interaction  
✅ **Phishing-Resistant**: Users sign in their own wallet UI  
✅ **Cross-Platform**: Works on any device with wallet support

### Security Considerations

⚠️ **Challenge Expiration**: Challenges expire after 5 minutes  
⚠️ **Nonce Tracking**: Used nonces stored temporarily to prevent replay  
⚠️ **Signature Validation**: Always verify on server, never trust client  
⚠️ **Session Security**: JWTs stored in httpOnly cookies (not localStorage)  
⚠️ **Wallet Best Practices**: Users must secure their private keys

---

## 💳 x402 Payments

**Protocol**: HTTP 402 "Payment Required" standard for programmatic crypto payments

### What is x402?

x402 is an **open payment standard** that enables services to charge for API access over HTTP without accounts, sessions, or traditional payment processors. Built around the HTTP `402 Payment Required` status code (originally reserved in HTTP/1.1 spec but never implemented).

**📚 Official Documentation:**
- 📖 [x402 GitBook](https://x402.gitbook.io/x402) - Complete protocol specification
- 🚀 [Quickstart Guide](https://x402.gitbook.io/x402/getting-started/quickstart-for-sellers)
- 💻 [GitHub Repository](https://github.com/coinbase/x402) - Reference implementation
- 🛠️ [Vercel Template](https://vercel.com/templates/x402) - Starter template

### How x402 Works

Based on the [x402 open standard](https://x402.gitbook.io/x402):

```
1. Client → Server: GET /api/join-lobby
2. Server → Client: 402 Payment Required
   {
     "amount": "25",
     "currency": "USDC",
     "recipient": "7xKXtg...",
     "network": "solana"
   }
3. Client → Blockchain: Transfer USDC to recipient
4. Client → Server: POST /api/verify-payment
   {
     "txHash": "5Kqm7..."
   }
5. Server → Facilitator: POST /verify
6. Facilitator → Blockchain: Validate transaction
7. Facilitator → Server: /settle confirmation
8. Server → Client: 200 OK + Game Access
```

### Implementation Flow

```typescript
// Server returns 402 status
app.get('/api/join-lobby', (req, res) => {
  res.status(402).json({
    amount: '25',
    token: 'USDC',
    recipient: GAME_WALLET_ADDRESS,
    memo: generateGameId(),
  });
});

// Client constructs SPL token transfer
const transaction = new Transaction().add(
  Token.createTransferInstruction(
    TOKEN_PROGRAM_ID,
    userTokenAccount,
    serverTokenAccount,
    userWallet.publicKey,
    [],
    amount
  )
);

// Server verifies transaction on Solana
const tx = await connection.getTransaction(txHash);
if (tx.meta.postBalances[recipient] > tx.meta.preBalances[recipient]) {
  // Payment confirmed, admit to lobby
}
```

### AgarFi Usage

- **Lobby Entry**: Server returns 402 with USDC payment details
- **Payment Verification**: Server checks Solana blockchain for transaction
- **Instant Confirmation**: Sub-second finality on Solana
- **Payouts**: Server initiates SPL token transfer to winner
- **No Middleman**: Direct wallet-to-wallet transfers
- **No KYC**: Payment = blockchain transaction only

### Benefits

✅ No accounts  
✅ No sessions  
✅ No payment processor fees  
✅ No geographic restrictions  
✅ Instant settlement  
✅ Programmatic (perfect for AI agents)

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Rendering**: Raw Canvas API (60fps target)
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Real-time**: Socket.io Client

### Backend
- **API**: Next.js API Routes
- **Real-time**: Socket.io Server (60Hz tick)
- **Database**: Neon Postgres + Drizzle ORM
- **Caching**: Redis/KV Store

### Blockchain
- **Network**: Solana Mainnet
- **Token**: USDC (SPL Token)
- **Library**: @solana/web3.js
- **Wallet**: Solana Wallet Adapter
- **DEX**: Raydium SDK (token swaps)

### Protocols
- **Authentication**: x403 (wallet signatures)
- **Payments**: x402 (HTTP 402 standard)

### Infrastructure
- **Hosting**: Vercel (frontend/API)
- **WebSocket**: Render (Socket.io server)
- **CDN**: Cloudflare
- **Deployment**: Turborepo monorepo

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Canvas    │  │  Socket.io   │  │  Wallet Adapter  │  │
│  │  Rendering  │  │    Client    │  │    (Phantom)     │  │
│  └─────────────┘  └──────────────┘  └──────────────────┘  │
└────────────┬────────────────┬────────────────┬─────────────┘
             │                │                │
             │ HTTPS          │ WebSocket      │ x403/x402
             ▼                ▼                ▼
┌────────────────────────────────────────────────────────────┐
│                     NEXT.JS SERVER                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  API Routes │  │   Socket.io  │  │  Authentication  │ │
│  │  (x402)     │  │   Server     │  │     (x403)       │ │
│  └─────────────┘  └──────────────┘  └──────────────────┘ │
└─────────┬──────────────────┬──────────────────┬───────────┘
          │                  │                  │
          │ PostgreSQL       │ Game State       │ Solana RPC
          ▼                  ▼                  ▼
┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐
│  Neon Postgres  │  │   Redis/KV      │  │   Solana     │
│   (Drizzle)     │  │   (Sessions)    │  │  Blockchain  │
└─────────────────┘  └─────────────────┘  └──────────────┘
```

### Data Flow

1. **Authentication**: Client signs x403 challenge → Server verifies → JWT issued
2. **Lobby Join**: Client requests → Server returns 402 → Client pays USDC
3. **Game State**: Server ticks at 60Hz → Broadcasts to clients via WebSocket
4. **Collision Detection**: Server calculates physics → Updates game state
5. **Payouts**: Server constructs SPL transfer → Sends to winner wallet → Logs to DB

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm/yarn/pnpm
- Solana wallet (Phantom recommended)
- USDC on Solana network

### Development Setup

```bash
# Clone repository
git clone https://github.com/Tanner253/AGARw3.git
cd AGARw3/whitepaper

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm start
```

### Environment Variables

Create `.env.local` in the `whitepaper` directory:

```env
# Solana
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_PRIVATE_KEY=your_server_wallet_private_key

# Database
DATABASE_URL=postgresql://user:pass@host:5432/agarfi

# x402 Facilitator
X402_FACILITATOR_URL=https://facilitator.x402.org
X402_API_KEY=your_api_key

# x403
JWT_SECRET=your_jwt_secret

# Game Configuration
DEV_RAKE_WALLET=your_solana_address_for_fees
AGAR_TOKEN_ADDRESS=your_agar_token_mint_address
```

### Project Structure

```
AGARw3/
├── feature_spec.md           # Complete development specification
├── README.md                 # This file
└── whitepaper/              # Marketing site (deployed)
    ├── app/
    │   ├── page.tsx         # Main whitepaper page
    │   ├── layout.tsx       # Root layout
    │   └── globals.css      # Styles and animations
    ├── public/
    ├── package.json
    └── vercel.json          # Deployment config
```

---

## 🗓️ Roadmap

### ⚡ Week 1: Production Launch

- **Days 1-2**: Core game system (Canvas, Socket.io, physics)
- **Days 3-4**: x403 authentication integration
- **Days 5-6**: x402 payments & token economy
- **Day 7**: Testing, polish, deployment

### 📈 Post-Launch

- [ ] 🐋 **Whale Mode activation** at $1M market cap (50 players, $25K pots)
- [ ] Mobile app (iOS/Android)
- [ ] Additional game modes (Teams, Battle Royale)
- [ ] Tournament system with scheduled events
- [ ] Staking rewards for AGAR holders
- [ ] DAO governance
- [ ] Multi-chain expansion

---

## 📊 Current Status

| Feature | Status |
|---------|--------|
| Game Mechanics | ✅ **LIVE** |
| x403 Authentication | ✅ **LIVE** |
| x402 Payments | ✅ **LIVE** |
| Token Gating ($AgarFi) | ✅ **LIVE** |
| Mobile Support | ✅ **LIVE** |
| AGAR Buyback/Staking | 📋 Coming Soon |
| Whitepaper Site | ✅ Deployed |

**Platform Status:** 🚀 **PRODUCTION - LIVE WITH REAL MONEY**

### Recent Updates (Nov 22, 2025)

✅ **x403 Wallet Authentication** - Cryptographic signature-based auth  
✅ **x402 Payment Protocol** - Blockchain-verified USDC transactions  
✅ **Mobile Payments Fixed** - Works perfectly in Phantom mobile browser  
✅ **Anti-Bot Protection** - Multi-layer security (x403 + x402 + token gating)  
✅ **Treasury Protection** - Double refund bug eliminated  
✅ **Performance** - 3X faster loads, 60% smaller bundle  

---

## 🤝 Contributing

This project is currently in active development. Contributions welcome after initial launch.

---

## 📄 License

MIT License - See [LICENSE](whitepaper/LICENSE) file for details.

---

## 🔗 Links

- **Live Site**: [agarfi.vercel.app](https://agarfi.vercel.app)
- **Twitter**: [@osknyo_dev](https://x.com/osknyo_dev)
- **GitHub**: [Tanner253](https://github.com/Tanner253)

---

## 📧 Contact

For inquiries, reach out via [Twitter](https://x.com/osknyo_dev).

---

<div align="center">

**Built with 💚 on Solana**

![Solana](https://img.shields.io/badge/Built_on-Solana-14F195?style=flat-square&logo=solana&logoColor=black)
![x403](https://img.shields.io/badge/Auth-x403-00D9FF?style=flat-square)
![x402](https://img.shields.io/badge/Payments-x402-FF6B6B?style=flat-square)
![TypeScript](https://img.shields.io/badge/Code-TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)

</div>

