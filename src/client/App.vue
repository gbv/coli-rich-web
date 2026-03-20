<script setup>
import { ref, watch, computed, inject } from "vue"
import { getSubjects, getTitleName, sortSuggestionMappings, suggestionsToPica, getMappingsForSubjects, getConceptData } from "@/utils.js"
import vzg from "../assets/vzg.png"

import * as jskos from "jskos-tools"

import { useUrlHandling } from "@/composables/url-handling.js"
const { updateUrl } = useUrlHandling()

import { useInit } from "@/composables/init.js"
// Run initialization immediately, then wait for the promise later
const initPromise = useInit()

import { useLogin } from "@/composables/login.js"
const { loginConfigured } = useLogin()
const { loggedIn, user } = inject("login-refs")

import { useGoToTop } from "@/composables/go-to-top.js"
const { showGoToTopButton, goToTop } = useGoToTop()

import { useSubmitEnrichments } from "@/composables/submit-enrichments.js"
const { submitEnrichments, successMessage, errorMessage, submitLoading, resetSubmit } = useSubmitEnrichments()

import { version, name, dbKey, showWhenExistsKey, examples, allowedUsers, allowedProviders, isProduction, additionalText } from "@/config.js"

import { isAuthorized } from "../lib/utils.js"
const hasBackendAccess = computed(() => isAuthorized(user.value, { allowedUsers, allowedProviders }))

const ppninput = ref("")

import state from "@/state.js"

const vocabularyFilterShown = ref(false)
const sourceFilterShown = ref(false)
const typeFilterShown = ref(false)

const filterSuggestionsForShowWhenExists = (suggestion) => !state.subjects.find(({ scheme, subjects }) => jskos.compare(suggestion.scheme, scheme) && subjects.length > 0)



// All visible suggestions, filtered by:
// - target vocabulary (Zielvokabular)
// - mapping type
// - source vocabulary (Quellvokabular)
// - "show when exists" flag
const suggestions = computed(() => state.suggestions.filter(suggestion => {

  // Target vocabulary (scheme of the *suggested* concept)
  // Use `!== false` so `undefined` is treated as "allowed" by default.
  const hasAllowedTargetScheme = state.suggestionSchemes[suggestion.scheme.uri]

  // Mapping types
  // Keep the suggestion if *at least one* mapping uses an enabled type.
  const hasAllowedType = suggestion.mappings.some(mapping =>
    state.suggestionTypes[mapping.type[0]],
  )

  // Source vocabularies (fromScheme of mappings)
  // Keep the suggestion if *at least one* mapping has an allowed source scheme.
  const hasAllowedSourceScheme = suggestion.mappings.some(mapping => {
    const uri = mapping._sourceScheme?.uri
    if (!uri || state.suggestionSourceSchemes[uri] === undefined) {
      return true
    }
    return state.suggestionSourceSchemes[uri]
  })

  // If the global flag for this feature is ON, we don't filter here.
  // If it's OFF, we only keep suggestions for schemes where the title
  // has no existing subject indexing.
  const showExists =
    state.suggestionSchemes[showWhenExistsKey] ||
    filterSuggestionsForShowWhenExists(suggestion)

  // Suggestion is visible only if *all* conditions are satisfied.
  return hasAllowedTargetScheme && hasAllowedType && hasAllowedSourceScheme && showExists
}).sort(sortSuggestionMappings))

console.log("All suggestions:", state.suggestions)


const numberOfSuggestionsByScheme = computed(() => {
  const result = {}
  state.schemes.forEach(scheme => {
    result[scheme.uri] = state.suggestions.filter(suggestion => jskos.compare(scheme, suggestion.scheme)).length
  })
  return result
})
const numberOfSuggestionsByType = computed(() => {
  const result = {}
  jskos.mappingTypes.forEach(type => {
    result[type.uri] = state.suggestions.filter(suggestion => suggestion.mappings.find(mapping => mapping.type[0] === type.uri)).length
  })
  return result
})


// All *source* vocabularies that actually appear as fromScheme in the current suggestions. 
// Used to build the "Quellvokabulare filtern" list.
const sourceSchemes = computed(() => {
  const map = new Map()
  state.suggestions.forEach(suggestion => {
    suggestion.mappings.forEach(mapping => {
      const scheme = mapping._sourceScheme
      if (scheme?.uri && !map.has(scheme.uri)) {
        map.set(scheme.uri, scheme)
      }
    })
  })
  return Array.from(map.values())
})

// Ensure that new source schemes default to "active" (true),
// so the modal shows them as checked by default
watch(
  sourceSchemes,
  (schemes) => {
    schemes.forEach(({ uri }) => {
      if (state.suggestionSourceSchemes[uri] === undefined) {
        state.suggestionSourceSchemes[uri] = true
      }
    })
  },
  { immediate: true },
)

