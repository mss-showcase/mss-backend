import express from 'express';
import { ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import serverlessExpress from '@vendia/serverless-express';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];

const app = express();
const dynamodb = new DynamoDBClient();

  
const TICKS_TABLE = process.env.TICKS_TABLE;
const FUNDAMENTALS_TABLE = process.env.FUNDAMENTALS_TABLE;

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

  let fromDate, toDate;

  if (dateParam) {
    // Parse dateParam as UTC midnight
    const parsed = new Date(dateParam + 'T00:00:00Z');
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    fromDate = new Date(parsed);
    if (window === 'week') {
      toDate = new Date(parsed);
      toDate.setDate(toDate.getDate() + 6); // 7 days total: date + 6
    } else if (window === 'month') {
      toDate = new Date(parsed);
      toDate.setDate(toDate.getDate() + 29); // 30 days total: date + 29
    } else {
      // day
      toDate = new Date(parsed);
      toDate.setHours(23, 59, 59, 999);
    }
  } else {
    // No date param: use now as end, subtract window for start
    toDate = new Date();
    fromDate = new Date(toDate);
    if (window === 'week') {
      fromDate.setDate(toDate.getDate() - 6); // last 7 days including today
    } else if (window === 'month') {
      fromDate.setDate(toDate.getDate() - 29); // last 30 days including today
    } else {
      // day
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

// GET /fundamentals/:symbol - return latest fundamentals for a symbol
app.get('/fundamentals/:symbol', async (req, res) => {
  const { symbol } = req.params;

  if (!tickers.includes(symbol)) {
    return res.status(404).json({ error: 'Unknown symbol' });
  }

  try {
    // Scan for all fundamentals for the symbol
    const result = await dynamodb.send(new ScanCommand({
      TableName: FUNDAMENTALS_TABLE,
      FilterExpression: '#symbol = :symbol',
      ExpressionAttributeNames: {
        '#symbol': 'symbol',
      },
      ExpressionAttributeValues: {
        ':symbol': { S: symbol },
      },
    }));

    if (!result.Items || result.Items.length === 0) {
      return res.status(404).json({ error: 'No fundamentals found for this symbol' });
    }

    // Find the item with the latest as_of date
    // I will not use indexed column here, the data is kept until a month (see the TTL in the table definition and the ttl value at PutRequest)
    const fundamentals = result.Items
      .map(unmarshall)
      .reduce((latest, item) => {
        if (!latest) return item;
        return new Date(item.as_of) > new Date(latest.as_of) ? item : latest;
      }, null);

    res.json({ symbol, fundamentals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export const handler = serverlessExpress({ app });