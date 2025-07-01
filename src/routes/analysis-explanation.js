import express from 'express';
import { ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
const dynamodb = new DynamoDBClient();
const TICKS_TABLE = process.env.TICKS_TABLE;
const FUNDAMENTALS_TABLE = process.env.FUNDAMENTALS_TABLE;
const SENTIMENT_TABLE = process.env.DYNAMODB_SENTIMENT_ARTICLES_TABLE;

const router = express.Router();

// Helper: Dummy TA analysis (replace with real logic)
function getTAScore(ticks) {
  // Example: if last close < 30, oversold
  if (!ticks || ticks.length < 20) return { score: 0, marker: 'RSI', value: null, explanation: 'Not enough data' };
  const rsi = 28; // Dummy value
  let score = 0, explanation = '';
  if (rsi < 30) { score = 2; explanation = 'RSI is below 30 (oversold)'; }
  else if (rsi > 70) { score = -2; explanation = 'RSI is above 70 (overbought)'; }
  else { score = 0; explanation = 'RSI is neutral'; }
  return { score, marker: 'RSI', value: rsi, explanation };
}

// Helper: Dummy fundamentals analysis (replace with real logic)
function getFundamentalsScore(fundamentals) {
  if (!fundamentals) return { score: 0, explanation: 'No fundamentals' };
  // Example: strong earnings growth
  return { score: 1, explanation: 'Earnings growth is strong' };
}

// Helper: Sentiment aggregation
function aggregateSentiment(articles) {
  if (!articles || articles.length === 0) return { score: 0, explanation: 'No articles', articles: [] };
  // Weight by recency (simple: last 7 days = 2x, last 30 days = 1x, older = 0.5x)
  const now = new Date();
  let total = 0, count = 0;
  for (const a of articles) {
    const pub = new Date(a.pubdate);
    let weight = 0.5;
    if ((now - pub) / (1000*60*60*24) <= 7) weight = 2;
    else if ((now - pub) / (1000*60*60*24) <= 30) weight = 1;
    total += (a.sentiment_label === 'positive' ? 1 : a.sentiment_label === 'negative' ? -1 : 0) * weight;
    count += weight;
  }
  const avg = total / count;
  let score = 0, explanation = '';
  if (avg > 0.5) { score = 2; explanation = 'Recent articles are mostly positive'; }
  else if (avg > 0.1) { score = 1; explanation = 'Articles are somewhat positive'; }
  else if (avg < -0.5) { score = -2; explanation = 'Recent articles are mostly negative'; }
  else if (avg < -0.1) { score = -1; explanation = 'Articles are somewhat negative'; }
  else { score = 0; explanation = 'Articles are neutral'; }
  return { score, explanation, articles };
}

// Helper: Final suggestion
function getFinalSuggestion(totalScore) {
  if (totalScore >= 1.5) return 'strong buy';
  if (totalScore >= 0.5) return 'buy';
  if (totalScore > -0.5) return 'neutral';
  if (totalScore > -1.5) return 'sell';
  return 'strong sell';
}

// GET /analysis/:ticker/explanation
router.get('/:ticker/explanation', async (req, res) => {
  const { ticker } = req.params;
  if (!tickers.includes(ticker)) {
    return res.status(404).json({ error: 'Unknown symbol' });
  }
  try {
    // 1. Get TICKS for TA
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
    // 2. Get Fundamentals
    const fundamentalsResult = await dynamodb.send(new ScanCommand({
      TableName: FUNDAMENTALS_TABLE,
      FilterExpression: '#symbol = :symbol',
      ExpressionAttributeNames: { '#symbol': 'symbol' },
      ExpressionAttributeValues: { ':symbol': { S: ticker } },
    }));
    const fundamentals = fundamentalsResult.Items && fundamentalsResult.Items.length > 0
      ? fundamentalsResult.Items.map(unmarshall).reduce((latest, item) => {
          if (!latest) return item;
          return new Date(item.as_of) > new Date(latest.as_of) ? item : latest;
        }, null)
      : null;
    // 3. Get Sentiment articles
    const sentimentResult = await dynamodb.send(new ScanCommand({
      TableName: SENTIMENT_TABLE,
      FilterExpression: 'contains(#tickers, :ticker)',
      ExpressionAttributeNames: { '#tickers': 'tickers' },
      ExpressionAttributeValues: { ':ticker': { S: ticker } },
    }));
    const articles = sentimentResult.Items ? sentimentResult.Items.map(unmarshall) : [];
    // 4. Score each
    const ta = getTAScore(ticks);
    const fundamentalsScore = getFundamentalsScore(fundamentals);
    const sentiment = aggregateSentiment(articles);
    // 5. Weighted sum
    const weights = { ta: 0.4, sentiment: 0.3, fundamentals: 0.3 };
    const totalScore = ta.score * weights.ta + sentiment.score * weights.sentiment + fundamentalsScore.score * weights.fundamentals;
    const finalSuggestion = getFinalSuggestion(totalScore);
    res.json({
      ticker,
      finalSuggestion,
      breakdown: {
        ta,
        sentiment: {
          score: sentiment.score,
          explanation: sentiment.explanation,
          articles: articles.map(a => ({
            title: a.title,
            url: a.url,
            pubdate: a.pubdate,
            sentiment_label: a.sentiment_label,
            sentiment_score: a.sentiment_score
          }))
        },
        fundamentals: fundamentalsScore
      },
      weights,
      totalScore
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
