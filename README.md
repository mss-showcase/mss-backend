# mss-backend

This backend is a Node.js Lambda application using Express and DynamoDB to serve stock-related data and analysis for a frontend (e.g., React with lightweight-charts).

## Features

- **/stocks** — List supported stock tickers
- **/ticks/:symbol** — Get 30-minute interval price data for a symbol (with date/window filtering)
- **/fundamentals/:symbol** — Get latest fundamentals for a symbol

### Technical Analysis Endpoints
- **/analysis/ta/stockmarkers** — List all calculatable technical markers (e.g., MA, EMA, RSI, MACD, Bollinger Bands, Stochastic)
- **/analysis/ta/stockmarker/:ticker/:markerid** — Calculate and return marker data for a ticker (chart-compatible JSON)

### Aggregated Analysis & Explanations
- **/analysis/:ticker/explanation** — Returns a buy/sell/neutral suggestion with a breakdown of technical, sentiment, and fundamentals, including relevant article links and reasoning

### Sentiment & Fundamentals
- **/analysis/sentiment/:ticker** — Aggregates news sentiment for a ticker (weighted by recency)
- **/analysis/fundamentals/:ticker** — Returns a suggestion based on company fundamentals

## Data
- **TICKS_TABLE**: 30-minute OHLCV data for each ticker (last 30 days)
- **FUNDAMENTALS_TABLE**: Company fundamentals (latest per symbol)
- **DYNAMODB_SENTIMENT_ARTICLES_TABLE**: News articles with sentiment analysis, ticker tags, and metadata

## Development
- Endpoints are organized by route for maintainability (see `src/routes/`)
- All endpoints return JSON
- Designed for AWS Lambda/serverless deployment

## Example Usage

To get a 20-period moving average for AAPL:
```
GET /analysis/ta/stockmarker/AAPL/MA20
```
To get an explanation for a buy/sell suggestion:
```
GET /analysis/AAPL/explanation
```

