import express from 'express';
import { ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
const dynamodb = new DynamoDBClient();
const TICKS_TABLE = process.env.TICKS_TABLE;

const router = express.Router();

// GET /ticks/:symbol?window=day|week|month&date=YYYY-MM-DD
router.get('/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const window = req.query.window || 'day';
  const dateParam = req.query.date;

  if (!tickers.includes(symbol)) {
    return res.status(404).json({ error: 'Unknown symbol' });
  }

  let fromDate, toDate;

  if (dateParam) {
    const parsed = new Date(dateParam + 'T00:00:00Z');
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    fromDate = new Date(parsed);
    if (window === 'week') {
      toDate = new Date(parsed);
      toDate.setDate(toDate.getDate() + 6);
    } else if (window === 'month') {
      toDate = new Date(parsed);
      toDate.setDate(toDate.getDate() + 29);
    } else {
      toDate = new Date(parsed);
      toDate.setHours(23, 59, 59, 999);
    }
  } else {
    toDate = new Date();
    fromDate = new Date(toDate);
    if (window === 'week') {
      fromDate.setDate(toDate.getDate() - 6);
    } else if (window === 'month') {
      fromDate.setDate(toDate.getDate() - 29);
    } else {
      fromDate.setHours(0, 0, 0, 0);
    }
  }

  const fromTimestamp = fromDate.toISOString();
  const toTimestamp = toDate.toISOString();

  try {
    let ticks = [];
    let ExclusiveStartKey;
    do {
      const result = await dynamodb.send(new ScanCommand({
        TableName: TICKS_TABLE,
        FilterExpression: '#symbol = :symbol AND #timestamp BETWEEN :from AND :to',
        ExpressionAttributeNames: {
          '#symbol': 'symbol',
          '#timestamp': 'timestamp',
        },
        ExpressionAttributeValues: {
          ':symbol': { S: symbol },
          ':from': { S: fromTimestamp },
          ':to': { S: toTimestamp },
        },
        ExclusiveStartKey,
      }));
      ticks.push(...result.Items.map(unmarshall));
      ExclusiveStartKey = result.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    res.json({ symbol, ticks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
