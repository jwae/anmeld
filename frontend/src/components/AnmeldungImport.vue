<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import importService from "../services/importService";
import AnmeldungenImportOverlay from "./AnmeldungenImportOverlay.vue";
import RueckmeldungenMgImportOverlay from "./RueckmeldungenMgImportOverlay.vue";
import type { Anmeldeverfahrenstyp } from "../types";

type SchoolRow = {
  snr: string;
  name: string;
  kapazitaet?: number;
  neuaufnahme?: number;
  warteliste?: number;
  freie_plaetze?: number;
};

const props = defineProps<{
  token?: string;
  verfahrenId: number | null;
  rundeId: number | null;
  verfahrenstyp?: Anmeldeverfahrenstyp | null;
  isReadonly?: boolean;
}>();

const schools = ref<SchoolRow[]>([]);
const loadingSchools = ref(false);
const importing = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const importSummary = ref<any | null>(null);
const isExpanded = ref(false);
const showCsvImportOverlay = ref(false);
const showRueckmeldungenMgOverlay = ref(false);
const showSchildDiagnosticsOverlay = ref(false);
const schildDiagnostics = ref<Array<{
  snr: string;
  message: string;
  imported_rows: number;
  updated_rows: number;
  skipped_rows: number;
  error_rows: number;
  rows_read: number;
  status_summary?: { UPDATE: number; NEU: number; FEHLER: number };
  row_results?: Array<{ row_number: number; action: "UPDATE" | "NEU" | "FEHLER"; message: string }>;
  diagnostics?: {
    school_name?: string;
    school_snr?: string;
    host?: string;
    db_name?: string;
    connection_established?: boolean;
    current_section_label?: string;
    current_section_id?: number;
    selection_count?: number;
    status_0_count?: number;
    status_1_count?: number;
    status_2_count?: number;
    eligible_count?: number;
  };
}>>([]);

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

async function toggleExpanded() {
  const nextExpanded = !isExpanded.value;
  isExpanded.value = nextExpanded;
  if (!nextExpanded) return;
  await loadSchools();
}

function openCsvImportOverlay() {
  if (props.isReadonly) return;
  if (!props.verfahrenId || !props.rundeId || importing.value) return;
  errorMessage.value = "";
  successMessage.value = "";
  showCsvImportOverlay.value = true;
}

function openRueckmeldungenMgOverlay() {
  if (props.isReadonly || !props.verfahrenId || !props.rundeId || importing.value) return;
  errorMessage.value = "";
  successMessage.value = "";
  showRueckmeldungenMgOverlay.value = true;
}

async function importiereAnmeldungenAusSchild3() {
  if (props.isReadonly) return;
  if (!props.verfahrenId || !props.rundeId) {
    errorMessage.value = "Bitte zuerst Verfahren und Runde auswaehlen.";
    return;
  }

  try {
    importing.value = true;
    errorMessage.value = "";
    successMessage.value = "";
    importSummary.value = null;
    const response = await importService.importiereAnmeldungenAusSchild3({
      verfahren_id: props.verfahrenId,
      runde_id: props.rundeId,
    }, props.token);
    importSummary.value = response;
    schildDiagnostics.value = Array.isArray(response?.schools) ? response.schools : [];
    showSchildDiagnosticsOverlay.value = schildDiagnostics.value.length > 0;
    successMessage.value = "Anmeldungen aus Schild3 wurden importiert.";
    await loadSchools();
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Der Import aus Schild3 ist fehlgeschlagen.";
  } finally {
    importing.value = false;
  }
}

function closeSchildDiagnosticsOverlay() {
  showSchildDiagnosticsOverlay.value = false;
}

function formatDiagnosticBoolean(value: unknown) {
  return value ? "Ja" : "Nein";
}

