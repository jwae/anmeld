<script setup lang="ts">
import { computed, ref, watch } from "vue";
import abgleichService from "../services/abgleichService";
import type { Anmeldeverfahrenstyp } from "../types";

type SchuelerRow = {
  schueler_id: number | string;
  vorname: string;
  nachname: string;
  geburtsdatum: string | null;
  foerderbedarf: string;
  foerder_id?: string | number | null;
  foerder_label?: string | null;
  zieldifferent: number | string;
  herkunft?: string;
  herkunftsschule_snr?: string;
  quell_schule?: string;
  schule: string;
  schulnummer: string;
  schueler_schul_id: string;
  abgleich_status: string;
  anmeldestatus: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  bemerkung?: string;
  offene_faelle_anzahl?: number;
};

type FallgrundOption = {
  id: number;
  code: string;
  bezeichnung: string;
};

type SummaryStats = {
  gesamt: number;
  schulen: number;
  neuaufnahme: number;
  warteliste: number;
  zugeordnet: number;
  abgelehnt: number;
  ohne: number;
  foerderbedarf: number;
  zieldifferent: number;
};

type SchoolOverviewRow = {
  schulnummer: string;
  schule: string;
  kapazitaet: number;
  gesamt: number;
  neuaufnahme: number;
  freie_plaetze?: number;
  warteliste: number;
  ohne: number;
  foerderbedarf: number;
  zieldifferent: number;
};

const props = defineProps<{
  token?: string;
  verfahrenId: number | null;
  rundeId: number | null;
  verfahrenstyp?: Anmeldeverfahrenstyp | null;
  context: {
    verfahren: string;
    runde: string;
  };
}>();

const loading = ref(false);
const geocoding = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const schuelerRows = ref<SchuelerRow[]>([]);
const schoolOverviewRows = ref<SchoolOverviewRow[]>([]);
const schoolNumbersInProcedure = ref<string[]>([]);
const anmeldestatusOptions = ref<string[]>([]);
const fallgrundOptions = ref<FallgrundOption[]>([]);
const caseDialogOpen = ref(false);
const caseDialogSaving = ref(false);
const selectedCaseRow = ref<SchuelerRow | null>(null);
const caseFallgrundId = ref<number>(0);
const caseBemerkung = ref("");
const editDialogOpen = ref(false);
const editDialogSaving = ref(false);
const selectedEditRow = ref<SchuelerRow | null>(null);
const editForm = ref<Record<string, string>>({});

const search = ref("");
const schuleFilter = ref("alle");
const abgebendeSchuleFilter = ref("alle");
const anmeldestatusFilter = ref("alle");
const foerderbedarfFilter = ref("alle");
const zieldifferentFilter = ref("alle");
const herkunftFilter = ref("alle");
const sortKey = ref<keyof SchuelerRow | "von">("nachname");
const sortDirection = ref<"asc" | "desc">("asc");
const isSek1Procedure = computed(() => props.verfahrenstyp === "SEK1");

function createEmptySummary(): SummaryStats {
  return {
    gesamt: 0,
    schulen: 0,
    neuaufnahme: 0,
    warteliste: 0,
    zugeordnet: 0,
    abgelehnt: 0,
    ohne: 0,
    foerderbedarf: 0,
    zieldifferent: 0,
  };
}

const summary = ref<SummaryStats>(createEmptySummary());

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStatus(value: unknown) {
  return normalizeText(value) || "Ohne";
}

function normalizeStatusKey(value: unknown) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function mapAnmeldestatusEditValue(rawStatus: unknown, availableTargets: string[]) {
  const targetLookup = new Map(
    availableTargets.map((target) => [normalizeStatusKey(target), target]),
  );
  const normalized = normalizeStatusKey(rawStatus);
  if (!normalized) return targetLookup.get("ohne") || "Ohne";
  if (targetLookup.has(normalized)) return targetLookup.get(normalized) || "Ohne";
  if (["warteliste", "wl", "warte liste"].includes(normalized)) return targetLookup.get("warteliste") || "Warteliste";
  if (["ablehnung", "abgelehnt", "abgelehnt."].includes(normalized)) return targetLookup.get("abgelehnt") || "Abgelehnt";
  if (["neuaufnahme", "aufnahme", "neu aufnahme"].includes(normalized)) return targetLookup.get("neuaufnahme") || "Neuaufnahme";
  if (["zugeordnet", "zugewiesen"].includes(normalized)) return targetLookup.get("zugeordnet") || "Zugeordnet";
  return normalizeText(rawStatus) || targetLookup.get("ohne") || "Ohne";
}

function normalizeStatusFilterValue(value: unknown) {
  return normalizeStatus(value).toLowerCase();
}

function displayHerkunft(row: SchuelerRow) {
  return normalizeText(row.herkunft) || "-";
}

function isUnknownSchoolNumber(value: unknown) {
  const schulnummer = normalizeText(value);
  return Boolean(
    schulnummer
    && schoolNumbersInProcedure.value.length
    && !schoolNumbersInProcedure.value.includes(schulnummer),
  );
}

function abgleichStatusHoverText(value: unknown) {
  const status = normalizeText(value);
  if (status === "Pool + Anm") return "Kind aus Pool mit Anmeldung";
  if (status === "Nur Anmeldung") return "Neuanmeldung (-zugang) an der Schule";
  return "";
}

function abgleichStatusBadgeClass(value: unknown) {
  const status = normalizeText(value);
  if (status === "Nur Anmeldung") return "status-chip status-chip-positive";
  if (status === "Pool + Anm") return "status-chip status-chip-info";
  if (status === "Nur Pool") return "status-chip status-chip-muted";
  return "";
}

