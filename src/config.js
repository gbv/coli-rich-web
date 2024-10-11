// Vite supports JSON import without assertions
import pkg from "../package.json"
const { name, version, description } = pkg

const config = {
  name,
  version,
  description,
}

export default config
