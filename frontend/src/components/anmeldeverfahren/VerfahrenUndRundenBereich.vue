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
  isReadonly?: boolean;
}>();

const emit = defineEmits<{
  (e: "update-context", payload: { verfahren: string; runde: string }): void;
  (e: "update-selection", payload: {
    verfahrenId: number | null;
    verfahrenstyp: Anmeldeverfahrenstyp | null;
    verfahrenStatus: AnmeldeStatus | null;
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
const procedureOverlaySuccessMessage = ref<string>("");
const roundOverlaySuccessMessage = ref<string>("");
const showHiddenVerfahren = ref<boolean>(false);
const showProcedureOverlay = ref<boolean>(false);
const showRoundOverlay = ref<boolean>(false);
const showStartRoundOverlay = ref<boolean>(false);
const showDeleteProcedureOverlay = ref<boolean>(false);
const showDeleteRoundOverlay = ref<boolean>(false);
const pendingStartRound = ref<Anmelderunde | null>(null);
const pendingDeleteProcedure = ref<Anmeldeverfahren | null>(null);
const pendingDeleteRound = ref<Anmelderunde | null>(null);
let successMessageTimeoutId: ReturnType<typeof setTimeout> | null = null;
let procedureOverlaySuccessTimeoutId: ReturnType<typeof setTimeout> | null = null;
let roundOverlaySuccessTimeoutId: ReturnType<typeof setTimeout> | null = null;

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

const workingRunde = computed<Anmelderunde | null>(
  () => runden.value.find((item) => item.status === "In Bearbeitung") || null,
);

const focusedRunde = computed<Anmelderunde | null>(
  () => runden.value.find((item) => item.id === focusedRundenId.value) || activeRunde.value || null,
);

const selectedProcedureLocked = computed<boolean>(() => selectedVerfahren.value?.status === "Beendet");
const procedureFormMode = computed<"full" | "limited" | "readonly">(() => {
  if (props.isReadonly) return "readonly";
  if (!verfahrenForm.value.id || verfahrenForm.value.status === "Vorbereitet") return "full";
  return verfahrenForm.value.status === "In Bearbeitung" ? "limited" : "readonly";
});
const procedureVisibilityEditable = computed<boolean>(() => (
  !props.isReadonly && (verfahrenForm.value.status === "Vorbereitet" || verfahrenForm.value.status === "Beendet")
));
const hasProcedureFormChanges = computed<boolean>(() => {
  if (!verfahrenForm.value.id) return true;
  const savedProcedure = verfahren.value.find((item) => item.id === verfahrenForm.value.id) || null;
  if (!savedProcedure) return false;

  return (
    verfahrenForm.value.schuljahr !== savedProcedure.schuljahr
    || verfahrenForm.value.bezeichnung !== savedProcedure.bezeichnung
    || verfahrenForm.value.verfahrenstyp !== savedProcedure.verfahrenstyp
    || verfahrenForm.value.status !== savedProcedure.status
    || verfahrenForm.value.sichtbar !== savedProcedure.sichtbar
  );
});
const roundFormMode = computed<"full" | "limited" | "readonly">(() => {
  if (props.isReadonly) return "readonly";
  const round = runden.value.find((item) => item.id === rundenForm.value.id) || null;
  if (!round) return "full";
  if (selectedProcedureLocked.value || round.status === "Beendet") return "readonly";
  return round.status === "In Bearbeitung" ? "limited" : "full";
});
const hasRoundFormChanges = computed<boolean>(() => {
  if (!rundenForm.value.id) return true;
  const savedRound = runden.value.find((item) => item.id === rundenForm.value.id) || null;
  if (!savedRound) return false;

  return (
    rundenForm.value.runden_nummer !== savedRound.runden_nummer
    || rundenForm.value.bezeichnung !== savedRound.bezeichnung
    || rundenForm.value.startdatum !== (savedRound.startdatum || "")
    || rundenForm.value.enddatum !== (savedRound.enddatum || "")
    || rundenForm.value.status !== savedRound.status
  );
});

const currentVerfahrenTitle = computed<string>(() => (
  selectedVerfahren.value
    ? `${selectedVerfahren.value.schuljahr} ${selectedVerfahren.value.bezeichnung}`
    : "Kein Verfahren ausgewaehlt"
));

const currentRundenTitle = computed<string>(() => (
  activeRunde.value
    ? `Runde ${activeRunde.value.runden_nummer} ${activeRunde.value.bezeichnung}`
    : "Keine Runde ausgewaehlt"
));

const currentInProgressRound = computed<Anmelderunde | null>(
  () => workingRunde.value,
);

const nextSuggestedRoundNumber = computed<number>(() => (
  runden.value.reduce(
    (highestRoundNumber, item) => Math.max(highestRoundNumber, Number(item.runden_nummer) || 0),
    0,
  ) + 1
));

const canCreateRound = computed<boolean>(() => (
  !props.isReadonly
  && !!selectedVerfahrenId.value
  && !selectedProcedureLocked.value
));

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
    verfahrenStatus: selectedVerfahren.value?.status || null,
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

function showProcedureOverlaySuccess(message: string) {
  if (procedureOverlaySuccessTimeoutId) clearTimeout(procedureOverlaySuccessTimeoutId);
  procedureOverlaySuccessMessage.value = message;
  procedureOverlaySuccessTimeoutId = setTimeout(() => {
    procedureOverlaySuccessMessage.value = "";
    procedureOverlaySuccessTimeoutId = null;
  }, 5000);
}

function showRoundOverlaySuccess(message: string) {
  if (roundOverlaySuccessTimeoutId) clearTimeout(roundOverlaySuccessTimeoutId);
  roundOverlaySuccessMessage.value = message;
  roundOverlaySuccessTimeoutId = setTimeout(() => {
    roundOverlaySuccessMessage.value = "";
    roundOverlaySuccessTimeoutId = null;
  }, 5000);
}

function selectRoundContext(rundenId: number | null) {
  activeRundenId.value = rundenId;
  focusedRundenId.value = rundenId;
}

function resetProcedureSelectionContext() {
  selectedVerfahrenId.value = null;
  activeRundenId.value = null;
  focusedRundenId.value = null;
  runden.value = [];
  emitContext();
}

function canDeleteProcedure(item: Anmeldeverfahren | null | undefined) {
  return item?.status === "Beendet";
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
    const sortedRows = [...rows].sort((left, right) => left.runden_nummer - right.runden_nummer || left.id - right.id);
    const preferredRound = preferredFocusedRoundId
      ? rows.find((item) => item.id === preferredFocusedRoundId) || null
      : null;
    const selectedRound = preferredRound
      || rows.find((item) => item.id === activeRundenId.value)
      || sortedRows[0]
      || null;
    activeRundenId.value = selectedRound?.id ?? null;
    focusedRundenId.value = selectedRound?.id ?? null;
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

function resetVerfahrenFormToSelection() {
  const procedure = verfahren.value.find((item) => item.id === verfahrenForm.value.id) || null;
  if (procedure) {
    openEditProcedureOverlay(procedure);
    return;
  }
  resetVerfahrenForm();
}

function resetRundenForm() {
  const nextRoundNumber = nextSuggestedRoundNumber.value;
  rundenForm.value = {
    ...createEmptyRundenForm(),
    runden_nummer: nextRoundNumber,
    bezeichnung: nextRoundNumber ? `Runde ${nextRoundNumber}` : "",
  };
}

function resetRundenFormToSelection() {
  const round = runden.value.find((item) => item.id === rundenForm.value.id) || null;
  if (round) {
    openEditRoundOverlay(round);
    return;
  }
  resetRundenForm();
}

function openCreateProcedureOverlay() {
  if (props.isReadonly) return;
  resetVerfahrenForm();
  procedureOverlaySuccessMessage.value = "";
  showProcedureOverlay.value = true;
}

function openEditProcedureOverlay(item: Anmeldeverfahren) {
  if (props.isReadonly) return;
  verfahrenForm.value = {
    id: item.id,
    schuljahr: item.schuljahr,
    bezeichnung: item.bezeichnung,
    verfahrenstyp: item.verfahrenstyp,
    status: item.status,
    sichtbar: item.sichtbar,
  };
  procedureOverlaySuccessMessage.value = "";
  showProcedureOverlay.value = true;
}

function openCreateRoundOverlay() {
  if (props.isReadonly) return;
  if (!selectedVerfahrenId.value) {
    showError(null, "Bitte zuerst ein Anmeldeverfahren auswaehlen.");
    return;
  }
  resetRundenForm();
  roundOverlaySuccessMessage.value = "";
  showRoundOverlay.value = true;
}

function openEditRoundOverlay(item: Anmelderunde) {
  if (props.isReadonly) return;
  focusedRundenId.value = item.id;
  rundenForm.value = {
    id: item.id,
    runden_nummer: item.runden_nummer,
    bezeichnung: item.bezeichnung,
    startdatum: item.startdatum || "",
    enddatum: item.enddatum || "",
    status: item.status,
  };
  roundOverlaySuccessMessage.value = "";
  showRoundOverlay.value = true;
}

async function selectVerfahren(id: number) {
  selectedVerfahrenId.value = id;
  await loadRunden(id);
}

function selectRunde(id: number) {
  focusedRundenId.value = id;
  activeRundenId.value = id;
  emitContext();
}

function updateShowHiddenVerfahren(value: boolean) {
  showHiddenVerfahren.value = value;
  loadVerfahren(selectedVerfahrenId.value);
}

async function submitVerfahren() {
  if (props.isReadonly) return;
  if (verfahrenForm.value.id && !hasProcedureFormChanges.value) return;
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
    const isExistingProcedure = Boolean(verfahrenForm.value.id);
    const payload = {
      schuljahr,
      bezeichnung,
      verfahrenstyp: verfahrenForm.value.verfahrenstyp,
      status: verfahrenForm.value.status,
      sichtbar: verfahrenForm.value.sichtbar,
    };

    const response = verfahrenForm.value.id && verfahrenForm.value.status === "Beendet"
      ? await anmeldeverfahrenService.updateVisibility(verfahrenForm.value.id, verfahrenForm.value.sichtbar, props.token)
      : verfahrenForm.value.id
      ? await anmeldeverfahrenService.update(verfahrenForm.value.id, payload, props.token)
      : await anmeldeverfahrenService.create(payload, props.token);

    await loadVerfahren(response.row?.id || null);
    if (isExistingProcedure && verfahrenForm.value.id) {
      const updatedProcedure = verfahren.value.find((item) => item.id === verfahrenForm.value.id) || response.row;
      if (updatedProcedure) {
        verfahrenForm.value = {
          id: updatedProcedure.id,
          schuljahr: updatedProcedure.schuljahr,
          bezeichnung: updatedProcedure.bezeichnung,
          verfahrenstyp: updatedProcedure.verfahrenstyp,
          status: updatedProcedure.status,
          sichtbar: updatedProcedure.sichtbar,
        };
      }
    } else {
      showProcedureOverlay.value = false;
    }
    if (isExistingProcedure) {
      showProcedureOverlaySuccess(response.message || "Anmeldeverfahren erfolgreich gespeichert.");
    } else {
      showSuccess(response.message || "Anmeldeverfahren erfolgreich gespeichert.");
    }
  } catch (error) {
    showError(error, "Anmeldeverfahren konnte nicht gespeichert werden.");
  } finally {
    savingVerfahren.value = false;
  }
}

function openDeleteProcedureOverlay(item: Anmeldeverfahren) {
  if (props.isReadonly) return;
  if (!canDeleteProcedure(item)) {
    showError(null, "Nur beendete Verfahren koennen geloescht werden.");
    return;
  }
  pendingDeleteProcedure.value = item;
  showDeleteProcedureOverlay.value = true;
}

function closeDeleteProcedureOverlay() {
  if (deletingVerfahrenId.value) return;
  showDeleteProcedureOverlay.value = false;
  pendingDeleteProcedure.value = null;
}

function resetDeleteProcedureOverlay() {
  showDeleteProcedureOverlay.value = false;
  pendingDeleteProcedure.value = null;
}

async function confirmDeleteVerfahren() {
  if (props.isReadonly) return;
  if (!pendingDeleteProcedure.value || deletingVerfahrenId.value) return;
  const item = pendingDeleteProcedure.value;
  const deletingSelectedProcedure = selectedVerfahrenId.value === item.id;

  deletingVerfahrenId.value = item.id;
  try {
    const response = await anmeldeverfahrenService.remove(item.id, props.token);
    resetDeleteProcedureOverlay();
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
  if (props.isReadonly) return;
  if (rundenForm.value.id && !hasRoundFormChanges.value) return;
  if (!selectedVerfahrenId.value) {
    errorMessage.value = "Bitte zuerst ein Anmeldeverfahren auswaehlen.";
    successMessage.value = "";
    return;
  }

  const bezeichnung = rundenForm.value.bezeichnung.trim();
  if (!Number.isInteger(rundenForm.value.runden_nummer) || Number(rundenForm.value.runden_nummer) <= 0) {
    errorMessage.value = "Rundennummer muss eine positive ganze Zahl sein.";
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
    const isExistingRound = Boolean(rundenForm.value.id);
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
    if (isExistingRound && rundenForm.value.id) {
      const updatedRound = runden.value.find((item) => item.id === rundenForm.value.id) || response.row;
      if (updatedRound) {
        rundenForm.value = {
          id: updatedRound.id,
          runden_nummer: updatedRound.runden_nummer,
          bezeichnung: updatedRound.bezeichnung,
          startdatum: updatedRound.startdatum || "",
          enddatum: updatedRound.enddatum || "",
          status: updatedRound.status,
        };
      }
    } else {
      showRoundOverlay.value = false;
    }
    if (isExistingRound) {
      showRoundOverlaySuccess(response.message || "Anmelderunde erfolgreich gespeichert.");
    } else {
      showSuccess(response.message || "Anmelderunde erfolgreich gespeichert.");
    }
  } catch (error) {
    showError(error, "Anmelderunde konnte nicht gespeichert werden.");
  } finally {
    savingRunden.value = false;
  }
}

function deleteRunde(item: Anmelderunde) {
  if (props.isReadonly) return;
  pendingDeleteRound.value = item;
  showDeleteRoundOverlay.value = true;
}

function closeDeleteRoundOverlay() {
  if (deletingRundenId.value) return;
  showDeleteRoundOverlay.value = false;
  pendingDeleteRound.value = null;
}

function resetDeleteRoundOverlay() {
  showDeleteRoundOverlay.value = false;
  pendingDeleteRound.value = null;
}

async function confirmDeleteRunde() {
  if (props.isReadonly) return;
  if (!pendingDeleteRound.value || deletingRundenId.value) return;
  const item = pendingDeleteRound.value;

  deletingRundenId.value = item.id;
  try {
    const response = await anmelderundenService.remove(item.id, props.token);
    resetDeleteRoundOverlay();
    await loadRunden(selectedVerfahrenId.value);
    showSuccess(response.message || "Anmelderunde erfolgreich geloescht.");
  } catch (error) {
    showError(error, "Anmelderunde konnte nicht geloescht werden.");
  } finally {
    deletingRundenId.value = null;
  }
}

async function startProcedure() {
  if (props.isReadonly) return;
  if (!selectedVerfahren.value) return;
  try {
    const response = await anmeldeverfahrenService.start(selectedVerfahren.value.id, props.token);
    if (response.row?.id) {
      selectedVerfahrenId.value = response.row.id;
    }
    await loadVerfahren(response.row?.id || selectedVerfahren.value.id);
    const roundOne = runden.value.find((item) => item.runden_nummer === 1) || null;
    if (roundOne) {
      selectRoundContext(roundOne.id);
      runden.value = runden.value.map((item) => ({
        ...item,
        status: item.id === roundOne.id ? "In Bearbeitung" : item.status,
        ist_arbeitsrunde: item.id === roundOne.id,
      }));
      emitContext();
    }
    showSuccess(response.message);
  } catch (error) {
    showError(error, "Das Verfahren konnte nicht gestartet werden.");
  }
}

async function finishProcedure() {
  if (props.isReadonly) return;
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

function selectWorkingRound(id: number) {
  selectRunde(id);
}

function openStartRoundOverlay(item: Anmelderunde) {
  if (props.isReadonly) return;
  pendingStartRound.value = item;
  showStartRoundOverlay.value = true;
}

function closeStartRoundOverlay() {
  showStartRoundOverlay.value = false;
  pendingStartRound.value = null;
}

async function startRound() {
  if (props.isReadonly) return;
  if (!pendingStartRound.value) return;
  const item = pendingStartRound.value;
  try {
    const response = await anmelderundenService.startRound(item.id, props.token);
    closeStartRoundOverlay();
    selectRoundContext(response.next_round?.id ?? item.id);
    if (response.current_round?.id && response.next_round?.id) {
      runden.value = runden.value.map((entry) => {
        if (entry.id === response.current_round.id) return { ...entry, status: "Beendet", ist_arbeitsrunde: false };
        if (entry.id === response.next_round.id) return { ...entry, status: "In Bearbeitung", ist_arbeitsrunde: true };
        return entry;
      });
    }
    emitContext();
    await loadVerfahren(selectedVerfahrenId.value);
    selectRoundContext(response.next_round?.id ?? item.id);
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
  if (procedureOverlaySuccessTimeoutId) clearTimeout(procedureOverlaySuccessTimeoutId);
  if (roundOverlaySuccessTimeoutId) clearTimeout(roundOverlaySuccessTimeoutId);
});
</script>

<template>
  <section class="verfahren-und-runden-bereich">
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
        :show-hidden="showHiddenVerfahren"
        :is-readonly="isReadonly"
        :can-create="!isReadonly"
        :can-start="!isReadonly && selectedVerfahren?.status === 'Vorbereitet'"
        :can-finish="!isReadonly && selectedVerfahren?.status === 'In Bearbeitung'"
        @select="selectVerfahren"
        @edit="openEditProcedureOverlay"
        @delete="openDeleteProcedureOverlay"
        @create="openCreateProcedureOverlay"
        @start="startProcedure"
        @finish="finishProcedure"
        @update:show-hidden="updateShowHiddenVerfahren"
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
        :is-readonly="isReadonly"
        :next-available-round-number="nextSuggestedRoundNumber"
        @select="selectRunde"
        @edit="openEditRoundOverlay"
        @delete="deleteRunde"
        @select-working="selectWorkingRound"
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
        <div v-else-if="procedureOverlaySuccessMessage" class="anm-overlay-feedback anm-overlay-feedback-success">
          {{ procedureOverlaySuccessMessage }}
        </div>
        <AnmeldeverfahrenForm
          v-model="verfahrenForm"
          :saving="savingVerfahren"
          :mode="procedureFormMode"
          :visibility-editable="procedureVisibilityEditable"
          :has-changes="hasProcedureFormChanges"
          @submit="submitVerfahren"
          @reset="resetVerfahrenFormToSelection"
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
        <div v-else-if="roundOverlaySuccessMessage" class="anm-overlay-feedback anm-overlay-feedback-success">
          {{ roundOverlaySuccessMessage }}
        </div>
        <AnmelderundenForm
          v-model="rundenForm"
          :verfahren="selectedVerfahren"
          :mode="roundFormMode"
          :saving="savingRunden"
          :has-changes="hasRoundFormChanges"
          @submit="submitRunde"
          @reset="resetRundenFormToSelection"
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
            <li>Abgeschlossene Runden bleiben weiterhin zur Ansicht verfuegbar.</li>
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
      v-if="showDeleteRoundOverlay && pendingDeleteRound"
      class="anm-overlay-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anm-delete-round-overlay-title"
      @click.self="closeDeleteRoundOverlay"
    >
      <section class="anm-overlay-card anm-delete-procedure-card">
        <div class="anm-overlay-head">
          <h3 id="anm-delete-round-overlay-title">Runde endgueltig loeschen?</h3>
          <button class="anm-overlay-close" type="button" :disabled="deletingRundenId === pendingDeleteRound.id" @click="closeDeleteRoundOverlay">
            Schliessen
          </button>
        </div>

        <div class="anm-delete-procedure-summary">
          <p><strong>Rundennummer:</strong> {{ pendingDeleteRound.runden_nummer }}</p>
          <p><strong>Bezeichnung:</strong> {{ pendingDeleteRound.bezeichnung }}</p>
          <p><strong>Status:</strong> {{ pendingDeleteRound.status }}</p>
          <p><strong>Zeitraum:</strong> {{ pendingDeleteRound.startdatum || "-" }} bis {{ pendingDeleteRound.enddatum || "-" }}</p>
        </div>

        <div class="anm-delete-procedure-warning">
          <p>Die Runde und ihre zugehoerigen Daten werden endgueltig geloescht.</p>
          <p><strong>Dieser Vorgang kann nicht rueckgaengig gemacht werden!</strong></p>
        </div>

        <div class="anm-actions">
          <button class="anm-overlay-close" type="button" :disabled="deletingRundenId === pendingDeleteRound.id" @click="closeDeleteRoundOverlay">
            Abbrechen
          </button>
          <button class="anm-overlay-close" type="button" :disabled="deletingRundenId === pendingDeleteRound.id" @click="confirmDeleteRunde">
            {{ deletingRundenId === pendingDeleteRound.id ? "Loesche..." : "Runde endgueltig loeschen" }}
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
          <p><strong>Dieser Vorgang kann nicht rueckgaengig gemacht werden!</strong></p>
        </div>

        <div class="anm-actions">
          <button class="anm-overlay-close" type="button" :disabled="deletingVerfahrenId === pendingDeleteProcedure.id" @click="closeDeleteProcedureOverlay">
            Abbrechen
          </button>
          <button class="anm-overlay-close" type="button" :disabled="deletingVerfahrenId === pendingDeleteProcedure.id" @click="confirmDeleteVerfahren">
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
  border-radius: 14px;
  padding: 12px 14px;
}

.feedback-panel-success {
  border: 1px solid #bfe5c9;
  background: #eefaf2;
  color: #1f5f37;
}

.feedback-title {
  margin: 0 0 6px;
  font-weight: 700;
}

.feedback-panel-success p:last-child {
  margin: 0;
}

.feedback-fade-enter-active,
.feedback-fade-leave-active {
  transition: opacity 0.32s ease, transform 0.32s ease;
}

.feedback-fade-enter-from,
.feedback-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.feedback-panel {
  margin-bottom: 18px;
}

.anm-overlay-card {
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background: #ffffff;
  box-shadow: 0 16px 32px rgba(23, 58, 108, 0.05);
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
