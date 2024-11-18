import { subjectsApi, showWhenExistsKey, schemesKey, typesKey, bartocRegistry, concordanceRegistry } from "../config.js"
import state from "../state.js"
import * as jskos from "jskos-tools"
import { watch } from "vue"

export async function useInit() {
  console.time("Init")
  // Initialize registries 
  bartocRegistry.init()
  concordanceRegistry.init()
  // Load supported schemes from subjects-api
  const schemes = (await (await fetch(`${subjectsApi}/voc`)).json()).filter(({ uri }) => uri)
  const schemesFromBARTOC = await bartocRegistry.getSchemes({
    params: {
      uri: schemes.map(scheme => scheme.uri).join("|"),
    },
  })
  // Merge properties from BARTOC schemes with subject-api schemes
  schemesFromBARTOC.forEach(scheme => Object.getOwnPropertyNames(scheme).forEach(prop => {
    const otherScheme = schemes.find(s => jskos.compare(s, scheme))
    if (!otherScheme || otherScheme[prop]) {
      return
    }
    otherScheme[prop] = scheme[prop]
  }))
  state.schemes = schemes
  state.loading = false
  // Set suggestion schemes, including reading from/writing to local storage
  for (const { uri } of schemes.concat({ uri: showWhenExistsKey })) {
    const storageKey = `${schemesKey}-${uri}`, value = localStorage.getItem(storageKey)
    state.suggestionSchemes[uri] = value === "false" ? false : true
    watch(() => state.suggestionSchemes[uri], (value) => {
      localStorage.setItem(storageKey, value)
    })
  }
  // Set suggestion types, including reading from/writing to local storage
  for (const { uri } of jskos.mappingTypes) {
    const storageKey = `${typesKey}-${uri}`, value = localStorage.getItem(storageKey)
    state.suggestionTypes[uri] = value === "false" ? false : true
    watch(() => state.suggestionTypes[uri], (value) => {
      localStorage.setItem(storageKey, value)
    })
  }
  console.timeEnd("Init")
}
