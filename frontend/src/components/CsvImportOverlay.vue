<script setup lang="ts">
import { computed, ref, watch } from "vue";
import importService from "../services/importService";
import CsvImportStepUpload from "./CsvImportStepUpload.vue";
import CsvImportStepPreview from "./CsvImportStepPreview.vue";
import CsvImportStepMapping from "./CsvImportStepMapping.vue";
import CsvImportStepValidation from "./CsvImportStepValidation.vue";
import CsvImportStepConfirm from "./CsvImportStepConfirm.vue";
import CsvImportStepResult from "./CsvImportStepResult.vue";
import { CSV_PREVIEW_ROW_LIMIT, normalizeMappingKey, parseCsvText, readCsvFileText, type ParsedCsvRow } from "../utils/csv";

type SchemaField = {
  key: string;
  label: string;
  description: string;
  required: boolean;
  warning: boolean;
  readOnly?: boolean;
  systemValue?: string;
};

type ValidationRow = {
  row_number: number;
  selected: boolean;
  import_action: string;
  status: "gueltig" | "warnung" | "fehler" | "uebersprungen";
  errors: string[];
  warnings: string[];
  data: Record<string, string | null>;
};

const props = defineProps<{
  open: boolean;
  token?: string;
  verfahrenId: number | null;
  rundeId: number | null;
  title: string;
  importArt: "pool";
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "success", payload: Record<string, unknown>): void;
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const currentStep = ref(1);
const busy = ref(false);
const error = ref("");
const schemaFields = ref<SchemaField[]>([]);
const selectedFile = ref<File | null>(null);
const selectedFileName = ref("");
const csvColumns = ref<string[]>([]);
const csvRows = ref<ParsedCsvRow[]>([]);
const csvPreviewRows = ref<string[][]>([]);
const detectedDelimiter = ref<";" | "," | "\t">(";");
const mapping = ref<Record<string, string>>({});
const validationRows = ref<ValidationRow[]>([]);
const validationSummary = ref<Record<string, number>>({});
const validationToken = ref("");
const importResult = ref<{
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  row_results?: Array<{ row_number: number; action: string; message: string }>;
} | null>(null);

const options = ref({
  delimiter: "auto" as "auto" | ";" | "," | "\t",
  hasHeaders: true,
  charset: "utf-8" as const,
});

const canProceed = computed(() => {
  if (currentStep.value === 1) return csvRows.value.length > 0;
  if (currentStep.value === 2) return csvRows.value.length > 0;
  if (currentStep.value === 3) return hasRequiredMappings.value;
  if (currentStep.value === 4) return selectedImportRows.value.length > 0;
  if (currentStep.value === 5) return true;
  return false;
});

const hasRequiredMappings = computed(() => (
  schemaFields.value
    .filter((field) => field.required && !field.readOnly)
    .every((field) => !!String(mapping.value[field.key] || "").trim())
));

const selectedImportRows = computed(() => (
  validationRows.value.filter((row) => row.selected && row.status !== "fehler")
));

const liveValidationSummary = computed(() => {
  const totalRows = validationRows.value.length;
  const selectedRows = selectedImportRows.value.length;
  const skippedRows = validationRows.value.filter((row) => row.status !== "fehler" && !row.selected).length;
  const errorRows = validationRows.value.filter((row) => row.status === "fehler").length;
  const newRows = selectedImportRows.value.filter((row) => row.import_action === "NEU").length;
  const updateRows = selectedImportRows.value.filter((row) => row.import_action === "UPDATE").length;
  return {
    Gesamtzeilen: totalRows,
    Ausgewaehlt: selectedRows,
    Uebersprungen: skippedRows,
    Fehlerzeilen: errorRows,
    Neue_Datensaetze: newRows,
    Zu_aktualisieren: updateRows,
  };
});

const delimiterLabel = computed(() => {
  if (detectedDelimiter.value === ";") return "Semikolon";
  if (detectedDelimiter.value === ",") return "Komma";
  return "Tab";
});

const showSourceSchoolColumn = computed(() => (
  schemaFields.value.some((field) => field.key === "source_school_snr" && field.required)
));

