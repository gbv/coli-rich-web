// Vite supports JSON import without assertions
import pkg from "../package.json"
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
export const examples = [
  "389598534",
  "1830228498",
  "1646529499",
]
