<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { anmeldeverfahrenService } from "../../services/anmeldeverfahrenService";
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
const loadingBeteiligteSchulen = ref<boolean>(false);
const savingBeteiligteSchulen = ref<boolean>(false);
const beteiligteSchulenSortKey = ref<BeteiligteSchulenSortKey>("name");
const beteiligteSchulenSortDirection = ref<"asc" | "desc">("asc");
const showAbgebendeSchulenSection = ref<boolean>(false);
const showBeteiligteSchulenSection = ref<boolean>(false);

const allBeteiligteSchulenSelected = computed<boolean>(() => (
  beteiligteSchulen.value.length > 0
  && beteiligteSchulen.value.every((item) => item.selected)
));

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

async function loadBeteiligteSchulen(verfahrenId?: number | null) {
  const effectiveId = verfahrenId ?? props.verfahrenId;
  if (!effectiveId) {
    beteiligteSchulen.value = [];
    return;
  }

  loadingBeteiligteSchulen.value = true;
  try {
    beteiligteSchulen.value = await anmeldeverfahrenService.listParticipatingSchools(effectiveId, props.token);
  } catch (error) {
    showError(error, "Beteiligte Schulen konnten nicht geladen werden.");
  } finally {
    loadingBeteiligteSchulen.value = false;
  }
}

function toggleBeteiligteSchule(snr: string, selected: boolean) {
  beteiligteSchulen.value = beteiligteSchulen.value.map((item) => (
    item.snr === snr
      ? { ...item, selected }
      : item
  ));
}

function toggleAllBeteiligteSchulen(selected: boolean) {
  beteiligteSchulen.value = beteiligteSchulen.value.map((item) => ({ ...item, selected }));
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

async function submitBeteiligteSchulen() {
  if (!props.verfahrenId) {
    errorMessage.value = "Bitte zuerst ein Anmeldeverfahren auswaehlen.";
    successMessage.value = "";
    return;
  }

  savingBeteiligteSchulen.value = true;
  try {
    const snrList = beteiligteSchulen.value
      .filter((item) => item.selected)
      .map((item) => item.snr);
    const response = await anmeldeverfahrenService.syncParticipatingSchools(
      props.verfahrenId,
      snrList,
      props.token,
    );
    beteiligteSchulen.value = response.rows || [];
    showSuccess(response.message || "Beteiligte Schulen erfolgreich uebernommen.");
  } catch (error) {
    showError(error, "Beteiligte Schulen konnten nicht gespeichert werden.");
  } finally {
    savingBeteiligteSchulen.value = false;
  }
}

watch(() => props.verfahrenId, async (nextVerfahrenId) => {
  await loadBeteiligteSchulen(nextVerfahrenId);
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
          <p>Markiere die Schulen, die am aktuell ausgewaehlten Anmeldeverfahren teilnehmen.</p>
        </div>
        <button
          class="btn-primary"
          type="button"
          :disabled="savingBeteiligteSchulen || loadingBeteiligteSchulen || !verfahrenId"
          @click="submitBeteiligteSchulen"
        >
          {{ savingBeteiligteSchulen ? "Uebernehme..." : "Auswahl uebernehmen" }}
        </button>
      </div>

      <div v-show="showAbgebendeSchulenSection">
        <div v-if="!verfahrenId" class="anm-empty-state">
          Bitte zuerst ein Verfahren auswaehlen, damit die beteiligten Schulen gepflegt werden koennen.
        </div>

        <div v-else-if="loadingBeteiligteSchulen" class="anm-loading-state">
          Schulen werden geladen...
        </div>

        <div v-else class="anm-table-wrap">
          <table class="anm-table">
            <thead>
              <tr>
                <th class="anm-checkbox-cell">
                  <input
                    type="checkbox"
                    :checked="allBeteiligteSchulenSelected"
                    :disabled="savingBeteiligteSchulen || !beteiligteSchulen.length"
                    @change="toggleAllBeteiligteSchulen(($event.target as HTMLInputElement).checked)"
                  />
                </th>
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
              <tr v-if="!beteiligteSchulen.length">
                <td colspan="5" class="anm-empty-cell">Es sind keine Schulen fuer die Auswahl vorhanden.</td>
              </tr>
              <tr
                v-for="item in sortedBeteiligteSchulen"
                :key="`abgebend-${item.snr}`"
                :class="{ 'is-selected': item.selected }"
              >
                <td class="anm-checkbox-cell">
                  <input
                    type="checkbox"
                    :checked="item.selected"
                    :disabled="savingBeteiligteSchulen"
                    @change="toggleBeteiligteSchule(item.snr, ($event.target as HTMLInputElement).checked)"
                  />
                </td>
                <td>{{ item.snr }}</td>
                <td>{{ item.name || "-" }}</td>
                <td>{{ item.ort || "-" }}</td>
                <td>{{ item.schulform || "-" }}</td>
              </tr>
            </tbody>
          </table>
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
          <p>Markiere die Schulen, die am aktuell ausgewaehlten Anmeldeverfahren teilnehmen.</p>
        </div>
        <button
          class="btn-primary"
          type="button"
          :disabled="savingBeteiligteSchulen || loadingBeteiligteSchulen || !verfahrenId"
          @click="submitBeteiligteSchulen"
        >
          {{ savingBeteiligteSchulen ? "Uebernehme..." : "Auswahl uebernehmen" }}
        </button>
      </div>

      <div v-show="showBeteiligteSchulenSection">
        <div v-if="!verfahrenId" class="anm-empty-state">
          Bitte zuerst ein Verfahren auswaehlen, damit die beteiligten Schulen gepflegt werden koennen.
        </div>

        <div v-else-if="loadingBeteiligteSchulen" class="anm-loading-state">
          Schulen werden geladen...
        </div>

        <div v-else class="anm-table-wrap">
          <table class="anm-table">
            <thead>
              <tr>
                <th class="anm-checkbox-cell">
                  <input
                    type="checkbox"
                    :checked="allBeteiligteSchulenSelected"
                    :disabled="savingBeteiligteSchulen || !beteiligteSchulen.length"
                    @change="toggleAllBeteiligteSchulen(($event.target as HTMLInputElement).checked)"
                  />
                </th>
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
              <tr v-if="!beteiligteSchulen.length">
                <td colspan="5" class="anm-empty-cell">Es sind keine Schulen fuer die Auswahl vorhanden.</td>
              </tr>
              <tr
                v-for="item in sortedBeteiligteSchulen"
                :key="item.snr"
                :class="{ 'is-selected': item.selected }"
              >
                <td class="anm-checkbox-cell">
                  <input
                    type="checkbox"
                    :checked="item.selected"
                    :disabled="savingBeteiligteSchulen"
                    @change="toggleBeteiligteSchule(item.snr, ($event.target as HTMLInputElement).checked)"
                  />
                </td>
                <td>{{ item.snr }}</td>
                <td>{{ item.name || "-" }}</td>
                <td>{{ item.ort || "-" }}</td>
                <td>{{ item.schulform || "-" }}</td>
              </tr>
            </tbody>
          </table>
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
