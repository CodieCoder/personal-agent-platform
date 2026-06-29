import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqliteDatabase, type SqliteDatabaseConfigInput } from "./db.js";

export type MigrationResult = {
  databasePath: string;
  migrationsFolder: string;
};

export function runMigrations(input: SqliteDatabaseConfigInput = {}): MigrationResult {
  const connection = createSqliteDatabase(input);
  const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

  try {
    migrate(connection.db, { migrationsFolder });

    return {
      databasePath: connection.config.databasePath,
      migrationsFolder,
    };
  } finally {
    connection.close();
  }
}

const executedDirectly =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
  runMigrations();
}
