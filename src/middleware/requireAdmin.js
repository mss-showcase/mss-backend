// Common middleware to require Cognito admin group
export function requireAdmin(req, res, next) {
  const groups = req.user && req.user['cognito:groups'];
  if (groups && groups.includes('admin')) return next();
  return res.status(403).json({ error: 'Admin access required' });
}
