<script setup lang="ts">
import { computed, ref, watch } from "vue";
import importService from "../services/importService";

const props = defineProps<{
  token?: string;
  verfahrenId: number | null;
  rundeId: number | null;
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const loading = ref(false);
const previewToken = ref("");
const fileName = ref("");
const previewRows = ref<any[]>([]);
const errorMessage = ref("");
const successMessage = ref("");
const summary = ref<any | null>(null);
const isExpanded = ref(false);
const poolCount = ref<number | null>(null);

const selectedValidRows = computed(() => (
  previewRows.value.filter((row) => !!row?.selected && !!row?.valid)
));

function openPicker() {
  fileInput.value?.click();
}

function resetPreview() {
  previewToken.value = "";
  fileName.value = "";
  previewRows.value = [];
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

async function loadPoolStats() {
  if (!props.verfahrenId) {
    poolCount.value = null;
    return;
  }

  try {
    const response = await importService.getPoolStats(props.verfahrenId, props.rundeId, props.token);
    poolCount.value = Number(response?.pool_count || 0);
  } catch {
    poolCount.value = null;
  }
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0] || null;
  if (!file) return;

  try {
    if (!props.verfahrenId || !props.rundeId) {
      throw new Error("Bitte zuerst ein Anmeldeverfahren und eine Runde auswaehlen.");
    }
    if (!String(file.name || "").toLowerCase().endsWith(".csv")) {
      throw new Error("Bitte eine CSV-Datei auswaehlen.");
    }
    errorMessage.value = "";
    successMessage.value = "";
    summary.value = null;
    loading.value = true;
    fileName.value = file.name;
    const csvText = await file.text();
    const response = await importService.previewPool({
      csv_text: csvText,
      verfahren_id: props.verfahrenId,
      runde_id: props.rundeId,
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
    loading.value = false;
    if (input) input.value = "";
  }
}

async function startImport() {
  if (!props.verfahrenId || !props.rundeId) {
    errorMessage.value = "Bitte zuerst ein Anmeldeverfahren und eine Runde auswaehlen.";
    return;
  }

  try {
    errorMessage.value = "";
    successMessage.value = "";
    summary.value = null;
    loading.value = true;
    const response = await importService.importPool({
      verfahren_id: props.verfahrenId,
      runde_id: props.rundeId,
      preview_token: previewToken.value,
      selected_row_numbers: selectedValidRows.value.map((row) => Number(row?.row_number || 0)),
    }, props.token);
    summary.value = response;
    successMessage.value = "Schuelerpool-Import erfolgreich abgeschlossen.";
    resetPreview();
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Der Schuelerpool-Import ist fehlgeschlagen.";
  } finally {
    loading.value = false;
  }
}

watch(() => [props.verfahrenId, props.rundeId], () => {
  resetPreview();
  summary.value = null;
  successMessage.value = "";
  errorMessage.value = "";
  loadPoolStats();
}, { immediate: true });
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
          <span class="import-step">2.</span>
          Schuelerpool importieren
        </h3>
        <p>CSV-Datei laden, Vorschau pruefen und gueltige Zeilen in den Schuelerpool uebernehmen.</p>
        <p v-show="isExpanded" class="pool-info-line">
          Kinder im Pool:
          <strong>{{ poolCount === null ? "-" : poolCount }}</strong>
        </p>
      </div>
      <div class="import-head-actions">
        <input
          ref="fileInput"
          type="file"
          accept=".csv,text/csv"
          class="hidden-input"
          @change="handleFileChange"
        />
        <button class="btn-secondary" type="button" :disabled="!verfahrenId || !rundeId || loading" @click="openPicker">
          CSV hochladen
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

    <div v-if="summary" class="import-summary">
      <div><strong>Gelesen:</strong> {{ summary.rows_read }}</div>
      <div><strong>Neu:</strong> {{ summary.imported_students }}</div>
      <div><strong>Aktualisiert:</strong> {{ summary.updated_students }}</div>
      <div><strong>Offene Faelle:</strong> {{ summary.created_open_cases }}</div>
      <div><strong>Uebersprungen:</strong> {{ summary.skipped_rows }}</div>
      <div><strong>Fehler:</strong> {{ summary.error_rows }}</div>
    </div>

    <div v-if="previewRows.length" class="import-preview">
      <div class="import-preview-head">
        <div>
          <strong>Vorschau</strong>
          <span>{{ fileName }}</span>
        </div>
        <div class="import-head-actions">
          <button class="btn-secondary" type="button" :disabled="loading" @click="toggleAll">Auswahl umschalten</button>
          <button class="btn-primary" type="button" :disabled="loading || !selectedValidRows.length || !verfahrenId || !rundeId" @click="startImport">
            {{ loading ? "Importiere..." : "Import starten" }}
          </button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="import-table">
          <thead>
            <tr>
              <th>Import</th>
              <th>Zeile</th>
              <th>Status</th>
              <th>Fehler</th>
              <th>Schueler-ID</th>
              <th>Vorname</th>
              <th>Nachname</th>
              <th>Geburtsdatum</th>
              <th>Adresse</th>
              <th>Erzieher</th>
              <th>Foerderbedarf</th>
              <th>Zieldifferent</th>
              <th>Empfehlung</th>
              <th>Fallgrund</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in previewRows" :key="`pool-preview-${row.row_number}`" :class="{ 'is-invalid': !row.valid }">
              <td><input v-model="row.selected" type="checkbox" :disabled="loading || !row.valid" /></td>
              <td>{{ row.row_number }}</td>
              <td>
                <span v-if="!row.valid" class="badge badge-danger">Fehler</span>
                <span v-else-if="row.import_status === 'NEU'" class="badge badge-success">Neu</span>
                <span v-else-if="row.import_status === 'UPDATE'" class="badge badge-warning">Update</span>
                <span v-else-if="row.import_status === 'VORHANDEN'" class="badge badge-info">Vorhanden</span>
                <span v-else class="badge badge-success">Gueltig</span>
              </td>
              <td>{{ Array.isArray(row.errors) && row.errors.length ? row.errors.join(", ") : "-" }}</td>
              <td>{{ row.data?.schueler_id || "-" }}</td>
              <td>{{ row.data?.vorname || "-" }}</td>
              <td>{{ row.data?.nachname || "-" }}</td>
              <td>{{ row.data?.geburtsdatum || "-" }}</td>
              <td>{{ row.data?.adresse || "-" }}</td>
              <td>{{ row.data?.erzieher || "-" }}</td>
              <td>{{ row.data?.foerderbedarf || "-" }}</td>
              <td>{{ row.data?.zieldifferent || "-" }}</td>
              <td>{{ row.data?.empfehlung_code || "-" }}</td>
              <td>{{ row.data?.fallgrund_code || "-" }}</td>
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

.pool-info-line {
  margin-top: 10px;
  color: #17385f;
}

.pool-info-line strong {
  margin-left: 6px;
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
  min-width: 1200px;
  border-collapse: collapse;
  font-size: 14px;
}

.import-table thead th {
  position: sticky;
  top: 0;
  background: #f8fbff;
  z-index: 1;
}

.import-table th,
.import-table td {
  padding: 5px 8px;
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
  line-height: 1.25;
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

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  line-height: 1;
}

.badge-success {
  background-color: #d1fae5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.badge-warning {
  background-color: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}

.badge-info {
  background-color: #e0f2fe;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.badge-danger {
  background-color: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}
</style>
