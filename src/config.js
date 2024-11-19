import * as dotenv from "dotenv"

const logger = type => (msg => console[type](new Date().toISOString(), msg))
const log = logger("log")

const NODE_ENV = process.env.NODE_ENV || "development"
if (NODE_ENV !== "test") {
  dotenv.config()
}

const { env } = process

let login = env.VITE_LOGIN_SERVER
if (login && !login.endsWith("/")) {
  login += "/"
}

export default {
  env: NODE_ENV,
  isProduction: NODE_ENV === "production",
  base: env.BASE || "/",
  port: parseInt(env.PORT) || 3454,
  login,
  allowedUsers: (env.VITE_ALLOWED_USERS || "").split(",").filter(Boolean).map(uri => uri.trim()),
  // methods
  log,
  warn: logger("warn"),
  error: logger("error"),
  info: (NODE_ENV === "development" ? log : () => {}),
  auth: {},
}
