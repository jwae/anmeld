<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AnmeldeverfahrenListe from "../AnmeldeverfahrenListe.vue";
import AnmeldeverfahrenForm from "../AnmeldeverfahrenForm.vue";
import AnmelderundenListe from "../AnmelderundenListe.vue";
import AnmelderundenForm from "../AnmelderundenForm.vue";
import { anmeldeverfahrenService } from "../../services/anmeldeverfahrenService";
import { anmelderundenService } from "../../services/anmelderundenService";
import type { AnmeldeStatus, Anmeldeverfahren, Anmelderunde, Anmeldeverfahrenstyp } from "../../types";

const props = defineProps<{
  token?: string;
  initialVerfahrenId?: number | null;
  initialRundeId?: number | null;
}>();

const emit = defineEmits<{
  (e: "update-context", payload: { verfahren: string; runde: string }): void;
  (e: "update-selection", payload: {
    verfahrenId: number | null;
    verfahrenstyp: Anmeldeverfahrenstyp | null;
    rundeId: number | null;
    rundeStatus: AnmeldeStatus | null;
  }): void;
}>();

type VerfahrenFormState = {
  id: number | null;
  schuljahr: string;
  bezeichnung: string;
  verfahrenstyp: Anmeldeverfahrenstyp;
  status: AnmeldeStatus;
  sichtbar: boolean;
};

type RundenFormState = {
  id: number | null;
  runden_nummer: number | null;
  bezeichnung: string;
  startdatum: string;
  enddatum: string;
  status: AnmeldeStatus;
};

const verfahren = ref<Anmeldeverfahren[]>([]);
const runden = ref<Anmelderunde[]>([]);
const selectedVerfahrenId = ref<number | null>(props.initialVerfahrenId ?? null);
const activeRundenId = ref<number | null>(props.initialRundeId ?? null);
const focusedRundenId = ref<number | null>(null);
const loadingVerfahren = ref<boolean>(false);
const loadingRunden = ref<boolean>(false);
const savingVerfahren = ref<boolean>(false);
const savingRunden = ref<boolean>(false);
const deletingVerfahrenId = ref<number | null>(null);
const deletingRundenId = ref<number | null>(null);
const errorMessage = ref<string>("");
const successMessage = ref<string>("");
const showHiddenVerfahren = ref<boolean>(false);
const showProcedureOverlay = ref<boolean>(false);
const showRoundOverlay = ref<boolean>(false);
let successMessageTimeoutId: ReturnType<typeof setTimeout> | null = null;

const verfahrenForm = ref<VerfahrenFormState>(createEmptyVerfahrenForm());
const rundenForm = ref<RundenFormState>(createEmptyRundenForm());

function createEmptyVerfahrenForm(): VerfahrenFormState {
  return {
    id: null,
    schuljahr: "",
    bezeichnung: "",
    verfahrenstyp: "GS",
    status: "Vorbereitet",
    sichtbar: true,
  };
}

function createEmptyRundenForm(): RundenFormState {
  return {
    id: null,
    runden_nummer: null,
    bezeichnung: "",
    startdatum: "",
    enddatum: "",
    status: "Vorbereitet",
  };
}

const selectedVerfahren = computed<Anmeldeverfahren | null>(
  () => verfahren.value.find((item) => item.id === selectedVerfahrenId.value) || null,
);

const activeRunde = computed<Anmelderunde | null>(
  () => runden.value.find((item) => item.id === activeRundenId.value) || null,
);

const focusedRunde = computed<Anmelderunde | null>(
  () => runden.value.find((item) => item.id === focusedRundenId.value) || activeRunde.value || null,
);

const selectedProcedureLocked = computed<boolean>(() => selectedVerfahren.value?.status === "Beendet");

const currentVerfahrenTitle = computed<string>(() => (
  selectedVerfahren.value
    ? `${selectedVerfahren.value.schuljahr} ${selectedVerfahren.value.bezeichnung}`
    : "Kein Verfahren ausgewaehlt"
));

const currentRundenTitle = computed<string>(() => (
  activeRunde.value
    ? `Runde ${activeRunde.value.runden_nummer} ${activeRunde.value.bezeichnung}`
    : "Keine Arbeitsrunde gesetzt"
));

