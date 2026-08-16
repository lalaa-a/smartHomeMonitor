import { Router } from 'express';
import { db } from '../config/firebaseAdmin.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertOwnership } from '../services/houseService.js';
import { alertParamsSchema } from '../validators/schemas.js';

const router = Router();

/** POST /api/houses/:houseId/alerts/:alertId/acknowledge */
router.post(
  '/houses/:houseId/alerts/:alertId/acknowledge',
  validate(alertParamsSchema, 'params'),
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { houseId, alertId } = req.params;
    await assertOwnership(houseId, req.uid);

    const alertRef = db.ref(`houses/${houseId}/alerts/${alertId}`);
    const snap = await alertRef.once('value');
    if (!snap.exists()) {
      return res.status(404).json({ error: 'Alert not found.' });
    }

    const acknowledgedAt = Date.now();
    await alertRef.update({
      acknowledged: true,
      acknowledgedAt,
      acknowledgedBy: req.uid,
    });

    res.json({ ok: true, alertId, acknowledged: true, acknowledgedAt });
  })
);

export default router;
