import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "npm:@base44/sdk@0.8.40": path.resolve(root, "src/test/base44SdkStub.js"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    include: ["tests/unit/**/*.{test,spec}.{js,jsx,ts,tsx}"],
    restoreMocks: true,
    clearMocks: true,
  },
});
