<script setup lang="ts">
import { computed, ref, watch } from "vue";
import importService from "../services/importService";
import { parseCsvText, readCsvFileText, normalizeMappingKey, type ParsedCsvRow } from "../utils/csv";
import AnmeldungenImportStepContext from "./AnmeldungenImportStepContext.vue";
import AnmeldungenImportStepUpload from "./AnmeldungenImportStepUpload.vue";
import AnmeldungenImportStepPreview from "./AnmeldungenImportStepPreview.vue";
import AnmeldungenImportStepMapping from "./AnmeldungenImportStepMapping.vue";
import AnmeldungenImportStepStatusMapping from "./AnmeldungenImportStepStatusMapping.vue";
import AnmeldungenImportStepValidation from "./AnmeldungenImportStepValidation.vue";
import AnmeldungenImportStepConfirm from "./AnmeldungenImportStepConfirm.vue";
import AnmeldungenImportStepResult from "./AnmeldungenImportStepResult.vue";

type SchemaField = { key: string; label: string; description: string; required: boolean; readOnly?: boolean; systemValue?: string };
type School = { snr: string; name: string };

const props = defineProps<{ open: boolean; token?: string; verfahrenId: number | null; rundeId: number | null; schools: School[] }>();
const emit = defineEmits<{ (event: "close"): void; (event: "success", payload: Record<string, unknown>): void; }>();

const fileInput = ref<HTMLInputElement | null>(null);
const currentStep = ref(1);
const busy = ref(false);
const error = ref("");
const globalSchulNr = ref("");
const selectedFileName = ref("");
const schemaFields = ref<SchemaField[]>([]);
const targetStatusValues = ref<string[]>([]);
const csvColumns = ref<string[]>([]);
const csvRows = ref<ParsedCsvRow[]>([]);
const csvPreviewRows = ref<string[][]>([]);
const mapping = ref<Record<string, string>>({});
const statusMapping = ref<Record<string, string>>({});
const validationRows = ref<any[]>([]);
const validationToken = ref("");
const importResult = ref<any | null>(null);
const options = ref({ delimiter: "auto" as "auto" | ";" | "," | "\t", hasHeaders: true });

const uniqueStatusValues = computed(() => {
  const sourceColumn = mapping.value.anmeldestatus;
  if (!sourceColumn) return [];
  return Array.from(new Set(csvRows.value.map((row) => String(row.record?.[sourceColumn] || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "de"));
});
const selectedImportRows = computed(() => validationRows.value.filter((row) => row.selected && row.status !== "fehler"));
const liveSummary = computed(() => ({
  Gesamtzeilen: validationRows.value.length,
  Ausgewaehlt: selectedImportRows.value.length,
  Uebersprungen: validationRows.value.filter((row) => row.status !== "fehler" && !row.selected).length,
  Fehlerzeilen: validationRows.value.filter((row) => row.status === "fehler").length,
  Neue_Datensaetze: selectedImportRows.value.filter((row) => row.import_action === "NEU").length,
  Updates: selectedImportRows.value.filter((row) => row.import_action === "UPDATE").length,
  Pool_Treffer: selectedImportRows.value.filter((row) => row.pool_match).length,
  Nur_Anmeldung_Faelle: selectedImportRows.value.filter((row) => !row.pool_match).length,
}));
const stepTitle = computed(() => ["Importkontext", "CSV-Datei hochladen", "CSV-Vorschau (erste 15 Zeilen)", "Felder zuordnen", "Statuswerte zuordnen", "Validieren und auswählen", "Import bestätigen", "Ergebnis anzeigen"][currentStep.value - 1] || "");
const canProceed = computed(() => {
  if (currentStep.value === 1) return true;
  if (currentStep.value === 2) return csvRows.value.length > 0;
  if (currentStep.value === 3) return csvRows.value.length > 0;
  if (currentStep.value === 4) return Boolean(mapping.value.schueler_id && mapping.value.anmeldestatus && (mapping.value.schul_nr || globalSchulNr.value));
  if (currentStep.value === 5) return uniqueStatusValues.value.every((status) => String(statusMapping.value[status] || "").trim());
  if (currentStep.value === 6) return selectedImportRows.value.length > 0;
  return true;
});

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return resetState();
  await loadSchema();
});

