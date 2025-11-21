import { Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const PLATFORM_WALLET = new PublicKey('FcAENdG4t6muicnVTUrBkgvysGKqLY3rykCGMc1jzPoP');

export interface PaymentResult {
  success: boolean;
  signature?: string;
  error?: string;
}

/**
 * Send USDC entry fee to platform wallet
 * Matches Silk Road implementation exactly
 */
export async function payEntryFee(
  publicKey: PublicKey,
  signTransaction: (transaction: Transaction) => Promise<Transaction>,
  amount: number,
  rpcUrl: string
): Promise<PaymentResult> {
  try {
    console.log('💳 Processing payment...');
    console.log(`   Amount: $${amount} USDC`);
    console.log(`   Wallet: ${publicKey.toBase58().slice(0, 8)}...`);
    console.log(`   RPC: ${rpcUrl.slice(0, 50)}...`);
    
    const connection = new Connection(rpcUrl, 'confirmed');
    
    console.log('🔨 Constructing USDC transfer transaction...');
    
    // Get associated token accounts
    const fromTokenAccount = await getAssociatedTokenAddress(
      USDC_MINT,
      publicKey
    );
    
    const toTokenAccount = await getAssociatedTokenAddress(
      USDC_MINT,
      PLATFORM_WALLET
    );
    
    console.log(`📥 From: ${fromTokenAccount.toBase58()}`);
    console.log(`📤 To: ${toTokenAccount.toBase58()}`);
    
    // Convert USDC amount to smallest unit (6 decimals)
    const usdcAmount = Math.floor(amount * 1_000_000);
    
    // Create transfer instruction
    const transferInstruction = createTransferInstruction(
      fromTokenAccount,
      toTokenAccount,
      publicKey,
      usdcAmount,
      [],
      TOKEN_PROGRAM_ID
    );
    
    // Create transaction
    const transaction = new Transaction().add(transferInstruction);
    transaction.feePayer = publicKey;
    
    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight; // Important for mobile
    
    console.log('✅ Transaction constructed');
    
    // ====================================
    // Sign & Broadcast
    // ====================================
    console.log('✍️  Signing transaction with wallet...');
    
    const signed = await signTransaction(transaction);
    
    console.log('📡 Broadcasting transaction...');
    const signature = await connection.sendRawTransaction(signed.serialize());
    
    console.log(`✅ Transaction sent! Signature: ${signature}`);
    
    console.log(`✅ Transaction sent! Signature: ${signature}`);
    
    // Wait for confirmation using polling (avoid WebSocket issues)
    console.log('⏳ Waiting for confirmation...');
    
    let confirmed = false;
    const maxAttempts = 30; // 30 seconds
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await connection.getSignatureStatus(signature);
        
        if (status?.value?.confirmationStatus === 'confirmed' || 
            status?.value?.confirmationStatus === 'finalized') {
          confirmed = true;
          console.log(`✅ Transaction confirmed! (${status.value.confirmationStatus})`);
          break;
        }
        
        if (status?.value?.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
        }
        
        // Wait 1 second before next poll
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.warn(`Attempt ${i + 1}/${maxAttempts} - checking status...`);
      }
    }
    
    if (!confirmed) {
      console.warn('⚠️ Could not confirm transaction in time, proceeding anyway...');
    }
    
    return {
      success: true,
      signature
    };
  } catch (error: any) {
    console.error('❌ Payment failed:', error);
    
    // User-friendly error messages
    let userMessage = error.message || 'Payment failed';
    
    if (error.message?.includes('User rejected')) {
      userMessage = 'Payment cancelled by user';
    } else if (error.message?.includes('Insufficient funds')) {
      userMessage = 'Insufficient SOL for transaction fee';
    } else if (error.message?.includes('Blockhash not found')) {
      userMessage = 'Network congestion. Please try again.';
    }
    
    return {
      success: false,
      error: userMessage
    };
  }
}

/**
 * Check if user has enough USDC balance
 */
export async function checkUSDCBalance(
  walletAddress: string,
  requiredAmount: number,
  rpcUrl: string
): Promise<{ hasEnough: boolean; balance: number }> {
  try {
    console.log(`💰 Fetching USDC balance...`);
    console.log(`   RPC: ${rpcUrl.slice(0, 50)}...`);
    console.log(`   Wallet: ${walletAddress.slice(0, 8)}...`);
    
    // No WebSocket subscriptions (HTTP only)
    const connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      disableRetryOnRateLimit: false,
    });
    const publicKey = new PublicKey(walletAddress);
    
    const tokenAccount = await getAssociatedTokenAddress(
      USDC_MINT,
      publicKey
    );
    
    console.log(`   Token Account: ${tokenAccount.toBase58().slice(0, 8)}...`);
    
    const tokenBalance = await connection.getTokenAccountBalance(tokenAccount);
    
    // Use uiAmount (number) instead of uiAmountString
    const balance = tokenBalance.value.uiAmount || 0;
    
    console.log(`✅ USDC Balance: $${balance.toFixed(2)}`);
    console.log(`   Raw: ${tokenBalance.value.amount} (${tokenBalance.value.decimals} decimals)`);
    
    return {
      hasEnough: balance >= requiredAmount,
      balance
    };
  } catch (error: any) {
    // Check if error is "account not found" (no USDC account = 0 balance)
    if (error.message?.includes('could not find account')) {
      console.log('ℹ️ No USDC token account found - balance is $0.00');
      return {
        hasEnough: false,
        balance: 0
      };
    }
    
    // Log error for debugging in production
    console.error('❌ Failed to fetch USDC balance:', error.message || error);
    console.error('   RPC URL:', rpcUrl);
    console.error('   Wallet:', walletAddress);
    
    // Return 0 balance on other errors
    return {
      hasEnough: false,
      balance: 0
    };
  }
}

