import { Login } from "gbv-login-client-vue"
import { loginServerUrl, loginServerSsl } from "../config.js"

export function useLogin() {
  if (loginServerUrl) {
    Login.connect(loginServerUrl, { ssl: loginServerSsl })
  }
  return {
    loginConfigured: !!loginServerUrl,
  }
}
