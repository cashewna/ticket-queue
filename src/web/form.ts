/**
 * Fastify's formbody plugin yields strings or arrays for repeated fields.
 * Views only ever bind the first string, so an array never leaks into SQL or
 * markup as "[object Object]".
 */
export function formString(body: unknown, key: string): string {
  if (typeof body !== 'object' || body === null) return '';
  const value = (body as Record<string, unknown>)[key];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
}
