import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, SendOptions } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID, getAccount } from '@solana/spl-token';
import bs58 from 'bs58';

// Helper to wait for transaction confirmation using polling (no WebSocket)
async function confirmTransactionPolling(
  connection: Connection,
  signature: string,
  maxRetries: number = 30
): Promise<void> {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const status = await connection.getSignatureStatus(signature);
      
      if (status?.value?.confirmationStatus === 'confirmed' || 
          status?.value?.confirmationStatus === 'finalized') {
        console.log(`✅ Transaction confirmed: ${signature}`);
        return;
      }
      
      if (status?.value?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
      }
      
      // Wait 1 second before next check
      await new Promise(resolve => setTimeout(resolve, 1000));
      retries++;
    } catch (error) {
      console.error(`Polling attempt ${retries + 1}/${maxRetries} failed:`, error);
      retries++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error('Transaction confirmation timeout');
}

export class WalletManager {
  private connection: Connection;
  private platformWallet: Keypair;
  private usdcMint: PublicKey;
  private winnerRewardAmount: number;

  constructor(
    rpcUrl: string,
    privateKeyBase58: string,
    usdcMintAddress: string,
    winnerRewardUSDC: number
  ) {
    this.connection = new Connection(rpcUrl, 'confirmed');
    
    // Decode platform wallet private key
    try {
      const privateKeyBytes = bs58.decode(privateKeyBase58);
      this.platformWallet = Keypair.fromSecretKey(privateKeyBytes);
      console.log('✅ Platform wallet loaded:', this.platformWallet.publicKey.toString());
    } catch (error) {
      throw new Error('Invalid PLATFORM_WALLET_PRIVATE_KEY format. Must be base58 encoded.');
    }

    this.usdcMint = new PublicKey(usdcMintAddress);
    this.winnerRewardAmount = winnerRewardUSDC;
  }

  /**
   * Get platform wallet public address
   */
  getPlatformAddress(): string {
    return this.platformWallet.publicKey.toString();
  }

  /**
   * Get platform's USDC balance
   */
  async getUSDCBalance(): Promise<number> {
    try {
      const ata = await getAssociatedTokenAddress(
        this.usdcMint,
        this.platformWallet.publicKey
      );

      const account = await getAccount(this.connection, ata);
      const balance = Number(account.amount) / 1_000_000; // USDC has 6 decimals
      
      return balance;
    } catch (error) {
      console.error('Error fetching USDC balance:', error);
      return 0;
    }
  }

  /**
   * Check if platform has enough USDC for payouts
   */
  async hasSufficientFunds(): Promise<boolean> {
    const balance = await this.getUSDCBalance();
    return balance >= this.winnerRewardAmount;
  }

  /**
   * Check if wallet has USDC ATA
   */
  async hasUSDCAccount(walletAddress: string): Promise<boolean> {
    try {
      const wallet = new PublicKey(walletAddress);
      const ata = await getAssociatedTokenAddress(this.usdcMint, wallet);
      
      await getAccount(this.connection, ata);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create USDC Associated Token Account for wallet
   */
  async createUSDCAccount(walletAddress: string): Promise<string> {
    try {
      const wallet = new PublicKey(walletAddress);
      const ata = await getAssociatedTokenAddress(this.usdcMint, wallet);

      console.log(`Creating USDC ATA for ${walletAddress}...`);

      const transaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          this.platformWallet.publicKey, // payer
          ata, // ata
          wallet, // owner
          this.usdcMint // mint
        )
      );

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.platformWallet.publicKey;

      // Sign and send (no WebSocket subscription)
      transaction.sign(this.platformWallet);
      const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      console.log(`📤 ATA creation sent: ${signature}, waiting for confirmation...`);

      // Poll for confirmation
      await confirmTransactionPolling(this.connection, signature);

      console.log(`✅ USDC ATA created: ${signature}`);
      return signature;
    } catch (error: any) {
      console.error('Error creating USDC account:', error);
      throw new Error(`Failed to create USDC account: ${error.message}`);
    }
  }

  /**
   * Transfer USDC to winner (with memo for tracking)
   */
  async transferUSDC(recipientAddress: string, amount: number, gameId?: string, tier?: string): Promise<string> {
    try {
      const recipient = new PublicKey(recipientAddress);

      // Get ATAs
      const sourceATA = await getAssociatedTokenAddress(
        this.usdcMint,
        this.platformWallet.publicKey
      );

      const destinationATA = await getAssociatedTokenAddress(
        this.usdcMint,
        recipient
      );

      console.log(`Transferring ${amount} USDC to ${recipientAddress}...`);

      // Create transaction with memo for tracking
      const transaction = new Transaction();
      
      // Add memo if provided (for transaction tracking)
      if (gameId && tier) {
        const memoText = `AgarFi|${gameId}|${tier}`;
        transaction.add({
          keys: [],
          programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
          data: Buffer.from(memoText, 'utf-8')
        });
      }
      
      // Add transfer instruction
      transaction.add(
        createTransferInstruction(
          sourceATA, // source
          destinationATA, // destination
          this.platformWallet.publicKey, // owner
          amount * 1_000_000, // amount (convert to smallest unit - 6 decimals)
          [],
          TOKEN_PROGRAM_ID
        )
      );

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.platformWallet.publicKey;

      // Sign and send (no WebSocket subscription)
      transaction.sign(this.platformWallet);
      const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      console.log(`📤 Transfer sent: ${signature}, waiting for confirmation...`);

      // Poll for confirmation
      await confirmTransactionPolling(this.connection, signature);

      console.log(`✅ USDC transferred: ${signature}`);
      return signature;
    } catch (error: any) {
      console.error('Error transferring USDC:', error);
      throw new Error(`Failed to transfer USDC: ${error.message}`);
    }
  }

  /**
   * Get reward amount in USDC
   */
  getRewardAmount(): number {
    return this.winnerRewardAmount;
  }

  /**
   * Get connection (for advanced usage)
   */
  getConnection(): Connection {
    return this.connection;
  }
}

