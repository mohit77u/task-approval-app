import { ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException, ErrorDetail } from '../errors/app.exception';

export function flattenValidationErrors(errors: ValidationError[], parent = ''): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    // One detail per field: several failed validators on the same field would otherwise yield duplicate entries.
    const messages = Object.values(error.constraints ?? {});
    const own = messages.length > 0 ? [{ field, message: messages.join('; ') }] : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => AppException.validation(flattenValidationErrors(errors)),
  });
}
