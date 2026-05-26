<script setup lang="ts">
import { computed, ref } from "vue";

type SchoolRow = {
  snr: string;
  name: string;
  schulform: string;
  kapazitaet: number;
  reservierte_plaetze: number;
  neuaufnahmen: number;
  warteliste: number;
  ablehnungen: number;
  belegte_plaetze: number;
  freie_plaetze: number;
  ueberbelegung: number;
  letzter_import: string | null;
};

const props = defineProps<{
  rows: SchoolRow[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: "refresh"): void;
}>();

const schulformFilter = ref("alle");
const freiePlaetzeFilter = ref("alle");
const wartelisteFilter = ref(false);
const ueberbelegungFilter = ref(false);
const sortKey = ref<keyof SchoolRow>("name");
const sortDirection = ref<"asc" | "desc">("asc");

const schulformen = computed(() => (
  Array.from(new Set(props.rows.map((row) => String(row.schulform || "").trim()).filter(Boolean))).sort()
));

const filteredRows = computed(() => {
  return props.rows.filter((row) => {
    if (schulformFilter.value !== "alle" && row.schulform !== schulformFilter.value) return false;
    if (freiePlaetzeFilter.value === "frei" && Number(row.freie_plaetze || 0) <= 0) return false;
    if (freiePlaetzeFilter.value === "keine" && Number(row.freie_plaetze || 0) > 0) return false;
    if (wartelisteFilter.value && Number(row.warteliste || 0) <= 0) return false;
    if (ueberbelegungFilter.value && Number(row.ueberbelegung || 0) <= 0) return false;
    return true;
  });
});

const sortedRows = computed(() => {
  const directionFactor = sortDirection.value === "asc" ? 1 : -1;
  return [...filteredRows.value].sort((left, right) => {
    const leftValue = left[sortKey.value];
    const rightValue = right[sortKey.value];

    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * directionFactor;
    }

    return String(leftValue ?? "")
      .localeCompare(String(rightValue ?? ""), "de", { numeric: true, sensitivity: "base" })
      * directionFactor;
  });
});

function setSort(nextKey: keyof SchoolRow) {
  if (sortKey.value === nextKey) {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
    return;
  }
  sortKey.value = nextKey;
  sortDirection.value = "asc";
}

function sortMarker(key: keyof SchoolRow) {
  if (sortKey.value !== key) return "";
  return sortDirection.value === "asc" ? " ▲" : " ▼";
}

function rowClass(row: SchoolRow) {
  if (Number(row.ueberbelegung || 0) > 0) return "is-overbooked";
  if (Number(row.warteliste || 0) > 0) return "is-waiting";
  if (Number(row.freie_plaetze || 0) > 0) return "is-free";
  return "";
}

function freiePlaetzeClass(value: number) {
  if (Number(value || 0) > 0) return "freie-plaetze-positive";
  if (Number(value || 0) < 0) return "freie-plaetze-negative";
  return "";
}

function truncate(val: string, max: number = 15) {
  if (!val) return "-";
  return val.length > max ? val.substring(0, max - 3) + "..." : val;
}
</script>

