/**
 * Validates a request source (body/query/params) against a zod schema.
 * On failure responds 400 with the issue list; on success replaces the
 * source with the parsed (coerced/refined) value before the handler runs.
 *
 * @param {import('zod').ZodType} schema
 * @param {'body' | 'query' | 'params'} source
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed.',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    req[source] = result.data;
    return next();
  };
}
