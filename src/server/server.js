import express from "express"
import ViteExpress from "vite-express"
import path from "node:path"

import * as errors from "./errors.js"
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
app.use((error, req, res, next) => {
  // Check if error is defined in errors
  if (Object.values(errors).includes(error.constructor)) {
    // Return message as language map prefLabel if possible
    let prefLabel = error.prefLabel, message = error.message
    if (typeof prefLabel !== "object" || !prefLabel) {
      prefLabel = { "-": prefLabel || "" }
    } else {
      message = jskos.prefLabel({ prefLabel })
    }
    res.status(error.statusCode).send({
      error: error.constructor.name,
      status: error.statusCode,
      message,
      prefLabel,
    })
  } else {
    next(error)
  }
})

ViteExpress.listen(app, config.port, () => {
  config.log(`coli-rich-web at http://localhost:${config.port}${config.base} in ${config.env} mode...`)
})
