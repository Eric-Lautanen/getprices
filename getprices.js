process.removeAllListeners('warning');
import { Connection, PublicKey } from '@solana/web3.js';
import { readFile, writeFile, rename } from 'node:fs/promises';


const SESSION_HASH = `PRICES${Math.ceil(Math.random() * 1e9)}`;
const RPC_URL = 'https://solana-rpc.publicnode.com';
const WS_URL = 'WS_RPC_URL_LIKE_FREE_HELIUS_WORKS_GREAT';
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
let isSaving = {};

const streamToUSDC = lamports => lamports / 1e8;
const priceHandlers = [
    { prefix: 'pyth price:', label: 'Solana PythNet' },
    { prefix: 'doves ag price:', label: 'Solana Doves' }
];

function getIntervalStart(timestamp, intervalMs) {
    return new Date(Math.floor(timestamp.getTime() / intervalMs) * intervalMs);
}

function processPrice(logEntry, { prefix, label }) {
    if (!logEntry.includes(prefix)) return null;

    const priceString = logEntry.split(prefix)[1]?.split(',')[0]?.trim();
    if (!priceString || isNaN(priceString)) {
        console.log(`[PRICE] Invalid price format for ${label}: ${priceString}`);
        return null;
    }

    const price = Math.round((streamToUSDC(parseFloat(priceString))) * 100) / 100;
    return (price > 100 && price < 300) ? price : null;
}

async function loadOhlcData() {
    try {
        console.log('[INIT] Loading OHLC data...');
        
        for (const [tf, frame] of Object.entries(timeframes)) {
            try {
                const data = await readFile(frame.filename, 'utf8');
                if (data.trim() === '') {
                    console.log(`[INIT] ${frame.filename} is empty - starting fresh`);
                    frame.data = [];
                } else {
                    frame.data = JSON.parse(data || '[]');
                    if (!Array.isArray(frame.data)) {
                        console.warn(`[INIT] Invalid JSON in ${frame.filename} - resetting to empty array`);
                        frame.data = [];
                    }
                }
                console.log(`[INIT] Loaded ${tf}: ${frame.data.length} candle(s)`);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log(`[INIT] No ${frame.filename} found - starting fresh`);
                    frame.data = [];
                } else if (error instanceof SyntaxError) {
                    console.warn(`[INIT] Corrupted JSON in ${frame.filename} - starting fresh:`, error.message);
                    frame.data = [];
                } else {
                    console.error(`[ERROR] Loading ${frame.filename}:`, error.message);
                    frame.data = [];
                }
            }
            
            isSaving[tf] = false;
        }
    } catch (error) {
        console.error('[ERROR] Loading OHLC:', error.message);
    }
}

async function saveOhlcData(timeframe) {
    if (isSaving[timeframe]) {
        console.log(`[SAVE] Save already in progress for ${timeframe}, skipping`);
        return;
    }

    isSaving[timeframe] = true;
    const frame = timeframes[timeframe];
    
    try {
        if (frame.data.length === 0) {
            console.log(`[SAVE] No data to save for ${timeframe}`);
            return;
        }

        let existingData = [];
        try {
            const data = await readFile(frame.filename, 'utf8');
            if (data.trim() === '') {
                console.log(`[SAVE] Existing ${frame.filename} is empty - treating as new`);
            } else {
                existingData = JSON.parse(data);
                if (!Array.isArray(existingData)) {
                    console.warn(`[SAVE] Invalid JSON in ${frame.filename} - resetting to empty array`);
                    existingData = [];
                }
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`[SAVE] No existing ${frame.filename} - creating new`);
            } else if (error instanceof SyntaxError) {
                console.warn(`[SAVE] Corrupted JSON in ${frame.filename} - starting fresh:`, error.message);
            } else {
                throw error;
            }
        }

        const updatedData = existingData.concat(frame.data);
        
        const tempPath = `${frame.filename}.tmp`;
        await writeFile(tempPath, JSON.stringify(updatedData, null, 2));
        await rename(tempPath, frame.filename);
        console.log(`[SAVE] Successfully saved ${frame.data.length} candle to ${frame.filename}`);

        frame.data = [];
    } catch (error) {
        console.error(`[ERROR] Saving ${timeframe} OHLC:`, error.message);
    } finally {
        isSaving[timeframe] = false;
    }
}

