'use client';

import { motion } from 'framer-motion';
import { 
  Gamepad2, 
  Coins, 
  Shield, 
  Zap, 
  Users, 
  TrendingUp,
  Wallet,
  Lock,
  Trophy,
  Target,
  Sparkles,
  Rocket,
  Github
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
    }> = [];

    const colors = ['#39FF14', '#00F0FF', '#BC13FE', '#FF10F0'];

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        // Draw connections
        particles.slice(i + 1).forEach((p2) => {
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = (150 - dist) / 150 * 0.3;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        });
      });

      requestAnimationFrame(animate);
    }

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <main className="relative min-h-screen">
      <canvas ref={canvasRef} id="particles" className="fixed inset-0 z-0" />
      
      {/* Background blobs */}
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      {/* Navigation */}
      <nav className="relative z-10 flex justify-between items-center p-6 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-2xl font-bold gradient-text"
        >
          AgarFi
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex gap-6"
        >
          <a href="#about" className="hover:text-neon-green transition-colors">About</a>
          <a href="#tokenomics" className="hover:text-neon-blue transition-colors">Tokenomics</a>
          <a href="#roadmap" className="hover:text-neon-purple transition-colors">Roadmap</a>
        </motion.div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 min-h-screen flex items-center justify-center px-6">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-7xl md:text-9xl font-black mb-6 gradient-text text-glow-strong">
              AgarFi
            </h1>
            <p className="text-2xl md:text-4xl mb-4 text-neon-green text-glow">
              The First Truly Skill-Based GameFi
            </p>
            <p className="text-lg md:text-xl mb-12 text-gray-300 max-w-3xl mx-auto">
              Play, compete, and earn real USDC in the world's first skill-based blockchain game.
              No luck. No house edge. Pure skill. Pure profit.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="flex flex-col sm:flex-row gap-4 justify-center mb-12"
          >
            <a 
              href="https://x.com/osknyo_dev" 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-8 py-4 bg-neon-green text-black font-bold text-lg rounded-lg hover:box-glow hover:scale-105 transition-all text-center"
            >
              Join Waitlist
            </a>
            <button className="px-8 py-4 border-2 border-neon-blue text-neon-blue font-bold text-lg rounded-lg hover:bg-neon-blue hover:text-black transition-all">
              Read Whitepaper
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="flex flex-col sm:flex-row gap-8 justify-center items-center"
          >
            <div className="flex items-center gap-3">
              <Coins className="w-8 h-8 text-neon-green" />
              <div className="text-left">
                <p className="text-sm text-gray-400">Token Ticker</p>
                <p className="text-xl font-bold text-neon-green">TBA</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Wallet className="w-8 h-8 text-neon-blue" />
              <div className="text-left">
                <p className="text-sm text-gray-400">Contract Address</p>
                <p className="text-xl font-bold text-neon-blue">Coming Soon</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* What is AgarFi */}
      <section id="about" className="relative z-10 py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-6xl font-bold text-center mb-16 gradient-text"
          >
            What is AgarFi?
          </motion.h2>

          <div className="grid md:grid-cols-2 gap-12 mb-20">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-cyber-dark/50 backdrop-blur-lg border border-neon-green/30 rounded-2xl p-8"
            >
              <Gamepad2 className="w-12 h-12 text-neon-green mb-4" />
              <h3 className="text-2xl font-bold mb-4 text-neon-green">Classic Gameplay</h3>
              <p className="text-gray-300 leading-relaxed">
                Remember Agar.io? The addictive multiplayer game where you eat pellets, grow bigger,
                and consume other players? AgarFi brings back that rush, but with a revolutionary twist:
                your skills now earn you real money.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-cyber-dark/50 backdrop-blur-lg border border-neon-blue/30 rounded-2xl p-8"
            >
              <Coins className="w-12 h-12 text-neon-blue mb-4" />
              <h3 className="text-2xl font-bold mb-4 text-neon-blue">Real Stakes</h3>
              <p className="text-gray-300 leading-relaxed">
                Enter games with USDC buy-ins (.01, .1, or .5). The winner takes 80% of the pot.
                No random loot boxes. No pay-to-win. Just pure skill-based competition with transparent,
                blockchain-verified payouts.
              </p>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center max-w-4xl mx-auto"
          >
            <p className="text-xl text-gray-300 leading-relaxed mb-6">
              AgarFi isn't gambling. It's competitive gaming with real rewards. Every match is decided by
              strategy, reflexes, and split-second decisions. The best players rise to the top and earn
              real money while doing it.
            </p>
            <p className="text-2xl font-bold gradient-text">
              Finally, a skill-based game to earn money on Web3. 🚀
            </p>
          </motion.div>
        </div>
      </section>

      {/* Key Features */}
      <section className="relative z-10 py-32 px-6 bg-cyber-dark/30">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-6xl font-bold text-center mb-16 gradient-text"
          >
            Why AgarFi is Bullish
          </motion.h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Shield,
                color: 'neon-green',
                title: 'Anti-Bot Security',
                description: 'x403 wallet authentication ensures every player is human. No bots, no cheating, just fair competition.'
              },
              {
                icon: Zap,
                color: 'neon-blue',
                title: '60Hz Gameplay',
                description: 'Silky-smooth 60fps performance with server-authoritative physics. Feel every move with zero lag.'
              },
              {
                icon: Users,
                color: 'neon-purple',
                title: 'Unlimited Scale',
                description: 'Dynamic lobbies automatically scale to support 100+ concurrent players. The more who play, the bigger the pots.'
              },
              {
                icon: Lock,
                color: 'neon-pink',
                title: 'Transparent Pots',
                description: 'Server-managed prize pools with public blockchain verification. Every transaction is auditable and trustless.'
              },
              {
                icon: TrendingUp,
                color: 'neon-green',
                title: 'Token Flywheel',
                description: '5% of every pot automatically buys and stakes AGAR tokens, creating continuous deflationary pressure.'
              },
              {
                icon: Trophy,
                color: 'neon-blue',
                title: 'Instant Payouts',
                description: 'Winners receive 80% of the pot directly to their wallet. No waiting, no fees, no friction.'
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`bg-cyber-dark/50 backdrop-blur-lg border border-${feature.color}/30 rounded-2xl p-8 hover:box-glow hover:scale-105 transition-all`}
              >
                <feature.icon className={`w-12 h-12 text-${feature.color} mb-4`} />
                <h3 className={`text-xl font-bold mb-3 text-${feature.color}`}>{feature.title}</h3>
                <p className="text-gray-300">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Tokenomics */}
      <section id="tokenomics" className="relative z-10 py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-6xl font-bold text-center mb-16 gradient-text"
          >
            Tokenomics
          </motion.h2>

          <div className="grid md:grid-cols-2 gap-12 mb-16">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-gradient-to-br from-neon-green/10 to-cyber-dark border border-neon-green/50 rounded-2xl p-8"
            >
              <h3 className="text-3xl font-bold mb-6 text-neon-green">Prize Pool Split</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg">Winner(s)</span>
                  <span className="text-2xl font-bold text-neon-green">80%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-lg">Developer Fees</span>
                  <span className="text-2xl font-bold text-neon-blue">15%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-lg">AGAR Buyback + Stake</span>
                  <span className="text-2xl font-bold text-neon-purple">5%</span>
                </div>
              </div>
              <p className="mt-6 text-gray-300 text-sm">
                Every game drives token demand through automatic buybacks, creating a bullish flywheel
                that benefits all token holders.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-gradient-to-br from-neon-blue/10 to-cyber-dark border border-neon-blue/50 rounded-2xl p-8"
            >
              <h3 className="text-3xl font-bold mb-6 text-neon-blue">AGAR Token Utility</h3>
              <div className="space-y-4">
                {[
                  { icon: Sparkles, text: 'Exclusive cosmetic skins' },
                  { icon: Target, text: 'Priority queue access' },
                  { icon: TrendingUp, text: 'Staking rewards (30-day lock)' },
                  { icon: Rocket, text: 'Governance rights (future)' }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <item.icon className="w-6 h-6 text-neon-blue" />
                    <span className="text-lg">{item.text}</span>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-gray-300 text-sm">
                Stake AGAR for 30 days to unlock premium perks and demonstrate commitment to the ecosystem.
              </p>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-cyber-dark/50 backdrop-blur-lg border border-neon-purple/50 rounded-2xl p-8 text-center"
          >
            <h3 className="text-2xl font-bold mb-4 text-neon-purple">The Bullish Flywheel</h3>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              More players → Bigger pots → More AGAR buybacks → Higher token value → 
              More player incentive → Even bigger pots 🔄
            </p>
          </motion.div>
        </div>
      </section>

      {/* x402 & x403 Technologies */}
      <section className="relative z-10 py-32 px-6 bg-gradient-to-b from-cyber-darker to-cyber-dark">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-6xl font-bold text-center mb-6 gradient-text"
          >
            Powered by Cutting-Edge Web3 Protocols
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-xl text-center text-gray-300 mb-16 max-w-3xl mx-auto"
          >
            AgarFi leverages the hottest trending Web3 technologies: x403 for bulletproof anti-bot security 
            and x402-inspired UX for viral payment experiences.
          </motion.p>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-cyber-dark/50 backdrop-blur-lg border-2 border-neon-green/50 rounded-2xl p-8 hover:box-glow transition-all"
            >
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-12 h-12 text-neon-green" />
                <h3 className="text-3xl font-bold text-neon-green">x403 Protocol</h3>
              </div>
              <p className="text-sm text-neon-green/70 mb-4 font-semibold">🔥 TRENDING IN WEB3 2025</p>
              <p className="text-gray-300 mb-4 leading-relaxed">
                Next-generation wallet signature authentication that's replacing CAPTCHAs across major 
                DeFi and GameFi platforms. 90% less friction, 99%+ bot prevention.
              </p>
              <div className="bg-neon-green/10 border border-neon-green/30 rounded-lg p-4 mb-4">
                <p className="text-sm font-bold text-neon-green mb-2">How AgarFi Uses x403:</p>
                <p className="text-sm text-gray-300">
                  Every time you join a lobby, your wallet signs a unique challenge. No bots can automate this. 
                  We enforce one game per wallet and cache sessions for 35 minutes to reduce friction. 
                  Your wallet IS your account—no passwords, no registration forms.
                </p>
              </div>
              <ul className="space-y-3">
                {[
                  'No annoying CAPTCHA puzzles',
                  'Cryptographically secure signatures',
                  'One-click wallet authentication',
                  'Perfect mobile UX',
                  'Industry standard for Web3 gaming'
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-gray-300">
                    <Zap className="w-4 h-4 text-neon-green" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-cyber-dark/50 backdrop-blur-lg border-2 border-neon-blue/50 rounded-2xl p-8 hover:box-glow transition-all"
            >
              <div className="flex items-center gap-3 mb-4">
                <Rocket className="w-12 h-12 text-neon-blue" />
                <h3 className="text-3xl font-bold text-neon-blue">x402 UX</h3>
              </div>
              <p className="text-sm text-neon-blue/70 mb-4 font-semibold">🚀 VIRAL MARKETING PROTOCOL</p>
              <p className="text-gray-300 mb-4 leading-relaxed">
                Marketing-first payment experience that turns every transaction into a growth moment. 
                Top GameFi projects are adopting x402 principles for 3x conversion rates.
              </p>
              <div className="bg-neon-blue/10 border border-neon-blue/30 rounded-lg p-4 mb-4">
                <p className="text-sm font-bold text-neon-blue mb-2">How AgarFi Uses x402:</p>
                <p className="text-sm text-gray-300">
                  When you send USDC to join a game, our prompts say "Join 1,247 players who've won today! 💰" 
                  instead of boring transaction messages. When you win, we show "Share your $10 victory on X!" 
                  Every payment becomes a viral moment with social proof and FOMO.
                </p>
              </div>
              <ul className="space-y-3">
                {[
                  'Branded payment prompts with FOMO',
                  'Social proof during transactions',
                  'Built-in viral sharing mechanics',
                  'Community milestone celebrations',
                  'A/B tested conversion optimization'
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-gray-300">
                    <Sparkles className="w-4 h-4 text-neon-blue" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-gradient-to-r from-neon-green/10 via-neon-blue/10 to-neon-purple/10 border border-neon-purple/50 rounded-2xl p-8 text-center"
          >
            <h3 className="text-2xl font-bold mb-4 gradient-text">The Winning Combination</h3>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              x403 ensures only <span className="text-neon-green font-bold">real humans</span> play. 
              x402 makes those humans <span className="text-neon-blue font-bold">want to share</span>. 
              Together they create a <span className="text-neon-purple font-bold">viral, bot-free ecosystem</span>. 
              AgarFi is the first GameFi project to combine both at scale.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Technology Stack */}
      <section className="relative z-10 py-32 px-6 bg-cyber-dark/30">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-6xl font-bold text-center mb-16 gradient-text"
          >
            Built for Scale
          </motion.h2>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                category: 'Frontend',
                tech: ['Next.js App Router', 'Raw Canvas (60fps)', 'Solana Wallet Adapter', 'Real-time Socket.io']
              },
              {
                category: 'Backend',
                tech: ['Next.js API Routes', 'Socket.io (60Hz tick)', 'Neon Postgres', 'Drizzle ORM']
              },
              {
                category: 'Web3 Protocols',
                tech: ['x403 Authentication', 'x402 Payment UX', 'Solana Web3.js', 'Raydium SDK']
              },
              {
                category: 'Infrastructure',
                tech: ['Vercel (Frontend)', 'Render (Socket.io)', 'Hardware Wallet Security', 'Cloudflare Protection']
              }
            ].map((stack, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-cyber-dark/50 backdrop-blur-lg border border-neon-green/30 rounded-2xl p-8"
              >
                <h3 className="text-2xl font-bold mb-4 text-neon-green">{stack.category}</h3>
                <ul className="space-y-2">
                  {stack.tech.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-300">
                      <div className="w-2 h-2 bg-neon-green rounded-full" />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="relative z-10 py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-6xl font-bold text-center mb-16 gradient-text"
          >
            Roadmap
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-gradient-to-r from-neon-green/20 via-neon-blue/20 to-neon-purple/20 border-2 border-neon-green/50 rounded-2xl p-8 mb-12 text-center"
          >
            <h3 className="text-4xl font-bold mb-4 gradient-text">⚡ Lightning Fast Development</h3>
            <p className="text-2xl text-neon-green font-bold mb-2">Complete Platform in Just 1 Week</p>
            <p className="text-lg text-gray-300 max-w-3xl mx-auto">
              Leveraging cutting-edge protocols (x403, x402) and modern tooling, AgarFi goes from concept 
              to production-ready in 7 days. This is the speed of Web3 innovation.
            </p>
          </motion.div>

          <div className="space-y-8">
            {[
              {
                phase: 'Days 1-2',
                title: 'Core Game System',
                duration: '48 Hours',
                status: 'In Progress',
                color: 'neon-green',
                items: [
                  '60fps Canvas rendering with vanilla JS physics',
                  'Socket.io real-time multiplayer (60Hz server tick)',
                  'Blob mechanics: eat, split, merge, eject pellets',
                  'Three game modes (.01, .1, .5 USDC buy-ins)',
                  'Dynamic lobby system with auto-scaling',
                  'Mobile-optimized touch controls and responsive UI'
                ]
              },
              {
                phase: 'Days 3-4',
                title: 'x403 Authentication & Anti-Bot',
                duration: '48 Hours',
                status: 'Scheduled',
                color: 'neon-blue',
                items: [
                  '🔥 x403 protocol integration (trending Web3 auth)',
                  'Wallet signature verification flow',
                  'User profiles with stats tracking',
                  'Real-time leaderboards (top players)',
                  'One game per wallet enforcement',
                  '35-minute session caching',
                  'Anti-farming pattern detection'
                ]
              },
              {
                phase: 'Days 5-6',
                title: 'Payments & Token Economy',
                duration: '48 Hours',
                status: 'Scheduled',
                color: 'neon-purple',
                items: [
                  'Solana USDC payment integration (SPL tokens)',
                  '🚀 x402-inspired payment UX (viral prompts)',
                  'Server-managed prize pools with instant payouts',
                  'Automatic AGAR buyback mechanism (Raydium SDK)',
                  '30-day staking smart contract (Anchor)',
                  'Public transaction dashboards',
                  'Real-time pot tracking and transparency'
                ]
              },
              {
                phase: 'Day 7',
                title: 'Testing, Polish & Launch',
                duration: '24 Hours',
                status: 'Scheduled',
                color: 'neon-pink',
                items: [
                  'End-to-end testing with real mainnet USDC/AGAR',
                  'Security audits and penetration testing',
                  'Performance optimization (60fps guarantee)',
                  'Mobile device testing (iOS/Android browsers)',
                  'Marketing materials and social media setup',
                  'Production deployment (Vercel + Render)',
                  '🎉 PUBLIC BETA LAUNCH'
                ]
              }
            ].map((phase, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`bg-cyber-dark/50 backdrop-blur-lg border border-${phase.color}/50 rounded-2xl p-8`}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
                  <div>
                    <h3 className={`text-3xl font-bold text-${phase.color} mb-2`}>{phase.phase}</h3>
                    <p className="text-xl text-gray-300">{phase.title}</p>
                  </div>
                  <div className="mt-4 md:mt-0 text-right">
                    <p className="text-sm text-gray-400">{phase.duration}</p>
                    <p className={`text-lg font-bold text-${phase.color}`}>{phase.status}</p>
                  </div>
                </div>
                <ul className="space-y-3">
                  {phase.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-gray-300">
                      <div className={`w-2 h-2 bg-${phase.color} rounded-full mt-2`} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-32 px-6 bg-gradient-to-b from-cyber-darker to-cyber-dark">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-5xl md:text-6xl font-bold mb-6 gradient-text text-glow">
              Ready to Play for Real?
            </h2>
            <p className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto">
              Join the waitlist to get early access when we launch. The first skill-based GameFi
              platform on Solana is coming soon.
            </p>
            <a 
              href="https://x.com/osknyo_dev" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-block px-12 py-5 bg-neon-green text-black font-bold text-xl rounded-lg hover:box-glow-strong hover:scale-110 transition-all mb-12"
            >
              Join Waitlist
            </a>
            <div className="flex justify-center gap-8 mt-12">
              <a 
                href="https://x.com/osknyo_dev" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-neon-green hover:text-neon-blue transition-colors"
                aria-label="Follow on X"
              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a 
                href="https://github.com/Tanner253" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-neon-green hover:text-neon-blue transition-colors"
                aria-label="View on GitHub"
              >
                <Github className="w-8 h-8" />
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 px-6 border-t border-neon-green/20">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-2xl font-bold gradient-text mb-4 md:mb-0">
              AgarFi
            </div>
            <div className="text-gray-400 text-sm text-center md:text-right">
              <p className="mb-2">Built on Solana. Powered by skill.</p>
              <p>&copy; 2025 AgarFi. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

