import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "srvx";
import { serveStatic } from "srvx/static";
import serverEntry from "./dist/server/server.js";

const clientDirectory = join(dirname(fileURLToPath(import.meta.url)), "dist/client");
const port = Number.parseInt(process.env.PAP_PORT ?? process.env.PORT ?? "3000", 10);
const hostname = process.env.PAP_BIND_HOST ?? "127.0.0.1";

const server = serve({
  fetch: getFetchHandler(serverEntry),
  hostname,
  middleware: [serveStatic({ dir: clientDirectory })],
  port: Number.isNaN(port) ? 3000 : port,
});

await server.ready();

function getFetchHandler(entry) {
  if (typeof entry === "function") {
    return entry;
  }

  if (entry && typeof entry.fetch === "function") {
    return entry.fetch.bind(entry);
  }

  throw new TypeError("The TanStack Start server entry must export a fetch handler.");
}
