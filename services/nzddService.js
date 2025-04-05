import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// ERC20 ABI - interface for approve/transferFrom pattern
const ERC20_ABI = [
  // Read functions
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // Write functions
  "function transfer(address to, uint amount) returns (bool)",
  "function approve(address spender, uint amount) returns (bool)",
  "function transferFrom(address from, address to, uint amount) returns (bool)",
  
  // Events
  "event Transfer(address indexed from, address indexed to, uint amount)",
  "event Approval(address indexed owner, address indexed spender, uint amount)"
];

class NZDDService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    this.merchantWallet = new ethers.Wallet(process.env.MERCHANT_PRIVATE_KEY, this.provider);
    this.nzddContract = new ethers.Contract(
      process.env.NZDD_CONTRACT_ADDRESS, 
      ERC20_ABI, 
      this.merchantWallet
    );
    this.decimals = 6; // NZDD has 6 decimals
  }

  async initialize() {
    try {
      // Verify connection to blockchain
      await this.provider.getBlockNumber();
      
      // Get token decimals
      this.decimals = await this.nzddContract.decimals();
      
      console.log(`NZDD Service initialized. Merchant address: ${this.merchantWallet.address}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize NZDD service:', error);
      return false;
    }
  }

  async getMerchantBalance() {
    try {
      const balanceRaw = await this.nzddContract.balanceOf(this.merchantWallet.address);
      const balance = parseFloat(ethers.formatUnits(balanceRaw, this.decimals));
      return balance;
    } catch (error) {
      console.error('Error getting merchant balance:', error);
      throw error;
    }
  }

  async checkApproval(customerAddress, amount) {
    try {
      const allowanceRaw = await this.nzddContract.allowance(
        customerAddress,
        this.merchantWallet.address
      );
      
      const allowance = ethers.formatUnits(allowanceRaw, this.decimals);
      const requestedAmount = ethers.formatUnits(amount, this.decimals);
      
      return {
        approved: parseFloat(allowance) >= parseFloat(requestedAmount),
        allowance: parseFloat(allowance)
      };
    } catch (error) {
      console.error('Error checking approval:', error);
      throw error;
    }
  }

  async collectPayment(customerAddress, amount) {
    try {
      // First check if we have sufficient allowance
      const { approved } = await this.checkApproval(customerAddress, amount);
      
      if (!approved) {
        throw new Error('Insufficient allowance to collect payment');
      }
      
      // Execute transferFrom to collect the payment
      const tx = await this.nzddContract.transferFrom(
        customerAddress,
        this.merchantWallet.address,
        amount
      );
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      if (receipt.status !== 1) {
        throw new Error('Transaction failed');
      }
      
      return {
        success: true,
        transactionHash: receipt.hash,
        amount: parseFloat(ethers.formatUnits(amount, this.decimals))
      };
    } catch (error) {
      console.error('Error collecting payment:', error);
      return { success: false, message: error.message };
    }
  }

  async verifyApproval(txHash) {
    try {
      // Wait for transaction receipt
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      if (!receipt || receipt.status !== 1) {
        return { success: false, message: 'Transaction failed or not found' };
      }
      
      // Look for Approval event to merchant address
      const approvalEvent = receipt.logs
        .map(log => {
          try {
            return this.nzddContract.interface.parseLog(log);
          } catch (e) {
            return null;
          }
        })
        .filter(parsedLog => 
          parsedLog && 
          parsedLog.name === 'Approval' && 
          parsedLog.args.spender.toLowerCase() === this.merchantWallet.address.toLowerCase()
        )[0];
      
      if (!approvalEvent) {
        return { success: false, message: 'No approval to merchant found in transaction' };
      }
      
      const amount = parseFloat(ethers.formatUnits(approvalEvent.args.amount, this.decimals));
      
      return {
        success: true,
        amount,
        from: approvalEvent.args.owner
      };
    } catch (error) {
      console.error('Error verifying approval:', error);
      return { success: false, message: error.message };
    }
  }

  // For development/testing only - simulates a successful payment
  async simulatePaymentForOrder(orderId, customerWallet) {
    try {
      if (!orderId) {
        throw new Error('Order ID is required');
      }
      
      if (!customerWallet) {
        throw new Error('Customer wallet address is required');
      }
      
      // Create a fake transaction hash
      const fakeTransactionHash = '0x' + Array.from({length: 64}, () => 
        Math.floor(Math.random() * 16).toString(16)).join('');
      
      return {
        success: true,
        transactionHash: fakeTransactionHash,
        amount: 0.0 // This will be replaced with the actual amount from the order
      };
    } catch (error) {
      console.error('Error in payment simulation:', error);
      return { success: false, message: error.message };
    }
  }

  async getMerchantBalances() {
    try {
      // Get NZDD balance
      const nzddBalanceRaw = await this.nzddContract.balanceOf(this.merchantWallet.address);
      const nzddBalance = parseFloat(ethers.formatUnits(nzddBalanceRaw, this.decimals));
      
      // Get ETH balance
      const ethBalanceRaw = await this.provider.getBalance(this.merchantWallet.address);
      const ethBalance = parseFloat(ethers.formatEther(ethBalanceRaw));
      
      return {
        address: this.merchantWallet.address,
        nzdd: nzddBalance,
        eth: ethBalance
      };
    } catch (error) {
      console.error('Error getting merchant balances:', error);
      throw error;
    }
  }
}

// Export singleton
const nzddService = new NZDDService();
export default nzddService; 