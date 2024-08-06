<script setup>
import { ref, reactive, watch } from "vue"
import * as jskos from "jskos-tools"
import config from "./config.js"

const { version, name } = config

const subjectsApi = "http://localhost:3141"
const ppninput = ref("")

const state = reactive({
  schemes: [],
  ppn: null,
  loading: true,
  error: false,
  titleName: "",
  subjects: [],
})

watch(() => state.ppn, async (ppn) => {
  console.log(`Load ${ppn}`)
  state.loading = true
  state.error = false
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
  state.loading = false
})

fetch(`${subjectsApi}/voc`).then(res => res.json()).then(result => {
  state.schemes = result
  state.loading = false
})
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
          <a
            href=""
            @click.prevent="ppninput = '389598534'; state.ppn = '389598534'">
            Ex: 389598534
          </a>
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
                  <b>{{ scheme.VOC.toUpperCase() }}:</b> {{ subjects.map(subject => jskos.notation(subject)).join(", ") }}
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
