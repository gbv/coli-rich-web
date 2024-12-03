import express from "express"
import path from "node:path"
import fs from "node:fs"
import { createHash } from "node:crypto"

import * as auth from "./auth.js"
import * as errors from "./errors.js"
import config from "../config.js"

const router = express.Router()
export default router

function getBase(req) {
  const url = new URL(`${req.protocol}://${req.get("host")}${req.originalUrl}`)
  let base = `${url.origin}${url.pathname}`
  if (!base.endsWith("/")) {
    base += "/"
  }
  return base
}

router.post("/", auth.main, (req, res) => {
  // Create hash of PICA patch content as id
  const id = createHash("sha1").update(req.body).digest("hex")
  const uri = `${getBase(req)}${id}`
  res.set("Location", uri)
  try {
    fs.writeFileSync(path.join(config.enrichmentsPath, id), req.body)
    res.status(201).json({
      id,
      uri,
      ok: 1,
    })
  } catch (error) {
    config.error(error)
    // ? Should we differentiate between errors?
    throw new errors.BackendError()
  }
})

router.get("/", (req, res) => {
  let base = getBase(req), enrichments = ""
  for (const id of fs.readdirSync(config.enrichmentsPath)) {
    const stats = fs.lstatSync(path.join(config.enrichmentsPath, id))
    // Make sure it is a file
    if (stats.isFile()) {
      enrichments += `${base}${id} ${stats.birthtime.toISOString()}\n`
    }
  }
  res.type("txt").send(enrichments)
})

router.get("/:id", (req, res) => {
  const id = req.params.id
  try {
    const file = path.join(config.enrichmentsPath, id)
    const created = fs.lstatSync(file).birthtime
    const enrichment = fs.readFileSync(file, "utf-8")
    res.set("Date", created)
    res.type("txt")
    res.send(enrichment)
  } catch (error) {
    // ? Should we differentiate between errors?
    throw new errors.EntityNotFoundError(null, id)
  }
})
