import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TemporarySqliteDatabase = {
  directory: string;
  databasePath: string;
  databaseUrl: string;
};

export async function createTemporarySqliteDatabase(
  prefix = "pap-test-",
): Promise<TemporarySqliteDatabase> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const databasePath = join(directory, "pap.db");

  return {
    directory,
    databasePath,
    databaseUrl: `file:${databasePath}`,
  };
}

export type CapabilityTestHelper<TInput = unknown, TOutput = unknown> = {
  capabilityId: string;
  validInput: TInput;
  expectedOutput?: TOutput;
};

export function defineCapabilityTestHelper<TInput, TOutput>(
  helper: CapabilityTestHelper<TInput, TOutput>,
): CapabilityTestHelper<TInput, TOutput> {
  return helper;
}
