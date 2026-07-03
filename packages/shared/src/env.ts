import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";

function booleanEnvironmentSchema(defaultValue: boolean) {
  return z
    .enum(["true", "false"])
    .default(defaultValue ? "true" : "false")
    .transform((value) => value === "true");
}

export const papEnvironmentSchema = z.enum(["local", "test", "self_hosted", "production"]);

export const authModeSchema = z.enum(["none", "reverse_proxy", "application"]);

export const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PAP_ENVIRONMENT: papEnvironmentSchema.default("local"),
    PAP_BIND_HOST: z.string().min(1).default("127.0.0.1"),
    PAP_ALLOW_REMOTE_ACCESS: booleanEnvironmentSchema(false),
    PAP_AUTH_MODE: authModeSchema.default("none"),
    PAP_TRUSTED_PROXY: booleanEnvironmentSchema(false),
    PAP_DATABASE_URL: z.string().min(1).default("file:./data/pap.db"),
    PAP_DATA_DIR: z.string().min(1).default("./data"),
    PAP_LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
      .default("info"),
    PAP_LOG_PRETTY: booleanEnvironmentSchema(true),
    PAP_TRACE_RAW_PAYLOADS: booleanEnvironmentSchema(false),
  })
  .passthrough();

export type PapEnvironment = z.infer<typeof papEnvironmentSchema>;
export type AuthMode = z.infer<typeof authModeSchema>;
export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export type EnvironmentValidation = {
  env: ServerEnvironment;
  warnings: string[];
};

export type LoadRepositoryEnvironmentInput = {
  cwd?: string;
  env?: Record<string, string | undefined>;
};

export function loadRepositoryEnvironment(
  input: LoadRepositoryEnvironmentInput = {},
): Record<string, string | undefined> {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? env.INIT_CWD ?? process.cwd();
  const repositoryRoot = findRepositoryRoot(cwd);
  const fileEnv = loadEnvironmentFiles(repositoryRoot);

  return {
    ...fileEnv,
    ...env,
  };
}

export function validateEnvironment(
  input: Record<string, string | undefined> = process.env,
): EnvironmentValidation {
  const env = serverEnvironmentSchema.parse(input);
  const warnings: string[] = [];

  if (env.PAP_ALLOW_REMOTE_ACCESS && env.PAP_AUTH_MODE === "none") {
    warnings.push("Remote access is enabled without an application or reverse-proxy auth mode.");
  }

  if (env.PAP_BIND_HOST === "0.0.0.0" && env.PAP_AUTH_MODE === "none") {
    warnings.push("The platform is bound publicly without configured request protection.");
  }

  return { env, warnings };
}

export function getBrowserSafeEnvironment(
  env: ServerEnvironment,
): Pick<ServerEnvironment, "PAP_ENVIRONMENT"> {
  return {
    PAP_ENVIRONMENT: env.PAP_ENVIRONMENT,
  };
}

function findRepositoryRoot(cwd: string): string {
  let current = resolve(cwd);

  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    const parent = dirname(current);

    if (parent === current) {
      return resolve(cwd);
    }

    current = parent;
  }
}

function loadEnvironmentFiles(repositoryRoot: string): Record<string, string> {
  const loaded: Record<string, string> = {};

  for (const fileName of [".env", ".env.local"]) {
    const filePath = join(repositoryRoot, fileName);

    if (existsSync(filePath)) {
      Object.assign(loaded, parseEnv(readFileSync(filePath, "utf8")));
    }
  }

  return loaded;
}
