<script setup>
import { ref, reactive, watch, onMounted } from "vue"
import { LoadingIndicator } from "jskos-vue"
import * as jskos from "jskos-tools"
import { cdk, addAllProviders } from "cocoda-sdk"
addAllProviders()
import config from "./config.js"

const { version, name } = config

const bartocRegistry = cdk.initializeRegistry({
  provider: "ConceptApi",
  api: "https://bartoc.org/api/",
})
const concordanceRegistry = cdk.initializeRegistry({
  provider: "MappingsApi",
  api: "https://coli-conc.gbv.de/api/",
})

const subjectsApi = "https://coli-conc.gbv.de/subjects-k10plus"
const ppninput = ref("")

const state = reactive({
  schemes: [],
  ppn: null,
  loading: true,
  loadingPhase: 0,
  error: false,
  titleName: "",
  subjects: [],
  mappings: [],
  suggestions: [],
})

const initPromise = (async () => {
  console.time("Init")
  // Initialize registries 
  bartocRegistry.init()
  concordanceRegistry.init()
  // Load supported schemes from subjects-api
  const schemes = await (await fetch(`${subjectsApi}/voc`)).json()
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
  console.timeEnd("Init")
})()

const initializeFromUrl = () => {
  // Get PPN parameter from URL
  const urlParams = new URLSearchParams(window.location.search)
  state.ppn = urlParams.get("ppn") || null
}
onMounted(initializeFromUrl)
addEventListener("popstate", initializeFromUrl)