const currentInProgressRound = computed<Anmelderunde | null>(
  () => runden.value.find((item) => item.status === "In Bearbeitung") || null,
);

const nextStartableRound = computed<Anmelderunde | null>(() => {
  if (selectedVerfahren.value?.status !== "In Bearbeitung") return null;
  if (!currentInProgressRound.value) return null;
  return runden.value.find((item) => (
    item.runden_nummer === currentInProgressRound.value!.runden_nummer + 1
    && item.status === "Vorbereitet"
  )) || null;
});

const hasSimilarProcedure = computed<boolean>(() => verfahren.value.some((item) => (
  item.id !== verfahrenForm.value.id
  && String(item.schuljahr || "").trim() === String(verfahrenForm.value.schuljahr || "").trim()
  && String(item.verfahrenstyp || "").trim() === String(verfahrenForm.value.verfahrenstyp || "").trim()
)));

const similarProcedureLabel = computed<string>(() => (
  verfahrenForm.value.verfahrenstyp === "SEK1" ? "SEK-I-Verfahren" : "Grundschul-Verfahren"
));

function emitContext() {
  emit("update-context", {
    verfahren: currentVerfahrenTitle.value,
    runde: currentRundenTitle.value,
  });
  emit("update-selection", {
    verfahrenId: selectedVerfahrenId.value,
    verfahrenstyp: selectedVerfahren.value?.verfahrenstyp || null,
    rundeId: activeRundenId.value,
    rundeStatus: activeRunde.value?.status || null,
  });
}

function getErrorMessage(error: any, fallbackMessage: string) {
  const apiError = String(error?.response?.data?.error || "").trim();
  const apiDetails = String(error?.response?.data?.details || "").trim();
  if (apiError && apiDetails) return `${apiError} ${apiDetails}`;
  return apiError || fallbackMessage;
}

function showError(error: any, fallbackMessage: string) {
  if (successMessageTimeoutId) {
    clearTimeout(successMessageTimeoutId);
    successMessageTimeoutId = null;
  }
  errorMessage.value = getErrorMessage(error, fallbackMessage);
  successMessage.value = "";
}

function showSuccess(message: string) {
  successMessage.value = message;
  errorMessage.value = "";
  if (successMessageTimeoutId) clearTimeout(successMessageTimeoutId);
  successMessageTimeoutId = setTimeout(() => {
    successMessage.value = "";
    successMessageTimeoutId = null;
  }, 4000);
}

function applyLocalWorkingRound(rundenId: number | null) {
  activeRundenId.value = rundenId;
  focusedRundenId.value = rundenId;
  runden.value = runden.value.map((item) => ({
    ...item,
    ist_arbeitsrunde: rundenId !== null && item.id === rundenId,
  }));
}

async function loadVerfahren(preferredSelectionId?: number | null) {
  loadingVerfahren.value = true;
  try {
    const rows = await anmeldeverfahrenService.list(props.token, { includeHidden: showHiddenVerfahren.value });
    verfahren.value = rows;
    const desiredSelection = preferredSelectionId ?? selectedVerfahrenId.value;
    const stillExists = rows.some((item) => item.id === desiredSelection);
    selectedVerfahrenId.value = stillExists ? desiredSelection : (rows[0]?.id ?? null);

    if (selectedVerfahrenId.value) {
      await loadRunden(selectedVerfahrenId.value);
    } else {
      runden.value = [];
      activeRundenId.value = null;
      focusedRundenId.value = null;
      emitContext();
    }
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
    activeRundenId.value = null;
    focusedRundenId.value = null;
    emitContext();
    return;
  }

  loadingRunden.value = true;
  try {
    const rows = await anmelderundenService.listByVerfahren(effectiveId, props.token);
    runden.value = rows;
    const activeRound = rows.find((item) => item.ist_arbeitsrunde)
      || rows.find((item) => item.id === activeRundenId.value)
      || null;
    activeRundenId.value = activeRound?.id ?? null;
    if (rows.some((item) => item.id === focusedRundenId.value)) {
      focusedRundenId.value = focusedRundenId.value;
    } else {
      focusedRundenId.value = activeRound?.id ?? rows[0]?.id ?? null;
    }
    emitContext();
  } catch (error) {
    showError(error, "Anmelderunden konnten nicht geladen werden.");
  } finally {
    loadingRunden.value = false;
  }
}

