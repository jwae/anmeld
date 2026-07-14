<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import importService from "../services/importService";
import CsvImportOverlay from "./CsvImportOverlay.vue";
import type { Anmeldeverfahrenstyp } from "../types";

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
  ef: string;
  herkunftsschule_snr: string;
  herkunftsschueler_nr?: string;
  herkunft?: string;
  abgleich_status: string;
  anmeldestatus: string;
  teilnahmestatus?: string;
  schulnummer: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  bemerkung?: string;
  schule: string;
};

type PoolSortKey =
  | "schueler_schul_id"
  | "nachname"
  | "vorname"
  | "von"
  | "geburtsdatum"
  | "foerderbedarf"
  | "zieldifferent"
  | "ef"
  | "herkunftsschule_snr"
  | "herkunft"
  | "abgleich_status"
  | "anmeldestatus"
  | "schulnummer"
  | "schule";

const props = defineProps<{
  token?: string;
  verfahrenId: number | null;
  rundeId: number | null;
  verfahrenstyp?: Anmeldeverfahrenstyp | null;
  title?: string;
}>();

const loading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const summary = ref<any | null>(null);
const isExpanded = ref(false);
const showCsvImportOverlay = ref(false);
const showSchildImportOverlay = ref(false);
const showEditPoolOverlay = ref(false);
const showDeletePoolOverlay = ref(false);
const savingEditPool = ref(false);
const deletingPoolRow = ref(false);
const editPoolForm = ref<Record<string, string | number | null>>({});
const pendingDeletePoolRow = ref<PoolSchuelerRow | null>(null);
const showDuplicateConflictsOverlay = ref(false);
const duplicateConflicts = ref<Array<{
  schueler_id: string;
  nachname: string;
  vorname: string;
  anmeldeschule_snr: string;
  schulname: string;
}>>([]);
const showSchildDiagnosticsOverlay = ref(false);
const schildDiagnostics = ref<Array<{
  snr: string;
  message: string;
  imported_students: number;
  updated_students: number;
  skipped_rows: number;
  error_rows: number;
  rows_read: number;
  diagnostics?: {
    school_name?: string;
    school_snr?: string;
    host?: string;
    db_name?: string;
    connection_established?: boolean;
    current_section_label?: string;
    current_section_id?: number;
    selection_count?: number;
    status_2_count?: number;
    grade_4_count?: number;
    eligible_count?: number;
  };
}>>([]);
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

const isSek1Procedure = computed(() => props.verfahrenstyp === "SEK1");

const herkunftOptions = ["Pool", "Anmeldung", "Manuell"];
const abgleichStatusOptions = ["Nur Pool", "Nur Anmeldung", "Pool + Anm"];
const anmeldestatusEditOptions = ["Neuaufnahme", "Warteliste", "Zugeordnet", "Abgelehnt", "Ohne"];
const teilnahmestatusOptions = ["Aktiv", "Wegzug", "Abgemeldet", "Verstorben"];

const currentSchoolYearSectionLabel = computed(() => {
  const currentDate = new Date();
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  if (month >= 2 && month <= 7) return `${year - 1}.02`;
  if (month === 1) return `${year - 1}.01`;
  return `${year}.01`;
});

const currentSchoolYearLabel = computed(() => (
  currentSchoolYearSectionLabel.value.split(".")[0] || "-"
));

const currentSectionNo = computed(() => (
  currentSchoolYearSectionLabel.value.split(".")[1] || "-"
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
    const schoolId = normalizeText(row.schueler_schul_id).toLowerCase();
    const sourceSchoolNo = normalizeText(row.herkunftsschule_snr).toLowerCase();
    const schoolName = normalizeText(row.schule).toLowerCase();
    if (
      searchText
      && !fullName.includes(searchText)
      && !schoolId.includes(searchText)
      && !sourceSchoolNo.includes(searchText)
      && !schoolName.includes(searchText)
    ) return false;
    if (poolStatusFilter.value !== "alle" && normalizeText(row.anmeldestatus) !== poolStatusFilter.value) return false;
    if (poolFoerderbedarfFilter.value === "ja" && !isPositiveFlag(row.foerderbedarf)) return false;
    if (poolFoerderbedarfFilter.value === "nein" && isPositiveFlag(row.foerderbedarf)) return false;
    if (poolZieldifferentFilter.value === "ja" && !isPositiveFlag(row.zieldifferent)) return false;
    if (poolZieldifferentFilter.value === "nein" && isPositiveFlag(row.zieldifferent)) return false;
    return true;
  });
});

const poolMetricCards = computed(() => {
  const rows = filteredPoolSchuelerRows.value;
  return [
    { label: "Kinder im Pool", value: rows.length },
    { label: "LE", value: rows.filter((row) => isPositiveFlag(row.foerderbedarf)).length },
    { label: "ZD", value: rows.filter((row) => isPositiveFlag(row.zieldifferent)).length },
    { label: "EF", value: rows.filter((row) => isPositiveFlag(row.ef)).length },
  ];
});

const duplicatePoolChildKeys = computed(() => {
  const counts = new Map<string, number>();
  for (const row of filteredPoolSchuelerRows.value) {
    const key = buildDuplicatePoolChildKey(row);
    if (!key) continue;
    counts.set(key, Number(counts.get(key) || 0) + 1);
  }
  return counts;
});

