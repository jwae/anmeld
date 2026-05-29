<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AnmeldeverfahrenListe from "../components/AnmeldeverfahrenListe.vue";
import AnmeldeverfahrenForm from "../components/AnmeldeverfahrenForm.vue";
import AnmelderundenListe from "../components/AnmelderundenListe.vue";
import AnmelderundenForm from "../components/AnmelderundenForm.vue";
import { anmeldeverfahrenService } from "../services/anmeldeverfahrenService";
import { anmelderundenService } from "../services/anmelderundenService";
import type { AnmeldeStatus, Anmeldeverfahren, Anmelderunde, BeteiligteSchule } from "../types";

const props = defineProps<{
  token?: string;
}>();

const emit = defineEmits<{
  (e: "update-context", payload: { verfahren: string; runde: string }): void;
  (e: "update-selection", payload: { verfahrenId: number | null; rundeId: number | null }): void;
}>();

type VerfahrenFormState = {
  id: number | null;
  schuljahr: string;
  bezeichnung: string;
  status: AnmeldeStatus;
};

type RundenFormState = {
  id: number | null;
  runden_nummer: number | null;
  bezeichnung: string;
  startdatum: string;
  enddatum: string;
  status: AnmeldeStatus;
};

type BeteiligteSchulenSortKey = "snr" | "name" | "ort" | "schulform";

const verfahren = ref<Anmeldeverfahren[]>([]);
const runden = ref<Anmelderunde[]>([]);
const selectedVerfahrenId = ref<number | null>(null);
const selectedRundenId = ref<number | null>(null);
const loadingVerfahren = ref<boolean>(false);
const loadingRunden = ref<boolean>(false);
const savingVerfahren = ref<boolean>(false);
const savingRunden = ref<boolean>(false);
const deletingVerfahrenId = ref<number | null>(null);
const deletingRundenId = ref<number | null>(null);
const errorMessage = ref<string>("");
const successMessage = ref<string>("");
const beteiligteSchulen = ref<BeteiligteSchule[]>([]);
const loadingBeteiligteSchulen = ref<boolean>(false);
const savingBeteiligteSchulen = ref<boolean>(false);
const beteiligteSchulenSortKey = ref<BeteiligteSchulenSortKey>("name");
const beteiligteSchulenSortDirection = ref<"asc" | "desc">("asc");

const verfahrenForm = ref<VerfahrenFormState>(createEmptyVerfahrenForm());
const rundenForm = ref<RundenFormState>(createEmptyRundenForm());

function createEmptyVerfahrenForm(): VerfahrenFormState {
  return {
    id: null,
    schuljahr: "",
    bezeichnung: "",
    status: "geplant",
  };
}

function createEmptyRundenForm(): RundenFormState {
  return {
    id: null,
    runden_nummer: null,
    bezeichnung: "",
    startdatum: "",
    enddatum: "",
    status: "geplant",
  };
}

const selectedVerfahren = computed<Anmeldeverfahren | null>(
  () => verfahren.value.find((item) => item.id === selectedVerfahrenId.value) || null,
);

const selectedRunde = computed<Anmelderunde | null>(
  () => runden.value.find((item) => item.id === selectedRundenId.value) || null,
);

const currentVerfahrenTitle = computed<string>(() => (
  selectedVerfahren.value
    ? `${selectedVerfahren.value.schuljahr} ${selectedVerfahren.value.bezeichnung}`
    : "Kein Verfahren ausgewaehlt"
));

const currentRundenTitle = computed<string>(() => (
  selectedRunde.value
    ? `Runde ${selectedRunde.value.runden_nummer} ${selectedRunde.value.bezeichnung}`
    : "Keine Runde ausgewaehlt"
));

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

function emitContext() {
  emit("update-context", {
    verfahren: currentVerfahrenTitle.value,
    runde: currentRundenTitle.value,
  });
  emit("update-selection", {
    verfahrenId: selectedVerfahrenId.value,
    rundeId: selectedRundenId.value,
  });
}

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

async function loadVerfahren(preferredSelectionId?: number | null) {
  loadingVerfahren.value = true;
  try {
    const rows = await anmeldeverfahrenService.list(props.token);
    verfahren.value = rows;

    const desiredSelection = preferredSelectionId ?? selectedVerfahrenId.value;
    const stillExists = rows.some((item) => item.id === desiredSelection);
    const nextSelectionId = stillExists ? desiredSelection : (rows[0]?.id ?? null);
    selectedVerfahrenId.value = nextSelectionId;

    if (nextSelectionId) {
      await loadRunden(nextSelectionId);
      await loadBeteiligteSchulen(nextSelectionId);
    } else {
      runden.value = [];
      selectedRundenId.value = null;
      beteiligteSchulen.value = [];
    }
    emitContext();
  } catch (error) {
    showError(error, "Anmeldeverfahren konnten nicht geladen werden.");
  } finally {
    loadingVerfahren.value = false;
  }
}