// a suggestion is only counted *once per scheme*,
// even if it has multiple mappings from the same source vocabulary.
const numberOfSuggestionsBySourceScheme = computed(() => {
  const result = {}
  state.suggestions.forEach(suggestion => {
    const urisForSuggestion = new Set()
    suggestion.mappings.forEach(mapping => {
      const uri = mapping._sourceScheme?.uri
      if (uri) {
        urisForSuggestion.add(uri)
      }
    })
    urisForSuggestion.forEach(uri => {
      result[uri] = (result[uri] || 0) + 1
    })
  })
  return result
})

const selectedSuggestions = computed(() => suggestions.value.filter(({ selected }) => selected))
const selectedSuggestionsPica = computed(() => {
  return suggestionsToPica({ suggestions: selectedSuggestions.value, ppn: state.ppn })
})

const selectAllSuggestions = computed({
  get() {
    if (!suggestions.value.find(({ selected }) => !selected)) {
      return true
    }
    return false
  },
  set(value) {
    state.suggestions.forEach(suggestion => {
      suggestion.selected = value
    })
  },
})

watch(selectedSuggestions, () => {
  resetSubmit()
})

const showTopSubmitButton = ref(false)
watch([suggestions, selectedSuggestions], () => {
  setTimeout(() => {
    if (document.documentElement.scrollHeight / document.documentElement.clientHeight > 1.4) {
      showTopSubmitButton.value = true
    } else {
      showTopSubmitButton.value = false
    }
  }, 100)
})

