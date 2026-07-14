<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import KapazitaetenListe from '../components/KapazitaetenListe.vue';
import KapazitaetForm from '../components/KapazitaetForm.vue';
import kapazitaetService from '../services/kapazitaetService';

const props = defineProps<{
  verfahrenId: number | null;
  token?: string;
}>();

const schools = ref<any[]>([]);
const capacities = ref<any[]>([]);
const loading = ref(false);
const activeForm = ref<'create' | 'edit' | null>(null);
const currentKapazitaet = ref<any | null>(null);
const errorMessage = ref('');
const successMessage = ref('');
const kapazitaetenImportInput = ref<HTMLInputElement | null>(null);
const kapazitaetenImportPreviewModalOpen = ref(false);
const kapazitaetenImportFileName = ref('');
const kapazitaetenImportPreviewToken = ref('');
const kapazitaetenImportPreviewData = ref<any[]>([]);
const kapazitaetenImportSummary = ref({
  total_rows: 0,
  valid_rows: 0,
  invalid_rows: 0,
  selected_rows: 0,
});
const importSaving = ref(false);
const importSuccessOverlayMessage = ref('');
const isExpanded = ref(false);
let importSuccessOverlayTimeoutId: ReturnType<typeof setTimeout> | null = null;

const mergedRows = computed(() => {
  const bySnr = new Map<string, any[]>();
  capacities.value.forEach((item) => {
    const list = bySnr.get(String(item.snr)) || [];
    list.push(item);
    bySnr.set(String(item.snr), list);
  });

  return schools.value.map((school) => {
    const schoolCapacities = bySnr.get(String(school.snr)) || [];
    if (schoolCapacities.length) {
      return schoolCapacities.map((item) => ({
        ...item,
        hasCapacity: true,
        schulname: item.schulname || school.name,
        schulform_name: item.schulform_name || school.schulform_name || '–',
        is_active: school.is_active ?? true,
      }));
    }

    return [{
      id: null,
      snr: school.snr,
      schulname: school.name,
      schulform_name: school.schulform_name || '–',
      is_active: school.is_active ?? true,
      hasCapacity: false,
      jahrgang: '',
      maximale_klassen: null,
      maximale_schueler_pro_klasse: null,
      gesamtkapazitaet: null,
      reservierte_plaetze: null,
      bemerkung: '',
    }];
  }).flat();
});

async function loadSchools() {
  if (!props.verfahrenId) {
    schools.value = [];
    return;
  }

  const rows = await kapazitaetService.getVerfahrenSchulen(props.verfahrenId, props.token);
  schools.value = rows.map((row: any) => ({
    ...row,
    schulform_name: row.schulform_name || '–',
    is_active: row.is_active !== undefined ? Boolean(Number(row.is_active)) : true,
  }));
}

async function loadCapacities() {
  if (!props.verfahrenId) {
    capacities.value = [];
    return;
  }

  capacities.value = await kapazitaetService.getKapazitaeten(
    { verfahren_id: props.verfahrenId },
    props.token,
  );
}

async function refreshData() {
  errorMessage.value = '';
  successMessage.value = '';
  loading.value = true;

  try {
    await Promise.all([loadSchools(), loadCapacities()]);
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || 'Fehler beim Laden der Kapazitäten.';
  } finally {
    loading.value = false;
  }
}

function clearImportSuccessOverlayTimer() {
  if (!importSuccessOverlayTimeoutId) return;
  clearTimeout(importSuccessOverlayTimeoutId);
  importSuccessOverlayTimeoutId = null;
}

function showImportSuccessOverlay(message: string) {
  clearImportSuccessOverlayTimer();
  importSuccessOverlayMessage.value = String(message || '').trim();
  if (!importSuccessOverlayMessage.value) return;
  importSuccessOverlayTimeoutId = setTimeout(() => {
    importSuccessOverlayMessage.value = '';
    importSuccessOverlayTimeoutId = null;
  }, 2600);
}

