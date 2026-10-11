import { Transform } from 'class-transformer';

/** Trims string input so "  " fails @IsNotEmpty and stored text has no stray whitespace. */
export const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/** Trims and lower-cases, used for e-mail addresses so lookups are case-insensitive. */
export const NormalizeEmail = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
