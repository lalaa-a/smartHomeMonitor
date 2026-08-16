import { db } from '../config/firebaseAdmin.js';

export const LIGHT_SCHEDULE_INTERVAL_MS = 60_000;

let running = false;

/**
 * Computes the current HH:mm in a given IANA timezone. Uses hourCycle 'h23'
 * so midnight is always "00" (not "24") regardless of locale.
 */
function getCurrentTime(tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: tz,
  }).formatToParts(new Date());

  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

/**
 * Supports both same-day windows (09:00-17:00) and overnight windows
 * (22:00-06:00) using lexicographic comparison on zero-padded HH:mm.
 */
function isWithinSchedule(now, start, end) {
  if (start === end) return now === start;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

/**
 * One scan: flips each light with scheduleEnabled=true to ON/OFF when its
 * current status does not match the house-local schedule. Devices in
 * ERROR/DISCONNECTED are left untouched so a fault is never masked.
 */
export async function runLightScheduleScan() {
  const housesSnap = await db.ref('houses').once('value');
  if (!housesSnap.exists()) return;

  for (const [houseId, house] of Object.entries(housesSnap.val())) {
    const floors = house?.floors;
    if (!floors) continue;

    const tz = typeof house?.timezone === 'string' && house.timezone ? house.timezone : 'UTC';
    const now = getCurrentTime(tz);

    for (const [floorId, floor] of Object.entries(floors)) {
      const devices = floor?.devices;
      if (!devices) continue;

      for (const [deviceId, device] of Object.entries(devices)) {
        if (device?.type !== 'light' || device.scheduleEnabled !== true) continue;
        await evaluateLight(houseId, floorId, deviceId, device, now);
      }
    }
  }
}

async function evaluateLight(houseId, floorId, deviceId, device, now) {
  const { scheduleStart, scheduleEnd } = device;
  if (typeof scheduleStart !== 'string' || typeof scheduleEnd !== 'string') {
    return;
  }

  const desired = isWithinSchedule(now, scheduleStart, scheduleEnd) ? 'ON' : 'OFF';

  // Only touch healthy states; never override ERROR/DISCONNECTED.
  if (device.status === desired) return;
  if (device.status !== 'ON' && device.status !== 'OFF') return;

  await db.ref(`houses/${houseId}/floors/${floorId}/devices/${deviceId}`).update({
    status: desired,
    lastUpdatedAt: Date.now(),
    lastUpdatedBy: 'system',
  });

  console.log(`[lightSchedule] ${deviceId} -> ${desired} (current time ${now}).`);
}

/**
 * Starts the 60s schedule loop. Runs one scan immediately, then on a fixed
 * interval. Overlapping runs are skipped if the previous one is still going.
 */
export function startLightScheduleTimer(intervalMs = LIGHT_SCHEDULE_INTERVAL_MS) {
  void runLightScheduleScan().catch((err) =>
    console.error('[lightSchedule] initial scan failed:', err)
  );

  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runLightScheduleScan()
      .catch((err) => console.error('[lightSchedule] scan failed:', err))
      .finally(() => {
        running = false;
      });
  }, intervalMs);

  timer.unref?.();
  console.log(`[lightSchedule] timer started (every ${intervalMs / 1000}s).`);
  return timer;
}