watch(() => state.ppn, async (ppn) => {
  resetSubmit()

  await initPromise
  console.log(`Load PPN ${ppn}`)
  console.time(`Load PPN ${ppn}`)

  state.loading = true
  state.loadingPhase = 0
  state.error = false

  state.titleName = ""
  state.subjects = []
  state.mappings = []
  state.suggestions = []
  updateUrl({ ppn })

  // Load title data from CSL2 API
  console.time("Load title data")
  state.loadingPhase = 1
  try {
    state.titleName = await getTitleName(ppn)
    const subjects = await getSubjects(ppn)
    // Save subjects grouped by scheme
    state.subjects = state.schemes.map(scheme => ({ scheme, subjects: subjects.filter(s => jskos.compare(s.inScheme[0], scheme)) })).filter(group => group.subjects.length)
  } catch (error) {
    console.error(error)
    state.error = true
    state.loading = false
    console.timeEnd("Load title data")
    console.timeEnd(`Load PPN ${ppn}`)
    return
  }
  console.timeEnd("Load title data")

  // Load concept data for subjects
  console.time("Load concept data for subjects")
  state.loadingPhase = 2
  try {
    await Promise.all(state.subjects.map(async ({ scheme, subjects }) => {
      if (!scheme.API?.length || !scheme._registry) {
        return
      }
      const concepts = await getConceptData({ concepts: subjects, scheme })
      concepts.forEach(concept => {
        const subject = subjects.find(s => jskos.compare(s, concept))
        if (subject) {
          subject.prefLabel = concept.prefLabel
        }
      })
    }))
  } catch (error) {
    console.error("Error loading concept data", error)
    // Error is not critical
  }
  console.timeEnd("Load concept data for subjects")

  // Load mappings for subjects
  console.time("Load mappings")
  state.loadingPhase = 3
  const subjects = state.subjects.reduce((prev, cur) => prev.concat(cur.subjects), [])
  const subjectPrefLabelByUri = new Map(
    subjects
      .filter(s => s?.uri && s?.prefLabel)
      .map(s => [s.uri, s.prefLabel]),
  )
  const mappings = await getMappingsForSubjects(subjects)
  // TODO: This needs to be fixed in the data!
  const mappingsWithoutType = mappings.filter(mapping => !mapping.type?.[0])
  if (mappingsWithoutType.length) {
    console.warn("The following mappings without a mapping type were loaded and need to be fixed:", mappingsWithoutType.map(m => m.uri))
  }
  mappingsWithoutType.forEach(mapping => {
    mapping.type = [jskos.defaultMappingType.uri]
  })
  // Supplement mappings with scheme data (including determining notations)
  mappings.forEach(mapping => {
    ["from", "to"].forEach(side => {
      mapping[`${side}Scheme`] = state.schemes.find(scheme => jskos.compare(scheme, mapping[`${side}Scheme`])) || mapping[`${side}Scheme`]
      const scheme = new jskos.ConceptScheme(mapping[`${side}Scheme`])
      jskos.conceptsOfMapping(mapping, side).forEach(concept => {
        if (!concept.notation?.[0]) {
          const notation = scheme.notationFromUri(concept.uri)
          if (notation) {
            concept.notation = [notation]
          }
        }
      })
    })
  })

  // Determine effective mapping direction for this title:
  // source = side that matches title subjects, target = the other side
  mappings.forEach(mapping => {
    const fromConcept = jskos.conceptsOfMapping(mapping, "from")[0]
    const toConcept = jskos.conceptsOfMapping(mapping, "to")[0]

    const fromIsOnTitle = fromConcept && jskos.isContainedIn(fromConcept, subjects)
    const toIsOnTitle = toConcept && jskos.isContainedIn(toConcept, subjects)

    const sourceSide =
    fromIsOnTitle && !toIsOnTitle ? "from"
      : (!fromIsOnTitle && toIsOnTitle ? "to"
        : "from") // fallback if ambiguous

    const targetSide = sourceSide === "from" ? "to" : "from"

    mapping._sourceSide = sourceSide
    mapping._targetSide = targetSide
    mapping._sourceScheme = mapping[`${sourceSide}Scheme`]
    mapping._targetScheme = mapping[`${targetSide}Scheme`]
    mapping._sourceConcept = jskos.conceptsOfMapping(mapping, sourceSide)[0]
    // copy prefLabel from title subjects if missing
    if (mapping._sourceConcept) {
      mapping._sourceConcept = {
        ...mapping._sourceConcept,
        inScheme: [mapping._sourceScheme],
      }
      if (!mapping._sourceConcept.prefLabel && subjectPrefLabelByUri.has(mapping._sourceConcept.uri)) {
        mapping._sourceConcept.prefLabel = subjectPrefLabelByUri.get(mapping._sourceConcept.uri)
      }
    }
    if (mapping._targetConcept) {
      mapping._targetConcept = {
        ...mapping._targetConcept,
        inScheme: [mapping._targetScheme],
      }
    }
    mapping._targetConcept = jskos.conceptsOfMapping(mapping, targetSide)[0]
  })

  state.mappings = mappings
  const suggestions = []
  for (const mapping of mappings) {
    const targetSide = ["from", "to"].find(side => jskos.conceptsOfMapping(mapping, side).filter(concept => jskos.isContainedIn(concept, subjects)).length === 0)
    let target = jskos.conceptsOfMapping(mapping, targetSide)[0]
    const targetScheme = mapping[`${targetSide}Scheme`]
    if (!target || !targetScheme) {
      continue
    }
    target = {
      ...target,
      inScheme: [targetScheme],
    }
    const existingSuggestion = suggestions.find(s => jskos.compare(s.target, target))
    if (existingSuggestion) {
      existingSuggestion.mappings.push(mapping)
    } else {
      suggestions.push({
        target,
        scheme: targetScheme,
        mappings: [mapping],
        selected: false,
      })
    }
  }
  state.suggestions = suggestions
  console.log(suggestions)
  console.timeEnd("Load mappings")

  // Load concept data for mappings
  console.time("Load concept data for mappings")
  state.loadingPhase = 4
  const suggestionsGroupedByScheme = state.schemes.map(scheme => ({ scheme, concepts: suggestions.filter(suggestion => jskos.compare(suggestion.scheme, scheme)).map(({ target }) => target) })).filter(group => group.concepts.length)
  // TODO: Fix code repetition from above
  await Promise.all(suggestionsGroupedByScheme.map(async ({ scheme, concepts: conceptsToLoad }) => {
    console.log(scheme, conceptsToLoad)
    if (!scheme.API?.length || !scheme._registry) {
      return
    }
    let concepts
    try {
      concepts = await getConceptData({ concepts: conceptsToLoad, scheme })
    } catch (error) {
      console.warn(`Could not load concept data for ${jskos.notation(scheme)} concepts`, error)
      return []
    }
    concepts.forEach(loadedConcept => {
      const concept = conceptsToLoad.find(s => jskos.compare(s, loadedConcept))
      if (concept) {
        concept.prefLabel = loadedConcept.prefLabel
      }
    })
  }))
  console.timeEnd("Load concept data for mappings")
  
  state.loading = false
  state.loadingPhase = 10
  console.timeEnd(`Load PPN ${ppn}`)
})

const sourceSchemeNotations = (mappings = []) => {
  const set = new Set()
  mappings.forEach(m => {
    const n = m?._sourceScheme ? jskos.notation(m._sourceScheme) : null
    if (n) {
      set.add(n)
    }
  })
  return Array.from(set).join(", ")
}

</script>

