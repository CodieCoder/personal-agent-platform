import { createServerFn } from "@tanstack/react-start";
import {
  extractSearchTestResultOperation,
  getSearchProviderStatusOperation,
  runSearchTestOperation,
} from "./operations";

export const getSearchProviderStatus = createServerFn({ method: "GET" }).handler(async () =>
  withSearchTestState((state) => getSearchProviderStatusOperation(state)),
);

export const runSearchTest = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => withSearchTestState((state) => runSearchTestOperation(state, data)));

export const extractSearchTestResult = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withSearchTestState((state) => extractSearchTestResultOperation(state, data)),
  );

async function withSearchTestState<T>(
  operation: (state: Awaited<ReturnType<typeof getSearchTestOperationState>>) => Promise<T>,
): Promise<T> {
  const state = await getSearchTestOperationState();
  return operation(state);
}

async function getSearchTestOperationState() {
  const { getWebRuntimeState } = await import("../executions/runtime.server");
  return {
    runtime: getWebRuntimeState().runtime,
  };
}
