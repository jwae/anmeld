<script setup lang="ts">
import { computed, ref, watch } from "vue";
import importService from "../services/importService";
import { readXlsxFile } from "../utils/xlsx";

const props = defineProps<{
  open: boolean;
  token?: string;
  verfahrenId: number | null;
  rundeId: number | null;
}>();
const emit = defineEmits<{ close: []; success: [result: any] }>();

const steps = ["Datei", "Vorschau", "Zusammenfassung", "Verarbeitung", "Ergebnis"];
const step = ref(1);
const file = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const loading = ref(false);
const errorMessage = ref("");
const validation = ref<any | null>(null);
const result = ref<any | null>(null);

const rows = computed(() => Array.isArray(validation.value?.rows) ? validation.value.rows : []);
const summary = computed(() => validation.value?.summary || {});
const canImport = computed(() => Number(summary.value.importable || 0) > 0 && Boolean(validation.value?.validation_token));

function reset() {
  step.value = 1;
  file.value = null;
  loading.value = false;
  errorMessage.value = "";
  validation.value = null;
  result.value = null;
  if (fileInput.value) fileInput.value.value = "";
}

watch(() => props.open, (open) => { if (open) reset(); });

function selectFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] || null;
  errorMessage.value = "";
  validation.value = null;
}

async function validateFile() {
  if (!file.value || !props.verfahrenId || !props.rundeId) return;
  try {
    loading.value = true;
    errorMessage.value = "";
    const worksheet = await readXlsxFile(file.value);
    validation.value = await importService.validateRueckmeldungenMg({
      verfahren_id: props.verfahrenId,
      runde_id: props.rundeId,
      headers: worksheet.headers,
      rows: worksheet.rows,
    }, props.token);
    step.value = 2;
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Die Excel-Datei konnte nicht geprueft werden.";
  } finally {
    loading.value = false;
  }
}

async function executeImport() {
  if (!canImport.value || !props.verfahrenId || !props.rundeId) return;
  try {
    step.value = 4;
    loading.value = true;
    errorMessage.value = "";
    result.value = await importService.executeRueckmeldungenMg({
      verfahren_id: props.verfahrenId,
      runde_id: props.rundeId,
      validation_token: validation.value.validation_token,
    }, props.token);
    step.value = 5;
    emit("success", result.value);
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Der Import konnte nicht abgeschlossen werden.";
    step.value = 3;
  } finally {
    loading.value = false;
  }
}

function classificationLabel(value: string) {
  return ({ OK: "OK", NICHT_GEFUNDEN: "Schüler nicht gefunden", MEHRDEUTIG: "Mehrdeutiger Treffer", VALIDIERUNGSFEHLER: "Validierungsfehler" } as Record<string, string>)[value] || value;
}

function formatGermanDate(value: unknown) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : text || "–";
}
</script>

