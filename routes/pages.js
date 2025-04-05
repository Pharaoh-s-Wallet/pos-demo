import express from 'express';
import { dbAll } from '../db/index.js';
import nzddService from '../services/nzddService.js';

const router = express.Router();

// Home/POS page
router.get('/', async (req, res) => {
    try {
        const products = await dbAll('SELECT id, name, description, CAST(price AS FLOAT) as price FROM products ORDER BY name');
        res.render('pos', { products });
    } catch (error) {
        console.error('Error loading POS page:', error);
        res.status(500).send('Error loading POS page');
    }
});

// Dashboard page for vendor balances
router.get('/dashboard', async (req, res) => {
    try {
        const balances = await nzddService.getMerchantBalances();
        
        // Get stats about orders
        const stats = {
            total: await dbAll('SELECT COUNT(*) as count FROM orders'),
            pending: await dbAll('SELECT COUNT(*) as count FROM orders WHERE status = "pending"'),
            approved: await dbAll('SELECT COUNT(*) as count FROM orders WHERE status = "approved"'),
            paid: await dbAll('SELECT COUNT(*) as count FROM orders WHERE status = "paid"'),
            cancelled: await dbAll('SELECT COUNT(*) as count FROM orders WHERE status = "cancelled"'),
            volume: await dbAll('SELECT SUM(CAST(total_amount AS FLOAT)) as total FROM orders WHERE status = "paid"')
        };
        
        // Format stats
        Object.keys(stats).forEach(key => {
            stats[key] = stats[key][0][key === 'volume' ? 'total' : 'count'] || 0;
        });
        
        // Recent orders
        const recentOrders = await dbAll(`
            SELECT id, status, CAST(total_amount AS FLOAT) as total_amount, created_at, paid_at
            FROM orders
            ORDER BY created_at DESC
            LIMIT 5
        `);
        
        res.render('dashboard', { 
            balances,
            stats,
            recentOrders
        });
    } catch (error) {
        console.error('Error loading dashboard page:', error);
        res.status(500).send('Error loading dashboard page');
    }
});

// Products management page
router.get('/products', async (req, res) => {
    try {
        const products = await dbAll('SELECT id, name, description, CAST(price AS FLOAT) as price FROM products ORDER BY name');
        res.render('products', { products });
    } catch (error) {
        console.error('Error loading products page:', error);
        res.status(500).send('Error loading products page');
    }
});

// Orders history page
router.get('/orders', async (req, res) => {
    try {
        const orders = await dbAll(`
            SELECT 
                o.id,
                o.status,
                o.customer_wallet,
                o.created_at,
                o.paid_at,
                o.tx_hash,
                o.approval_tx,
                CAST(o.total_amount AS FLOAT) as total_amount,
                GROUP_CONCAT(json_object(
                    'productId', oi.product_id,
                    'name', p.name,
                    'quantity', oi.quantity,
                    'price', CAST(oi.price_at_time AS FLOAT)
                )) as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `);

        // Parse items JSON for each order
        orders.forEach(order => {
            order.items = order.items ? JSON.parse(`[${order.items}]`) : [];
        });

        res.render('orders', { orders });
    } catch (error) {
        console.error('Error loading orders page:', error);
        res.status(500).send('Error loading orders page');
    }
});

export default router; 