import { dbAll, dbRun } from '../db/index.js';
import nzddService from '../services/nzddService.js';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { notifyClient } from '../index.js';

dotenv.config();

/**
 * Process approved orders by collecting payments
 * This script can be run periodically (e.g., via cron job)
 */
async function processApprovedPayments() {
  try {
    console.log('Starting to process approved payments...');
    
    // Get all approved orders
    const approvedOrders = await dbAll(
      'SELECT id, total_amount, customer_wallet FROM orders WHERE status = "approved"'
    );
    
    console.log(`Found ${approvedOrders.length} approved orders to process`);
    
    for (const order of approvedOrders) {
      try {
        console.log(`Processing order ${order.id}...`);
        
        // Convert amount to smallest units (NZDD has 6 decimals)
        const amountInUnits = ethers.parseUnits(order.total_amount.toString(), 6);
        
        // Collect the payment
        const result = await nzddService.collectPayment(order.customer_wallet, amountInUnits);
        
        if (result.success) {
          // Update order status to paid
          await dbRun(
            'UPDATE orders SET status = ?, tx_hash = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['paid', result.transactionHash, order.id]
          );
          
          // Notify client of successful payment via WebSocket
          notifyClient(order.id, {
            type: 'payment_success',
            status: 'paid',
            orderID: order.id,
            message: 'Payment received!'
          });
          
          console.log(`✅ Successfully processed payment for order ${order.id}`);
          console.log(`   Transaction hash: ${result.transactionHash}`);
          console.log(`   Amount collected: ${result.amount} NZDD`);
        } else {
          console.error(`❌ Failed to process payment for order ${order.id}: ${result.message}`);
        }
      } catch (error) {
        console.error(`❌ Error processing order ${order.id}:`, error.message);
      }
      
      // Add a small delay between processing orders
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('Finished processing approved payments');
  } catch (error) {
    console.error('Error processing approved payments:', error);
  }
}

// Run the function if this script is called directly
if (process.argv[1].endsWith('processPayments.js')) {
  // Initialize the NZDD service before processing payments
  nzddService.initialize().then(() => {
    processApprovedPayments().finally(() => {
      console.log('Payment processing script completed');
      // Exit after processing
      setTimeout(() => process.exit(0), 1000);
    });
  });
}

export default processApprovedPayments; 