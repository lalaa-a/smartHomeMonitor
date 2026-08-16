/**
 * Pure aggregation over usage log records.
 *
 * @param {Array<object>} logs usage log entries: { deviceId, event, timestamp, durationMinutes }
 * @param {number} fromMs inclusive lower bound (epoch ms)
 * @param {number} toMs inclusive upper bound (epoch ms)
 * @returns {{ [deviceId: string]: number }} total ON minutes per device
 */
export function aggregateUsage(logs, fromMs, toMs) {
  const totals = {};

  for (const log of logs ?? []) {
    if (!log || typeof log.deviceId !== 'string' || !log.deviceId) continue;

    const timestamp = Number(log.timestamp);
    if (!Number.isFinite(timestamp)) continue;
    if (timestamp < fromMs || timestamp > toMs) continue;

    const minutes = Number(log.durationMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) continue;

    totals[log.deviceId] = (totals[log.deviceId] ?? 0) + minutes;
  }

  return totals;
}
