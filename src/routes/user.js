import express from 'express';
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';

const router = express.Router();

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

const cognito = new CognitoIdentityProviderClient();

// Middleware: Require admin group
function requireAdmin(req, res, next) {
  const groups = req.user && req.user['cognito:groups'];
  if (groups && groups.includes('admin')) return next();
  return res.status(403).json({ error: 'Admin access required' });
}

// GET /user/me - get current user profile (from JWT claims)
router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const groups = req.user['cognito:groups'] || [];
  const isAdmin = groups.includes('admin');
  res.json({ user: { ...req.user, isAdmin } });
});

// PUT /user/me - update user attributes (name, picture, etc.)
router.put('/me', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const { name, picture } = req.body;
  const attrs = [];
  if (name) attrs.push({ Name: 'name', Value: name });
  if (picture) attrs.push({ Name: 'picture', Value: picture });
  try {
    await cognito.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: req.user.sub,
      UserAttributes: attrs
    }));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /user/list - admin: list all users
// GET /user/list?nextToken=... - admin: list users with pagination
router.get('/list', requireAdmin, async (req, res) => {
  const { nextToken } = req.query;
  try {
    const params = { UserPoolId: USER_POOL_ID };
    if (nextToken) params.PaginationToken = nextToken;
    const result = await cognito.send(new ListUsersCommand(params));
    res.json({
      users: result.Users,
      nextToken: result.PaginationToken || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