function anmeldestatusBadgeClass(value: unknown) {
  const status = normalizeStatus(value);
  if (status === "Ohne") return "status-chip status-chip-negative";
  if (status === "Neuaufnahme") return "status-chip status-chip-positive";
  if (status === "Zugeordnet") return "status-chip status-chip-info";
  if (status === "Warteliste") return "status-chip status-chip-waiting";
  return "status-chip status-chip-muted";
}

function hasPositiveFoerderbedarf(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  return text === "1";
}

function rawFoerderbedarfValue(row: SchuelerRow) {
  return normalizeText(row.foerderbedarf);
}

function foerderbedarfHoverText(row: SchuelerRow) {
  return normalizeText(row.foerder_label) || normalizeText(row.foerder_id) || "-";
}

function foerderbedarfDropdownValue(row: SchuelerRow) {
  return hasPositiveFoerderbedarf(rawFoerderbedarfValue(row)) ? "1" : "0";
}

function isZieldifferent(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  return text === "1" || text === "true" || text === "ja";
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

function truncateText(value: string, maxLength = 15) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function sourceDisplayText(row: SchuelerRow, maxSchoolLength = 15) {
  const sourceNo = normalizeText(row.herkunftsschule_snr);
  const schoolName = normalizeText(row.quell_schule);
  if (sourceNo && schoolName) return `${sourceNo} / ${truncateText(schoolName, maxSchoolLength)}`;
  return sourceNo || truncateText(schoolName, maxSchoolLength) || "-";
}

function sourceDisplayTitle(row: SchuelerRow) {
  const sourceNo = normalizeText(row.herkunftsschule_snr);
  const schoolName = normalizeText(row.quell_schule);
  if (sourceNo && schoolName) return `${sourceNo} / ${schoolName}`;
  return sourceNo || schoolName || "-";
}

function offeneFaelleAnzahl(row: SchuelerRow) {
  return Number(row.offene_faelle_anzahl || 0);
}

function hasOpenCase(row: SchuelerRow) {
  return offeneFaelleAnzahl(row) > 0;
}

function caseIconButtonClass(row: SchuelerRow) {
  return hasOpenCase(row)
    ? "case-icon-btn case-icon-btn-active"
    : "case-icon-btn case-icon-btn-idle";
}

function caseIconTitle(row: SchuelerRow) {
  return hasOpenCase(row)
    ? `${offeneFaelleAnzahl(row)} offener Fall/Faelle vorhanden`
    : "Manuellen offenen Fall anlegen";
}

function openEditDialog(row: SchuelerRow) {
  selectedEditRow.value = row;
  editForm.value = {
    schueler_schul_id: normalizeText(row.schueler_schul_id),
    vorname: normalizeText(row.vorname),
    nachname: normalizeText(row.nachname),
    geburtsdatum: normalizeText(row.geburtsdatum),
    foerderbedarf: normalizeText(row.foerderbedarf) === "1" ? "1" : "0",
    zieldifferent: isZieldifferent(row.zieldifferent) ? "1" : "0",
    herkunft: normalizeText(row.herkunft),
    abgleich_status: normalizeText(row.abgleich_status),
    anmeldestatus: mapAnmeldestatusEditValue(row.anmeldestatus, anmeldestatusEditOptions),
    schulnummer: normalizeText(row.schulnummer),
    strasse: normalizeText(row.strasse),
    plz: normalizeText(row.plz),
    ort: normalizeText(row.ort),
    bemerkung: normalizeText(row.bemerkung),
  };
  errorMessage.value = "";
  successMessage.value = "";
  editDialogOpen.value = true;
}

function closeEditDialog(force: boolean | Event = false) {
  const shouldForce = typeof force === "boolean" ? force : false;
  if (editDialogSaving.value && !shouldForce) return;
  editDialogOpen.value = false;
  selectedEditRow.value = null;
  editForm.value = {};
}

async function saveEditDialog() {
  if (!props.verfahrenId || !props.rundeId || !selectedEditRow.value) return;

  try {
    editDialogSaving.value = true;
    errorMessage.value = "";
    successMessage.value = "";
    const response = await abgleichService.updateSchueler(
      Number(selectedEditRow.value.schueler_id || 0),
      {
        verfahren_id: props.verfahrenId,
        runde_id: props.rundeId,
        ...editForm.value,
      },
      props.token,
    );
    successMessage.value = response?.message || "Der Schuelerdatensatz wurde gespeichert.";
    await loadData();
    closeEditDialog(true);
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Der Schuelerdatensatz konnte nicht gespeichert werden.";
  } finally {
    editDialogSaving.value = false;
  }
}

function uniqueOptions(selector: (row: SchuelerRow) => string) {
  return Array.from(
    new Set(
      schuelerRows.value
        .map(selector)
        .map((value) => normalizeText(value))
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));
}

const schuleOptions = computed(() => uniqueOptions((row) => row.schule));
const foerderbedarfOptions = [
  { value: "1", label: "Ja" },
  { value: "0", label: "Nein" },
];
const anmeldestatusEditOptions = ["Neuaufnahme", "Warteliste", "Zugeordnet", "Abgelehnt", "Ohne"];
const herkunftOptions = computed(() => uniqueOptions((row) => displayHerkunft(row)));
const abgebendeSchuleOptions = computed(() => uniqueOptions((row) => sourceDisplayTitle(row)));
const herkunftEditOptions = computed(() => Array.from(new Set([
  "Pool",
  "Anmeldung",
  "Manuell",
  ...uniqueOptions((row) => displayHerkunft(row)).filter((option) => option !== "-"),
])).sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" })));

const filteredRows = computed(() => {
  const searchText = normalizeText(search.value).toLowerCase();

  return schuelerRows.value.filter((row) => {
    const fullName = `${normalizeText(row.nachname)} ${normalizeText(row.vorname)}`.toLowerCase();
    if (searchText && !fullName.includes(searchText)) return false;
    if (schuleFilter.value !== "alle") {
      const rowSchule = normalizeText(row.schule);
      if (schuleFilter.value === "Ohne Zuordnung" || schuleFilter.value === "Ohne Schule") {
        if (rowSchule !== "" && rowSchule !== "Ohne Zuordnung" && rowSchule !== "Ohne Schule") return false;
      } else {
        if (rowSchule !== schuleFilter.value) return false;
      }
    }
    if (abgebendeSchuleFilter.value !== "alle" && sourceDisplayTitle(row) !== abgebendeSchuleFilter.value) return false;
    if (
      anmeldestatusFilter.value !== "alle"
      && normalizeStatusFilterValue(row.anmeldestatus) !== normalizeStatusFilterValue(anmeldestatusFilter.value)
    ) return false;
    if (foerderbedarfFilter.value !== "alle" && foerderbedarfDropdownValue(row) !== foerderbedarfFilter.value) return false;
    if (herkunftFilter.value !== "alle" && displayHerkunft(row) !== herkunftFilter.value) return false;
    if (zieldifferentFilter.value === "ja" && !isZieldifferent(row.zieldifferent)) return false;
    if (zieldifferentFilter.value === "nein" && isZieldifferent(row.zieldifferent)) return false;
    return true;
  });
});

const schoolOverview = computed(() => {
  // Zeige immer alle Schulen in der Übersicht an, damit der Benutzer bequem per Klick filtern kann.
  const rows = schoolOverviewRows.value;

  return rows.map((row) => ({
    ...row,
    freie_plaetze: Number(row.kapazitaet || 0) - Number(row.neuaufnahme || 0),
  }));
});

const sortedRows = computed(() => {
  const factor = sortDirection.value === "asc" ? 1 : -1;
  return [...filteredRows.value].sort((left, right) => {
    const a = sortKey.value === "von" ? sourceDisplayTitle(left) : left[sortKey.value];
    const b = sortKey.value === "von" ? sourceDisplayTitle(right) : right[sortKey.value];
    return String(a ?? "").localeCompare(String(b ?? ""), "de", { numeric: true, sensitivity: "base" }) * factor;
  });
});

const duplicateNameBirthKeys = computed(() => {
  const counts = new Map<string, number>();
  for (const row of filteredRows.value) {
    const key = duplicateNameBirthKey(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([key]) => key),
  );
});

function setSort(nextKey: keyof SchuelerRow | "von") {
  if (sortKey.value === nextKey) {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
    return;
  }
  sortKey.value = nextKey;
  sortDirection.value = "asc";
}

function sortMarker(key: keyof SchuelerRow | "von") {
  if (sortKey.value !== key) return "";
  return sortDirection.value === "asc" ? " ▲" : " ▼";
}

function duplicateNameBirthKey(row: SchuelerRow) {
  const nachname = normalizeText(row.nachname).toLowerCase();
  const vorname = normalizeText(row.vorname).toLowerCase();
  const geburtsdatum = normalizeText(row.geburtsdatum).toLowerCase();
  if (!nachname || !vorname || !geburtsdatum) return "";
  return `${nachname}|${vorname}|${geburtsdatum}`;
}

function hasDuplicateNameBirth(row: SchuelerRow) {
  const key = duplicateNameBirthKey(row);
  return key ? duplicateNameBirthKeys.value.has(key) : false;
}

async function loadData() {
  if (!props.verfahrenId || !props.rundeId) {
    schuelerRows.value = [];
    schoolOverviewRows.value = [];
    schoolNumbersInProcedure.value = [];
    anmeldestatusOptions.value = [];
    fallgrundOptions.value = [];
    summary.value = createEmptySummary();
    return;
  }

  try {
    loading.value = true;
    errorMessage.value = "";
    const response = await abgleichService.getSchuelerUebersicht(props.verfahrenId, props.rundeId, props.token);
    schuelerRows.value = Array.isArray(response?.rows) ? response.rows : [];
    schoolOverviewRows.value = Array.isArray(response?.schoolOverview) ? response.schoolOverview : [];
    schoolNumbersInProcedure.value = Array.isArray(response?.schoolNumbersInProcedure) ? response.schoolNumbersInProcedure.map((value: unknown) => normalizeText(value)).filter(Boolean) : [];
    anmeldestatusOptions.value = Array.isArray(response?.anmeldestatusOptions) ? response.anmeldestatusOptions : [];
    fallgrundOptions.value = Array.isArray(response?.fallgrundOptions) ? response.fallgrundOptions : [];
    const normalizedRows = Array.isArray(response?.rows) ? response.rows : [];
    summary.value = {
      ...createEmptySummary(),
      ...(response?.summary || {}),
      zugeordnet: Number(response?.summary?.zugeordnet || normalizedRows.filter((row: SchuelerRow) => normalizeStatus(row.anmeldestatus) === "Zugeordnet").length || 0),
    };
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Die Abgleichsansicht konnte nicht geladen werden.";
    schuelerRows.value = [];
    schoolOverviewRows.value = [];
    schoolNumbersInProcedure.value = [];
    anmeldestatusOptions.value = [];
    fallgrundOptions.value = [];
    summary.value = createEmptySummary();
  } finally {
    loading.value = false;
  }
}

function resetCaseDialog() {
  caseDialogOpen.value = false;
  caseDialogSaving.value = false;
  selectedCaseRow.value = null;
  caseFallgrundId.value = 0;
  caseBemerkung.value = "";
}

function openCaseDialog(row: SchuelerRow) {
  selectedCaseRow.value = row;
  caseFallgrundId.value = Number(fallgrundOptions.value[0]?.id || 0);
  caseBemerkung.value = "";
  errorMessage.value = "";
  successMessage.value = "";
  caseDialogOpen.value = true;
}

async function submitOpenCase() {
  if (!props.verfahrenId || !props.rundeId || !selectedCaseRow.value) return;
  if (!Number(caseFallgrundId.value || 0)) {
    errorMessage.value = "Bitte einen Fallgrund auswaehlen.";
    return;
  }

  try {
    caseDialogSaving.value = true;
    errorMessage.value = "";
    successMessage.value = "";
    const response = await abgleichService.createOffenerFall({
      verfahren_id: props.verfahrenId,
      runde_id: props.rundeId,
      schueler_id: Number(selectedCaseRow.value.schueler_id || 0),
      fallgrund_id: Number(caseFallgrundId.value || 0),
      bemerkung: caseBemerkung.value || "",
    }, props.token);
    successMessage.value = response?.message || "Der offene Fall wurde angelegt.";
    await loadData();
    resetCaseDialog();
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Der offene Fall konnte nicht angelegt werden.";
  } finally {
    caseDialogSaving.value = false;
  }
}

async function handleUpdateGeocoding() {
  if (!props.verfahrenId || !props.rundeId) {
    errorMessage.value = "Bitte zuerst ein Verfahren und eine Runde auswaehlen.";
    return;
  }

  try {
    geocoding.value = true;
    errorMessage.value = "";
    successMessage.value = "";
    const response = await abgleichService.updateSchuelerGeocoding(props.verfahrenId, props.rundeId, props.token);
    const summaryData = response?.summary || {};
    successMessage.value = [
      response?.message || "ORS-Geocoding abgeschlossen.",
      `Erfolgreich: ${Number(summaryData.success_count || 0)}`,
      `Fehler: ${Number(summaryData.error_count || 0)}`,
      `Ohne Adresse: ${Number(summaryData.skipped_count || 0)}`,
    ].join(" | ");
    await loadData();
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Das ORS-Geocoding ist fehlgeschlagen.";
  } finally {
    geocoding.value = false;
  }
}

watch(() => [props.verfahrenId, props.rundeId], () => {
  successMessage.value = "";
  errorMessage.value = "";
  loadData();
}, { immediate: true });

function toggleSchuleFilter(schuleName: string) {
  const normName = normalizeText(schuleName);
  if (schuleFilter.value === normName) {
    schuleFilter.value = "alle";
  } else {
    schuleFilter.value = normName;
  }
}
</script>

<template>
  <section class="abgleich-view">
    <div class="abgleich-toolbar">
      <div>
        <p class="abgleich-eyebrow">Abgleich</p>
        <h2>Abgleich auf Basis der Schuelerdaten</h2>
        
      </div>
      <button class="btn-secondary btn-refresh" type="button" @click="loadData" :disabled="loading">
        <span class="btn-refresh-icon" aria-hidden="true">{{ loading ? "..." : "↻" }}</span>
        <span>{{ loading ? "Aktualisiere..." : "Aktualisieren" }}</span>
      </button>
    </div>

    <div v-if="!verfahrenId || !rundeId" class="feedback-panel feedback-panel-warning">
      <p class="feedback-title">Kontext unvollstaendig</p>
      <p>Waehle zuerst ein Verfahren und eine Runde, damit der Abgleich geladen werden kann.</p>
    </div>

    <div v-else-if="errorMessage" class="feedback-panel feedback-panel-error">
      <p class="feedback-title">Fehler</p>
      <p>{{ errorMessage }}</p>
    </div>

    <template v-else>
      <div v-if="successMessage" class="feedback-panel feedback-panel-success">
        <p class="feedback-title">Erfolg</p>
        <p>{{ successMessage }}</p>
      </div>

      <section class="summary-card">
        <div class="section-head">
          <div>
            
            <h3>Zusammenfassung</h3>
          </div>
          <span class="summary-context">{{ context.verfahren }} | {{ context.runde }} | Datenquelle: anm_schueler</span>
        </div>
        <div class="summary-grid">
          <div class="metric-card"><span>Schueler gesamt</span><strong>{{ summary.gesamt }}</strong></div>
          <div class="metric-card"><span>Schulen</span><strong>{{ summary.schulen }}</strong></div>
          <div class="metric-card"><span>Neuaufnahme</span><strong>{{ summary.neuaufnahme }}</strong></div>
          <div class="metric-card"><span>Warteliste</span><strong>{{ summary.warteliste }}</strong></div>
          <div class="metric-card"><span>Zuordnungen</span><strong>{{ summary.zugeordnet }}</strong></div>
          <div class="metric-card metric-card-alert"><span>Ohne Anmeldung</span><strong>{{ summary.ohne }}</strong></div>
          <div class="metric-card"><span>Foerderbedarf</span><strong>{{ summary.foerderbedarf }}</strong></div>
          <div class="metric-card"><span>Zieldifferent</span><strong>{{ summary.zieldifferent }}</strong></div>
        </div>
      </section>

      <section class="table-card">
        <div class="section-head">
          <div>
            
            <h3>Schulen mit Anmeldungen</h3>
          </div>
          <span class="table-count">{{ schoolOverview.length }} Schulen | Datenquelle: anm_schueler</span>
        </div>
        <div class="table-wrap">
          <table class="overview-table">
            <thead>
              <tr>
                <th>SNr</th>
                <th>Schule</th>
                <th>Kapazitaet</th>
                <th>Anm.-Gesamt</th>
                <th>Neuaufnahme</th>
                <th>Freie Plaetze</th>
                <th>Warteliste</th>
                <th>Ohne</th>
                <th>LE</th>
                <th>ZD</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="10" class="table-empty">Daten werden geladen...</td>
              </tr>
              <tr v-else-if="!schoolOverview.length">
                <td colspan="10" class="table-empty">Keine Schulen fuer die aktuellen Filter gefunden.</td>
              </tr>
              <tr
                v-for="row in schoolOverview"
                :key="`${row.schulnummer}-${row.schule}`"
                :class="{
                  'overview-row-outside-procedure': isUnknownSchoolNumber(row.schulnummer),
                  'overview-row-has-capacity': Number(row.freie_plaetze || 0) > 0,
                  'overview-row-selected': schuleFilter === normalizeText(row.schule)
                }"
                @click="toggleSchuleFilter(row.schule)"
                style="cursor: pointer;"
              >
                <td>{{ row.schulnummer || "-" }}</td>
                <td>{{ row.schule }}</td>
                <td>{{ row.kapazitaet }}</td>
                <td>{{ row.gesamt }}</td>
                <td>{{ row.neuaufnahme }}</td>
                <td>
                  <span
                    :class="[
                      'status-badge',
                      Number(row.freie_plaetze || 0) > 0
                        ? 'status-badge-positive'
                        : Number(row.freie_plaetze || 0) < 0
                          ? 'status-badge-negative'
                          : 'status-badge-muted',
                    ]"
                  >
                    {{ row.freie_plaetze }}
                  </span>
                </td>
                <td>{{ row.warteliste }}</td>
                <td>{{ row.ohne }}</td>
                <td>{{ row.foerderbedarf }}</td>
                <td>{{ row.zieldifferent }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="filter-card">
        <label class="filter-field search-field">
          <span>Schuelername</span>
          <input v-model="search" type="search" placeholder="Nachname oder Vorname" />
        </label>
        <label v-if="isSek1Procedure" class="filter-field filter-field-school">
          <span>Abgebende Schule</span>
          <select v-model="abgebendeSchuleFilter">
            <option value="alle">Alle</option>
            <option v-for="option in abgebendeSchuleOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label class="filter-field filter-field-school">
          <span>Aufn.-Schule</span>
          <select v-model="schuleFilter">
            <option value="alle">Alle</option>
            <option v-for="option in schuleOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label class="filter-field filter-field-status">
          <span>Anmeldestatus</span>
          <select v-model="anmeldestatusFilter">
            <option value="alle">Alle</option>
            <option v-for="option in anmeldestatusOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label class="filter-field filter-field-compact">
          <span>Foerderbedarf</span>
          <select v-model="foerderbedarfFilter">
            <option value="alle">Alle</option>
            <option v-for="option in foerderbedarfOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <label class="filter-field filter-field-compact">
          <span>Zieldifferent</span>
          <select v-model="zieldifferentFilter">
            <option value="alle">Alle</option>
            <option value="ja">Ja</option>
            <option value="nein">Nein</option>
          </select>
        </label>
        <label class="filter-field filter-field-compact">
          <span>Herkunft</span>
          <select v-model="herkunftFilter">
            <option value="alle">Alle</option>
            <option v-for="option in herkunftOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
      </section>

      <section class="table-card">
        <div class="section-head">
          <div>
            
            <h3>Schuelerliste im Anmeldeverfahren</h3>
          </div>
          <div class="section-head-actions">
            <span class="table-count">{{ sortedRows.length }} Treffer</span>
            <button
              class="btn-secondary"
              type="button"
              :disabled="loading || geocoding || !verfahrenId || !rundeId"
              @click="handleUpdateGeocoding"
            >
              {{ geocoding ? "Entfernungen werden aktualisiert..." : "Entfernungen aktualisieren" }}
            </button>
          </div>
        </div>
        <div class="table-wrap detail-table-wrap">
          <table class="detail-table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th><button type="button" @click="setSort('schueler_schul_id')">Schueler-ID{{ sortMarker('schueler_schul_id') }}</button></th>
                <th>Bearb.</th>
                <th>Fall</th>
                <th><button type="button" @click="setSort('nachname')">Name + Vorname{{ sortMarker('nachname') }}</button></th>
                <th v-if="isSek1Procedure"><button type="button" @click="setSort('von')">Von{{ sortMarker('von') }}</button></th>
                <th><button type="button" @click="setSort('geburtsdatum')">Geburtsdatum{{ sortMarker('geburtsdatum') }}</button></th>
                <th><button type="button" @click="setSort('foerderbedarf')">LE{{ sortMarker('foerderbedarf') }}</button></th>
                <th>ZD</th>
                <th>Herkunft</th>
                <th><button type="button" @click="setSort('abgleich_status')">Abgleichstatus{{ sortMarker('abgleich_status') }}</button></th>
                <th><button type="button" @click="setSort('anmeldestatus')">Anmeldestatus{{ sortMarker('anmeldestatus') }}</button></th>
                <th><button type="button" @click="setSort('schulnummer')">Schul-Nr{{ sortMarker('schulnummer') }}</button></th>
                <th><button type="button" @click="setSort('schule')">Schule{{ sortMarker('schule') }}</button></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td :colspan="isSek1Procedure ? 14 : 13" class="table-empty">Daten werden geladen...</td>
              </tr>
              <tr v-else-if="!sortedRows.length">
                <td :colspan="isSek1Procedure ? 14 : 13" class="table-empty">Keine Schueler fuer die aktuellen Filter gefunden.</td>
              </tr>
              <tr v-for="(row, index) in sortedRows" :key="`${row.schueler_id}-${row.schueler_schul_id}-${row.schulnummer}-${index}`">
                <td>{{ index + 1 }}</td>
                <td>{{ row.schueler_schul_id || "-" }}</td>
                <td class="case-action-cell">
                  <button
                    type="button"
                    class="case-icon-btn case-icon-btn-edit"
                    title="Schuelerdatensatz bearbeiten"
                    aria-label="Schuelerdatensatz bearbeiten"
                    @click="openEditDialog(row)"
                  >
                    <i class="bi bi-pencil-square" aria-hidden="true"></i>
                  </button>
                </td>
                <td class="case-action-cell">
                  <button
                    type="button"
                    :class="caseIconButtonClass(row)"
                    :title="caseIconTitle(row)"
                    :aria-label="caseIconTitle(row)"
                    @click="openCaseDialog(row)"
                  >
                    <i class="bi bi-chat-square-text" aria-hidden="true"></i>
                    <span v-if="hasOpenCase(row)" class="case-count-badge">{{ offeneFaelleAnzahl(row) }}</span>
                  </button>
                </td>
                <td
                  :class="{ 'cell-duplicate-name': hasDuplicateNameBirth(row) }"
                  :title="hasDuplicateNameBirth(row) ? 'Name und Geburtsdatum kommen mehrfach vor' : ''"
                >{{ [row.nachname, row.vorname].filter(Boolean).join(", ") || "-" }}</td>
                <td v-if="isSek1Procedure" :title="sourceDisplayTitle(row)">{{ sourceDisplayText(row) }}</td>
                <td>{{ formatDate(row.geburtsdatum) }}</td>
                <td>
                  <span
                    v-if="normalizeText(row.foerderbedarf) === '1'"
                    class="status-badge status-badge-le"
                    :title="foerderbedarfHoverText(row)"
                  >ja</span>
                </td>
                <td>
                  <span v-if="normalizeText(row.zieldifferent) === '1'" class="status-badge status-badge-zd">ja</span>
                </td>
                <td>{{ displayHerkunft(row) }}</td>
                <td>
                  <span
                    v-if="abgleichStatusBadgeClass(row.abgleich_status)"
                    :class="abgleichStatusBadgeClass(row.abgleich_status)"
                    :title="abgleichStatusHoverText(row.abgleich_status)"
                  >{{ row.abgleich_status }}</span>
                  <template v-else>{{ row.abgleich_status || "-" }}</template>
                </td>
                <td>
                  <span
                    :class="anmeldestatusBadgeClass(row.anmeldestatus)"
                  >
                    {{ normalizeStatus(row.anmeldestatus) }}
                  </span>
                </td>
                <td>
                  <span
                    :class="isUnknownSchoolNumber(row.schulnummer) ? 'status-chip status-chip-negative status-chip-nowrap' : ''"
                    :title="isUnknownSchoolNumber(row.schulnummer) ? 'Schule ist nicht im Verfahren!' : ''"
                  >
                    {{ isUnknownSchoolNumber(row.schulnummer) ? `${row.schulnummer || "---"}` : (row.schulnummer || "---") }}
                  </span>
                </td>
                <td>{{ row.schule }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div v-if="caseDialogOpen" class="dialog-backdrop" @click.self="resetCaseDialog">
        <section class="case-dialog" role="dialog" aria-modal="true" aria-labelledby="offener-fall-dialog-title">
          <div class="case-dialog-head">
            <div>
              <p class="section-eyebrow">Manueller Offener Fall</p>
              <h3 id="offener-fall-dialog-title">Fall in Abgleich anlegen</h3>
              <p class="case-dialog-student">
                {{ selectedCaseRow ? ([selectedCaseRow.nachname, selectedCaseRow.vorname].filter(Boolean).join(", ") || "-") : "-" }}
              </p>
            </div>
            <button type="button" class="case-dialog-close" aria-label="Dialog schliessen" @click="resetCaseDialog">×</button>
          </div>

          <div class="case-dialog-body">
            <label class="filter-field">
              <span>Fallgrund</span>
              <select v-model="caseFallgrundId">
                <option :value="0">Bitte waehlen</option>
                <option v-for="option in fallgrundOptions" :key="option.id" :value="option.id">{{ option.code }}</option>
              </select>
            </label>

            <label class="filter-field case-dialog-note">
              <span>Bemerkung</span>
              <textarea
                v-model="caseBemerkung"
                rows="5"
                placeholder="Optional eine Bearbeitungsnotiz zum Fall erfassen"
              />
            </label>
          </div>

          <div class="case-dialog-actions">
            <button type="button" class="btn-secondary" @click="resetCaseDialog">Abbrechen</button>
            <button type="button" class="btn-primary" :disabled="caseDialogSaving" @click="submitOpenCase">
              {{ caseDialogSaving ? "Speichere..." : "Fall anlegen" }}
            </button>
          </div>
        </section>
      </div>

      <div v-if="editDialogOpen" class="dialog-backdrop" @click.self="closeEditDialog">
        <section class="case-dialog case-dialog-edit" role="dialog" aria-modal="true" aria-labelledby="schueler-edit-dialog-title">
          <div class="case-dialog-head">
            <div>
              <p class="section-eyebrow">Schuelerdatensatz</p>
              <h3 id="schueler-edit-dialog-title">Schuelerdatensatz bearbeiten</h3>
              <p class="case-dialog-student">
                {{ selectedEditRow ? ([selectedEditRow.nachname, selectedEditRow.vorname].filter(Boolean).join(", ") || "-") : "-" }}
              </p>
            </div>
            <button type="button" class="case-dialog-close" aria-label="Dialog schliessen" @click="closeEditDialog">×</button>
          </div>

          <div class="case-dialog-body case-dialog-body-edit">
            <div class="edit-form-grid">
              <label>
                <span>Schueler-ID</span>
                <input v-model="editForm.schueler_schul_id" type="text" />
              </label>
              <label>
                <span>Schul-Nr</span>
                <input v-model="editForm.schulnummer" type="text" />
              </label>
              <label>
                <span>Vorname</span>
                <input v-model="editForm.vorname" type="text" />
              </label>
              <label>
                <span>Nachname</span>
                <input v-model="editForm.nachname" type="text" />
              </label>
              <label>
                <span>Geburtsdatum</span>
                <input v-model="editForm.geburtsdatum" type="date" />
              </label>
              <label>
                <span>Herkunft</span>
                <select v-model="editForm.herkunft">
                  <option value="">Bitte waehlen</option>
                  <option v-for="option in herkunftEditOptions" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
              <label>
                <span>Abgleichstatus</span>
                <select v-model="editForm.abgleich_status">
                  <option value="">Bitte waehlen</option>
                  <option value="Nur Pool">Nur Pool</option>
                  <option value="Nur Anmeldung">Nur Anmeldung</option>
                  <option value="Pool + Anm">Pool + Anm</option>
                </select>
              </label>
              <label>
                <span>Anmeldestatus</span>
                <select v-model="editForm.anmeldestatus">
                  <option v-for="option in anmeldestatusEditOptions" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
              <label>
                <span>LE</span>
                <select v-model="editForm.foerderbedarf">
                  <option value="0">Nein</option>
                  <option value="1">Ja</option>
                </select>
              </label>
              <label>
                <span>ZD</span>
                <select v-model="editForm.zieldifferent">
                  <option value="0">Nein</option>
                  <option value="1">Ja</option>
                </select>
              </label>
              <label>
                <span>Strasse</span>
                <input v-model="editForm.strasse" type="text" />
              </label>
              <label>
                <span>PLZ</span>
                <input v-model="editForm.plz" type="text" />
              </label>
              <label class="edit-form-full">
                <span>Ort</span>
                <input v-model="editForm.ort" type="text" />
              </label>
              <label class="edit-form-full">
                <span>Bemerkung</span>
                <textarea v-model="editForm.bemerkung" rows="4"></textarea>
              </label>
            </div>
          </div>

          <div class="case-dialog-actions">
            <button type="button" class="btn-secondary" :disabled="editDialogSaving" @click="closeEditDialog">Abbrechen</button>
            <button type="button" class="btn-primary" :disabled="editDialogSaving" @click="saveEditDialog">
              {{ editDialogSaving ? "Speichere..." : "Speichern" }}
            </button>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.abgleich-view {
  display: grid;
  gap: 18px;
}

.abgleich-toolbar,
.filter-card,
.summary-card,
.table-card {
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background:
    radial-gradient(circle at top right, rgba(143, 187, 233, 0.16), transparent 34%),
    linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-shadow: 0 18px 42px rgba(19, 54, 102, 0.08);
}

.abgleich-toolbar,
.summary-card,
.table-card {
  padding: 18px;
}

.abgleich-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: end;
  flex-wrap: wrap;
}

.abgleich-eyebrow,
.section-eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #6680a3;
}