const stepTitle = computed(() => {
  if (currentStep.value === 1) return "Datei auswaehlen";
  if (currentStep.value === 2) return `Vorschau der Importdatei (erste ${CSV_PREVIEW_ROW_LIMIT} Zeilen)`;
  if (currentStep.value === 3) return "Import-Felder zuordnen";
  if (currentStep.value === 4) return "Zeilen pruefen / auswaehlen";
  if (currentStep.value === 5) return "Import bestaetigen";
  return "Ergebnis anzeigen";
});

watch(() => props.open, async (isOpen) => {
  if (!isOpen) {
    resetState();
    return;
  }
  await loadSchema();
});

watch(() => [options.value.delimiter, options.value.hasHeaders], async () => {
  if (!props.open || !selectedFile.value) return;
  await parseSelectedFile(selectedFile.value);
});

function resetState() {
  currentStep.value = 1;
  busy.value = false;
  error.value = "";
  selectedFile.value = null;
  selectedFileName.value = "";
  csvColumns.value = [];
  csvRows.value = [];
  csvPreviewRows.value = [];
  detectedDelimiter.value = ";";
  mapping.value = {};
  validationRows.value = [];
  validationSummary.value = {};
  validationToken.value = "";
  importResult.value = null;
}

async function loadSchema() {
  if (!props.verfahrenId || !props.rundeId) return;
  try {
    busy.value = true;
    error.value = "";
    const response = await importService.getAnmSchuelerImportSchema({
      verfahren_id: props.verfahrenId,
      runde_id: props.rundeId,
      import_art: props.importArt,
    }, props.token);
    schemaFields.value = Array.isArray(response?.fields) ? response.fields : [];
  } catch (loadError: any) {
    error.value = loadError?.response?.data?.error || loadError?.message || "Das Importschema konnte nicht geladen werden.";
  } finally {
    busy.value = false;
  }
}

function openFilePicker() {
  fileInput.value?.click();
}

async function handlePickedFile(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0] || null;
  if (file) {
    await parseSelectedFile(file);
  }
  if (input) input.value = "";
}

async function parseSelectedFile(file: File | null | undefined) {
  if (!file) return;
  try {
    busy.value = true;
    error.value = "";
    validationRows.value = [];
    validationSummary.value = {};
    validationToken.value = "";
    importResult.value = null;
    selectedFile.value = file;
    selectedFileName.value = file.name;
    const text = await readCsvFileText(file);
    const parsed = parseCsvText(text, options.value);
    csvColumns.value = parsed.columns;
    csvRows.value = parsed.rows;
    csvPreviewRows.value = parsed.previewRows;
    detectedDelimiter.value = parsed.delimiter;
    mapping.value = buildAutoMapping(parsed.columns);
    currentStep.value = 2;
  } catch (parseError: any) {
    error.value = parseError?.message || "Die CSV-Datei konnte nicht gelesen werden.";
    csvColumns.value = [];
    csvRows.value = [];
    csvPreviewRows.value = [];
  } finally {
    busy.value = false;
  }
}

function buildAutoMapping(columns: string[]) {
  const byKey = new Map(columns.map((column) => [normalizeMappingKey(column), column]));
  const aliasByField: Record<string, string[]> = {
    source_school_snr: ["snr", "schulnummer", "schul_nr", "quell_snr"],
    schueler_id: ["schueler_id", "schueler_nr", "id", "import_id"],
    vorname: ["vorname"],
    nachname: ["nachname", "name"],
    geburtsdatum: ["geburtsdatum"],
  };
  const nextMapping: Record<string, string> = {};
  for (const field of schemaFields.value) {
    if (field.readOnly) continue;
    const direct = byKey.get(normalizeMappingKey(field.key));
    const label = byKey.get(normalizeMappingKey(field.label));
    const alias = (aliasByField[field.key] || [])
      .map((candidate) => byKey.get(normalizeMappingKey(candidate)))
      .find(Boolean);
    nextMapping[field.key] = direct || label || alias || "";
  }
  return nextMapping;
}

async function runValidation() {
  if (!props.verfahrenId || !props.rundeId) return;
  try {
    busy.value = true;
    error.value = "";
    const response = await importService.validateAnmSchuelerImport({
      verfahren_id: props.verfahrenId,
      runde_id: props.rundeId,
      import_art: props.importArt,
      csv_columns: csvColumns.value,
      csv_rows: csvRows.value.map((row) => ({
        row_number: row.rowNumber,
        values: row.values,
        record: row.record,
      })),
      mapping: mapping.value,
      options: options.value,
    }, props.token);
    validationRows.value = Array.isArray(response?.rows) ? response.rows : [];
    validationSummary.value = response?.summary || {};
    validationToken.value = String(response?.validation_token || "");
    currentStep.value = 4;
  } catch (validationError: any) {
    error.value = validationError?.response?.data?.error || validationError?.message || "Die Validierung ist fehlgeschlagen.";
  } finally {
    busy.value = false;
  }
}

