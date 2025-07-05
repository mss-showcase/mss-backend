import { requireAdmin } from './user.js';
import express from 'express';
import { ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
const dynamodb = new DynamoDBClient();
const FUNDAMENTALS_TABLE = process.env.FUNDAMENTALS_TABLE;

const router = express.Router();

// GET /fundamentals/:symbol - return latest fundamentals for a symbol
router.get('/:symbol', async (req, res) => {
  const { symbol } = req.params;

  if (!tickers.includes(symbol)) {
    return res.status(404).json({ error: 'Unknown symbol' });
  }

  try {
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

// GET /fundamentals/list?pageToken=... - admin only, paged fetch of all fundamentals
// Admin: paged fetch of all fundamentals
router.get('/all', requireAdmin, async (req, res) => {
  const { pageToken } = req.query;
  try {
    const params = { TableName: FUNDAMENTALS_TABLE };
    if (pageToken) params.ExclusiveStartKey = JSON.parse(Buffer.from(pageToken, 'base64').toString('utf-8'));
    const result = await dynamodb.send(new ScanCommand(params));
    const fundamentals = result.Items ? result.Items.map(unmarshall) : [];
    let nextPageToken = null;
    if (result.LastEvaluatedKey) {
      nextPageToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }
    res.json({ fundamentals, nextPageToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export default router;
