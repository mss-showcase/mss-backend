import express from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const router = express.Router();

const COGNITO_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const REGION = process.env.AWS_REGION;
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${COGNITO_POOL_ID}`;

const client = jwksClient({
  jwksUri: `${ISSUER}/.well-known/jwks.json`
});

// Middleware: verify JWT and attach user to req
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, getKey, { issuer: ISSUER }, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
}

function getKey(header, callback) {
  client.getSigningKey(header.kid, function(err, key) {
    if (err) return callback(err);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

// POST /auth/register - handled by Cognito Hosted UI or frontend
router.post('/register', (req, res) => {
  res.status(501).json({ error: 'Use Cognito Hosted UI or frontend SDK for registration.' });
});

// POST /auth/login - handled by Cognito Hosted UI or frontend
router.post('/login', (req, res) => {
  res.status(501).json({ error: 'Use Cognito Hosted UI or frontend SDK for login.' });
});

// POST /auth/logout - handled by frontend (clear tokens)
router.post('/logout', (req, res) => {
  res.status(200).json({ success: true });
});

export { authenticateJWT };
export default router;
