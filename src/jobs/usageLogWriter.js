import { db } from '../config/firebaseAdmin.js';

/**
 * In-memory cache of the last seen state per device path. RTDB child callbacks
 * do not expose the previous value, so we diff against this to detect
 * ON<->OFF/ERROR transitions and compute durations server-side.
 */
const deviceStates = new Map();

/** Only these transitions produce a usageLogs entry (see schema). */
function resolveEvent(prev, current, currentStatus) {
  if (currentStatus === 'ON' && prev.status !== 'ON') return 'ON';

  if (currentStatus === 'ERROR') return 'ERROR';

  if (currentStatus === 'OFF' && prev.status === 'ON') {
    // AUTO_OFF is detected when the cutoff flag just flipped (transitioned
    // false->true) on this exact write, so a manual OFF later is not mislabeled.
    const cutoffFired =
      current?.autoOffTriggered === true && prev.autoOffTriggered !== true;
    return cutoffFired ? 'AUTO_OFF' : 'OFF';
  }

  return null;
}

function computeDurationMinutes(prev) {
  const since = prev?.turnedOnAt ?? prev?.lastUpdatedAt;
  if (typeof since !== 'number' || !Number.isFinite(since) || since <= 0) return null;
  const minutes = Math.max(0, Math.round((Date.now() - since) / 60_000));
  return minutes > 0 ? minutes : null;
}

async function logTransition(houseId, deviceId, prev, current, event) {
  const entry = {
    deviceId,
    event,
    timestamp: Date.now(),
  };

  const durationMinutes = computeDurationMinutes(prev);
  if (durationMinutes !== null) entry.durationMinutes = durationMinutes;

  await db.ref(`houses/${houseId}/usageLogs`).push(entry);
}

function processDevice(houseId, floorId, deviceId, device) {
  const path = `houses/${houseId}/floors/${floorId}/devices/${deviceId}`;
  const status = device?.status ?? null;
  const prev = deviceStates.get(path);

  // Update the cache first so concurrent events cannot observe a stale state.
  deviceStates.set(path, {
    status,
    lastUpdatedAt: device?.lastUpdatedAt ?? null,
    turnedOnAt: device?.turnedOnAt ?? null,
    autoOffTriggered: device?.autoOffTriggered === true,
  });

  if (prev && prev.status !== null && status !== null && prev.status !== status) {
    const event = resolveEvent(prev, device, status);
    if (event) {
      void logTransition(houseId, deviceId, prev, device, event).catch((err) =>
        console.error(`[usageLog] failed to log ${path}:`, err)
      );
    }
  }
}

function handleHouseSnapshot(house, houseId) {
  const floors = house?.floors ?? {};
  for (const [floorId, floor] of Object.entries(floors)) {
    const devices = floor?.devices ?? {};
    for (const [deviceId, device] of Object.entries(devices)) {
      processDevice(houseId, floorId, deviceId, device);
    }
  }
}

/**
 * Watches every device status change and appends usageLogs entries. Attaching
 * child_added seeds the cache with all existing houses (RTDB delivers existing
 * children before any subsequent child_changed), so no separate bootstrap is
 * needed. Returns a stop function for clean shutdown.
 */
export function startUsageLogWriter() {
  const housesRef = db.ref('houses');
  const onAdded = (snap) => handleHouseSnapshot(snap.val(), snap.key);
  const onChanged = (snap) => handleHouseSnapshot(snap.val(), snap.key);

  housesRef.on('child_added', onAdded);
  housesRef.on('child_changed', onChanged);

  console.log('[usageLog] writer started (watching houses/*).');

  return () => {
    housesRef.off('child_added', onAdded);
    housesRef.off('child_changed', onChanged);
    console.log('[usageLog] writer stopped.');
  };
}
