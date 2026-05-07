import { defineConfig } from "vite";

// Almanac is a single static page. No backend, no API routes.
export default defineConfig({
  server: { port: 5181, host: "127.0.0.1" },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
