import { defineConfig } from "vite";

// Almanac is a single static page. No backend, no API routes.
// Transformers.js needs to load WASM/ONNX runtime — leave it external so it
// streams from the browser cache, not our bundle.
export default defineConfig({
  server: { port: 5181, host: "127.0.0.1" },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  optimizeDeps: {
    // The transformers package ships its own worker; let Vite leave it alone.
    exclude: ["@xenova/transformers"],
  },
});
