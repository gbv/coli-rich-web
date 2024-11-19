import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import { fileURLToPath } from "url"

import config from "./src/config.js"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/client", import.meta.url)),
      "#": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  // Use base / for everything other than production
  base: config.isProduction ? config.base : "/",
})
