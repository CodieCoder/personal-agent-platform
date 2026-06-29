import { readFile } from "node:fs/promises";

export type FixtureParser<T> = {
  parse(input: unknown): T;
};

export async function loadJsonFixture<T = unknown>(
  filePath: string,
  parser?: FixtureParser<T>,
): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (parser) {
    return parser.parse(parsed);
  }

  return parsed as T;
}