function openKapazitaetenImportPicker() {
  kapazitaetenImportInput.value?.click();
}

function refreshKapazitaetenImportSelectionSummary() {
  kapazitaetenImportSummary.value = {
    ...kapazitaetenImportSummary.value,
    selected_rows: kapazitaetenImportPreviewData.value.filter((row) => !!row?.selected && row?.status !== 'Fehler').length,
  };
}

function closeKapazitaetenImportPreview() {
  kapazitaetenImportPreviewModalOpen.value = false;
  kapazitaetenImportFileName.value = '';
  kapazitaetenImportPreviewToken.value = '';
  kapazitaetenImportPreviewData.value = [];
  kapazitaetenImportSummary.value = {
    total_rows: 0,
    valid_rows: 0,
    invalid_rows: 0,
    selected_rows: 0,
  };
}

function selectAllKapazitaetenImportRows() {
  const validRows = kapazitaetenImportPreviewData.value.filter((row) => row?.status !== 'Fehler');
  const shouldSelectAll = validRows.some((row) => !row?.selected);
  for (const row of kapazitaetenImportPreviewData.value) {
    if (row?.status === 'Fehler') {
      row.selected = false;
      continue;
    }
    row.selected = shouldSelectAll;
  }
  refreshKapazitaetenImportSelectionSummary();
}

async function handleKapazitaetenImportFileSelected(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0] || null;
  if (!file || !props.verfahrenId) return;

  try {
    errorMessage.value = '';
    successMessage.value = '';
    kapazitaetenImportFileName.value = file.name;
    const csvText = await file.text();
    const response = await kapazitaetService.previewKapazitaetenImport(props.verfahrenId, csvText, props.token);
    kapazitaetenImportPreviewToken.value = String(response?.preview_token || '').trim();
    kapazitaetenImportPreviewData.value = Array.isArray(response?.rows) ? response.rows : [];
    kapazitaetenImportSummary.value = {
      total_rows: Number(response?.summary?.total_rows || 0),
      valid_rows: Number(response?.summary?.valid_rows || 0),
      invalid_rows: Number(response?.summary?.invalid_rows || 0),
      selected_rows: Number(response?.summary?.selected_rows || 0),
    };
    if (!kapazitaetenImportPreviewData.value.length) {
      throw new Error('Keine importierbaren Zeilen gefunden.');
    }
    refreshKapazitaetenImportSelectionSummary();
    kapazitaetenImportPreviewModalOpen.value = true;
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || 'Fehler beim Lesen der Kapazitaeten-CSV-Datei.';
  } finally {
    if (input) input.value = '';
  }
}

async function confirmKapazitaetenImport() {
  if (!props.verfahrenId) {
    errorMessage.value = 'Bitte zuerst ein Anmeldeverfahren auswaehlen.';
    return;
  }

  importSaving.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const validSelectedRows = kapazitaetenImportPreviewData.value.filter((row) => !!row?.selected && row?.status !== 'Fehler');
    if (!validSelectedRows.length) {
      throw new Error('Bitte mindestens eine gueltige Zeile fuer den Import auswaehlen.');
    }

    const response = await kapazitaetService.importKapazitaeten(
      props.verfahrenId,
      kapazitaetenImportPreviewToken.value,
      validSelectedRows.map((row) => Number(row?.row_no || 0)).filter((rowNo) => rowNo > 0),
      props.token,
    );
    const summary = response?.summary || {};
    closeKapazitaetenImportPreview();
    await refreshData();
    const successText = `${Number(summary.imported_count || 0)} Kapazitaet(en) importiert. Neu: ${Number(summary.created_count || 0)}, aktualisiert: ${Number(summary.updated_count || 0)}, uebersprungen: ${Number(summary.skipped_count || 0)}.`;
    successMessage.value = '';
    showImportSuccessOverlay(successText);
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || 'Der CSV-Import der Kapazitaeten ist fehlgeschlagen.';
  } finally {
    importSaving.value = false;
  }
}

