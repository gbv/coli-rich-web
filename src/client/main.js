import { createApp } from "vue"
import App from "@/App.vue"
const app = createApp(App)

import "@/style.css"
import "jskos-vue/dist/style.css"

import { LoadingIndicator, Modal } from "jskos-vue"
app.use(LoadingIndicator)
app.use(Modal)

import "gbv-login-client-vue/style"
import * as LoginClientVue from "gbv-login-client-vue"
app.use(LoginClientVue)

app.mount("#app")
