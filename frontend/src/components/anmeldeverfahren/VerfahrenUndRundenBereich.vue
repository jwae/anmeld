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

const CANONICAL_ROUND_NUMBERS = [1, 2, 3] as const;

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
const showStartRoundOverlay = ref<boolean>(false);
const showDeleteProcedureOverlay = ref<boolean>(false);
const pendingStartRound = ref<Anmelderunde | null>(null);
const pendingDeleteProcedure = ref<Anmeldeverfahren | null>(null);
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
const canOnlyEditRoundLabel = computed<boolean>(() => (
  !!rundenForm.value.id
  && (
    selectedProcedureLocked.value
    || runden.value.some((item) => item.id === rundenForm.value.id && item.status === "Beendet")
  )
));

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

const nextSuggestedRoundNumber = computed<number | null>(() => (
  CANONICAL_ROUND_NUMBERS.find((roundNumber) => (
    !runden.value.some((item) => Number(item.runden_nummer) === roundNumber)
  )) ?? null
));

const canCreateRound = computed<boolean>(() => (
  !!selectedVerfahrenId.value
  && !selectedProcedureLocked.value
  && nextSuggestedRoundNumber.value !== null
));

const assignableRoundNumbers = computed<number[]>(() => {
  const available = CANONICAL_ROUND_NUMBERS.filter((roundNumber) => (
    !runden.value.some((item) => (
      item.id !== rundenForm.value.id && Number(item.runden_nummer) === roundNumber
    ))
  ));
  const currentNumber = Number(rundenForm.value.runden_nummer || 0);
  if (Number.isInteger(currentNumber) && currentNumber > 0 && !available.includes(currentNumber as 1 | 2 | 3)) {
    return [...available, currentNumber].sort((a, b) => a - b);
  }
  return available;
});

const nextStartableRound = computed<Anmelderunde | null>(() => {
  if (selectedVerfahren.value?.status !== "In Bearbeitung") return null;
  if (!currentInProgressRound.value) return null;
  return runden.value.find((item) => (
    item.runden_nummer === currentInProgressRound.value!.runden_nummer + 1
    && item.status === "Vorbereitet"
  )) || null;
});

const startRoundCurrentLabel = computed<string>(() => (
  currentInProgressRound.value
    ? `Runde ${currentInProgressRound.value.runden_nummer} ${currentInProgressRound.value.bezeichnung}`.trim()
    : "keine laufende Runde"
));

const startRoundTargetLabel = computed<string>(() => (
  pendingStartRound.value
    ? `Runde ${pendingStartRound.value.runden_nummer} ${pendingStartRound.value.bezeichnung}`.trim()
    : "keine Zielrunde"
));

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
  const apiError = String(error?.response?.data?.error || error?.response?.data?.message || "").trim();
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

function resetProcedureSelectionContext() {
  selectedVerfahrenId.value = null;
  activeRundenId.value = null;
  focusedRundenId.value = null;
  runden.value = [];
  emitContext();
}

function canDeleteProcedure(item: Anmeldeverfahren | null | undefined) {
  return item?.status === "Vorbereitet" || item?.status === "Beendet";
}

async function loadVerfahren(preferredSelectionId?: number | null, options: { allowAutoSelect?: boolean } = {}) {
  loadingVerfahren.value = true;
  try {
    const rows = await anmeldeverfahrenService.list(props.token, { includeHidden: showHiddenVerfahren.value });
    verfahren.value = rows;
    const allowAutoSelect = options.allowAutoSelect !== false;
    const desiredSelection = preferredSelectionId ?? selectedVerfahrenId.value;
    const stillExists = desiredSelection !== null && desiredSelection !== undefined && rows.some((item) => item.id === desiredSelection);
    selectedVerfahrenId.value = stillExists
      ? desiredSelection
      : allowAutoSelect
        ? (rows[0]?.id ?? null)
        : null;

    if (selectedVerfahrenId.value) {
      await loadRunden(selectedVerfahrenId.value);
    } else {
      resetProcedureSelectionContext();
    }
  } catch (error) {
    showError(error, "Anmeldeverfahren konnten nicht geladen werden.");
  } finally {
    loadingVerfahren.value = false;
  }
}

