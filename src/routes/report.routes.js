import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { db } from '../config/firebaseAdmin.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertOwnership } from '../services/houseService.js';
import { aggregateUsage } from '../services/reportService.js';
import { houseIdParamsSchema, reportQuerySchema } from '../validators/schemas.js';

const router = Router();

// Heaviest query — keep it cheap to reject. In-memory, per-IP.
const reportRateLimit = rateLimit({
  windowMs: Number(process.env.REPORT_RATE_LIMIT_WINDOW_MS ?? 60_000),
  limit: Number(process.env.REPORT_RATE_LIMIT_MAX ?? 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/**
 * GET /api/houses/:houseId/report?from=&to=
 * Aggregates usageLogs into { deviceId: totalOnMinutes } for the given window.
 */
router.get(
  '/houses/:houseId/report',
  reportRateLimit,
  authMiddleware,
  validate(houseIdParamsSchema, 'params'),
  validate(reportQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { houseId } = req.params;
    const { from, to } = req.query;

    await assertOwnership(houseId, req.uid);

    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();

    const snap = await db.ref(`houses/${houseId}/usageLogs`).once('value');
    const logs = Object.values(snap.val() ?? {});

    const usage = aggregateUsage(logs, fromMs, toMs);
    res.json({ houseId, from, to, usage });
  })
);

export default router;
