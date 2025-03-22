// Import WebSocket library for real-time data streaming
import WebSocket from 'ws';
// Import filesystem promise-based methods for file operations
import { readFile, appendFile } from 'node:fs/promises';

// Define price ranges per asset for validation
const assets = {
    'Solana': { min: 50, max: 500 },      // Solana price range in USD
    'Ethereum': { min: 1000, max: 10000 }, // Ethereum price range in USD
    'Bitcoin': { min: 30000, max: 150000 } // Bitcoin price range in USD
};

// Initialize timeframes object to store OHLC data structure for each asset
const timeframes = {};
// Loop through each asset to create timeframe configurations
for (const asset of Object.keys(assets)) {
    timeframes[asset] = {
        // 1-minute timeframe configuration
        '1m': { 
            interval: 1 * 60 * 1000,    // Interval duration in milliseconds (1 minute)
            current: null,              // Current active OHLC candle
            lastClose: null,            // Last finalized closing price
            lastFinalized: null,        // Timestamp of last saved candle
            filename: `${asset}_1m_OHLC.jsonl` // File to store 1m OHLC data
        },
        // 5-minute timeframe configuration
        '5m': { 
            interval: 5 * 60 * 1000,    // Interval duration (5 minutes)
            current: null,              // Current active OHLC candle
            lastClose: null,            // Last finalized closing price
            lastFinalized: null,        // Timestamp of last saved candle
            filename: `${asset}_5m_OHLC.jsonl` // File to store 5m OHLC data
        },
        // 15-minute timeframe configuration
        '15m': { 
            interval: 15 * 60 * 1000,   // Interval duration (15 minutes)
            current: null,              // Current active OHLC candle
            lastClose: null,            // Last finalized closing price
            lastFinalized: null,        // Timestamp of last saved candle
            filename: `${asset}_15m_OHLC.jsonl` // File to store 15m OHLC data (fixed from ${ crucifix})
        }
    };
}
// Object to track ongoing save operations to prevent concurrent writes
let isSaving = {};

/** Calculate the start of the current interval based on timestamp and interval duration
 * @param {Date} timestamp - Current timestamp
 * @param {number} intervalMs - Interval duration in milliseconds
 * @returns {Date} Start time of current interval
 */
function getIntervalStart(timestamp, intervalMs) {
    return new Date(Math.floor(timestamp.getTime() / intervalMs) * intervalMs);
}

/** Check existing OHLC files on startup and load last known values
 * Loads previous closing prices and timestamps if files exist
 */
async function loadOhlcData() {
    console.log('[INIT] Checking OHLC files...');
    // Iterate through all assets and their timeframes
    for (const [asset, assetFrames] of Object.entries(timeframes)) {
        for (const [tf, frame] of Object.entries(assetFrames)) {
            try {
                // Attempt to read existing OHLC file
                const data = await readFile(frame.filename, 'utf8');
                const lines = data.trim().split('\n').filter(line => line.trim());
                if (lines.length > 0) {
                    // Parse the last line (most recent candle)
                    const lastCandle = JSON.parse(lines[lines.length - 1]);
                    frame.lastClose = lastCandle.close;         // Set last known close price
                    frame.lastFinalized = lastCandle.timestamp; // Set last finalized timestamp
                    console.log(`[INIT] Loaded last close for ${asset} ${tf}: ${frame.lastClose} at ${frame.lastFinalized}`);
                }
            } catch (error) {
                // Handle file not found (create new file later)
                if (error.code === 'ENOENT') {
                    console.log(`[INIT] ${frame.filename} not found - will create on first save`);
                } else {
                    // Log other errors during file reading
                    console.error(`[ERROR] Checking ${frame.filename}:`, error.message);
                }
            }
            // Initialize saving flag for this asset/timeframe combination
            isSaving[`${asset}_${tf}`] = false;
        }
    }
}

/** Save OHLC candle to file with concurrency protection
 * @param {string} asset - Cryptocurrency name
 * @param {string} timeframe - Timeframe identifier (1m, 5m, 15m)
 * @param {Object} candle - OHLC candle data to save
 */
