import express from 'express';
import { dbAll, dbGet, dbRun } from '../db/index.js';

const router = express.Router();

// Get all products
router.get('/products', async (req, res) => {
    try {
        const products = await dbAll('SELECT id, name, description, CAST(price AS FLOAT) as price FROM products ORDER BY name');
        res.json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single product
router.get('/products/:id', async (req, res) => {
    try {
        const product = await dbGet(
            'SELECT id, name, description, CAST(price AS FLOAT) as price FROM products WHERE id = ?',
            [req.params.id]
        );
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create new product
router.post('/products', async (req, res) => {
    const { name, price, description } = req.body;
    
    try {
        // Ensure price is a number
        const numericPrice = parseFloat(price);
        if (isNaN(numericPrice)) {
            return res.status(400).json({ error: 'Price must be a valid number' });
        }

        const result = await dbRun(
            'INSERT INTO products (name, price, description) VALUES (?, ?, ?)',
            [name, numericPrice, description]
        );
        
        const newProduct = await dbGet(
            'SELECT id, name, description, CAST(price AS FLOAT) as price FROM products WHERE id = ?',
            [result.lastID]
        );
        res.status(201).json(newProduct);
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update product
router.put('/products/:id', async (req, res) => {
    const { name, price, description } = req.body;
    
    try {
        // Ensure price is a number
        const numericPrice = parseFloat(price);
        if (isNaN(numericPrice)) {
            return res.status(400).json({ error: 'Price must be a valid number' });
        }

        await dbRun(
            'UPDATE products SET name = ?, price = ?, description = ? WHERE id = ?',
            [name, numericPrice, description, req.params.id]
        );
        
        const updatedProduct = await dbGet(
            'SELECT id, name, description, CAST(price AS FLOAT) as price FROM products WHERE id = ?',
            [req.params.id]
        );
        if (!updatedProduct) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(updatedProduct);
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete product
router.delete('/products/:id', async (req, res) => {
    try {
        const result = await dbRun('DELETE FROM products WHERE id = ?', [req.params.id]);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router; 