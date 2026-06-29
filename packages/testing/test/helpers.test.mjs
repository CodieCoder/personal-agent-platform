import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  createExecutionRequest,
  createTemporarySqliteDatabase,
  createTrace,
  loadJsonFixture,
} from "../dist/index.js";

test("testing factories create importable execution and trace helpers", () => {
  const request = createExecutionRequest({ input: { message: "hello" } });
  const trace = createTrace({ capabilityId: request.capabilityId });

  assert.equal(request.source, "test");
  assert.equal(trace.capabilityId, request.capabilityId);
  assert.equal(trace.steps.length, 1);
});

test("loadJsonFixture reads JSON fixtures and applies optional parsers", async () => {
  const database = await createTemporarySqliteDatabase();
  const fixturePath = join(database.directory, "fixture.json");

  await mkdir(database.directory, { recursive: true });
  await writeFile(fixturePath, JSON.stringify({ ok: true }), "utf8");

  const fixture = await loadJsonFixture(fixturePath, {
    parse(input) {
      assert.deepEqual(input, { ok: true });
      return "parsed";
    },
  });

  assert.equal(fixture, "parsed");
  assert.equal(database.databaseUrl, `file:${database.databasePath}`);
});
