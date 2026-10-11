import { QueryFailedError } from 'typeorm';

/** True when MySQL rejected the statement because of a unique-key violation. */
export function isDuplicateEntry(error: unknown): boolean {
  return error instanceof QueryFailedError && (error.driverError as { code?: string }).code === 'ER_DUP_ENTRY';
}
