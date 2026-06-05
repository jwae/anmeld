<script setup lang="ts">
import { computed, ref, watch } from "vue";
import apiClient from "../../services/apiClient";
import {
  anmeldeverfahrenService,
  type VerfahrenSchulgruppe,
  type VerfahrenSchulgruppenResponse,
} from "../../services/anmeldeverfahrenService";
import type { Anmeldeverfahrenstyp, BeteiligteSchule } from "../../types";

const props = defineProps<{
  token?: string;
  verfahrenId?: number | null;
  verfahrenstyp?: Anmeldeverfahrenstyp | null;
}>();

type BeteiligteSchulenSortKey = "snr" | "name" | "ort" | "schulform";
const errorMessage = ref<string>("");
const successMessage = ref<string>("");
const beteiligteSchulen = ref<BeteiligteSchule[]>([]);
const schulgruppen = ref<VerfahrenSchulgruppe[]>([]);
const loadingBeteiligteSchulen = ref<boolean>(false);
const savingBeteiligteSchulen = ref<boolean>(false);
const loadingSchulgruppen = ref<boolean>(false);
const selectedSchulgruppeId = ref<string>("");
const selectedAbgebendeSchulgruppeId = ref<string>("");
const verfahrenSchulgruppen = ref<VerfahrenSchulgruppenResponse>({
  quellschulen: [],
  zielschulen: [],
});
const beteiligteSchulenSortKey = ref<BeteiligteSchulenSortKey>("name");
const beteiligteSchulenSortDirection = ref<"asc" | "desc">("asc");
const showAbgebendeSchulenSection = ref<boolean>(false);
const showBeteiligteSchulenSection = ref<boolean>(false);

const sortedBeteiligteSchulen = computed<BeteiligteSchule[]>(() => {
  const key = beteiligteSchulenSortKey.value;
  const directionFactor = beteiligteSchulenSortDirection.value === "asc" ? 1 : -1;
  return [...beteiligteSchulen.value].sort((left, right) => {
    const leftValue = String(left[key] || "").toLocaleLowerCase("de-DE");
    const rightValue = String(right[key] || "").toLocaleLowerCase("de-DE");
    const comparison = leftValue.localeCompare(rightValue, "de-DE", { numeric: true, sensitivity: "base" });
    if (comparison !== 0) return comparison * directionFactor;
    return String(left.snr).localeCompare(String(right.snr), "de-DE", { numeric: true }) * directionFactor;
  });
});

const sortedSchulgruppen = computed<VerfahrenSchulgruppe[]>(() => (
  [...schulgruppen.value].sort((left, right) => (
    left.name.localeCompare(right.name, "de-DE", { numeric: true, sensitivity: "base" })
  ))
));

const selectedSchulgruppe = computed<VerfahrenSchulgruppe | null>(() => (
  sortedSchulgruppen.value.find((item) => String(item.id) === String(selectedSchulgruppeId.value || "")) || null
));

const selectedAbgebendeSchulgruppe = computed<VerfahrenSchulgruppe | null>(() => (
  sortedSchulgruppen.value.find((item) => String(item.id) === String(selectedAbgebendeSchulgruppeId.value || "")) || null
));

const schoolsInSelectedSchulgruppe = computed<BeteiligteSchule[]>(() => {
  const key = beteiligteSchulenSortKey.value;
  const directionFactor = beteiligteSchulenSortDirection.value === "asc" ? 1 : -1;
  const selectedSnrSet = new Set(selectedSchulgruppe.value?.schoolSnrs || []);

  return beteiligteSchulen.value
    .filter((item) => selectedSnrSet.has(String(item.snr || "").trim()))
    .sort((left, right) => {
      const leftValue = String(left[key] || "").toLocaleLowerCase("de-DE");
      const rightValue = String(right[key] || "").toLocaleLowerCase("de-DE");
      const comparison = leftValue.localeCompare(rightValue, "de-DE", { numeric: true, sensitivity: "base" });
      if (comparison !== 0) return comparison * directionFactor;
      return String(left.snr).localeCompare(String(right.snr), "de-DE", { numeric: true }) * directionFactor;
    });
});

