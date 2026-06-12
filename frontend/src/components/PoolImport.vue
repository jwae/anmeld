<script setup lang="ts">
import { computed, ref, watch } from "vue";
import importService from "../services/importService";

type PoolSchuelerRow = {
  schueler_id: number;
  schueler_schul_id: string;
  vorname: string;
  nachname: string;
  geburtsdatum: string | null;
  foerderbedarf: string;
  foerder_id?: string | number | null;
  foerder_label?: string | null;
  zieldifferent: string;
  herkunft?: string;
  abgleich_status: string;
  anmeldestatus: string;
  schulnummer: string;
  schule: string;
};

type PoolSortKey =
  | "schueler_schul_id"
  | "nachname"
  | "vorname"
  | "geburtsdatum"
  | "foerderbedarf"
  | "zieldifferent"
  | "herkunft"
  | "abgleich_status"
  | "anmeldestatus"
  | "schulnummer"
  | "schule";

const props = defineProps<{
  token?: string;
  verfahrenId: number | null;
  rundeId: number | null;
  title?: string;
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
const poolSchuelerRows = ref<PoolSchuelerRow[]>([]);
const loadingPoolSchueler = ref(false);
const poolSearch = ref("");
const poolStatusFilter = ref("alle");
const poolFoerderbedarfFilter = ref("alle");
const poolZieldifferentFilter = ref("alle");
const poolSortKey = ref<PoolSortKey>("nachname");
const poolSortDirection = ref<"asc" | "desc">("asc");

const poolCountLabel = computed(() => (
  String(props.title || "").startsWith("GS ")
    ? "Kinder im GS-Pool:"
    : "Kinder im Pool:"
));

const selectedValidRows = computed(() => (
  previewRows.value.filter((row) => !!row?.selected && !!row?.valid)
));

const poolStatusOptions = computed(() => (
  Array.from(new Set(
    poolSchuelerRows.value
      .map((row) => normalizeText(row.anmeldestatus))
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }))
));

const filteredPoolSchuelerRows = computed(() => {
  const searchText = normalizeText(poolSearch.value).toLowerCase();
  return poolSchuelerRows.value.filter((row) => {
    const fullName = `${normalizeText(row.nachname)} ${normalizeText(row.vorname)}`.toLowerCase();
    if (searchText && !fullName.includes(searchText) && !normalizeText(row.schueler_schul_id).toLowerCase().includes(searchText)) return false;
    if (poolStatusFilter.value !== "alle" && normalizeText(row.anmeldestatus) !== poolStatusFilter.value) return false;
    if (poolFoerderbedarfFilter.value === "ja" && !isPositiveFlag(row.foerderbedarf)) return false;
    if (poolFoerderbedarfFilter.value === "nein" && isPositiveFlag(row.foerderbedarf)) return false;
    if (poolZieldifferentFilter.value === "ja" && !isPositiveFlag(row.zieldifferent)) return false;
    if (poolZieldifferentFilter.value === "nein" && isPositiveFlag(row.zieldifferent)) return false;
    return true;
  });
});

const sortedPoolSchuelerRows = computed(() => {
  const factor = poolSortDirection.value === "asc" ? 1 : -1;
  return [...filteredPoolSchuelerRows.value].sort((left, right) => {
    const resolveValue = (row: PoolSchuelerRow) => {
      switch (poolSortKey.value) {
        case "foerderbedarf":
          return isPositiveFlag(row.foerderbedarf) ? "1" : "0";
        case "zieldifferent":
          return isPositiveFlag(row.zieldifferent) ? "1" : "0";
        case "herkunft":
          return displayHerkunft(row);
        default:
          return normalizeText(row[poolSortKey.value] as string | number | null | undefined);
      }
    };
    const a = resolveValue(left);
    const b = resolveValue(right);
    return a.localeCompare(b, "de", { numeric: true, sensitivity: "base" }) * factor;
  });
});

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

async function loadPoolSchueler() {
  if (!props.verfahrenId) {
    poolSchuelerRows.value = [];
    return;
  }

  try {
    loadingPoolSchueler.value = true;
    const response = await importService.getPoolSchueler(props.verfahrenId, props.rundeId, props.token);
    poolSchuelerRows.value = Array.isArray(response?.rows) ? response.rows : [];
  } catch {
    poolSchuelerRows.value = [];
  } finally {
    loadingPoolSchueler.value = false;
  }
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function formatDate(value: string | null | undefined) {
  const text = normalizeText(value);
  if (!text) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-");
    return `${day}.${month}.${year}`;
  }
  return text;
}

