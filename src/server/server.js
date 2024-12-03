import express from "express"
import ViteExpress from "vite-express"
import path from "node:path"

import config from "../config.js"
import enrichmentRouter from "./enrichment-router.js"

import * as jskos from "jskos-tools"

const app = express()
ViteExpress.config({ mode: config.isProduction ? "production" : "development" })

// BodyParser
import bodyParser from "body-parser"
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.text())

const enrichmentServerPath = path.join(config.base, "/enrichment")
app.use(enrichmentServerPath, enrichmentRouter)


// Error handling
app.use((error, req, res, _next) => {
  // Return message as language map prefLabel if possible
  let prefLabel = error.prefLabel, message = error.message, status = error.statusCode || 500
  if (typeof prefLabel !== "object" || !prefLabel) {
    prefLabel = { "-": prefLabel || message || "" }
  } else {
    message = jskos.prefLabel({ prefLabel })
  }
  res.status(status).send({
    error: error.constructor.name,
    status,
    message,
    prefLabel,
  })
})

ViteExpress.listen(app, config.port, () => {
  config.log(`coli-rich-web at ${config.baseUrl} in ${config.env} mode...`)
})
