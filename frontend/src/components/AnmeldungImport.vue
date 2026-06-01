<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import importService from "../services/importService";

const props = defineProps<{
  token?: string;
  verfahrenId: number | null;
  rundeId: number | null;
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const schools = ref<any[]>([]);
const previewRows = ref<any[]>([]);
const previewToken = ref("");
const fileName = ref("");
const loadingSchools = ref(false);
const loadingPreview = ref(false);
const importing = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const importSummary = ref<any | null>(null);
const isExpanded = ref(false);

const groupedPreviewCountBySchool = computed(() => {
  const counts = new Map();
  for (const row of previewRows.value) {
    const snr = String(row?.data?.snr || "").trim();
    if (!snr) continue;
    counts.set(snr, Number(counts.get(snr) || 0) + 1);
  }
  return counts;
});

const groupedImportableCountBySchool = computed(() => {
  const counts = new Map();
  for (const row of previewRows.value) {
    const snr = String(row?.data?.snr || "").trim();
    if (!snr || !row?.valid || !row?.selected) continue;
    counts.set(snr, Number(counts.get(snr) || 0) + 1);
  }
  return counts;
});

const selectedValidRows = computed(() => (
  previewRows.value.filter((row) => !!row?.selected && !!row?.valid)
));

async function loadSchools() {
  if (!props.verfahrenId) {
    schools.value = [];
    return;
  }
  try {
    loadingSchools.value = true;
    const response = await importService.getAnmeldungsSchulen(props.verfahrenId, props.rundeId, props.token);
    schools.value = Array.isArray(response?.rows) ? response.rows : [];
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Die Schulen fuer den Import konnten nicht geladen werden.";
  } finally {
    loadingSchools.value = false;
  }
}

function openPicker() {
  fileInput.value?.click();
}

function resetPreview() {
  previewRows.value = [];
  previewToken.value = "";
  fileName.value = "";
}

function toggleAll() {
  const shouldSelectAll = previewRows.value.some((row) => row?.valid && !row?.selected);
  for (const row of previewRows.value) {
    if (!row?.valid) {
      row.selected = false;
      continue;
    }
    row.selected = shouldSelectAll;
  }
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0] || null;
  if (!file || !props.verfahrenId || !props.rundeId) return;

  try {
    if (!String(file.name || "").toLowerCase().endsWith(".csv")) {
      throw new Error("Bitte eine CSV-Datei auswaehlen.");
    }
    errorMessage.value = "";
    successMessage.value = "";
    importSummary.value = null;
    loadingPreview.value = true;
    fileName.value = file.name;
    const csvText = await file.text();
    const response = await importService.previewAnmeldungen({
      verfahren_id: props.verfahrenId,
      runde_id: props.rundeId,
      csv_text: csvText,
    }, props.token);
    previewToken.value = String(response?.preview_token || "").trim();
    previewRows.value = Array.isArray(response?.rows) ? response.rows : [];
    if (!previewRows.value.length) {
      throw new Error("Keine importierbaren Zeilen gefunden.");
    }
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Die CSV-Vorschau konnte nicht geladen werden.";
    resetPreview();
  } finally {
    loadingPreview.value = false;
    if (input) input.value = "";
  }
}

async function importSchool(snr: string) {
  if (!props.verfahrenId || !props.rundeId) {
    errorMessage.value = "Bitte zuerst Verfahren und Runde auswaehlen.";
    return;
  }

  try {
    importing.value = true;
    errorMessage.value = "";
    successMessage.value = "";
    const selectedRows = previewRows.value
      .filter((row) => !!row?.selected && !!row?.valid && String(row?.data?.snr || "").trim() === snr)
      .map((row) => Number(row?.row_number || 0));
    const response = await importService.importAnmeldungenSchool(snr, {
      verfahren_id: props.verfahrenId,
      runde_id: props.rundeId,
      preview_token: previewToken.value,
      selected_row_numbers: selectedRows,
    }, props.token);
    importSummary.value = { type: "school", rows: [response] };
    successMessage.value = `Anmeldungen fuer Schule ${snr} wurden importiert.`;
    await loadSchools();
    previewRows.value = previewRows.value.filter((row) => String(row?.data?.snr || "").trim() !== snr);
    if (!previewRows.value.length) {
      previewToken.value = "";
      fileName.value = "";
    }
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Der Import fuer die Schule ist fehlgeschlagen.";
  } finally {
    importing.value = false;
  }
}