async function saveOhlcData(asset, timeframe, candle) {
    const key = `${asset}_${timeframe}`; // Unique key for this asset/timeframe
    // Check if save operation is already in progress
    if (isSaving[key]) {
        console.log(`[SAVE] Save already in progress for ${key}, skipping`);
        return;
    }

    isSaving[key] = true; // Set saving flag
    const frame = timeframes[asset][timeframe]; // Get timeframe data
    
    try {
        const line = JSON.stringify(candle) + '\n'; // Format candle as JSON with newline
        await appendFile(frame.filename, line);     // Append to file
        frame.lastClose = candle.close;             // Update last close price
        frame.lastFinalized = candle.timestamp;     // Update last finalized timestamp
        console.log(`[SAVE] Saved candle to ${frame.filename}: ${line.trim()}`);
    } catch (error) {
        // Log any errors during save operation
        console.error(`[ERROR] Saving ${key} OHLC:`, error.message);
    } finally {
        isSaving[key] = false; // Reset saving flag
    }
}

/** Update OHLC candles with new price data
 * @param {Object} param - Price update data
 * @param {number} param.price - Current price
 * @param {string} param.asset - Cryptocurrency name
 * @param {Date} param.timestamp - Update timestamp
 */
async function updateOhlc({ price, asset, timestamp }) {
    const formattedPrice = parseFloat(price.toFixed(2)); // Round price to 2 decimals
    const assetFrames = timeframes[asset];               // Get asset's timeframe data

    // Validate price is within acceptable range
    if (!assetFrames || formattedPrice < assets[asset].min || formattedPrice > assets[asset].max) {
        console.log(`[OHLC] Skipped ${asset}: Price=${formattedPrice} out of range`);
        return;
    }

    // Update each timeframe for the asset
    for (const [tf, frame] of Object.entries(assetFrames)) {
        const intervalStart = getIntervalStart(timestamp, frame.interval); // Calculate interval start
        const intervalISO = intervalStart.toISOString();                  // Convert to ISO string

        // Check if new candle needs to be created
        if (!frame.current || (frame.current.timestamp !== intervalISO && frame.lastFinalized !== frame.current.timestamp)) {
            if (frame.current) {
                // Finalize existing candle if it exists
                const oldCandle = frame.current;
                frame.current = null;
                await finalizeOhlc(asset, tf, oldCandle);
                const prevClose = oldCandle.close;
                // Start new candle with previous close as opening price
                frame.current = {
                    timestamp: intervalISO,
                    open: prevClose,
                    high: prevClose,
                    low: prevClose,
                    close: prevClose
                };
                console.log(`[OHLC ${asset} ${tf}] New candle: O=${prevClose.toFixed(2)} at ${intervalISO}`);
            } else {
                // Create first candle if none exists
                const prevClose = frame.lastClose !== null ? frame.lastClose : formattedPrice;
                frame.current = {
                    timestamp: intervalISO,
                    open: prevClose,
                    high: prevClose,
                    low: prevClose,
                    close: prevClose
                };
                console.log(`[OHLC ${asset} ${tf}] New candle: O=${prevClose.toFixed(2)} at ${intervalISO}`);
            }
        }

        const candle = frame.current; // Current candle being updated
        // Update OHLC values if price changed
        if (formattedPrice !== candle.close) {
            const updates = []; // Track changes for logging
            if (formattedPrice > candle.high) {
                updates.push(`High↑ ${candle.high.toFixed(2)}→${formattedPrice}`);
                candle.high = formattedPrice; // Update high price
            }
            if (formattedPrice < candle.low) {
                updates.push(`Low↓ ${candle.low.toFixed(2)}→${formattedPrice}`);
                candle.low = formattedPrice;  // Update low price
            }
            candle.close = formattedPrice;    // Update closing price

            // Log any updates
            if (updates.length) {
                console.log(`[OHLC ${asset} ${tf}] Updated: ${updates.join(', ')}`);
            }
        }
    }
}

/** Finalize an OHLC candle and save it to file
 * @param {string} asset - Cryptocurrency name
 * @param {string} timeframe - Timeframe identifier
 * @param {Object} candle - Candle to finalize
 */
async function finalizeOhlc(asset, timeframe, candle) {
    if (!candle) return; // Skip if no candle to finalize

    // Log final OHLC values
    console.log(`[OHLC ${asset} ${timeframe}] Final: O=${candle.open} H=${candle.high} L=${candle.low} C=${candle.close} at ${candle.timestamp}`);
    await saveOhlcData(asset, timeframe, candle); // Save to file
}

