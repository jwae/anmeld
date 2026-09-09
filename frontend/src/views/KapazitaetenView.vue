<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import KapazitaetenListe from '../components/KapazitaetenListe.vue';
import KapazitaetForm from '../components/KapazitaetForm.vue';
import kapazitaetService from '../services/kapazitaetService';

const props = defineProps<{
  verfahrenId: number | null;
  token?: string;
  isReadonly?: boolean;
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
const kapazitaetenImportStep = ref<1 | 2 | 3>(1);
const kapazitaetenImportResult = ref<any | null>(null);
const kapazitaetenImportSummary = ref({
  total_rows: 0,
  valid_rows: 0,
  invalid_rows: 0,
  selected_rows: 0,
});
const importSaving = ref(false);
const isExpanded = ref(false);

const kapazitaetenImportStatusSummary = computed(() => ({
  neu: kapazitaetenImportPreviewData.value.filter((row) => row?.status === 'Neu').length,
  aenderung: kapazitaetenImportPreviewData.value.filter((row) => row?.status === 'Aenderung').length,
  unveraendert: kapazitaetenImportPreviewData.value.filter((row) => row?.status === 'Unveraendert').length,
  fehler: kapazitaetenImportPreviewData.value.filter((row) => row?.status === 'Fehler').length,
}));

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

function openKapazitaetenImportPicker() {
  if (props.isReadonly) return;
  closeKapazitaetenImportPreview();
  errorMessage.value = '';
  successMessage.value = '';
  kapazitaetenImportPreviewModalOpen.value = true;
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
  kapazitaetenImportStep.value = 1;
  kapazitaetenImportResult.value = null;
  kapazitaetenImportSummary.value = {
    total_rows: 0,
    valid_rows: 0,
    invalid_rows: 0,
    selected_rows: 0,
  };
}

function openKapazitaetenImportFilePicker() {
  if (importSaving.value) return;
  kapazitaetenImportInput.value?.click();
}

function showKapazitaetenImportPreview() {
  if (!kapazitaetenImportPreviewToken.value) return;
  errorMessage.value = '';
  kapazitaetenImportStep.value = 2;
}

function showKapazitaetenImportUpload() {
  if (importSaving.value) return;
  errorMessage.value = '';
  kapazitaetenImportStep.value = 1;
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

async function loadKapazitaetenImportFile(file: File | null) {
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
    kapazitaetenImportStep.value = 1;
  } catch (error: any) {
    kapazitaetenImportPreviewToken.value = '';
    kapazitaetenImportPreviewData.value = [];
    kapazitaetenImportSummary.value = {
      total_rows: 0,
      valid_rows: 0,
      invalid_rows: 0,
      selected_rows: 0,
    };
    errorMessage.value = error?.response?.data?.error || error?.message || 'Fehler beim Lesen der Kapazitaeten-CSV-Datei.';
  }
}

async function handleKapazitaetenImportFileSelected(event: Event) {
  const input = event.target as HTMLInputElement | null;
  await loadKapazitaetenImportFile(input?.files?.[0] || null);
  if (input) input.value = '';
}

async function handleKapazitaetenImportFileDrop(event: DragEvent) {
  await loadKapazitaetenImportFile(event.dataTransfer?.files?.[0] || null);
}

async function confirmKapazitaetenImport() {
  if (props.isReadonly) return;
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
    kapazitaetenImportResult.value = {
      imported_count: Number(summary.imported_count || 0),
      created_count: Number(summary.created_count || 0),
      updated_count: Number(summary.updated_count || 0),
      skipped_count: Number(summary.skipped_count || 0),
    };
    await refreshData();
    successMessage.value = '';
    kapazitaetenImportStep.value = 3;
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || 'Der CSV-Import der Kapazitaeten ist fehlgeschlagen.';
  } finally {
    importSaving.value = false;
  }
}

function openAddForm(row?: any) {
  if (props.isReadonly) return;
  errorMessage.value = '';
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
  if (props.isReadonly) return;
  errorMessage.value = '';
  currentKapazitaet.value = {
    ...row,
    verfahren_id: props.verfahrenId,
  };
  activeForm.value = 'edit';
}

function closeForm() {
  activeForm.value = null;
  currentKapazitaet.value = null;
  errorMessage.value = '';
}

