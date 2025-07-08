// Common middleware to require Cognito admin group (works with API Gateway v2 JWT authorizer)
export function requireAdmin(req, res, next) {
  // If req.user is not set, try to extract from API Gateway v2 event
  if (!req.user && req.apiGateway && req.apiGateway.event && req.apiGateway.event.requestContext && req.apiGateway.event.requestContext.authorizer && req.apiGateway.event.requestContext.authorizer.jwt && req.apiGateway.event.requestContext.authorizer.jwt.claims) {
    req.user = req.apiGateway.event.requestContext.authorizer.jwt.claims;
  }
  const groups = req.user && (req.user['cognito:groups'] || req.user['cognito:groups']);
  if (groups && (Array.isArray(groups) ? groups.includes('admin') : groups === 'admin')) return next();
  return res.status(403).json({ error: 'Admin access required' });
}
