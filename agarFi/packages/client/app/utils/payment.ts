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
 * Confirm transaction using polling (no WebSocket)
 * Many RPC providers don't support WebSocket subscriptions
 */
async function confirmTransactionPolling(
  connection: Connection,
  signature: string,
  maxRetries: number = 60
): Promise<boolean> {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const status = await connection.getSignatureStatus(signature);
      
      if (status?.value?.confirmationStatus === 'confirmed' || 
          status?.value?.confirmationStatus === 'finalized') {
        return true;
      }
      
      if (status?.value?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
      }
      
      // Wait 1 second before next check
      await new Promise(resolve => setTimeout(resolve, 1000));
      retries++;
    } catch (error) {
      retries++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return false; // Timeout
}

/**
 * Send USDC entry fee to platform wallet
 */
export async function payEntryFee(
  wallet: any, // Solana wallet adapter (from useWallet hook)
  amount: number,
  rpcUrl: string
): Promise<PaymentResult> {
  try {
    // Check if wallet is connected and has required methods
    if (!wallet || !wallet.publicKey || !wallet.signTransaction) {
      return {
        success: false,
        error: 'Wallet not connected or missing required methods'
      };
    }
    
    // Use polling instead of WebSocket (many RPC providers don't support WS)
    const connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      disableRetryOnRateLimit: false,
      confirmTransactionInitialTimeout: 60000, // 60 second timeout
    });
    
    // Get token accounts
    const fromTokenAccount = await getAssociatedTokenAddress(
      USDC_MINT,
      wallet.publicKey
    );
    
    const toTokenAccount = await getAssociatedTokenAddress(
      USDC_MINT,
      PLATFORM_WALLET
    );
    
    // Create transaction
    const transaction = new Transaction();
    
    // Convert USDC amount to smallest unit (6 decimals)
    const usdcAmount = Math.floor(amount * 1_000_000);
    
    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        wallet.publicKey,
        usdcAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;
    
    // Sign and send transaction
    const signed = await wallet.signTransaction(transaction);
    
    const signature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    
    // Use polling-based confirmation (no WebSocket)
    const confirmResult = await confirmTransactionPolling(connection, signature, 60);
    
    if (!confirmResult) {
      // Return success with warning - user can verify manually
      return {
        success: true,
        signature,
        error: `Payment sent but confirmation timeout. Verify at: https://solscan.io/tx/${signature}`
      };
    }
    
    return {
      success: true,
      signature
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Payment failed'
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