async function handleWizardSuccess(result: any) {
  const inserted = Number(result?.inserted || 0);
  const updated = Number(result?.updated || 0);
  const skipped = Number(result?.skipped || 0);
  const errors = Number(result?.errors || 0);
  importSummary.value = {
    total_summary: {
      imported_rows: inserted,
      updated_rows: updated,
      skipped_rows: skipped,
      error_rows: errors,
      pool_anmeldung: Number(result?.pool_anmeldung || 0),
      nur_anmeldung: Number(result?.nur_anmeldung || 0),
      rows_read: inserted + updated + skipped + errors,
      status_summary: result?.status_summary || { UPDATE: updated, NEU: inserted, FEHLER: errors },
    },
  };
  successMessage.value = "Anmeldungsimport erfolgreich abgeschlossen.";
  await loadSchools();
}

async function handleRueckmeldungenMgSuccess(result: any) {
  importSummary.value = {
    total_summary: {
      rows_read: Number(result?.inserted || 0) + Number(result?.updated || 0) + Number(result?.skipped || 0),
      imported_rows: Number(result?.inserted || 0),
      updated_rows: Number(result?.updated || 0),
      skipped_rows: Number(result?.skipped || 0),
      error_rows: Number(result?.technical_errors || 0),
    },
  };
  successMessage.value = `${Number(result?.inserted || 0)} Schüler neu angelegt, ${Number(result?.updated || 0)} Rückmeldungen aktualisiert.`;
  await loadSchools();
}

