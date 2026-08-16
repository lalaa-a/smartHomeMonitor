import { auth } from '../config/firebaseAdmin.js';

/**
 * Verifies the `Authorization: Bearer <token>` header with Firebase Auth and
 * attaches `req.uid`. Rejects with 401 when the header is missing or invalid.
 */
export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Unauthorized: missing Bearer token.' });
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.uid = decodedToken.uid;
    return next();
  } catch (err) {
    console.warn('[auth] rejected token:', err.code ?? err.message);
    return res.status(401).json({ error: 'Unauthorized: invalid or expired token.' });
  }
}
