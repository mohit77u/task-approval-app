import { AppException } from '../errors/app.exception';

/**
 * `@IsOptional()` (and therefore PartialType) lets an explicit `null` through validation, and the services only skip
 * `undefined`, so `{"title": null}` would reach the database and surface as a 500. Fields that may legitimately be
 * cleared with `null` are listed in `nullable`.
 */
export function rejectNullFields(
  dto: object,
  nullable: readonly string[] = [],
): void {
  const details = Object.entries(dto)
    .filter(([field, value]) => value === null && !nullable.includes(field))
    .map(([field]) => ({ field, message: `${field} must not be null` }));
  if (details.length > 0) throw AppException.validation(details);
}