function openAddForm(row?: any) {
  currentKapazitaet.value = {
    id: null,
    verfahren_id: props.verfahrenId,
    snr: row?.snr || '',
    jahrgang: '',
    maximale_klassen: 0,
    maximale_schueler_pro_klasse: 0,
    gesamtkapazitaet: 0,
    reservierte_plaetze: 0,
    bemerkung: '',
  };
  activeForm.value = 'create';
}

function openEditForm(row: any) {
  currentKapazitaet.value = {
    ...row,
    verfahren_id: props.verfahrenId,
  };
  activeForm.value = 'edit';
}

function closeForm() {
  activeForm.value = null;
  currentKapazitaet.value = null;
}

async function saveKapazitaet(data: any) {
  try {
    if (!props.verfahrenId) {
      errorMessage.value = 'Bitte zuerst ein Anmeldeverfahren auswählen.';
      return;
    }

    if (data.id) {
      await kapazitaetService.updateKapazitaet(Number(data.id), data, props.token);
      successMessage.value = 'Kapazität erfolgreich aktualisiert.';
    } else {
      await kapazitaetService.createKapazitaet(data, props.token);
      successMessage.value = 'Kapazität erfolgreich angelegt.';
    }

    closeForm();
    await refreshData();
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || 'Fehler beim Speichern der Kapazität.';
  }
}

async function deleteKapazitaet(id: number) {
  if (!window.confirm('Soll diese Kapazität wirklich gelöscht werden?')) {
    return;
  }

  try {
    await kapazitaetService.deleteKapazitaet(id, props.token);
    successMessage.value = 'Kapazität erfolgreich gelöscht.';
    await refreshData();
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || 'Fehler beim Löschen der Kapazität.';
  }
}

watch(() => props.verfahrenId, () => {
  closeForm();
  refreshData();
}, { immediate: true });

onBeforeUnmount(() => {
  clearImportSuccessOverlayTimer();
});
</script>

