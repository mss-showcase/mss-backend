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

export default router;
