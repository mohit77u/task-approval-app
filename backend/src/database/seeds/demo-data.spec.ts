import { DEFAULT_DEMO_PASSWORDS, resolveDemoPasswords } from './demo-data';

describe('resolveDemoPasswords', () => {
  it('falls back to the documented demo passwords', () => {
    expect(resolveDemoPasswords({})).toEqual(DEFAULT_DEMO_PASSWORDS);
  });

  it('uses each override independently', () => {
    expect(
      resolveDemoPasswords({ SEED_ADMIN_PASSWORD: 'Private@Admin1' }),
    ).toEqual({
      admin: 'Private@Admin1',
      employee: DEFAULT_DEMO_PASSWORDS.employee,
    });
    expect(
      resolveDemoPasswords({ SEED_EMPLOYEE_PASSWORD: 'Private@Emp1' }).employee,
    ).toBe('Private@Emp1');
  });
});