async function importAll() {
  if (!props.verfahrenId || !props.rundeId) {
    errorMessage.value = "Bitte zuerst Verfahren und Runde auswaehlen.";
    return;
  }

  try {
    importing.value = true;
    errorMessage.value = "";
    successMessage.value = "";
    const response = await importService.importAnmeldungenAlle({
      verfahren_id: props.verfahrenId,
      runde_id: props.rundeId,
      preview_token: previewToken.value,
      selected_row_numbers: selectedValidRows.value.map((row) => Number(row?.row_number || 0)),
    }, props.token);
    importSummary.value = response;
    successMessage.value = "Anmeldungsimport fuer alle Schulen abgeschlossen.";
    resetPreview();
    await loadSchools();
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Der Gesamtimport ist fehlgeschlagen.";
  } finally {
    importing.value = false;
  }
}

watch(() => props.verfahrenId, () => {
  resetPreview();
  importSummary.value = null;
  successMessage.value = "";
  errorMessage.value = "";
  loadSchools();
}, { immediate: true });

watch(() => props.rundeId, () => {
  resetPreview();
  importSummary.value = null;
  successMessage.value = "";
  errorMessage.value = "";
  loadSchools();
});

onMounted(() => {
  loadSchools();
});
</script>

<template>
  <section class="import-card">
    <div class="import-card-head">
      <div>
        <h3>
          <button
            type="button"
            class="section-toggle"
            :aria-expanded="isExpanded ? 'true' : 'false'"
            @click="isExpanded = !isExpanded"
          >
            <span class="section-toggle-chevron" :class="{ 'is-collapsed': !isExpanded }" aria-hidden="true"></span>
          </button>
          <span class="import-step">3.</span>
          Schulanmeldungen importieren (CSV, Schild3)
        </h3>
        <p>CSV-Datei fuer die aktuelle Runde pruefen, mit dem Pool abgleichen und pro Schule oder gesammelt importieren.</p>
      </div>
      <div class="import-head-actions">
        <input
          ref="fileInput"
          type="file"
          accept=".csv,text/csv"
          class="hidden-input"
          @change="handleFileChange"
        />
        <button class="btn-secondary" type="button" :disabled="!verfahrenId || !rundeId || loadingPreview || importing" @click="openPicker">
          CSV hochladen
        </button>
        <button class="btn-primary" type="button" :disabled="!selectedValidRows.length || importing" @click="importAll">
          {{ importing ? "Importiere..." : "Anmeldungen importieren" }}
        </button>
      </div>
    </div>

    <div v-show="isExpanded" class="section-panel">
    <div v-if="errorMessage" class="feedback-panel feedback-panel-error">
      <p class="feedback-title">Fehler</p>
      <p>{{ errorMessage }}</p>
    </div>

    <div v-else-if="successMessage" class="feedback-panel feedback-panel-success">
      <p class="feedback-title">Erfolg</p>
      <p>{{ successMessage }}</p>
    </div>

    <div class="school-strip">
      <div v-if="loadingSchools" class="anm-loading-state">Schulen werden geladen...</div>
      <div v-else-if="!schools.length" class="anm-empty-state">Keine Schulen fuer das aktuelle Verfahren vorhanden.</div>
      <div v-else class="table-wrap school-table-wrap">
        <table class="import-table school-table">
          <thead>
            <tr>
              <th>Schulnummer</th>
              <th>Schulname</th>
              <th>Kapazitaet</th>
              <th>Anmeldungen</th>
              <th>Freie Plaetze</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="school in schools" :key="school.snr">
              <td class="school-snr-cell">{{ school.snr }}</td>
              <td>
                <strong>{{ school.name }}</strong>
              </td>
              <td>{{ Number(school.kapazitaet || 0) }}</td>
              <td>{{ Number(school.anmeldungen || 0) }}</td>
              <td :class="{ 'is-negative': Number(school.freie_plaetze || 0) < 0 }">
                {{ Number(school.freie_plaetze || 0) }}
              </td>
              <td>
                <button
                  class="btn-secondary"
                  type="button"
                  :disabled="importing || !(groupedImportableCountBySchool.get(school.snr) || 0)"
                  @click="importSchool(school.snr)"
                >
                  Schule importieren
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="importSummary" class="import-summary">
      <template v-if="Array.isArray(importSummary.schools)">
        <div><strong>Gelesen:</strong> {{ previewRows.length || 0 }}</div>
        <div><strong>Importiert:</strong> {{ importSummary.total_summary?.imported_rows || 0 }}</div>
        <div><strong>Aktualisiert:</strong> {{ importSummary.total_summary?.updated_rows || 0 }}</div>
        <div><strong>Neue Schueler:</strong> {{ importSummary.total_summary?.created_students || 0 }}</div>
        <div><strong>Offene Faelle:</strong> {{ importSummary.total_summary?.created_open_cases || 0 }}</div>
        <div><strong>Uebersprungen:</strong> {{ importSummary.total_summary?.skipped_rows || 0 }}</div>
        <div><strong>Fehler:</strong> {{ importSummary.total_summary?.error_rows || 0 }}</div>
      </template>
      <template v-else-if="Array.isArray(importSummary.rows)">
        <div><strong>Gelesen:</strong> {{ importSummary.rows[0]?.rows_read || 0 }}</div>
        <div><strong>Importiert:</strong> {{ importSummary.rows[0]?.imported_rows || 0 }}</div>
        <div><strong>Aktualisiert:</strong> {{ importSummary.rows[0]?.updated_rows || 0 }}</div>
        <div><strong>Neue Schueler:</strong> {{ importSummary.rows[0]?.created_students || 0 }}</div>
        <div><strong>Offene Faelle:</strong> {{ importSummary.rows[0]?.created_open_cases || 0 }}</div>
        <div><strong>Uebersprungen:</strong> {{ importSummary.rows[0]?.skipped_rows || 0 }}</div>
        <div><strong>Fehler:</strong> {{ importSummary.rows[0]?.error_rows || 0 }}</div>
      </template>
    </div>

    <div v-if="Array.isArray(importSummary?.schools) && importSummary.schools.length" class="table-wrap">
      <table class="import-table import-result-table">
        <thead>
          <tr>
            <th>SNR</th>
            <th>Gelesen</th>
            <th>Importiert</th>
            <th>Aktualisiert</th>
            <th>Neue Schueler</th>
            <th>Offene Faelle</th>
            <th>Uebersprungen</th>
            <th>Fehler</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in importSummary.schools" :key="`summary-${row.snr}`">
            <td>{{ row.snr }}</td>
            <td>{{ row.rows_read || 0 }}</td>
            <td>{{ row.imported_rows || 0 }}</td>
            <td>{{ row.updated_rows || 0 }}</td>
            <td>{{ row.created_students || 0 }}</td>
            <td>{{ row.created_open_cases || 0 }}</td>
            <td>{{ row.skipped_rows || 0 }}</td>
            <td>{{ row.error_rows || 0 }}</td>
            <td>{{ row.message || (row.skipped ? "Uebersprungen" : "OK") }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="previewRows.length" class="import-preview">
      <div class="import-preview-head">
        <div>
          <strong>Vorschau</strong>
          <span>{{ fileName }}</span>
        </div>
        <button class="btn-secondary" type="button" :disabled="importing" @click="toggleAll">Auswahl umschalten</button>
      </div>

      <div class="table-wrap">
        <table class="import-table">
          <thead>
            <tr>
              <th>Import</th>
              <th>Zeile</th>
              <th>Status</th>
              <th>Fehler</th>
              <th>Schul-Nr</th>
              <th>Schule</th>
              <th>Schueler-ID</th>
              <th>Vorname</th>
              <th>Nachname</th>
              <th>Geburtsdatum</th>
              <th>Foerderbedarf</th>
              <th>Zieldifferent</th>
              <th>Anmeldestatus</th>
              <th>Importaktion</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in previewRows" :key="`anmeldung-preview-${row.row_number}`" :class="{ 'is-invalid': !row.valid }">
              <td><input v-model="row.selected" type="checkbox" :disabled="importing || !row.valid" /></td>
              <td>{{ row.row_number }}</td>
              <td>{{ row.valid ? "Gueltig" : "Fehler" }}</td>
              <td>{{ Array.isArray(row.errors) && row.errors.length ? row.errors.join(", ") : "-" }}</td>
              <td>{{ row.data?.snr || "-" }}</td>
              <td>{{ row.school_name || "-" }}</td>
              <td>{{ row.data?.schueler_schul_id || "-" }}</td>
              <td>{{ row.data?.vorname || "-" }}</td>
              <td>{{ row.data?.nachname || "-" }}</td>
              <td>{{ row.data?.geburtsdatum || "-" }}</td>
              <td>{{ row.data?.foerderbedarf || "-" }}</td>
              <td>{{ row.data?.zieldifferent || "-" }}</td>
              <td>{{ row.data?.anmeldestatus_code || "-" }}</td>
              <td>{{ row.match?.match_hinweis || "-" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    </div>
  </section>
</template>

<style scoped>
.import-card {
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  padding: 18px;
  background:
    radial-gradient(circle at top right, rgba(143, 187, 233, 0.2), transparent 34%),
    linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-shadow: 0 18px 42px rgba(19, 54, 102, 0.08);
  display: grid;
  gap: 16px;
}

.import-card-head,
.import-preview-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.import-card h3 {
  margin: 0;
  color: #19365b;
  display: flex;
  align-items: center;
  gap: 10px;
}

.import-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  border-radius: 999px;
  background: #e8f1fd;
  color: #1459a8;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
}

.section-panel {
  display: grid;
  gap: 16px;
}

.section-toggle {
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

.section-toggle:hover {
  background: #dbeafe;
}

.section-toggle-chevron {
  width: 10px;
  height: 10px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
  transition: transform 0.2s ease;
  margin-top: -2px;
}

.section-toggle-chevron.is-collapsed {
  transform: rotate(-45deg);
  margin-top: 0;
}

.import-card p {
  margin: 8px 0 0;
  color: #4a607e;
  line-height: 1.55;
}

.hidden-input {
  display: none;
}

.import-head-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-primary,
.btn-secondary {
  border-radius: 999px;
  padding: 10px 16px;
  font-weight: 700;
  border: 0;
}

.btn-primary {
  background: linear-gradient(180deg, #1f72d8 0%, #1459a8 100%);
  color: #ffffff;
}

.btn-secondary {
  background: #eef4fd;
  color: #17385f;
}

.import-summary {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.import-summary div {
  padding: 12px 14px;
  border: 1px solid #dbe4f0;
  border-radius: 14px;
  background: #ffffff;
  color: #19365b;
}

.import-preview {
  display: grid;
  gap: 12px;
}

.import-preview-head strong,
.import-preview-head span {
  display: block;
}

.import-preview-head span {
  margin-top: 4px;
  color: #5d7390;
}

.table-wrap {
  overflow-x: auto;
  max-height: 640px;
  overflow-y: auto;
  border: 1px solid #e5edf6;
  border-radius: 16px;
  background: #ffffff;
}

.import-table {
  width: 100%;
  min-width: 1400px;
  border-collapse: collapse;
  font-size: 14px;
}

.import-table thead th {
  position: sticky;
  top: 0;
  background: #f8fbff;
  z-index: 1;
}

.import-result-table {
  min-width: 640px;
}

.school-table-wrap {
  max-height: none;
}

.school-table {
  min-width: 860px;
}

.school-table .school-snr-cell {
  white-space: nowrap;
  color: #5d7390;
  font-size: 13px;
}

.import-table th,
.import-table td {
  padding: 3px 8px;
  border-bottom: 1px solid #e5edf6;
  text-align: left;
  vertical-align: middle;
}

.import-table th {
  color: #5a7393;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.import-table td {
  line-height: 1.15;
}

.import-table td.is-negative {
  color: #b42318;
  font-weight: 700;
}

.import-table tr.is-invalid {
  background: #fff5f5;
}

@media (max-width: 900px) {
  .import-card-head,
  .import-preview-head {
    flex-direction: column;
  }
}
</style>
