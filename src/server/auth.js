/**
 * Module that prepares authentication middleware via Passport.
 *
 * Exports an object { main, optional } with default (main) and optional authentication.
 * Optional authentication should be used if `auth` is set to `false` for a particular endpoint.
 * For example: app.get("/mappings", config.mappings.read.auth ? auth.main : auth.optional, (req, res) => { ... })
 * req.user will cointain the user if authorized, otherwise stays undefined.
 */

import config from "../config.js"
import { ForbiddenAccessError } from "./errors.js"
import passport from "passport"

import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt"
import { Strategy as AnonymousStrategy } from "passport-anonymous"

if (config.login) {
  setup()
} else {
  config.warn("No login server configured. Endpoints needing authentication will not work.")
}

async function setup() {
  // TODO: Retry after failed attempt.
  const aboutUrl = `${config.login}about`
  try {
    const about = await (await fetch(aboutUrl)).json()
    if (about.algorithm && about.publicKey) {
      config.auth.key = about.publicKey
      config.auth.algorithm = about.algorithm
      config.log(`Successfully configured backend authentication via ${config.login}.`)
    } else {
      throw new Error("/about did not return required `algorithm` and `publicKey` fields.")
    }
  } catch (error) {
    config.error(`Error loading about for configured login server from ${aboutUrl}:`)
    config.error(error)
    return
  }

  // Prepare authorization via JWT
  const opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: config.auth.key,
    algorithms: [config.auth.algorithm],
  }
  try {
    passport.use(new JwtStrategy(opts, (jwt_payload, done) => {
      done(null, jwt_payload.user)
    }))
  } catch(error) {
    config.error("Error setting up JWT authentication")
  }
}

// Add some properties and methods related to authentication
// This middleware is added to both auth.main and auth.optional
const authPreparation = (req, res, next) => {

  // Add user URIs and providers
  req.uris = [req.user?.uri].concat(Object.values(req.user?.identities || {}).map(id => id.uri)).filter(Boolean)
  req.userProviders = Object.keys(req.user?.identities || {})

  next()
}

const auth = [
  (req, res, next) => {
    if (config.auth.algorithm && config.auth.key) {
      // Use like this: app.get("/secureEndpoint", auth.main, (req, res) => { ... })
      // res.user will contain the current authorized user.
      passport.authenticate("jwt", { session: false }, (error, user) => {
        if (error || !user) {
          return next(new ForbiddenAccessError("Access forbidden. Could not authenticate via JWT."))
        }
        req.user = user
        return next()
      })(req, res, next)
    } else {
      next(new ForbiddenAccessError("Access forbidden. No authentication configured."))
    }
  }, 
  authPreparation, 
  (req, res, next) => {
    // TODO: Add provider check as alternative as soon as CBS login provider is configured in Login Server.
    if (!config.allowedUsers.includes(req.user?.uri)) {
      next(new ForbiddenAccessError("Access forbidden. User is not on the allowed list."))
    } else {
      next()
    }
  },
]

// Also use anonymous strategy for endpoints that can be used authenticated or not authenticated
passport.use(new AnonymousStrategy())
const authOptional = [
  (req, res, next) => {
    const strategies = []
    if (config.auth.algorithm && config.auth.key) {
      strategies.push("jwt")
    }
    strategies.push("anonymous")
    passport.authenticate(strategies, { session: false })(req, res, next)
  },
  authPreparation,
]

export {
  auth as main,
  authOptional as optional,
}
