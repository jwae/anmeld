<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  fileName: string;
  options: {
    delimiter: "auto" | ";" | "," | "\t";
    hasHeaders: boolean;
    charset: "utf-8";
  };
  dragActive: boolean;
  busy: boolean;
  showGsPoolHelp?: boolean;
}>();

const isFileGuideExpanded = ref(false);

defineEmits<{
  (event: "pick"): void;
  (event: "drop", file: File | null | undefined): void;
  (event: "update:delimiter", value: "auto" | ";" | "," | "\t"): void;
  (event: "update:hasHeaders", value: boolean): void;
}>();

function handleDragOver(event: DragEvent) {
  event.preventDefault();
}

function downloadGsPoolExample() {
  const csv = [
    "Snr;schueler_id;vorname;nachname;geburtsdatum;strasse;plz;ort;foerderbedarf;zieldifferent;empfehlung",
    "123456;100001;Max;Mustermann;14.03.2012;Musterstraße 12;41061;Musterstadt;0;0;RS",
    "123456;100002;Erika;Musterfrau;22.07.2012;Beispielweg 7;41061;Musterstadt;1;0;GY",
  ].join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "muster-gs-schuelerpool.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="wizard-step">
    <div
      class="upload-dropzone"
      :class="{ 'is-active': dragActive, 'is-disabled': busy }"
      @dragover="handleDragOver"
      @drop.prevent="$emit('drop', $event.dataTransfer?.files?.[0])"
    >
      <p class="upload-title">CSV-Datei auswählen</p>
      <p class="upload-copy">Datei per Drag & Drop ablegen oder über den Dateidialog auswählen.</p>
      <button class="btn-primary" type="button" :disabled="busy" @click="$emit('pick')">
        Datei auswählen
      </button>
      <p v-if="fileName" class="upload-file">
        {{ fileName }}
      </p>
    </div>

    <div class="upload-options">
      <label class="upload-option upload-option-compact">
        <span>Trennzeichen</span>
        <select :value="options.delimiter" @change="$emit('update:delimiter', ($event.target as HTMLSelectElement).value as 'auto' | ';' | ',' | '\t')">
          <option value="auto">Automatisch</option>
          <option value=";">Semikolon</option>
          <option value=",">Komma</option>
          <option :value="'\t'">Tab</option>
        </select>
      </label>
      <label class="upload-option upload-option-binary">
        <span>Erste Zeile enthält Spaltennamen</span>
        <select :value="options.hasHeaders ? 'ja' : 'nein'" @change="$emit('update:hasHeaders', ($event.target as HTMLSelectElement).value === 'ja')">
          <option value="ja">Ja</option>
          <option value="nein">Nein</option>
        </select>
      </label>
      <label class="upload-option upload-option-compact">
        <span>Zeichensatz</span>
        <input type="text" value="UTF-8 (mit Fallback)" disabled />
      </label>
    </div>

    <div v-if="showGsPoolHelp" class="gs-import-guide">
      <article class="guide-section guide-section-help" aria-labelledby="gs-import-file-heading">
        <div class="guide-heading">
          <button
            type="button"
            class="guide-section-toggle"
            :aria-expanded="isFileGuideExpanded ? 'true' : 'false'"
            aria-controls="gs-import-file-content"
            aria-label="Erklärungen ein- oder ausklappen"
            @click="isFileGuideExpanded = !isFileGuideExpanded"
          >
            <span
              class="guide-section-toggle-chevron"
              :class="{ 'is-collapsed': !isFileGuideExpanded }"
              aria-hidden="true"
            ></span>
          </button>
          <div>
            <p class="guide-eyebrow">Vorbereitung</p>
            <h4 id="gs-import-file-heading">Erklärungen zum Aufbau der Importdatei und dem weiteren Ablauf.</h4>
          </div>
        </div>

        <div v-show="isFileGuideExpanded" id="gs-import-file-content" class="guide-section-content">
        <p class="guide-intro">
          Erwartet wird eine CSV-Datei oder eine aus EWO exportierte CSV-Datei. Die erste Zeile enthält
          die Spaltennamen. Die Reihenfolge der Spalten ist beliebig, da die Felder vor dem Import
          zugeordnet werden.
        </p>

        <div class="guide-callout">
          <strong>Empfohlene Dateieinstellungen</strong>
          <span>Semikolon als Trennzeichen, Kopfzeile vorhanden und Zeichensatz UTF-8.</span>
        </div>

        <div class="guide-table-wrap">
          <table class="guide-table">
            <thead>
              <tr>
                <th>Spaltenname</th>
                <th>Pflicht</th>
                <th>Inhalt und zulässige Werte</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>Snr</code></td>
                <td><span class="required-chip">Ja</span></td>
                <td>Schulnummer einer Herkunftsschule des aktuellen Verfahrens.</td>
              </tr>
              <tr>
                <td><code>schueler_id</code></td>
                <td><span class="required-chip">Ja</span></td>
                <td>Eindeutige, dauerhaft gleichbleibende Schüler-ID.</td>
              </tr>
              <tr>
                <td><code>vorname</code></td>
                <td><span class="required-chip">Ja</span></td>
                <td>Vorname des Kindes.</td>
              </tr>
              <tr>
                <td><code>nachname</code></td>
                <td><span class="required-chip">Ja</span></td>
                <td>Nachname des Kindes.</td>
              </tr>
              <tr>
                <td><code>geburtsdatum</code></td>
                <td><span class="required-chip">Ja</span></td>
                <td>Geburtsdatum im Format <code>TT.MM.JJJJ</code> oder <code>JJJJ-MM-TT</code>.</td>
              </tr>
              <tr>
                <td><code>strasse</code></td>
                <td>Nein</td>
                <td>Straße und Hausnummer.</td>
              </tr>
              <tr>
                <td><code>plz</code></td>
                <td>Nein</td>
                <td>Postleitzahl.</td>
              </tr>
              <tr>
                <td><code>ort</code></td>
                <td>Nein</td>
                <td>Wohnort.</td>
              </tr>
              <tr>
                <td><code>foerderbedarf</code></td>
                <td>Nein</td>
                <td><code>0/1</code>, <code>Nein/Ja</code> oder <code>false/true</code>.</td>
              </tr>
              <tr>
                <td><code>zieldifferent</code></td>
                <td>Nein</td>
                <td><code>0/1</code>, <code>Nein/Ja</code> oder <code>false/true</code>.</td>
              </tr>
              <tr>
                <td><code>empfehlung</code></td>
                <td>Nein</td>
                <td><code>HS</code>, <code>RS</code>, <code>GY</code>, <code>HS_RS</code>, <code>RS_GY</code> oder leer.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="guide-detail">
          Zusätzlich können – sofern benötigt – <code>ef</code>, <code>teilnahmestatus</code>,
          <code>quell_jahrgang</code> und <code>bemerkung</code> importiert werden. Bei der Empfehlung
          werden auch <code>H</code>, <code>R</code>, <code>H/R</code> und <code>R/GY</code> erkannt.
        </p>

        <div class="guide-example-head">
          <div>
            <strong>Beispiel für eine gültige Datei</strong>
            <span>Die Werte der Musterdatei müssen vor einem Import ersetzt werden.</span>
          </div>
          <button class="guide-download-button" type="button" @click="downloadGsPoolExample">
            <i class="bi bi-download" aria-hidden="true"></i>
            Musterdatei herunterladen
          </button>
        </div>
        <pre class="guide-code"><code>Snr;schueler_id;vorname;nachname;geburtsdatum;strasse;plz;ort;foerderbedarf;zieldifferent;empfehlung
123456;100001;Max;Mustermann;14.03.2012;Musterstraße 12;41061;Musterstadt;0;0;RS</code></pre>
        <section class="guide-subsection" aria-labelledby="gs-import-process-heading">
        <div class="guide-heading">
          
          <div>
            
            <h4 id="gs-import-process-heading">Ablauf der Importroutine</h4>
          </div>
        </div>

        <ol class="process-list">
          <li>
            <span class="process-number">1</span>
            <div><strong>Datei auswählen</strong><p>EWO-/CSV-Datei laden und Dateieinstellungen festlegen.</p></div>
          </li>
          <li>
            <span class="process-number">2</span>
            <div><strong>Vorschau prüfen</strong><p>Erkannte Zeilen, Spalten und das Trennzeichen kontrollieren.</p></div>
          </li>
          <li>
            <span class="process-number">3</span>
            <div><strong>Felder zuordnen</strong><p>Die Spalten der Datei den Feldern des Schülerpools zuweisen. Passende Namen werden automatisch erkannt.</p></div>
          </li>
          <li>
            <span class="process-number">4</span>
            <div><strong>Daten validieren</strong><p>Neue, geänderte, bereits vorhandene und fehlerhafte Zeilen kontrollieren und auswählen.</p></div>
          </li>
          <li>
            <span class="process-number">5</span>
            <div><strong>Import starten</strong><p>Nur ausgewählte und gültige Zeilen werden übernommen. Anschließend erscheint eine Ergebnisübersicht.</p></div>
          </li>
        </ol>
        
        <h4 id="gs-import-process-heading">Bedeutung des Prüfstatus</h4>
        <div class="status-explanation" aria-label="Bedeutung der Prüfstatus">
          
          <div><span class="status-dot is-new"></span><strong>Neu</strong><p>Das Kind wird neu angelegt.</p></div>
          <div><span class="status-dot is-update"></span><strong>Update</strong><p>Ein vorhandener Datensatz wird aktualisiert.</p></div>
          <div><span class="status-dot is-existing"></span><strong>Vorhanden</strong><p>Es sind keine Änderungen notwendig.</p></div>
          <div><span class="status-dot is-error"></span><strong>Fehler</strong><p>Die Zeile kann nicht importiert werden.</p></div>
        </div>

        <div class="guide-warning">
          <i class="bi bi-info-circle-fill" aria-hidden="true"></i>
          <div>
            <strong>Wichtig für Aktualisierungen</strong>
            <p>
              Vorhandene Kinder werden innerhalb des aktuellen Verfahrens und der aktuellen Runde anhand
              der <code>schueler_id</code> erkannt. Zugeordnete Felder werden aktualisiert; nicht zugeordnete
              optionale Felder bleiben unverändert. Jede Schüler-ID darf in der Importdatei nur einmal vorkommen.
            </p>
          </div>
        </div>
        </section>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.wizard-step {
  display: grid;
  gap: 18px;
}

.upload-dropzone {
  display: grid;
  gap: 12px;
  justify-items: start;
  padding: 28px;
  border: 2px dashed #9bb3cf;
  border-radius: 24px;
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
}

.upload-dropzone.is-active {
  border-color: #2f6fb3;
  background: linear-gradient(180deg, #eef6ff 0%, #ffffff 100%);
}

.upload-dropzone.is-disabled {
  opacity: 0.7;
}

.upload-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #19365b;
}

.upload-copy,
.upload-file {
  margin: 0;
  color: #4f6483;
}

.upload-options {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 14px;
  width: fit-content;
  max-width: 100%;
}

.upload-options label {
  display: grid;
  gap: 6px;
}

.upload-option {
  align-content: start;
}

.upload-option-compact {
  width: 25%;
  min-width: 110px;
}

.upload-option-binary {
  width: max-content;
  min-width: 210px;
}

.upload-options span {
  font-size: 13px;
  font-weight: 700;
  color: #45617f;
}

.upload-options select,
.upload-options input[type="text"] {
  min-height: 42px;
  border: 1px solid #c8d6e8;
  border-radius: 14px;
  padding: 0 12px;
}

.gs-import-guide {
  display: grid;
  gap: 18px;
  padding-top: 6px;
}

.guide-section {
  display: grid;
  gap: 18px;
  padding: 24px;
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background: #ffffff;
  box-shadow: 0 10px 30px rgba(25, 54, 91, 0.06);
}

.guide-section-help {
  border-color: #a7d7b5;
  background: linear-gradient(180deg, #f0fdf4 0%, #f8fffa 100%);
  box-shadow: 0 10px 30px rgba(22, 101, 52, 0.08);
}

.guide-subsection {
  display: grid;
  gap: 18px;
  padding-top: 20px;
  border-top: 1px solid #bfe3c9;
}

.guide-heading {
  display: flex;
  align-items: center;
  gap: 14px;
}

.guide-section-content {
  display: grid;
  gap: 18px;
}

.guide-section-toggle {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #eef4fd;
  color: #1459a8;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.guide-section-toggle:hover {
  background: #dbeafe;
}

.guide-section-help .guide-section-toggle {
  background: #dcfce7;
  color: #166534;
}

.guide-section-help .guide-section-toggle:hover {
  background: #bbf7d0;
}

.guide-section-help > .guide-heading h4 {
  color: #14532d;
}

.guide-section-toggle-chevron {
  width: 10px;
  height: 10px;
  margin-top: -2px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
  transition: transform 0.2s ease;
}

.guide-section-toggle-chevron.is-collapsed {
  margin-top: 0;
  transform: rotate(-45deg);
}

.guide-number,
.process-number {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #19365b;
  color: #ffffff;
  font-weight: 800;
}

.guide-number {
  width: 42px;
  height: 42px;
  font-size: 18px;
}

.guide-eyebrow {
  margin: 0 0 3px;
  color: #6680a3;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.guide-heading h4 {
  margin: 0;
  color: #19365b;
  font-size: 20px;
}

.guide-intro,
.guide-detail {
  margin: 0;
  color: #405978;
  line-height: 1.65;
}

.guide-callout {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border-left: 4px solid #2f6fb3;
  border-radius: 10px;
  background: #eef6ff;
  color: #294b72;
}

.guide-callout span,
.guide-example-head span {
  color: #526985;
  font-size: 13px;
}

.guide-table-wrap {
  overflow-x: auto;
  border: 1px solid #dbe4f0;
  border-radius: 16px;
}

.guide-table {
  width: 100%;
  border-collapse: collapse;
  color: #405978;
  font-size: 13px;
}

.guide-table th,
.guide-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e6eef7;
  text-align: left;
  vertical-align: top;
}

.guide-table th {
  background: #f5f8fc;
  color: #19365b;
  font-size: 12px;
}

.guide-table tbody tr:last-child td {
  border-bottom: 0;
}

.guide-table code,
.guide-detail code,
.guide-warning code {
  padding: 2px 5px;
  border-radius: 5px;
  background: #eef2f7;
  color: #254c78;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
}

.required-chip {
  display: inline-flex;
  padding: 2px 7px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 800;
}

.guide-example-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.guide-example-head > div {
  display: grid;
  gap: 4px;
}

.guide-example-head strong {
  color: #19365b;
}

.guide-download-button {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid #9bb3cf;
  border-radius: 999px;
  background: #ffffff;
  color: #254c78;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.guide-download-button:hover {
  border-color: #2f6fb3;
  background: #eef6ff;
}

.guide-code {
  max-width: 100%;
  margin: 0;
  overflow-x: auto;
  padding: 16px;
  border-radius: 14px;
  background: #17263a;
  color: #e8f2ff;
  font-size: 12px;
  line-height: 1.6;
}

.process-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.process-list li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid #e1e8f2;
  border-radius: 14px;
  background: #f9fbfe;
}

