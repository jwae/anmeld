<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  fileName: string;
  busy: boolean;
  options: {
    delimiter: "auto" | ";" | "," | "\t";
    hasHeaders: boolean;
    charset: "utf-8";
  };
}>();

const emit = defineEmits<{
  (event: "pick"): void;
  (event: "drop-file", file: File | null): void;
  (event: "update:delimiter", value: "auto" | ";" | "," | "\t"): void;
  (event: "update:hasHeaders", value: boolean): void;
}>();

const isDragActive = ref(false);
const suppressPickUntil = ref(0);
const isHelpExpanded = ref(false);

function handleDragOver(event: DragEvent) {
  event.preventDefault();
  isDragActive.value = true;
}

function handleDragEnter() {
  isDragActive.value = true;
}

function handleDragLeave(event: DragEvent) {
  if (event.currentTarget !== event.target) return;
  isDragActive.value = false;
}

function handleDrop(event: DragEvent) {
  isDragActive.value = false;
  suppressPickUntil.value = Date.now() + 250;
  const file = event.dataTransfer?.files?.[0] || null;
  emit("drop-file", file);
}

function handlePickClick() {
  if (Date.now() < suppressPickUntil.value) return;
  emit("pick");
}

function downloadAnmeldungenExample() {
  const csv = [
    "schul_nr;externe_schueler_id;vorname;nachname;geburtsdatum;foerderbedarf;zieldifferent;anmeldestatus",
    "123456;100001;Max;Mustermann;14.03.2012;0;0;Neuaufnahme",
    "234567;100002;Erika;Musterfrau;22.07.2012;1;0;Warteliste",
  ].join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "muster-anmeldungen-sek1.csv";
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
      :class="{ 'is-active': isDragActive, 'is-disabled': busy }"
      @dragenter.prevent="handleDragEnter"
      @dragover="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent.stop="handleDrop"
    >
      <p class="upload-title anm-procedure-copy anm-procedure-ui">CSV-Datei auswählen</p>
      <p class="upload-copy anm-procedure-copy anm-procedure-ui">Datei per Drag & Drop ablegen oder über den Dateidialog auswählen.</p>
      <button class="anm-button anm-button--primary anm-procedure-ui" type="button" :disabled="busy" @click="handlePickClick">
        Datei auswählen
      </button>
      <p v-if="fileName" class="upload-file anm-procedure-copy anm-procedure-ui">
        {{ fileName }}
      </p>
    </div>

    <div class="upload-options">
      <label class="upload-option upload-option-compact anm-field anm-procedure-ui">
        <span class="anm-label anm-procedure-ui">Trennzeichen</span>
        <select class="anm-input anm-procedure-ui" :value="options.delimiter" @change="$emit('update:delimiter', ($event.target as HTMLSelectElement).value as 'auto' | ';' | ',' | '\t')">
          <option value="auto">Automatisch</option>
          <option value=";">Semikolon</option>
          <option value=",">Komma</option>
          <option :value="'\t'">Tab</option>
        </select>
      </label>
      <label class="upload-option upload-option-binary anm-field anm-procedure-ui">
        <span class="anm-label anm-procedure-ui">Erste Zeile enthält Spaltennamen</span>
        <select class="anm-input anm-procedure-ui" :value="options.hasHeaders ? 'ja' : 'nein'" @change="$emit('update:hasHeaders', ($event.target as HTMLSelectElement).value === 'ja')">
          <option value="ja">Ja</option>
          <option value="nein">Nein</option>
        </select>
      </label>
      <label class="upload-option upload-option-compact anm-field anm-procedure-ui">
        <span class="anm-label anm-procedure-ui">Zeichensatz</span>
        <input class="anm-input anm-procedure-ui" type="text" value="UTF-8 (mit Fallback)" disabled />
      </label>
    </div>

    <article class="import-help" aria-labelledby="anmeldungen-import-help-heading">
      <div class="help-heading">
        <button
          type="button"
          class="help-toggle anm-button anm-procedure-ui"
          :aria-expanded="isHelpExpanded ? 'true' : 'false'"
          aria-controls="anmeldungen-import-help-content"
          aria-label="Erklärungen ein- oder ausklappen"
          @click="isHelpExpanded = !isHelpExpanded"
        >
          <span class="help-toggle-chevron" :class="{ 'is-collapsed': !isHelpExpanded }" aria-hidden="true"></span>
        </button>
        <div>
          <p class="help-eyebrow anm-procedure-copy anm-procedure-ui">Importhilfe</p>
          <h4 class="anm-procedure-title anm-procedure-ui" id="anmeldungen-import-help-heading">Erklärungen zum Aufbau der Importdatei und zum weiteren Ablauf</h4>
        </div>
      </div>

      <div v-show="isHelpExpanded" id="anmeldungen-import-help-content" class="help-content">
        <section class="help-block" aria-labelledby="anmeldungen-file-heading">
          <div class="help-subheading">
            <span class="help-number" aria-hidden="true">1</span>
            <h5 class="anm-procedure-title anm-procedure-ui" id="anmeldungen-file-heading">Aufbau der Importdatei</h5>
          </div>

          <p class="help-intro anm-procedure-copy anm-procedure-ui">
            Erwartet wird eine CSV-Datei mit einer Kopfzeile. Die Reihenfolge der Spalten ist beliebig,
            da die Felder vor dem Import zugeordnet werden. Das Format der bereitgestellten Musterdatei
            wird automatisch erkannt.
          </p>

          <div class="help-callout">
            <strong>Empfohlene Dateieinstellungen</strong>
            <span>Semikolon als Trennzeichen, Kopfzeile vorhanden und Zeichensatz UTF-8.</span>
          </div>

          <div class="help-table-wrap">
            <table class="help-table">
              <thead>
                <tr>
                  <th>Spaltenname</th>
                  <th>Pflicht</th>
                  <th>Inhalt und zulässige Werte</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>schul_nr</code></td>
                  <td><span class="required-chip">Ja*</span></td>
                  <td>Schulnummer der Aufnahmeschule im aktuellen Verfahren.</td>
                </tr>
                <tr>
                  <td><code>externe_schueler_id</code></td>
                  <td>Nein</td>
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
                  <td><code>anmeldestatus</code></td>
                  <td><span class="required-chip">Ja</span></td>
                  <td><code>Neuaufnahme</code>, <code>Warteliste</code>, <code>Zugeordnet</code>, <code>Abgelehnt</code> oder <code>Ohne</code>.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="help-detail anm-procedure-copy anm-procedure-ui">
            * Enthält die Datei nur Anmeldungen einer Schule, kann die Aufnahmeschule alternativ bei der
            Feldzuordnung global ausgewählt werden. Zusätzlich können <code>empfehlung</code>,
            <code>foerder_id</code>, <code>bemerkung</code>, <code>strasse</code>, <code>plz</code> und
            <code>ort</code> importiert werden.
          </p>

          <div class="help-example-head">
            <div>
              <strong>Beispiel für eine gültige Datei</strong>
              <span>Schulnummern und Beispieldaten müssen vor einem Import ersetzt werden.</span>
            </div>
            <button class="help-download-button anm-button anm-procedure-ui" type="button" @click="downloadAnmeldungenExample">
              <i class="bi bi-download" aria-hidden="true"></i>
              Musterdatei herunterladen
            </button>
          </div>
          <pre class="help-code"><code>schul_nr;externe_schueler_id;vorname;nachname;geburtsdatum;foerderbedarf;zieldifferent;anmeldestatus
123456;100001;Max;Mustermann;14.03.2012;0;0;Neuaufnahme</code></pre>
        </section>

        <section class="help-block help-process" aria-labelledby="anmeldungen-process-heading">
          <div class="help-subheading">
            <span class="help-number" aria-hidden="true">2</span>
            <h5 class="anm-procedure-title anm-procedure-ui" id="anmeldungen-process-heading">Ablauf der Importroutine</h5>
          </div>

          <ol class="process-list">
            <li><span>1</span><div><strong>Datei auswählen</strong><p class="anm-procedure-copy anm-procedure-ui">CSV-Datei laden und Dateieinstellungen festlegen.</p></div></li>
            <li><span>2</span><div><strong>Vorschau prüfen</strong><p class="anm-procedure-copy anm-procedure-ui">Erkannte Zeilen, Spalten und das Trennzeichen kontrollieren.</p></div></li>
            <li><span>3</span><div><strong>Felder zuordnen</strong><p class="anm-procedure-copy anm-procedure-ui">Dateispalten den Anmeldefeldern zuweisen. Die Spalten der Musterdatei werden automatisch erkannt.</p></div></li>
            <li><span>4</span><div><strong>Anmeldungen prüfen</strong><p class="anm-procedure-copy anm-procedure-ui">Pool-Treffer, neue Anmeldungen, Aktualisierungen und fehlerhafte Zeilen kontrollieren und auswählen.</p></div></li>
            <li><span>5</span><div><strong>Import starten</strong><p class="anm-procedure-copy anm-procedure-ui">Nur ausgewählte und gültige Zeilen werden übernommen. Anschließend erscheint die Ergebnisübersicht.</p></div></li>
          </ol>

          <div class="status-grid" aria-label="Bedeutung der Prüfstatus">
            <div><span class="status-dot is-new"></span><strong>Neu</strong><p class="anm-procedure-copy anm-procedure-ui">Die Anmeldung wird neu angelegt.</p></div>
            <div><span class="status-dot is-update"></span><strong>Update</strong><p class="anm-procedure-copy anm-procedure-ui">Eine vorhandene Anmeldung wird aktualisiert.</p></div>
            <div><span class="status-dot is-existing"></span><strong>Vorhanden</strong><p class="anm-procedure-copy anm-procedure-ui">Es sind keine Änderungen notwendig.</p></div>
            <div><span class="status-dot is-error"></span><strong>Fehler</strong><p class="anm-procedure-copy anm-procedure-ui">Die Zeile kann nicht importiert werden.</p></div>
          </div>

          <div class="help-warning">
            <i class="bi bi-info-circle-fill" aria-hidden="true"></i>
            <div>
              <strong>Abgleich mit dem Schülerpool</strong>
              <p class="anm-procedure-copy anm-procedure-ui">
                Die Importspalte <code>externe_schueler_id</code> enthält die externe Schüler-ID. Vorhandene Kinder
                werden innerhalb des aktuellen Verfahrens über diese ID und die bestehenden Identitätsregeln erkannt. Ein Treffer ergänzt die vorhandenen Pooldaten um die
                Anmeldung. Ohne Treffer wird ein Datensatz mit dem Abgleichstatus „Nur Anmeldung“ angelegt.
                Jede Schüler-ID darf in der Importdatei nur einmal vorkommen.
              </p>
            </div>
          </div>
        </section>
      </div>
    </article>
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
}