const schoolsInSelectedAbgebendeSchulgruppe = computed<BeteiligteSchule[]>(() => {
  const key = beteiligteSchulenSortKey.value;
  const directionFactor = beteiligteSchulenSortDirection.value === "asc" ? 1 : -1;
  const selectedSnrSet = new Set(selectedAbgebendeSchulgruppe.value?.schoolSnrs || []);

  return beteiligteSchulen.value
    .filter((item) => selectedSnrSet.has(String(item.snr || "").trim()))
    .sort((left, right) => {
      const leftValue = String(left[key] || "").toLocaleLowerCase("de-DE");
      const rightValue = String(right[key] || "").toLocaleLowerCase("de-DE");
      const comparison = leftValue.localeCompare(rightValue, "de-DE", { numeric: true, sensitivity: "base" });
      if (comparison !== 0) return comparison * directionFactor;
      return String(left.snr).localeCompare(String(right.snr), "de-DE", { numeric: true }) * directionFactor;
    });
});

function getErrorMessage(error: any, fallbackMessage: string) {
  const apiError = String(error?.response?.data?.error || "").trim();
  const apiDetails = String(error?.response?.data?.details || "").trim();
  if (apiError && apiDetails) return `${apiError} ${apiDetails}`;
  return apiError || fallbackMessage;
}

function showError(error: any, fallbackMessage: string) {
  errorMessage.value = getErrorMessage(error, fallbackMessage);
  successMessage.value = "";
}

function showSuccess(message: string) {
  successMessage.value = message;
  errorMessage.value = "";
}

function normalizeSchoolGroup(item: any): VerfahrenSchulgruppe {
  return {
    id: Number(item?.id || 0),
    name: String(item?.name || "").trim(),
    beschreibung: String(item?.beschreibung || "").trim(),
    aktiv: Number(item?.aktiv || 0) === 1 || item?.aktiv === true,
    rolle: String(item?.rolle || "").trim() === "Quellschulen" ? "Quellschulen" : "Zielschulen",
    schoolSnrs: Array.isArray(item?.schoolSnrs)
      ? item.schoolSnrs.map((snr: unknown) => String(snr || "").trim()).filter(Boolean)
      : [],
  };
}

function normalizeSchoolCatalogRow(item: any): BeteiligteSchule {
  const name = String(item?.name || item?.school_name || "").trim();
  const ort = String(item?.ort || item?.city || item?.plz || "").trim();
  const schulform = String(
    item?.school_form_sf
    || item?.school_form_code
    || item?.school_form_name
    || item?.schulform
    || item?.sf_id
    || "",
  ).trim();

  return {
    snr: String(item?.snr || "").trim(),
    name,
    ort,
    schulform,
    selected: false,
  };
}

function applyProcedureSchoolGroupSelection(response: VerfahrenSchulgruppenResponse) {
  verfahrenSchulgruppen.value = {
    quellschulen: Array.isArray(response?.quellschulen) ? response.quellschulen.map(normalizeSchoolGroup) : [],
    zielschulen: Array.isArray(response?.zielschulen) ? response.zielschulen.map(normalizeSchoolGroup) : [],
  };

  const selectedTargetId = verfahrenSchulgruppen.value.zielschulen[0]?.id;
  const selectedSourceId = verfahrenSchulgruppen.value.quellschulen[0]?.id;

  if (selectedTargetId) {
    selectedSchulgruppeId.value = String(selectedTargetId);
  } else if (!sortedSchulgruppen.value.some((item) => String(item.id) === selectedSchulgruppeId.value)) {
    selectedSchulgruppeId.value = String(sortedSchulgruppen.value[0]?.id || "");
  }

  if (selectedSourceId) {
    selectedAbgebendeSchulgruppeId.value = String(selectedSourceId);
  } else if (!sortedSchulgruppen.value.some((item) => String(item.id) === selectedAbgebendeSchulgruppeId.value)) {
    selectedAbgebendeSchulgruppeId.value = String(sortedSchulgruppen.value[0]?.id || "");
  }
}