<template>
  <div v-if="open" class="mg-overlay" @click.self="emit('close')">
    <section class="mg-dialog" role="dialog" aria-modal="true" aria-labelledby="mg-title">
      <header class="mg-head">
        <div>
          <p class="mg-eyebrow">Excel-Import</p>
          <h3 id="mg-title">Rückmeldungen MG</h3>
          <p>Rückmeldungen prüfen, eindeutig zuordnen und in die aktuelle Runde übernehmen.</p>
        </div>
        <button class="icon-button" type="button" aria-label="Dialog schließen" :disabled="loading" @click="emit('close')">×</button>
      </header>

      <ol class="mg-steps" aria-label="Importschritte">
        <li v-for="(label, index) in steps" :key="label" :class="{ active: step === index + 1, done: step > index + 1 }">
          <span>{{ index + 1 }}</span>{{ label }}
        </li>
      </ol>

      <main class="mg-content">
        <div v-if="errorMessage" class="mg-message error"><strong>Fehler:</strong> {{ errorMessage }}</div>

        <section v-if="step === 1" class="mg-panel upload-panel">
          <h4>Excel-Datei auswählen</h4>
          <p>Unterstützt wird das Format <strong>.xlsx</strong>. Das erste Arbeitsblatt wird eingelesen.</p>
          <label class="file-picker">
            <span>{{ file?.name || "Keine Datei ausgewählt" }}</span>
            <input ref="fileInput" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" @change="selectFile">
          </label>
          <div class="required-columns">
            <strong>Pflichtspalten</strong>
            <span>SNr-Aufn. · Name · Vorname · Geboren · GL-Status · Status</span>
          </div>
        </section>

        <section v-else-if="step === 2" class="mg-panel preview-panel">
          <div class="panel-title"><div><h4>Vorschau und Validierung</h4><p>{{ rows.length }} Datensätze aus {{ file?.name }}</p></div></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Zeile</th><th>Kind</th><th>Geboren</th><th>Aufnahme</th><th>Status</th><th>GL</th><th>Empfehlung</th><th>Prüfergebnis</th></tr></thead>
              <tbody>
                <tr v-for="row in rows" :key="row.row_number" :class="{ invalid: row.classification !== 'OK' }">
                  <td>{{ row.row_number }}</td>
                  <td><strong>{{ row.data.nachname }}, {{ row.data.vorname }}</strong><small v-if="row.matched_student">Treffer-ID {{ row.matched_student.id }}</small></td>
                  <td>{{ formatGermanDate(row.data.geburtsdatum) }}</td>
                  <td>{{ row.data.anmeldeschule_snr || '–' }}</td>
                  <td>{{ row.data.anmeldestatus || '–' }}</td>
                  <td>{{ row.data.foerderbedarf === 1 ? 'Ja' : row.data.foerderbedarf === 0 ? 'Nein' : '–' }}</td>
                  <td>{{ row.data.empfehlung || '–' }}</td>
                  <td><span class="status-pill" :class="row.classification.toLowerCase()">{{ classificationLabel(row.classification) }}</span><small v-if="row.errors?.length">{{ row.errors.join(' ') }}</small><small v-if="row.warnings?.length" class="warning">{{ row.warnings.join(' ') }}</small></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-else-if="step === 3" class="mg-panel summary-panel">
          <h4>Zusammenfassung vor dem Import</h4>
          <div class="summary-grid">
            <div><strong>{{ summary.total || 0 }}</strong><span>Datensätze gesamt</span></div>
            <div class="positive"><strong>{{ summary.importable || 0 }}</strong><span>Importierbar</span></div>
            <div><strong>{{ summary.not_found || 0 }}</strong><span>Nicht gefunden</span></div>
            <div><strong>{{ summary.ambiguous || 0 }}</strong><span>Mehrdeutig</span></div>
            <div><strong>{{ summary.validation_errors || 0 }}</strong><span>Validierungsfehler</span></div>
            <div><strong>{{ summary.open_case_candidates || 0 }}</strong><span>Offene Fälle vorgesehen</span></div>
            <div><strong>{{ summary.warnings || 0 }}</strong><span>Mit Warnung</span></div>
          </div>
          <p class="summary-note">Nur eindeutig gematchte, valide Datensätze werden aktualisiert. Alle übrigen Zeilen bleiben unverändert.</p>
        </section>

        <section v-else-if="step === 4" class="mg-panel processing-panel">
          <div class="spinner" aria-hidden="true"></div><h4>Rückmeldungen werden verarbeitet</h4><p>Die Aktualisierung läuft in einer Datenbanktransaktion.</p>
        </section>

        <section v-else class="mg-panel result-panel">
          <h4>Import abgeschlossen</h4>
          <div class="summary-grid">
            <div class="positive"><strong>{{ result?.updated || 0 }}</strong><span>Erfolgreich aktualisiert</span></div>
            <div><strong>{{ result?.skipped || 0 }}</strong><span>Übersprungen</span></div>
            <div><strong>{{ result?.not_found || 0 }}</strong><span>Nicht gefunden</span></div>
            <div><strong>{{ result?.ambiguous || 0 }}</strong><span>Mehrdeutig</span></div>
            <div><strong>{{ result?.validation_errors || 0 }}</strong><span>Validierungsfehler</span></div>
            <div><strong>{{ result?.open_cases || 0 }}</strong><span>Offene Fälle</span></div>
            <div><strong>{{ result?.technical_errors || 0 }}</strong><span>Technische Fehler</span></div>
          </div>
        </section>
      </main>

      <footer class="mg-footer">
        <button class="btn-secondary" type="button" :disabled="loading" @click="emit('close')">{{ step === 5 ? 'Schließen' : 'Abbrechen' }}</button>
        <div class="mg-nav">
          <button v-if="step === 2" class="btn-secondary" type="button" @click="step = 1">Zurück</button>
          <button v-if="step === 3" class="btn-secondary" type="button" @click="step = 2">Zurück</button>
          <button v-if="step === 1" class="btn-primary" type="button" :disabled="!file || loading" @click="validateFile">{{ loading ? 'Prüfung läuft…' : 'Datei prüfen' }}</button>
          <button v-else-if="step === 2" class="btn-primary" type="button" @click="step = 3">Weiter zur Zusammenfassung</button>
          <button v-else-if="step === 3" class="btn-primary" type="button" :disabled="!canImport || loading" @click="executeImport">Import durchführen</button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.mg-overlay{position:fixed;inset:0;z-index:1650;display:grid;place-items:center;padding:24px;background:rgba(15,23,42,.45);backdrop-filter:blur(4px)}
