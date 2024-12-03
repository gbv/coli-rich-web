<script setup>
import { ref, watch, computed, inject } from "vue"
import { getSubjects, getTitleName, sortSuggestionMappings, suggestionsToPica, getMappingsForSubjects, getConceptData } from "@/utils.js"

import * as jskos from "jskos-tools"

import { useUrlHandling } from "@/composables/url-handling.js"
const { updateUrl } = useUrlHandling()

import { useInit } from "@/composables/init.js"
// Run initialization immediately, then wait for the promise later
const initPromise = useInit()

import { useLogin } from "@/composables/login.js"
const { loginConfigured } = useLogin()
const { loggedIn, user, token } = inject("login-refs")

import { useGoToTop } from "./composables/go-to-top.js"
const { showGoToTopButton, goToTop } = useGoToTop()

import { version, name, baseUrl, showWhenExistsKey, examples, allowedUsers } from "@/config.js"

const hasBackendAccess = computed(() => allowedUsers.includes(user.value?.uri))

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

watch(() => state.ppn, async (ppn) => {
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

async function submitEnrichments(ppn, suggestions) {
  const pica = suggestionsToPica({ ppn, suggestions })
  const options = {
    method: "post",
    headers: token ? {
      Authorization: `Bearer ${token.value}`,
    } : {},
    body: pica,
  }
  // TODO: Improve error handling further.
  try {
    const response = await fetch(baseUrl + "enrichment", options)
    const data = await response.json()
    if (response.status === 201) {
      alert("Success")
    } else {
      alert(`${data.error}: ${jskos.prefLabel(data) || data.message}`)
    }
  } catch (error) {
    alert(`${error.name}: ${error.message}`)
  }
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
        href="https://coli-conc.gbv.de/"
        class="coli-conc-logo-small">
        <img
          src="https://coli-conc.gbv.de/images/coli-conc.svg"
          alt="coli-conc Logo">
      </a>
      <h1>
        <a 
          href=""
          @click.prevent="state.ppn = null">
          coli-rich
        </a>
      </h1>
      <ul class="menu">
        <li>
          <a
            href="https://coli-conc.gbv.de/"
            title="Go to coli-conc website">
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
      <div class="section">
        <h2>Semi-automatische Eintragung von Sacherschließungsdaten in den K10plus</h2>
        <p>
          Mit folgendem Formular können Titeldaten aus dem K10plus abgerufen werden, um diese mit Sacherschließungsdaten (auf Basis von coli-conc Mappings) anzureichern.
        </p>
        <p>Dieses Tool ist in Entwicklung und nur zur Demonstration. Aktuell ist keine Eintragung in die PICA-Datenbank möglich.</p>
        <p>
          Titel laden
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
          <span v-if="!state.loading">
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
          </span>
          <span v-else>
            <loading-indicator
              style="margin-left: 10px; --jskos-vue-loadingIndicator-secondary-color: #B13F12;" />
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
          </span>
        </p>
        <h2 v-if="state.ppn && state.loadingPhase >= 1">
          Titeldaten
        </h2>
        <table v-if="state.ppn && state.loadingPhase > 1 && state.titleName">
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
            <tr>
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
        <template v-if="state.ppn && state.loadingPhase > 4">
          <p v-if="hasBackendAccess">
            <button 
              class="button"
              :disabled="selectedSuggestions.length === 0"
              @click="submitEnrichments(state.ppn, selectedSuggestions)">
              {{ selectedSuggestions.length }} {{ selectedSuggestions.length === 1 ? "Vorschlag" : "Vorschläge" }} in Datenbank eintragen
            </button>
          </p>
          <p v-else>
            Keine Berechtigung zur Eintragung vorhanden.
          </p>
          <details>
            <summary style="user-select: none; cursor: pointer;">
              Ausgewählte Anreicherungen in PICA
            </summary>
            <pre style="font-weight: 400; font-size: 14px; overflow-x: scroll;"><code>{{ selectedSuggestionsPica }}</code></pre>
          </details>
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
                Vokabular
                <a
                  href=""
                  @click.prevent="vocabularyFilterShown = true">
                  <i-mdi-filter-check
                    v-if="Object.values(state.suggestionSchemes).findIndex(value => value === false) === -1" />
                  <i-mdi-filter-minus v-else />
                </a>
              </th>
              <th>Notation</th>
              <th style="min-width: 50%; white-space: nowrap;">
                Quellen
                <a
                  href=""
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
              <td>{{ jskos.notation(target.inScheme[0]) }}</td>
              <td><b>{{ jskos.notation(target) }}</b> {{ jskos.prefLabel(target, { fallbackToUri: false }) }}</td>
              <td>
                <ul class="plainList">
                  <li
                    v-for="mapping in mappings"
                    :key="mapping.uri"
                    :class="{
                      faded: !state.suggestionTypes[mapping.type[0]],
                    }">
                    {{ jskos.notation(mapping.fromScheme) }}
                    <b>{{ jskos.notation(jskos.conceptsOfMapping(mapping, "from")[0]) }}</b>
                    {{ jskos.prefLabel(jskos.conceptsOfMapping(mapping, "from")[0], { fallbackToUri: false }) }}
                    {{ jskos.notation(jskos.mappingTypeByUri(mapping.type[0])) }}
                    {{ jskos.notation(mapping.toScheme) }}
                    <b>{{ jskos.notation(jskos.conceptsOfMapping(mapping, "to")[0]) }}</b>
                    {{ jskos.prefLabel(jskos.conceptsOfMapping(mapping, "to")[0], { fallbackToUri: false }) }}
                    ({{ jskos.prefLabel(mapping.creator?.[0]) || "?" }}, {{ mapping.created?.slice(0, 4) || "?" }})
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
              @click.prevent="vocabularyFilterShown = true">Vokabular-Filter prüfen <i-mdi-filter /></a>
            ·
            <a
              href=""
              @click.prevent="typeFilterShown = true">Mapping-Typ-Filter prüfen <i-mdi-filter /></a>
          </template>
        </p>
        <p v-else-if="state.loadingPhase === 3">
          <loading-indicator
            style="margin-left: 10px; --jskos-vue-loadingIndicator-secondary-color: #B13F12;" />
        </p>
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
  <!-- Vokabulary filter modal -->
  <modal
    v-model="vocabularyFilterShown"
    style="--jskos-vue-modal-bgColor: #F5F3F3;">
    <template #header>
      <h1 style="padding: 0;">
        Zielvokabulare filtern
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
</style>
