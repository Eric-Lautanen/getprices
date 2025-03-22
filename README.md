# Crypto OHLC Data Collector

This Node.js script collects real-time price data for Bitcoin, Ethereum, and Solana from Kraken and Coinbase WebSocket APIs and stores Open-High-Low-Close (OHLC) data in JSON Lines format for 1-minute, 5-minute, and 15-minute timeframes.

## Features

-   **Real-time Price Monitoring:** Subscribes to Kraken and Coinbase WebSocket feeds for live price updates.
-   **OHLC Data Storage:** Calculates and stores OHLC data for specified timeframes.
-   **Multiple Timeframes:** Supports 1m, 5m, and 15m timeframes for each asset.
-   **File Storage:** Saves OHLC data to individual JSON Lines files (`<asset>_<timeframe>_OHLC.jsonl`).
-   **Price Range Validation:** Ignores prices outside defined ranges to filter out potential erroneous data.
-   **Graceful Shutdown:** Ensures all pending OHLC candles are saved before exiting.
-   **Error Handling:** Robust error handling for WebSocket connections and file operations.
-   **Load Last Close:** On startup, loads the last close price and timestamp from existing OHLC files.

## Prerequisites

-   Node.js (v16 or later recommended)
-   `npm` or `yarn`

## Installation

1.  Clone the repository:

    ```bash
    git clone <repository_url>
    cd <repository_directory>
    ```

2.  Install dependencies:

    ```bash
    npm install ws
    ```

## Usage

1.  Run the script:

    ```bash
    node <your_script_name>.js
    ```

2.  The script will connect to Kraken and Coinbase WebSocket APIs and start collecting price data. OHLC data will be saved to files in the same directory.

3.  To stop the script, press `Ctrl+C`. This will trigger a graceful shutdown, ensuring that all pending OHLC data is saved.

## Configuration

The script uses the following configuration:

-   **Assets and Price Ranges:**

    ```javascript
    const assets = {
        'Solana': { min: 50, max: 500 },
        'Ethereum': { min: 1000, max: 10000 },
        'Bitcoin': { min: 30000, max: 100000 }
    };
    ```

    You can modify these ranges to suit your requirements.

-   **Timeframes:**

    ```javascript
    const timeframes = {
        'Solana': {
            '1m': { interval: 1 * 60 * 1000, filename: 'Solana_1m_OHLC.jsonl', /* ... */ },
            '5m': { interval: 5 * 60 * 1000, filename: 'Solana_5m_OHLC.jsonl', /* ... */ },
            '15m': { interval: 15 * 60 * 1000, filename: 'Solana_15m_OHLC.jsonl', /* ... */ }
        },
        'Ethereum': { /* ... */ },
        'Bitcoin': { /* ... */ }
    };
    ```

    You can add or modify timeframes and their corresponding file names.

## File Format

OHLC data is stored in JSON Lines format, where each line is a JSON object representing an OHLC candle. Example:

```json
{"timestamp":"2023-10-27T10:00:00.000Z","open":30000.00,"high":30100.00,"low":29900.00,"close":30050.00}
{"timestamp":"2023-10-27T10:01:00.000Z","open":30050.00,"high":30150.00,"low":30000.00,"close":30120.00}