.abgleich-toolbar h2,
.section-head h3 {
  margin: 0;
  color: #17385f;
}

.abgleich-intro {
  margin: 8px 0 0;
  color: #4a607e;
  max-width: 70ch;
  line-height: 1.55;
}

.filter-card {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 10px;
  padding: 12px;
}

.filter-field {
  display: grid;
  gap: 4px;
  flex: 0 0 150px;
}

.search-field {
  flex: 0 0 190px;
  min-width: 190px;
}

.filter-field-school {
  flex-basis: 190px;
}

.filter-field-status {
  flex-basis: 150px;
}

.filter-field-compact {
  flex-basis: 150px;
}

.filter-field span,
.metric-card span,
.summary-context,
.table-count {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6680a3;
}

.filter-field input,
.filter-field select {
  border: 1px solid #dbe4f0;
  border-radius: 10px;
  padding: 7px 10px;
  background: #fff;
  color: #17385f;
  font-size: 13px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.summary-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
}

.section-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.metric-card {
  padding: 8px 10px;
  border: 1px solid #cfe0f5;
  border-radius: 14px;
  background: linear-gradient(180deg, #f7fbff 0%, #eef5ff 100%);
  display: grid;
  gap: 4px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.metric-card strong {
  font-size: 20px;
  line-height: 1;
  color: #17385f;
}

.metric-card-alert {
  border-color: #f3c7c7;
  background: linear-gradient(180deg, #fff7f7 0%, #fdecec 100%);
}

.metric-card-alert span,
.metric-card-alert strong {
  color: #b42318;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid #e5edf6;
  border-radius: 16px;
  background: #fff;
}

.detail-table-wrap {
  max-height: 620px;
  overflow: auto;
}

.overview-table,
.detail-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 980px;
  font-size: 14px;
}

.overview-table th,
.overview-table td,
.detail-table th,
.detail-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e5edf6;
  text-align: left;
  vertical-align: middle;
}

.overview-table th,
.overview-table td {
  padding: 6px 10px;
  line-height: 1.2;
}

.detail-table th,
.detail-table td {
  padding: 6px 10px;
  line-height: 1.2;
}

.overview-table th,
.detail-table th {
  background: #f8fbff;
  color: #5a7393;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.detail-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
}

.detail-table th button {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.case-action-cell {
  text-align: center;
  white-space: nowrap;
}

.case-icon-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid #d7e2ef;
  background: #eef4fd;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.case-icon-btn i {
  font-size: 14px;
}

.case-icon-btn-idle {
  color: #a5b4c8;
  background: #eef4fd;
}

.case-icon-btn-active {
  color: #b42318;
  border-color: #f2c2c2;
  background: #fff1f1;
}

.case-icon-btn-edit {
  color: #1459a8;
  background: #eef4fd;
}

.case-count-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  border-radius: 999px;
  background: #b42318;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 15px;
}