watch(() => [props.verfahrenId, props.rundeId], () => {
  importSummary.value = null;
  successMessage.value = "";
  errorMessage.value = "";
  showCsvImportOverlay.value = false;
  showRueckmeldungenMgOverlay.value = false;
  showSchildDiagnosticsOverlay.value = false;
  schildDiagnostics.value = [];
  loadSchools();
}, { immediate: true });

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
            @click="toggleExpanded"
          >
            <span class="section-toggle-chevron" :class="{ 'is-collapsed': !isExpanded }" aria-hidden="true"></span>
          </button>
          Schulanmeldungen importieren (CSV, Schild3)
        </h3>
        <p>CSV-Datei fuer die aktuelle Runde pruefen, Statuswerte zuordnen und gueltige Anmeldungen in anm_schueler uebernehmen.</p>
      </div>
      <div class="import-head-actions">
        <button class="btn-secondary" type="button" :disabled="isReadonly || !verfahrenId || !rundeId || importing" @click="openCsvImportOverlay">
          Import (CSV)
        </button>
        <button class="btn-secondary" type="button" :disabled="isReadonly || !verfahrenId || !rundeId || importing" @click="importiereAnmeldungenAusSchild3">
          Import aus Schild3
        </button>
        <button class="btn-secondary" type="button" :disabled="isReadonly || !verfahrenId || !rundeId || importing" @click="openRueckmeldungenMgOverlay">
          Rückmeldungen MG
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
                <th>SNr</th>
                <th>Schulname</th>
                <th>Kapazitaet</th>
                <th>Neuaufnahme</th>
                <th>Warteliste</th>
                <th>Freie Plaetze</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="school in schools" :key="school.snr">
                <td class="school-snr-cell">{{ school.snr }}</td>
                <td><strong :title="String(school.name || '').trim()">{{ school.name }}</strong></td>
                <td>{{ Number(school.kapazitaet || 0) }}</td>
                <td>{{ Number(school.neuaufnahme || 0) }}</td>
                <td>{{ Number(school.warteliste || 0) }}</td>
                <td :class="{ 'is-negative': Number(school.freie_plaetze || 0) < 0 }">{{ Number(school.freie_plaetze || 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="importSummary?.total_summary" class="import-summary">
        <div><strong>UPDATE:</strong> {{ importSummary.total_summary?.status_summary?.UPDATE ?? importSummary.total_summary?.updated_rows ?? 0 }}</div>
        <div><strong>NEU:</strong> {{ importSummary.total_summary?.status_summary?.NEU ?? importSummary.total_summary?.imported_rows ?? 0 }}</div>
        <div><strong>FEHLER:</strong> {{ importSummary.total_summary?.status_summary?.FEHLER ?? importSummary.total_summary?.error_rows ?? 0 }}</div>
      </div>

      <div v-if="schildDiagnostics.length" class="diagnostic-actions">
        <button class="btn-secondary" type="button" @click="showSchildDiagnosticsOverlay = true">
          Diagnose anzeigen
        </button>
      </div>
    </div>

    <AnmeldungenImportOverlay
      :open="showCsvImportOverlay"
      :token="token"
      :verfahren-id="verfahrenId"
      :runde-id="rundeId"
      :schools="schools.map((school) => ({ snr: school.snr, name: school.name }))"
      @close="showCsvImportOverlay = false"
      @success="handleWizardSuccess"
    />

    <RueckmeldungenMgImportOverlay
      :open="showRueckmeldungenMgOverlay"
      :token="token"
      :verfahren-id="verfahrenId"
      :runde-id="rundeId"
      @close="showRueckmeldungenMgOverlay = false"
      @success="handleRueckmeldungenMgSuccess"
    />

    <div
      v-if="showSchildDiagnosticsOverlay"
      class="diagnostic-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schild3-diagnostics-title"
      @click.self="closeSchildDiagnosticsOverlay"
    >
      <section class="diagnostic-overlay-card">
        <div class="diagnostic-overlay-head">
          <h3 id="schild3-diagnostics-title">Backend-Diagnose Schild3-Import</h3>
        </div>
        <div class="diagnostic-overlay-copy">
          <p>Diese Werte kommen direkt aus dem Backend pro Schule und zeigen, was der Schild3-Import wirklich gesehen hat.</p>
          <div class="diagnostic-list">
            <article
              v-for="entry in schildDiagnostics"
              :key="`${entry.snr}-${entry.diagnostics?.current_section_id || 0}`"
              class="diagnostic-item"
            >
              <div class="diagnostic-item-head">
                <strong>{{ entry.diagnostics?.school_name || entry.snr || "-" }}</strong>
                <span>{{ entry.diagnostics?.school_snr || entry.snr || "-" }}</span>
              </div>
              <div class="diagnostic-grid">
                <div><strong>Verbindung:</strong> {{ formatDiagnosticBoolean(entry.diagnostics?.connection_established) }}</div>
                <div><strong>Host:</strong> {{ entry.diagnostics?.host || "-" }}</div>
                <div><strong>Schema:</strong> {{ entry.diagnostics?.db_name || "-" }}</div>
                <div><strong>Abschnitt:</strong> {{ entry.diagnostics?.current_section_label || "-" }}</div>
                <div><strong>Abschnitts-ID:</strong> {{ entry.diagnostics?.current_section_id || "-" }}</div>
                <div><strong>Auswahlliste:</strong> {{ entry.diagnostics?.selection_count ?? "-" }}</div>
                <div><strong>Status 0:</strong> {{ entry.diagnostics?.status_0_count ?? "-" }}</div>
                <div><strong>Status 1:</strong> {{ entry.diagnostics?.status_1_count ?? "-" }}</div>
                <div><strong>Status 2:</strong> {{ entry.diagnostics?.status_2_count ?? "-" }}</div>
                <div><strong>Kandidaten:</strong> {{ entry.diagnostics?.eligible_count ?? "-" }}</div>
                <div><strong>Gelesen:</strong> {{ entry.rows_read ?? "-" }}</div>
                <div><strong>Importiert:</strong> {{ entry.imported_rows ?? "-" }}</div>
                <div><strong>Aktualisiert:</strong> {{ entry.updated_rows ?? "-" }}</div>
                <div><strong>Uebersprungen:</strong> {{ entry.skipped_rows ?? "-" }}</div>
                <div><strong>Fehler:</strong> {{ entry.error_rows ?? "-" }}</div>
              </div>
              <p v-if="entry.message" class="diagnostic-message">{{ entry.message }}</p>
              <p v-if="entry.status_summary" class="diagnostic-message">
                {{ entry.status_summary.UPDATE }} UPDATE · {{ entry.status_summary.NEU }} NEU · {{ entry.status_summary.FEHLER }} FEHLER
              </p>
              <div v-if="entry.row_results?.length" class="table-wrap">
                <table class="import-table">
                  <thead><tr><th>Zeile</th><th>Status</th><th>Detail</th></tr></thead>
                  <tbody>
                    <tr v-for="result in entry.row_results" :key="`${entry.snr}-${result.row_number}-${result.action}`">
                      <td>{{ result.row_number }}</td><td>{{ result.action }}</td><td>{{ result.message }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </div>
        <div class="diagnostic-overlay-actions">
          <button class="btn-secondary" type="button" @click="closeSchildDiagnosticsOverlay">
            Schliessen
          </button>
        </div>
      </section>
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

.import-card-head {
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
  font-size: 1.3em;
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

.import-head-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.import-head-actions .btn-secondary {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid #c8dbef;
  background: #ffffff;
  color: #1f466f;
  line-height: 1;
  white-space: nowrap;
  box-shadow: 0 6px 14px rgba(30, 68, 107, 0.08);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;
}

.import-head-actions .btn-secondary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(30, 68, 107, 0.12);
}

.import-head-actions .btn-secondary:disabled {
  background: #f3f6fa;
  color: #8ba0b8;
  box-shadow: none;
  cursor: not-allowed;
}

.btn-secondary {
  border-radius: 999px;
  padding: 10px 16px;
  font-weight: 700;
  border: 0;
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

.diagnostic-actions {
  display: flex;
  justify-content: flex-start;
}

.table-wrap {
  overflow-x: auto;
  max-height: 640px;
  overflow-y: auto;
  border: 1px solid #e5edf6;
  border-radius: 16px;
  background: #ffffff;
}

.diagnostic-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(3px);
  overflow-y: auto;
}

.diagnostic-overlay-card {
  width: min(980px, 100%);
  max-height: calc(100vh - 40px);
  border-radius: 24px;
  border: 1px solid rgba(219, 228, 240, 0.9);
  background:
    radial-gradient(circle at top right, rgba(143, 187, 233, 0.22), transparent 34%),
    linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-shadow: 0 28px 60px rgba(15, 23, 42, 0.2);
  padding: 24px;
  display: grid;
  gap: 18px;
}

.diagnostic-overlay-head h3 {
  margin: 0;
  color: #19365b;
}

.diagnostic-overlay-copy {
  display: grid;
  gap: 12px;
}

.diagnostic-overlay-copy p {
  margin: 0;
  color: #4a607e;
  line-height: 1.6;
}

.diagnostic-list {
  display: grid;
  gap: 14px;
}

.diagnostic-item {
  display: grid;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid #d8e4f3;
  border-radius: 16px;
  background: #f8fbff;
}

.diagnostic-item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.diagnostic-item-head strong {
  color: #19365b;
}

.diagnostic-item-head span {
  color: #5f7593;
  font-size: 0.92rem;
}

.diagnostic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px 14px;
  font-size: 0.94rem;
  color: #334e68;
}

.diagnostic-message {
  padding: 12px 14px;
  border-radius: 12px;
  background: #eef4fd;
  color: #1f3f67;
}

.diagnostic-overlay-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.school-table-wrap {
  max-height: none;
}

.import-table {
  width: 100%;
  min-width: 860px;
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

.school-snr-cell {
  white-space: nowrap;
  color: #5d7390;
  font-size: 13px;
}

.import-table td.is-negative {
  color: #b42318;
  font-weight: 700;
}

.feedback-panel {
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 14px;
}

.feedback-panel-error {
  border: 1px solid #fca5a5;
  background: #fff5f5;
  color: #991b1b;
}

.feedback-panel-success {
  border: 1px solid #a7f3d0;
  background: #f0fdf4;
  color: #065f46;
}

.feedback-title {
  font-weight: 700;
  margin: 0 0 4px;
}

@media (max-width: 900px) {
  .import-card-head {
    flex-direction: column;
  }

  .diagnostic-item-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .diagnostic-overlay-card {
    padding: 20px;
  }
}
</style>
