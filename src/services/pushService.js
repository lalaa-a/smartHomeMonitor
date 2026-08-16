import { db, messaging } from '../config/firebaseAdmin.js';

/**
 * Sends a safety push notification to every FCM token registered under
 * /houses/{houseId}/fcmTokens. Never throws: a push failure must not break
 * the safety-cutoff flow, so errors are caught, logged, and returned.
 *
 * @param {string} houseId
 * @param {object} alert alert node, e.g. { alertId, deviceId, floorId, message, severity }
 * @returns {Promise<{ sent: number, failureCount?: number, error?: string }>}
 */
export async function sendSafetyPush(houseId, alert) {
  try {
    const snap = await db.ref(`houses/${houseId}/fcmTokens`).once('value');
    const tokens = Object.values(snap.val() ?? {}).filter(
      (t) => typeof t === 'string' && t.length > 0
    );

    if (tokens.length === 0) {
      return { sent: 0, failureCount: 0 };
    }

    const result = await messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: 'Safety cutoff triggered',
        body: alert.message ?? `Safety device ${alert.deviceId} was force-turned-off.`,
      },
      data: {
        type: 'SAFETY_CUTOFF',
        severity: 'critical',
        houseId,
        alertId: alert.alertId ?? '',
        deviceId: alert.deviceId ?? '',
      },
    });

    // Prune tokens that are no longer valid so future pushes stay clean.
    if (result.failureCount > 0) {
      const invalidTokens = result.responses
        .map((r, i) => (r.success ? null : tokens[i]))
        .filter((t) => typeof t === 'string');

      const current = await db.ref(`houses/${houseId}/fcmTokens`).once('value');
      for (const [key, value] of Object.entries(current.val() ?? {})) {
        if (invalidTokens.includes(value)) {
          await db.ref(`houses/${houseId}/fcmTokens/${key}`).remove();
        }
      }
    }

    return { sent: result.successCount, failureCount: result.failureCount };
  } catch (err) {
    console.error('[push] sendSafetyPush failed:', err.message);
    return { sent: 0, failureCount: 0, error: err.message };
  }
}