async function loadRunden(verfahrenId?: number | null) {
  const effectiveId = verfahrenId ?? selectedVerfahrenId.value;
  if (!effectiveId) {
    runden.value = [];
    selectedRundenId.value = null;
    return;
  }

  loadingRunden.value = true;
  try {
    const rows = await anmelderundenService.listByVerfahren(effectiveId, props.token);
    runden.value = rows;
    const currentSelectedExists = rows.some((item) => item.id === selectedRundenId.value);
    selectedRundenId.value = currentSelectedExists ? selectedRundenId.value : (rows[0]?.id ?? null);
    emitContext();
  } catch (error) {
    showError(error, "Anmelderunden konnten nicht geladen werden.");
  } finally {
    loadingRunden.value = false;
  }
}

async function loadBeteiligteSchulen(verfahrenId?: number | null) {
  const effectiveId = verfahrenId ?? selectedVerfahrenId.value;
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

function resetVerfahrenForm() {
  verfahrenForm.value = createEmptyVerfahrenForm();
}

function resetRundenForm() {
  const nextRoundNumber = runden.value.length
    ? Math.max(...runden.value.map((item) => Number(item.runden_nummer || 0))) + 1
    : 1;

  rundenForm.value = {
    ...createEmptyRundenForm(),
    runden_nummer: selectedVerfahrenId.value ? nextRoundNumber : null,
  };
}

function editVerfahren(item: Anmeldeverfahren) {
  verfahrenForm.value = {
    id: item.id,
    schuljahr: item.schuljahr,
    bezeichnung: item.bezeichnung,
    status: item.status,
  };
}

function editRunde(item: Anmelderunde) {
  selectedRundenId.value = item.id;
  rundenForm.value = {
    id: item.id,
    runden_nummer: item.runden_nummer,
    bezeichnung: item.bezeichnung,
    startdatum: item.startdatum || "",
    enddatum: item.enddatum || "",
    status: item.status,
  };
  emitContext();
}

async function selectVerfahren(id: number) {
  selectedVerfahrenId.value = id;
  selectedRundenId.value = null;
  await loadRunden(id);
  await loadBeteiligteSchulen(id);
  resetRundenForm();
}

function selectRunde(id: number) {
  selectedRundenId.value = id;
  emitContext();
}

async function submitVerfahren() {
  const schuljahr = verfahrenForm.value.schuljahr.trim();
  const bezeichnung = verfahrenForm.value.bezeichnung.trim();
  if (!schuljahr) {
    errorMessage.value = "Schuljahr darf nicht leer sein.";
    successMessage.value = "";
    return;
  }
  if (!bezeichnung) {
    errorMessage.value = "Bezeichnung darf nicht leer sein.";
    successMessage.value = "";
    return;
  }

  savingVerfahren.value = true;
  try {
    const payload = {
      schuljahr,
      bezeichnung,
      status: verfahrenForm.value.status,
    };

    const response = verfahrenForm.value.id
      ? await anmeldeverfahrenService.update(verfahrenForm.value.id, payload, props.token)
      : await anmeldeverfahrenService.create(payload, props.token);

    await loadVerfahren(response.row?.id || null);
    editVerfahren(response.row);
    showSuccess(response.message || "Anmeldeverfahren erfolgreich gespeichert.");
  } catch (error) {
    showError(error, "Anmeldeverfahren konnte nicht gespeichert werden.");
  } finally {
    savingVerfahren.value = false;
  }
}

async function deleteVerfahren(item: Anmeldeverfahren) {
  const confirmed = window.confirm(
    `Soll das Anmeldeverfahren "${item.bezeichnung}" wirklich geloescht werden? Zugehoerige Runden werden dabei ebenfalls entfernt.`,
  );
  if (!confirmed) return;

  deletingVerfahrenId.value = item.id;
  try {
    const response = await anmeldeverfahrenService.remove(item.id, props.token);
    if (verfahrenForm.value.id === item.id) resetVerfahrenForm();
    resetRundenForm();
    await loadVerfahren(selectedVerfahrenId.value === item.id ? null : selectedVerfahrenId.value);
    showSuccess(response.message || "Anmeldeverfahren erfolgreich geloescht.");
  } catch (error) {
    showError(error, "Anmeldeverfahren konnte nicht geloescht werden.");
  } finally {
    deletingVerfahrenId.value = null;
  }
}

async function submitRunde() {
  if (!selectedVerfahrenId.value) {
    errorMessage.value = "Bitte zuerst ein Anmeldeverfahren auswaehlen.";
    successMessage.value = "";
    return;
  }

  const bezeichnung = rundenForm.value.bezeichnung.trim();
  if (!rundenForm.value.runden_nummer) {
    errorMessage.value = "Rundennummer muss eine positive Zahl sein.";
    successMessage.value = "";
    return;
  }
  if (!bezeichnung) {
    errorMessage.value = "Bezeichnung darf nicht leer sein.";
    successMessage.value = "";
    return;
  }
  if (
    rundenForm.value.startdatum
    && rundenForm.value.enddatum
    && rundenForm.value.startdatum > rundenForm.value.enddatum
  ) {
    errorMessage.value = "Startdatum darf nicht nach dem Enddatum liegen.";
    successMessage.value = "";
    return;
  }

  savingRunden.value = true;
  try {
    const payload = {
      runden_nummer: Number(rundenForm.value.runden_nummer),
      bezeichnung,
      startdatum: rundenForm.value.startdatum || null,
      enddatum: rundenForm.value.enddatum || null,
      status: rundenForm.value.status,
    };

    const response = rundenForm.value.id
      ? await anmelderundenService.update(rundenForm.value.id, payload, props.token)
      : await anmelderundenService.create(selectedVerfahrenId.value, payload, props.token);

    await loadRunden(selectedVerfahrenId.value);
    selectedRundenId.value = response.row?.id ?? selectedRundenId.value;
    if (rundenForm.value.id) {
      editRunde(response.row);
    } else {
      resetRundenForm();
    }
    showSuccess(response.message || "Anmelderunde erfolgreich gespeichert.");
  } catch (error) {
    showError(error, "Anmelderunde konnte nicht gespeichert werden.");
  } finally {
    savingRunden.value = false;
  }
}

async function deleteRunde(item: Anmelderunde) {
  const confirmed = window.confirm(
    `Soll die Anmelderunde "${item.bezeichnung}" wirklich geloescht werden?`,
  );
  if (!confirmed) return;

  deletingRundenId.value = item.id;
  try {
    const response = await anmelderundenService.remove(item.id, props.token);
    if (rundenForm.value.id === item.id) resetRundenForm();
    await loadRunden(selectedVerfahrenId.value);
    showSuccess(response.message || "Anmelderunde erfolgreich geloescht.");
  } catch (error) {
    showError(error, "Anmelderunde konnte nicht geloescht werden.");
  } finally {
    deletingRundenId.value = null;
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
  if (!selectedVerfahrenId.value) {
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
      selectedVerfahrenId.value,
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

onMounted(async () => {
  await loadVerfahren();
});
</script>

<template>
  <section class="anm-view">
    <section class="anm-roadmap-card">
      <div class="anm-hero-grid">
        <div>
          <p class="anm-roadmap-eyebrow">Schritt 1</p>
          <h2>Grundlage des Schulanmeldeverfahrens</h2>
          <p>
            Verfahren und Runde festlegen / Kapazitaeten aktualisieren / Schuelerpool /Anmeldungen holen / Koordinieren.
          </p>
        </div>
      </div>

    </section>

    <section class="anm-current-selection-card">
      <div class="anm-card-head">
        <div>
          <p class="anm-roadmap-eyebrow">Aktuelle Auswahl</p>
          <h3>Verfahren und Runde festlegen</h3>
          <p>Diese Auswahl bildet den aktuellen Arbeitskontext fuer die weiteren Module.</p>
        </div>
      </div>

      <div class="anm-form-grid">
        <label class="field-block">
          <span class="field-label">Aktuelles Verfahren</span>
          <select
            :value="selectedVerfahrenId ?? ''"
            :disabled="loadingVerfahren || !verfahren.length"
            @change="selectVerfahren(Number(($event.target as HTMLSelectElement).value || 0))"
          >
            <option disabled value="">Bitte Verfahren waehlen</option>
            <option v-for="item in verfahren" :key="item.id" :value="item.id">
              {{ item.schuljahr }} - {{ item.bezeichnung }}
            </option>
          </select>
        </label>

        <label class="field-block">
          <span class="field-label">Aktuelle Runde</span>
          <select
            :value="selectedRundenId ?? ''"
            :disabled="loadingRunden || !selectedVerfahrenId || !runden.length"
            @change="selectRunde(Number(($event.target as HTMLSelectElement).value || 0))"
          >
            <option disabled value="">
              {{ selectedVerfahrenId ? "Bitte Runde waehlen" : "Zuerst Verfahren waehlen" }}
            </option>
            <option v-for="item in runden" :key="item.id" :value="item.id">
              Runde {{ item.runden_nummer }} - {{ item.bezeichnung }}
            </option>
          </select>
        </label>
      </div>
    </section>

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

    <div class="anm-grid anm-grid-top">
      <AnmeldeverfahrenListe
        :items="verfahren"
        :selected-id="selectedVerfahrenId"
        :loading="loadingVerfahren"
        :deleting-id="deletingVerfahrenId"
        @select="selectVerfahren"
        @edit="editVerfahren"
        @delete="deleteVerfahren"
      />

      <AnmeldeverfahrenForm
        v-model="verfahrenForm"
        :saving="savingVerfahren"
        @submit="submitVerfahren"
        @reset="resetVerfahrenForm"
      />
    </div>

    <div class="anm-grid">
      <AnmelderundenListe
        :verfahren="selectedVerfahren"
        :items="runden"
        :selected-id="selectedRundenId"
        :loading="loadingRunden"
        :deleting-id="deletingRundenId"
        @select="selectRunde"
        @edit="editRunde"
        @delete="deleteRunde"
      />

      <AnmelderundenForm
        v-model="rundenForm"
        :verfahren="selectedVerfahren"
        :saving="savingRunden"
        @submit="submitRunde"
        @reset="resetRundenForm"
      />
    </div>

    <section class="anm-card anm-schools-card">
      <div class="anm-card-head">
        <div>
          <p class="anm-roadmap-eyebrow">Schritt 1a</p>
          <h3>Schulen im Verfahren</h3>
          <p>Markiere die Schulen, die am aktuell ausgewaehlten Anmeldeverfahren teilnehmen.</p>
        </div>
        <button
          class="btn-primary"
          type="button"
          :disabled="savingBeteiligteSchulen || loadingBeteiligteSchulen || !selectedVerfahrenId"
          @click="submitBeteiligteSchulen"
        >
          {{ savingBeteiligteSchulen ? "Uebernehme..." : "Auswahl uebernehmen" }}
        </button>
      </div>

      <div v-if="!selectedVerfahrenId" class="anm-empty-state">
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
    </section>
  </section>
</template>

<style scoped>
.anm-view {
  display: grid;
  gap: 18px;
}

.anm-roadmap-card,
.anm-current-selection-card,
.anm-card {
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background:
    radial-gradient(circle at top right, rgba(143, 187, 233, 0.2), transparent 34%),
    linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-shadow: 0 18px 42px rgba(19, 54, 102, 0.08);
}

.anm-roadmap-card {
  display: grid;
  gap: 16px;
  padding: 22px;
}

.anm-hero-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr);
}

.anm-current-selection-card {
  display: grid;
  gap: 16px;
  padding: 20px 22px;
}

.anm-roadmap-eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: 700;
  color: #6680a3;
}

.anm-roadmap-card h2,
.anm-card h3 {
  margin: 0;
  color: #19365b;
}

.anm-roadmap-card p,
.anm-current-selection-card p,
.anm-card p {
  margin: 8px 0 0;
  color: #4a607e;
  line-height: 1.55;
}

.anm-roadmap {
  display: grid;
  gap: 10px;
}

.anm-roadmap-step {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px dashed #ccdaea;
  color: #5d7492;
  background: rgba(245, 249, 255, 0.9);
  font-weight: 600;
}

.anm-roadmap-step.is-active {
  border-style: solid;
  border-color: #b3cae2;
  background: #ffffff;
  color: #16385d;
}

.anm-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1.3fr) minmax(300px, 0.9fr);
}


.anm-grid-top {
  align-items: stretch;
}

.anm-card {
  display: grid;
  gap: 16px;
  padding: 18px;
}

.anm-card-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.anm-badge {
  min-width: 40px;
  padding: 6px 10px;
  border-radius: 999px;
  background: #e8f1fb;
  color: #23486f;
  font-weight: 700;
  text-align: center;
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

.anm-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: #eef3f9;
  color: #34506d;
  font-weight: 700;
  text-transform: capitalize;
}

.anm-status-pill[data-status="aktiv"] {
  background: #e8f7eb;
  color: #2a6a36;
}

.anm-status-pill[data-status="abgeschlossen"] {
  background: #eef0f3;
  color: #526173;
}

.anm-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.anm-actions-end {
  justify-content: flex-end;
}

.anm-danger-btn {
  border-color: #e6c4c4;
  color: #8c2e2e;
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

.anm-form-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.anm-form-grid-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (max-width: 1080px) {
  .anm-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .anm-form-grid,
  .anm-form-grid-3 {
    grid-template-columns: 1fr;
  }
}
</style>
