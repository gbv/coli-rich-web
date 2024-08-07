<script setup>
import { ref, reactive, watch } from "vue"
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

const subjectsApi = "http://localhost:3141"
const ppninput = ref("")

const state = reactive({
  schemes: [],
  ppn: null,
  loading: true,
  error: false,
  titleName: "",
  subjects: [],
  mappings: [],
})

watch(() => state.ppn, async (ppn) => {
  console.log(`Load PPN ${ppn}`)
  console.time(`Load PPN ${ppn}`)

  state.loading = true
  state.error = false

  state.titleName = ""
  state.subjects = []
  state.mappings = []

  // Load title data from CSL2 API
  console.time("Load title data")
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
  }
  console.timeEnd("Load title data")

  // Load concept data for subjects
  console.time("Load concept data for subjects")
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
  // TODO
  console.timeEnd("Load mappings")

  // Load concept data for mappings
  console.time("Load concept data for mappings")
  // TODO
  console.timeEnd("Load concept data for mappings")
  
  state.loading = false
  console.timeEnd(`Load PPN ${ppn}`)
})

;(async () => {
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
})()

const examples = [
  "389598534",
  "1830228498",
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
            placeholder="PPN">
          <button 
            :disabled="state.loading || !ppninput"
            @click="state.ppn = ppninput">
            Laden
          </button>
          Beispiele:
          <template
            v-for="(ppn, index) in examples"
            :key="ppn">
            <a
              href=""
              @click.prevent="ppninput = ppn; state.ppn = ppn">
              {{ ppn }}
            </a>
            <template v-if="index < examples.length - 1">
              ·
            </template>
          </template>
        </p>
        <table v-if="!state.loading && state.ppn">
          <tbody>
            <tr>
              <th>PPN</th>
              <td>{{ state.ppn }}</td>
            </tr>
            <tr>
              <th>Titel</th>
              <td>{{ state.titleName }}</td>
            </tr>
            <tr>
              <th>Sacherschließung</th>
              <td>
                <p
                  v-for="{ scheme, subjects } in state.subjects"
                  :key="scheme.uri">
                  <b>{{ scheme.VOC.toUpperCase() }}:</b> {{ subjects.map(subject => `${jskos.notation(subject)} ${jskos.prefLabel(subject, { fallbackToUri: false })}`).join(", ") }}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
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
</style>
