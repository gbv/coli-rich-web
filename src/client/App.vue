<script setup>
import { ref, watch, computed, inject } from "vue"
import { getSubjects, getTitleName, sortSuggestionMappings, suggestionsToPica, getMappingsForSubjects, getConceptData } from "@/utils.js"

import * as jskos from "jskos-tools"
import vzg from "../assets/vzg.png"


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
const typeFilterShown = ref(false)

const filterSuggestionsForShowWhenExists = (suggestion) => !state.subjects.find(({ scheme, subjects }) => jskos.compare(suggestion.scheme, scheme) && subjects.length > 0)

const suggestions = computed(() => state.suggestions.filter(
  suggestion => state.suggestionSchemes[suggestion.scheme.uri] && suggestion.mappings.filter(mapping => state.suggestionTypes[mapping.type[0]]).length && (state.suggestionSchemes[showWhenExistsKey] || filterSuggestionsForShowWhenExists(suggestion)),
).sort(sortSuggestionMappings))

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

</script>

<template>
  <div class="appRoot">

    <div v-if="showGoToTopButton" class="goToTopButton">
      <button class="button" @click="goToTop">
        nach oben <i-mdi-arrow-up-drop-circle />
      </button>
    </div>

    <div class="pageWrapper">
      <header class="header">
        <div class="coli-conc-logo-small">
          <img src="https://coli-conc.gbv.de/images/coli-conc.svg" alt="coli-conc Logo">
        </div>
        <ul class="menu">
          <li>
            <a href="https://coli-conc.gbv.de/coli-rich/" title="Go to coli-rich website">
              ⬅ zurück zur coli-rich Webseite
            </a>
          </li>

          <li v-if="loginConfigured" style="position: relative;">
            <user-status>
              <template v-if="loggedIn" #after>
                <hr>
                <p v-if="hasBackendAccess" style="color: green;">
                  Schreibberechtigung ist vorhanden.
                </p>
                <p v-else style="color: red;">
                  Keine Schreibberechtigung.
                </p>
              </template>
            </user-status>

            <div v-if="!hasBackendAccess" style="position: absolute; top: 0; right: 5px; z-index: 10000; color: red;">
              ●
            </div>
          </li>
        </ul>
        <div style="clear:both" />
      </header>

      <main id="main">
        <!-- Empty div here to start the alternating section colors -->
        <div />
        <div>
          <h1>coli-rich</h1>
          <div class="service">
            <span>Ein Service der</span>
            <a href="https://en.gbv.de/informations/Verbundzentrale-en" target="_blank" rel="noopener">
              <img :src="vzg" alt="VZG Logo" class="vzg-logo">
            </a>
          </div>
          <p class="subtitle">Semi-automatische Eintragung von Sacherschließungsdaten in den K10plus.</p>
          <div class="section">
            <p>
              Hier können Titeldaten aus der <a href="https://uri.gbv.de/database/{{dbkey}}">Datenbank {{ dbKey }}</a>
              abgerufen
              werden, um diese mit Sacherschließungsdaten auf Basis von coli-conc-Mappings anzureichern. Falls Sie unter
              den
              Vorschlägen kein passendes Mapping finden, können Sie im
              <a href="https://coli-conc.gbv.de/cocoda/app/" target="_blank">Mapping-Tool Cocoda</a>
              ein neues Mapping für Ihr Konzept erstellen und dieses direkt (nach neuladen dieser Seite) zur Eintragung
              in
              der
              coli-rich-Webanwendung übernehmen
            </p>

            <div v-if="additionalText" v-html="additionalText" />

            <p v-else-if="isProduction">
              <a href="./enrichment/">Vorgemerkte Anreicherungen</a>
              werden regelmäßig in die Datenbank übernommen. Da dieses Tool noch in der Entwicklung ist, kann sich dies
              verzögern.
            </p>

            <p v-else>
              Dies ist eine Entwicklungsinstanz und kann zur Demonstration verwendet werden.
              <a href="./enrichment/">Vorgemerkte Anreicherungen</a> werden noch nicht in die Datenbank übernommen.
            </p>
          </div>
        </div>

        <div class="searchSection">
          <div class="searchBar">
            <h2 class="searchTitle">
              Titeldaten anreichern
            </h2>

            <div class="searchControls">
              <input v-model="ppninput" type="text" placeholder="PPN"
                @keyup.enter="!state.loading && (state.ppn = ppninput)">

              <button class="button" :disabled="state.loading || !ppninput" @click="state.ppn = ppninput">
                <i-mdi-clipboard-search /> Laden
              </button>
            </div>
          </div>

          <div class="searchMeta">
            <template v-if="!state.loading">
              <span v-if="examples.length">
                Beispiele:
                <template v-for="(ppn, index) in examples" :key="ppn">
                  <a href="" @click.prevent="state.ppn = ppn">
                    {{ ppn }}
                  </a>
                  <template v-if="index < examples.length - 1">
                    ·
                  </template>
                </template>
              </span>
            </template>

            <template v-else>
              <loading-indicator style="margin-left: 10px; --jskos-vue-loadingIndicator-secondary-color: #B13F12;" />
              <span v-if="state.loadingPhase === 1">
                Titeldaten werden geladen...
              </span>
              <span v-if="state.loadingPhase === 2">
                Konzeptdaten für Sacherschließung werden geladen...
              </span>
              <span v-if="state.loadingPhase === 3">
                Anreicherungsvorschläge auf Basis von Mappings werden geladen...
              </span>
              <span v-if="state.loadingPhase === 4">
                Konzeptdaten für Anreicherungsvorschläge werden geladen...
              </span>
            </template>
          </div>
        </div>
      </main>

      <footer class="footer">
        <p>
          <b>{{ name }}</b> (Version {{ version }}) ist Teil des <a href="https://coli-conc.gbv.de/">coli-conc
            Projekts</a>.
          Der Quellcode und die technische Dokumentation werden über <a href="https://github.com/gbv/coli-rich-web"
            target="_blank">GitHub</a> bereitgestellt. Dieses Tool ist noch in der Entwicklungsphase.
        </p>
        <p>
          <b>coli-conc</b> ist ein Projekt der <a href="https://www.gbv.de/" target="_blank">Verbundzentrale des GBV
            (VZG)</a>. Es wurde gefördert von der Deutschen Forschungsgemeinschaft (DFG) in
          <a href="https://gepris.dfg.de/gepris/projekt/276843344" target="_blank">2015-2019</a>
          und
          <a href="https://gepris.dfg.de/gepris/projekt/455051200" target="_blank">2021-2023</a>.
        </p>
        <p>
          <a href="https://www.gbv.de/impressum" target="_blank">Impressum</a> |
          <a href="https://coli-conc.gbv.de/erklaerung-zur-barrierefreiheit/">Barrierefreiheit</a> |
          <a href="https://www.gbv.de/datenschutz" target="_blank">Datenschutz</a>
        </p>
      </footer>
    </div>

    <modal v-model="vocabularyFilterShown" style="--jskos-vue-modal-bgColor: #F5F3F3;">
      <template #header>
        <h1 style="padding: 0;">
          Zielvokabulare filtern
        </h1>
      </template>
      <div style="padding: 20px;">
        Zeige Anreicherungen aus den folgenden Vokabularen:
        <ul class="plainList">
          <li>
            <a href="" @click.prevent="state.schemes.forEach(({ uri }) => { state.suggestionSchemes[uri] = true })">
              alle aktivieren
            </a>
            ·
            <a href="" @click.prevent="state.schemes.forEach(({ uri }) => { state.suggestionSchemes[uri] = false })">
              alle deaktivieren
            </a>
          </li>
          <li v-for="scheme in state.schemes.slice().sort((a, b) => {
            const aSuggestions = numberOfSuggestionsByScheme[a.uri]
            const bSuggestions = numberOfSuggestionsByScheme[b.uri]
            if (aSuggestions > bSuggestions) return -1
            if (aSuggestions < bSuggestions) return 1
            return 0
          })" :key="scheme.uri" style="user-select: none;"
            :class="{ faded: numberOfSuggestionsByScheme[scheme.uri] === 0 }">
            <input :id="`state.suggestionSchemes-${scheme.uri}`" v-model="state.suggestionSchemes[scheme.uri]"
              type="checkbox">
            <label :for="`state.suggestionSchemes-${scheme.uri}`">
              {{ jskos.notation(scheme) }} {{ jskos.prefLabel(scheme, { fallbackToUri: false }) }} ({{
                numberOfSuggestionsByScheme[scheme.uri] }})
            </label>
          </li>
        </ul>
        <p>
          <input :id="`state.suggestionSchemes-${showWhenExistsKey}`"
            v-model="state.suggestionSchemes[showWhenExistsKey]" type="checkbox">
          <label :for="`state.suggestionSchemes-${showWhenExistsKey}`">
            Zeige Anreicherungen für Vokabulare mit existierender Sacherschließung ({{
              state.suggestions.filter(suggestion =>
                !filterSuggestionsForShowWhenExists(suggestion)).length}})
          </label>
          <br>
          <small>
            Wenn deaktiviert werden Anreicherungsvorschläge von Vokabularen, zu denen schon Sacherschließung auf dem
            Titel
            existiert, ausgeblendet.
          </small>
        </p>
      </div>
    </modal>

    <modal v-model="typeFilterShown" style="--jskos-vue-modal-bgColor: #F5F3F3;">
      <template #header>
        <h1 style="padding: 0;">
          Mappingtypen filtern
        </h1>
      </template>
      <div style="padding: 20px;">
        Zeige Anreicherungen basierend auf folgenden Mappingtypen:
      </div>
    </modal>

  </div>
