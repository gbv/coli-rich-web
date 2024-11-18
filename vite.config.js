import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import { fileURLToPath } from "url"

import dotenv from "dotenv"
dotenv.config()

const base = process.env.BASE || "/"
const isProduction = process.env.NODE_ENV === "production"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  define: {
    BASE: `"${base || ""}"`,
    LOGIN_SERVER: `"${process.env.LOGIN || ""}"`,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Use base / for everything other than production
  base: isProduction ? base : "/",
})