<template>
  <section class="kapazitaeten-view">
    <div class="kapazitaeten-toolbar">
      <div>
        <p class="kapazitaeten-eyebrow">Schulkapazitäten</p>
        <h2>
          <button
            type="button"
            class="section-toggle"
            :aria-expanded="isExpanded ? 'true' : 'false'"
            @click="isExpanded = !isExpanded"
          >
            <span class="section-toggle-chevron" :class="{ 'is-collapsed': !isExpanded }" aria-hidden="true"></span>
          </button>
          
          Kapazitäten der aufnehmenden Schulen verwalten
        </h2>
        <p class="kapazitaeten-intro">
          Erfasse die Kapazitäten der aufnehmenden Schulen.
        </p>
      </div>


    </div>

    <div v-show="isExpanded" class="section-panel">
    <input
      ref="kapazitaetenImportInput"
      type="file"
      accept=".csv,text/csv"
      class="kapazitaeten-import-input"
      @change="handleKapazitaetenImportFileSelected"
    />

    <div v-if="errorMessage" class="feedback-panel feedback-panel-error">
      <p class="feedback-title">Fehler</p>
      <p>{{ errorMessage }}</p>
    </div>

    <div v-else-if="successMessage" class="feedback-panel feedback-panel-success">
      <p class="feedback-title">Erfolg</p>
      <p>{{ successMessage }}</p>
    </div>

    <transition name="kapazitaeten-import-overlay-fade">
      <div v-if="importSuccessOverlayMessage" class="kapazitaeten-import-success-overlay" role="status" aria-live="polite">
        <div class="kapazitaeten-import-success-card">
          <strong>Import erfolgreich</strong>
          <span>{{ importSuccessOverlayMessage }}</span>
        </div>
      </div>
    </transition>

    <div v-if="!verfahrenId" class="feedback-panel feedback-panel-warning">
      <p class="feedback-title">Kein Verfahren ausgewählt</p>
      <p>Wähle zuerst ein Anmeldeverfahren in „Verfahren und Runden“, damit die Kapazitäten geladen werden können.</p>
    </div>

    <template v-else>
      <KapazitaetenListe
        :rows="mergedRows"
        :loading="loading"
        :verfahren-id="verfahrenId"
        @add="openAddForm"
        @edit="openEditForm"
        @delete="deleteKapazitaet"
        @refresh="refreshData"
        @import="openKapazitaetenImportPicker"
      />
    </template>

    <KapazitaetForm
      v-if="activeForm"
      :kapazitaet="currentKapazitaet"
      :schulen="schools"
      :verfahren-id="verfahrenId"
      @save="saveKapazitaet"
      @cancel="closeForm"
    />
    </div>

    <div
      v-if="kapazitaetenImportPreviewModalOpen"
      class="kapazitaeten-modal-overlay"
      @click.self="closeKapazitaetenImportPreview"
    >
      <section class="kapazitaeten-modal" role="dialog" aria-modal="true" aria-label="CSV-Vorschau Kapazitaeten">
        <div class="kapazitaeten-modal-head">
          <div>
            <h3>CSV-Vorschau Kapazitaeten</h3>
            <p>Die Datei <strong>{{ kapazitaetenImportFileName }}</strong> enthaelt {{ kapazitaetenImportSummary.total_rows }} gelesene Zeile(n).</p>
            <p>{{ kapazitaetenImportSummary.valid_rows }} gueltig, {{ kapazitaetenImportSummary.invalid_rows }} fehlerhaft, {{ kapazitaetenImportSummary.selected_rows }} ausgewaehlt.</p>
          </div>
          <button class="btn-secondary" type="button" @click="closeKapazitaetenImportPreview" :disabled="importSaving">
            Schliessen
          </button>
        </div>

        <div class="kapazitaeten-modal-list">
          <table class="kapazitaeten-modal-table">
            <thead>
              <tr>
                <th>
                  <button class="kapazitaeten-import-select-all" type="button" @click="selectAllKapazitaetenImportRows" :disabled="importSaving">
                    Import
                  </button>
                </th>
                <th>Zeile</th>
                <th>Status</th>
                <th>Fehler</th>
                <th>SNR</th>
                <th>Schule</th>
                <th>Jahrgang</th>
                <th>Max. Klassen</th>
                <th>Schueler/Klasse</th>
                <th>Gesamtkapazitaet</th>
                <th>Reserviert</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in kapazitaetenImportPreviewData"
                :key="`kapazitaet-import-preview-${row.row_no}-${row.snr}-${row.jahrgang}`"
                :class="{ 'is-invalid': row.status === 'Fehler' }"
              >
                <td>
                  <input v-model="row.selected" type="checkbox" :disabled="importSaving || row.status === 'Fehler'" @change="refreshKapazitaetenImportSelectionSummary" />
                </td>
                <td>{{ row.row_no }}</td>
                <td>
                  <span class="kapazitaeten-status-chip" :class="row.status === 'Fehler' ? 'is-error' : 'is-ok'">{{ row.status }}</span>
                </td>
                <td :title="Array.isArray(row.errors) ? row.errors.join(', ') : ''">
                  {{ Array.isArray(row.errors) && row.errors.length ? row.errors.join(", ") : "-" }}
                </td>
                <td>{{ row.snr || "-" }}</td>
                <td :title="row.schulname || '-'">{{ row.schulname || "-" }}</td>
                <td>{{ row.jahrgang || "-" }}</td>
                <td>{{ row.maximale_klassen ?? "-" }}</td>
                <td>{{ row.maximale_schueler_pro_klasse ?? "-" }}</td>
                <td>{{ row.gesamtkapazitaet ?? "-" }}</td>
                <td>{{ row.reservierte_plaetze ?? "-" }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="kapazitaeten-modal-actions">
          <button class="btn-secondary" type="button" @click="closeKapazitaetenImportPreview" :disabled="importSaving">
            Abbrechen
          </button>
          <button
            class="btn-primary"
            type="button"
            @click="confirmKapazitaetenImport"
            :disabled="importSaving || !kapazitaetenImportPreviewData.some((row) => row?.selected && row?.status !== 'Fehler')"
          >
            {{ importSaving ? "Import laeuft..." : "Import starten" }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.kapazitaeten-view {
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  padding: 20px 22px;
  background:
    radial-gradient(circle at top right, rgba(143, 187, 233, 0.2), transparent 34%),
    linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-shadow: 0 18px 42px rgba(19, 54, 102, 0.08);
  display: grid;
  gap: 16px;
}

.kapazitaeten-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: end;
  flex-wrap: wrap;
}

.kapazitaeten-toolbar h2 {
  margin: 0;
  color: #17385f;
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

.kapazitaeten-eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #6680a3;
}

.kapazitaeten-intro {
  margin: 8px 0 0;
  color: #4a607e;
  max-width: 64ch;
  line-height: 1.5;
}

.kapazitaeten-actions {
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

.kapazitaeten-import-input {
  display: none;
}

.feedback-panel-warning {
  border: 1px solid #d9d9c8;
  background: #fffdf3;
}

.kapazitaeten-import-success-overlay {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 90;
  pointer-events: none;
}

.kapazitaeten-import-success-card {
  display: grid;
  gap: 4px;
  min-width: 320px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 14px 16px;
  border: 1px solid #bfe5c9;
  border-radius: 16px;
  background: rgba(238, 250, 242, 0.98);
  box-shadow: 0 18px 42px rgba(31, 95, 55, 0.16);
  color: #1f5f37;
}

.kapazitaeten-import-success-card strong,
.kapazitaeten-import-success-card span {
  display: block;
}

.kapazitaeten-import-overlay-fade-enter-active,
.kapazitaeten-import-overlay-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.kapazitaeten-import-overlay-fade-enter-from,
.kapazitaeten-import-overlay-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.kapazitaeten-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.45);
}

