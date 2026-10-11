import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1791729668327 implements MigrationInterface {
  name = 'InitSchema1791729668327';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`roles\` (\`id\` int NOT NULL AUTO_INCREMENT, \`code\` varchar(32) NOT NULL, \`name\` varchar(64) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_f6d54f95c31b73fb1bdd8e91d0\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`users\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(120) NOT NULL, \`email\` varchar(255) NOT NULL, \`phone\` varchar(20) NULL, \`is_default\` tinyint NOT NULL DEFAULT 0, \`deleted_at\` datetime NULL, \`password_hash\` varchar(255) NOT NULL, \`role_id\` int NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`refresh_tokens\` (\`id\` int NOT NULL AUTO_INCREMENT, \`user_id\` int NOT NULL, \`family_id\` char(36) NOT NULL, \`token_hash\` char(64) NOT NULL, \`expires_at\` datetime NOT NULL, \`revoked_at\` datetime NULL, \`replaced_by_id\` int NULL, \`user_agent\` varchar(255) NULL, \`ip\` varchar(64) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_d5e27da0cd39bc3bb2811fc8ba\` (\`family_id\`), INDEX \`IDX_3ddc983c5f7bcf132fd8732c3f\` (\`user_id\`), UNIQUE INDEX \`IDX_a7838d2ba25be1342091b6695f\` (\`token_hash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`tasks\` (\`id\` int NOT NULL AUTO_INCREMENT, \`title\` varchar(200) NOT NULL, \`description\` text NOT NULL, \`priority\` enum ('LOW', 'MEDIUM', 'HIGH') NOT NULL DEFAULT 'MEDIUM', \`status\` enum ('PENDING', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED') NOT NULL DEFAULT 'PENDING', \`due_date\` date NOT NULL, \`assignee_id\` int NOT NULL, \`created_by_id\` int NOT NULL, \`deleted_at\` datetime(6) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_707cfc415c7c12d38dfc2ec8eb\` (\`due_date\`), INDEX \`IDX_b2955f55f48939ab154579a83d\` (\`status\`, \`priority\`), INDEX \`IDX_e75dc0aa87e51b0c7c3bdc5d4e\` (\`assignee_id\`, \`status\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`task_comments\` (\`id\` int NOT NULL AUTO_INCREMENT, \`task_id\` int NOT NULL, \`author_id\` int NOT NULL, \`body\` text NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_608fdc50eb832e128ac4167078\` (\`task_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`task_status_history\` (\`id\` int NOT NULL AUTO_INCREMENT, \`task_id\` int NOT NULL, \`from_status\` enum ('PENDING', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED') NULL, \`to_status\` enum ('PENDING', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED') NOT NULL, \`actor_id\` int NOT NULL, \`note\` varchar(1000) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_513f494fa44f600d13dedc0646\` (\`task_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD CONSTRAINT \`FK_a2cecd1a3531c0b041e29ba46e1\` FOREIGN KEY (\`role_id\`) REFERENCES \`roles\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`refresh_tokens\` ADD CONSTRAINT \`FK_3ddc983c5f7bcf132fd8732c3f4\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tasks\` ADD CONSTRAINT \`FK_855d484825b715c545349212c7f\` FOREIGN KEY (\`assignee_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tasks\` ADD CONSTRAINT \`FK_0804c9432857e4d333583f5afe1\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`task_comments\` ADD CONSTRAINT \`FK_ba9e465cfc707006e60aae59946\` FOREIGN KEY (\`task_id\`) REFERENCES \`tasks\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`task_comments\` ADD CONSTRAINT \`FK_76901a920ba9ec5be8dbd64d747\` FOREIGN KEY (\`author_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`task_status_history\` ADD CONSTRAINT \`FK_984dd79c26d9f7dfec056068176\` FOREIGN KEY (\`task_id\`) REFERENCES \`tasks\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`task_status_history\` ADD CONSTRAINT \`FK_cb359f43223e7435f9207717946\` FOREIGN KEY (\`actor_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`task_status_history\` DROP FOREIGN KEY \`FK_cb359f43223e7435f9207717946\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`task_status_history\` DROP FOREIGN KEY \`FK_984dd79c26d9f7dfec056068176\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`task_comments\` DROP FOREIGN KEY \`FK_76901a920ba9ec5be8dbd64d747\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`task_comments\` DROP FOREIGN KEY \`FK_ba9e465cfc707006e60aae59946\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`tasks\` DROP FOREIGN KEY \`FK_0804c9432857e4d333583f5afe1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`tasks\` DROP FOREIGN KEY \`FK_855d484825b715c545349212c7f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`refresh_tokens\` DROP FOREIGN KEY \`FK_3ddc983c5f7bcf132fd8732c3f4\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_a2cecd1a3531c0b041e29ba46e1\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_513f494fa44f600d13dedc0646\` ON \`task_status_history\``,
    );
    await queryRunner.query(`DROP TABLE \`task_status_history\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_608fdc50eb832e128ac4167078\` ON \`task_comments\``,
    );
    await queryRunner.query(`DROP TABLE \`task_comments\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_e75dc0aa87e51b0c7c3bdc5d4e\` ON \`tasks\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_b2955f55f48939ab154579a83d\` ON \`tasks\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_707cfc415c7c12d38dfc2ec8eb\` ON \`tasks\``,
    );
    await queryRunner.query(`DROP TABLE \`tasks\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_a7838d2ba25be1342091b6695f\` ON \`refresh_tokens\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_3ddc983c5f7bcf132fd8732c3f\` ON \`refresh_tokens\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_d5e27da0cd39bc3bb2811fc8ba\` ON \`refresh_tokens\``,
    );
    await queryRunner.query(`DROP TABLE \`refresh_tokens\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\` ON \`users\``,
    );
    await queryRunner.query(`DROP TABLE \`users\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_f6d54f95c31b73fb1bdd8e91d0\` ON \`roles\``,
    );
    await queryRunner.query(`DROP TABLE \`roles\``);
  }
}
