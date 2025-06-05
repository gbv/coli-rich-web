// Vite supports JSON import without assertions
import pkg from "#/package.json"
const { name, version, description } = pkg

export {
  name,
  version,
  description,
}

export const subjectsApi = "https://coli-conc.gbv.de/subjects-k10plus"
export const bartocApi = "https://bartoc.org/api/"
export const concordanceApi = "https://coli-conc.gbv.de/api/"
export const showWhenExistsKey = "___SHOW_WHEN_EXISTS___"
export const schemesKey = "coli-rich-web_schemes"
export const typesKey = "coli-rich-web_types"

import * as jskos from "jskos-tools"
import { cdk, addAllProviders } from "cocoda-sdk"
addAllProviders()
jskos.languagePreference.defaults = ["de", "en"]

export const bartocRegistry = cdk.initializeRegistry({
  provider: "ConceptApi",
  api: bartocApi,
})
export const concordanceRegistry = cdk.initializeRegistry({
  provider: "MappingsApi",
  api: concordanceApi,
})

const loginServer = import.meta.env.VITE_LOGIN_SERVER || null
export const loginServerUrl = loginServer && loginServer.replace(/https?:\/\//, "")
export const loginServerSsl = loginServer && loginServer.startsWith("https://")

export const allowedUsers = (import.meta.env.VITE_ALLOWED_USERS || "").split(",").filter(Boolean).map(uri => uri.trim())
export const allowedProviders = (import.meta.env.VITE_ALLOWED_PROVIDERS || "").split(",").filter(Boolean).map(uri => uri.trim())

export const baseUrl = import.meta.env.BASE_URL || "/"
export const isProduction = import.meta.env.MODE === "production"

export const dbKey = import.meta.env.DBKEY || "opac-de-627"
export const examples = (import.meta.env.EXAMPLES || "").split(",").filter(ppn => ppn.match(/^[0-9]+[Xx]?$/))

let _additionalText = import.meta.env.VITE_ADDITIONAL_TEXT || null
// If the additional text is not enclosed in a HTML tag, use <p></p>
if (_additionalText && !_additionalText.startsWith("<")) {
  _additionalText = `<p>${_additionalText}</p>`
}
export const additionalText = _additionalText
