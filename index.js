import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import expressLayouts from 'express-ejs-layouts';
import ordersRouter from './routes/orders.js';
import productsRouter from './routes/products.js';
import pagesRouter from './routes/pages.js';
import { initializeDatabase } from './db/init.js';
import nzddService from './services/nzddService.js';
import { setupPaymentProcessor, shutdownPaymentProcessor } from './middleware/paymentProcessor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
let paymentProcessorInterval = null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// WebSocket connection handling
const clients = new Map();

wss.on('connection', (ws, req) => {
    const clientId = req.url.split('?clientId=')[1];
    if (clientId) {
        clients.set(clientId, ws);
        
        ws.on('close', () => {
            clients.delete(clientId);
        });
    }
});

// Notify client about payment status
export function notifyClient(clientId, data) {
    const client = clients.get(clientId);
    if (client) {
        client.send(JSON.stringify(data));
    }
}

// Routes
app.use('/api', ordersRouter);
app.use('/api', productsRouter);
app.use('/', pagesRouter);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Initialize database and start server
const PORT = process.env.PORT || 3001;

async function startServer() {
    try {
        // Initialize database
        await initializeDatabase();
        
        // Initialize NZDD service
        await nzddService.initialize();
        
        // Setup payment processor if enabled in environment
        if (process.env.ENABLE_AUTO_PAYMENT_PROCESSING !== 'false') {
            const processingInterval = parseInt(process.env.PAYMENT_PROCESSING_INTERVAL || '60000');
            app.use(setupPaymentProcessor(processingInterval));
            console.log(`Automatic payment processing enabled (every ${processingInterval}ms)`);
        } else {
            console.log('Automatic payment processing disabled');
        }
        
        // Start server
        server.listen(PORT, '::', () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    shutdownPaymentProcessor(paymentProcessorInterval);
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

startServer(); 