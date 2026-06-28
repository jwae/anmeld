<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import koordinationService from "../services/koordinationService";

type OpenCaseRow = {
  fall_id: number;
  verfahren_id: number;
  fallstatus_id: number;
  schueler_row_id: number;
  schueler_pool_id: number;
  schueler_anmeldung_id: number;
  runde_id: number;
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  schueler_ident: string;
  aktuelle_snr: string;
  aktuelle_schule: string;
  zugewiesene_snr: string;
  zugewiesene_schule: string;
  fallgrund_code: string;
  fallgrund: string;
  fallstatus: string;
  bemerkung: string;
  created_at: string;
  updated_at: string;
  quelle: string;
};

type FallstatusOption = {
  id: number;
  code: string;
  bezeichnung: string;
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
const savingById = reactive<Record<number, boolean>>({});
const expandedRows = ref<number[]>([]);
const errorMessage = ref("");
const successMessage = ref("");
const openCaseRows = ref<OpenCaseRow[]>([]);
const fallstatusCatalog = ref<FallstatusOption[]>([]);
const editState = reactive<Record<number, { fallstatus_id: number; bemerkung: string }>>({});
const search = ref("");
const fallgrundFilter = ref("alle");
const fallstatusFilter = ref("alle");
const sortKey = ref<keyof OpenCaseRow>("updated_at");
const sortDirection = ref<"asc" | "desc">("desc");

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
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

function formatDateTime(value: string | null | undefined) {
  const text = normalizeText(value);
  if (!text) return "-";
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!match) return text;
  return `${match[3]}.${match[2]}.${match[1]} ${match[4]}:${match[5]}`;
}

function uniqueOptions(selector: (row: OpenCaseRow) => string) {
  return Array.from(
    new Set(
      openCaseRows.value
        .map(selector)
        .map((value) => normalizeText(value))
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));
}

const fallgrundOptions = computed(() => uniqueOptions((row) => row.fallgrund_code || row.fallgrund));
const fallstatusOptions = computed(() => {
  if (fallstatusCatalog.value.length) {
    return fallstatusCatalog.value.map((option) => option.bezeichnung);
  }
  return uniqueOptions((row) => row.fallstatus);
});

const filteredRows = computed(() => {
  const searchText = normalizeText(search.value).toLowerCase();

  return openCaseRows.value.filter((row) => {
    const searchable = [
      row.nachname,
      row.vorname,
      row.schueler_ident,
      row.aktuelle_snr,
      row.aktuelle_schule,
      row.zugewiesene_snr,
      row.zugewiesene_schule,
      row.fallgrund,
      row.fallstatus,
      row.bemerkung,
    ].map((value) => normalizeText(value).toLowerCase()).join(" ");

    if (searchText && !searchable.includes(searchText)) return false;
    if (fallgrundFilter.value !== "alle" && (row.fallgrund_code || row.fallgrund) !== fallgrundFilter.value) return false;
    if (fallstatusFilter.value !== "alle" && row.fallstatus !== fallstatusFilter.value) return false;
    return true;
  });
});

const sortedRows = computed(() => {
  const direction = sortDirection.value === "asc" ? 1 : -1;
  return [...filteredRows.value].sort((left, right) => {
    const a = normalizeText(left[sortKey.value]);
    const b = normalizeText(right[sortKey.value]);
    const compare = a.localeCompare(b, "de", { numeric: true, sensitivity: "base" });
    if (compare !== 0) return compare * direction;
    return normalizeText(left.nachname).localeCompare(normalizeText(right.nachname), "de", { sensitivity: "base" });
  });
});

const metricCards = computed(() => [
  { label: "Offene Faelle", value: openCaseRows.value.length },
  { label: "Gefiltert", value: sortedRows.value.length },
  { label: "Fallgruende", value: fallgrundOptions.value.length },
]);

function setSort(nextKey: keyof OpenCaseRow) {
  if (sortKey.value === nextKey) {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
    return;
  }
  sortKey.value = nextKey;
  sortDirection.value = nextKey === "updated_at" ? "desc" : "asc";
}

function sortMarker(key: keyof OpenCaseRow) {
  if (sortKey.value !== key) return "";
  return sortDirection.value === "asc" ? " ▲" : " ▼";
}

function quelleBadgeClass(value: string) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "anm_schueler") return "status-badge status-badge-assigned";
  if (normalized === "anm_schueler_pool") return "status-badge status-badge-le";
  if (normalized === "anm_schueler_anmeldung") return "status-badge status-badge-zd";
  return "status-badge status-badge-without";
}

