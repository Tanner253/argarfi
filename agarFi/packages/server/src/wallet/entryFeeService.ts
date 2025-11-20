import { WalletManager } from './walletManager.js';
import mongoose from 'mongoose';

export interface EntryFeePayment {
  success: boolean;
  txSignature?: string;
  error?: string;
}

export interface RefundResult {
  success: boolean;
  txSignature?: string;
  error?: string;
}

/**
 * Entry Fee Service - Handles collecting entry fees and refunds
 */
export class EntryFeeService {
  private walletManager: WalletManager;

  constructor(walletManager: WalletManager) {
    this.walletManager = walletManager;
  }

  /**
   * Collect entry fee from player
   * Player must send USDC to platform wallet before joining
   */
  async collectEntryFee(
    playerId: string,
    playerName: string,
    walletAddress: string,
    lobbyId: string,
    tier: string,
    entryFee: number,
    txSignature: string
  ): Promise<EntryFeePayment> {
    try {
      const separator = '══════════════════════════════════════════════════════════════════════';
      console.log('\n' + separator);
      console.log(`💳 ENTRY FEE COLLECTED`);
      console.log(separator);

      // Verify MongoDB connection
      if (mongoose.connection.readyState !== 1) {
        console.warn('⚠️ MongoDB not connected - payment not recorded');
      } else {
        // Save payment record to database
        const { LobbyPayment } = await import('../models/LobbyPayment.js');
        
        // Check if payment already exists (prevent double-recording)
        const existing = await (LobbyPayment as any).findOne({ txSignature });
        if (existing) {
          console.log(`ℹ️ Payment already recorded: ${txSignature}`);
          return {
            success: true,
            txSignature,
          };
        }

        await (LobbyPayment as any).create({
          playerId,
          lobbyId,
          tier,
          walletAddress,
          entryFee,
          txSignature,
          status: 'paid',
          timestamp: Date.now(),
        });

        console.log(`   Player: ${playerName}`);
        console.log(`   Wallet: ${walletAddress}`);
        console.log(`   Amount: $${entryFee} USDC`);
        console.log(`   Lobby: ${lobbyId} (Tier: $${tier})`);
        console.log(`   TX: ${txSignature}`);
        console.log(`   View: https://solscan.io/tx/${txSignature}`);
        console.log(separator + '\n');
      }

      return {
        success: true,
        txSignature,
      };
    } catch (error: any) {
      console.error(`❌ Failed to record entry fee:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Refund entry fee to player
   * Only allowed before game starts
   */
  async refundEntryFee(
    playerId: string,
    playerName: string,
    walletAddress: string,
    entryFee: number,
    lobbyId: string,
    tier: string
  ): Promise<RefundResult> {
    try {
      const separator = '══════════════════════════════════════════════════════════════════════';
      console.log('\n' + separator);
      console.log(`💸 PROCESSING REFUND`);
      console.log(separator);
      console.log(`   Player: ${playerName}`);
      console.log(`   Amount: $${entryFee} USDC`);
      console.log(`   Wallet: ${walletAddress}`);

      // Check platform has enough balance
      const balance = await this.walletManager.getUSDCBalance();
      if (balance < entryFee) {
        const error = 'Insufficient platform balance for refund';
        console.error(`❌ ${error}`);
        return {
          success: false,
          error,
        };
      }

      // Check if player has USDC account, create if needed
      try {
        const hasATA = await this.walletManager.hasUSDCAccount(walletAddress);
        if (!hasATA) {
          console.log(`📝 Creating USDC account for refund...`);
          await this.walletManager.createUSDCAccount(walletAddress);
        }
      } catch (error: any) {
        console.error(`❌ Failed to check/create USDC account:`, error);
        return {
          success: false,
          error: `Failed to prepare refund: ${error.message}`,
        };
      }

      // Send refund
      const signature = await this.walletManager.transferUSDC(
        walletAddress,
        entryFee,
        lobbyId,
        `${tier}_REFUND`
      );

      console.log(`\n   ✅ REFUND COMPLETE`);
      console.log(`   TX Signature: ${signature}`);
      console.log(`   View: https://solscan.io/tx/${signature}`);
      console.log(separator + '\n');

      // Update payment record in database
      if (mongoose.connection.readyState === 1) {
        const { LobbyPayment } = await import('../models/LobbyPayment.js');
        await (LobbyPayment as any).findOneAndUpdate(
          { playerId, lobbyId, status: 'paid' },
          { 
            status: 'refunded',
            refundTx: signature,
          }
        );
        console.log(`📝 Payment record updated: ${playerId} refunded`);
      }

      return {
        success: true,
        txSignature: signature,
      };
    } catch (error: any) {
      console.error(`❌ Refund failed:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get total paid entry fees for a lobby (for pot calculation)
   */
  async getLobbyPot(lobbyId: string): Promise<number> {
    try {
      if (mongoose.connection.readyState !== 1) {
        console.warn('⚠️ MongoDB not connected - cannot calculate pot');
        return 0;
      }

      const { LobbyPayment } = await import('../models/LobbyPayment.js');
      const payments = await (LobbyPayment as any).find({ 
        lobbyId, 
        status: 'paid' 
      });

      const totalPot = payments.reduce((sum, payment) => sum + payment.entryFee, 0);
      return totalPot;
    } catch (error) {
      console.error('❌ Error calculating lobby pot:', error);
      return 0;
    }
  }

  /**
   * Get count of paid players in lobby
   */
  async getPaidPlayerCount(lobbyId: string): Promise<number> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return 0;
      }

      const { LobbyPayment } = await import('../models/LobbyPayment.js');
      const count = await LobbyPayment.countDocuments({ 
        lobbyId, 
        status: 'paid' 
      });

      return count;
    } catch (error) {
      console.error('❌ Error counting paid players:', error);
      return 0;
    }
  }

  /**
   * Clear paid entry fees for a lobby (called on lobby reset)
   */
  async clearLobbyPayments(lobbyId: string): Promise<void> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return;
      }

      const { LobbyPayment } = await import('../models/LobbyPayment.js');
      
      // Mark all paid entries as used (so they don't count for next game)
      const result = await LobbyPayment.updateMany(
        { lobbyId, status: 'paid' },
        { status: 'used' as any }
      );

      if (result.modifiedCount > 0) {
        console.log(`🧹 Cleared ${result.modifiedCount} payment records for ${lobbyId}`);
      }
    } catch (error) {
      console.error('❌ Error clearing lobby payments:', error);
    }
  }
}

