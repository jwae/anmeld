<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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
const selectedRundenId = ref<number | null>(props.initialRundeId ?? null);
const loadingVerfahren = ref<boolean>(false);
const loadingRunden = ref<boolean>(false);
const savingVerfahren = ref<boolean>(false);
const savingRunden = ref<boolean>(false);
const deletingVerfahrenId = ref<number | null>(null);
const deletingRundenId = ref<number | null>(null);
const errorMessage = ref<string>("");
const successMessage = ref<string>("");
const showNextRoundOverlay = ref<boolean>(false);
const savingNextRound = ref<boolean>(false);

const verfahrenForm = ref<VerfahrenFormState>(createEmptyVerfahrenForm());
const rundenForm = ref<RundenFormState>(createEmptyRundenForm());

function createEmptyVerfahrenForm(): VerfahrenFormState {
  return {
    id: null,
    schuljahr: "",
    bezeichnung: "",
    verfahrenstyp: "GS",
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

const nextRoundCandidate = computed<Anmelderunde | null>(() => {
  const currentRound = selectedRunde.value;
  if (!currentRound) return null;
  return runden.value.find((item) => item.runden_nummer === currentRound.runden_nummer + 1) || null;
});

const canStartNextRound = computed<boolean>(() => (
  Boolean(selectedVerfahrenId.value)
  && Boolean(selectedRunde.value)
  && selectedRunde.value?.status === "aktiv"
));

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

function emitContext() {
  emit("update-context", {
    verfahren: currentVerfahrenTitle.value,
    runde: currentRundenTitle.value,
  });
  emit("update-selection", {
    verfahrenId: selectedVerfahrenId.value,
    verfahrenstyp: selectedVerfahren.value?.verfahrenstyp || null,
    rundeId: selectedRundenId.value,
    rundeStatus: selectedRunde.value?.status || null,
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
    loadingVerfahren.value = false;

    const desiredSelection = preferredSelectionId ?? selectedVerfahrenId.value;
    const stillExists = rows.some((item) => item.id === desiredSelection);
    const nextSelectionId = stillExists ? desiredSelection : null;
    selectedVerfahrenId.value = nextSelectionId;

    if (nextSelectionId) {
      void loadRunden(nextSelectionId);
    } else {
      runden.value = [];
      selectedRundenId.value = null;
      emitContext();
    }
  } catch (error) {
    showError(error, "Anmeldeverfahren konnten nicht geladen werden.");
    loadingVerfahren.value = false;
  } finally {
    if (loadingVerfahren.value) {
      loadingVerfahren.value = false;
    }
  }
}

async function loadRunden(verfahrenId?: number | null) {
  const effectiveId = verfahrenId ?? selectedVerfahrenId.value;
  if (!effectiveId) {
    runden.value = [];
    selectedRundenId.value = null;
    resetRundenForm();
    emitContext();
    return;
  }

  loadingRunden.value = true;
  try {
    const rows = await anmelderundenService.listByVerfahren(effectiveId, props.token);
    runden.value = rows;
    const currentSelectedExists = rows.some((item) => item.id === selectedRundenId.value);
    selectedRundenId.value = currentSelectedExists ? selectedRundenId.value : null;
    syncRundenFormToSelection();
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
    verfahrenstyp: item.verfahrenstyp,
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

function syncRundenFormToSelection() {
  const currentRound = runden.value.find((item) => item.id === selectedRundenId.value) || null;
  if (currentRound) {
    editRunde(currentRound);
    return;
  }
  resetRundenForm();
  emitContext();
}

async function selectVerfahren(id: number) {
  selectedVerfahrenId.value = id;
  selectedRundenId.value = null;
  await loadRunden(id);
}

function selectRunde(id: number) {
  selectedRundenId.value = id;
  syncRundenFormToSelection();
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
      verfahrenstyp: verfahrenForm.value.verfahrenstyp,
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
  if (item.status === "abgeschlossen") {
    errorMessage.value = "Abgeschlossene Runden koennen nicht geloescht werden.";
    successMessage.value = "";
    return;
  }

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

function openNextRoundOverlay() {
  if (!canStartNextRound.value) return;
  showNextRoundOverlay.value = true;
}

function closeNextRoundOverlay() {
  if (savingNextRound.value) return;
  showNextRoundOverlay.value = false;
}

async function startNextRound() {
  if (!selectedRunde.value) {
    errorMessage.value = "Bitte zuerst eine aktive Runde auswaehlen.";
    successMessage.value = "";
    return;
  }

  savingNextRound.value = true;
  try {
    const response = await anmelderundenService.startNextRound(selectedRunde.value.id, props.token);
    await loadRunden(selectedVerfahrenId.value);
    if (response.next_round?.id) {
      selectedRundenId.value = response.next_round.id;
      const refreshedNextRound = runden.value.find((item) => item.id === response.next_round.id) || response.next_round;
      editRunde(refreshedNextRound);
    } else {
      resetRundenForm();
      emitContext();
    }
    showNextRoundOverlay.value = false;
    showSuccess(response.message || "Die naechste Runde wurde erfolgreich gestartet.");
  } catch (error) {
    showError(error, "Der Rundenwechsel konnte nicht ausgefuehrt werden.");
  } finally {
    savingNextRound.value = false;
  }
}

onMounted(async () => {
  await loadVerfahren(props.initialVerfahrenId);
});
</script>

<template>
  <section class="verfahren-und-runden-bereich">
    <section class="anm-current-selection-card">
      <div class="anm-card-head">
        <div>
          <p class="anm-roadmap-eyebrow">Aktuelle Auswahl</p>
          <h3>Verfahren und Runde festlegen</h3>
          <p>Diese Auswahl bildet den aktuellen Arbeitskontext fuer die weiteren Module.</p>
        </div>
      </div>

      <div class="anm-form-grid anm-current-selection-grid">
        <label class="field-block anm-current-selection-field">
          <span class="field-label anm-current-selection-label">Aktuelles Verfahren</span>
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

        <div class="anm-current-selection-round-row">
          <label class="field-block anm-current-selection-field">
            <span class="field-label anm-current-selection-label">Aktuelle Runde</span>
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

          <button
            class="btn-secondary anm-current-selection-button anm-current-selection-button-danger"
            type="button"
            :disabled="!canStartNextRound"
            title="Die aktive Runde abschliessen und die naechste Runde starten."
            @click="openNextRoundOverlay"
          >
            Naechste Runde starten
          </button>
        </div>
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

    <div
      v-if="showNextRoundOverlay"
      class="anm-overlay-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anm-next-round-overlay-title"
      @click.self="closeNextRoundOverlay"
    >
      <section class="anm-overlay-card">
        <div class="anm-overlay-head">
          <h3 id="anm-next-round-overlay-title">Naechste Runde starten</h3>
        </div>
        <div class="anm-overlay-copy">
          <p>
            Die aktuelle Runde bleibt unveraendert erhalten und wird auf "abgeschlossen" gesetzt.
            Alle aktiven Schueler werden in die naechste Runde uebernommen.
          </p>
          <p>
            Achtung: Abgeschlossene Runden sind nur noch lesbar und koennen nicht mehr bearbeitet werden.
          </p>
          <p>
            <strong>
              Runde {{ selectedRunde?.runden_nummer || "-" }} abschliessen und
              Runde {{ (selectedRunde?.runden_nummer || 0) + 1 }} starten?
            </strong>
          </p>
          <p v-if="nextRoundCandidate">
            Die vorhandene Runde {{ nextRoundCandidate.runden_nummer }} wird verwendet.
          </p>
          <p v-else>
            Die naechste Runde wird automatisch angelegt.
          </p>
          <p class="anm-overlay-warning">
            Fortfahren?
          </p>
        </div>
        <div class="anm-overlay-actions">
          <button class="btn-secondary anm-overlay-close" type="button" :disabled="savingNextRound" @click="closeNextRoundOverlay">
            Abbrechen
          </button>
          <button
            class="btn-secondary anm-current-selection-button anm-current-selection-button-danger"
            type="button"
            :disabled="savingNextRound"
            @click="startNextRound"
          >
            {{ savingNextRound ? "Starte..." : "Fortfahren" }}
          </button>
        </div>
      </section>
    </div>

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
  </section>
</template>

<style scoped>
.verfahren-und-runden-bereich {
  display: grid;
  gap: 18px;
}

.anm-current-selection-card {
  display: grid;
  gap: 16px;
  padding: 16px;
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background: #ffffff;
  box-shadow: 0 16px 32px rgba(23, 58, 108, 0.05);
}

.anm-roadmap-eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: 700;
  color: #6680a3;
}

.anm-current-selection-card h3 {
  margin: 0;
  color: #19385e;
  font-size: 1.12rem;
  line-height: 1.25;
}

.anm-current-selection-card p {
  margin: 8px 0 0;
  color: #4a607e;
  line-height: 1.55;
}

.anm-current-selection-card .anm-card-head p {
  margin-top: 4px;
  color: #607794;
  font-size: 12px;
  line-height: 1.4;
}

.anm-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1.3fr) minmax(300px, 0.9fr);
}

.anm-grid-top {
  align-items: stretch;
}

.anm-card-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.anm-current-selection-button {
  min-height: 34px;
  padding: 10px 18px;
  border-radius: 999px;
  font-weight: 700;
  white-space: nowrap;
  justify-self: end;
  cursor: pointer;
  transition: all 0.2s ease;
}

.anm-overlay-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(18, 34, 56, 0.42);
  backdrop-filter: blur(2px);
}

.anm-overlay-card {
  width: min(560px, 100%);
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background: #ffffff;
  box-shadow: 0 20px 48px rgba(16, 39, 73, 0.18);
}

.anm-overlay-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.anm-overlay-head h3 {
  margin: 0;
  color: #19385e;
  font-size: 1.12rem;
  line-height: 1.25;
}

.anm-overlay-card p {
  margin: 0;
  color: #4a607e;
  line-height: 1.55;
}

.anm-overlay-copy {
  display: grid;
  gap: 12px;
}

.anm-overlay-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.anm-overlay-warning {
  color: #8c2e2e !important;
  font-weight: 700;
}

.anm-overlay-close {
  min-height: 34px;
  padding: 10px 18px;
  border: 1px solid #fca5a5;
  border-radius: 999px;
  background: #fee2e2;
  color: #991b1b;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.anm-overlay-close:hover {
  background: #fecaca;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15);
}

.anm-form-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.anm-current-selection-grid {
  gap: 10px;
  grid-template-columns: auto auto;
  justify-content: start;
  align-items: end;
}

.anm-current-selection-field {
  gap: 5px;
  min-width: 0;
  width: min(320px, 100%);
  max-width: 100%;
}

.anm-current-selection-round-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
}

.anm-current-selection-label {
  color: #607794;
  font-size: 12px;
  font-weight: 600;
}

.anm-current-selection-field :deep(select) {
  min-height: 34px;
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #cfdceb;
  border-radius: 10px;
  background: linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  color: #19385e;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
}

.anm-current-selection-field :deep(select:disabled) {
  background: #f5f8fc;
  color: #7d90a8;
}

.anm-current-selection-button-danger {
  border: 1px solid #fca5a5;
  background: #fee2e2;
  color: #991b1b;
}

.anm-current-selection-button-danger:hover:not(:disabled) {
  background: #fecaca;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15);
}

.anm-current-selection-button-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 1080px) {
  .anm-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .anm-form-grid {
    grid-template-columns: 1fr;
  }

  .anm-current-selection-round-row {
    grid-template-columns: 1fr;
  }

  .anm-current-selection-field {
    width: 100%;
  }

  .anm-current-selection-button {
    justify-self: start;
  }

  .anm-overlay-head {
    display: grid;
    grid-template-columns: 1fr;
  }

  .anm-overlay-actions {
    justify-content: stretch;
  }
}
</style>