async function saveKapazitaet(data: any) {
  if (props.isReadonly) return;
  errorMessage.value = '';
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
  if (props.isReadonly) return;
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

    <div v-if="errorMessage && !activeForm" class="feedback-panel feedback-panel-error">
      <p class="feedback-title">Fehler</p>
      <p>{{ errorMessage }}</p>
    </div>

    <div v-else-if="successMessage" class="feedback-panel feedback-panel-success">
      <p class="feedback-title">Erfolg</p>
      <p>{{ successMessage }}</p>
    </div>

    <div v-if="!verfahrenId" class="feedback-panel feedback-panel-warning">
      <p class="feedback-title">Kein Verfahren ausgewählt</p>
      <p>Wähle zuerst ein Anmeldeverfahren in „Verfahren und Runden“, damit die Kapazitäten geladen werden können.</p>
    </div>

    <template v-else>
      <KapazitaetenListe
        :rows="mergedRows"
        :loading="loading"
        :verfahren-id="verfahrenId"
        :is-readonly="isReadonly"
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
      :error-message="errorMessage"
      @save="saveKapazitaet"
      @cancel="closeForm"
    />
    </div>

    <div
      v-if="kapazitaetenImportPreviewModalOpen"
      class="kapazitaeten-modal-overlay"
      @click.self="closeKapazitaetenImportPreview"
    >
      <section class="kapazitaeten-modal" role="dialog" aria-modal="true" aria-labelledby="kapazitaeten-import-title">
        <div class="kapazitaeten-modal-head">
          <div>
            <p class="kapazitaeten-import-eyebrow">CSV-Import</p>
            <h3 id="kapazitaeten-import-title">Kapazitaeten importieren</h3>
            <p>
              Schritt {{ kapazitaetenImportStep }} von 3 |
              {{ kapazitaetenImportStep === 1 ? "Datei auswaehlen" : kapazitaetenImportStep === 2 ? "Vorschau pruefen" : "Ergebnis" }}
            </p>
          </div>
          <button class="kapazitaeten-wizard-header-close" type="button" @click="closeKapazitaetenImportPreview" :disabled="importSaving">
            Schliessen
          </button>
        </div>

        <div class="kapazitaeten-import-body">
          <div v-if="errorMessage" class="feedback-panel feedback-panel-error kapazitaeten-import-error">
            <p class="feedback-title">Fehler</p>
            <p>{{ errorMessage }}</p>
          </div>

          <div v-if="kapazitaetenImportStep === 1" class="kapazitaeten-import-upload-step">
          <div
            class="kapazitaeten-import-dropzone"
            @dragover.prevent
            @drop.prevent="handleKapazitaetenImportFileDrop"
          >
            <strong>Importdatei auswaehlen</strong>
            <p>CSV-Datei hier ablegen oder ueber den Dateidialog auswaehlen.</p>
            <div class="kapazitaeten-import-file-selection">
              <button class="btn-primary" type="button" :disabled="importSaving" @click="openKapazitaetenImportFilePicker">
                Datei auswaehlen
              </button>
              <strong v-if="kapazitaetenImportFileName">{{ kapazitaetenImportFileName }}</strong>
            </div>
          </div>

          <section class="kapazitaeten-import-guide">
            <h4>Hinweise zur Importdatei</h4>
            <p>
              Der Import legt Kapazitaeten anhand von Schulnummer und Jahrgang neu an oder aktualisiert
              bereits vorhandene Eintraege. Vor der Uebernahme werden alle Zeilen geprueft und als
              neu, geaendert, unveraendert oder fehlerhaft gekennzeichnet.
            </p>
            <div class="kapazitaeten-import-format">
              <strong>Dateiformat</strong>
              <span>CSV mit Semikolon als Trennzeichen, Kopfzeile und Zeichensatz UTF-8.</span>
            </div>
            <p class="kapazitaeten-import-columns-label">Erforderliche Spalten:</p>
            <code class="kapazitaeten-import-columns">snr;jahrgang;maximale_klassen;maximale_schueler_pro_klasse;gesamtkapazitaet;reservierte_plaetze</code>
          </section>
          </div>

          <div v-else-if="kapazitaetenImportStep === 2" class="kapazitaeten-import-preview-step">
          <div class="kapazitaeten-import-preview-summary">
            <p>Die Datei <strong>{{ kapazitaetenImportFileName }}</strong> enthaelt {{ kapazitaetenImportSummary.total_rows }} gelesene Zeile(n).</p>
            <p>{{ kapazitaetenImportSummary.valid_rows }} gueltig, {{ kapazitaetenImportSummary.invalid_rows }} fehlerhaft, {{ kapazitaetenImportSummary.selected_rows }} ausgewaehlt.</p>
            <div class="kapazitaeten-import-status-summary">
              <span class="is-new">Neu: {{ kapazitaetenImportStatusSummary.neu }}</span>
              <span class="is-change">Aenderung: {{ kapazitaetenImportStatusSummary.aenderung }}</span>
              <span class="is-unchanged">Unveraendert: {{ kapazitaetenImportStatusSummary.unveraendert }}</span>
              <span class="is-error">Fehler: {{ kapazitaetenImportStatusSummary.fehler }}</span>
            </div>
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
          </div>

          <div v-else class="kapazitaeten-import-result" role="status" aria-live="polite">
            <div class="kapazitaeten-import-result-icon" aria-hidden="true">✓</div>
            <div>
              <h4>Import erfolgreich abgeschlossen</h4>
              <p>{{ kapazitaetenImportResult?.imported_count || 0 }} Kapazitaet(en) wurden verarbeitet.</p>
            </div>
            <div class="kapazitaeten-import-result-summary">
              <div><strong>{{ kapazitaetenImportResult?.created_count || 0 }}</strong><span>Neu</span></div>
              <div><strong>{{ kapazitaetenImportResult?.updated_count || 0 }}</strong><span>Aktualisiert</span></div>
              <div><strong>{{ kapazitaetenImportResult?.skipped_count || 0 }}</strong><span>Uebersprungen</span></div>
            </div>
          </div>
        </div>

        <div class="kapazitaeten-modal-actions">
          <button class="kapazitaeten-wizard-close" type="button" @click="closeKapazitaetenImportPreview" :disabled="importSaving">
            {{ kapazitaetenImportStep === 3 ? "Schliessen" : "Abbrechen" }}
          </button>
          <div v-if="kapazitaetenImportStep < 3" class="kapazitaeten-import-navigation">
            <button
              class="kapazitaeten-import-nav-button"
              type="button"
              title="Zurueck"
              aria-label="Zurueck"
              :disabled="importSaving || kapazitaetenImportStep === 1"
              @click="showKapazitaetenImportUpload"
            >
              <span class="kapazitaeten-import-chevron is-back" aria-hidden="true"></span>
            </button>
            <button
              v-if="kapazitaetenImportStep === 1"
              class="kapazitaeten-import-nav-button is-primary"
              type="button"
              title="Weiter zur Vorschau"
              aria-label="Weiter zur Vorschau"
              :disabled="importSaving || !kapazitaetenImportPreviewToken"
              @click="showKapazitaetenImportPreview"
            >
              <span class="kapazitaeten-import-chevron is-next" aria-hidden="true"></span>
            </button>
            <button
              v-else
              class="kapazitaeten-wizard-submit"
              type="button"
              @click="confirmKapazitaetenImport"
              :disabled="importSaving || !kapazitaetenImportPreviewData.some((row) => row?.selected && row?.status !== 'Fehler')"
            >
              {{ importSaving ? "Import laeuft..." : "Import starten" }}
            </button>
          </div>
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

.kapazitaeten-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1600;
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
  background: linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
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

.kapazitaeten-import-eyebrow {
  margin: 0 0 6px !important;
  color: #6680a3 !important;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.kapazitaeten-modal-head p {
  margin: 8px 0 0;
  color: #4a607e;
}

.kapazitaeten-wizard-header-close {
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid #cdd8e6;
  border-radius: 999px;
  background: linear-gradient(180deg, #ffffff 0%, #f4f8fc 100%);
  color: #355172;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.kapazitaeten-wizard-header-close:hover:not(:disabled) {
  border-color: #9bb3cf;
  background: linear-gradient(180deg, #fdfefe 0%, #edf4fb 100%);
}

.kapazitaeten-wizard-close {
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid #cdd8e6;
  border-radius: 999px;
  background: #ffffff;
  color: #355172;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.kapazitaeten-wizard-close:hover:not(:disabled) {
  border-color: #9bb3cf;
  background: #f8fbff;
}

.kapazitaeten-wizard-submit {
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid #163b67;
  border-radius: 999px;
  background: linear-gradient(180deg, #214f86 0%, #163b67 100%);
  color: #ffffff;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(22, 59, 103, 0.22);
  transition: all 0.2s ease;
}

.kapazitaeten-wizard-submit:hover:not(:disabled) {
  border-color: #102a49;
  background: linear-gradient(180deg, #1d4677 0%, #102a49 100%);
}

.kapazitaeten-wizard-header-close:disabled,
.kapazitaeten-wizard-close:disabled,
.kapazitaeten-wizard-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.kapazitaeten-import-error p:last-child {
  margin: 0;
}

.kapazitaeten-import-body {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  overflow: hidden;
}

.kapazitaeten-import-body > :only-child {
  grid-row: 1 / -1;
}

.kapazitaeten-import-upload-step,
.kapazitaeten-import-preview-step {
  min-height: 0;
  overflow: auto;
}

.kapazitaeten-import-upload-step {
  display: grid;
  gap: 18px;
}

.kapazitaeten-import-guide {
  display: grid;
  gap: 10px;
  padding: 18px;
  border: 1px solid #a7d7b5;
  border-radius: 18px;
  background: linear-gradient(180deg, #f0fdf4 0%, #f8fffa 100%);
  color: #405978;
}

.kapazitaeten-import-guide h4,
.kapazitaeten-import-guide p {
  margin: 0;
}

.kapazitaeten-import-guide h4 {
  color: #14532d;
  font-size: 17px;
}

.kapazitaeten-import-guide p {
  line-height: 1.55;
}

.kapazitaeten-import-format {
  display: grid;
  gap: 3px;
  padding: 11px 13px;
  border-left: 4px solid #2f6fb3;
  border-radius: 10px;
  background: #eef6ff;
  color: #294b72;
}

.kapazitaeten-import-format span {
  font-size: 13px;
}

.kapazitaeten-import-columns-label {
  font-size: 13px;
  font-weight: 700;
}

.kapazitaeten-import-columns {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  padding: 12px 14px;
  border-radius: 12px;
  background: #17263a;
  color: #e8f2ff;
  font-size: 12px;
  white-space: nowrap;
}

.kapazitaeten-import-dropzone {
  display: grid;
  gap: 10px;
  justify-items: start;
  padding: 26px;
  border: 2px dashed #9bb3cf;
  border-radius: 22px;
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
}

.kapazitaeten-import-dropzone > strong {
  color: #19365b;
  font-size: 18px;
}

.kapazitaeten-import-dropzone p,
.kapazitaeten-import-dropzone span {
  margin: 0;
  color: #4f6483;
}

.kapazitaeten-import-file-selection {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.kapazitaeten-import-file-selection > strong {
  color: #19365b;
}

.kapazitaeten-import-preview-step {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
}

.kapazitaeten-import-preview-summary {
  display: grid;
  gap: 5px;
}

.kapazitaeten-import-preview-summary p {
  margin: 0;
  color: #4a607e;
}

.kapazitaeten-import-status-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 5px;
}

.kapazitaeten-import-status-summary span {
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.kapazitaeten-import-status-summary .is-new {
  background: #dcfce7;
  color: #166534;
}

.kapazitaeten-import-status-summary .is-change {
  background: #fef3c7;
  color: #92400e;
}

.kapazitaeten-import-status-summary .is-unchanged {
  background: #dbeafe;
  color: #1d4ed8;
}

.kapazitaeten-import-status-summary .is-error {
  background: #fee2e2;
  color: #991b1b;
}

.kapazitaeten-import-result {
  align-self: center;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  padding: 24px;
  border: 1px solid #bfe5c9;
  border-radius: 20px;
  background: linear-gradient(180deg, #f0fdf4 0%, #f8fffa 100%);
  color: #1f5f37;
}

.kapazitaeten-import-result-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #dcfce7;
  color: #166534;
  font-size: 24px;
  font-weight: 800;
}

.kapazitaeten-import-result h4,
.kapazitaeten-import-result p {
  margin: 0;
}

.kapazitaeten-import-result h4 {
  margin-bottom: 5px;
  color: #14532d;
  font-size: 18px;
}

.kapazitaeten-import-result-summary {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.kapazitaeten-import-result-summary div {
  display: grid;
  gap: 3px;
  padding: 14px;
  border: 1px solid #cde8d4;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.7);
}

.kapazitaeten-import-result-summary strong {
  font-size: 20px;
}

.kapazitaeten-import-result-summary span {
  font-size: 12px;
}

.kapazitaeten-import-navigation {
  display: flex;
  align-items: center;
  gap: 12px;
}

.kapazitaeten-import-nav-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid #cdd8e6;
  border-radius: 14px;
  background: #ffffff;
  color: #355172;
  cursor: pointer;
}

.kapazitaeten-import-nav-button.is-primary {
  border-color: #163b67;
  background: linear-gradient(180deg, #214f86 0%, #163b67 100%);
  color: #ffffff;
  box-shadow: 0 10px 24px rgba(22, 59, 103, 0.22);
}

.kapazitaeten-import-nav-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.kapazitaeten-import-chevron {
  width: 10px;
  height: 10px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
}

.kapazitaeten-import-chevron.is-back {
  margin-left: 4px;
  transform: rotate(135deg);
}

.kapazitaeten-import-chevron.is-next {
  margin-right: 4px;
  transform: rotate(-45deg);
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
  .kapazitaeten-modal {
    padding: 16px;
  }

  .kapazitaeten-modal-head,
  .kapazitaeten-modal-actions {
    flex-direction: column;
  }

  .kapazitaeten-import-result-summary {
    grid-template-columns: 1fr;
  }

  .kapazitaeten-wizard-close,
  .kapazitaeten-import-navigation {
    width: 100%;
  }

  .kapazitaeten-import-navigation {
    justify-content: space-between;
  }

  .kapazitaeten-wizard-submit {
    flex: 1;
  }
}
</style>
