import assert from "node:assert/strict";
import test from "node:test";
import {
  echoCapability,
  echoInputSchema,
  echoManifest,
  echoOutputSchema,
  executeEcho,
  normalizeEchoMessage,
} from "../dist/index.js";

test("echo manifest declares core trust with no tools, permissions, or side effects", () => {
  assert.equal(echoManifest.id, "capability.echo");
  assert.equal(echoManifest.trustLevel, "core");
  assert.deepEqual(echoManifest.allowedTools, []);
  assert.deepEqual(echoManifest.permissions, []);
  assert.deepEqual(echoManifest.allowedChildCapabilities, []);
  assert.deepEqual(echoManifest.supportedUiBlocks, []);
  assert.deepEqual(echoManifest.sideEffects, ["none"]);
});

test("echo input schema rejects empty messages and normalizes whitespace", () => {
  assert.equal(normalizeEchoMessage("  hello \n\t world  "), "hello world");
  assert.equal(echoInputSchema.safeParse({ message: "   " }).success, false);

  const parsed = echoInputSchema.parse({ message: "  hello \n\t world  " });
  assert.deepEqual(parsed, { message: "hello world" });
});

test("echo output schema requires a normalized message and ISO timestamp", () => {
  assert.equal(
    echoOutputSchema.safeParse({
      message: "hello",
      echoedAt: "2026-06-29T12:00:00.000Z",
    }).success,
    true,
  );
  assert.equal(echoOutputSchema.safeParse({ message: "hello", echoedAt: "today" }).success, false);
});

test("executeEcho writes one workflow step and does not call deferred runtime surfaces", async () => {
  const steps = [];
  const context = createEchoContext(steps);

  const result = await executeEcho({ message: "  hello \n world  " }, context);

  assert.equal(result.message, "hello world");
  assert.equal(Number.isNaN(Date.parse(result.echoedAt)), false);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].kind, "workflow");
  assert.equal(steps[0].name, "echo.normalize");
});

test("echoCapability exports a complete executable definition", async () => {
  const steps = [];
  const result = await echoCapability.execute(
    echoCapability.inputSchema.parse({ message: " hi " }),
    createEchoContext(steps),
  );

  assert.deepEqual(echoCapability.outputSchema.safeParse(result).success, true);
  assert.equal(steps.length, 1);
});

function createEchoContext(steps) {
  const failIfCalled = async () => {
    throw new Error("Deferred runtime surface should not be called by echo.");
  };

  return {
    executionId: "exec_echo",
    capability: echoManifest,
    source: "cli",
    trace: {
      addStep: async (step) => {
        steps.push(step);
      },
    },
    tools: {
      execute: failIfCalled,
    },
    memory: {
      getMasterProfile: failIfCalled,
      search: failIfCalled,
      write: failIfCalled,
    },
    llm: {
      generateStructured: failIfCalled,
    },
    ui: {
      build: failIfCalled,
    },
    approvals: {
      request: failIfCalled,
    },
  };
}
