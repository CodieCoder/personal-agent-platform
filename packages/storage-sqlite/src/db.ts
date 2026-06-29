import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema/index.js";

const defaultDataDir = "./data";
const defaultDatabaseName = "pap.db";

export type SqliteDatabaseConfigInput = {
  databaseUrl?: string;
  dataDir?: string;
  cwd?: string;
};

export type SqliteDatabaseConfig = {
  databaseUrl: string;
  dataDir: string;
  databasePath: string;
};

export type SqliteDatabaseConnection = {
  config: SqliteDatabaseConfig;
  db: BetterSQLite3Database<typeof schema>;
  sqlite: Database.Database;
  close: () => void;
};

export function resolveSqliteDatabaseConfig(
  input: SqliteDatabaseConfigInput = {},
): SqliteDatabaseConfig {
  const cwd = input.cwd ?? process.env.INIT_CWD ?? process.cwd();
  const dataDir = input.dataDir ?? process.env.PAP_DATA_DIR ?? defaultDataDir;
  const databaseUrl =
    input.databaseUrl ??
    process.env.PAP_DATABASE_URL ??
    `file:${join(dataDir, defaultDatabaseName)}`;
  const databasePath = resolveFileDatabasePath(databaseUrl, cwd);

  return {
    databaseUrl,
    dataDir: resolve(cwd, dataDir),
    databasePath,
  };
}

export function createSqliteDatabase(
  input: SqliteDatabaseConfigInput = {},
): SqliteDatabaseConnection {
  const config = resolveSqliteDatabaseConfig(input);
  mkdirSync(dirname(config.databasePath), { recursive: true });

  const sqlite = new Database(config.databasePath);
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  return {
    config,
    db,
    sqlite,
    close() {
      sqlite.close();
    },
  };
}

function resolveFileDatabasePath(databaseUrl: string, cwd: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("PAP_DATABASE_URL must use a local file: SQLite URL.");
  }

  if (databaseUrl.startsWith("file://")) {
    return fileURLToPath(new URL(databaseUrl));
  }

  const path = databaseUrl.slice("file:".length);

  if (path.length === 0 || path === ":memory:") {
    throw new Error("PAP_DATABASE_URL must point to a SQLite database file.");
  }

  return resolve(cwd, path);
}
