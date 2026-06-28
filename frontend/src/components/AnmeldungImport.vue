<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import importService from "../services/importService";
import AnmeldungenImportOverlay from "./AnmeldungenImportOverlay.vue";

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
}>();

const schools = ref<SchoolRow[]>([]);
const loadingSchools = ref(false);
const importing = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const importSummary = ref<any | null>(null);
const isExpanded = ref(false);
const showCsvImportOverlay = ref(false);

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
  if (!props.verfahrenId || !props.rundeId || importing.value) return;
  errorMessage.value = "";
  successMessage.value = "";
  showCsvImportOverlay.value = true;
}

async function importiereAnmeldungenAusSchild3() {
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
    successMessage.value = "Anmeldungen aus Schild3 wurden importiert.";
    await loadSchools();
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Der Import aus Schild3 ist fehlgeschlagen.";
  } finally {
    importing.value = false;
  }
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
    },
  };
  successMessage.value = "Anmeldungsimport erfolgreich abgeschlossen.";
  await loadSchools();
}

watch(() => [props.verfahrenId, props.rundeId], () => {
  importSummary.value = null;
  successMessage.value = "";
  errorMessage.value = "";
  showCsvImportOverlay.value = false;
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
        <button class="btn-secondary" type="button" :disabled="!verfahrenId || !rundeId || importing" @click="openCsvImportOverlay">
          Import (CSV)
        </button>
        <button class="btn-secondary" type="button" :disabled="!verfahrenId || !rundeId || importing" @click="importiereAnmeldungenAusSchild3">
          Import aus Schild3
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
        <div><strong>Gelesen:</strong> {{ importSummary.total_summary?.rows_read || 0 }}</div>
        <div><strong>Importiert:</strong> {{ importSummary.total_summary?.imported_rows || 0 }}</div>
        <div><strong>Aktualisiert:</strong> {{ importSummary.total_summary?.updated_rows || 0 }}</div>
        <div><strong>Uebersprungen:</strong> {{ importSummary.total_summary?.skipped_rows || 0 }}</div>
        <div><strong>Fehler:</strong> {{ importSummary.total_summary?.error_rows || 0 }}</div>
        <div><strong>Pool + Anmeldung:</strong> {{ importSummary.total_summary?.pool_anmeldung || 0 }}</div>
        <div><strong>Nur Anmeldung:</strong> {{ importSummary.total_summary?.nur_anmeldung || 0 }}</div>
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

.table-wrap {
  overflow-x: auto;
  max-height: 640px;
  overflow-y: auto;
  border: 1px solid #e5edf6;
  border-radius: 16px;
  background: #ffffff;
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
}
</style>
