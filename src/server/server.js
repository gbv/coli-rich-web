import express from "express"
import ViteExpress from "vite-express"

import * as auth from "./auth.js"
import * as errors from "./errors.js"
import config from "../config.js"

const app = express()
ViteExpress.config({ mode: config.isProduction ? "production" : "development" })

// TODO: Authenticated test endpoint, replace with actual enrichment endpoint
app.get("/test", auth.main, (req, res) => {
  res.json({ Hello: "World", uris: req.uris })
})

// Error handling
app.use((error, req, res, next) => {
  // Check if error is defined in errors
  if (Object.values(errors).includes(error.constructor)) {
    res.status(error.statusCode).send({
      error: error.constructor.name,
      status: error.statusCode,
      message: error.message,
    })
  } else {
    next(error)
  }
})

ViteExpress.listen(app, config.port, () => {
  config.log(`coli-rich-web at http://localhost:${config.port} in ${config.env} mode...`)
})
