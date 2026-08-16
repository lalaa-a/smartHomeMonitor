import { Router } from 'express';
import { db } from '../config/firebaseAdmin.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertOwnership } from '../services/houseService.js';

const router = Router();

/** GET /api/houses/:houseId — full house node (floors, devices, alerts). Ownership-checked. */
router.get(
  '/houses/:houseId',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { houseId } = req.params;
    await assertOwnership(houseId, req.uid);

    const snap = await db.ref(`houses/${houseId}`).once('value');
    res.json({ houseId, ...snap.val() });
  })
);

export default router;