function toggleAllRows() {
  const shouldSelect = validationRows.value.some((row) => row.status !== "fehler" && !row.selected);
  validationRows.value = validationRows.value.map((row) => ({
    ...row,
    selected: row.status === "fehler" ? false : shouldSelect,
  }));
}

function toggleRow(rowNumber: number, selected: boolean) {
  validationRows.value = validationRows.value.map((row) => (
    row.row_number === rowNumber ? { ...row, selected } : row
  ));
}

async function executeImport() {
  if (!props.verfahrenId || !props.rundeId || !validationToken.value) return;
  try {
    busy.value = true;
    error.value = "";
    const response = await importService.executeAnmSchuelerImport({
      verfahren_id: props.verfahrenId,
      runde_id: props.rundeId,
      import_art: props.importArt,
      validation_token: validationToken.value,
      selected_row_numbers: selectedImportRows.value.map((row) => row.row_number),
    }, props.token);
    importResult.value = response;
    currentStep.value = 6;
    emit("success", response || {});
  } catch (executeError: any) {
    error.value = executeError?.response?.data?.error || executeError?.message || "Der Import ist fehlgeschlagen.";
  } finally {
    busy.value = false;
  }
}

async function handleNext() {
  if (currentStep.value === 3) {
    await runValidation();
    return;
  }
  if (currentStep.value === 5) {
    await executeImport();
    return;
  }
  currentStep.value += 1;
}

function handleBack() {
  if (currentStep.value <= 1) return;
  currentStep.value -= 1;
}

function handleClose() {
  if (busy.value) return;
  emit("close");
}
</script>

<template>
  <div v-if="open" class="csv-import-overlay" @click.self="handleClose">
    <section class="csv-import-dialog" role="dialog" aria-modal="true" aria-labelledby="csv-import-title">
      <div class="csv-import-head">
        <div>
          <p class="csv-import-eyebrow">CSV-Import Wizard</p>
          <h3 id="csv-import-title">{{ title }}</h3>
          <p>Schritt {{ currentStep }} von 6 | {{ stepTitle }}</p>
        </div>
        <button class="wizard-header-close-button" type="button" :disabled="busy" @click="handleClose">
          Schliessen
        </button>
      </div>

      <div v-if="error" class="feedback-panel feedback-panel-error">
        <p class="feedback-title">Fehler</p>
        <p>{{ error }}</p>
      </div>

      <div class="csv-import-content">
        <input
          ref="fileInput"
          type="file"
          accept=".csv,text/csv"
          class="hidden-input"
          @change="handlePickedFile"
        />

        <CsvImportStepUpload
          v-if="currentStep === 1"
          :file-name="selectedFileName"
          :options="options"
          :drag-active="false"
          :busy="busy"
          @pick="openFilePicker"
          @drop="parseSelectedFile"
          @update:delimiter="options.delimiter = $event"
          @update:hasHeaders="options.hasHeaders = $event"
        />

        <CsvImportStepPreview
          v-else-if="currentStep === 2"
          :columns="csvColumns"
          :preview-rows="csvPreviewRows"
          :row-count="csvRows.length"
          :delimiter-label="delimiterLabel"
        />

        <CsvImportStepMapping
          v-else-if="currentStep === 3"
          :fields="schemaFields"
          :columns="csvColumns"
          :mapping="mapping"
          @change="mapping[$event.key] = $event.value"
        />

        <CsvImportStepValidation
          v-else-if="currentStep === 4"
          :rows="validationRows"
          :busy="busy"
          :show-source-school-column="showSourceSchoolColumn"
          @toggle-all="toggleAllRows"
          @toggle-row="toggleRow"
        />

        <CsvImportStepConfirm
          v-else-if="currentStep === 5"
          :summary="liveValidationSummary"
        />

        <CsvImportStepResult
          v-else
          :result="importResult"
        />
      </div>

      <div class="csv-import-footer">
        <button class="wizard-close-button" type="button" :disabled="busy" @click="handleClose">
          {{ currentStep === 6 ? "Schliessen" : "Abbrechen" }}
        </button>
        <div class="csv-import-nav">
          <button
            class="wizard-nav-icon-button"
            type="button"
            :disabled="busy || currentStep === 1 || currentStep === 6"
            aria-label="Vorheriger Schritt"
            title="Vorheriger Schritt"
            @click="handleBack"
          >
            <span class="wizard-nav-chevron wizard-nav-chevron-left" aria-hidden="true"></span>
          </button>
          <button
            v-if="currentStep < 6"
            :class="currentStep === 5 ? 'wizard-submit-button' : 'wizard-nav-icon-button wizard-nav-icon-button-primary'"
            type="button"
            :disabled="busy || !canProceed"
            :aria-label="currentStep === 5 ? 'Import starten' : 'Naechster Schritt'"
            :title="currentStep === 5 ? 'Import starten' : 'Naechster Schritt'"
            @click="handleNext"
          >
            <template v-if="currentStep === 5">Import starten</template>
            <template v-else><span class="wizard-nav-chevron wizard-nav-chevron-right" aria-hidden="true"></span></template>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.csv-import-overlay {
  position: fixed;
  inset: 0;
  z-index: 1600;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(4px);
}

