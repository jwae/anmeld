<script setup lang="ts">
import { computed, ref } from "vue";

type SchuelerRow = {
  schueler_id: number;
  vorname: string;
  nachname: string;
  geburtsdatum: string | null;
  foerderbedarf: string;
  zieldifferent: number;
  empfehlung: string;
  quelle: string;
  schule: string;
  ort: string;
  schulnummer: string;
  schueler_schul_id: string;
  abgleich_status: string;
  anmeldestatus: string;
  fallgrund: string;
  fallstatus: string;
  zugewiesene_schule: string;
  notiz: string;
};

const props = defineProps<{
  rows: SchuelerRow[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: "refresh"): void;
  (e: "inspect", row: SchuelerRow): void;
}>();

const search = ref("");
const anmeldestatusFilter = ref("alle");
const fallstatusFilter = ref("alle");
const schuleFilter = ref("alle");
const foerderbedarfFilter = ref("alle");
const zieldifferentFilter = ref("alle");
const quelleFilter = ref("alle");
const sortKey = ref<keyof SchuelerRow>("nachname");
const sortDirection = ref<"asc" | "desc">("asc");

function uniqueOptions<K extends keyof SchuelerRow>(key: K) {
  return Array.from(new Set(props.rows.map((row) => String(row[key] || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "de", { sensitivity: "base" }),
  );
}

const anmeldestatusOptions = computed(() => uniqueOptions("anmeldestatus"));
const fallstatusOptions = computed(() => uniqueOptions("fallstatus"));
const schuleOptions = computed(() => uniqueOptions("schule"));
const foerderbedarfOptions = computed(() => uniqueOptions("foerderbedarf"));
const quelleOptions = computed(() => uniqueOptions("quelle"));

const filteredRows = computed(() => {
  const searchText = search.value.trim().toLowerCase();
  return props.rows.filter((row) => {
    const fullName = `${row.nachname} ${row.vorname}`.toLowerCase();
    if (searchText && !fullName.includes(searchText)) return false;
    if (anmeldestatusFilter.value !== "alle" && row.anmeldestatus !== anmeldestatusFilter.value) return false;
    if (fallstatusFilter.value !== "alle" && row.fallstatus !== fallstatusFilter.value) return false;
    if (schuleFilter.value !== "alle" && row.schule !== schuleFilter.value) return false;
    if (foerderbedarfFilter.value !== "alle" && row.foerderbedarf !== foerderbedarfFilter.value) return false;
    if (quelleFilter.value !== "alle" && row.quelle !== quelleFilter.value) return false;
    if (zieldifferentFilter.value === "ja" && Number(row.zieldifferent || 0) !== 1) return false;
    if (zieldifferentFilter.value === "nein" && Number(row.zieldifferent || 0) !== 0) return false;
    return true;
  });
});

const sortedRows = computed(() => {
  const factor = sortDirection.value === "asc" ? 1 : -1;
  return [...filteredRows.value].sort((left, right) => {
    const a = left[sortKey.value];
    const b = right[sortKey.value];
    if (typeof a === "number" && typeof b === "number") return (a - b) * factor;
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

function getStatusClass(status: string) {
  const s = String(status || "").toUpperCase().trim();
  if (s === "NEUAUFNAHME" || s === "NEUAUFNAHMEN") return "badge-success";
  if (s === "ZUGEORDNET" || s === "ZUGEWIESEN") return "badge-primary";
  if (s === "WARTELISTE") return "badge-warning";
  if (s === "OHNE ANMELDUNG") return "badge-danger";
  if (s === "ABLEHNUNG" || s === "ABLEHNUNGEN") return "badge-danger";
  return "badge-neutral";
}

function displayAnmeldestatus(row: SchuelerRow) {
  const status = String(row.anmeldestatus || "").trim();
  if (status) return status;
  if (String(row.abgleich_status || "").trim().toUpperCase() === "NUR_POOL") {
    return "OHNE ANMELDUNG";
  }
  return "";
}

function getQuelleClass(quelle: string) {
  const q = String(quelle || "").toUpperCase().trim();
  if (q.includes("ZUZUG")) return "badge-danger";
  if (q.includes("POOL")) return "badge-warning";
  if (q.includes("IMPORT")) return "badge-info";
  if (q.includes("MANUELL") || q.includes("MANUAL")) return "badge-primary";
  return "badge-neutral";
}

function truncate(val: string, max: number = 15) {
  if (!val) return "-";
  return val.length > max ? val.substring(0, max - 3) + "..." : val;
}

function formatDate(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-");
    return `${day}.${month}.${year}`;
  }
  return text;
}

function isPositiveFlag(value: string | number | null | undefined) {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "ja";
}
</script>

<template>
  <section class="schueler-table-card">
    <div class="schueler-table-head">
      <div>
        <p class="schueler-table-eyebrow">Schuelerfaelle</p>
        <h3>Detailansicht aller relevanten Schueler im Verfahren</h3>
      </div>
      <button class="btn-secondary" type="button" @click="emit('refresh')" :disabled="loading">
        {{ loading ? "Aktualisiere..." : "Aktualisieren" }}
      </button>
    </div>

    <div class="schueler-filter-bar">
      <label class="search-field">
        <span>Schueler suchen</span>
        <input v-model="search" type="search" placeholder="Nachname oder Vorname" />
      </label>
      <label>
        <span>Anmeldestatus</span>
        <select v-model="anmeldestatusFilter">
          <option value="alle">Alle</option>
          <option v-for="option in anmeldestatusOptions" :key="option" :value="option">{{ option }}</option>
        </select>
      </label>
      <label>
        <span>Fallstatus</span>
        <select v-model="fallstatusFilter">
          <option value="alle">Alle</option>
          <option v-for="option in fallstatusOptions" :key="option" :value="option">{{ option }}</option>
        </select>
      </label>
      <label>
        <span>Schule</span>
        <select v-model="schuleFilter">
          <option value="alle">Alle</option>
          <option v-for="option in schuleOptions" :key="option" :value="option">{{ option }}</option>
        </select>
      </label>
      <label>
        <span>Foerderbedarf</span>
        <select v-model="foerderbedarfFilter">
          <option value="alle">Alle</option>
          <option v-for="option in foerderbedarfOptions" :key="option" :value="option">{{ option }}</option>
        </select>
      </label>
      <label>
        <span>Zieldifferent</span>
        <select v-model="zieldifferentFilter">
          <option value="alle">Alle</option>
          <option value="ja">Ja</option>
          <option value="nein">Nein</option>
        </select>
      </label>
      <label>
        <span>Quelle</span>
        <select v-model="quelleFilter">
          <option value="alle">Alle</option>
          <option v-for="option in quelleOptions" :key="option" :value="option">{{ option }}</option>
        </select>
      </label>
      <div class="schueler-filter-count" aria-live="polite">
        <span>Treffer</span>
        <strong>{{ sortedRows.length }}</strong>
      </div>
    </div>

    <div class="table-wrap">
      <table class="schueler-table">
        <thead>
          <tr>
            <th>Nr.</th>
            <th><button type="button" @click="setSort('schulnummer')">Schulnr{{ sortMarker('schulnummer') }}</button></th>
            <th><button type="button" @click="setSort('schule')">Schule{{ sortMarker('schule') }}</button></th>
            <th><button type="button" @click="setSort('ort')">Ort{{ sortMarker('ort') }}</button></th>
            <th><button type="button" @click="setSort('schueler_schul_id')">ID{{ sortMarker('schueler_schul_id') }}</button></th>
            <th><button type="button" @click="setSort('nachname')">Name{{ sortMarker('nachname') }}</button></th>
            <th><button type="button" @click="setSort('vorname')">Vorname{{ sortMarker('vorname') }}</button></th>
            <th><button type="button" @click="setSort('geburtsdatum')">Geburtsdatum{{ sortMarker('geburtsdatum') }}</button></th>
            <th>
              <button type="button" @click="setSort('foerderbedarf')" title="SuS mit Foerderbedarf" aria-label="SuS mit Foerderbedarf">
                LE{{ sortMarker('foerderbedarf') }}
              </button>
            </th>
            <th>
              <button type="button" @click="setSort('zieldifferent')" title="Zieldifferent" aria-label="Zieldifferent">
                ZD{{ sortMarker('zieldifferent') }}
              </button>
            </th>
            <th><button type="button" @click="setSort('quelle')">Quelle{{ sortMarker('quelle') }}</button></th>
            <th><button type="button" @click="setSort('anmeldestatus')">Anmeldestatus{{ sortMarker('anmeldestatus') }}</button></th>
            <th class="schueler-actions-col">Aktion</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="13" class="schueler-empty">Daten werden geladen...</td>
          </tr>
          <tr v-else-if="!sortedRows.length">
            <td colspan="13" class="schueler-empty">Keine Schueler fuer die aktuellen Filter gefunden.</td>
          </tr>
          <tr v-for="(row, index) in sortedRows" :key="`${row.schueler_id}-${row.schueler_schul_id}-${row.schulnummer}`">
            <td>{{ index + 1 }}</td>
            <td>{{ row.schulnummer || "-" }}</td>
            <td :title="row.schule || undefined">{{ truncate(row.schule, 20) }}</td>
            <td>{{ row.ort || "-" }}</td>
            <td>{{ row.schueler_schul_id || "-" }}</td>
            <td>{{ row.nachname || "-" }}</td>
            <td>{{ row.vorname || "-" }}</td>
            <td>{{ formatDate(row.geburtsdatum) }}</td>
            <td>
              <span v-if="isPositiveFlag(row.foerderbedarf)" class="badge badge-info">Ja</span>
            </td>
            <td>
              <span v-if="Number(row.zieldifferent || 0) === 1" class="badge badge-info">Ja</span>
            </td>
            <td>
              <span v-if="row.quelle" :class="['badge', getQuelleClass(row.quelle)]">
                {{ row.quelle }}
              </span>
              <span v-else>-</span>
            </td>
            <td>
              <span v-if="displayAnmeldestatus(row)" :class="['badge', getStatusClass(displayAnmeldestatus(row))]">
                {{ displayAnmeldestatus(row) }}
              </span>
              <span v-else>-</span>
            </td>
            <td class="schueler-actions-cell">
              <button
                class="btn-secondary schueler-icon-btn"
                type="button"
                title="Schuelerdaten anzeigen"
                aria-label="Schuelerdaten anzeigen"
                @click="emit('inspect', row)"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" class="schueler-icon-svg">
                  <path
                    d="M1.5 12s3.8-6.5 10.5-6.5S22.5 12 22.5 12s-3.8 6.5-10.5 6.5S1.5 12 1.5 12Z"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.7"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="3.2"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                  />
                </svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.schueler-table-card {
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background:
    radial-gradient(circle at top right, rgba(143, 187, 233, 0.14), transparent 34%),
    linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-shadow: 0 18px 42px rgba(19, 54, 102, 0.08);
}

.schueler-table-head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  flex-wrap: wrap;
}

.schueler-table-eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #6680a3;
}

.schueler-table-head h3 {
  margin: 0;
  color: #17385f;
}

.schueler-filter-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: end;
}

.schueler-filter-bar label {
  display: grid;
  gap: 4px;
  min-width: 120px;
}

.schueler-filter-bar span {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6680a3;
}

.schueler-filter-bar select,
.schueler-filter-bar input {
  border: 1px solid #c9d8ea;
  border-radius: 10px;
  padding: 7px 9px;
  background: #ffffff;
  color: #17385f;
  font-size: 13px;
}

.search-field {
  min-width: 170px !important;
}

.schueler-filter-count {
  display: grid;
  gap: 4px;
  min-width: 84px;
  padding: 7px 10px;
  border: 1px solid #c9d8ea;
  border-radius: 10px;
  background: linear-gradient(180deg, #f8fbff 0%, #eef4fd 100%);
}

.schueler-filter-count span {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6680a3;
}

.schueler-filter-count strong {
  color: #17385f;
  font-size: 16px;
  line-height: 1;
}

.table-wrap {
  overflow: auto;
  max-height: 540px;
  border: 1px solid #e5edf6;
  border-radius: 16px;
  background: #ffffff;
}

.schueler-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  font-size: 14px;
}

.schueler-table th,
.schueler-table td {
  padding: 2px 7px;
  border-bottom: 1px solid #e5edf6;
  text-align: left;
  vertical-align: middle;
  line-height: 1.05;
  font-size: 13px;
}

.schueler-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fbff;
  padding-top: 8px;
  padding-bottom: 8px;
}

.schueler-table th button {
  border: 0;
  padding: 0;
  background: transparent;
  color: #5a7393;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
}

.schueler-table tbody tr {
  height: 24px;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

.schueler-table tbody tr:hover {
  background: linear-gradient(90deg, #e8f2ff 0%, #f5f9ff 100%);
  box-shadow: inset 3px 0 0 #1f72d8;
}

.schueler-empty {
  padding: 18px 12px;
  color: #5d7390;
}

.schueler-actions-col,
.schueler-actions-cell {
  width: 72px;
  text-align: center;
}

.btn-secondary {
  border-radius: 999px;
  padding: 10px 16px;
  font-weight: 700;
  border: 0;
  background: #eef4fd;
  color: #17385f;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  font-size: 10px;
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

.badge-danger {
  background-color: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

.badge-neutral {
  background-color: #f3f4f6;
  color: #374151;
  border: 1px solid #e5e7eb;
}

.badge-info {
  background-color: #e0f2fe;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.badge-primary {
  background-color: #e0e7ff;
  color: #4338ca;
  border: 1px solid #c7d2fe;
}

.schueler-icon-btn {
  width: 30px;
  height: 30px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #cfe0f4;
}

.schueler-icon-svg {
  width: 15px;
  height: 15px;
}
</style>