</template>

<style>
.coli-conc-logo-small img {
  height: 74px !important;
  width: auto !important;
  max-height: none !important;
}

.vzg-logo {
  height: 35px;
  width: auto;
}

.menu a {
  font-size: 19px;
}

header>h1 {
  float: left;
  padding: 18px 0 0 20px;
}

.plainList {
  list-style: none !important;
  margin: 0;
  padding: 0;
}

.faded {
  color: grey;
}

.button {
  margin: 0 10px;
  padding: 4px 20px;
}

.button:disabled {
  background-color: grey;
}

.button:disabled:hover {
  cursor: default;
}

.user-status {
  z-index: 9999;
}

.user-status>a {
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

h1 {
  color: #b13f13;
  font-size: 45px;
  margin: 10px 0 12px 0;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
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

.appRoot {
  min-height: 100vh;
}

.pageWrapper {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

#main {
  flex: 1;
}

.searchSection {
  max-width: 900px;
  width: calc(100% - 32px);
  margin: 30px auto 120px auto;
  padding: 0 46px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
  min-height: 150px;
  display: flex;
  align-items: center;
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

.searchMeta {
  margin-top: 14px;
  font-size: 15px;
  color: #3a3a3a;
}

.searchSection a {
  color: #b13f13;
  text-decoration: none;
}

.searchSection a:hover {
  text-decoration: underline;
}

.section {
  margin: 50px 0 20px 0;
  padding: 18.96px 190px;
  font-size: 20px;
}

.footer {
  background-color: #e9e1e1;
  padding-top: 60px;
}

@media (max-width: 900px) {
  .searchSection {
    padding: 24px 20px;
    min-height: 0;
    display: block;
  }

  .searchBar {
    flex-wrap: wrap;
    gap: 16px;
  }

  .searchSection h2.searchTitle {
    white-space: normal;
    width: 100%;
  }

  .searchControls {
    width: 100%;
    margin-left: 0;
    flex-wrap: wrap;
    justify-content: stretch;
  }

  .searchControls input[type="text"] {
    width: 100%;
  }

  .section {
    padding: 18px 20px;
  }

  .coli-conc-logo-small img {
    height: 64px !important;
  }

  header.header {
    display: block !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    position: relative !important;
    z-index: 99999 !important;
  }

  header.header .coli-conc-logo-small {
    float: none !important;
    display: block !important;
    padding: 10px 16px 0 16px;
  }

  header.header ul.menu {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    float: none !important;
    clear: both !important;
    position: static !important;
    transform: none !important;
    clip: auto !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    margin: 10px 0 0 0 !important;
    padding: 0 16px !important;
    list-style: none !important;
  }

  header.header ul.menu li {
    float: none !important;
    display: block !important;
    width: 100% !important;
  }

  header.header ul.menu a {
    display: block !important;
    width: 100% !important;
    white-space: normal !important;
    font-size: 16px !important;
  }

  .service {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 10px !important;
  }

  .service a {
    display: block !important;
    width: 100% !important;
    text-align: center !important;
  }

  .service .vzg-logo {
    display: inline-block !important;
    width: auto !important;
  }
}

@media (max-width: 520px) {

  .searchControls input[type="text"],
  .searchSection .button {
    width: 100%;
  }

  .coli-conc-logo-small img {
    height: 54px !important;
  }
}
</style>
