# TahiPOS Server DEMO

A Node.js Express server that powers the NZDD Point of Sale system, enabling merchants to create and manage products, process orders, and accept NZDD stablecoin payments on the Base network.

## Overview

This server provides a complete backend for a cryptocurrency-enabled point of sale system, featuring:

- RESTful API for product and order management
- UUID-based order identification
- QR code generation for payment processing
- WebSocket-based real-time updates
- Transaction verification on the blockchain
- SQLite database for persistent storage

## Installation

1. Install dependencies:
   ```
   npm install
   ```

2. Initialize the database:
   ```
   node db/init.js
   ```

3. Configure environment variables in `.env`:
   ```
   PORT=3000
   NODE_ENV=development
   MERCHANT_ADDRESS=your_merchant_wallet_address
   NZDD_CONTRACT_ADDRESS=0x2dd087589ce9c5b2d1b42e20d2519b3c8cf022b7
   BASE_RPC_URL=your_base_rpc_url
   PRIVATE_KEY=your_merchant_private_key
   AUTO_PROCESS_PAYMENTS=true
   ```

4. Start the server:
   ```
   npm run dev
   ```

## API Reference

### Products API

#### Get all products
- **GET** `/api/products`
- **Response**: Array of product objects with id, name, price, and description

#### Get product by ID
- **GET** `/api/products/:id`
- **Response**: Product object with id, name, price, and description

#### Create product
- **POST** `/api/products`
- **Body**:
  ```json
  {
    "name": "Product Name",
    "price": 10.99,
    "description": "Product description"
  }
  ```
- **Response**: Created product object

#### Update product
- **PUT** `/api/products/:id`
- **Body**:
  ```json
  {
    "name": "Updated Product Name",
    "price": 12.99,
    "description": "Updated description"
  }
  ```
- **Response**: Updated product object

#### Delete product
- **DELETE** `/api/products/:id`
- **Response**: Success message

### Orders API

#### Create order
- **POST** `/api/orders`
- **Body**:
  ```json
  {
    "items": [
      {
        "productId": 1,
        "quantity": 2
      },
      {
        "productId": 3,
        "quantity": 1
      }
    ]
  }
  ```
- **Response**:
  ```json
  {
    "orderId": "uuid-string",
    "totalAmount": 34.97,
    "qrCode": "data:image/png;base64,..."
  }
  ```

#### Get order details
- **GET** `/api/orders/:id`
- **Response**: Order object with items, status, and payment information

#### Update order status
- **POST** `/api/orders/:id/status`
- **Body**:
  ```json
  {
    "status": "pending|approved|paid|cancelled",
    "customerWallet": "0x..."
  }
  ```
- **Response**: Success message

#### Verify payment approval
- **POST** `/api/orders/:id/verify-approval`
- **Body**:
  ```json
  {
    "txHash": "0x...",
    "clientId": "optional-client-id-for-websocket"
  }
  ```
- **Response**: Verification status with order and approval details

#### Collect payment
- **POST** `/api/orders/:id/collect-payment`
- **Body**:
  ```json
  {
    "clientId": "optional-client-id-for-websocket"
  }
  ```
- **Response**: Payment collection status with transaction details

#### Get merchant balances
- **GET** `/api/merchant/balances`
- **Response**: NZDD balance information for the merchant address

### WebSocket Notifications

The server uses WebSockets to provide real-time updates on order status changes:

- Connect to `/ws` endpoint
- Listen for events:
  - `payment_success`: Order paid successfully
  - `approval_success`: Payment approval confirmed
  - `order_updated`: General order status updates

## Development

### Database Schema

The system uses SQLite with the following main tables:
- `products`: Store product information
- `orders`: Track order status and payment details
- `order_items`: Link products to orders with quantities

### Processing Payments

The system can process approved payments automatically with:
```
node scripts/processPayments.js
```

## Testing

For development and testing, you can mark orders as paid using the test route:
```
POST /api/orders/:id/complete-test
```

Note: This endpoint is only available in non-production environments. 