.process-number {
  width: 28px;
  height: 28px;
  font-size: 12px;
}

.process-list strong {
  color: #19365b;
}

.process-list p,
.status-explanation p,
.guide-warning p {
  margin: 3px 0 0;
  color: #526985;
  line-height: 1.5;
}

.status-explanation {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.status-explanation > div {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 8px;
  padding: 12px;
  border: 1px solid #e1e8f2;
  border-radius: 12px;
}

.status-explanation p {
  grid-column: 2;
  font-size: 12px;
}

.status-dot {
  width: 10px;
  height: 10px;
  margin-top: 4px;
  border-radius: 50%;
}

.status-dot.is-new { background: #22c55e; }
.status-dot.is-update { background: #f59e0b; }
.status-dot.is-existing { background: #3b82f6; }
.status-dot.is-error { background: #ef4444; }

.guide-warning {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1px solid #bfdbfe;
  border-radius: 14px;
  background: #eff6ff;
  color: #1d4ed8;
}

.guide-warning > i {
  margin-top: 2px;
  font-size: 18px;
}

.guide-warning strong {
  color: #19365b;
}

@media (max-width: 760px) {
  .upload-options {
    display: grid;
    grid-template-columns: 1fr;
    width: 100%;
  }

  .upload-option-compact,
  .upload-option-binary {
    width: 100%;
    min-width: 0;
  }

  .guide-section {
    padding: 18px;
  }

  .guide-example-head {
    align-items: stretch;
    flex-direction: column;
  }

  .guide-download-button {
    justify-content: center;
  }

  .status-explanation {
    grid-template-columns: 1fr;
  }
}
</style>
