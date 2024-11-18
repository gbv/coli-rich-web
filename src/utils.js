import state from "./state.js"
import * as jskos from "jskos-tools"

// TODO: Sorting is more complicated as mapping direction needs to be accounted for
const mappingTypePriority = [
  "http://www.w3.org/2004/02/skos/core#exactMatch",
  "http://www.w3.org/2004/02/skos/core#closeMatch",
  "http://www.w3.org/2004/02/skos/core#broadMatch",
  "http://www.w3.org/2004/02/skos/core#narrowMatch",
  "http://www.w3.org/2004/02/skos/core#mappingRelation",
  "http://www.w3.org/2004/02/skos/core#relatedMatch",
]

export function sortSuggestionMappings(a, b) {
  const aMappings = a.mappings.filter(mapping => state.suggestionTypes[mapping.type[0]])
  const bMappings = b.mappings.filter(mapping => state.suggestionTypes[mapping.type[0]])
  const aPriority = Math.min(...aMappings.map(mapping => {
    const index = mappingTypePriority.indexOf(mapping.type[0])
    return index === -1 ? 9 : index
  }), 10)
  const bPriority = Math.min(...bMappings.map(mapping => {
    const index = mappingTypePriority.indexOf(mapping.type[0])
    return index === -1 ? 9 : index
  }), 10)
  if (aPriority === bPriority) {
    // Fallback to number of mappings
    return bMappings.length - aMappings.length
  }
  return aPriority - bPriority
}

export function suggestionsToPica({ suggestions, ppn }) {
  return `  003@ $0${ppn}\n` + suggestions.map(({ target, scheme, mappings }) => {
    let pica = `+ ${scheme.PICA} `
    pica += `$a${jskos.notation(target)}`
    pica += "$Acoli-conc"
    mappings.forEach(({ uri }) => {
      pica += `$A${uri}`
    })
    return pica
  }).join("\n")
}