<template>
  <div
    v-if="showGoToTopButton"
    class="goToTopButton">
    <button 
      class="button"
      @click="goToTop">
      nach oben <i-mdi-arrow-up-drop-circle />
    </button>
  </div>
  <div>
    <header class="header">
      <a
        class="coli-conc-logo-small">
        <img
          src="https://coli-conc.gbv.de/images/coli-conc.svg"
          alt="coli-conc Logo">
      </a>
      <ul class="menu">
        <li>
          <a
            href="https://coli-conc.gbv.de/coli-rich/"
            title="Go to coli-conc website"
            class="back-to-coli-conc">
            ⬅ zurück zur coli-conc Webseite
          </a>
        </li>
        <li 
          v-if="loginConfigured"
          style="position: relative;">
          <user-status>
            <template
              v-if="loggedIn"
              #after>
              <hr>
              <p 
                v-if="hasBackendAccess"
                style="color: green;">
                Schreibberechtigung ist vorhanden.
              </p>
              <p
                v-else
                style="color: red;">
                Keine Schreibberechtigung.
              </p>
            </template>
          </user-status>
          <div 
            v-if="!hasBackendAccess"
            style="position: absolute; top: 0; right: 5px; z-index: 10000; color: red;">
            ●
          </div>
        </li>
      </ul>
      <div style="clear:both" />
    </header>
    <main id="main">
      <!-- Empty div here to start the alternating section colors -->
      <div />
      <h1 class="main_title">
        coli-rich
      </h1>
      <div class="service">
        <span>Ein Service der</span>
        <a
          href="https://en.gbv.de/informations/Verbundzentrale-en"
          target="_blank"
          rel="noopener">
          <img
            :src="vzg"
            alt="VZG Logo"
            class="vzg-logo">
        </a>
      </div>
      <p class="subtitle">
        Semi-automatische Eintragung von Sacherschließungsdaten in den K10plus.
      </p>
      <div class="section">
        <p>
          Hier können Titeldaten aus der <a href="https://uri.gbv.de/database/{{dbkey}}">Datenbank {{ dbKey }}</a> abgerufen werden, um diese mit Sacherschließungsdaten auf Basis von coli-conc-Mappings anzureichern. Falls Sie unter den Vorschlägen kein passendes Mapping finden, können Sie im
          <a
            href="https://coli-conc.gbv.de/cocoda/app/"
            target="_blank">Mapping-Tool Cocoda</a>
          ein neues Mapping für Ihr Konzept erstellen und dieses direkt (nach neuladen dieser Seite) zur Eintragung in der coli-rich-Webanwendung übernehmen
        </p>
        <div
          v-if="additionalText"
          v-html="additionalText" />
        <p v-else-if="isProduction">
          <!-- TODO: Adjust production text -->
          <a href="./enrichment/">Vorgemerkte Anreicherungen</a> 
          werden regelmäßig in die Datenbank übernommen. Da dieses Tool noch in der Entwicklung ist, kann sich dies verzögern.
        </p>
        <p v-else>
          Dies ist eine Entwicklungsinstanz und kann zur Demonstration verwendet werden. 
          <a href="./enrichment/">Vorgemerkte Anreicherungen</a> werden noch nicht in die Datenbank übernommen.
        </p>

        <div class="searchSection">
          <div class="searchBar">
            <h2 class="searchTitle">
              Titeldaten anreichern
            </h2>
            <div class="searchControls">
              <input
                v-model="ppninput"
                type="text"
                placeholder="PPN"
                @keyup.enter="!state.loading && (state.ppn = ppninput)">
              <button 
                class="button"
                :disabled="state.loading || !ppninput"
                @click="state.ppn = ppninput">
                <i-mdi-clipboard-search /> Laden
              </button>
            </div>
          </div>
        </div>
        <div class="loading-info">
          <div v-if="!state.loading">
            <div v-if="examples.length">
              Beispiele:
              <template
                v-for="(ppn, index) in examples"
                :key="ppn">
                <a
                  href=""
                  @click.prevent="state.ppn = ppn">
                  {{ ppn }}
                </a>
                <template v-if="index < examples.length - 1">
                  ·
                </template>
              </template>
            </div>
          </div>
          <div
            v-else>
            <loading-indicator
              style="--jskos-vue-loadingIndicator-secondary-color: #B13F12;" />
            <div v-if="state.loadingPhase === 1">
              Titeldaten werden geladen...
            </div>
            <div v-if="state.loadingPhase === 2">
              Konzeptdaten für Sacherschließung werden geladen...
            </div>
            <div v-if="state.loadingPhase === 3">
              Anreicherungsvorschläge auf Basis von Mappings werden geladen...
            </div>
            <div v-if="state.loadingPhase === 4">
              Konzeptdaten für Anreicherungsvorschläge werden geladen...
            </div>
          </div>
        </div>

        <h2 v-if="state.ppn && state.loadingPhase >= 1">
          Titeldaten
        </h2>
        <table v-if="state.ppn && state.loadingPhase > 1 && (state.titleName || state.subjects?.length)">
          <tbody>
            <tr>
              <th style="max-width: 30%;">
                PPN
              </th>
              <td>
                <a
                  target="_blank"
                  :href="'https://opac.k10plus.de/DB=2.299/PPNSET?PPN='+ state.ppn"><i-mdi-file /> {{ state.ppn }}</a>
              </td>
            </tr>
            <tr v-if="state.titleName">
              <th>Titel</th>
              <td>{{ state.titleName }}</td>
            </tr>
            <tr>
              <th>Sacherschließung</th>
              <td>
                <ul class="plainList">
                  <li
                    v-for="{ scheme, subjects } in state.subjects"
                    :key="scheme.uri">
                    <b>{{ scheme.VOC.toUpperCase() }}:</b> {{ subjects.map(subject => `${jskos.notation(subject)} ${jskos.prefLabel(subject, { fallbackToUri: false })}`).join(", ") }}
                  </li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="state.error">
          Fehler beim Laden von Titeldaten zu {{ state.ppn }}.
        </p>
        <p v-else-if="state.ppn && state.loadingPhase > 1 && !state.titleName">
          Keine Titeldaten zu {{ state.ppn }} gefunden.
        </p>
        <p v-else-if="state.loadingPhase === 1">
          <loading-indicator
            style="margin-left: 10px; --jskos-vue-loadingIndicator-secondary-color: #B13F12;" />
        </p>
        <template v-if="showTopSubmitButton && state.ppn && state.loadingPhase > 3">
          <p v-if="hasBackendAccess">
            <button 
              class="button"
              :disabled="!!(selectedSuggestions.length === 0 || submitLoading || successMessage)"
              @click="submitEnrichments(state.ppn, selectedSuggestions)">
              {{ selectedSuggestions.length }} {{ selectedSuggestions.length === 1 ? "Vorschlag" : "Vorschläge" }} in Datenbank eintragen
            </button>
            <loading-indicator
              v-if="submitLoading"
              style="margin-left: 10px; --jskos-vue-loadingIndicator-secondary-color: #B13F12;" />
            {{ successMessage || errorMessage || "" }}
          </p>
          <p v-else>
            Keine Berechtigung zur Eintragung vorhanden.
          </p>
        </template>
        <h2 v-if="state.ppn && state.loadingPhase >= 3">
          Mögliche Anreicherungen
        </h2>
        <table v-if="state.ppn && state.loadingPhase > 3 && suggestions.length">
          <thead>
            <tr>
              <th>
                <input
                  v-model="selectAllSuggestions"
                  type="checkbox">
              </th>
              <th style="white-space: nowrap;">
                Quellvokabular
                <a
                  href=""
                  title="Quellvokabulare filtern"
                  @click.prevent="sourceFilterShown = true">
                  <i-mdi-filter-check
                    v-if="Object.values(state.suggestionSourceSchemes).findIndex(value => value === false) === -1" />
                  <i-mdi-filter-minus v-else />
                </a>
              </th>
              <th style="white-space: nowrap;">
                Quellnotation/Begriff
                <a
                  href=""
                  title="Vorschlagsvokabulare filtern"
                  @click.prevent="vocabularyFilterShown = true">
                  <i-mdi-filter-check
                    v-if="Object.values(state.suggestionSchemes).findIndex(value => value === false) === -1" />
                  <i-mdi-filter-minus v-else />
                </a>
              </th>
              <th style="min-width: 50%; white-space: nowrap;">
                Mapping Vorschlag
                <!-- Mapping-type filter -->
                <a
                  href=""
                  title="Mappingtypen filtern"
                  @click.prevent="typeFilterShown = true">
                  <i-mdi-filter-check
                    v-if="Object.values(state.suggestionTypes).findIndex(value => value === false) === -1" />
                  <i-mdi-filter-minus v-else />
                </a>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="({ target, mappings }, index) in suggestions"
              :key="target.uri">
              <td>
                <input
                  v-model="suggestions[index].selected"
                  type="checkbox">
              </td>
              <td>{{ sourceSchemeNotations(mappings) }}</td>
              <td><b>{{ jskos.notation(mappings[0]._sourceConcept) }}</b> {{ jskos.prefLabel(mappings[0]._sourceConcept, { fallbackToUri: false }) }}</td>
              <td>
                <ul class="plainList">
                  <li
                    v-for="mapping in mappings"
                    :key="mapping.uri"
                    :class="{
                      faded: !state.suggestionTypes[mapping.type[0]] ||
                        (mapping._sourceScheme?.uri &&
                          state.suggestionSourceSchemes[mapping._sourceScheme.uri] === false),
                    }">
                    {{ jskos.notation(mapping._targetScheme) }}
                    <b>{{ jskos.notation(mapping._targetConcept) }}</b>
                    {{ jskos.prefLabel(target, { fallbackToUri: false }) }}
                    <a
                      :href="`https://coli-conc.gbv.de/data/?uri=${mapping.uri}`"
                      target="_blank">Details</a>
                  </li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="state.ppn && state.loadingPhase > 3 && suggestions.length === 0">
          Keine Anreicherungen verfügbar.
          <template v-if="state.suggestions.length">
            {{ state.suggestions.length }} Anreicherungen wurden herausgefiltert:
            <a
              href=""
              @click.prevent="sourceFilterShown = true">Quellvokabulare-Filter prüfen <i-mdi-filter /></a> ·
            <a
              href=""
              @click.prevent="vocabularyFilterShown = true">Sacherschließung-Filter prüfen <i-mdi-filter /></a>
            ·
            <a
              href=""
              @click.prevent="typeFilterShown = true">Mapping Vorschläge-Filter prüfen <i-mdi-filter /></a>
          </template>
        </p>
        <p v-else-if="state.loadingPhase === 3">
          <loading-indicator
            style="margin-left: 10px; --jskos-vue-loadingIndicator-secondary-color: #B13F12;" />
        </p>
        <div v-if="state.ppn && state.loadingPhase > 3">
          <h2>Ausgewählte Anreicherungen in PICA</h2>
          <!-- TODO: Code duplication for button and PICA data from above -->
          <pre style="font-weight: 400; font-size: 14px; overflow-x: scroll;"><code>{{ selectedSuggestionsPica }}</code></pre>
          <p v-if="hasBackendAccess">
            <button 
              class="button"
              :disabled="!!(selectedSuggestions.length === 0 || submitLoading || successMessage)"
              @click="submitEnrichments(state.ppn, selectedSuggestions)">
              {{ selectedSuggestions.length }} {{ selectedSuggestions.length === 1 ? "Vorschlag" : "Vorschläge" }} in Datenbank eintragen
            </button>
            <loading-indicator
              v-if="submitLoading"
              style="margin-left: 10px; --jskos-vue-loadingIndicator-secondary-color: #B13F12;" />
            {{ successMessage || errorMessage || "" }}
          </p>
          <p v-else>
            Keine Berechtigung zur Eintragung vorhanden.
          </p>
        </div>
      </div>
    </main>
    <footer class="footer">
      <p>
        <b>{{ name }}</b> (Version {{ version }}) ist Teil des <a href="https://coli-conc.gbv.de/">coli-conc Projekts</a>. Der Quellcode und die technische Dokumentation werden über <a
          href="https://github.com/gbv/coli-rich-web"
          target="_blank">GitHub</a> bereitgestellt. Dieses Tool ist noch in der Entwicklungsphase.
      </p>
      <p>
        <b>coli-conc</b> ist ein Projekt der <a
          href="https://www.gbv.de/"
          target="_blank">Verbundzentrale des GBV (VZG)</a>. Es wurde gefördert von der Deutschen Forschungsgemeinschaft (DFG) in
        <a
          href="https://gepris.dfg.de/gepris/projekt/276843344"
          target="_blank">2015-2019</a>
        und
        <a
          href="https://gepris.dfg.de/gepris/projekt/455051200"
          target="_blank">2021-2023</a>.
      </p>
      <p>
        <a
          href="https://www.gbv.de/impressum"
          target="_blank">Impressum</a> |
        <a href="https://coli-conc.gbv.de/erklaerung-zur-barrierefreiheit/">Barrierefreiheit</a> |
        <a
          href="https://www.gbv.de/datenschutz"
          target="_blank">Datenschutz</a>
      </p>
    </footer>
  </div>
  <!-- Source Vocabulary filter modal -->
  <modal
    v-model="sourceFilterShown"
    style="--jskos-vue-modal-bgColor: #F5F3F3;">
    <template #header>
      <h1 style="padding: 0;">
        Quellvokabulare filtern
      </h1>
    </template>
    <div style="padding: 20px;">
      Zeige Anreicherungen basierend auf folgenden Quellvokabularen:
      <ul class="plainList">
        <li>
          <!-- Bulk enable/disable all source schemes that are actually present -->
          <a
            href=""
            @click.prevent="sourceSchemes.forEach(({ uri }) => {
              state.suggestionSourceSchemes[uri] = true
            })">
            alle aktivieren
          </a>
          ·
          <a
            href=""
            @click.prevent="sourceSchemes.forEach(({ uri }) => {
              state.suggestionSourceSchemes[uri] = false
            })">
            alle deaktivieren
          </a>
        </li>
        <li
          v-for="scheme in sourceSchemes.slice().sort((a, b) => {
            // Sort by number of affected suggestions (desc)
            const aSuggestions = numberOfSuggestionsBySourceScheme[a.uri] || 0
            const bSuggestions = numberOfSuggestionsBySourceScheme[b.uri] || 0
            if (aSuggestions > bSuggestions) return -1
            if (aSuggestions < bSuggestions) return 1
            return 0
          })"
          :key="scheme.uri"
          style="user-select: none;"
          :class="{
            // Grey-out schemes that currently don't affect any suggestion
            faded: (numberOfSuggestionsBySourceScheme[scheme.uri] || 0) === 0,
          }">
          <input
            :id="`state.suggestionSourceSchemes-${scheme.uri}`"
            v-model="state.suggestionSourceSchemes[scheme.uri]"
            type="checkbox">
          <label :for="`state.suggestionSourceSchemes-${scheme.uri}`">
            {{ jskos.notation(scheme) }}
            {{ jskos.prefLabel(scheme, { fallbackToUri: false }) }}
            ({{ numberOfSuggestionsBySourceScheme[scheme.uri] || 0 }})
          </label>
        </li>
      </ul>
      <p>
        <small>
          Anreicherungen werden ausgeblendet, wenn alle zugehörigen Mappings
          aus deaktivierten Quellvokabularen stammen (linke Seite des Mappings).
        </small>
      </p>
    </div>
  </modal>

  <!-- Vokabulary filter modal -->
  <modal
    v-model="vocabularyFilterShown"
    style="--jskos-vue-modal-bgColor: #F5F3F3;">
    <template #header>
      <h1 style="padding: 0;">
        Sacherschließung filtern
      </h1>
    </template>
    <div style="padding: 20px;">
      Zeige Anreicherungen aus den folgenden Vokabularen:
      <ul class="plainList">
        <li>
          <a
            href=""
            @click.prevent="state.schemes.forEach(({ uri }) => {
              state.suggestionSchemes[uri] = true
            })">
            alle aktivieren
          </a>
          ·
          <a
            href=""
            @click.prevent="state.schemes.forEach(({ uri }) => {
              state.suggestionSchemes[uri] = false
            })">
            alle deaktivieren
          </a>
        </li>
        <li 
          v-for="scheme in state.schemes.slice().sort((a, b) => {
            const aSuggestions = numberOfSuggestionsByScheme[a.uri]
            const bSuggestions = numberOfSuggestionsByScheme[b.uri]
            if (aSuggestions > bSuggestions) {
              return -1
            }
            if (aSuggestions < bSuggestions) {
              return 1
            }
            return 0
          })"
          :key="scheme.uri"
          style="user-select: none;"
          :class="{
            faded: numberOfSuggestionsByScheme[scheme.uri] === 0,
          }">
          <input
            :id="`state.suggestionSchemes-${scheme.uri}`"
            v-model="state.suggestionSchemes[scheme.uri]"
            type="checkbox">
          <label
            :for="`state.suggestionSchemes-${scheme.uri}`">
            {{ jskos.notation(scheme) }} {{ jskos.prefLabel(scheme, { fallbackToUri: false }) }} ({{ numberOfSuggestionsByScheme[scheme.uri] }})
          </label>
        </li>
      </ul>
      <p>
        <input
          :id="`state.suggestionSchemes-${showWhenExistsKey}`"
          v-model="state.suggestionSchemes[showWhenExistsKey]"
          type="checkbox">
        <label :for="`state.suggestionSchemes-${showWhenExistsKey}`">
          Zeige Anreicherungen für Vokabulare mit existierender Sacherschließung ({{ state.suggestions.filter(suggestion => !filterSuggestionsForShowWhenExists(suggestion)).length }})
        </label>
        <br>
        <small>
          Wenn deaktiviert werden Anreicherungsvorschläge von Vokabularen, zu denen schon Sacherschließung auf dem Titel existiert, ausgeblendet.
        </small>
      </p>
    </div>
  </modal>

  <!-- Type filter modal -->
  <modal
    v-model="typeFilterShown"
    style="--jskos-vue-modal-bgColor: #F5F3F3;">
    <template #header>
      <h1 style="padding: 0;">
        Mappingtypen filtern
      </h1>
    </template>
    <div style="padding: 20px;">
      Zeige Anreicherungen basierend auf folgenden Mappingtypen:
      <ul class="plainList">
        <li>
          <a
            href=""
            @click.prevent="jskos.mappingTypes.forEach(({ uri }) => {
              state.suggestionTypes[uri] = true
            })">
            alle aktivieren
          </a>
          ·
          <a
            href=""
            @click.prevent="jskos.mappingTypes.forEach(({ uri }) => {
              state.suggestionTypes[uri] = false
            })">
            alle deaktivieren
          </a>
          ·
          <a 
            href=""
            title="Mapping-Typen < und = sind geeignet für die automatische Anreicherung"
            @click.prevent="jskos.mappingTypes.forEach(({ uri }) => {
              state.suggestionTypes[uri] = (uri === 'http://www.w3.org/2004/02/skos/core#exactMatch' || uri === 'http://www.w3.org/2004/02/skos/core#narrowMatch') ? true : false
            })">
            nur ≤ aktivieren
          </a>
        </li>
        <li 
          v-for="type in jskos.mappingTypes.slice().sort((a, b) => {
            const aSuggestions = numberOfSuggestionsByType[a.uri]
            const bSuggestions = numberOfSuggestionsByType[b.uri]
            if (aSuggestions > bSuggestions) {
              return -1
            }
            if (aSuggestions < bSuggestions) {
              return 1
            }
            return 0
          })"
          :key="type.uri"
          style="user-select: none;"
          :class="{
            faded: numberOfSuggestionsByType[type.uri] === 0,
          }">
          <input
            :id="`state.suggestionTypes-${type.uri}`"
            v-model="state.suggestionTypes[type.uri]"
            type="checkbox">
          <label
            :for="`state.suggestionTypes-${type.uri}`">
            {{ jskos.notation(type) }} {{ jskos.prefLabel(type, { fallbackToUri: false }) }} ({{ numberOfSuggestionsByType[type.uri] }})
          </label>
        </li>
      </ul>
    </div>
  </modal>
