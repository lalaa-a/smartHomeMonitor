import { db } from '../config/firebaseAdmin.js';

/** Reads a house node. Returns null when the house does not exist. */
export async function getHouse(houseId) {
  const snap = await db.ref(`houses/${houseId}`).once('value');
  if (!snap.exists()) return null;
  return { houseId, ...snap.val() };
}

/**
 * Throws when the house does not exist or the caller is not its owner.
 * Error `code` is used by the global error handler to map to HTTP status.
 */
export async function assertOwnership(houseId, uid) {
  const house = await getHouse(houseId);
  if (!house) {
    const err = new Error('House not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (house.ownerId !== uid) {
    const err = new Error('Forbidden: you are not the owner of this house.');
    err.code = 'FORBIDDEN';
    throw err;
  }
  return house;
}