.cell-duplicate-name {
  background: #fee2e2;
}

.overview-table tbody tr.overview-row-has-capacity td {
  background: rgba(22, 101, 52, 0.06);
}

.overview-table tbody tr.overview-row-outside-procedure td {
  background: #fdecec;
  color: #8f1d14;
}

.table-empty {
  text-align: center;
  color: #6b7f99;
  padding: 24px 12px;
}

.btn-secondary {
  border-radius: 999px;
  padding: 10px 16px;
  font-weight: 700;
  border: 0;
  background: #eef4fd;
  color: #17385f;
}

.btn-refresh {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 11px 18px;
  border: 1px solid #c9daf1;
  background: linear-gradient(180deg, #f8fbff 0%, #e7f0fb 100%);
  color: #1459a8;
  box-shadow: 0 10px 22px rgba(20, 89, 168, 0.12);
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease,
    color 0.16s ease;
}

.btn-refresh:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: #9cbce3;
  background: linear-gradient(180deg, #ffffff 0%, #dfeafb 100%);
  box-shadow: 0 14px 28px rgba(20, 89, 168, 0.16);
}

.btn-refresh:focus-visible {
  outline: 3px solid rgba(20, 89, 168, 0.18);
  outline-offset: 2px;
}

.btn-refresh:disabled {
  cursor: wait;
  opacity: 0.78;
  transform: none;
  box-shadow: none;
}

.btn-refresh-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: rgba(20, 89, 168, 0.1);
  font-size: 13px;
  line-height: 1;
}

