import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import { fileURLToPath } from "url"
import Icons from "unplugin-icons/vite"
import IconsResolver from "unplugin-icons/resolver"
import Components from "unplugin-vue-components/vite"

import config from "./src/config.js"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    Components({
      resolvers: IconsResolver(),
    }),
    Icons({
      autoInstall: true,
      compiler: "vue3",
      scale: 1.1,
      defaultStyle: "height: 1.375em; vertical-align: bottom;",
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/client", import.meta.url)),
      "#": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  // Use base / for everything other than production
  base: config.isProduction ? config.base : "/",
})