.upload-title:where(:not(.anm-procedure-ui)) {
  font-size: 18px;
  font-weight: 700;
  color: #19365b;
}

.upload-copy,
.upload-file {
  margin: 0;
}

.upload-copy:where(:not(.anm-procedure-ui)),
.upload-file:where(:not(.anm-procedure-ui)) {
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

.upload-options span:where(:not(.anm-procedure-ui)) {
  font-size: 13px;
  font-weight: 700;
  color: #45617f;
}

.upload-options select:where(:not(.anm-procedure-ui)),
.upload-options input[type="text"]:where(:not(.anm-procedure-ui)) {
  min-height: 42px;
  border: 1px solid #c8d6e8;
  border-radius: 14px;
  padding: 0 12px;
}

.import-help {
  display: grid;
  gap: 18px;
  padding: 24px;
  border: 1px solid #a7d7b5;
  border-radius: 22px;
  background: linear-gradient(180deg, #f0fdf4 0%, #f8fffa 100%);
  box-shadow: 0 10px 30px rgba(22, 101, 52, 0.08);
}

.help-heading,
.help-subheading {
  display: flex;
  align-items: center;
  gap: 14px;
}

.help-toggle {
  flex: 0 0 auto;
  width: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.help-toggle:where(:not(.anm-procedure-ui)) {
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  transition: background-color 0.2s ease;
}

.help-toggle:hover:where(:not(.anm-procedure-ui)) {
  background: #bbf7d0;
}

.help-toggle-chevron {
  width: 10px;
  height: 10px;
  margin-top: -2px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
  transition: transform 0.2s ease;
}

.help-toggle-chevron.is-collapsed {
  margin-top: 0;
  transform: rotate(-45deg);
}

.help-eyebrow {
  margin: 0 0 3px;
  text-transform: uppercase;
}

.help-eyebrow:where(:not(.anm-procedure-ui)) {
  color: #4d7c5c;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.help-heading h4,
.help-subheading h5 {
  margin: 0;
}

.help-heading h4:where(:not(.anm-procedure-ui)),
.help-subheading h5:where(:not(.anm-procedure-ui)) {
  color: #14532d;
}

.help-heading h4:where(:not(.anm-procedure-ui)) {
  font-size: 20px;
}

.help-subheading h5:where(:not(.anm-procedure-ui)) {
  font-size: 18px;
}

.help-content,
.help-block {
  display: grid;
  gap: 18px;
}

.help-process {
  padding-top: 20px;
  border-top: 1px solid #bfe3c9;
}

.help-number,
.process-list > li > span {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.help-number,
.process-list > li > span:where(:not(.anm-procedure-ui)) {
  border-radius: 50%;
  background: #166534;
  color: #ffffff;
  font-weight: 800;
}

.help-number {
  width: 38px;
  height: 38px;
}

.help-intro,
.help-detail {
  margin: 0;
}

.help-intro:where(:not(.anm-procedure-ui)),
.help-detail:where(:not(.anm-procedure-ui)) {
  color: #405978;
  line-height: 1.65;
}

.help-callout {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border-left: 4px solid #22a35a;
  border-radius: 10px;
  background: #e8f8ed;
  color: #28593a;
}

.help-callout span:where(:not(.anm-procedure-ui)),
.help-example-head span:where(:not(.anm-procedure-ui)) {
  color: #526985;
  font-size: 13px;
}

.help-table-wrap {
  overflow-x: auto;
  border: 1px solid #cfe4d5;
  border-radius: 16px;
  background: #ffffff;
}

.help-table {
  width: 100%;
  border-collapse: collapse;
  color: #405978;
  font-size: 13px;
}

.help-table th,
.help-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e1eee5;
  text-align: left;
  vertical-align: top;
}

.help-table th {
  background: #edf8f0;
  color: #14532d;
  font-size: 12px;
}

.help-table tbody tr:last-child td {
  border-bottom: 0;
}

.help-table code,
.help-detail code,
.help-warning code {
  padding: 2px 5px;
  border-radius: 5px;
  background: #e8f3eb;
  color: #245b38;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
}

.required-chip {
  display: inline-flex;
  padding: 2px 7px;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  font-size: 11px;
  font-weight: 800;
}

.help-example-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.help-example-head > div {
  display: grid;
  gap: 4px;
}

.help-example-head strong {
  color: #14532d;
}

.help-download-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.help-download-button:where(:not(.anm-procedure-ui)) {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid #86bd96;
  border-radius: 999px;
  background: #ffffff;
  color: #166534;
  font-weight: 700;
  white-space: nowrap;
}

.help-download-button:hover:where(:not(.anm-procedure-ui)) {
  border-color: #22a35a;
  background: #e8f8ed;
}

.help-code {
  max-width: 100%;
  margin: 0;
  overflow-x: auto;
  padding: 16px;
  border-radius: 14px;
  background: #173623;
  color: #e8fff0;
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
  border: 1px solid #d9e9dd;
  border-radius: 14px;
  background: #ffffff;
}

.process-list > li > span {
  width: 28px;
}

.process-list > li > span:where(:not(.anm-procedure-ui)) {
  height: 28px;
  font-size: 12px;
}

.process-list strong,
.status-grid strong,
.help-warning strong {
  color: #19365b;
}

.process-list p,
.status-grid p,
.help-warning p {
  margin: 3px 0 0;
}

.process-list p:where(:not(.anm-procedure-ui)),
.status-grid p:where(:not(.anm-procedure-ui)),
.help-warning p:where(:not(.anm-procedure-ui)) {
  color: #526985;
  line-height: 1.5;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.status-grid > div {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 8px;
  padding: 12px;
  border: 1px solid #d9e9dd;
  border-radius: 12px;
  background: #ffffff;
}

.status-grid p {
  grid-column: 2;
}

.status-grid p:where(:not(.anm-procedure-ui)) {
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

.help-warning {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1px solid #a7d7b5;
  border-radius: 14px;
  background: #e8f8ed;
  color: #166534;
}

.help-warning > i {
  margin-top: 2px;
  font-size: 18px;
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

  .import-help {
    padding: 18px;
  }

  .help-example-head {
    align-items: stretch;
    flex-direction: column;
  }

  .help-download-button {
    justify-content: center;
  }

  .status-grid {
    grid-template-columns: 1fr;
  }
}
</style>