const duplicatePoolStudentIds = computed(() => {
  const counts = new Map<string, number>();
  for (const row of filteredPoolSchuelerRows.value) {
    const id = normalizeText(row.schueler_id);
    if (!id) continue;
    counts.set(id, Number(counts.get(id) || 0) + 1);
  }
  return counts;
});

const hasOpenOverlay = computed(() => (
  showCsvImportOverlay.value
  || showSchildImportOverlay.value
  || showEditPoolOverlay.value
  || showDeletePoolOverlay.value
  || showDuplicateConflictsOverlay.value
  || showSchildDiagnosticsOverlay.value
));

const sortedPoolSchuelerRows = computed(() => {
  const factor = poolSortDirection.value === "asc" ? 1 : -1;
  return [...filteredPoolSchuelerRows.value].sort((left, right) => {
    const resolveValue = (row: PoolSchuelerRow) => {
      switch (poolSortKey.value) {
        case "foerderbedarf":
          return isPositiveFlag(row.foerderbedarf) ? "1" : "0";
        case "zieldifferent":
          return isPositiveFlag(row.zieldifferent) ? "1" : "0";
        case "ef":
          return isPositiveFlag(row.ef) ? "1" : "0";
        case "herkunft":
          return displayHerkunft(row);
        case "von":
          return sourceDisplayTitle(row);
        default:
          return normalizeText(row[poolSortKey.value] as string | number | null | undefined);
      }
    };
    const a = resolveValue(left);
    const b = resolveValue(right);
    return a.localeCompare(b, "de", { numeric: true, sensitivity: "base" }) * factor;
  });
});