async function loadSchoolCatalog() {
  loadingBeteiligteSchulen.value = true;
  try {
    const response = await apiClient.get("/api/auth/admin/bootstrap", {
      headers: props.token ? { Authorization: `Bearer ${props.token}` } : {},
    });
    beteiligteSchulen.value = (Array.isArray(response.data?.school_sources) ? response.data.school_sources : [])
      .map(normalizeSchoolCatalogRow)
      .filter((item: BeteiligteSchule) => !!item.snr);
    schulgruppen.value = (Array.isArray(response.data?.school_groups) ? response.data.school_groups : [])
      .map(normalizeSchoolGroup)
      .filter((item: VerfahrenSchulgruppe) => item.id > 0);
  } catch (error) {
    showError(error, "Schulkatalog und Schulgruppen konnten nicht geladen werden.");
  } finally {
    loadingBeteiligteSchulen.value = false;
  }
}

async function loadProcedureSchoolGroups(verfahrenId?: number | null) {
  const effectiveId = verfahrenId ?? props.verfahrenId;
  if (!effectiveId) {
    verfahrenSchulgruppen.value = { quellschulen: [], zielschulen: [] };
    return;
  }

  loadingSchulgruppen.value = true;
  try {
    const response = await anmeldeverfahrenService.listSchoolGroups(effectiveId, props.token);
    applyProcedureSchoolGroupSelection(response);
  } catch (error) {
    showError(error, "Die Schulgruppen des Verfahrens konnten nicht geladen werden.");
  } finally {
    loadingSchulgruppen.value = false;
  }
}

function setBeteiligteSchulenSort(nextSortKey: BeteiligteSchulenSortKey) {
  if (beteiligteSchulenSortKey.value === nextSortKey) {
    beteiligteSchulenSortDirection.value = beteiligteSchulenSortDirection.value === "asc" ? "desc" : "asc";
    return;
  }
  beteiligteSchulenSortKey.value = nextSortKey;
  beteiligteSchulenSortDirection.value = "asc";
}

function getBeteiligteSchulenSortIndicator(sortKey: BeteiligteSchulenSortKey) {
  if (beteiligteSchulenSortKey.value !== sortKey) return "";
  return beteiligteSchulenSortDirection.value === "asc" ? "▲" : "▼";
}

async function submitSchulgruppeFuerVerfahren() {
  if (!props.verfahrenId) {
    errorMessage.value = "Bitte zuerst ein Anmeldeverfahren auswaehlen.";
    successMessage.value = "";
    return;
  }
  if (!selectedSchulgruppe.value) {
    errorMessage.value = "Bitte zuerst eine Schulgruppe auswaehlen.";
    successMessage.value = "";
    return;
  }

  savingBeteiligteSchulen.value = true;
  try {
    const response = await anmeldeverfahrenService.syncTargetSchoolGroups(
      props.verfahrenId,
      [selectedSchulgruppe.value.id],
      props.token,
    );
    applyProcedureSchoolGroupSelection(response.schoolGroups);
    showSuccess(response.message || "Zielschulgruppe erfolgreich fuer das Verfahren uebernommen.");
  } catch (error) {
    showError(error, "Die Zielschulgruppe konnte nicht fuer das Verfahren uebernommen werden.");
  } finally {
    savingBeteiligteSchulen.value = false;
  }
}

async function submitAbgebendeSchulgruppeFuerVerfahren() {
  if (!props.verfahrenId) {
    errorMessage.value = "Bitte zuerst ein Anmeldeverfahren auswaehlen.";
    successMessage.value = "";
    return;
  }
  if (!selectedAbgebendeSchulgruppe.value) {
    errorMessage.value = "Bitte zuerst eine Schulgruppe auswaehlen.";
    successMessage.value = "";
    return;
  }

  savingBeteiligteSchulen.value = true;
  try {
    const response = await anmeldeverfahrenService.syncSourceSchoolGroups(
      props.verfahrenId,
      [selectedAbgebendeSchulgruppe.value.id],
      props.token,
    );
    applyProcedureSchoolGroupSelection(response.schoolGroups);
    showSuccess(response.message || "Quellschulgruppe erfolgreich fuer das Verfahren uebernommen.");
  } catch (error) {
    showError(error, "Die Quellschulgruppe konnte nicht fuer das Verfahren uebernommen werden.");
  } finally {
    savingBeteiligteSchulen.value = false;
  }
}

