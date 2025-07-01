import express from 'express';
import { ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
const dynamodb = new DynamoDBClient();
const TICKS_TABLE = process.env.TICKS_TABLE;

const router = express.Router();

// List of supported markers
const supportedMarkers = [
  { id: 'MA5', name: 'Moving Average 5' },
  { id: 'MA10', name: 'Moving Average 10' },
  { id: 'MA20', name: 'Moving Average 20' },
  { id: 'EMA5', name: 'Exponential Moving Average 5' },
  { id: 'EMA10', name: 'Exponential Moving Average 10' },
  { id: 'EMA20', name: 'Exponential Moving Average 20' },
  { id: 'RSI', name: 'Relative Strength Index (14)' },
  { id: 'MACD', name: 'MACD (12,26,9)' },
  { id: 'BBANDS', name: 'Bollinger Bands (20,2)' },
  { id: 'STOCH', name: 'Stochastic Oscillator (14,3,3)' }
];
// Helper: Calculate EMA
function calculateEMA(ticks, period) {
  const result = [];
  let k = 2 / (period + 1);
  let emaPrev = null;
  for (let i = 0; i < ticks.length; i++) {
    const close = ticks[i].close || 0;
    if (i < period - 1) continue;
    if (emaPrev === null) {
      // First EMA is just SMA
      const sma = ticks.slice(i - period + 1, i + 1).reduce((sum, t) => sum + (t.close || 0), 0) / period;
      emaPrev = sma;
    } else {
      emaPrev = close * k + emaPrev * (1 - k);
    }
    result.push({ time: ticks[i].timestamp, value: emaPrev });
  }
  return result;
}

// Helper: Calculate MACD (12,26,9)
function calculateMACD(ticks) {
  const ema12 = calculateEMA(ticks, 12);
  const ema26 = calculateEMA(ticks, 26);
  // Align ema12 and ema26 by time
  const macdLine = [];
  for (let i = 0; i < ema12.length; i++) {
    const idx26 = ema26.findIndex(e => e.time === ema12[i].time);
    if (idx26 !== -1) {
      macdLine.push({ time: ema12[i].time, value: ema12[i].value - ema26[idx26].value });
    }
  }
  // Signal line (9-period EMA of MACD line)
  const signalLine = calculateEMA(macdLine, 9);
  // Histogram
  const histogram = macdLine.slice(-signalLine.length).map((m, i) => ({
    time: m.time,
    value: m.value - signalLine[i].value
  }));
  return { macd: macdLine, signal: signalLine, histogram };
}

// Helper: Calculate Bollinger Bands (20,2)
function calculateBBANDS(ticks, period = 20, stdDev = 2) {
  const result = [];
  for (let i = period - 1; i < ticks.length; i++) {
    const slice = ticks.slice(i - period + 1, i + 1);
    const avg = slice.reduce((sum, t) => sum + (t.close || 0), 0) / period;
    const variance = slice.reduce((sum, t) => sum + Math.pow((t.close || 0) - avg, 2), 0) / period;
    const std = Math.sqrt(variance);
    result.push({
      time: ticks[i].timestamp,
      upper: avg + stdDev * std,
      middle: avg,
      lower: avg - stdDev * std
    });
  }
  return result;
}

// Helper: Calculate Stochastic Oscillator (14,3,3)
function calculateSTOCH(ticks, kPeriod = 14, dPeriod = 3) {
  const kValues = [];
  for (let i = kPeriod - 1; i < ticks.length; i++) {
    const slice = ticks.slice(i - kPeriod + 1, i + 1);
    const high = Math.max(...slice.map(t => t.high || 0));
    const low = Math.min(...slice.map(t => t.low || 0));
    const close = ticks[i].close || 0;
    const k = high === low ? 0 : ((close - low) / (high - low)) * 100;
    kValues.push({ time: ticks[i].timestamp, value: k });
  }
  // D line: SMA of K
  const dValues = [];
  for (let i = dPeriod - 1; i < kValues.length; i++) {
    const slice = kValues.slice(i - dPeriod + 1, i + 1);
    const avg = slice.reduce((sum, t) => sum + t.value, 0) / dPeriod;
    dValues.push({ time: kValues[i].time, value: avg });
  }
  return { k: kValues, d: dValues };
}

// GET /analysis/ta/stockmarkers - list available markers
router.get('/stockmarkers', (req, res) => {
  res.json({ markers: supportedMarkers });
});

// Helper: Calculate moving average
function calculateMA(ticks, period) {
  const result = [];
  for (let i = period - 1; i < ticks.length; i++) {
    const slice = ticks.slice(i - period + 1, i + 1);
    const avg = slice.reduce((sum, t) => sum + (t.close || 0), 0) / period;
    result.push({ time: ticks[i].timestamp, value: avg });
  }
  return result;
}

// Helper: Calculate RSI (simple version)
function calculateRSI(ticks, period = 14) {
  const result = [];
  for (let i = period; i < ticks.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = (ticks[j].close || 0) - (ticks[j - 1].close || 0);
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    result.push({ time: ticks[i].timestamp, value: rsi });
  }
  return result;
}

// GET /analysis/ta/stockmarker/:ticker/:markerid - calculate marker
router.get('/stockmarker/:ticker/:markerid', async (req, res) => {
  const { ticker, markerid } = req.params;
  if (!tickers.includes(ticker)) {
    return res.status(404).json({ error: 'Unknown symbol' });
  }
  if (!supportedMarkers.find(m => m.id === markerid)) {
    return res.status(400).json({ error: 'Unknown marker' });
  }
  try {
    // Get all ticks for ticker
    let ticks = [];
    let ExclusiveStartKey;
    do {
      const result = await dynamodb.send(new ScanCommand({
        TableName: TICKS_TABLE,
        FilterExpression: '#symbol = :symbol',
        ExpressionAttributeNames: { '#symbol': 'symbol' },
        ExpressionAttributeValues: { ':symbol': { S: ticker } },
        ExclusiveStartKey,
      }));
      ticks.push(...result.Items.map(unmarshall));
      ExclusiveStartKey = result.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    // Sort by timestamp ascending
    ticks.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    let series = [];
    if (markerid.startsWith('MA')) {
      const period = parseInt(markerid.replace('MA', ''));
      if (ticks.length < period) {
        return res.status(400).json({ error: 'Not enough data for this marker' });
      }
      series = calculateMA(ticks, period);
      return res.json({ symbol: ticker, marker: markerid, series });
    } else if (markerid.startsWith('EMA')) {
      const period = parseInt(markerid.replace('EMA', ''));
      if (ticks.length < period) {
        return res.status(400).json({ error: 'Not enough data for this marker' });
      }
      series = calculateEMA(ticks, period);
      return res.json({ symbol: ticker, marker: markerid, series });
    } else if (markerid === 'RSI') {
      if (ticks.length < 15) {
        return res.status(400).json({ error: 'Not enough data for RSI' });
      }
      series = calculateRSI(ticks);
      return res.json({ symbol: ticker, marker: markerid, series });
    } else if (markerid === 'MACD') {
      if (ticks.length < 35) {
        return res.status(400).json({ error: 'Not enough data for MACD' });
      }
      const macd = calculateMACD(ticks);
      return res.json({ symbol: ticker, marker: markerid, macd });
    } else if (markerid === 'BBANDS') {
      if (ticks.length < 20) {
        return res.status(400).json({ error: 'Not enough data for Bollinger Bands' });
      }
      const bands = calculateBBANDS(ticks);
      return res.json({ symbol: ticker, marker: markerid, bands });
    } else if (markerid === 'STOCH') {
      if (ticks.length < 17) {
        return res.status(400).json({ error: 'Not enough data for Stochastic Oscillator' });
      }
      const stoch = calculateSTOCH(ticks);
      return res.json({ symbol: ticker, marker: markerid, stoch });
    } else {
      return res.status(400).json({ error: 'Marker not implemented' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
