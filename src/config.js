import * as dotenv from "dotenv"
import assert from "node:assert"

const logger = type => (msg => console[type](new Date().toISOString(), msg))
const log = logger("log")

const NODE_ENV = process.env.NODE_ENV || "development"
if (NODE_ENV !== "test") {
  dotenv.config()
}
const isProduction = NODE_ENV === "production"

const { env } = process

let login = env.VITE_LOGIN_SERVER
if (login && !login.endsWith("/")) {
  login += "/"
}

const enrichmentsPath = env.ENRICHMENTS_PATH || "./enrichments"

// Create folder for enrichments path if necessary
import fs from "node:fs"
try {
  if (!fs.existsSync(enrichmentsPath)) {
    fs.mkdirSync(enrichmentsPath)
  }
} catch (err) {
  console.error(`Error when trying to access/create enrichtments path ${enrichmentsPath}:`, err)
  console.error(`Make sure ${enrichmentsPath} is writable and restart the application.`)
  process.exit(1)
}

const port = parseInt(env.PORT) || 3454
let baseUrl
try {
  baseUrl = new URL(env.BASE_URL)
  assert(baseUrl.protocol.match(/^https?:/))
  if (!baseUrl.href.endsWith("/")) {
    baseUrl = new URL(env.BASE_URL + "/")
  }
} catch (error) {
  baseUrl = new URL(`http://localhost:${port}/`)
  ;(isProduction || env.BASE_URL) && logger("warn")(`Warning: BASE_URL not provided or not valid. Using ${baseUrl} instead.`)
}

export default {
  env: NODE_ENV,
  isProduction,
  // Infer base for Vite from baseUrl
  base: baseUrl.pathname,
  baseUrl,
  port,
  login,
  allowedUsers: (env.VITE_ALLOWED_USERS || "").split(",").filter(Boolean).map(uri => uri.trim()),
  allowedProviders: (env.VITE_ALLOWED_PROVIDERS || "").split(",").filter(Boolean).map(uri => uri.trim()),
  enrichmentsPath,
  // methods
  log,
  warn: logger("warn"),
  error: logger("error"),
  info: (NODE_ENV === "development" ? log : () => {}),
  auth: {},
}