function resetVerfahrenForm() {
  verfahrenForm.value = createEmptyVerfahrenForm();
}

function resetRundenForm() {
  const nextRoundNumber = runden.value.length
    ? Math.max(...runden.value.map((item) => Number(item.runden_nummer || 0))) + 1
    : 4;
  rundenForm.value = {
    ...createEmptyRundenForm(),
    runden_nummer: nextRoundNumber,
    bezeichnung: `Runde ${nextRoundNumber}`,
  };
}

function openCreateProcedureOverlay() {
  resetVerfahrenForm();
  showProcedureOverlay.value = true;
}

function openEditProcedureOverlay(item: Anmeldeverfahren) {
  verfahrenForm.value = {
    id: item.id,
    schuljahr: item.schuljahr,
    bezeichnung: item.bezeichnung,
    verfahrenstyp: item.verfahrenstyp,
    status: item.status,
    sichtbar: item.sichtbar,
  };
  showProcedureOverlay.value = true;
}

function openCreateRoundOverlay() {
  resetRundenForm();
  showRoundOverlay.value = true;
}

function openEditRoundOverlay(item: Anmelderunde) {
  focusedRundenId.value = item.id;
  rundenForm.value = {
    id: item.id,
    runden_nummer: item.runden_nummer,
    bezeichnung: item.bezeichnung,
    startdatum: item.startdatum || "",
    enddatum: item.enddatum || "",
    status: item.status,
  };
  showRoundOverlay.value = true;
}

async function selectVerfahren(id: number) {
  selectedVerfahrenId.value = id;
  await loadRunden(id);
}

function selectRunde(id: number) {
  focusedRundenId.value = id;
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
  if (hasSimilarProcedure.value) {
    const confirmed = window.confirm(
      `Fuer das Schuljahr ${schuljahr} existiert bereits ein ${similarProcedureLabel.value}. Moechten Sie trotzdem ein weiteres Verfahren anlegen?`,
    );
    if (!confirmed) return;
  }

  savingVerfahren.value = true;
  try {
    const payload = {
      schuljahr,
      bezeichnung,
      verfahrenstyp: verfahrenForm.value.verfahrenstyp,
      status: verfahrenForm.value.status,
      sichtbar: verfahrenForm.value.sichtbar,
    };

    const response = verfahrenForm.value.id
      ? await anmeldeverfahrenService.update(verfahrenForm.value.id, payload, props.token)
      : await anmeldeverfahrenService.create(payload, props.token);

    await loadVerfahren(response.row?.id || null);
    showProcedureOverlay.value = false;
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
    showRoundOverlay.value = false;
    showSuccess(response.message || "Anmelderunde erfolgreich gespeichert.");
  } catch (error) {
    showError(error, "Anmelderunde konnte nicht gespeichert werden.");
  } finally {
    savingRunden.value = false;
  }
}

async function deleteRunde(item: Anmelderunde) {
  const confirmed = window.confirm(`Soll die Anmelderunde "${item.bezeichnung}" wirklich geloescht werden?`);
  if (!confirmed) return;

  deletingRundenId.value = item.id;
  try {
    const response = await anmelderundenService.remove(item.id, props.token);
    await loadRunden(selectedVerfahrenId.value);
    showSuccess(response.message || "Anmelderunde erfolgreich geloescht.");
  } catch (error) {
    showError(error, "Anmelderunde konnte nicht geloescht werden.");
  } finally {
    deletingRundenId.value = null;
  }
}

async function startProcedure() {
  if (!selectedVerfahren.value) return;
  try {
    const response = await anmeldeverfahrenService.start(selectedVerfahren.value.id, props.token);
    if (response.row?.id) {
      selectedVerfahrenId.value = response.row.id;
    }
    await loadVerfahren(response.row?.id || selectedVerfahren.value.id);
    const roundOne = runden.value.find((item) => item.runden_nummer === 1) || null;
    if (roundOne) {
      applyLocalWorkingRound(roundOne.id);
      runden.value = runden.value.map((item) => ({
        ...item,
        status: item.id === roundOne.id ? "In Bearbeitung" : item.status,
      }));
      emitContext();
    }
    showSuccess(response.message);
  } catch (error) {
    showError(error, "Das Verfahren konnte nicht gestartet werden.");
  }
}

