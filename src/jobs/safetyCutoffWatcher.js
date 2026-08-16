import { db } from '../config/firebaseAdmin.js';
import { sendSafetyPush } from '../services/pushService.js';

export const SAFETY_CUTOFF_INTERVAL_MS = 30_000;

let running = false;

/**
 * Scans every house/floor/device once. Any safety_slot that is ON and has
 * exceeded maxOnDurationMinutes is force-turned OFF via the admin SDK
 * (bypassing any client security rules), logged as a critical alert, and
 * pushed to registered FCM tokens.
 */
export async function runSafetyCutoffCheck() {
  const housesSnap = await db.ref('houses').once('value');
  if (!housesSnap.exists()) return;

  for (const [houseId, house] of Object.entries(housesSnap.val())) {
    const floors = house?.floors;
    if (!floors) continue;

    for (const [floorId, floor] of Object.entries(floors)) {
      const devices = floor?.devices;
      if (!devices) continue;

      for (const [deviceId, device] of Object.entries(devices)) {
        if (device?.type !== 'safety_slot' || device.status !== 'ON') continue;
        await evaluateSafetyDevice(houseId, floorId, deviceId, device);
      }
    }
  }
}

async function evaluateSafetyDevice(houseId, floorId, deviceId, device) {
  const maxOnMinutes = Number(device.maxOnDurationMinutes);
  if (!Number.isFinite(maxOnMinutes) || maxOnMinutes <= 0) {
    console.warn(
      `[safetyCutoff] ${deviceId} has invalid maxOnDurationMinutes, skipping.`
    );
    return;
  }

  const turnedOnAt = Number(device.turnedOnAt);
  if (!Number.isFinite(turnedOnAt) || turnedOnAt <= 0) {
    console.warn(
      `[safetyCutoff] ${deviceId} is ON without a valid turnedOnAt, skipping.`
    );
    return;
  }

  const now = Date.now();
  const elapsed = now - turnedOnAt;
  const maxMs = maxOnMinutes * 60_000;

  // Not yet over the limit (or clock skew puts turnedOnAt in the future).
  if (elapsed < maxMs) return;

  const deviceRef = db.ref(`houses/${houseId}/floors/${floorId}/devices/${deviceId}`);
  await deviceRef.update({
    status: 'OFF',
    autoOffTriggered: true,
    lastUpdatedAt: now,
    lastUpdatedBy: 'system',
  });

  const alertRef = db.ref(`houses/${houseId}/alerts`).push();
  const alert = {
    deviceId,
    floorId,
    message: `Safety slot "${device.label ?? deviceId}" auto-off: max on duration (${maxOnMinutes} min) exceeded.`,
    severity: 'critical',
    createdAt: now,
    acknowledged: false,
  };
  await alertRef.set(alert);

  console.warn(
    `[safetyCutoff] ${deviceId} auto-off after ${Math.round(elapsed / 60_000)} min.`
  );

  await sendSafetyPush(houseId, { alertId: alertRef.key, ...alert });
}

/**
 * Starts the 30s cutoff loop. Runs one check immediately, then on a fixed
 * interval. Overlapping runs are skipped if the previous one is still going.
 */
export function startSafetyCutoffWatcher(intervalMs = SAFETY_CUTOFF_INTERVAL_MS) {
  void runSafetyCutoffCheck().catch((err) =>
    console.error('[safetyCutoff] initial check failed:', err)
  );

  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runSafetyCutoffCheck()
      .catch((err) => console.error('[safetyCutoff] check failed:', err))
      .finally(() => {
        running = false;
      });
  }, intervalMs);

  timer.unref?.();
  console.log(`[safetyCutoff] watcher started (every ${intervalMs / 1000}s).`);
  return timer;
}