function truncateText(value: unknown, maxLength = 12) {
  const text = normalizeText(value);
  if (!text) return "-";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function displayHerkunft(row: PoolSchuelerRow) {
  return normalizeText(row.herkunft) || "-";
}

function isPositiveFlag(value: unknown) {
  return normalizeText(value) === "1";
}

function foerderbedarfHoverText(row: PoolSchuelerRow) {
  return normalizeText(row.foerder_label) || normalizeText(row.foerder_id) || "-";
}

function setPoolSort(nextKey: PoolSortKey) {
  if (poolSortKey.value === nextKey) {
    poolSortDirection.value = poolSortDirection.value === "asc" ? "desc" : "asc";
    return;
  }
  poolSortKey.value = nextKey;
  poolSortDirection.value = "asc";
}

function poolSortMarker(key: PoolSortKey) {
  if (poolSortKey.value !== key) return "";
  return poolSortDirection.value === "asc" ? " ▲" : " ▼";
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
    await loadPoolSchueler();
    await loadPoolStats();
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Der Schuelerpool-Import ist fehlgeschlagen.";
  } finally {
    loading.value = false;
  }
}

async function importJg4ausSchild() {
  if (!props.verfahrenId || !props.rundeId) {
    errorMessage.value = "Bitte zuerst ein Anmeldeverfahren und eine Runde auswaehlen.";
    return;
  }

  try {
    errorMessage.value = "";
    successMessage.value = "";
    summary.value = null;
    loading.value = true;
    resetPreview();
    const response = await importService.importJg4ausSchild({
      verfahren_id: props.verfahrenId,
      runde_id: props.rundeId,
    }, props.token);
    summary.value = response?.total_summary || response;
    successMessage.value = "Pooldaten aus Schild wurden importiert.";
    await loadPoolSchueler();
    await loadPoolStats();
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Der Schild-Poolimport ist fehlgeschlagen.";
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
  loadPoolSchueler();
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
          {{ title || "Schuelerpool importieren (CSV, EWO-Datei)" }}
        </h3>
        <p>CSV-Datei laden, Vorschau pruefen und gueltige Zeilen in den Schuelerpool uebernehmen.</p>
        <p v-show="isExpanded" class="pool-info-line">
          {{ poolCountLabel }}
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
        <button class="btn-secondary" type="button" :disabled="!verfahrenId || !rundeId || loading" @click="importJg4ausSchild">
          Import Pooldaten aus Schild
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
              <th>SNR</th>
              <th>S-ID</th>
              <th>Vorname</th>
              <th>Nachname</th>
              <th>Geburtsdatum</th>
              <th>Strasse</th>
              <th>PLZ</th>
              <th>Ort</th>
              <th>LE</th>
              <th>ZD</th>
              <th>Empf.</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in previewRows" :key="`pool-preview-${row.row_number}`" :class="{ 'is-invalid': !row.valid }">
              <td><input v-model="row.selected" type="checkbox" :disabled="loading || !row.valid" /></td>
              <td>{{ index + 1 }}</td>
              <td>
                <span v-if="!row.valid" class="badge badge-danger">Fehler</span>
                <span v-else-if="row.import_status === 'NEU'" class="badge badge-success">Neu</span>
                <span v-else-if="row.import_status === 'UPDATE'" class="badge badge-warning">Update</span>
                <span v-else-if="row.import_status === 'VORHANDEN'" class="badge badge-info">Vorhanden</span>
                <span v-else class="badge badge-success">Gueltig</span>
              </td>
              <td>{{ Array.isArray(row.errors) && row.errors.length ? row.errors.join(", ") : "-" }}</td>
              <td>{{ row.data?.snr || "-" }}</td>
              <td>{{ row.data?.schueler_id || "-" }}</td>
              <td>{{ row.data?.vorname || "-" }}</td>
              <td>{{ row.data?.nachname || "-" }}</td>
              <td>{{ row.data?.geburtsdatum || "-" }}</td>
              <td>{{ truncateText(row.data?.strasse) }}</td>
              <td>{{ row.data?.plz || "-" }}</td>
              <td>{{ truncateText(row.data?.ort) }}</td>
              <td>{{ row.data?.foerderbedarf || "-" }}</td>
              <td>{{ row.data?.zieldifferent || "-" }}</td>
              <td>{{ row.data?.empfehlung || "-" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="import-preview">
      <div class="import-preview-head">
        <div>
          <strong>Schuelerpool</strong>
          <span>{{ filteredPoolSchuelerRows.length }} Treffer | Datenquelle: anm_schueler</span>
        </div>
      </div>

      <div class="pool-table-toolbar">
        <label class="pool-search-field">
          <span>Suche</span>
          <input v-model="poolSearch" type="search" placeholder="Name oder Schueler-ID" />
        </label>
        <label>
          <span>Anmeldestatus</span>
          <select v-model="poolStatusFilter">
            <option value="alle">Alle</option>
            <option v-for="option in poolStatusOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label>
          <span>Foerderbedarf</span>
          <select v-model="poolFoerderbedarfFilter">
            <option value="alle">Alle</option>
            <option value="ja">Ja</option>
            <option value="nein">Nein</option>
          </select>
        </label>
        <label>
          <span>Zieldifferent</span>
          <select v-model="poolZieldifferentFilter">
            <option value="alle">Alle</option>
            <option value="ja">Ja</option>
            <option value="nein">Nein</option>
          </select>
        </label>
      </div>

      <div class="table-wrap detail-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th>Nr.</th>
              <th><button type="button" class="table-sort-btn" @click="setPoolSort('schueler_schul_id')">Schueler-ID{{ poolSortMarker('schueler_schul_id') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setPoolSort('nachname')">Name + Vorname{{ poolSortMarker('nachname') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setPoolSort('geburtsdatum')">Geburtsdatum{{ poolSortMarker('geburtsdatum') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setPoolSort('foerderbedarf')">LE{{ poolSortMarker('foerderbedarf') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setPoolSort('zieldifferent')">ZD{{ poolSortMarker('zieldifferent') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setPoolSort('herkunft')">Herkunft{{ poolSortMarker('herkunft') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setPoolSort('abgleich_status')">Abgleichstatus{{ poolSortMarker('abgleich_status') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setPoolSort('anmeldestatus')">Anmeldestatus{{ poolSortMarker('anmeldestatus') }}</button></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadingPoolSchueler">
              <td colspan="9" class="table-empty">Daten werden geladen...</td>
            </tr>
            <tr v-else-if="!sortedPoolSchuelerRows.length">
              <td colspan="9" class="table-empty">Keine Datensaetze in anm_schueler gefunden.</td>
            </tr>
            <tr v-for="(row, index) in sortedPoolSchuelerRows" :key="`${row.schueler_id}-${row.schueler_schul_id}-${index}`">
              <td>{{ index + 1 }}</td>
              <td>{{ row.schueler_schul_id || "-" }}</td>
              <td>{{ [row.nachname, row.vorname].filter(Boolean).join(", ") || "-" }}</td>
              <td>{{ formatDate(row.geburtsdatum) }}</td>
              <td>
                <span
                  v-if="isPositiveFlag(row.foerderbedarf)"
                  class="status-badge status-badge-le"
                  :title="foerderbedarfHoverText(row)"
                >ja</span>
              </td>
              <td>
                <span v-if="isPositiveFlag(row.zieldifferent)" class="status-badge status-badge-zd">ja</span>
              </td>
              <td>{{ displayHerkunft(row) }}</td>
              <td>{{ row.abgleich_status || "-" }}</td>
              <td>
                <span
                  v-if="normalizeText(row.anmeldestatus) === 'Zugeordnet'"
                  class="status-badge status-badge-assigned"
                >{{ row.anmeldestatus }}</span>
                <span
                  v-else-if="normalizeText(row.anmeldestatus) === 'Ohne'"
                  class="status-badge status-badge-without"
                >{{ row.anmeldestatus }}</span>
                <template v-else>{{ row.anmeldestatus || "-" }}</template>
              </td>
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

.pool-table-toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1.6fr) repeat(3, minmax(130px, 1fr));
  gap: 8px;
  align-items: end;
}

.pool-table-toolbar label {
  display: grid;
  gap: 4px;
}

.pool-table-toolbar span {
  color: #5a7393;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.pool-table-toolbar input,
.pool-table-toolbar select {
  min-height: 32px;
  border: 1px solid #d7e2ef;
  border-radius: 8px;
  padding: 0 10px;
  background: #fff;
  color: #17385f;
  font-size: 13px;
}

.pool-search-field {
  min-width: 0;
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

.detail-table-wrap {
  max-height: 560px;
}

.detail-table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  font-size: 13px;
}

.detail-table thead th {
  position: sticky;
  top: 0;
  background: #f8fbff;
  z-index: 1;
}

.detail-table th,
.detail-table td {
  padding: 4px 7px;
  border-bottom: 1px solid #e5edf6;
  text-align: left;
  vertical-align: middle;
}

.detail-table th {
  color: #5a7393;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.table-sort-btn {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.table-empty {
  text-align: center !important;
  color: #6b7f99;
  padding: 18px 12px !important;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 20px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.status-badge-le {
  background: #e9f6ec;
  color: #21653a;
}

.status-badge-zd {
  background: #fdf1d8;
  color: #9a5a00;
}

.status-badge-assigned {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-badge-without {
  background: #fee2e2;
  color: #b91c1c;
}

@media (max-width: 900px) {
  .import-card-head,
  .import-preview-head {
    flex-direction: column;
  }

  .pool-table-toolbar {
    grid-template-columns: 1fr;
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