async function loadRunden(verfahrenId?: number | null, preferredFocusedRoundId?: number | null) {
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
    if (preferredFocusedRoundId && rows.some((item) => item.id === preferredFocusedRoundId)) {
      focusedRundenId.value = preferredFocusedRoundId;
    } else if (rows.some((item) => item.id === focusedRundenId.value)) {
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
  const nextRoundNumber = nextSuggestedRoundNumber.value;
  rundenForm.value = {
    ...createEmptyRundenForm(),
    runden_nummer: nextRoundNumber,
    bezeichnung: nextRoundNumber ? `Runde ${nextRoundNumber}` : "",
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
  if (!selectedVerfahrenId.value) {
    showError(null, "Bitte zuerst ein Anmeldeverfahren auswaehlen.");
    return;
  }
  if (nextSuggestedRoundNumber.value === null) {
    showError(null, "Fachlich sind pro Verfahren derzeit nur Runde 1 bis 3 vorgesehen.");
    return;
  }
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

function openDeleteProcedureOverlay(item: Anmeldeverfahren) {
  if (!canDeleteProcedure(item)) {
    showError(null, "Ein Verfahren in Bearbeitung kann nicht geloescht werden.");
    return;
  }
  pendingDeleteProcedure.value = item;
  showDeleteProcedureOverlay.value = true;
}

function closeDeleteProcedureOverlay(force = false) {
  if (deletingVerfahrenId.value && !force) return;
  showDeleteProcedureOverlay.value = false;
  pendingDeleteProcedure.value = null;
}

async function confirmDeleteVerfahren() {
  if (!pendingDeleteProcedure.value || deletingVerfahrenId.value) return;
  const item = pendingDeleteProcedure.value;
  const deletingSelectedProcedure = selectedVerfahrenId.value === item.id;

  deletingVerfahrenId.value = item.id;
  try {
    const response = await anmeldeverfahrenService.remove(item.id, props.token);
    closeDeleteProcedureOverlay(true);
    if (deletingSelectedProcedure) {
      resetProcedureSelectionContext();
      await loadVerfahren(null, { allowAutoSelect: false });
    } else {
      await loadVerfahren(selectedVerfahrenId.value);
    }
    showSuccess(response.message || "Verfahren wurde vollstaendig geloescht.");
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
    errorMessage.value = "Bitte eine Rundennummer auswaehlen.";
    successMessage.value = "";
    return;
  }
  if (!CANONICAL_ROUND_NUMBERS.includes(rundenForm.value.runden_nummer as 1 | 2 | 3)) {
    errorMessage.value = "Fachlich sind nur Runde 1 bis 3 vorgesehen.";
    successMessage.value = "";
    return;
  }
  if (!bezeichnung) {
    errorMessage.value = "Bezeichnung darf nicht leer sein.";
    successMessage.value = "";
    return;
  }
  if (runden.value.some((item) => (
    item.id !== rundenForm.value.id && item.runden_nummer === rundenForm.value.runden_nummer
  ))) {
    errorMessage.value = `Runde ${rundenForm.value.runden_nummer} ist in diesem Verfahren bereits vorhanden.`;
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

    await loadRunden(selectedVerfahrenId.value, response.row?.id ?? null);
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

function openStartRoundOverlay(item: Anmelderunde) {
  pendingStartRound.value = item;
  showStartRoundOverlay.value = true;
}

function closeStartRoundOverlay() {
  showStartRoundOverlay.value = false;
  pendingStartRound.value = null;
}

async function startRound() {
  if (!pendingStartRound.value) return;
  const item = pendingStartRound.value;
  try {
    const response = await anmelderundenService.startRound(item.id, props.token);
    closeStartRoundOverlay();
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
        @delete="openDeleteProcedureOverlay"
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
        :can-create-round="canCreateRound"
        :next-available-round-number="nextSuggestedRoundNumber"
        @select="selectRunde"
        @edit="openEditRoundOverlay"
        @delete="deleteRunde"
        @set-working="setWorkingRound"
        @start-round="openStartRoundOverlay"
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
          :available-round-numbers="assignableRoundNumbers"
          :rename-only="canOnlyEditRoundLabel"
          :saving="savingRunden"
          @submit="submitRunde"
          @reset="resetRundenForm"
        />
      </section>
    </div>

    <div
      v-if="showStartRoundOverlay && pendingStartRound"
      class="anm-overlay-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anm-start-round-overlay-title"
      @click.self="closeStartRoundOverlay"
    >
      <section class="anm-overlay-card anm-start-round-card">
        <div class="anm-overlay-head">
          <h3 id="anm-start-round-overlay-title">
            Runde starten
          </h3>
          <button class="anm-overlay-close" type="button" @click="closeStartRoundOverlay">Schliessen</button>
        </div>

        <div class="anm-start-round-intro">
          Sie starten jetzt <strong>{{ startRoundTargetLabel }}</strong> als naechste Runde des Verfahrens.
        </div>

        <div class="anm-start-round-summary">
          <p><strong>Aktuelle Runde:</strong> {{ startRoundCurrentLabel }}</p>
          <p><strong>Naechste Runde:</strong> {{ startRoundTargetLabel }}</p>
        </div>

        <div class="anm-start-round-info">
          <p>Beim Start dieser Runde passiert Folgendes:</p>
          <ul>
            <li>{{ startRoundCurrentLabel }} wird beendet.</li>
            <li>{{ startRoundTargetLabel }} wechselt in den Status <strong>In Bearbeitung</strong>.</li>
            <li>{{ startRoundTargetLabel }} wird zur neuen Arbeitsrunde und damit zum aktuellen Arbeitskontext.</li>
            <li>Die Schuelerdaten der laufenden Runde werden in die neue Runde uebernommen.</li>
            <li>Abgeschlossene Runden koennen wieder aktiviert werden.</li>
          </ul>
        </div>

        <div class="anm-actions">
          <button class="btn-secondary anm-form-secondary-btn" type="button" @click="closeStartRoundOverlay">
            Abbrechen
          </button>
          <button class="btn-primary anm-form-primary-btn" type="button" @click="startRound">
            Runde jetzt starten
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="showDeleteProcedureOverlay && pendingDeleteProcedure"
      class="anm-overlay-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anm-delete-procedure-overlay-title"
      @click.self="closeDeleteProcedureOverlay"
    >
      <section class="anm-overlay-card anm-delete-procedure-card">
        <div class="anm-overlay-head">
          <h3 id="anm-delete-procedure-overlay-title">Verfahren endgueltig loeschen?</h3>
          <button class="anm-overlay-close" type="button" :disabled="deletingVerfahrenId === pendingDeleteProcedure.id" @click="closeDeleteProcedureOverlay">
            Schliessen
          </button>
        </div>

        <div class="anm-delete-procedure-intro">
          Das Verfahren <strong>"{{ pendingDeleteProcedure.bezeichnung }}"</strong> wird vollstaendig geloescht.
        </div>

        <div class="anm-delete-procedure-summary">
          <p><strong>Bezeichnung:</strong> {{ pendingDeleteProcedure.bezeichnung }}</p>
          <p><strong>Schuljahr:</strong> {{ pendingDeleteProcedure.schuljahr }}</p>
          <p><strong>Verfahrenstyp:</strong> {{ pendingDeleteProcedure.verfahrenstyp }}</p>
          <p><strong>Status:</strong> {{ pendingDeleteProcedure.status }}</p>
        </div>

        <div class="anm-delete-procedure-warning">
          <p>Dabei werden auch alle zugehoerigen Daten entfernt, unter anderem:</p>
          <ul>
            <li>Runden</li>
            <li>Schuelerdaten</li>
            <li>Kapazitaeten</li>
            <li>offene Faelle</li>
            <li>Schulgruppen-Zuordnungen</li>
            <li>Zuweisungen</li>
            <li>Importdaten</li>
          </ul>
          <p><strong>Dieser Vorgang kann nicht rueckgaengig gemacht werden.</strong></p>
        </div>

        <div class="anm-actions">
          <button class="btn-secondary anm-form-secondary-btn" type="button" :disabled="deletingVerfahrenId === pendingDeleteProcedure.id" @click="closeDeleteProcedureOverlay">
            Abbrechen
          </button>
          <button class="btn-secondary anm-form-secondary-btn anm-form-danger-btn" type="button" :disabled="deletingVerfahrenId === pendingDeleteProcedure.id" @click="confirmDeleteVerfahren">
            {{ deletingVerfahrenId === pendingDeleteProcedure.id ? "Loesche..." : "Verfahren endgueltig loeschen" }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.verfahren-und-runden-bereich {
  display: grid;
  gap: 0;
}

.feedback-panel {
  margin-bottom: 18px;
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

.anm-start-round-card {
  width: min(680px, 100%);
}

.anm-delete-procedure-card {
  width: min(720px, 100%);
}

.anm-start-round-intro,
.anm-start-round-summary,
.anm-start-round-info,
.anm-delete-procedure-intro,
.anm-delete-procedure-summary,
.anm-delete-procedure-warning {
  padding: 14px 16px;
  border: 1px solid #dbe6f2;
  border-radius: 16px;
  background: #f8fbff;
}

.anm-start-round-intro,
.anm-start-round-summary p,
.anm-start-round-info p,
.anm-delete-procedure-summary p,
.anm-delete-procedure-warning p {
  margin: 0;
}

.anm-start-round-summary,
.anm-start-round-info,
.anm-delete-procedure-summary,
.anm-delete-procedure-warning {
  display: grid;
  gap: 8px;
}

.anm-start-round-info ul,
.anm-delete-procedure-warning ul {
  margin: 0;
  padding-left: 18px;
  color: #4a607e;
  line-height: 1.5;
}

.anm-delete-procedure-intro {
  border-color: #f1d1d1;
  background: #fff6f6;
  color: #7c2d2d;
}

.anm-delete-procedure-warning {
  border-color: #efc0c0;
  background: linear-gradient(180deg, #fff8f8 0%, #fff1f1 100%);
}

.anm-form-danger-btn {
  border-color: #d96b6b;
  background: #b42318;
  color: #ffffff;
}

.anm-form-danger-btn:hover:not(:disabled) {
  background: #941f15;
  color: #ffffff;
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