async function updateOhlc(price) {
    const formattedPrice = parseFloat(price.toFixed(2));
    const now = new Date();

    for (const [tf, frame] of Object.entries(timeframes)) {
        const intervalStart = getIntervalStart(now, frame.interval);
        const intervalISO = intervalStart.toISOString();

        if (!frame.current || frame.current.timestamp !== intervalISO) {
            if (frame.current) {
                await finalizeOhlc(tf);
            }
            const prevClose = frame.current?.close || formattedPrice;
            frame.current = {
                timestamp: intervalISO,
                open: prevClose,
                high: prevClose,
                low: prevClose,
                close: prevClose
            };
            console.log(`[OHLC ${tf}] New candle: O=${prevClose.toFixed(2)}`);
        }

        const candle = frame.current;
        const updates = [];
        if (formattedPrice > candle.high) {
            updates.push(`High↑ ${candle.high.toFixed(2)}→${formattedPrice}`);
            candle.high = formattedPrice;
        }
        if (formattedPrice < candle.low) {
            updates.push(`Low↓ ${candle.low.toFixed(2)}→${formattedPrice}`);
            candle.low = formattedPrice;
        }
        candle.close = formattedPrice;

        if (updates.length) {
            console.log(`[OHLC ${tf}] Updated: ${updates.join(', ')}`);
        }
    }
}

async function finalizeOhlc(timeframe) {
    const frame = timeframes[timeframe];
    if (!frame.current) return;

    console.log(`[OHLC ${timeframe}] Final: O=${frame.current.open} H=${frame.current.high} L=${frame.current.low} C=${frame.current.close}`);

    const lastEntry = frame.data[frame.data.length - 1];
    if (lastEntry?.timestamp === frame.current.timestamp) {
        frame.data[frame.data.length - 1] = frame.current;
    } else {
        frame.data.push(frame.current);
    }

    if (frame.data.length >= MAX_BUFFER_SIZE) {
        await saveOhlcData(timeframe).catch(error => {
            console.error(`[ERROR] ${timeframe} buffer save failed:`, error.message);
        });
    } else {
        await saveOhlcData(timeframe).catch(error => {
            console.error(`[ERROR] ${timeframe} save failed:`, error.message);
        });
    }
}

async function initializeConnection() {
    let retries = 5;
    while (retries > 0) {
        try {
            const connection = new Connection(RPC_URL, {
                wsEndpoint: WS_URL,
                httpHeaders: { 'x-session-hash': SESSION_HASH },
                commitment: 'confirmed'
            });
            const version = await connection.getVersion();
            console.log('[CONNECTION] Connected:', version);
            return connection;
        } catch (error) {
            retries--;
            console.error(`[CONNECTION] Error (${retries} left):`, error.message);
            if (retries === 0) throw error;
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

async function monitorLogs() {
    let connection;
    try {
        connection = await initializeConnection();
        await loadOhlcData();

        console.log('[SYSTEM] Starting price monitoring...');
        const subscriptionId = connection.onLogs(
            publicKey,
            ({ logs, err }) => {
                const prices = logs.flatMap(log => 
                    priceHandlers.map(h => processPrice(log, h)).filter(p => p !== null)
                );
                if (prices.length) {
                    const finalPrice = prices.length > 1 
                        ? prices.reduce((sum, p) => sum + p, 0) / prices.length
                        : prices[0];
                    updateOhlc(finalPrice);
                }
            },
            'confirmed'
        );
        console.log('[SYSTEM] Subscription ID:', subscriptionId);
    } catch (error) {
        console.error('[ERROR] Monitor failed:', error.message);
        console.log('[SYSTEM] Retrying in 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        await monitorLogs();
    }
}

process.on('SIGINT', async () => {
    console.log('\n[SYSTEM] Shutting down...');
    for (const tf of Object.keys(timeframes)) {
        await finalizeOhlc(tf);
        await saveOhlcData(tf);
    }
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('[FATAL] Uncaught exception:', error.stack);
    process.exit(1);
});

monitorLogs().catch(error => {
    console.error('[ERROR] Startup failed:', error.message);
    process.exit(1);
});
