import express from 'express';
import QRCode from 'qrcode';
import { dbAll, dbGet, dbRun } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import nzddService from '../services/nzddService.js';
import { notifyClient } from '../index.js';
import { ethers } from 'ethers';

const router = express.Router();

// Create a new order
router.post('/orders', async (req, res) => {
    const { items } = req.body;
    
    try {
        // Start transaction
        await dbRun('BEGIN TRANSACTION');
        
        // Generate UUID for order
        const orderId = uuidv4();
        
        // Create order
        await dbRun(
            'INSERT INTO orders (id, total_amount) VALUES (?, ?)',
            [orderId, 0] // We'll update the total after calculating
        );
        
        let totalAmount = 0;
        
        // Insert order items and calculate total
        for (const item of items) {
            const product = await dbGet(
                'SELECT price FROM products WHERE id = ?',
                [item.productId]
            );
            
            if (!product) {
                throw new Error(`Product ${item.productId} not found`);
            }
            
            const itemTotal = product.price * item.quantity;
            totalAmount += itemTotal;
            
            await dbRun(
                'INSERT INTO order_items (order_id, product_id, quantity, price_at_time) VALUES (?, ?, ?, ?)',
                [orderId, item.productId, item.quantity, product.price]
            );
        }
        
        // Update order total
        await dbRun(
            'UPDATE orders SET total_amount = ? WHERE id = ?',
            [totalAmount, orderId]
        );
        
        // Generate simple QR code with order ID
        const qrCode = await QRCode.toDataURL(`order:${orderId}`);
        
        await dbRun('COMMIT');
        
        res.json({
            orderId,
            totalAmount,
            qrCode
        });
    } catch (error) {
        await dbRun('ROLLBACK');
        console.error('Error creating order:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get order details
router.get('/orders/:id', async (req, res) => {
    try {
        const order = await dbGet(
            `SELECT o.*, 
                    GROUP_CONCAT(json_object(
                        'productId', oi.product_id,
                        'name', p.name,
                        'quantity', oi.quantity,
                        'price', CAST(oi.price_at_time AS FLOAT)
                    )) as items
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             LEFT JOIN products p ON oi.product_id = p.id
             WHERE o.id = ?
             GROUP BY o.id`,
            [req.params.id]
        );
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        // Parse items from string to array
        order.items = order.items ? JSON.parse(`[${order.items}]`) : [];
        
        res.json(order);
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update order status
router.post('/orders/:id/status', async (req, res) => {
    const { status, customerWallet } = req.body;
    
    try {
        await dbRun(
            'UPDATE orders SET status = ?, customer_wallet = ?, paid_at = CASE WHEN ? = "paid" THEN CURRENT_TIMESTAMP ELSE paid_at END WHERE id = ?',
            [status, customerWallet, status, req.params.id]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Verify payment transaction
router.post('/orders/:id/verify-approval', async (req, res) => {
    const { txHash, clientId } = req.body;
    
    if (!txHash) {
        return res.status(400).json({ error: 'Transaction hash is required' });
    }
    
    try {
        // Get order details
        const order = await dbGet(
            'SELECT id, total_amount, status FROM orders WHERE id = ?',
            [req.params.id]
        );
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        if (order.status === 'paid') {
            // If already paid, notify client
            notifyClient(req.params.id, { 
                type: 'payment_success', 
                status: 'paid',
                orderID: order.id,
                message: 'Payment received!'
            });
            
            return res.json({ success: true, message: 'Order already marked as paid' });
        }
        
        // Verify the approval transaction
        const verification = await nzddService.verifyApproval(txHash);
        
        if (!verification.success) {
            return res.status(400).json({ 
                success: false, 
                message: verification.message || 'Approval verification failed' 
            });
        }
        
        // Check if the approved amount matches the order amount
        // Allow a small difference to account for rounding errors (0.01 NZDD)
        const approvedAmount = verification.amount;
        const orderAmount = parseFloat(order.total_amount);
        const difference = Math.abs(approvedAmount - orderAmount);
        
        if (difference > 0.01) {
            return res.status(400).json({ 
                success: false,
                message: `Approved amount (${approvedAmount} NZDD) does not match order amount (${orderAmount} NZDD)`
            });
        }
        
        // Update order status to approved
        await dbRun(
            'UPDATE orders SET status = ?, customer_wallet = ?, approval_tx = ? WHERE id = ?',
            ['approved', verification.from, txHash, req.params.id]
        );
        
        // Notify client about approval success
        notifyClient(req.params.id, { 
            type: 'approval_success', 
            status: 'approved',
            orderID: order.id,
            message: 'Approval confirmed, processing payment...'
        });
        
        // Process the payment immediately (if enabled)
        const autoProcessPayments = process.env.AUTO_PROCESS_PAYMENTS !== 'false';
        if (autoProcessPayments) {
            // Import processApprovedPayments dynamically to avoid circular dependencies
            const { default: processApprovedPayments } = await import('../scripts/processPayments.js');
            processApprovedPayments().catch(err => {
                console.error('Error processing payment after approval:', err);
            });
        }
        
        return res.json({ 
            success: true, 
            message: 'Approval verified successfully',
            orderAmount,
            approvedAmount,
            customerWallet: verification.from
        });
    } catch (error) {
        console.error('Error verifying approval:', error);
        res.status(500).json({ error: error.message });
    }
});

// Collect payment after approval
router.post('/orders/:id/collect-payment', async (req, res) => {
    const { clientId } = req.body;
    
    try {
        // Get order details
        const order = await dbGet(
            'SELECT id, total_amount, status, customer_wallet FROM orders WHERE id = ?',
            [req.params.id]
        );
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        if (order.status === 'paid') {
            return res.json({ success: true, message: 'Order already marked as paid' });
        }
        
        if (order.status !== 'approved') {
            return res.status(400).json({ error: 'Order must be approved before collecting payment' });
        }
        
        if (!order.customer_wallet) {
            return res.status(400).json({ error: 'Customer wallet address not found' });
        }
        
        // Fix floating-point precision issues by rounding to 2 decimal places
        const fixedAmount = parseFloat(parseFloat(order.total_amount).toFixed(2));
        console.log(`Order ${order.id}: Original amount: ${order.total_amount}, Fixed amount: ${fixedAmount}`);
        
        // Convert amount to smallest units (NZDD has 6 decimals)
        const amountInUnits = ethers.parseUnits(fixedAmount.toString(), 6);
        
        // Collect the payment
        const result = await nzddService.collectPayment(order.customer_wallet, amountInUnits);
        
        if (!result.success) {
            return res.status(400).json({ 
                success: false, 
                message: result.message || 'Failed to collect payment' 
            });
        }
        
        // Update order status to paid
        await dbRun(
            'UPDATE orders SET status = ?, tx_hash = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['paid', result.transactionHash, req.params.id]
        );
        
        // Notify client if clientId is provided
        if (clientId) {
            notifyClient(clientId, { 
                type: 'payment_success', 
                orderId: order.id,
                amount: result.amount,
                transactionHash: result.transactionHash
            });
        }
        
        return res.json({ 
            success: true, 
            message: 'Payment collected successfully',
            amount: result.amount,
            transactionHash: result.transactionHash
        });
    } catch (error) {
        console.error('Error collecting payment:', error);
        res.status(500).json({ error: error.message });
    }
});

// Development-only route to manually complete an order
// This should be disabled or removed in production
if (process.env.NODE_ENV !== 'production') {
    router.post('/orders/:id/complete-test', async (req, res) => {
        try {
            const order = await dbGet(
                'SELECT id, total_amount, status FROM orders WHERE id = ?',
                [req.params.id]
            );
            
            if (!order) {
                return res.status(404).json({ error: 'Order not found' });
            }
            
            // Simulate a customer wallet address if one doesn't exist
            const customerWallet = req.body.customerWallet || '0x' + Array.from({length: 40}, () => 
                Math.floor(Math.random() * 16).toString(16)).join('');
            
            // Create a fake transaction hash
            const txHash = '0x' + Array.from({length: 64}, () => 
                Math.floor(Math.random() * 16).toString(16)).join('');
            
            // Update the order status
            await dbRun(
                'UPDATE orders SET status = ?, customer_wallet = ?, tx_hash = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['paid', customerWallet, txHash, req.params.id]
            );
            
            // Notify via WebSocket
            notifyClient(req.params.id, {
                type: 'payment_success',
                status: 'paid',
                orderID: order.id,
                message: 'Payment received! (TEST)'
            });
            
            res.json({ 
                success: true, 
                message: 'Order marked as paid for testing',
                txHash
            });
        } catch (error) {
            console.error('Error completing test order:', error);
            res.status(500).json({ error: error.message });
        }
    });
}

// Get merchant balances
router.get('/merchant/balances', async (req, res) => {
    try {
        const balances = await nzddService.getMerchantBalances();
        res.json(balances);
    } catch (error) {
        console.error('Error getting merchant balances:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router; 