function resetPreview() {
  showCsvImportOverlay.value = false;
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

function normalizeDateKey(value: string | null | undefined) {
  const text = normalizeText(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
    const [day, month, year] = text.split(".");
    return `${year}-${month}-${day}`;
  }
  return text.toLowerCase();
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

function buildDuplicatePoolChildKey(row: PoolSchuelerRow) {
  const nachname = normalizeText(row.nachname).toLowerCase();
  const vorname = normalizeText(row.vorname).toLowerCase();
  const geburtsdatum = normalizeDateKey(row.geburtsdatum);
  if (!nachname || !vorname || !geburtsdatum) return "";
  return `${nachname}::${vorname}::${geburtsdatum}`;
}

function isDuplicatePoolChild(row: PoolSchuelerRow) {
  const key = buildDuplicatePoolChildKey(row);
  const hasDuplicateIdentity = key
    ? Number(duplicatePoolChildKeys.value.get(key) || 0) > 1
    : false;
  const studentId = normalizeText(row.schueler_id);
  const hasDuplicateStudentId = studentId
    ? Number(duplicatePoolStudentIds.value.get(studentId) || 0) > 1
    : false;
  return hasDuplicateIdentity || hasDuplicateStudentId;
}

function isPositiveFlag(value: unknown) {
  return normalizeText(value) === "1";
}

function foerderbedarfHoverText(row: PoolSchuelerRow) {
  return normalizeText(row.foerder_label) || normalizeText(row.foerder_id) || "-";
}

function sourceDisplayText(row: PoolSchuelerRow, maxSchoolLength = 15) {
  const sourceNo = normalizeText(row.herkunftsschule_snr);
  const schoolName = normalizeText(row.schule);
  if (sourceNo && schoolName) return `${sourceNo} / ${truncateText(schoolName, maxSchoolLength)}`;
  return sourceNo || truncateText(schoolName, maxSchoolLength) || "-";
}

function sourceDisplayTitle(row: PoolSchuelerRow) {
  const sourceNo = normalizeText(row.herkunftsschule_snr);
  const schoolName = normalizeText(row.schule);
  if (sourceNo && schoolName) return `${sourceNo} / ${schoolName}`;
  return sourceNo || schoolName || "-";
}

function formatDiagnosticBoolean(value: unknown) {
  return value ? "Ja" : "Nein";
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

function openCsvImportOverlay() {
  if (!props.verfahrenId || !props.rundeId || loading.value) return;
  errorMessage.value = "";
  successMessage.value = "";
  showCsvImportOverlay.value = true;
}

async function handleCsvImportSuccess(result: any) {
  summary.value = {
    rows_read: Number(result?.inserted || 0) + Number(result?.updated || 0) + Number(result?.skipped || 0),
    imported_students: Number(result?.inserted || 0),
    updated_students: Number(result?.updated || 0),
    created_open_cases: 0,
    skipped_rows: Number(result?.skipped || 0),
    error_rows: Number(result?.errors || 0),
  };
  successMessage.value = "Schuelerpool-Import erfolgreich abgeschlossen.";
  await loadPoolSchueler();
  await loadPoolStats();
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
    schildDiagnostics.value = Array.isArray(response?.schools) ? response.schools : [];
    duplicateConflicts.value = Array.isArray(response?.duplicate_id_conflicts)
      ? response.duplicate_id_conflicts
      : Array.isArray(response?.total_summary?.duplicate_id_conflicts)
        ? response.total_summary.duplicate_id_conflicts
        : [];
    showSchildDiagnosticsOverlay.value = schildDiagnostics.value.length > 0;
    showDuplicateConflictsOverlay.value = duplicateConflicts.value.length > 0;
    if (duplicateConflicts.value.length > 0) {
      errorMessage.value = `${duplicateConflicts.value.length} doppelte schueler_id${duplicateConflicts.value.length === 1 ? "" : "s"} wurden uebersprungen. Details im Hinweisfenster.`;
    }
    successMessage.value = "Pooldaten aus Schild wurden importiert.";
    await loadPoolSchueler();
    await loadPoolStats();
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Der Schild-Poolimport ist fehlgeschlagen.";
  } finally {
    loading.value = false;
  }
}

function openSchildImportOverlay() {
  if (!props.verfahrenId || !props.rundeId || loading.value) return;
  showSchildImportOverlay.value = true;
}

function closeSchildImportOverlay() {
  if (loading.value) return;
  showSchildImportOverlay.value = false;
}

function closeDuplicateConflictsOverlay() {
  showDuplicateConflictsOverlay.value = false;
}

function closeSchildDiagnosticsOverlay() {
  showSchildDiagnosticsOverlay.value = false;
}

function handleEditPoolRow(row: PoolSchuelerRow) {
  errorMessage.value = "";
  successMessage.value = "";
  applyEditPoolRow(row);
  showEditPoolOverlay.value = true;
}

function applyEditPoolRow(row: PoolSchuelerRow) {
  editPoolForm.value = {
    id: row.schueler_id,
    schueler_id: row.schueler_schul_id,
    herkunftsschueler_nr: row.herkunftsschueler_nr || row.schueler_schul_id,
    vorname: row.vorname || "",
    nachname: row.nachname || "",
    geburtsdatum: row.geburtsdatum || "",
    foerderbedarf: isPositiveFlag(row.foerderbedarf) ? "1" : "0",
    zieldifferent: isPositiveFlag(row.zieldifferent) ? "1" : "0",
    ef: isPositiveFlag(row.ef) ? "1" : "0",
    herkunftsschule_snr: row.herkunftsschule_snr || "",
    anmeldeschule_snr: row.schulnummer || "",
    herkunft: row.herkunft || "",
    abgleich_status: row.abgleich_status || "",
    anmeldestatus: row.anmeldestatus || "",
    teilnahmestatus: row.teilnahmestatus || "Aktiv",
    strasse: row.strasse || "",
    plz: row.plz || "",
    ort: row.ort || "",
    bemerkung: row.bemerkung || "",
    schule: row.schule || "",
  };
}

function currentEditPoolIndex() {
  const currentId = Number(editPoolForm.value.id || 0);
  if (!currentId) return -1;
  return sortedPoolSchuelerRows.value.findIndex((row) => Number(row.schueler_id) === currentId);
}

const canEditPreviousPoolRow = computed(() => currentEditPoolIndex() > 0);
const canEditNextPoolRow = computed(() => {
  const index = currentEditPoolIndex();
  return index >= 0 && index < sortedPoolSchuelerRows.value.length - 1;
});

function openAdjacentPoolRow(direction: -1 | 1) {
  const currentIndex = currentEditPoolIndex();
  if (currentIndex < 0) return;
  const nextRow = sortedPoolSchuelerRows.value[currentIndex + direction];
  if (!nextRow) return;
  applyEditPoolRow(nextRow);
}

function handleDeletePoolRow(row: PoolSchuelerRow) {
  pendingDeletePoolRow.value = row;
  showDeletePoolOverlay.value = true;
}

function closeDeletePoolOverlay() {
  if (deletingPoolRow.value) return;
  showDeletePoolOverlay.value = false;
  pendingDeletePoolRow.value = null;
}

function hideDeletePoolOverlay() {
  showDeletePoolOverlay.value = false;
  pendingDeletePoolRow.value = null;
}

async function confirmDeletePoolRow() {
  const row = pendingDeletePoolRow.value;
  if (!row) return;
  const rowId = Number(row.schueler_id || 0);
  if (!rowId) {
    errorMessage.value = "Der Datensatz konnte nicht geloescht werden: ID fehlt.";
    return;
  }

  try {
    deletingPoolRow.value = true;
    loading.value = true;
    errorMessage.value = "";
    successMessage.value = "";
    await importService.deletePoolSchueler(rowId, props.token);
    if (showEditPoolOverlay.value && Number(editPoolForm.value.id || 0) === rowId) {
      showEditPoolOverlay.value = false;
    }
    hideDeletePoolOverlay();
    successMessage.value = "Datensatz wurde geloescht.";
    await loadPoolSchueler();
    await loadPoolStats();
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Der Datensatz konnte nicht geloescht werden.";
  } finally {
    deletingPoolRow.value = false;
    loading.value = false;
  }
}

function closeEditPoolOverlay() {
  if (savingEditPool.value) return;
  showEditPoolOverlay.value = false;
}

async function saveEditPoolRow() {
  const rowId = Number(editPoolForm.value.id || 0);
  if (!rowId) {
    errorMessage.value = "Der Datensatz konnte nicht gespeichert werden: ID fehlt.";
    return;
  }
  try {
    savingEditPool.value = true;
    errorMessage.value = "";
    successMessage.value = "";
    await importService.updatePoolSchueler(rowId, editPoolForm.value, props.token);
    showEditPoolOverlay.value = false;
    successMessage.value = "Datensatz wurde gespeichert.";
    await loadPoolSchueler();
    await loadPoolStats();
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Der Datensatz konnte nicht gespeichert werden.";
  } finally {
    savingEditPool.value = false;
  }
}

async function confirmSchildImport() {
  showSchildImportOverlay.value = false;
  await importJg4ausSchild();
}

watch(() => [props.verfahrenId, props.rundeId], () => {
  resetPreview();
  summary.value = null;
  successMessage.value = "";
  errorMessage.value = "";
  showSchildImportOverlay.value = false;
  showEditPoolOverlay.value = false;
  showDeletePoolOverlay.value = false;
  pendingDeletePoolRow.value = null;
  showDuplicateConflictsOverlay.value = false;
  duplicateConflicts.value = [];
  showSchildDiagnosticsOverlay.value = false;
  schildDiagnostics.value = [];
  loadPoolStats();
  loadPoolSchueler();
}, { immediate: true });

watch(hasOpenOverlay, (isOpen) => {
  if (typeof document === "undefined") return;
  document.body.style.overflow = isOpen ? "hidden" : "";
}, { immediate: true });

onUnmounted(() => {
  if (typeof document === "undefined") return;
  document.body.style.overflow = "";
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
          {{ title || "Schuelerpool importieren (CSV, EWO-Datei)" }}
        </h3>
        <p>CSV-Datei laden, Vorschau pruefen und gueltige Zeilen in den Schuelerpool uebernehmen.</p>
        <p v-show="isExpanded" class="pool-info-line">
          {{ poolCountLabel }}
          <strong>{{ poolCount === null ? "-" : poolCount }}</strong>
        </p>
      </div>
      <div class="import-head-actions">
        <button class="btn-secondary" type="button" :disabled="!verfahrenId || !rundeId || loading" @click="openCsvImportOverlay">
          Import (CSV, EWO)
        </button>
        <button class="btn-secondary" type="button" :disabled="!verfahrenId || !rundeId || loading" @click="openSchildImportOverlay">
          Import Pooldaten aus Schild3
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
      <div v-if="summary.le_count !== undefined"><strong>LE:</strong> {{ summary.le_count }}</div>
      <div v-if="summary.zd_count !== undefined"><strong>ZD:</strong> {{ summary.zd_count }}</div>
      <div v-if="summary.ef_count !== undefined"><strong>EF:</strong> {{ summary.ef_count }}</div>
    </div>

    <div v-if="schildDiagnostics.length" class="pool-diagnostic-actions">
      <button class="btn-secondary" type="button" @click="showSchildDiagnosticsOverlay = true">
        Diagnose anzeigen
      </button>
    </div>

    <div class="import-preview">
      <div class="import-preview-head">
        <div>
          <strong>Schuelerpool</strong>
          <span>{{ filteredPoolSchuelerRows.length }} Treffer | Datenquelle: anm_schueler</span>
        </div>
      </div>

      <div class="pool-metric-cards">
        <article v-for="card in poolMetricCards" :key="card.label" class="pool-metric-card">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
        </article>
      </div>

      <div class="pool-table-toolbar">
        <label class="pool-search-field">
          <span>Suche</span>
          <div class="pool-search-input-wrap">
            <input v-model="poolSearch" type="search" placeholder="Name, Schueler-ID, Quell-SNR oder Schule" />
            <button
              v-if="poolSearch"
              type="button"
              class="pool-search-clear"
              aria-label="Suche loeschen"
              title="Suche loeschen"
              @click="poolSearch = ''"
            >
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>
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
              <th v-if="isSek1Procedure"><button type="button" class="table-sort-btn" @click="setPoolSort('von')">Von{{ poolSortMarker('von') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setPoolSort('geburtsdatum')">Geburtsdatum{{ poolSortMarker('geburtsdatum') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setPoolSort('foerderbedarf')">LE{{ poolSortMarker('foerderbedarf') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setPoolSort('zieldifferent')">ZD{{ poolSortMarker('zieldifferent') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setPoolSort('ef')">EF{{ poolSortMarker('ef') }}</button></th>
              <th v-if="!isSek1Procedure"><button type="button" class="table-sort-btn" @click="setPoolSort('herkunftsschule_snr')">Quell-SNR / Schule{{ poolSortMarker('herkunftsschule_snr') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setPoolSort('herkunft')">Herkunft{{ poolSortMarker('herkunft') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setPoolSort('abgleich_status')">Abgleichstatus{{ poolSortMarker('abgleich_status') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setPoolSort('anmeldestatus')">Anmeldestatus{{ poolSortMarker('anmeldestatus') }}</button></th>
              <th class="detail-actions-head">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadingPoolSchueler">
              <td colspan="12" class="table-empty">Daten werden geladen...</td>
            </tr>
            <tr v-else-if="!sortedPoolSchuelerRows.length">
              <td colspan="12" class="table-empty">Keine Datensaetze in anm_schueler gefunden.</td>
            </tr>
            <tr
              v-for="(row, index) in sortedPoolSchuelerRows"
              :key="`${row.schueler_id}-${row.schueler_schul_id}-${index}`"
              :class="{ 'is-duplicate-child': isDuplicatePoolChild(row) }"
            >
              <td>{{ index + 1 }}</td>
              <td>{{ row.schueler_schul_id || "-" }}</td>
              <td>
                {{ [row.nachname, row.vorname].filter(Boolean).join(", ") || "-" }}
                <span v-if="isDuplicatePoolChild(row)" class="duplicate-hint">Dublette</span>
              </td>
              <td v-if="isSek1Procedure" :title="sourceDisplayTitle(row)">{{ sourceDisplayText(row) }}</td>
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
              <td>
                <span v-if="isPositiveFlag(row.ef)" class="status-badge status-badge-ef">ja</span>
              </td>
              <td v-if="!isSek1Procedure" :title="sourceDisplayTitle(row)">{{ sourceDisplayText(row, 25) }}</td>
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
              <td class="detail-actions-cell">
                <button
                  class="btn-secondary pool-icon-btn"
                  type="button"
                  title="Datensatz bearbeiten"
                  aria-label="Datensatz bearbeiten"
                  @click="handleEditPoolRow(row)"
                >
                  <i class="bi bi-pencil-square" aria-hidden="true"></i>
                </button>
                <button
                  class="btn-secondary pool-icon-btn pool-icon-btn-danger"
                  type="button"
                  title="Datensatz loeschen"
                  aria-label="Datensatz loeschen"
                  @click="handleDeletePoolRow(row)"
                >
                  <i class="bi bi-trash" aria-hidden="true"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    </div>

    <CsvImportOverlay
      :open="showCsvImportOverlay"
      :token="token"
      :verfahren-id="verfahrenId"
      :runde-id="rundeId"
      :title="title || 'Schuelerpool importieren (CSV, EWO-Datei)'"
      import-art="pool"
      @close="showCsvImportOverlay = false"
      @success="handleCsvImportSuccess"
    />

    <div
      v-if="showSchildImportOverlay"
      class="pool-import-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pool-import-overlay-title"
      @click.self="closeSchildImportOverlay"
    >
      <section class="pool-import-overlay-card">
        <div class="pool-import-overlay-head">
          <h3 id="pool-import-overlay-title">Import Pooldaten aus Schild</h3>
        </div>
        <div class="pool-import-overlay-copy">
          <p>
            Es werden fuer alle abgebenden Schulen dieses Verfahrens die Daten der Schuelerinnen und Schueler aus Jahrgang 4
            abgerufen und in den Schuelerpool uebernommen oder aktualisiert.
          </p>
          <p>
            Grundlage sind die in den Schulstammdaten hinterlegten SVWS-Zugangsdaten. Vorhandene Eintraege
            im Pool werden aktualisiert.
          </p>
          <p>
            Der Abruf erfolgt fuer das aktuelle Schuljahr {{ currentSchoolYearLabel }} Abschnitt {{ currentSectionNo }}.
          </p>
        </div>
        <div class="pool-import-overlay-actions">
          <button class="btn-secondary" type="button" :disabled="loading" @click="closeSchildImportOverlay">
            Abbrechen
          </button>
          <button class="btn-primary" type="button" :disabled="loading" @click="confirmSchildImport">
            Weiter
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="showEditPoolOverlay"
      class="pool-import-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pool-edit-overlay-title"
      @click.self="closeEditPoolOverlay"
    >
      <section class="pool-import-overlay-card pool-edit-overlay-card">
        <div class="pool-import-overlay-head">
          <h3 id="pool-edit-overlay-title">Pool-Datensatz bearbeiten</h3>
          <div class="pool-overlay-nav" aria-label="Datensatznavigation">
            <button
              type="button"
              class="head-icon-button"
              :disabled="savingEditPool || !canEditPreviousPoolRow"
              aria-label="Vorherigen Datensatz bearbeiten"
              title="Vorheriger Datensatz"
              @click="openAdjacentPoolRow(-1)"
            >
              <i class="bi bi-chevron-left" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              class="head-icon-button"
              :disabled="savingEditPool || !canEditNextPoolRow"
              aria-label="Naechsten Datensatz bearbeiten"
              title="Naechster Datensatz"
              @click="openAdjacentPoolRow(1)"
            >
              <i class="bi bi-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="pool-edit-overlay-body">
          <div class="pool-edit-form-grid">
          <label>
            <span>Schueler-ID</span>
            <input v-model="editPoolForm.schueler_id" type="text" />
          </label>
          <label>
            <span>Quell-Schueler-Nr</span>
            <input v-model="editPoolForm.herkunftsschueler_nr" type="text" />
          </label>
          <label>
            <span>Vorname</span>
            <input v-model="editPoolForm.vorname" class="pool-edit-input-soft" type="text" />
          </label>
          <label>
            <span>Nachname</span>
            <input v-model="editPoolForm.nachname" class="pool-edit-input-soft" type="text" />
          </label>
          <label>
            <span>Geburtsdatum</span>
            <input v-model="editPoolForm.geburtsdatum" type="date" />
          </label>
          <label>
            <span>Quell-SNR</span>
            <input v-model="editPoolForm.herkunftsschule_snr" type="text" />
          </label>
          <label>
            <span>Schul-Nr</span>
            <input v-model="editPoolForm.anmeldeschule_snr" type="text" />
          </label>
          <label>
            <span>Schulname</span>
            <input v-model="editPoolForm.schule" type="text" disabled />
          </label>
          <label>
            <span>Strasse</span>
            <input v-model="editPoolForm.strasse" type="text" />
          </label>
          <label>
            <span>PLZ</span>
            <input v-model="editPoolForm.plz" type="text" />
          </label>
          <label>
            <span>Ort</span>
            <input v-model="editPoolForm.ort" type="text" />
          </label>
          <label>
            <span>Herkunft</span>
            <select v-model="editPoolForm.herkunft">
              <option v-for="option in herkunftOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
          <label>
            <span>Abgleichstatus</span>
            <select v-model="editPoolForm.abgleich_status">
              <option v-for="option in abgleichStatusOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
          <label>
            <span>Anmeldestatus</span>
            <select v-model="editPoolForm.anmeldestatus">
              <option v-for="option in anmeldestatusEditOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
          <label>
            <span>Teilnahmestatus</span>
            <select v-model="editPoolForm.teilnahmestatus">
              <option v-for="option in teilnahmestatusOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
          <label>
            <span>LE</span>
            <select v-model="editPoolForm.foerderbedarf">
              <option value="0">Nein</option>
              <option value="1">Ja</option>
            </select>
          </label>
          <label>
            <span>ZD</span>
            <select v-model="editPoolForm.zieldifferent">
              <option value="0">Nein</option>
              <option value="1">Ja</option>
            </select>
          </label>
          <label>
            <span>EF</span>
            <select v-model="editPoolForm.ef">
              <option value="0">Nein</option>
              <option value="1">Ja</option>
            </select>
          </label>
          <label class="pool-edit-form-full">
            <span>Bemerkung</span>
            <textarea v-model="editPoolForm.bemerkung" rows="4"></textarea>
          </label>
          </div>
        </div>
        <div class="pool-import-overlay-actions">
          <button class="btn-secondary" type="button" :disabled="savingEditPool" @click="closeEditPoolOverlay">
            Abbrechen
          </button>
          <button class="btn-primary" type="button" :disabled="savingEditPool" @click="saveEditPoolRow">
            {{ savingEditPool ? "Speichere..." : "Speichern" }}
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="showDeletePoolOverlay"
      class="pool-import-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pool-delete-overlay-title"
      @click.self="closeDeletePoolOverlay"
    >
      <section class="pool-import-overlay-card pool-delete-overlay-card">
        <div class="pool-delete-hero">
          <div class="pool-delete-badge" aria-hidden="true">!</div>
          <div>
            <h3 id="pool-delete-overlay-title">Datensatz wirklich loeschen?</h3>
            <p>Diese Aktion entfernt das Kind aus dem Schuelerpool der aktuellen Runde.</p>
          </div>
        </div>

        <div class="pool-delete-summary">
          <strong>{{ [pendingDeletePoolRow?.nachname, pendingDeletePoolRow?.vorname].filter(Boolean).join(", ") || "-" }}</strong>
          <span>
            ID {{ pendingDeletePoolRow?.schueler_schul_id || "-" }}
            <template v-if="pendingDeletePoolRow?.herkunftsschule_snr"> | Quell-SNR {{ pendingDeletePoolRow?.herkunftsschule_snr }}</template>
          </span>
        </div>

        <div class="pool-import-overlay-actions">
          <button class="btn-secondary" type="button" :disabled="deletingPoolRow" @click="closeDeletePoolOverlay">
            Abbrechen
          </button>
          <button class="btn-primary pool-delete-confirm-button" type="button" :disabled="deletingPoolRow" @click="confirmDeletePoolRow">
            {{ deletingPoolRow ? "Loesche..." : "Loeschen" }}
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="showDuplicateConflictsOverlay"
      class="pool-import-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pool-import-duplicate-conflicts-title"
      @click.self="closeDuplicateConflictsOverlay"
    >
      <section class="pool-import-overlay-card pool-import-updates-card">
        <div class="pool-import-overlay-head">
          <h3 id="pool-import-duplicate-conflicts-title"><span class="warning-icon" aria-hidden="true">!</span>Doppelte Schueler-IDs</h3>
        </div>
        <div class="pool-import-overlay-copy">
          <p>Diese Datensaetze wurden nicht importiert, weil die `schueler_id` bereits in `anm_schueler` vorhanden ist.</p>
          <div class="pool-import-updates-list">
            <div
              v-for="(entry, index) in duplicateConflicts"
              :key="`${entry.schueler_id}-${entry.anmeldeschule_snr}-${entry.nachname}-${entry.vorname}`"
              class="pool-import-updates-item"
            >
              {{ index + 1 }}. {{ entry.schueler_id }} | {{ entry.nachname }} | {{ entry.vorname }} | {{ entry.anmeldeschule_snr }} | {{ entry.schulname || "-" }}
            </div>
          </div>
        </div>
        <div class="pool-import-overlay-actions">
          <button class="btn-primary" type="button" @click="closeDuplicateConflictsOverlay">
            Schliessen
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="showSchildDiagnosticsOverlay"
      class="pool-import-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pool-import-diagnostics-title"
      @click.self="closeSchildDiagnosticsOverlay"
    >
      <section class="pool-import-overlay-card pool-import-diagnostics-card">
        <div class="pool-import-overlay-head">
          <h3 id="pool-import-diagnostics-title">Backend-Diagnose Schild-Import</h3>
        </div>
        <div class="pool-import-overlay-copy">
          <p>Diese Werte kommen direkt aus dem Backend pro Schule und helfen beim Eingrenzen des Imports.</p>
          <div class="pool-diagnostic-list">
            <article
              v-for="entry in schildDiagnostics"
              :key="`${entry.snr}-${entry.diagnostics?.current_section_id || 0}`"
              class="pool-diagnostic-item"
            >
              <div class="pool-diagnostic-item-head">
                <strong>{{ entry.diagnostics?.school_name || entry.snr || "-" }}</strong>
                <span>{{ entry.diagnostics?.school_snr || entry.snr || "-" }}</span>
              </div>
              <div class="pool-diagnostic-grid">
                <div><strong>Verbindung:</strong> {{ formatDiagnosticBoolean(entry.diagnostics?.connection_established) }}</div>
                <div><strong>Host:</strong> {{ entry.diagnostics?.host || "-" }}</div>
                <div><strong>Schema:</strong> {{ entry.diagnostics?.db_name || "-" }}</div>
                <div><strong>Abschnitt:</strong> {{ entry.diagnostics?.current_section_label || "-" }}</div>
                <div><strong>Abschnitts-ID:</strong> {{ entry.diagnostics?.current_section_id || "-" }}</div>
                <div><strong>Auswahlliste:</strong> {{ entry.diagnostics?.selection_count ?? "-" }}</div>
                <div><strong>Status 2:</strong> {{ entry.diagnostics?.status_2_count ?? "-" }}</div>
                <div><strong>Jahrgang 4:</strong> {{ entry.diagnostics?.grade_4_count ?? "-" }}</div>
                <div><strong>Kandidaten:</strong> {{ entry.diagnostics?.eligible_count ?? "-" }}</div>
                <div><strong>Gelesen:</strong> {{ entry.rows_read ?? "-" }}</div>
                <div><strong>Neu:</strong> {{ entry.imported_students ?? "-" }}</div>
                <div><strong>Aktualisiert:</strong> {{ entry.updated_students ?? "-" }}</div>
                <div><strong>Uebersprungen:</strong> {{ entry.skipped_rows ?? "-" }}</div>
                <div><strong>Fehler:</strong> {{ entry.error_rows ?? "-" }}</div>
              </div>
              <p v-if="entry.message" class="pool-diagnostic-message">{{ entry.message }}</p>
            </article>
          </div>
        </div>
        <div class="pool-import-overlay-actions">
          <button class="btn-primary" type="button" @click="closeSchildDiagnosticsOverlay">
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

.import-head-controls {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.head-icon-button {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: #eef4fd;
  color: #1459a8;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.head-icon-button:hover {
  background: #dbeafe;
  transform: translateY(-1px);
}

.head-icon-button:disabled {
  opacity: 0.45;
  cursor: default;
  transform: none;
}

.head-icon-button i {
  font-size: 18px;
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

.pool-diagnostic-actions {
  display: flex;
  justify-content: flex-start;
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
  grid-template-columns: minmax(320px, 2fr) repeat(3, minmax(130px, 1fr));
  gap: 8px;
  align-items: end;
}

.pool-metric-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}

.pool-metric-card {
  padding: 12px 14px;
  border: 1px solid #dbe4f0;
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #f7faff 100%);
  color: #17385f;
}

.pool-metric-card span,
.pool-metric-card strong {
  display: block;
}

.pool-metric-card span {
  color: #5a7393;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.pool-metric-card strong {
  margin-top: 6px;
  font-size: 24px;
  line-height: 1;
}

.pool-table-toolbar label {
  display: grid;
  gap: 4px;
}

.pool-search-input-wrap {
  position: relative;
  width: 100%;
}

.pool-search-input-wrap input {
  width: 100%;
  padding-right: 40px;
}

.pool-search-clear {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #6b7f99;
  cursor: pointer;
}

.pool-search-clear:hover {
  background: #e7eef8;
  color: #17385f;
}

.pool-search-clear i {
  font-size: 12px;
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

.detail-table tr.is-duplicate-child {
  background: #fff7ed;
}

.detail-table tbody tr {
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

.detail-table tbody tr:hover td {
  background-color: #dbeafe;
}

.detail-table tbody tr:hover {
  box-shadow: inset 0 1px 0 #93c5fd, inset 0 -1px 0 #93c5fd;
}

.detail-table th {
  color: #5a7393;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.detail-actions-head {
  text-align: right !important;
}

.detail-actions-cell {
  white-space: nowrap;
  text-align: right !important;
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

.status-badge-ef {
  background: #fce7f3;
  color: #be185d;
}

.status-badge-assigned {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-badge-without {
  background: #fee2e2;
  color: #b91c1c;
}

.duplicate-hint {
  display: inline-flex;
  margin-left: 8px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #fed7aa;
  color: #9a3412;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
  vertical-align: middle;
}

.pool-icon-btn {
  min-width: 32px;
  min-height: 32px;
  padding: 0;
  margin-left: 6px;
  border: 1px solid #d7e2ef;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.pool-icon-btn i {
  font-size: 14px;
}

.pool-icon-btn-danger {
  color: #b91c1c;
  background: #fff5f5;
}

.pool-icon-btn-danger:hover:not(:disabled) {
  background: #fee2e2;
}

.pool-import-overlay {
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

.pool-import-overlay-card {
  width: min(560px, 100%);
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

.pool-import-updates-card {
  width: min(760px, 100%);
}

.pool-edit-overlay-card {
  width: min(920px, 100%);
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.pool-delete-overlay-card {
  width: min(520px, 100%);
}

.pool-import-overlay-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pool-import-overlay-head h3 {
  margin: 0;
  color: #19365b;
  display: flex;
  align-items: center;
  gap: 10px;
}

.pool-overlay-nav {
  display: inline-flex;
  gap: 8px;
  flex-shrink: 0;
}

.warning-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #dc2626;
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
}

.pool-import-overlay-copy {
  display: grid;
  gap: 12px;
}

.pool-import-overlay-copy p {
  margin: 0;
  color: #4a607e;
  line-height: 1.6;
}

.pool-import-diagnostics-card {
  width: min(980px, 100%);
}

.pool-diagnostic-list {
  display: grid;
  gap: 14px;
}

.pool-diagnostic-item {
  display: grid;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid #d8e4f3;
  border-radius: 16px;
  background: #f8fbff;
}

.pool-diagnostic-item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.pool-diagnostic-item-head strong {
  color: #19365b;
}

.pool-diagnostic-item-head span {
  color: #5f7593;
  font-size: 0.92rem;
}

.pool-diagnostic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px 14px;
  font-size: 0.94rem;
  color: #334e68;
}

.pool-diagnostic-message {
  padding: 12px 14px;
  border-radius: 12px;
  background: #eef4fd;
  color: #1f3f67 !important;
}

.pool-delete-hero {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: center;
}

.pool-delete-badge {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%);
  color: #ffffff;
  font-size: 24px;
  font-weight: 800;
  box-shadow: 0 14px 28px rgba(220, 38, 38, 0.22);
}

.pool-delete-hero h3 {
  margin: 0 0 4px;
  color: #7f1d1d;
}

.pool-delete-hero p {
  margin: 0;
  color: #7b4150;
  line-height: 1.55;
}

.pool-delete-summary {
  display: grid;
  gap: 4px;
  padding: 16px 18px;
  border: 1px solid #fecaca;
  border-radius: 18px;
  background:
    radial-gradient(circle at top right, rgba(252, 165, 165, 0.18), transparent 34%),
    linear-gradient(180deg, #fff7f7 0%, #ffffff 100%);
}

.pool-delete-summary strong {
  color: #7f1d1d;
  font-size: 16px;
}

.pool-delete-summary span {
  color: #9a3412;
  font-size: 13px;
}

.pool-delete-note {
  padding: 14px 16px;
  border-radius: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.pool-delete-note p {
  margin: 0;
  color: #475569;
}

.pool-delete-confirm-button {
  background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%);
  border-color: #dc2626;
  box-shadow: 0 12px 24px rgba(220, 38, 38, 0.2);
}

.pool-delete-confirm-button:hover:not(:disabled) {
  background: linear-gradient(180deg, #dc2626 0%, #b91c1c 100%);
  border-color: #b91c1c;
}

.pool-edit-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 14px;
}

.pool-edit-overlay-body {
  min-height: 0;
  overflow-y: auto;
  padding-left: 6px;
  padding-right: 6px;
}

.pool-edit-form-grid label {
  display: grid;
  gap: 5px;
}

.pool-edit-form-grid span {
  color: #5a7393;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.pool-edit-form-grid input,
.pool-edit-form-grid select,
.pool-edit-form-grid textarea {
  width: 100%;
  min-height: 38px;
  border: 1px solid #d7e2ef;
  border-radius: 10px;
  padding: 8px 10px;
  background: #fff;
  color: #17385f;
  font-size: 13px;
}

.pool-edit-form-grid textarea {
  min-height: 96px;
  resize: vertical;
}

.pool-edit-form-grid input:disabled {
  background: #f3f7fb;
  color: #6b7f99;
}

.pool-edit-input-soft {
  background: #f7fbff;
  font-weight: 700;
}

.pool-edit-form-full {
  grid-column: 1 / -1;
}

.pool-import-overlay-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pool-import-updates-list {
  margin-top: 12px;
  max-height: 420px;
  overflow: auto;
  border: 1px solid #dbe4f0;
  border-radius: 14px;
  background: #f8fbff;
}

.pool-import-updates-item {
  padding: 7px 10px;
  border-bottom: 1px solid #e5edf6;
  color: #17385f;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.3;
}

.pool-import-updates-item:last-child {
  border-bottom: 0;
}

@media (max-width: 900px) {
  .import-card-head,
  .import-preview-head {
    flex-direction: column;
  }

  .pool-table-toolbar {
    grid-template-columns: 1fr;
  }

  .pool-import-overlay-card {
    padding: 20px;
  }

  .pool-import-overlay-actions {
    justify-content: center;
  }

  .pool-import-overlay-actions .btn-primary,
  .pool-import-overlay-actions .btn-secondary {
    min-width: 140px;
  }

  .pool-diagnostic-item-head {
    flex-direction: column;
    align-items: flex-start;
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