async function finishProcedure() {
  if (!selectedVerfahren.value) return;
  const confirmed = window.confirm(`Soll das Verfahren "${selectedVerfahren.value.bezeichnung}" wirklich beendet werden?`);
  if (!confirmed) return;
  try {
    const response = await anmeldeverfahrenService.finish(selectedVerfahren.value.id, props.token);
    await loadVerfahren(response.row?.id || selectedVerfahren.value.id);
    showSuccess(response.message);
  } catch (error) {
    showError(error, "Das Verfahren konnte nicht beendet werden.");
  }
}

async function setWorkingRound(item: Anmelderunde) {
  try {
    const response = await anmelderundenService.setWorkingRound(item.id, props.token);
    applyLocalWorkingRound(response.row?.id ?? item.id);
    emitContext();
    await loadVerfahren(selectedVerfahrenId.value);
    applyLocalWorkingRound(response.row?.id ?? item.id);
    emitContext();
    showSuccess(response.message);
  } catch (error) {
    showError(error, "Die Arbeitsrunde konnte nicht gesetzt werden.");
  }
}

async function startRound(item: Anmelderunde) {
  const confirmed = window.confirm(`Soll Runde ${item.runden_nummer} jetzt gestartet werden?`);
  if (!confirmed) return;
  try {
    const response = await anmelderundenService.startRound(item.id, props.token);
    applyLocalWorkingRound(response.next_round?.id ?? item.id);
    if (response.current_round?.id && response.next_round?.id) {
      runden.value = runden.value.map((entry) => {
        if (entry.id === response.current_round.id) return { ...entry, status: "Beendet", ist_arbeitsrunde: false };
        if (entry.id === response.next_round.id) return { ...entry, status: "In Bearbeitung", ist_arbeitsrunde: true };
        return entry;
      });
    }
    emitContext();
    await loadVerfahren(selectedVerfahrenId.value);
    applyLocalWorkingRound(response.next_round?.id ?? item.id);
    emitContext();
    showSuccess(response.message);
  } catch (error) {
    showError(error, "Der Rundenwechsel konnte nicht ausgefuehrt werden.");
  }
}

onMounted(async () => {
  await loadVerfahren(props.initialVerfahrenId);
});

onBeforeUnmount(() => {
  if (successMessageTimeoutId) {
    clearTimeout(successMessageTimeoutId);
    successMessageTimeoutId = null;
  }
});
</script>