.btn-primary {
  border-radius: 999px;
  padding: 10px 16px;
  font-weight: 700;
  border: 0;
  background: #17385f;
  color: #fff;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.status-badge-le {
  background: #e9f6ec;
  color: #21653a;
}

.status-badge-zd {
  background: #e8f1ff;
  color: #1d4f91;
}

.status-badge-positive {
  background: #e9f6ec;
  color: #21653a;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 24px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.status-chip-positive {
  background: #e9f6ec;
  color: #21653a;
}

.status-chip-info {
  background: #e7f0ff;
  color: #1d4ed8;
}

.status-chip-negative {
  background: #fdecec;
  color: #b42318;
}

.status-chip-waiting {
  background: #fff4e5;
  color: #9a5b00;
}

.status-chip-muted {
  background: #eef2f7;
  color: #6b7f99;
}

.status-chip-nowrap {
  white-space: nowrap;
}

.feedback-panel-warning {
  border: 1px solid #d9d9c8;
  background: #fffdf3;
}

.feedback-panel-success {
  border: 1px solid #b7e3c6;
  background: #f2fbf5;
  color: #21653a;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 220;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.38);
}

.case-dialog {
  width: min(560px, 100%);
  display: grid;
  gap: 18px;
  padding: 22px;
  border: 1px solid #dbe4f0;
  border-radius: 24px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  box-shadow: 0 24px 60px rgba(19, 54, 102, 0.2);
}