function statusBadgeClass(value: string) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized.includes("offen")) return "status-badge status-badge-without";
  if (normalized.includes("bearbeitung")) return "status-badge status-badge-zd";
  if (normalized.includes("erledigt") || normalized.includes("geklaert")) return "status-badge status-badge-le";
  return "status-badge status-badge-assigned";
}

function syncEditState(rows: OpenCaseRow[]) {
  for (const row of rows) {
    editState[row.fall_id] = {
      fallstatus_id: Number(row.fallstatus_id || 0),
      bemerkung: row.bemerkung || "",
    };
  }
}

function isExpanded(fallId: number) {
  return expandedRows.value.includes(fallId);
}

function toggleExpanded(fallId: number) {
  if (isExpanded(fallId)) {
    expandedRows.value = expandedRows.value.filter((value) => value !== fallId);
    return;
  }
  expandedRows.value = [...expandedRows.value, fallId];
}

function currentEditState(fallId: number) {
  if (!editState[fallId]) {
    editState[fallId] = { fallstatus_id: 0, bemerkung: "" };
  }
  return editState[fallId];
}

function hasChanges(row: OpenCaseRow) {
  const state = currentEditState(row.fall_id);
  return Number(state.fallstatus_id || 0) !== Number(row.fallstatus_id || 0)
    || normalizeText(state.bemerkung) !== normalizeText(row.bemerkung);
}

function detailTitle(row: OpenCaseRow) {
  return `${row.nachname}, ${row.vorname}`.replace(/^,\s*/, "").trim() || `Fall ${row.fall_id}`;
}

async function loadData() {
  if (!props.verfahrenId || !props.rundeId) {
    openCaseRows.value = [];
    fallstatusCatalog.value = [];
    return;
  }

  try {
    loading.value = true;
    errorMessage.value = "";
    successMessage.value = "";
    const response = await koordinationService.getOffeneFaelle(props.verfahrenId, props.rundeId, props.token);
    openCaseRows.value = Array.isArray(response?.rows) ? response.rows : [];
    fallstatusCatalog.value = Array.isArray(response?.fallstatusOptions) ? response.fallstatusOptions : [];
    syncEditState(openCaseRows.value);
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Die offenen Faelle konnten nicht geladen werden.";
    openCaseRows.value = [];
    fallstatusCatalog.value = [];
  } finally {
    loading.value = false;
  }
}

async function saveRow(row: OpenCaseRow) {
  if (!props.verfahrenId) return;
  const state = currentEditState(row.fall_id);
  if (!Number(state.fallstatus_id || 0)) {
    errorMessage.value = "Bitte zuerst einen gueltigen Status auswaehlen.";
    return;
  }

  try {
    savingById[row.fall_id] = true;
    errorMessage.value = "";
    successMessage.value = "";
    const response = await koordinationService.updateOffenerFall(
      row.fall_id,
      {
        verfahren_id: props.verfahrenId,
        fallstatus_id: Number(state.fallstatus_id || 0),
        bemerkung: state.bemerkung || "",
      },
      props.token,
    );
    successMessage.value = response?.message || "Der offene Fall wurde gespeichert.";
    await loadData();
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Der offene Fall konnte nicht gespeichert werden.";
  } finally {
    savingById[row.fall_id] = false;
  }
}

watch(
  () => [props.verfahrenId, props.rundeId],
  () => {
    void loadData();
  },
  { immediate: true },
);
</script>