function resetState() {
  currentStep.value = 1; busy.value = false; error.value = ""; globalSchulNr.value = ""; selectedFileName.value = ""; csvColumns.value = []; csvRows.value = []; csvPreviewRows.value = []; mapping.value = {}; statusMapping.value = {}; validationRows.value = []; validationToken.value = ""; importResult.value = null;
}
async function loadSchema() {
  if (!props.verfahrenId || !props.rundeId) return;
  busy.value = true; error.value = "";
  try {
    const response = await importService.getAnmSchuelerAnmeldungenSchema({ verfahren_id: props.verfahrenId, runde_id: props.rundeId }, props.token);
    schemaFields.value = Array.isArray(response?.fields) ? response.fields : [];
    targetStatusValues.value = Array.isArray(response?.status_target_values) ? response.status_target_values : [];
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || "Schema konnte nicht geladen werden.";
  } finally { busy.value = false; }
}
function openFilePicker() { fileInput.value?.click(); }
async function handlePickedFile(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0] || null;
  if (!file) return;
  busy.value = true; error.value = "";
  try {
    selectedFileName.value = file.name;
    const text = await readCsvFileText(file);
    const parsed = parseCsvText(text, options.value);
    csvColumns.value = parsed.columns;
    csvRows.value = parsed.rows;
    csvPreviewRows.value = parsed.previewRows;
    mapping.value = buildAutoMapping(parsed.columns);
    currentStep.value = 3;
  } catch (e: any) {
    error.value = e?.message || "CSV-Datei konnte nicht gelesen werden.";
  } finally {
    busy.value = false;
    if (input) input.value = "";
  }
}
function buildAutoMapping(columns: string[]) {
  const byKey = new Map(columns.map((column) => [normalizeMappingKey(column), column]));
  const aliases: Record<string, string[]> = {
    schueler_id: ["schueler_id", "schueler_schul_id", "id"],
    schul_nr: ["schul_nr", "snr", "schulnummer"],
    anmeldestatus: ["anmeldestatus", "status", "anmeldestatus_code"],
    vorname: ["vorname"],
    nachname: ["nachname", "name"],
    geburtsdatum: ["geburtsdatum"],
  };
  const next: Record<string, string> = {};
  for (const field of schemaFields.value) {
    if (field.readOnly) continue;
    next[field.key] = (aliases[field.key] || []).map((entry) => byKey.get(normalizeMappingKey(entry))).find(Boolean) || "";
  }
  return next;
}
function toggleAllRows() {
  const shouldSelect = validationRows.value.some((row) => row.status !== "fehler" && !row.selected);
  validationRows.value = validationRows.value.map((row) => ({ ...row, selected: row.status === "fehler" ? false : shouldSelect }));
}
function toggleRow(rowNumber: number, selected: boolean) { validationRows.value = validationRows.value.map((row) => row.row_number === rowNumber ? { ...row, selected } : row); }
async function runValidation() {
  if (!props.verfahrenId || !props.rundeId) return;
  busy.value = true; error.value = "";
  try {
    const response = await importService.validateAnmSchuelerAnmeldungen({
      verfahren_id: props.verfahrenId,
      runde_id: props.rundeId,
      global_schul_nr: globalSchulNr.value,
      csv_columns: csvColumns.value,
      csv_rows: csvRows.value.map((row) => ({ row_number: row.rowNumber, values: row.values, record: row.record })),
      mapping: mapping.value,
      status_mapping: statusMapping.value,
    }, props.token);
    validationRows.value = Array.isArray(response?.rows) ? response.rows : [];
    validationToken.value = String(response?.validation_token || "");
    currentStep.value = 6;
  } catch (e: any) { error.value = e?.response?.data?.error || e?.message || "Validierung fehlgeschlagen."; }
  finally { busy.value = false; }
}
async function executeImport() {
  if (!props.verfahrenId || !props.rundeId) return;
  busy.value = true; error.value = "";
  try {
    const response = await importService.executeAnmSchuelerAnmeldungen({
      verfahren_id: props.verfahrenId,
      runde_id: props.rundeId,
      validation_token: validationToken.value,
      selected_row_numbers: selectedImportRows.value.map((row) => row.row_number),
    }, props.token);
    importResult.value = response;
    currentStep.value = 8;
    emit("success", response || {});
  } catch (e: any) { error.value = e?.response?.data?.error || e?.message || "Import fehlgeschlagen."; }
  finally { busy.value = false; }
}
async function handleNext() {
  if (currentStep.value === 4) { currentStep.value = 5; return; }
  if (currentStep.value === 5) { await runValidation(); return; }
  if (currentStep.value === 7) { await executeImport(); return; }
  currentStep.value += 1;
}
function handleBack() { if (currentStep.value > 1) currentStep.value -= 1; }
</script>
<template>
  <div v-if="open" class="csv-import-overlay" @click.self="$emit('close')">
    <section class="csv-import-dialog" role="dialog" aria-modal="true">
      <div class="csv-import-head"><div><p class="csv-import-eyebrow">CSV-Import Wizard</p><h3>Anmeldungen importieren (CSV)</h3><p>Schritt {{ currentStep }} von 8 | {{ stepTitle }}</p></div><button class="wizard-header-close-button" type="button" :disabled="busy" @click="$emit('close')">Schliessen</button></div>
      <div v-if="error" class="feedback-panel feedback-panel-error"><p class="feedback-title">Fehler</p><p>{{ error }}</p></div>
      <div class="csv-import-content">
        <input ref="fileInput" type="file" accept=".csv,text/csv" class="hidden-input" @change="handlePickedFile" />
        <AnmeldungenImportStepContext v-if="currentStep === 1" :verfahren-id="verfahrenId" :runde-id="rundeId" :global-schul-nr="globalSchulNr" :schools="schools" @update:globalSchulNr="globalSchulNr = $event" />
        <AnmeldungenImportStepUpload v-else-if="currentStep === 2" :file-name="selectedFileName" :busy="busy" :options="options" @pick="openFilePicker" @update:delimiter="options.delimiter = $event" @update:hasHeaders="options.hasHeaders = $event" />
        <AnmeldungenImportStepPreview v-else-if="currentStep === 3" :columns="csvColumns" :preview-rows="csvPreviewRows" :row-count="csvRows.length" />
        <AnmeldungenImportStepMapping v-else-if="currentStep === 4" :fields="schemaFields" :columns="csvColumns" :mapping="mapping" :global-schul-nr="globalSchulNr" @change="mapping[$event.key] = $event.value" />
        <AnmeldungenImportStepStatusMapping v-else-if="currentStep === 5" :status-values="uniqueStatusValues" :target-values="targetStatusValues" :status-mapping="statusMapping" @change="statusMapping[$event.raw] = $event.value" />
        <AnmeldungenImportStepValidation v-else-if="currentStep === 6" :rows="validationRows" :busy="busy" @toggle-all="toggleAllRows" @toggle-row="toggleRow" />
        <AnmeldungenImportStepConfirm v-else-if="currentStep === 7" :summary="liveSummary" />
        <AnmeldungenImportStepResult v-else :result="importResult" />
      </div>
      <div class="csv-import-footer">
        <button class="wizard-close-button" type="button" :disabled="busy" @click="$emit('close')">{{ currentStep === 8 ? "Schliessen" : "Abbrechen" }}</button>
        <div class="csv-import-nav">
          <button class="wizard-nav-icon-button" type="button" :disabled="busy || currentStep === 1 || currentStep === 8" @click="handleBack"><span class="wizard-nav-chevron wizard-nav-chevron-left" aria-hidden="true"></span></button>
          <button v-if="currentStep < 8" :class="currentStep === 7 ? 'wizard-submit-button' : 'wizard-nav-icon-button wizard-nav-icon-button-primary'" type="button" :disabled="busy || !canProceed" @click="handleNext"><template v-if="currentStep === 7">Import starten</template><template v-else><span class="wizard-nav-chevron wizard-nav-chevron-right" aria-hidden="true"></span></template></button>
        </div>
      </div>
    </section>
  </div>
