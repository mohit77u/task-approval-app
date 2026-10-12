import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records when a user's password last changed, so access tokens issued before that moment can be refused (a password
 * change signs the user out everywhere, not only their refresh tokens). Millisecond precision avoids MySQL rounding
 * the value into the next second.
 */
export class AddUserPasswordChangedAt1791782428966 implements MigrationInterface {
  name = 'AddUserPasswordChangedAt1791782428966';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`password_changed_at\` datetime(3) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`password_changed_at\``,
    );
  }
}