<template>
  <section class="offene-faelle-view">
    <header class="offene-faelle-header">
      <div>
        <p class="offene-faelle-eyebrow">Offene Faelle</p>
        <h2>Arbeitsoberflaeche fuer offene Faelle</h2>
        <p class="offene-faelle-intro">
          Faelle sichten, Status setzen und Bemerkungen pflegen fuer
          <strong>{{ context.verfahren }}</strong>.
        </p>
      </div>
    </header>

    <div v-if="errorMessage" class="status-banner status-banner-error">{{ errorMessage }}</div>
    <div v-if="successMessage" class="status-banner status-banner-success">{{ successMessage }}</div>

    <section v-if="!verfahrenId || !rundeId" class="offene-faelle-placeholder">
      <p>Waehle zuerst ein Verfahren und eine Runde, damit die offenen Faelle geladen werden koennen.</p>
    </section>

    <section v-else class="offene-faelle-panel">
      <div class="pool-metric-cards">
        <article v-for="card in metricCards" :key="card.label" class="pool-metric-card">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
        </article>
      </div>

      <div class="pool-table-toolbar">
        <label class="pool-search-field">
          <span>Suche</span>
          <div class="pool-search-input-wrap">
            <input v-model="search" type="search" placeholder="Name, ID, Schule, Fallgrund oder Bemerkung" />
            <button
              v-if="search"
              type="button"
              class="pool-search-clear"
              aria-label="Suche loeschen"
              title="Suche loeschen"
              @click="search = ''"
            >
              ×
            </button>
          </div>
        </label>
        <label>
          <span>Fallgrund</span>
          <select v-model="fallgrundFilter">
            <option value="alle">Alle</option>
            <option v-for="option in fallgrundOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select v-model="fallstatusFilter">
            <option value="alle">Alle</option>
            <option v-for="option in fallstatusOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
      </div>

      <div class="table-wrap detail-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th>Nr.</th>
              <th>Fall</th>
              <th><button type="button" class="table-sort-btn" @click="setSort('schueler_ident')">Schueler-ID{{ sortMarker('schueler_ident') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setSort('nachname')">Name + Vorname{{ sortMarker('nachname') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setSort('aktuelle_snr')">Aktuelle Schule{{ sortMarker('aktuelle_snr') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setSort('fallgrund')">Fallgrund{{ sortMarker('fallgrund') }}</button></th>
              <th>Status</th>
              <th><button type="button" class="table-sort-btn" @click="setSort('quelle')">Quelle{{ sortMarker('quelle') }}</button></th>
              <th><button type="button" class="table-sort-btn" @click="setSort('updated_at')">Aktualisiert{{ sortMarker('updated_at') }}</button></th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="10" class="table-empty">Daten werden geladen...</td>
            </tr>
            <tr v-else-if="!sortedRows.length">
              <td colspan="10" class="table-empty">Keine offenen Faelle im ausgewaehlten Verfahren gefunden.</td>
            </tr>
            <template v-for="(row, index) in sortedRows" :key="row.fall_id">
              <tr class="open-case-row">
                <td>{{ index + 1 }}</td>
                <td>#{{ row.fall_id }}</td>
                <td>{{ row.schueler_ident || "-" }}</td>
                <td>{{ [row.nachname, row.vorname].filter(Boolean).join(", ") || "-" }}</td>
                <td>
                  {{ row.aktuelle_snr || "-" }}
                  <template v-if="row.aktuelle_schule"> / {{ row.aktuelle_schule }}</template>
                </td>
                <td>{{ row.fallgrund || "-" }}</td>
                <td>
                  <span :class="statusBadgeClass(row.fallstatus)">{{ row.fallstatus || "-" }}</span>
                </td>
                <td><span :class="quelleBadgeClass(row.quelle)">{{ row.quelle || "-" }}</span></td>
                <td>{{ formatDateTime(row.updated_at || row.created_at) }}</td>
                <td class="detail-actions-cell">
                  <button
                    type="button"
                    class="btn-secondary pool-icon-btn"
                    :title="isExpanded(row.fall_id) ? 'Details schliessen' : 'Details oeffnen'"
                    :aria-label="isExpanded(row.fall_id) ? 'Details schliessen' : 'Details oeffnen'"
                    @click="toggleExpanded(row.fall_id)"
                  >
                    {{ isExpanded(row.fall_id) ? "−" : "+" }}
                  </button>
                </td>
              </tr>
              <tr v-if="isExpanded(row.fall_id)" class="open-case-detail-row">
                <td colspan="10" class="open-case-detail-cell">
                  <div class="open-case-detail-grid">
                    <section class="open-case-detail-card">
                      <h3>{{ detailTitle(row) }}</h3>
                      <dl class="open-case-meta">
                        <div><dt>Geburtsdatum</dt><dd>{{ formatDate(row.geburtsdatum) }}</dd></div>
                        <div><dt>Zugewiesen</dt><dd>{{ row.zugewiesene_snr || "-" }}<template v-if="row.zugewiesene_schule"> / {{ row.zugewiesene_schule }}</template></dd></div>
                        <div><dt>Quelle</dt><dd>{{ row.quelle || "-" }}</dd></div>
                        <div><dt>Zuletzt geaendert</dt><dd>{{ formatDateTime(row.updated_at || row.created_at) }}</dd></div>
                      </dl>
                    </section>

                    <section class="open-case-detail-card open-case-editor">
                      <label>
                        <span>Status</span>
                        <select v-model="currentEditState(row.fall_id).fallstatus_id">
                          <option v-for="option in fallstatusCatalog" :key="option.id" :value="option.id">{{ option.bezeichnung }}</option>
                        </select>
                      </label>
                      <label>
                        <span>Bemerkung</span>
                        <textarea
                          v-model="currentEditState(row.fall_id).bemerkung"
                          rows="5"
                          placeholder="Bearbeitungsnotiz oder Klaerung eintragen"
                        />
                      </label>
                      <div class="open-case-editor-actions">
                        <button
                          type="button"
                          class="btn-secondary"
                          :disabled="savingById[row.fall_id] || !hasChanges(row)"
                          @click="saveRow(row)"
                        >
                          {{ savingById[row.fall_id] ? "Speichere..." : "Speichern" }}
                        </button>
                      </div>
                    </section>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>

<style scoped>
.offene-faelle-view {
  display: grid;
  gap: 18px;
}

.offene-faelle-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.offene-faelle-eyebrow {
  margin: 0 0 6px;
  color: #6882a4;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.offene-faelle-header h2 {
  margin: 0;
  color: #17385f;
}

.offene-faelle-intro {
  margin: 8px 0 0;
  color: #4d6280;
  max-width: 72ch;
}

.offene-faelle-placeholder,
.offene-faelle-panel {
  display: grid;
  gap: 18px;
  padding: 22px;
  border: 1px solid #dbe4f0;
  border-radius: 20px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  box-shadow: 0 16px 34px rgba(20, 63, 120, 0.08);
}

.status-banner {
  padding: 12px 14px;
  border-radius: 14px;
  font-weight: 600;
}

.status-banner-error {
  border: 1px solid #f2c2c2;
  background: #fff5f5;
  color: #a61b1b;
}

.status-banner-success {
  border: 1px solid #cde8d1;
  background: #f3fff4;
  color: #166534;
}

.pool-metric-cards {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.pool-metric-card {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid #d9e3f0;
  background: linear-gradient(180deg, #ffffff 0%, #f4f8fd 100%);
}

.pool-metric-card span {
  color: #6d83a3;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pool-metric-card strong {
  color: #17385f;
  font-size: 24px;
  line-height: 1;
}

.pool-table-toolbar {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(240px, 1.4fr) minmax(260px, 1.1fr) minmax(180px, 0.8fr);
  align-items: end;
}

.pool-table-toolbar label {
  display: grid;
  gap: 6px;
}

.pool-table-toolbar span,
.open-case-editor span {
  color: #6d83a3;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pool-table-toolbar input,
.pool-table-toolbar select,
.open-case-editor select,
.open-case-editor textarea {
  min-height: 42px;
  border: 1px solid #ced9e6;
  border-radius: 12px;
  padding: 0 14px;
  background: #ffffff;
  color: #1f3556;
  font: inherit;
}

.open-case-editor textarea {
  min-height: 132px;
  padding: 12px 14px;
  resize: vertical;
}

.pool-search-field {
  min-width: 0;
}

.pool-search-input-wrap {
  position: relative;
}

.pool-search-input-wrap input {
  width: 100%;
  padding-right: 44px;
}

.pool-search-clear {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: #6c7f98;
  font-size: 20px;
  line-height: 1;
}

.detail-table-wrap {
  overflow: auto;
  border: 1px solid #dbe4f0;
  border-radius: 18px;
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
}

.detail-table th,
.detail-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e7eef7;
  text-align: left;
  vertical-align: top;
  font-size: 13px;
}

.detail-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f5f8fc;
  color: #17385f;
  white-space: nowrap;
}

.detail-table tbody tr:hover td {
  background: #eef6ff;
}

.table-sort-btn {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
}

.table-empty {
  color: #5c718e;
  text-align: center !important;
  padding: 28px 12px !important;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.status-badge-assigned {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-badge-le {
  background: #dcfce7;
  color: #166534;
}

.status-badge-zd {
  background: #fef3c7;
  color: #92400e;
}

.status-badge-without {
  background: #f3f4f6;
  color: #4b5563;
}

.pool-icon-btn {
  min-width: 36px;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 10px;
}

.detail-actions-cell {
  white-space: nowrap;
}

.btn-secondary {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid #cfd9e6;
  border-radius: 12px;
  background: linear-gradient(180deg, #ffffff 0%, #f5f8fc 100%);
  color: #214061;
  font-weight: 700;
}

.btn-secondary:disabled {
  opacity: 0.55;
}

.open-case-detail-row td {
  background: #f9fbfe;
}

.open-case-detail-cell {
  padding: 16px !important;
}

.open-case-detail-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(260px, 0.9fr) minmax(340px, 1.1fr);
}

.open-case-detail-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid #dce6f1;
  border-radius: 16px;
  background: #ffffff;
}

.open-case-detail-card h3 {
  margin: 0;
  color: #17385f;
}

.open-case-meta {
  display: grid;
  gap: 12px;
  margin: 0;
}

.open-case-meta div {
  display: grid;
  gap: 4px;
}

.open-case-meta dt {
  color: #6d83a3;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.open-case-meta dd {
  margin: 0;
  color: #1f3556;
}

.open-case-editor {
  align-content: start;
}

.open-case-editor label {
  display: grid;
  gap: 6px;
}

.open-case-editor-actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 980px) {
  .pool-table-toolbar,
  .open-case-detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