</template>
<style scoped>
.csv-import-overlay{position:fixed;inset:0;z-index:1600;display:grid;place-items:center;padding:24px;background:rgba(15,23,42,.42);backdrop-filter:blur(4px)}.csv-import-dialog{width:min(1400px,90vw);height:min(90vh,960px);display:grid;grid-template-rows:auto auto 1fr auto;gap:16px;padding:24px;border-radius:28px;background:linear-gradient(180deg,#fbfdff 0%,#fff 100%);box-shadow:0 24px 60px rgba(15,23,42,.28)}.csv-import-head,.csv-import-footer{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.csv-import-eyebrow{margin:0 0 8px;text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:700;color:#6680a3}.csv-import-head h3{margin:0 0 6px;color:#19365b}.csv-import-head p:last-child{margin:0;color:#526985}.csv-import-content{min-height:0;overflow:auto;padding-right:4px}.csv-import-nav{display:flex;gap:12px;align-items:center}.wizard-header-close-button{min-height:42px;padding:0 16px;border:1px solid #cdd8e6;border-radius:999px;background:linear-gradient(180deg,#fff 0%,#f4f8fc 100%);color:#355172;font-weight:700;cursor:pointer}.wizard-close-button{min-height:44px;padding:0 18px;border:1px solid #cdd8e6;border-radius:999px;background:#fff;color:#355172;font-weight:700;cursor:pointer}.wizard-nav-icon-button{width:44px;height:44px;border:1px solid #cdd8e6;border-radius:14px;background:#fff;color:#355172;font-size:26px;line-height:1;font-weight:700;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.wizard-nav-chevron{width:10px;height:10px;border-right:2px solid currentColor;border-bottom:2px solid currentColor}.wizard-nav-chevron-left{transform:rotate(135deg);margin-left:4px}.wizard-nav-chevron-right{transform:rotate(-45deg);margin-right:4px}.wizard-nav-icon-button-primary,.wizard-submit-button{border-color:#163b67;background:linear-gradient(180deg,#214f86 0%,#163b67 100%);color:#fff;box-shadow:0 10px 24px rgba(22,59,103,.22)}.wizard-submit-button{min-height:44px;padding:0 18px;border-radius:999px;font-weight:700;cursor:pointer}.hidden-input{display:none}.feedback-panel{padding:12px 14px;border-radius:14px;font-size:14px}.feedback-panel-error{border:1px solid #fca5a5;background:#fff5f5;color:#991b1b}.feedback-title{margin:0 0 4px;font-weight:700}
</style>
