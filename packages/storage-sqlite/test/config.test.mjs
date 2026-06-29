import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { createTemporarySqliteDatabase } from "@pap/testing";
import { createSqliteDatabase, resolveSqliteDatabaseConfig } from "../dist/index.js";

test("resolveSqliteDatabaseConfig accepts local file URLs", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-config-");
  const config = resolveSqliteDatabaseConfig({ databaseUrl: temporaryDatabase.databaseUrl });

  assert.equal(config.databasePath, temporaryDatabase.databasePath);
  assert.equal(config.databaseUrl, temporaryDatabase.databaseUrl);
});

test("resolveSqliteDatabaseConfig rejects non-file database URLs", () => {
  assert.throws(
    () => resolveSqliteDatabaseConfig({ databaseUrl: "postgres://localhost/pap" }),
    /PAP_DATABASE_URL must use a local file: SQLite URL/u,
  );
});

test("createSqliteDatabase creates a missing SQLite file", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-create-");
  const connection = createSqliteDatabase({ databaseUrl: temporaryDatabase.databaseUrl });

  try {
    assert.equal(existsSync(temporaryDatabase.databasePath), true);
  } finally {
    connection.close();
  }
});
