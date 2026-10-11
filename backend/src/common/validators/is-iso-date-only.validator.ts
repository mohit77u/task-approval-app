import { registerDecorator, ValidationOptions } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** True for real calendar dates written as YYYY-MM-DD. Rejects shapes like 2030-02-30 that Date would silently roll over. */
export function isIsoDateOnly(value: unknown): boolean {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

export function IsIsoDateOnly(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isIsoDateOnly',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: {
        message: `${String(propertyKey)} must be a valid date in YYYY-MM-DD format`,
        ...options,
      },
      validator: { validate: isIsoDateOnly },
    });
}