<template>
  <section class="abgleich-table-card">
    <div class="abgleich-table-head">
      <div>
        <p class="abgleich-table-eyebrow">Verfahrenstabelle</p>
        <h3>Gesamtstatus aller beteiligten Schulen</h3>
      </div>
      <button class="btn-secondary" type="button" @click="emit('refresh')" :disabled="loading">
        {{ loading ? "Aktualisiere..." : "Aktualisieren" }}
      </button>
    </div>

    <div class="abgleich-filter-bar">
      <label>
        <span>Schulform</span>
        <select v-model="schulformFilter">
          <option value="alle">Alle</option>
          <option v-for="form in schulformen" :key="form" :value="form">{{ form }}</option>
        </select>
      </label>
      <label>
        <span>Freie Plaetze</span>
        <select v-model="freiePlaetzeFilter">
          <option value="alle">Alle</option>
          <option value="frei">Nur freie Plaetze</option>
          <option value="keine">Keine freien Plaetze</option>
        </select>
      </label>
      <label class="abgleich-filter-check">
        <input v-model="wartelisteFilter" type="checkbox" />
        <span>Warteliste vorhanden</span>
      </label>
      <label class="abgleich-filter-check">
        <input v-model="ueberbelegungFilter" type="checkbox" />
        <span>Ueberbelegung</span>
      </label>
    </div>

    <div class="table-wrap">
      <table class="abgleich-table">
        <thead>
          <tr>
            <th><button type="button" @click="setSort('snr')">Schulnummer{{ sortMarker('snr') }}</button></th>
            <th><button type="button" @click="setSort('name')">Schule{{ sortMarker('name') }}</button></th>
            <th><button type="button" @click="setSort('schulform')">Schulform{{ sortMarker('schulform') }}</button></th>
            <th><button type="button" @click="setSort('kapazitaet')">Kapazitaet{{ sortMarker('kapazitaet') }}</button></th>
            <th><button type="button" @click="setSort('reservierte_plaetze')">Reservierte Plaetze{{ sortMarker('reservierte_plaetze') }}</button></th>
            <th><button type="button" @click="setSort('neuaufnahmen')">Neuaufnahmen{{ sortMarker('neuaufnahmen') }}</button></th>
            <th><button type="button" @click="setSort('warteliste')">Warteliste{{ sortMarker('warteliste') }}</button></th>
            <th><button type="button" @click="setSort('ablehnungen')">Ablehnungen{{ sortMarker('ablehnungen') }}</button></th>
            <th><button type="button" @click="setSort('belegte_plaetze')">Belegte Plaetze{{ sortMarker('belegte_plaetze') }}</button></th>
            <th><button type="button" @click="setSort('freie_plaetze')">Freie Plaetze{{ sortMarker('freie_plaetze') }}</button></th>
            <th><button type="button" @click="setSort('ueberbelegung')">Ueberbelegung{{ sortMarker('ueberbelegung') }}</button></th>
            <th><button type="button" @click="setSort('letzter_import')">Letzter Import{{ sortMarker('letzter_import') }}</button></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="12" class="abgleich-empty">Daten werden geladen...</td>
          </tr>
          <tr v-else-if="!sortedRows.length">
            <td colspan="12" class="abgleich-empty">Keine Schulen fuer die aktuellen Filter gefunden.</td>
          </tr>
          <tr v-for="row in sortedRows" :key="`${row.snr}-${row.name}`" :class="rowClass(row)">
            <td>{{ row.snr }}</td>
            <td :title="row.name || undefined">{{ truncate(row.name, 15) }}</td>
            <td>{{ row.schulform || "-" }}</td>
            <td>{{ row.kapazitaet }}</td>
            <td>{{ row.reservierte_plaetze }}</td>
            <td>{{ row.neuaufnahmen }}</td>
            <td>{{ row.warteliste }}</td>
            <td>{{ row.ablehnungen }}</td>
            <td>{{ row.belegte_plaetze }}</td>
            <td>
              <span :class="['freie-plaetze-badge', freiePlaetzeClass(row.freie_plaetze)]">
                {{ row.freie_plaetze }}
              </span>
            </td>
            <td>{{ row.ueberbelegung }}</td>
            <td>{{ row.letzter_import || "-" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.abgleich-table-card {
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background:
    radial-gradient(circle at top right, rgba(143, 187, 233, 0.16), transparent 34%),
    linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-shadow: 0 18px 42px rgba(19, 54, 102, 0.08);
}

.abgleich-table-head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  flex-wrap: wrap;
}

.abgleich-table-eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #6680a3;
}

.abgleich-table-head h3 {
  margin: 0;
  color: #17385f;
}

.abgleich-filter-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: end;
}

.abgleich-filter-bar label {
  display: grid;
  gap: 6px;
  min-width: 160px;
}

.abgleich-filter-bar span {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6680a3;
}

.abgleich-filter-bar select {
  border: 1px solid #c9d8ea;
  border-radius: 12px;
  padding: 10px 12px;
  background: #ffffff;
  color: #17385f;
}

.abgleich-filter-check {
  min-width: 0;
  display: flex !important;
  align-items: center;
  gap: 8px;
}

.abgleich-filter-check input {
  margin: 0;
}

.abgleich-filter-check span {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}

.table-wrap {
  overflow: auto;
  max-height: 720px;
  border: 1px solid #e5edf6;
  border-radius: 16px;
  background: #ffffff;
}

.abgleich-table {
  width: 100%;
  min-width: 1360px;
  border-collapse: collapse;
  font-size: 14px;
}

.abgleich-table th,
.abgleich-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #e5edf6;
  text-align: left;
  vertical-align: middle;
}

.abgleich-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fbff;
}

.abgleich-table th button {
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

.abgleich-empty {
  padding: 18px 12px;
  color: #5d7390;
}

.btn-secondary {
  border-radius: 999px;
  padding: 10px 16px;
  font-weight: 700;
  border: 0;
  background: #eef4fd;
  color: #17385f;
}

.freie-plaetze-badge {
  display: inline-flex;
  min-width: 34px;
  justify-content: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-weight: 700;
}

.freie-plaetze-positive {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
}

.freie-plaetze-negative {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

@media (max-width: 860px) {
  .abgleich-table-head {
    align-items: start;
  }
}
</style>
