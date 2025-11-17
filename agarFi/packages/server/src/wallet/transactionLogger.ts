import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Transaction {
  id: string;
  timestamp: number;
  winnerId: string;
  winnerName: string;
  walletAddress: string;
  amountUSDC: number;
  txSignature: string | null;
  gameId: string;
  tier: string;
  playersCount: number;
  status: 'success' | 'failed' | 'pending';
  retries: number;
  error?: string;
}

interface TransactionLog {
  transactions: Transaction[];
}

const TRANSACTIONS_FILE = path.join(__dirname, '../../../transactions.json');

/**
 * Load transactions from JSON file
 */
export function loadTransactions(): Transaction[] {
  try {
    if (!fs.existsSync(TRANSACTIONS_FILE)) {
      // Create initial file
      const initialData: TransactionLog = { transactions: [] };
      fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(initialData, null, 2));
      return [];
    }

    const data = fs.readFileSync(TRANSACTIONS_FILE, 'utf-8');
    const parsed: TransactionLog = JSON.parse(data);
    return parsed.transactions || [];
  } catch (error) {
    console.error('Error loading transactions:', error);
    return [];
  }
}

/**
 * Save transactions to JSON file
 */
export function saveTransactions(transactions: Transaction[]): void {
  try {
    const data: TransactionLog = { transactions };
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving transactions:', error);
  }
}

/**
 * Log a new transaction
 */
export function logTransaction(transaction: Transaction): void {
  const transactions = loadTransactions();
  transactions.push(transaction);
  saveTransactions(transactions);
  
  console.log(`📝 Transaction logged: ${transaction.id} - ${transaction.status}`);
}

/**
 * Update transaction status
 */
export function updateTransaction(txId: string, updates: Partial<Transaction>): void {
  const transactions = loadTransactions();
  const index = transactions.findIndex(tx => tx.id === txId);
  
  if (index !== -1) {
    transactions[index] = { ...transactions[index], ...updates };
    saveTransactions(transactions);
    console.log(`📝 Transaction updated: ${txId}`);
  }
}

/**
 * Get all transactions
 */
export function getAllTransactions(): Transaction[] {
  return loadTransactions();
}

/**
 * Get recent transactions (limit)
 */
export function getRecentTransactions(limit: number = 50): Transaction[] {
  const transactions = loadTransactions();
  return transactions
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

/**
 * Get transactions by wallet address
 */
export function getTransactionsByWallet(walletAddress: string): Transaction[] {
  const transactions = loadTransactions();
  return transactions.filter(tx => tx.walletAddress === walletAddress);
}

