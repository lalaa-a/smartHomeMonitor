import { z } from 'zod';

/** Firebase RTDB keys are alphanumeric plus `-` and `_` (push-ID alphabet). */
const idString = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'must be a valid Firebase key');

const isoDateTime = z
  .string()
  .min(1)
  .refine((value) => Number.isFinite(new Date(value).getTime()), {
    message: 'must be a valid ISO date-time',
  });

export const houseIdParamsSchema = z
  .object({
    houseId: idString,
  })
  .strict();

export const alertParamsSchema = z
  .object({
    houseId: idString,
    alertId: idString,
  })
  .strict();

export const reportQuerySchema = z
  .object({
    from: isoDateTime,
    to: isoDateTime,
  })
  .strict()
  .refine((data) => new Date(data.from).getTime() <= new Date(data.to).getTime(), {
    message: '"from" must not be after "to"',
    path: ['from'],
  });
