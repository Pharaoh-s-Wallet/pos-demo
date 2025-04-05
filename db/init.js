import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, dbRun } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Sample products data
const sampleProducts = [
    {
        name: 'Coffee',
        price: 4.50,
        description: 'Fresh brewed coffee'
    },
    {
        name: 'Tea',
        price: 3.50,
        description: 'Organic green tea'
    },
    {
        name: 'Sandwich',
        price: 8.99,
        description: 'Classic club sandwich'
    },
    {
        name: 'Salad',
        price: 7.99,
        description: 'Fresh garden salad'
    },
    {
        name: 'Cookie',
        price: 2.50,
        description: 'Chocolate chip cookie'
    }
];

async function initializeDatabase() {
    try {
        // Read and execute schema
        const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
        const statements = schema.split(';').filter(stmt => stmt.trim());
        
        for (const statement of statements) {
            await dbRun(statement);
        }
        
        // Insert sample products
        for (const product of sampleProducts) {
            await dbRun(
                'INSERT INTO products (name, price, description) VALUES (?, ?, ?)',
                [product.name, product.price, product.description]
            );
        }
        
        console.log('Database initialized successfully with sample data');
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
}

// Close database connection when the script ends
process.on('exit', () => {
    db.close();
});

export { initializeDatabase }; 