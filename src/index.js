import express from 'express';
import { ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import serverlessExpress from '@vendia/serverless-express';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];

const app = express();
const dynamodb = new DynamoDBClient();

const TICKS_TABLE = process.env.TICKS_TABLE;

// GET /stocks - return static list
app.get('/stocks', (req, res) => {
  res.json({ stocks: tickers });
});

// GET /ticks/:symbol?window=day|week|month&date=YYYY-MM-DD
app.get('/ticks/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const window = req.query.window || 'day';
  const dateParam = req.query.date; // Optional date in YYYY-MM-DD

  if (!tickers.includes(symbol)) {
    return res.status(404).json({ error: 'Unknown symbol' });
  }

  // Use provided date or now
  let now;
  if (dateParam) {
    // Parse dateParam as UTC midnight
    const parsed = new Date(dateParam + 'T00:00:00Z');
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    now = parsed;
  } else {
    now = new Date();
  }

  let fromDate = new Date(now);
  if (window === 'week') fromDate.setDate(now.getDate() - 7);
  else if (window === 'month') fromDate.setDate(now.getDate() - 30);
  else fromDate.setHours(0, 0, 0, 0); // today

  const fromTimestamp = fromDate.toISOString();

  try {
    let ticks = [];
    let ExclusiveStartKey;
    do {
      const result = await dynamodb.send(new ScanCommand({
        TableName: TICKS_TABLE,
        FilterExpression: '#symbol = :symbol AND #timestamp >= :from',
        ExpressionAttributeNames: {
          '#symbol': 'symbol',
          '#timestamp': 'timestamp',
        },
        ExpressionAttributeValues: {
          ':symbol': { S: symbol },
          ':from': { S: fromTimestamp },
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

export const handler = serverlessExpress({ app });