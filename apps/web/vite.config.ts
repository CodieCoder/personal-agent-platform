import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const configuredPort = Number.parseInt(process.env.PAP_PORT ?? "3000", 10);

export default defineConfig({
  server: {
    host: process.env.PAP_BIND_HOST ?? "127.0.0.1",
    port: Number.isNaN(configuredPort) ? 3000 : configuredPort,
  },
  ssr: {
    external: ["@pap/storage-sqlite"],
  },
  plugins: [
    tanstackStart(),
    // The React Vite plugin must run after the TanStack Start plugin.
    viteReact(),
  ],
});
