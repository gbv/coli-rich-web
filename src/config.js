import pkg from "../package.json" assert { type: "json" }
const { name, version, description } = pkg

const config = {
  name,
  version,
  description,
}

export default config
