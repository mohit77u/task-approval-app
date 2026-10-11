import { IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AppException } from '../errors/app.exception';
import { createValidationPipe } from './validation.pipe';

class ChildDto {
  @IsString() @MinLength(3) name!: string;
}
class ParentDto {
  @IsString() title!: string;
  @ValidateNested() @Type(() => ChildDto) child!: ChildDto;
}

describe('createValidationPipe', () => {
  const pipe = createValidationPipe();
  const meta = { type: 'body' as const, metatype: ParentDto };

  it('returns a 422 AppException with flattened field details', async () => {
    const error = await pipe.transform({ title: 5, child: { name: 'a' } }, meta).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    const exception = error as AppException;
    expect(exception.getStatus()).toBe(422);
    expect(exception.details?.map((d) => d.field).sort()).toEqual(['child.name', 'title']);
  });

  it('rejects unknown fields', async () => {
    const error = (await pipe
      .transform({ title: 'ok', child: { name: 'abc' }, isAdmin: true }, meta)
      .catch((e: unknown) => e)) as AppException;
    expect(error.details?.[0]).toEqual({ field: 'isAdmin', message: 'property isAdmin should not exist' });
  });

  it('accepts a valid payload', async () => {
    await expect(pipe.transform({ title: 'ok', child: { name: 'abc' } }, meta)).resolves.toBeInstanceOf(ParentDto);
  });
});