.kapazitaeten-modal {
  width: min(1200px, 100%);
  max-height: min(86vh, 900px);
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 16px;
  padding: 22px;
  border-radius: 22px;
  background: #ffffff;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
}

.kapazitaeten-modal-head,
.kapazitaeten-modal-actions {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.kapazitaeten-modal-head h3 {
  margin: 0;
  color: #17385f;
}

.kapazitaeten-modal-head p {
  margin: 8px 0 0;
  color: #4a607e;
}

.kapazitaeten-modal-list {
  overflow: auto;
  border: 1px solid #dbe4f0;
  border-radius: 16px;
}

.kapazitaeten-modal-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  font-size: 14px;
}

.kapazitaeten-modal-table th,
.kapazitaeten-modal-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e5edf6;
  text-align: left;
  vertical-align: middle;
}

.kapazitaeten-modal-table th {
  color: #5a7393;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: #fbfdff;
  position: sticky;
  top: 0;
}

.kapazitaeten-modal-table tr.is-invalid {
  background: #fff5f5;
}

.kapazitaeten-import-select-all {
  border: 0;
  background: transparent;
  color: #17385f;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}

.kapazitaeten-status-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
}

.kapazitaeten-status-chip.is-ok {
  background: #e7f7ed;
  color: #16653a;
}

.kapazitaeten-status-chip.is-error {
  background: #fdecec;
  color: #962424;
}

@media (max-width: 760px) {
  .kapazitaeten-import-success-overlay {
    top: 12px;
    left: 12px;
    right: 12px;
  }

  .kapazitaeten-import-success-card {
    min-width: 0;
    max-width: none;
  }

  .kapazitaeten-modal {
    padding: 16px;
  }

  .kapazitaeten-modal-head,
  .kapazitaeten-modal-actions {
    flex-direction: column;
  }
}
</style>
