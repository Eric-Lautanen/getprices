# Solana OHLC Data Collector

This Node.js script collects and stores Open-High-Low-Close (OHLC) data for a Solana token based on price logs from the Solana network. It monitors Solana logs for price updates and aggregates them into OHLC candles for 1-minute, 5-minute, and 15-minute timeframes.

## Features

-   **Real-time Price Monitoring:** Listens to Solana logs for price updates.
-   **OHLC Aggregation:** Calculates and stores OHLC data for specified timeframes.
-   **Data Persistence:** Saves OHLC data to JSON files.
-   **Error Handling:** Robust error handling for network issues and data corruption.
-   **Graceful Shutdown:** Handles SIGINT to save data before exiting.
-   **Retry Logic:** Automatically retries connection attempts.

## Prerequisites

-   Node.js (v16 or higher recommended)
-   npm or yarn

## Installation

1.  Clone the repository:

    ```bash
    git clone <repository_url>
    cd <repository_directory>
    ```

2.  Install dependencies:

    ```bash
    npm install @solana/web3.js
    ```

## Configuration

Before running the script, you need to configure the following variables in the script:

-   `RPC_URL`: Solana RPC URL (e.g., `https://solana-rpc.publicnode.com`).
-   `WS_URL`: Solana WebSocket RPC URL (e.g., a free Helius WebSocket URL).
-   `publicKey`: The public key of the account to monitor for logs.
-   `MAX_BUFFER_SIZE`: The maximum number of OHLC candles to store in memory before saving to a file.
-   `timeframes`: An object defining the timeframes to collect data for, including the interval, data array, current candle, and filename.
-   `priceHandlers`: An array of objects defining the price log prefixes and labels.

Example configuration:

```javascript
const RPC_URL = '[https://solana-rpc.publicnode.com](https://solana-rpc.publicnode.com)';
const WS_URL = 'wss://[your-helius-rpc-url.com](https://www.google.com/search?q=your-helius-rpc-url.com)';
const publicKey = new PublicKey('11111111111111111111111111111111');
const MAX_BUFFER_SIZE = 1000;

const timeframes = {
    '1m': {
        interval: 1 * 60 * 1000,
        data: [],
        current: null,
        filename: '1m_OHLC.json'
    },
    '5m': {
        interval: 5 * 60 * 1000,
        data: [],
        current: null,
        filename: '5m_OHLC.json'
    },
    '15m': {
        interval: 15 * 60 * 1000,
        data: [],
        current: null,
        filename: '15m_OHLC.json'
    }
};

const priceHandlers = [
    { prefix: 'pythnet price:', label: 'Solana PythNet' },
    { prefix: 'doves price:', label: 'Solana Doves' }
];
