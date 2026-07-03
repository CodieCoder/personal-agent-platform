import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createSqliteDatabase,
  runMigrations,
  SqliteWorkspaceRepository,
} from "@pap/storage-sqlite";
import { createTemporarySqliteDatabase } from "@pap/testing";
import {
  archiveWorkspaceOperation,
  createWorkspaceOperation,
  getWorkspaceOperation,
  listWorkspacesOperation,
} from "../src/features/workspaces/operations.ts";

test("workspace operations create, list, get, and archive with active defaults", async () => {
  const fixture = await createWorkspaceOperationFixture("pap-web-workspaces-");

  try {
    const alpha = await createWorkspaceOperation(fixture.state, {
      name: "Alpha",
      description: "Primary workspace",
    });
    const beta = await createWorkspaceOperation(fixture.state, {
      name: "Beta",
      description: "Archive target",
    });
    assert.equal(alpha.ok, true);
    assert.equal(beta.ok, true);

    const betaId = beta.ok ? beta.workspace.id : "workspace_missing";
    const archived = await archiveWorkspaceOperation(fixture.state, { id: betaId });
    const active = await listWorkspacesOperation(fixture.state, {});
    const all = await listWorkspacesOperation(fixture.state, { includeArchived: true });
    const found = await getWorkspaceOperation(fixture.state, {
      id: alpha.ok ? alpha.workspace.id : "workspace_missing",
    });

    assert.equal(archived.ok && archived.found, true);
    assert.equal(archived.ok && archived.found && archived.workspace.status, "archived");
    assert.deepEqual(active.ok && active.workspaces.map((workspace) => workspace.name), ["Alpha"]);
    assert.deepEqual(all.ok && all.workspaces.map((workspace) => workspace.name).sort(), [
      "Alpha",
      "Beta",
    ]);
    assert.equal(found.ok && found.found, true);
    assert.equal(found.ok && found.found && found.workspace.description, "Primary workspace");
  } finally {
    fixture.close();
  }
});

test("workspace operations return safe not-found and invalid-input results", async () => {
  const fixture = await createWorkspaceOperationFixture("pap-web-workspace-errors-");

  try {
    const invalidCreate = await createWorkspaceOperation(fixture.state, {
      name: "",
      description: "empty names are rejected",
    });
    const invalidId = await getWorkspaceOperation(fixture.state, {
      id: "",
    });
    const missing = await archiveWorkspaceOperation(fixture.state, {
      id: "workspace_missing",
    });

    assert.equal(invalidCreate.ok, false);
    assert.equal(invalidCreate.error.code, "WORKSPACE_CREATE_INVALID");
    assert.equal(invalidId.ok, false);
    assert.equal(invalidId.error.code, "WORKSPACE_ID_INVALID");
    assert.equal(missing.ok, true);
    assert.equal(missing.ok && missing.found, false);
  } finally {
    fixture.close();
  }
});

async function createWorkspaceOperationFixture(prefix) {
  const temporaryDatabase = await createTemporarySqliteDatabase(prefix);

  runMigrations({ databaseUrl: temporaryDatabase.databaseUrl });
  const connection = createSqliteDatabase({ databaseUrl: temporaryDatabase.databaseUrl });
  const workspaceRepository = new SqliteWorkspaceRepository(connection.db);

  return {
    state: {
      workspaceRepository,
    },
    close: connection.close,
  };
}
