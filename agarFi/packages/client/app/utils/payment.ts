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
    // Check if wallet is connected
    if (!wallet || !wallet.publicKey) {
      console.error('❌ Wallet not connected');
      return {
        success: false,
        error: 'Wallet not connected'
      };
    }
    
    // Check if wallet is ready (not connecting)
    if (wallet.connecting) {
      console.error('❌ Wallet still connecting');
      return {
        success: false,
        error: 'Wallet is still connecting. Please wait and try again.'
      };
    }
    
    // Verify wallet has required methods
    if (!wallet.sendTransaction && !wallet.signTransaction) {
      console.error('❌ Wallet missing required methods');
      console.error('   Wallet object keys:', Object.keys(wallet).join(', '));
      return {
        success: false,
        error: 'Wallet does not support transactions. Please try reconnecting your wallet.'
      };
    }
    
    console.log('💳 Processing payment...');
    console.log(`   Amount: $${amount} USDC`);
    console.log(`   Wallet: ${wallet.publicKey.toBase58().slice(0, 8)}...`);
    console.log(`   Connected: ${wallet.connected}`);
    console.log(`   Connecting: ${wallet.connecting}`);
    console.log(`   RPC: ${rpcUrl.slice(0, 50)}...`);
    console.log('   Wallet capabilities:', {
      sendTransaction: !!wallet.sendTransaction,
      signAndSendTransaction: !!wallet.signAndSendTransaction,
      signTransaction: !!wallet.signTransaction,
      signAllTransactions: !!wallet.signAllTransactions,
      wallet: wallet.wallet?.adapter?.name || 'unknown'
    });
    
    // Use polling instead of WebSocket (many RPC providers don't support WS)
    const connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      disableRetryOnRateLimit: false,
      confirmTransactionInitialTimeout: 60000, // 60 second timeout
    });
    
    console.log('🔧 Building transaction...');
    
    // Get token accounts
    const fromTokenAccount = await getAssociatedTokenAddress(
      USDC_MINT,
      wallet.publicKey
    );
    
    const toTokenAccount = await getAssociatedTokenAddress(
      USDC_MINT,
      PLATFORM_WALLET
    );
    
    console.log(`   From: ${fromTokenAccount.toBase58().slice(0, 8)}...`);
    console.log(`   To: ${toTokenAccount.toBase58().slice(0, 8)}...`);
    
    // Convert USDC amount to smallest unit (6 decimals)
    const usdcAmount = Math.floor(amount * 1_000_000);
    console.log(`   Amount: ${usdcAmount} (${amount} USDC)`);
    
    // Get recent blockhash BEFORE building transaction
    // Use 'confirmed' instead of 'finalized' for fresher blockhash (better for mobile)
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    console.log(`   Blockhash: ${blockhash.slice(0, 8)}...`);
    console.log(`   Last valid block height: ${lastValidBlockHeight}`);
    
    // Create transaction
    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;
    
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
    
    console.log('✅ Transaction built successfully');
    
    // Validate transaction before sending
    if (!transaction.recentBlockhash) {
      console.error('❌ Transaction missing blockhash');
      return {
        success: false,
        error: 'Failed to build transaction: missing blockhash'
      };
    }
    
    if (!transaction.feePayer) {
      console.error('❌ Transaction missing fee payer');
      return {
        success: false,
        error: 'Failed to build transaction: missing fee payer'
      };
    }
    
    console.log('✅ Transaction validated, ready to sign');
    console.log(`   Instructions: ${transaction.instructions.length}`);
    console.log(`   Fee payer: ${transaction.feePayer.toBase58().slice(0, 8)}...`);
    console.log(`   Required signers: ${transaction.instructions.flatMap(i => i.keys.filter(k => k.isSigner).map(k => k.pubkey.toBase58().slice(0, 8))).join(', ')}`);
    
    let signature: string;
    
    // Try different signing methods based on wallet capabilities
    try {
      // Method 1: sendTransaction (standard wallet adapter - works on mobile and desktop)
      if (wallet.sendTransaction) {
        console.log('📱 Using sendTransaction (standard wallet adapter)');
        console.log('   Prompting wallet to sign and send...');
        
        // Important: On mobile, the wallet modal should pop up here
        // If it doesn't, the wallet adapter might not be properly connected
        
        signature = await wallet.sendTransaction(transaction, connection, {
          skipPreflight: false, // Run preflight to catch errors early
          maxRetries: 3,
          preflightCommitment: 'confirmed'
        });
        
        console.log(`✅ Wallet signed and broadcast transaction: ${signature}`);
      }
      // Method 2: signTransaction then manual send (fallback)
      else if (wallet.signTransaction) {
        console.log('🖥️  Using signTransaction (manual send)');
        
        const signed = await wallet.signTransaction(transaction);
        
        signature = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
          preflightCommitment: 'confirmed'
        });
        
        console.log(`✅ Transaction broadcast: ${signature}`);
      } 
      else {
        console.error('❌ Wallet missing required methods');
        console.error('   Available:', Object.keys(wallet).filter(k => typeof wallet[k] === 'function'));
        return {
          success: false,
          error: 'Wallet does not support transaction signing. Please try a different wallet.'
        };
      }
    } catch (signError: any) {
      console.error('❌ Signing/sending failed:', signError);
      console.error('   Error type:', signError.constructor.name);
      console.error('   Message:', signError.message);
      
      // Check for user rejection
      if (signError.message?.includes('User rejected') || signError.code === 4001) {
        throw new Error('Payment cancelled by user');
      }
      
      throw signError; // Re-throw to be caught by outer catch
    }
    
    console.log(`✅ Transaction sent! Signature: ${signature}`);
    
    // Use polling-based confirmation (no WebSocket)
    const confirmResult = await confirmTransactionPolling(connection, signature, 60);
    
    if (!confirmResult) {
      // Return success with warning - user can verify manually
      console.warn('⚠️ Confirmation timeout (payment likely succeeded)');
      return {
        success: true,
        signature,
        error: `Payment sent but confirmation timeout. Verify at: https://solscan.io/tx/${signature}`
      };
    }
    
    console.log('✅ Payment confirmed!');
    
    return {
      success: true,
      signature
    };
  } catch (error: any) {
    console.error('❌ Payment failed:', error);
    
    // Parse common error messages
    let userMessage = error.message || 'Payment failed';
    
    if (error.message?.includes('User rejected')) {
      userMessage = 'Payment cancelled by user';
    } else if (error.message?.includes('Insufficient funds')) {
      userMessage = 'Insufficient SOL for transaction fee';
    } else if (error.message?.includes('Missing signature')) {
      userMessage = 'Wallet signing error. Please try reconnecting your wallet.';
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