.csv-import-dialog {
  width: min(1400px, 90vw);
  height: min(90vh, 960px);
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 16px;
  padding: 24px;
  border-radius: 28px;
  background: linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
}

.csv-import-head,
.csv-import-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.csv-import-eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: 700;
  color: #6680a3;
}

.csv-import-head h3 {
  margin: 0 0 6px;
  color: #19365b;
}

.csv-import-head p:last-child {
  margin: 0;
  color: #526985;
}

.csv-import-content {
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.csv-import-nav {
  display: flex;
  gap: 12px;
  align-items: center;
}

.wizard-header-close-button {
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

.wizard-header-close-button:hover:not(:disabled) {
  border-color: #9bb3cf;
  background: linear-gradient(180deg, #fdfefe 0%, #edf4fb 100%);
}

.wizard-close-button {
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

.wizard-close-button:hover:not(:disabled) {
  border-color: #9bb3cf;
  background: #f8fbff;
}

.wizard-nav-icon-button {
  width: 44px;
  height: 44px;
  border: 1px solid #cdd8e6;
  border-radius: 14px;
  background: #ffffff;
  color: #355172;
  font-size: 26px;
  line-height: 1;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.wizard-nav-chevron {
  width: 10px;
  height: 10px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transition: transform 0.2s ease;
}

.wizard-nav-chevron-left {
  transform: rotate(135deg);
  margin-left: 4px;
}

.wizard-nav-chevron-right {
  transform: rotate(-45deg);
  margin-right: 4px;
}

.wizard-nav-icon-button:hover:not(:disabled) {
  border-color: #9bb3cf;
  background: #f8fbff;
}

.wizard-nav-icon-button-primary {
  border-color: #163b67;
  background: linear-gradient(180deg, #214f86 0%, #163b67 100%);
  color: #ffffff;
  box-shadow: 0 10px 24px rgba(22, 59, 103, 0.22);
}

.wizard-nav-icon-button-primary:hover:not(:disabled) {
  border-color: #102a49;
  background: linear-gradient(180deg, #1d4677 0%, #102a49 100%);
}

.wizard-submit-button {
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

.wizard-submit-button:hover:not(:disabled) {
  border-color: #102a49;
  background: linear-gradient(180deg, #1d4677 0%, #102a49 100%);
}

.wizard-close-button:disabled,
.wizard-header-close-button:disabled,
.wizard-nav-icon-button:disabled,
.wizard-submit-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.hidden-input {
  display: none;
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

.feedback-title {
  margin: 0 0 4px;
  font-weight: 700;
}

@media (max-width: 760px) {
  .csv-import-overlay {
    padding: 12px;
  }

  .csv-import-dialog {
    width: 100%;
    height: 100%;
    border-radius: 18px;
    padding: 18px;
  }

  .csv-import-head,
  .csv-import-footer {
    flex-direction: column;
  }

  .csv-import-nav {
    width: 100%;
    justify-content: space-between;
  }

  .wizard-close-button {
    width: 100%;
  }

  .wizard-submit-button {
    flex: 1;
  }
}
</style>
