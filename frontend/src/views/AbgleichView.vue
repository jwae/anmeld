<script setup lang="ts">
import { computed, ref, watch } from "vue";
import abgleichService from "../services/abgleichService";

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
  schule: string;
  schulnummer: string;
  schueler_schul_id: string;
  abgleich_status: string;
  anmeldestatus: string;
};

type SummaryStats = {
  gesamt: number;
  schulen: number;
  neuaufnahme: number;
  warteliste: number;
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

const search = ref("");
const schuleFilter = ref("alle");
const anmeldestatusFilter = ref("alle");
const foerderbedarfFilter = ref("alle");
const zieldifferentFilter = ref("alle");
const herkunftFilter = ref("alle");
const sortKey = ref<keyof SchuelerRow>("nachname");
const sortDirection = ref<"asc" | "desc">("asc");

function createEmptySummary(): SummaryStats {
  return {
    gesamt: 0,
    schulen: 0,
    neuaufnahme: 0,
    warteliste: 0,
    abgelehnt: 0,
    ohne: 0,
    foerderbedarf: 0,
    zieldifferent: 0,
  };
}

const summary = ref<SummaryStats>(createEmptySummary());
const anmeldestatusOptions = ["Neuaufnahme", "Warteliste", "Zugewiesen", "Abgelehnt", "Ohne", "Zugeordnet"];

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStatus(value: unknown) {
  return normalizeText(value) || "Ohne";
}

function displayHerkunft(row: SchuelerRow) {
  return normalizeText(row.herkunft) || "-";
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
const herkunftOptions = computed(() => uniqueOptions((row) => displayHerkunft(row)));

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
    if (anmeldestatusFilter.value !== "alle" && normalizeStatus(row.anmeldestatus) !== anmeldestatusFilter.value) return false;
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
    const a = left[sortKey.value];
    const b = right[sortKey.value];
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

function setSort(nextKey: keyof SchuelerRow) {
  if (sortKey.value === nextKey) {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
    return;
  }
  sortKey.value = nextKey;
  sortDirection.value = "asc";
}

function sortMarker(key: keyof SchuelerRow) {
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
    summary.value = createEmptySummary();
    return;
  }

  try {
    loading.value = true;
    errorMessage.value = "";
    const response = await abgleichService.getSchuelerUebersicht(props.verfahrenId, props.rundeId, props.token);
    schuelerRows.value = Array.isArray(response?.rows) ? response.rows : [];
    schoolOverviewRows.value = Array.isArray(response?.schoolOverview) ? response.schoolOverview : [];
    summary.value = {
      ...createEmptySummary(),
      ...(response?.summary || {}),
    };
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Die Abgleichsansicht konnte nicht geladen werden.";
    schuelerRows.value = [];
    schoolOverviewRows.value = [];
    summary.value = createEmptySummary();
  } finally {
    loading.value = false;
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
        <p class="abgleich-intro">
          Die Ansicht arbeitet mit den Schuelereintraegen des aktuellen Verfahrens und der aktuellen Runde und zeigt Zusammenfassung, Schulen und Detaildaten in einer Seite.
        </p>
      </div>
      <button class="btn-secondary" type="button" @click="loadData" :disabled="loading">
        {{ loading ? "Aktualisiere..." : "Aktualisieren" }}
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
            <p class="section-eyebrow">1</p>
            <h3>Zusammenfassung</h3>
          </div>
          <span class="summary-context">{{ context.verfahren }} | {{ context.runde }} | Datenquelle: anm_schueler</span>
        </div>
        <div class="summary-grid">
          <div class="metric-card"><span>Schueler gesamt</span><strong>{{ summary.gesamt }}</strong></div>
          <div class="metric-card"><span>Schulen</span><strong>{{ summary.schulen }}</strong></div>
          <div class="metric-card"><span>Neuaufnahme</span><strong>{{ summary.neuaufnahme }}</strong></div>
          <div class="metric-card"><span>Warteliste</span><strong>{{ summary.warteliste }}</strong></div>
          <div class="metric-card metric-card-alert"><span>Ohne Anmeldung</span><strong>{{ summary.ohne }}</strong></div>
          <div class="metric-card"><span>Foerderbedarf</span><strong>{{ summary.foerderbedarf }}</strong></div>
          <div class="metric-card"><span>Zieldifferent</span><strong>{{ summary.zieldifferent }}</strong></div>
        </div>
      </section>

      <section class="filter-card">
        <label class="filter-field search-field">
          <span>Schuelername</span>
          <input v-model="search" type="search" placeholder="Nachname oder Vorname" />
        </label>
        <label class="filter-field filter-field-school">
          <span>Schule</span>
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
            <p class="section-eyebrow">2</p>
            <h3>Uebersicht Anmeldungen</h3>
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

      <section class="table-card">
        <div class="section-head">
          <div>
            <p class="section-eyebrow">3</p>
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
                <th><button type="button" @click="setSort('nachname')">Name + Vorname{{ sortMarker('nachname') }}</button></th>
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
                <td colspan="12" class="table-empty">Daten werden geladen...</td>
              </tr>
              <tr v-else-if="!sortedRows.length">
                <td colspan="12" class="table-empty">Keine Schueler fuer die aktuellen Filter gefunden.</td>
              </tr>
              <tr v-for="(row, index) in sortedRows" :key="`${row.schueler_id}-${row.schueler_schul_id}-${row.schulnummer}-${index}`">
                <td>{{ index + 1 }}</td>
                <td>{{ row.schueler_schul_id || "-" }}</td>
                <td
                  :class="{ 'cell-duplicate-name': hasDuplicateNameBirth(row) }"
                  :title="hasDuplicateNameBirth(row) ? 'Name und Geburtsdatum kommen mehrfach vor' : ''"
                >{{ [row.nachname, row.vorname].filter(Boolean).join(", ") || "-" }}</td>
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
                <td>{{ row.schulnummer || "---" }}</td>
                <td>{{ row.schule }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
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

.cell-duplicate-name {
  background: #fee2e2;
}

.overview-table tbody tr.overview-row-has-capacity td {
  background: rgba(22, 101, 52, 0.06);
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

.feedback-panel-warning {
  border: 1px solid #d9d9c8;
  background: #fffdf3;
}

.feedback-panel-success {
  border: 1px solid #b7e3c6;
  background: #f2fbf5;
  color: #21653a;
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
}

.overview-table tbody tr {
  transition: background-color 0.15s ease;
}
.overview-table tbody tr:hover td {
  background-color: #f1f5f9;
}
.overview-table tbody tr.overview-row-selected td {
  background-color: #dbeaf8 !important;
  font-weight: 600;
}
</style>