.case-dialog-edit {
  width: min(920px, 100%);
  max-height: calc(100vh - 40px);
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.case-dialog-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.case-dialog-head h3 {
  margin: 0;
  color: #17385f;
}

.case-dialog-student {
  margin: 8px 0 0;
  color: #4a607e;
  font-weight: 600;
}

.case-dialog-close {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 12px;
  background: #eef4fd;
  color: #17385f;
  font-size: 24px;
  line-height: 1;
}

.case-dialog-body {
  display: grid;
  gap: 14px;
}

.case-dialog-body-edit {
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.edit-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 14px;
}

.edit-form-grid label {
  display: grid;
  gap: 5px;
}

.edit-form-grid span {
  color: #5a7393;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.edit-form-grid input,
.edit-form-grid select,
.edit-form-grid textarea {
  width: 100%;
  min-height: 38px;
  border: 1px solid #d7e2ef;
  border-radius: 10px;
  padding: 8px 10px;
  background: #fff;
  color: #17385f;
  font-size: 13px;
  font: inherit;
}

.edit-form-grid textarea {
  min-height: 96px;
  resize: vertical;
}

.edit-form-full {
  grid-column: 1 / -1;
}

.case-dialog-note textarea {
  min-height: 130px;
  padding: 10px 12px;
  border: 1px solid #dbe4f0;
  border-radius: 12px;
  background: #fff;
  color: #17385f;
  font: inherit;
  resize: vertical;
}

.case-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .abgleich-toolbar,
  .section-head {
    flex-direction: column;
    align-items: start;
  }

  .filter-card {
    display: grid;
    grid-template-columns: 1fr;
  }

  .filter-field,
  .search-field,
  .filter-field-school,
  .filter-field-status,
  .filter-field-compact {
    min-width: 0;
    flex-basis: auto;
  }

  .edit-form-grid {
    grid-template-columns: 1fr;
  }
}

.overview-table tbody tr {
  transition: background-color 0.15s ease;
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

.overview-table tbody tr:hover td {
  background-color: #dbeafe;
}
.overview-table tbody tr.overview-row-outside-procedure:hover td {
  background-color: #f9d7d7;
}
.overview-table tbody tr:hover {
  box-shadow: inset 0 1px 0 #93c5fd, inset 0 -1px 0 #93c5fd;
}
.overview-table tbody tr.overview-row-selected td {
  background-color: #dbeaf8 !important;
  font-weight: 600;
}
</style>
