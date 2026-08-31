import { pool } from './db';

let initialized = false;

const initialSchemaSql = `
CREATE TABLE IF NOT EXISTS "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role_id" integer,
	"department_id" integer,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"department_id" integer,
	"parent_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" uuid
);

CREATE TABLE IF NOT EXISTS "files" (
	"id" serial PRIMARY KEY NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"storage_key" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"folder_id" integer,
	"uploaded_by" uuid,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" uuid
);

CREATE TABLE IF NOT EXISTS "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	CONSTRAINT "permissions_name_unique" UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "user_department_access" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"department_id" integer,
	"permission_id" integer
);

CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"action" varchar(255) NOT NULL,
	"entity" varchar(50) NOT NULL,
	"entity_id" varchar(255),
	"details" jsonb,
	"ip_address" varchar(45),
	"created_at" timestamp DEFAULT now() NOT NULL
);
`;

export async function ensureDatabaseTables() {
  if (initialized) return;
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw && !(global as unknown as { __TEST_POOL__?: unknown }).__TEST_POOL__) {
    throw new Error('DATABASE_URL environment variable is missing on Vercel.');
  }

  try {
    await pool.query(initialSchemaSql);

    // Ensure user management columns exist on existing databases
    await pool.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "department_id" integer;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp;
    `);

    // Ensure foreign key constraint if not yet added
    try {
      await pool.query(`
        ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
      `);
    } catch {
      // Ignore if constraint already exists
    }

    // Ensure standard roles exist
    await pool.query(`
      INSERT INTO "roles" ("name") VALUES ('super_admin') ON CONFLICT ("name") DO NOTHING;
      INSERT INTO "roles" ("name") VALUES ('admin') ON CONFLICT ("name") DO NOTHING;
      INSERT INTO "roles" ("name") VALUES ('manager') ON CONFLICT ("name") DO NOTHING;
      INSERT INTO "roles" ("name") VALUES ('employee') ON CONFLICT ("name") DO NOTHING;
    `);

    // Ensure standard departments exist
    const standardDepts = [
      'Engineering Department',
      'Accounts Department',
      'HR & Administration',
      'Pre-Requirement',
      'Business',
      'Registration',
      'Workplace',
    ];
    for (const dept of standardDepts) {
      await pool.query(`INSERT INTO "departments" ("name") VALUES ($1) ON CONFLICT ("name") DO NOTHING`, [dept]);
    }

    // Ensure standard permissions exist
    const perms = [
      'VIEW',
      'UPLOAD',
      'DOWNLOAD',
      'EDIT',
      'DELETE',
      'CREATE_FOLDER',
      'RENAME_FOLDER',
      'MOVE',
      'MANAGE_USERS',
      'MANAGE_PERMISSIONS',
    ];
    for (const perm of perms) {
      await pool.query(`INSERT INTO "permissions" ("name") VALUES ($1) ON CONFLICT ("name") DO NOTHING`, [perm]);
    }

    initialized = true;
  } catch (error) {
    console.error('Error auto-initializing database tables:', error);
    throw error;
  }
}
