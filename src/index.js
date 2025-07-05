import express from 'express';
import stocksHandler from './routes/stocks.js';
import ticksHandler from './routes/ticks.js';
import fundamentalsHandler from './routes/fundamentals.js';
import analysisExplanationHandler from './routes/analysis-explanation.js';
import taHandler from './routes/ta.js';
import userHandler from './routes/user.js';
import authHandler, { authenticateJWT } from './routes/auth.js';
import serverlessExpress from '@vendia/serverless-express';

const app = express();

// Parse JSON bodies
app.use(express.json());

// Register endpoints
app.use('/stocks', stocksHandler);
app.use('/ticks', ticksHandler);
app.use('/fundamentals', fundamentalsHandler);

// Auth endpoints (register, login, logout)
app.use('/auth', authHandler);

// User endpoints (profile, admin user management) - protected
app.use('/user', authenticateJWT, userHandler);

// New: /analysis/:ticker/explanation
app.use('/analysis', analysisExplanationHandler);

// Technical analysis endpoints
app.use('/analysis/ta', taHandler);

export const handler = serverlessExpress({ app });