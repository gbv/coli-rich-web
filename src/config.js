// Vite supports JSON import without assertions
import pkg from "../package.json"
const { name, version, description } = pkg

const config = {
  name,
  version,
  description,
  subjectsApi: "https://coli-conc.gbv.de/subjects-k10plus",
  bartocApi: "https://bartoc.org/api/",
  concordanceApi: "https://coli-conc.gbv.de/api/",
  showWhenExistsKey: "___SHOW_WHEN_EXISTS___",
  schemesKey: "coli-rich-web_schemes",
  typesKey: "coli-rich-web_types",
  examples: [
    "389598534",
    "1830228498",
    "1646529499",
  ],
}

export default config
