import { dbGet, dbRun } from '../db/index.js';
import { notifyClient } from '../index.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

/**
 * Test script to manually complete a payment flow
 * This is useful for testing WebSocket notifications and UI updates
 */
async function testPaymentFlow(orderId) {
  try {
    if (!orderId) {
      console.error('❌ Order ID is required');
      return;
    }
    
    console.log(`Testing payment flow for order ${orderId}...`);
    
    // Check if order exists
    const order = await dbGet(
      'SELECT id, total_amount, status FROM orders WHERE id = ?',
      [orderId]
    );
    
    if (!order) {
      console.error(`❌ Order ${orderId} not found`);
      return;
    }
    
    console.log(`Found order: ${order.id}, status: ${order.status}, amount: ${order.total_amount}`);
    
    // 1. First update to "approved" status
    await dbRun(
      'UPDATE orders SET status = ?, approval_tx = ? WHERE id = ?',
      ['approved', '0x' + '1'.repeat(64), orderId]
    );
    
    console.log(`✅ Updated order status to "approved"`);
    
    // 2. Send WebSocket notification for approval
    notifyClient(orderId, {
      type: 'approval_success',
      status: 'approved',
      orderID: orderId,
      message: 'Approval confirmed, processing payment...'
    });
    
    console.log(`✅ Sent approval notification`);
    
    // 3. Wait 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 4. Update to "paid" status
    await dbRun(
      'UPDATE orders SET status = ?, tx_hash = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['paid', '0x' + '2'.repeat(64), orderId]
    );
    
    console.log(`✅ Updated order status to "paid"`);
    
    // 5. Send WebSocket notification for payment
    notifyClient(orderId, {
      type: 'payment_success',
      status: 'paid',
      orderID: orderId,
      message: 'Payment received!'
    });
    
    console.log(`✅ Sent payment success notification`);
    console.log('Payment flow test completed successfully');
  } catch (error) {
    console.error('❌ Error in payment flow test:', error);
  }
}

// Run the function if this script is called directly
if (process.argv[1].endsWith('testPaymentFlow.js')) {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error('Usage: node testPaymentFlow.js <orderId>');
    process.exit(1);
  }
  
  testPaymentFlow(orderId).finally(() => {
    console.log('Test script completed');
    // Exit after a delay to allow WebSocket messages to be sent
    setTimeout(() => process.exit(0), 1000);
  });
}

export default testPaymentFlow; 