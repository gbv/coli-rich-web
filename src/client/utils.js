import { subjectsApi, dbKey, concordanceRegistry } from "@/config.js"
import state from "@/state.js"
import * as jskos from "jskos-tools"

const mappingTypePriority = [
  "http://www.w3.org/2004/02/skos/core#exactMatch",
  "http://www.w3.org/2004/02/skos/core#closeMatch",
  "http://www.w3.org/2004/02/skos/core#narrowMatch",
  "http://www.w3.org/2004/02/skos/core#broadMatch",
  "http://www.w3.org/2004/02/skos/core#mappingRelation",
  "http://www.w3.org/2004/02/skos/core#relatedMatch",
]

// Method ONLY FOR SORTING that adjust the direction of a mapping so that the "target" is always on the "to" side.
// This makes sure that the above "mappingTypePriority" list makes sense with regards to "narrowMatch" and "broadMatch".
const adjustMappingDirection = (target) => (mapping) => {
  const switchDirections = jskos.compare(jskos.conceptsOfMapping(mapping, "from")[0], target)
  let newType = mapping.type[0]
  if (switchDirections && newType === "http://www.w3.org/2004/02/skos/core#narrowMatch") {
    newType = "http://www.w3.org/2004/02/skos/core#broadMatch"
  } else if (switchDirections && newType === "http://www.w3.org/2004/02/skos/core#broadMatch") {
    newType = "http://www.w3.org/2004/02/skos/core#narrowMatch"
  }
  const newMapping = {
    ...mapping,
    [switchDirections ? "to" : "from"]: mapping.from,
    [switchDirections ? "from" : "to"]: mapping.to,
    type: [newType],
  }
  return newMapping
}

export function sortSuggestionMappings(a, b) {
  const aMappings = a.mappings.filter(mapping => state.suggestionTypes[mapping.type[0]]).map(adjustMappingDirection(a.target))
  const bMappings = b.mappings.filter(mapping => state.suggestionTypes[mapping.type[0]]).map(adjustMappingDirection(b.target))
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
  return (await (await fetch(`https://ws.gbv.de/suggest/csl2/?citationstyle=ieee&query=pica.ppn=${ppn}&database=${dbKey}&language=de`)).json())[1][0]
}

export async function getSubjects(ppn) {
  let subjects = await (await fetch(`${subjectsApi}/subjects?record=http://uri.gbv.de/document/${dbKey}:ppn:${ppn}&live=1`)).json()
  // Filter duplicate subjects
  subjects = [...new Set(subjects.map(s => s.uri))].map(uri_ => subjects.find(({ uri }) => uri === uri_))
  // Add scheme data to subjects
  subjects.forEach(subject => {
    subject.inScheme[0] = state.schemes.find(scheme => jskos.compare(scheme, subject.inScheme[0]))
  })
  return subjects
}

async function runInParallelAndCombineResults(promises) {
  return (await Promise.all(promises)).reduce((prev, cur) => prev.concat(cur), [])
}
const maxLength = 600 // Prevent URL length issues (very conservative value)

export async function getMappingsForSubjects(subjects) {
  if (!subjects.length) {
    return []
  }
  const 
    toScheme = state.schemes.map(s => s.uri).join("|"), 
    cardinality = "1-to-1",
    direction = "both",
    configs = [],
    limit = 500
  let current = []
  
  for (const subject of subjects.concat(null)) {
    const from = current.map(s => s.uri).join("|")
    const length = toScheme.length + from.length
    // Cutoff when maxLength is exceeded (or after last element)
    if (length >= maxLength || (subject === null && from.length)) {
      current = []
      configs.push({
        from,
        toScheme,
        cardinality,
        direction,
        limit,
      })
    }
    current.push(subject)
  }
  return runInParallelAndCombineResults(configs.map(config => concordanceRegistry.getMappings(config)))
}

export async function getConceptData({ concepts, scheme }) {
  const promises = []
  let current = []
  for (const concept of concepts.concat(null)) {
    const length = current.map(c => c.uri).join("|").length
    if (length >= maxLength || (concept === null && current.length)) {
      promises.push(scheme._registry.getConcepts({ concepts: current.map(concept => ({ uri: concept.uri, inScheme: [scheme] })) }))
      current = []
    }
    current.push(concept)
  }
  return await runInParallelAndCombineResults(promises)
}