</template>

<style>
header > h1 {
  float: left;
  padding: 18px 0 0 20px;
  font-size: 24px;
}
.plainList {
  list-style: none !important;
  margin: 0; 
  padding: 0;
}
.button {
  margin: 0 10px;
  padding: 4px 20px;
}
/* TODO: This should probably be part of the base coli-conc.gbv.de style */
.button:disabled {
  background-color: grey;
}
.button:disabled:hover {
  cursor: default;
}
.faded {
  color: grey;
}
/* UserStatus style fixes */
.user-status {
  z-index: 9999;
}
.user-status > a {
  font-size: initial;
}
header .user-status li {
  float: none;
}
header .user-status li a {
  text-align: left;
}
.goToTopButton {
  position: fixed;
  bottom: 10px;
  right: -10px;
  font-size: 24px;
  z-index: 1;
}
.back-to-coli-conc {
  font-size: 20px;
}
.service {
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 10px;
}
.subtitle {
  text-align: center;
  font-size: 25px;
  font-weight: 700;
  margin-top: 60px;
}
.main_title {
  color: #b13f13;
  font-size: 45px;
  margin: 10px 0 12px 0;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
}
.vzg-logo {
  height: 35px;
  width: auto;
}
.section {
  margin: 50px 0 20px 0;
  padding: 18.96px 190px;
  font-size: 20px;
}
.section:nth-child(2n+3) {
  background-color: transparent;
}
.searchSection {
  max-width: 900px;
  width: calc(100% - 32px);
  padding: 0 46px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
  min-height: 120px;
  display: flex;
  align-items: center;
  margin: 0 auto;
}
.searchSection>* {
  width: 100%;
}
.searchBar {
  display: flex;
  align-items: center;
  gap: 26px;
  width: 100%;
  flex-wrap: nowrap;
}
.searchSection h2.searchTitle {
  margin: 0;
  font-size: 23px !important;
  font-weight: 900;
  color: #b13f13;
  line-height: 1.1;
  white-space: nowrap;
}
.searchControls {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: nowrap;
}

.searchControls input[type="text"] {
  width: 420px;
  height: 42px;
  padding: 0 14px;
  border: 1px solid #111;
  border-radius: 7px;
  outline: none;
  font-size: 16px;
}

.searchControls input[type="text"]:focus {
  box-shadow: 0 0 0 3px rgba(177, 63, 19, 0.15);
}

.searchSection .button {
  margin: 0;
  height: 42px;
  padding: 0 22px;
  border-radius: 999px;
  background: #a6521b;
  color: #fff;
  font-weight: 700;
  font-size: 16px;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.searchSection .button:hover {
  filter: brightness(0.95);
}

.searchSection .button:disabled {
  background: #b9b0ab;
  cursor: not-allowed;
}
.loading-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 20px;
}
.footer {
  background-color: #e9e1e1;
  padding-top: 60px;
}
</style>
