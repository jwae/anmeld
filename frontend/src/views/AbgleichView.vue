<script setup lang="ts">
import { computed, ref, watch } from "vue";
import abgleichService from "../services/abgleichService";

type SchuelerRow = {
  schueler_id: number | string;
  vorname: string;
  nachname: string;
  geburtsdatum: string | null;
  foerderbedarf: string;
  zieldifferent: number | string;
  quelle: string;
  herkunft?: string;
  schule: string;
  schulnummer: string;
  schueler_schul_id: string;
  abgleich_status: string;
  anmeldestatus: string;
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
const errorMessage = ref("");
const schuelerRows = ref<SchuelerRow[]>([]);

const search = ref("");
const schuleFilter = ref("alle");
const anmeldestatusFilter = ref("alle");
const foerderbedarfFilter = ref("alle");
const zieldifferentFilter = ref("alle");
const herkunftFilter = ref("alle");
const sortKey = ref<keyof SchuelerRow>("nachname");
const sortDirection = ref<"asc" | "desc">("asc");

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStatus(value: unknown) {
  return normalizeText(value) || "Ohne";
}

function displayHerkunft(row: SchuelerRow) {
  return normalizeText(row.herkunft) || normalizeText(row.quelle) || "-";
}

function hasPositiveFoerderbedarf(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  return ["1", "true", "ja", "yes"].includes(text) || text.length > 0;
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
const anmeldestatusOptions = computed(() => uniqueOptions((row) => normalizeStatus(row.anmeldestatus)));
const foerderbedarfOptions = computed(() => uniqueOptions((row) => row.foerderbedarf));
const herkunftOptions = computed(() => uniqueOptions((row) => displayHerkunft(row)));

const filteredRows = computed(() => {
  const searchText = normalizeText(search.value).toLowerCase();

  return schuelerRows.value.filter((row) => {
    const fullName = `${normalizeText(row.nachname)} ${normalizeText(row.vorname)}`.toLowerCase();
    if (searchText && !fullName.includes(searchText)) return false;
    if (schuleFilter.value !== "alle" && normalizeText(row.schule) !== schuleFilter.value) return false;
    if (anmeldestatusFilter.value !== "alle" && normalizeStatus(row.anmeldestatus) !== anmeldestatusFilter.value) return false;
    if (foerderbedarfFilter.value !== "alle" && normalizeText(row.foerderbedarf) !== foerderbedarfFilter.value) return false;
    if (herkunftFilter.value !== "alle" && displayHerkunft(row) !== herkunftFilter.value) return false;
    if (zieldifferentFilter.value === "ja" && !isZieldifferent(row.zieldifferent)) return false;
    if (zieldifferentFilter.value === "nein" && isZieldifferent(row.zieldifferent)) return false;
    return true;
  });
});

const summary = computed(() => {
  const rows = filteredRows.value;
  return {
    gesamt: rows.length,
    schulen: new Set(rows.map((row) => normalizeText(row.schule)).filter(Boolean)).size,
    neuaufnahme: rows.filter((row) => normalizeStatus(row.anmeldestatus) === "Neuaufnahme").length,
    warteliste: rows.filter((row) => normalizeStatus(row.anmeldestatus) === "Warteliste").length,
    abgelehnt: rows.filter((row) => normalizeStatus(row.anmeldestatus) === "Abgelehnt").length,
    ohne: rows.filter((row) => normalizeStatus(row.anmeldestatus) === "Ohne").length,
    foerderbedarf: rows.filter((row) => hasPositiveFoerderbedarf(row.foerderbedarf)).length,
    zieldifferent: rows.filter((row) => isZieldifferent(row.zieldifferent)).length,
  };
});

const schoolOverview = computed(() => {
  const grouped = new Map<string, {
    schulnummer: string;
    schule: string;
    gesamt: number;
    neuaufnahme: number;
    warteliste: number;
    abgelehnt: number;
    ohne: number;
    foerderbedarf: number;
    zieldifferent: number;
  }>();

  for (const row of filteredRows.value) {
    const key = normalizeText(row.schule) || normalizeText(row.schulnummer) || "Ohne Schule";
    if (!grouped.has(key)) {
      grouped.set(key, {
        schulnummer: normalizeText(row.schulnummer),
        schule: normalizeText(row.schule) || "Ohne Schule",
        gesamt: 0,
        neuaufnahme: 0,
        warteliste: 0,
        abgelehnt: 0,
        ohne: 0,
        foerderbedarf: 0,
        zieldifferent: 0,
      });
    }

    const entry = grouped.get(key)!;
    const status = normalizeStatus(row.anmeldestatus);
    entry.gesamt += 1;
    if (status === "Neuaufnahme") entry.neuaufnahme += 1;
    if (status === "Warteliste") entry.warteliste += 1;
    if (status === "Abgelehnt") entry.abgelehnt += 1;
    if (status === "Ohne") entry.ohne += 1;
    if (hasPositiveFoerderbedarf(row.foerderbedarf)) entry.foerderbedarf += 1;
    if (isZieldifferent(row.zieldifferent)) entry.zieldifferent += 1;
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.schule.localeCompare(b.schule, "de", { sensitivity: "base" }),
  );
});

const sortedRows = computed(() => {
  const factor = sortDirection.value === "asc" ? 1 : -1;
  return [...filteredRows.value].sort((left, right) => {
    const a = left[sortKey.value];
    const b = right[sortKey.value];
    return String(a ?? "").localeCompare(String(b ?? ""), "de", { numeric: true, sensitivity: "base" }) * factor;
  });
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

async function loadData() {
  if (!props.verfahrenId || !props.rundeId) {
    schuelerRows.value = [];
    return;
  }

  try {
    loading.value = true;
    errorMessage.value = "";
    const response = await abgleichService.getSchuelerUebersicht(props.verfahrenId, props.rundeId, props.token);
    schuelerRows.value = Array.isArray(response?.rows) ? response.rows : [];
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Die Abgleichsansicht konnte nicht geladen werden.";
    schuelerRows.value = [];
  } finally {
    loading.value = false;
  }
}

watch(() => [props.verfahrenId, props.rundeId], () => {
  loadData();
}, { immediate: true });
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
      <section class="filter-card">
        <label class="filter-field search-field">
          <span>Schuelername</span>
          <input v-model="search" type="search" placeholder="Nachname oder Vorname" />
        </label>
        <label class="filter-field">
          <span>Schule</span>
          <select v-model="schuleFilter">
            <option value="alle">Alle</option>
            <option v-for="option in schuleOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label class="filter-field">
          <span>Anmeldestatus</span>
          <select v-model="anmeldestatusFilter">
            <option value="alle">Alle</option>
            <option v-for="option in anmeldestatusOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label class="filter-field">
          <span>Foerderbedarf</span>
          <select v-model="foerderbedarfFilter">
            <option value="alle">Alle</option>
            <option v-for="option in foerderbedarfOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label class="filter-field">
          <span>Zieldifferent</span>
          <select v-model="zieldifferentFilter">
            <option value="alle">Alle</option>
            <option value="ja">Ja</option>
            <option value="nein">Nein</option>
          </select>
        </label>
        <label class="filter-field">
          <span>Herkunft</span>
          <select v-model="herkunftFilter">
            <option value="alle">Alle</option>
            <option v-for="option in herkunftOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
      </section>

      <section class="summary-card">
        <div class="section-head">
          <div>
            <p class="section-eyebrow">1</p>
            <h3>Summary</h3>
          </div>
          <span class="summary-context">{{ context.verfahren }} · {{ context.runde }}</span>
        </div>
        <div class="summary-grid">
          <div class="metric-card"><span>Schueler gesamt</span><strong>{{ summary.gesamt }}</strong></div>
          <div class="metric-card"><span>Schulen</span><strong>{{ summary.schulen }}</strong></div>
          <div class="metric-card"><span>Neuaufnahme</span><strong>{{ summary.neuaufnahme }}</strong></div>
          <div class="metric-card"><span>Warteliste</span><strong>{{ summary.warteliste }}</strong></div>
          <div class="metric-card"><span>Abgelehnt</span><strong>{{ summary.abgelehnt }}</strong></div>
          <div class="metric-card"><span>Ohne</span><strong>{{ summary.ohne }}</strong></div>
          <div class="metric-card"><span>Foerderbedarf</span><strong>{{ summary.foerderbedarf }}</strong></div>
          <div class="metric-card"><span>Zieldifferent</span><strong>{{ summary.zieldifferent }}</strong></div>
        </div>
      </section>

      <section class="table-card">
        <div class="section-head">
          <div>
            <p class="section-eyebrow">2</p>
            <h3>School Overview</h3>
          </div>
          <span class="table-count">{{ schoolOverview.length }} Schulen</span>
        </div>
        <div class="table-wrap">
          <table class="overview-table">
            <thead>
              <tr>
                <th>Schul-Nr</th>
                <th>Schule</th>
                <th>Gesamt</th>
                <th>Neuaufnahme</th>
                <th>Warteliste</th>
                <th>Abgelehnt</th>
                <th>Ohne</th>
                <th>Foerderbedarf</th>
                <th>Zieldifferent</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="9" class="table-empty">Daten werden geladen...</td>
              </tr>
              <tr v-else-if="!schoolOverview.length">
                <td colspan="9" class="table-empty">Keine Schulen fuer die aktuellen Filter gefunden.</td>
              </tr>
              <tr v-for="row in schoolOverview" :key="`${row.schulnummer}-${row.schule}`">
                <td>{{ row.schulnummer || "-" }}</td>
                <td>{{ row.schule }}</td>
                <td>{{ row.gesamt }}</td>
                <td>{{ row.neuaufnahme }}</td>
                <td>{{ row.warteliste }}</td>
                <td>{{ row.abgelehnt }}</td>
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
            <h3>Detailed Student Table</h3>
          </div>
          <span class="table-count">{{ sortedRows.length }} Treffer</span>
        </div>
        <div class="table-wrap">
          <table class="detail-table">
            <thead>
              <tr>
                <th><button type="button" @click="setSort('schulnummer')">Schul-Nr{{ sortMarker('schulnummer') }}</button></th>
                <th><button type="button" @click="setSort('schule')">Schule{{ sortMarker('schule') }}</button></th>
                <th><button type="button" @click="setSort('schueler_schul_id')">Schueler-ID{{ sortMarker('schueler_schul_id') }}</button></th>
                <th><button type="button" @click="setSort('nachname')">Nachname{{ sortMarker('nachname') }}</button></th>
                <th><button type="button" @click="setSort('vorname')">Vorname{{ sortMarker('vorname') }}</button></th>
                <th><button type="button" @click="setSort('geburtsdatum')">Geburtsdatum{{ sortMarker('geburtsdatum') }}</button></th>
                <th><button type="button" @click="setSort('foerderbedarf')">Foerderbedarf{{ sortMarker('foerderbedarf') }}</button></th>
                <th>Zieldifferent</th>
                <th><button type="button" @click="setSort('anmeldestatus')">Anmeldestatus{{ sortMarker('anmeldestatus') }}</button></th>
                <th><button type="button" @click="setSort('abgleich_status')">Abgleichstatus{{ sortMarker('abgleich_status') }}</button></th>
                <th>Herkunft</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="11" class="table-empty">Daten werden geladen...</td>
              </tr>
              <tr v-else-if="!sortedRows.length">
                <td colspan="11" class="table-empty">Keine Schueler fuer die aktuellen Filter gefunden.</td>
              </tr>
              <tr v-for="row in sortedRows" :key="`${row.schueler_id}-${row.schueler_schul_id}-${row.schulnummer}`">
                <td>{{ row.schulnummer || "-" }}</td>
                <td>{{ row.schule || "-" }}</td>
                <td>{{ row.schueler_schul_id || "-" }}</td>
                <td>{{ row.nachname || "-" }}</td>
                <td>{{ row.vorname || "-" }}</td>
                <td>{{ formatDate(row.geburtsdatum) }}</td>
                <td>{{ row.foerderbedarf || "-" }}</td>
                <td>{{ isZieldifferent(row.zieldifferent) ? "Ja" : "Nein" }}</td>
                <td>{{ normalizeStatus(row.anmeldestatus) }}</td>
                <td>{{ row.abgleich_status || "-" }}</td>
                <td>{{ displayHerkunft(row) }}</td>
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
  display: grid;
  gap: 14px;
  padding: 18px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.filter-field {
  display: grid;
  gap: 6px;
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
  border-radius: 12px;
  padding: 10px 12px;
  background: #fff;
  color: #17385f;
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
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.metric-card {
  padding: 14px 16px;
  border: 1px solid #dbe4f0;
  border-radius: 16px;
  background: #fff;
  display: grid;
  gap: 8px;
}

.metric-card strong {
  font-size: 28px;
  line-height: 1;
  color: #17385f;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid #e5edf6;
  border-radius: 16px;
  background: #fff;
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
.detail-table th {
  background: #f8fbff;
  color: #5a7393;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.detail-table th button {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
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

.feedback-panel-warning {
  border: 1px solid #d9d9c8;
  background: #fffdf3;
}

@media (max-width: 900px) {
  .abgleich-toolbar,
  .section-head {
    flex-direction: column;
    align-items: start;
  }

  .filter-card {
    grid-template-columns: 1fr;
  }
}
</style>