<template>
  <section class="verfahren-und-runden-bereich">
    <section class="anm-toolbar-card">
      <div class="anm-toolbar-head">
        <label class="anm-toggle-row">
          <input v-model="showHiddenVerfahren" type="checkbox" @change="loadVerfahren(selectedVerfahrenId)" />
          <span>Ausgeblendete Verfahren anzeigen</span>
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

    <div class="anm-grid">
      <AnmeldeverfahrenListe
        :items="verfahren"
        :selected-id="selectedVerfahrenId"
        :loading="loadingVerfahren"
        :deleting-id="deletingVerfahrenId"
        :can-create="true"
        :can-start="selectedVerfahren?.status === 'Vorbereitet'"
        :can-finish="!!selectedVerfahrenId && !selectedProcedureLocked"
        @select="selectVerfahren"
        @edit="openEditProcedureOverlay"
        @delete="deleteVerfahren"
        @create="openCreateProcedureOverlay"
        @start="startProcedure"
        @finish="finishProcedure"
      />

      <AnmelderundenListe
        :verfahren="selectedVerfahren"
        :items="runden"
        :selected-id="focusedRundenId"
        :loading="loadingRunden"
        :deleting-id="deletingRundenId"
        :next-round-id="nextStartableRound?.id ?? null"
        :procedure-locked="selectedProcedureLocked"
        :can-create-round="!!selectedVerfahrenId && !selectedProcedureLocked"
        @select="selectRunde"
        @edit="openEditRoundOverlay"
        @delete="deleteRunde"
        @set-working="setWorkingRound"
        @start-round="startRound"
        @create-round="openCreateRoundOverlay"
      />
    </div>

    <div
      v-if="showProcedureOverlay"
      class="anm-overlay-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anm-procedure-overlay-title"
      @click.self="showProcedureOverlay = false"
    >
      <section class="anm-overlay-card">
        <div class="anm-overlay-head">
          <h3 id="anm-procedure-overlay-title">
            {{ verfahrenForm.id ? "Verfahren bearbeiten" : "Verfahren anlegen" }}
          </h3>
          <button class="anm-overlay-close" type="button" @click="showProcedureOverlay = false">Schliessen</button>
        </div>
        <div v-if="errorMessage" class="anm-overlay-feedback anm-overlay-feedback-error">
          {{ errorMessage }}
        </div>
        <div v-else-if="successMessage" class="anm-overlay-feedback anm-overlay-feedback-success">
          {{ successMessage }}
        </div>
        <AnmeldeverfahrenForm
          v-model="verfahrenForm"
          :saving="savingVerfahren"
          @submit="submitVerfahren"
          @reset="resetVerfahrenForm"
        />
      </section>
    </div>

    <div
      v-if="showRoundOverlay"
      class="anm-overlay-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anm-round-overlay-title"
      @click.self="showRoundOverlay = false"
    >
      <section class="anm-overlay-card">
        <div class="anm-overlay-head">
          <h3 id="anm-round-overlay-title">
            {{ rundenForm.id ? "Runde bearbeiten" : "Weitere Runde anlegen" }}
          </h3>
          <button class="anm-overlay-close" type="button" @click="showRoundOverlay = false">Schliessen</button>
        </div>
        <div v-if="errorMessage" class="anm-overlay-feedback anm-overlay-feedback-error">
          {{ errorMessage }}
        </div>
        <div v-else-if="successMessage" class="anm-overlay-feedback anm-overlay-feedback-success">
          {{ successMessage }}
        </div>
        <AnmelderundenForm
          v-model="rundenForm"
          :verfahren="selectedVerfahren"
          :saving="savingRunden"
          @submit="submitRunde"
          @reset="resetRundenForm"
        />
      </section>
    </div>
  </section>
</template>

<style scoped>
.verfahren-und-runden-bereich {
  display: grid;
  gap: 18px;
}

.anm-toolbar-card,
.anm-overlay-card {
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background: #ffffff;
  box-shadow: 0 16px 32px rgba(23, 58, 108, 0.05);
}

.anm-toolbar-card {
  display: grid;
  gap: 10px;
  padding: 12px;
}

.anm-toolbar-head {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
}

.anm-toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #27486f;
  font-weight: 600;
}

.anm-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.anm-toolbar-btn {
  min-height: 34px;
  padding: 8px 14px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
}

.anm-toolbar-btn-danger {
  border-color: #fca5a5;
  background: #fee2e2;
  color: #991b1b;
}

.anm-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr;
}

.anm-overlay-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(18, 34, 56, 0.42);
}

.anm-overlay-card {
  width: min(760px, 100%);
  display: grid;
  gap: 16px;
  padding: 18px;
}

.anm-overlay-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.anm-overlay-head h3 {
  margin: 0;
  color: #19385e;
}

.anm-overlay-close {
  min-height: 34px;
  padding: 8px 14px;
  border: 1px solid #cfdceb;
  border-radius: 999px;
  background: #f8fbff;
  color: #19385e;
  font-weight: 700;
  cursor: pointer;
}

.anm-overlay-feedback {
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.45;
}

.anm-overlay-feedback-error {
  border: 1px solid #f3b4b4;
  background: #fff1f1;
  color: #8f2525;
}

.anm-overlay-feedback-success {
  border: 1px solid #b9e2c0;
  background: #f2fbf4;
  color: #266b35;
}

@media (max-width: 900px) {
  .anm-card-head,
  .anm-overlay-head {
    display: grid;
    grid-template-columns: 1fr;
  }

  .anm-current-grid {
    grid-template-columns: 1fr;
  }
}
</style>