watch(() => props.verfahrenId, async (nextVerfahrenId) => {
  await loadSchoolCatalog();
  await loadProcedureSchoolGroups(nextVerfahrenId);
}, { immediate: true });
</script>

<template>
  <section class="anm-view">
    <transition name="feedback-fade" mode="out-in">
      <div v-if="errorMessage" class="feedback-panel feedback-panel-error">
        <p class="feedback-title">Fehler</p>
        <p class="error">{{ errorMessage }}</p>
      </div>
      <div v-else-if="successMessage" class="feedback-panel feedback-panel-success">
        <p class="feedback-title">Aktion erfolgreich</p>
        <p>{{ successMessage }}</p>
      </div>
    </transition>

    <section v-if="verfahrenstyp === 'SEK1'" class="anm-card anm-schools-card">
      <div class="anm-card-head">
        <div>
          <p class="anm-roadmap-eyebrow">Schritt 1</p>
          <h3 class="anm-section-heading">
            <button
              type="button"
              class="anm-section-toggle"
              :aria-expanded="showAbgebendeSchulenSection ? 'true' : 'false'"
              @click="showAbgebendeSchulenSection = !showAbgebendeSchulenSection"
            >
              <span
                class="anm-section-toggle-chevron"
                :class="{ 'is-collapsed': !showAbgebendeSchulenSection }"
                aria-hidden="true"
              ></span>
            </button>
            <span>Abgebende Schulen im Verfahren</span>
          </h3>
          <p>Waehle eine Schulgruppe fuer das Verfahren aus. Darunter werden die Schulen der Gruppe als Infoliste angezeigt.</p>
        </div>
      </div>

      <div v-show="showAbgebendeSchulenSection">
        <div v-if="!verfahrenId" class="anm-empty-state">
          Bitte zuerst ein Verfahren auswaehlen, damit die abgebenden Schulen gepflegt werden koennen.
        </div>

        <div v-else-if="loadingBeteiligteSchulen || loadingSchulgruppen" class="anm-loading-state">
          Schulgruppen und Schulen werden geladen...
        </div>

        <div v-else-if="!sortedSchulgruppen.length" class="anm-empty-state">
          Es sind keine Schulgruppen vorhanden.
        </div>

        <div v-else>
          <div class="anm-form-row anm-form-row-with-action">
            <label class="anm-field">
              <span class="anm-field-label">Auswahl einer Schulgruppe fuer das Verfahren</span>
              <select v-model="selectedAbgebendeSchulgruppeId" class="anm-select" :disabled="savingBeteiligteSchulen">
                <option
                  v-for="gruppe in sortedSchulgruppen"
                  :key="`abgebende-schulgruppe-${gruppe.id}`"
                  :value="String(gruppe.id)"
                >
                  {{ gruppe.name }}
                </option>
              </select>
            </label>
            <button
              class="btn-primary anm-inline-submit-btn"
              type="button"
              :disabled="savingBeteiligteSchulen || loadingBeteiligteSchulen || loadingSchulgruppen || !verfahrenId || !selectedAbgebendeSchulgruppe"
              @click="submitAbgebendeSchulgruppeFuerVerfahren"
            >
              {{ savingBeteiligteSchulen ? "Uebernehme..." : "Schulgruppe uebernehmen" }}
            </button>
          </div>

          <p v-if="selectedAbgebendeSchulgruppe?.beschreibung" class="anm-inline-hint">
            {{ selectedAbgebendeSchulgruppe.beschreibung }}
          </p>

          <div class="anm-table-wrap">
            <table class="anm-table">
            <thead>
              <tr>
                <th>
                  <button class="anm-sort-btn" type="button" @click="setBeteiligteSchulenSort('snr')">
                    Snr <span>{{ getBeteiligteSchulenSortIndicator("snr") }}</span>
                  </button>
                </th>
                <th>
                  <button class="anm-sort-btn" type="button" @click="setBeteiligteSchulenSort('name')">
                    Name <span>{{ getBeteiligteSchulenSortIndicator("name") }}</span>
                  </button>
                </th>
                <th>
                  <button class="anm-sort-btn" type="button" @click="setBeteiligteSchulenSort('ort')">
                    Ort <span>{{ getBeteiligteSchulenSortIndicator("ort") }}</span>
                  </button>
                </th>
                <th>
                  <button class="anm-sort-btn" type="button" @click="setBeteiligteSchulenSort('schulform')">
                    Schulform <span>{{ getBeteiligteSchulenSortIndicator("schulform") }}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!schoolsInSelectedAbgebendeSchulgruppe.length">
                <td colspan="4" class="anm-empty-cell">Die ausgewaehlte Schulgruppe enthaelt keine Schulen.</td>
              </tr>
              <tr
                v-for="item in schoolsInSelectedAbgebendeSchulgruppe"
                :key="`abgebend-${item.snr}`"
                class="is-selected"
              >
                <td>{{ item.snr }}</td>
                <td>{{ item.name || "-" }}</td>
                <td>{{ item.ort || "-" }}</td>
                <td>{{ item.schulform || "-" }}</td>
              </tr>
            </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <section class="anm-card anm-schools-card">
      <div class="anm-card-head">
        <div>
          <p class="anm-roadmap-eyebrow">Schritt 1a</p>
          <h3 class="anm-section-heading">
            <button
              type="button"
              class="anm-section-toggle"
              :aria-expanded="showBeteiligteSchulenSection ? 'true' : 'false'"
              @click="showBeteiligteSchulenSection = !showBeteiligteSchulenSection"
            >
              <span
                class="anm-section-toggle-chevron"
                :class="{ 'is-collapsed': !showBeteiligteSchulenSection }"
                aria-hidden="true"
              ></span>
            </button>
            <span>Aufnehmende Schulen im Verfahren</span>
          </h3>
          <p>Waehle eine Schulgruppe fuer das Verfahren aus. Darunter werden die Schulen der Gruppe als Infoliste angezeigt.</p>
        </div>
      </div>

      <div v-show="showBeteiligteSchulenSection">
        <div v-if="!verfahrenId" class="anm-empty-state">
          Bitte zuerst ein Verfahren auswaehlen, damit die aufnehmenden Schulen gepflegt werden koennen.
        </div>

        <div v-else-if="loadingBeteiligteSchulen || loadingSchulgruppen" class="anm-loading-state">
          Schulgruppen und Schulen werden geladen...
        </div>

        <div v-else-if="!sortedSchulgruppen.length" class="anm-empty-state">
          Es sind keine Schulgruppen vorhanden.
        </div>

        <div v-else>
          <div class="anm-form-row anm-form-row-with-action">
            <label class="anm-field">
              <span class="anm-field-label">Auswahl einer Schulgruppe fuer das Verfahren</span>
              <select v-model="selectedSchulgruppeId" class="anm-select" :disabled="savingBeteiligteSchulen">
                <option
                  v-for="gruppe in sortedSchulgruppen"
                  :key="`schulgruppe-${gruppe.id}`"
                  :value="String(gruppe.id)"
                >
                  {{ gruppe.name }}
                </option>
              </select>
            </label>
            <button
              class="btn-primary anm-inline-submit-btn"
              type="button"
              :disabled="savingBeteiligteSchulen || loadingBeteiligteSchulen || loadingSchulgruppen || !verfahrenId || !selectedSchulgruppe"
              @click="submitSchulgruppeFuerVerfahren"
            >
              {{ savingBeteiligteSchulen ? "Uebernehme..." : "Schulgruppe uebernehmen" }}
            </button>
          </div>

          <p v-if="selectedSchulgruppe?.beschreibung" class="anm-inline-hint">
            {{ selectedSchulgruppe.beschreibung }}
          </p>

          <div class="anm-table-wrap">
            <table class="anm-table">
            <thead>
              <tr>
                <th>
                  <button class="anm-sort-btn" type="button" @click="setBeteiligteSchulenSort('snr')">
                    Snr <span>{{ getBeteiligteSchulenSortIndicator("snr") }}</span>
                  </button>
                </th>
                <th>
                  <button class="anm-sort-btn" type="button" @click="setBeteiligteSchulenSort('name')">
                    Name <span>{{ getBeteiligteSchulenSortIndicator("name") }}</span>
                  </button>
                </th>
                <th>
                  <button class="anm-sort-btn" type="button" @click="setBeteiligteSchulenSort('ort')">
                    Ort <span>{{ getBeteiligteSchulenSortIndicator("ort") }}</span>
                  </button>
                </th>
                <th>
                  <button class="anm-sort-btn" type="button" @click="setBeteiligteSchulenSort('schulform')">
                    Schulform <span>{{ getBeteiligteSchulenSortIndicator("schulform") }}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!schoolsInSelectedSchulgruppe.length">
                <td colspan="4" class="anm-empty-cell">Die ausgewaehlte Schulgruppe enthaelt keine Schulen.</td>
              </tr>
              <tr
                v-for="item in schoolsInSelectedSchulgruppe"
                :key="item.snr"
                class="is-selected"
              >
                <td>{{ item.snr }}</td>
                <td>{{ item.name || "-" }}</td>
                <td>{{ item.ort || "-" }}</td>
                <td>{{ item.schulform || "-" }}</td>
              </tr>
            </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.anm-view {
  display: grid;
  gap: 18px;
}

