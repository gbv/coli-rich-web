<script setup>
import config from "./config.js"

const { version, name } = config
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
        <p>Dieses Tool ist in Entwicklung. Aktuell besteht keine Funktionalität.</p>
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