function updateUrl({ ppn } = {}) {
  const hash = window.location.hash
  const urlParams = new URLSearchParams(window.location.search)
  if ((urlParams.get("ppn") || null) === ppn) {
    return
  }
  if (ppn) {
    urlParams.set("ppn", ppn)
  } else {
    urlParams.delete("ppn")
  }
  // Build new URL
  let url = `${window.location.href.replace(hash, "").replace(window.location.search, "")}`
  if (urlParams.toString()) {
    url += `?${urlParams.toString()}`
  }
  // Note that hash/fragment needs to be at the end of the URL, otherwise the search params will be considered part of the hash!
  url += hash
  window.history.pushState({}, "", url)
}

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
    const cslResult = await (await fetch(`https://ws.gbv.de/suggest/csl2/?citationstyle=ieee&query=pica.ppn=${ppn}&database=opac-de-627&language=de`)).json()
    state.titleName = cslResult[1][0]
    const subjects = await (await fetch(`${subjectsApi}/subjects?record=http://uri.gbv.de/document/opac-de-627:ppn:${ppn}&live=1`)).json()
    // Add scheme data to subjects
    subjects.forEach(subject => {
      subject.inScheme[0] = state.schemes.find(scheme => jskos.compare(scheme, subject.inScheme[0]))
    })
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
      const concepts = await scheme._registry.getConcepts({ concepts: subjects.map(subject => ({ uri: subject.uri })) })
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
  const mappings = subjects.length ? await concordanceRegistry.getMappings({
    from: subjects.map(s => s.uri).join("|"),
    toScheme: state.schemes.map(s => s.uri).join("|"),
    direction: "both",
    cardinality: "1-to-1",
  }) : []
  // TODO: This needs to be fixed in the data!
  const mappingsWithoutType = mappings.filter(mapping => !mapping.type?.[0])
  if (mappingsWithoutType.length) {
    console.warn("The following mappings without a mapping type were loaded and need to be fixed:", mappingsWithoutType.map(m => m.uri))
  }
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
    if (!target) {
      continue
    }
    target = {
      ...target,
      inScheme: [mapping[`${targetSide}Scheme`]],
    }
    const existingSuggestion = suggestions.find(s => jskos.compare(s.target, target))
    if (existingSuggestion) {
      existingSuggestion.mappings.push(mapping)
    } else {
      suggestions.push({
        target,
        mappings: [mapping],
      })
    }
  }
  // TODO: This is more complicated as mapping direction needs to be accounted for
  const mappingTypePriority = [
    "http://www.w3.org/2004/02/skos/core#exactMatch",
    "http://www.w3.org/2004/02/skos/core#closeMatch",
    "http://www.w3.org/2004/02/skos/core#broadMatch",
    "http://www.w3.org/2004/02/skos/core#narrowMatch",
    "http://www.w3.org/2004/02/skos/core#mappingRelation",
    "http://www.w3.org/2004/02/skos/core#relatedMatch",
  ]
  suggestions.sort((a, b) => {
    const aPriority = Math.min(...a.mappings.map(mapping => {
      const index = mappingTypePriority.indexOf(mapping.type?.[0])
      return index === -1 ? 9 : index
    }), 10)
    const bPriority = Math.min(...b.mappings.map(mapping => {
      const index = mappingTypePriority.indexOf(mapping.type?.[0])
      return index === -1 ? 9 : index
    }), 10)
    if (aPriority === bPriority) {
      // Fallback to number of mappings
      return b.mappings.length - a.mappings.length
    }
    return aPriority - bPriority
  })
  state.suggestions = suggestions
  console.log(suggestions)
  console.timeEnd("Load mappings")

  // Load concept data for mappings
  console.time("Load concept data for mappings")
  state.loadingPhase = 4
  const suggestionsGroupedByScheme = state.schemes.map(scheme => ({ scheme, concepts: suggestions.filter(({ target }) => jskos.compare(target.inScheme[0], scheme)).map(({ target }) => target) })).filter(group => group.concepts.length)
  // TODO: Fix code repetition from above
  await Promise.all(suggestionsGroupedByScheme.map(async ({ scheme, concepts: conceptsToLoad }) => {
    console.log(scheme, conceptsToLoad)
    if (!scheme.API?.length || !scheme._registry) {
      return
    }
    let concepts
    try {
      concepts = await scheme._registry.getConcepts({ concepts: conceptsToLoad.map(subject => ({ uri: subject.uri })) })
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

const examples = [
  "389598534",
  "1830228498",
  "1646529499",
]
</script>

<template>
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
        <a href="/">
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
      </ul>
      <div style="clear:both" />
    </header>
    <main id="main">
      <!-- Empty div here to start the alternating section colors -->
      <div />
      <div class="section">
        <h2>Semi-automatische Eintragung von Sacherschließungsdaten in PICA-Datenbanken</h2>
        <p>
          Mit folgendem Formular können Titeldaten aus PICA-Datenbanken abgerufen werden, um diese mit Sacherschließungsdaten (auf Basis von coli-conc Mappings) anzureichern.
        </p>
        <p>Dieses Tool ist in Entwicklung.</p>
        <p>
          Titel laden
          <input
            v-model="ppninput"
            type="text"
            placeholder="PPN"
            @keyup.enter="!state.loading && (state.ppn = ppninput)">
          <button 
            :disabled="state.loading || !ppninput"
            @click="state.ppn = ppninput">
            Laden
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
              Anreicherungsvorschläge auf Basis von Mappings werden gelanden...
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
              <td>{{ state.ppn }}</td>
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
        <h2 v-if="state.ppn && state.loadingPhase >= 3">
          Mögliche Anreicherungen
        </h2>
        <table v-if="state.ppn && state.loadingPhase > 3 && state.suggestions.length">
          <thead>
            <tr>
              <th>Vokabular</th>
              <th>Notation</th>
              <th style="min-width: 50%;">
                Quellen
              </th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="{ target, mappings } in state.suggestions"
              :key="target.uri">
              <td>{{ jskos.notation(target.inScheme[0]) }}</td>
              <td>{{ jskos.notation(target) }} {{ jskos.prefLabel(target, { fallbackToUri: false }) }}</td>
              <td>
                <ul class="plainList">
                  <li
                    v-for="mapping in mappings"
                    :key="mapping.uri">
                    {{ jskos.notation(mapping.fromScheme) }}:
                    {{ jskos.notation(jskos.conceptsOfMapping(mapping, "from")[0]) }}
                    {{ jskos.prefLabel(jskos.conceptsOfMapping(mapping, "from")[0], { fallbackToUri: false }) }}
                    {{ jskos.notation(jskos.mappingTypeByUri(mapping.type?.[0] || "http://www.w3.org/2004/02/skos/core#mappingRelation")) }}
                    {{ jskos.notation(mapping.toScheme) }}:
                    {{ jskos.notation(jskos.conceptsOfMapping(mapping, "to")[0]) }}
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
        <p v-else-if="state.ppn && state.loadingPhase > 3 && state.suggestions.length === 0">
          Keine Anreicherungen verfügbar.
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
</style>