.anm-card {
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background:
    radial-gradient(circle at top right, rgba(143, 187, 233, 0.2), transparent 34%),
    linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-shadow: 0 18px 42px rgba(19, 54, 102, 0.08);
  display: grid;
  gap: 16px;
  padding: 18px;
}

.anm-roadmap-eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: 700;
  color: #6680a3;
}

.anm-card h3 {
  margin: 0;
  color: #19385e;
}

.anm-card p {
  margin: 8px 0 0;
  color: #4a607e;
  line-height: 1.55;
}

.anm-card-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.anm-section-heading {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.anm-section-toggle {
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

.anm-section-toggle:hover {
  background: #dbeafe;
}

.anm-section-toggle-chevron {
  width: 10px;
  height: 10px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
  transition: transform 0.2s ease;
  margin-top: -2px;
}

.anm-section-toggle-chevron.is-collapsed {
  transform: rotate(-45deg);
  margin-top: 0;
}

.anm-table-wrap {
  overflow-x: auto;
}

.anm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.anm-table th,
.anm-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e5edf6;
  text-align: left;
  vertical-align: middle;
}

.anm-checkbox-cell {
  width: 52px;
  text-align: center !important;
}

.anm-checkbox-cell input {
  width: 16px;
  height: 16px;
}

.anm-table th {
  color: #5a7393;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.anm-sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
  text-transform: inherit;
  letter-spacing: inherit;
  cursor: pointer;
}

.anm-sort-btn span {
  min-width: 10px;
  color: #7d93ae;
  font-size: 11px;
}

.anm-table tbody tr {
  cursor: pointer;
  transition: background-color 0.18s ease;
}

.anm-table tbody tr:hover {
  background: #f7fbff;
}

.anm-table tbody tr.is-selected {
  background: #eef6ff;
}

.anm-form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.anm-form-row-with-action {
  align-items: end;
}

.anm-field {
  display: grid;
  gap: 6px;
  min-width: 0;
  width: min(420px, 100%);
  flex: 0 1 420px;
}

.anm-field-label {
  color: #5a7393;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.anm-select {
  width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid #cfdceb;
  border-radius: 12px;
  background: #fff;
  color: #19385e;
  font: inherit;
  box-sizing: border-box;
}

.anm-inline-submit-btn {
  min-height: 38px;
  height: 38px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  border-radius: 12px;
  background: #f7e6e8;
  border-color: #d8aeb4;
  color: #8a3d48;
}

.anm-inline-submit-btn:hover:not(:disabled) {
  background: #f2d9dd;
  border-color: #c88f98;
}

.anm-inline-submit-btn:disabled {
  background: #f8eef0;
  border-color: #e2c7cb;
  color: #b48a91;
}

.anm-inline-hint {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f6f9fd;
  border: 1px solid #e2ebf5;
  color: #4a607e;
}

.anm-empty-cell,
.anm-empty-state,
.anm-loading-state {
  padding: 16px;
  border: 1px dashed #ccd9ea;
  border-radius: 16px;
  background: #f8fbff;
  color: #5d7390;
}
</style>