.mg-dialog{width:min(1400px,94vw);height:min(90vh,960px);display:grid;grid-template-rows:auto auto 1fr auto;gap:16px;padding:24px;border-radius:28px;background:linear-gradient(180deg,#fbfdff,#fff);box-shadow:0 24px 60px rgba(15,23,42,.28);color:#19365b}
.mg-head,.mg-footer,.panel-title{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.mg-head h3,.mg-panel h4{margin:0}.mg-head p:last-child,.mg-panel p{color:#526985}.mg-eyebrow{margin:0 0 8px!important;text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:700;color:#6680a3!important}
.icon-button{width:38px;height:38px;border:0;border-radius:50%;font-size:24px;background:#eef4fd;color:#19365b;cursor:pointer}.mg-steps{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:0;padding:0;list-style:none}.mg-steps li{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:12px;background:#f1f5f9;color:#718096;font-size:13px;font-weight:700}.mg-steps li span{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#dbe4f0}.mg-steps li.active{background:#e8f1ff;color:#1459a8}.mg-steps li.done{background:#edf9f2;color:#197044}
.mg-content{min-height:0;overflow:auto}.mg-panel{display:grid;gap:18px;min-height:100%;align-content:start;padding:4px}.mg-message{padding:12px 14px;margin-bottom:12px;border-radius:12px}.mg-message.error{border:1px solid #fca5a5;background:#fff5f5;color:#991b1b}.upload-panel{max-width:720px;margin:auto;align-content:center}.file-picker{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:22px;border:2px dashed #b9cce3;border-radius:18px;background:#f8fbff}.file-picker input{max-width:260px}.required-columns{display:grid;gap:7px;padding:14px 16px;border-radius:14px;background:#eef4fd;color:#365675}
.table-wrap{overflow:auto;max-height:55vh;border:1px solid #dbe4f0;border-radius:16px}table{width:100%;min-width:1100px;border-collapse:collapse;font-size:13px}th,td{padding:9px 10px;border-bottom:1px solid #e5edf6;text-align:left;vertical-align:top}th{position:sticky;top:0;z-index:1;background:#f8fbff;color:#5a7393;text-transform:uppercase;font-size:11px}tr.invalid{background:#fffafa}td small{display:block;margin-top:5px;color:#687b93}.status-pill{display:inline-block;padding:4px 8px;border-radius:999px;background:#eaf8ef;color:#166534;font-weight:700;white-space:nowrap}.status-pill.nicht_gefunden,.status-pill.mehrdeutig,.status-pill.validierungsfehler{background:#fff0f0;color:#a61b1b}td small.warning{color:#9a6700}
.summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px}.summary-grid div{display:grid;gap:5px;padding:18px;border:1px solid #dbe4f0;border-radius:16px;background:#fff}.summary-grid strong{font-size:28px}.summary-grid span{color:#5d7390}.summary-grid .positive{border-color:#a7e0bd;background:#f2fbf5;color:#166534}.summary-note{padding:14px 16px;border-radius:14px;background:#eef4fd}.processing-panel,.result-panel{place-content:center;text-align:center}.result-panel .summary-grid{text-align:left;min-width:min(900px,80vw)}.spinner{width:48px;height:48px;margin:auto;border:5px solid #dbeafe;border-top-color:#1459a8;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.mg-footer{align-items:center}.mg-nav{display:flex;gap:10px}.btn-secondary,.btn-primary{border:0;border-radius:999px;padding:10px 17px;font-weight:700;cursor:pointer}.btn-secondary{background:#eef4fd;color:#17385f}.btn-primary{background:#1459a8;color:#fff}.btn-primary:disabled,.btn-secondary:disabled{opacity:.5;cursor:not-allowed}@media(max-width:800px){.mg-steps{grid-template-columns:1fr}.mg-steps li:not(.active){display:none}.mg-dialog{padding:18px}.mg-footer{align-items:stretch;flex-direction:column}.mg-nav{justify-content:flex-end}}
</style>
