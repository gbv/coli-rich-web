import { subjectsApi, concordanceRegistry } from "./config.js"
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

export async function getTitleName(ppn) {
  return (await (await fetch(`https://ws.gbv.de/suggest/csl2/?citationstyle=ieee&query=pica.ppn=${ppn}&database=opac-de-627&language=de`)).json())[1][0]
}

export async function getSubjects(ppn) {
  let subjects = await (await fetch(`${subjectsApi}/subjects?record=http://uri.gbv.de/document/opac-de-627:ppn:${ppn}&live=1`)).json()
  // Filter duplicate subjects
  subjects = [...new Set(subjects.map(s => s.uri))].map(uri_ => subjects.find(({ uri }) => uri === uri_))
  // Add scheme data to subjects
  subjects.forEach(subject => {
    subject.inScheme[0] = state.schemes.find(scheme => jskos.compare(scheme, subject.inScheme[0]))
  })
  return subjects
}

export async function getMappingsForSubjects(subjects) {
  if (!subjects.length) {
    return []
  }
  const 
    toScheme = state.schemes.map(s => s.uri).join("|"), 
    cardinality = "1-to-1",
    configs = [],
    limit = 500,
    maxLength = 600 // Prevent URL length issues (very conservative value)
  let current = []
  
  for (const subject of subjects.concat(null)) {
    const from = current.map(s => s.uri).join("|")
    const length = toScheme.length + from.length
    // Cutoff when maxLength is exceeded (or after last element)
    if (length >= maxLength || (subject === null && from.length)) {
      current = []
      // This was originally a workaround for a bug in jskos-server.
      // That bug (https://github.com/gbv/jskos-server/issues/219) is now fixed,
      // however, there seem to be performance issues with direction=both, so we're keeping this for now.
      // See: https://github.com/gbv/jskos-server/issues/221
      // TODO: Adjust after performance issues are fixed.
      ;["forward", "backward"].forEach(direction => {
        configs.push({
          from,
          toScheme,
          cardinality,
          direction,
          limit,
        })
      })
    }
    current.push(subject)
  }
  return (await Promise.all(configs.map(config => concordanceRegistry.getMappings(config)))).reduce((prev, cur) => prev.concat(cur), [])
}
