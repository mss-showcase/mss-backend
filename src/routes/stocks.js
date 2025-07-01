import express from 'express';

const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];

const router = express.Router();

// GET /stocks - return static list
router.get('/', (req, res) => {
  res.json({ stocks: tickers });
});

export default router;