/** Connect to Kraken WebSocket API for price data */
function connectKraken() {
    const ws = new WebSocket('wss://ws.kraken.com'); // Create WebSocket connection
    
    // Handle connection opening
    ws.on('open', () => {
        console.log('[KRAKEN] Connected');
        // Subscribe to ticker data for specified pairs
        ws.send(JSON.stringify({
            event: 'subscribe',
            pair: ['XBT/USD', 'ETH/USD', 'SOL/USD'],
            subscription: { name: 'ticker' }
        }));
    });

    // Handle incoming messages
    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        // Process ticker data if present
        if (Array.isArray(msg) && msg[1] && msg[1].c) {
            const price = parseFloat(msg[1].c[0]); // Extract closing price
            let asset; // Determine asset from pair
            switch (msg[3]) {
                case 'XBT/USD': asset = 'Bitcoin'; break;
                case 'ETH/USD': asset = 'Ethereum'; break;
                case 'SOL/USD': asset = 'Solana'; break;
            }
            if (asset) {
                console.log(`[KRAKEN] ${asset} Price: ${price}`);
                // Update OHLC with new price data
                updateOhlc({ price, asset, timestamp: new Date() });
            }
        }
    });

    // Handle WebSocket errors
    ws.on('error', (error) => console.error('[KRAKEN] Error:', error.message));
    // Handle connection close with automatic reconnect
    ws.on('close', () => {
        console.log('[KRAKEN] Disconnected, reconnecting...');
        setTimeout(connectKraken, 5000); // Reconnect after 5 seconds
    });

    return ws; // Return WebSocket instance
}

/** Connect to Coinbase WebSocket API for price data */
function connectCoinbase() {
    const ws = new WebSocket('wss://ws-feed.exchange.coinbase.com'); // Create WebSocket connection
    
    // Handle connection opening
    ws.on('open', () => {
        console.log('[COINBASE] Connected');
        // Subscribe to ticker channel for specified products
        ws.send(JSON.stringify({
            type: 'subscribe',
            product_ids: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
            channels: ['ticker']
        }));
    });

    // Handle incoming messages
    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        // Process ticker data if present
        if (msg.type === 'ticker' && msg.price) {
            const price = parseFloat(msg.price); // Extract price
            let asset; // Determine asset from product ID
            switch (msg.product_id) {
                case 'BTC-USD': asset = 'Bitcoin'; break;
                case 'ETH-USD': asset = 'Ethereum'; break;
                case 'SOL-USD': asset = 'Solana'; break;
            }
            if (asset) {
                console.log(`[COINBASE] ${asset} Price: ${price}`);
                // Update OHLC with new price data
                updateOhlc({ price, asset, timestamp: new Date() });
            }
        }
    });

    // Handle WebSocket errors
    ws.on('error', (error) => console.error('[COINBASE] Error:', error.message));
    // Handle connection close with automatic reconnect
    ws.on('close', () => {
        console.log('[COINBASE] Disconnected, reconnecting...');
        setTimeout(connectCoinbase, 5000); // Reconnect after 5 seconds
    });

    return ws; // Return WebSocket instance
}

/** Start WebSocket connections and initialize monitoring */
async function startPriceMonitoring() {
    await loadOhlcData(); // Load existing OHLC data first
    console.log('[SYSTEM] Starting price monitoring...');
    connectKraken();      // Start Kraken connection
    connectCoinbase();    // Start Coinbase connection
}

/** Handle graceful shutdown on SIGINT (Ctrl+C) */
process.on('SIGINT', async () => {
    console.log('\n[SYSTEM] Shutting down...');
    // Finalize all current candles before exit
    for (const [asset, assetFrames] of Object.entries(timeframes)) {
        for (const [tf, frame] of Object.entries(assetFrames)) {
            if (frame.current && frame.lastFinalized !== frame.current.timestamp) {
                await finalizeOhlc(asset, tf, frame.current);
                frame.current = null; // Clear current candle
            }
        }
    }
    process.exit(0); // Exit with success code
});

/** Handle uncaught exceptions to prevent crashes */
process.on('uncaughtException', (error) => {
    console.error('[FATAL] Uncaught exception:', error.stack);
    process.exit(1); // Exit with error code
});

// Start the monitoring process with error handling
startPriceMonitoring().catch(error => {
    console.error('[ERROR] Startup failed:', error.message);
    process.exit(1); // Exit if startup fails
});
