<script setup lang="ts">
import { computed, ref, watch } from "vue";
import auswertungenService, {
  type AuswertungFormat,
  type AuswertungsKachel,
  type OffeneAnmeldungenResponse,
  type PoolSchuelerAktuelleRundeResponse,
  type SchuelerNachHerkunftsschuleResponse,
  type SchuelerRundenuebersichtResponse,
} from "../services/auswertungenService";

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
const errorMessage = ref("");
const successMessage = ref("");
const cards = ref<AuswertungsKachel[]>([]);
const expandedCardIds = ref<string[]>([]);
const selectedOptions = ref<Record<string, string>>({});
const actionLoadingKey = ref("");
const previewOverlayOpen = ref(false);
const previewLoading = ref(false);
const previewErrorMessage = ref("");
let errorMessageTimer: ReturnType<typeof setTimeout> | null = null;
let successMessageTimer: ReturnType<typeof setTimeout> | null = null;

type PreviewColumn = {
  key: string;
  label: string;
  className?: string;
};

type PreviewState = {
  key: string;
  title: string;
  verfahrenLabel: string;
  rundeLabel?: string;
  generatedAt: string;
  total: number;
  rows: Array<Record<string, string | number>>;
  columns: PreviewColumn[];
  emptyMessage: string;
  exportBereich: string;
  exportAuswertung: string;
};

const previewData = ref<PreviewState | null>(null);

const canLoad = computed(() => !!props.verfahrenId && !!props.rundeId);

function formatLabel(format: AuswertungFormat) {
  if (format === "pdf") return "PDF erzeugen";
  if (format === "excel") return "Excel exportieren";
  return "Word erzeugen";
}

function actionKey(cardId: string, action: string) {
  return `${cardId}:${action}`;
}

function clearErrorMessageTimer() {
  if (errorMessageTimer) {
    clearTimeout(errorMessageTimer);
    errorMessageTimer = null;
  }
}

function clearSuccessMessageTimer() {
  if (successMessageTimer) {
    clearTimeout(successMessageTimer);
    successMessageTimer = null;
  }
}

function formatListNumber(index: number) {
  return String(index + 1).padStart(2, "0");
}

function isExpanded(cardId: string) {
  return expandedCardIds.value.includes(cardId);
}

function toggleCard(cardId: string) {
  if (isExpanded(cardId)) {
    expandedCardIds.value = expandedCardIds.value.filter((id) => id !== cardId);
    return;
  }
  expandedCardIds.value = [...expandedCardIds.value, cardId];
}

function ensureSelectedOptions(nextCards: AuswertungsKachel[]) {
  const nextSelection: Record<string, string> = {};
  for (const card of nextCards) {
    const current = String(selectedOptions.value[card.id] || "").trim();
    const hasCurrent = card.options.some((option) => option.key === current);
    nextSelection[card.id] = hasCurrent ? current : String(card.options[0]?.key || "");
  }
  selectedOptions.value = nextSelection;
}

function isRoundOverviewOption(cardId: string, optionKey: string) {
  return cardId === "statistiken" && optionKey === "entwicklung-ueber-die-runden";
}

function isOpenStatusOption(cardId: string, optionKey: string) {
  return cardId === "schuelerlisten" && optionKey === "warteliste";
}

function isPoolOriginOption(cardId: string, optionKey: string) {
  return cardId === "schuelerlisten" && optionKey === "nur-pool";
}

function isSourceSchoolOption(cardId: string, optionKey: string) {
  return cardId === "schuelerlisten" && optionKey === "nach-herkunftsschule";
}

function isPreviewOption(cardId: string, optionKey: string) {
  return isRoundOverviewOption(cardId, optionKey)
    || isOpenStatusOption(cardId, optionKey)
    || isPoolOriginOption(cardId, optionKey)
    || isSourceSchoolOption(cardId, optionKey);
}

function isImplementedDownload(cardId: string, optionKey: string) {
  return (cardId === "verfahrensuebersicht" && optionKey === "verfahrensdaten")
    || isPreviewOption(cardId, optionKey);
}

function shouldShowPreviewButton(cardId: string) {
  if (cardId === "statistiken" || cardId === "schuelerlisten") return true;
  return isPreviewOption(cardId, String(selectedOptions.value[cardId] || "").trim());
}

function isPreviewOnlyCard(cardId: string) {
  return cardId === "statistiken" || cardId === "schuelerlisten";
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function loadCatalog() {
  if (!props.verfahrenId || !props.rundeId) {
    cards.value = [];
    selectedOptions.value = {};
    errorMessage.value = "";
    successMessage.value = "";
    return;
  }

  try {
    loading.value = true;
    errorMessage.value = "";
    successMessage.value = "";
    const response = await auswertungenService.getCatalog(props.verfahrenId, props.rundeId, props.token);
    cards.value = Array.isArray(response?.cards) ? response.cards : [];
    ensureSelectedOptions(cards.value);
  } catch (error: any) {
    cards.value = [];
    selectedOptions.value = {};
    errorMessage.value = error?.response?.data?.error || error?.message || "Die Auswertungen konnten nicht geladen werden.";
  } finally {
    loading.value = false;
  }
}

function closePreviewOverlay() {
  previewOverlayOpen.value = false;
  previewLoading.value = false;
  previewErrorMessage.value = "";
}

function createRoundOverviewPreviewState(response: SchuelerRundenuebersichtResponse): PreviewState {
  return {
    key: "statistiken:entwicklung-ueber-die-runden",
    title: response.title,
    verfahrenLabel: response.verfahren?.bezeichnung || props.context.verfahren,
    generatedAt: response.generated_at || "-",
    total: Number(response.total || 0),
    rows: Array.isArray(response.rows) ? response.rows : [],
    columns: [
      { key: "lfd_nr", label: "Lfd. Nr." },
      { key: "schueler_id", label: "Schueler-ID" },
      { key: "name_vorname", label: "Name, Vorname" },
      { key: "geburtsdatum", label: "Geb.-Dat." },
      { key: "abgebende_schule_nr", label: "Nr. abg. Schule" },
      { key: "abgebende_schule_name", label: "Name abgebende Schule" },
      { key: "r1_status", label: "R1-Status", className: "round-col round-col-r1" },
      { key: "r1_schule", label: "R1-Schule", className: "round-col round-col-r1" },
      { key: "r2_status", label: "R2-Status", className: "round-col round-col-r2" },
      { key: "r2_schule", label: "R2-Schule", className: "round-col round-col-r2" },
      { key: "r3_status", label: "R3-Status", className: "round-col round-col-r3" },
      { key: "r3_schule", label: "R3-Schule", className: "round-col round-col-r3" },
    ],
    emptyMessage: "Keine Daten fuer dieses Verfahren vorhanden.",
    exportBereich: "statistiken",
    exportAuswertung: "entwicklung-ueber-die-runden",
  };
}

function createOpenStatusPreviewState(response: OffeneAnmeldungenResponse): PreviewState {
  const roundLabel = response.runde?.bezeichnung || (response.runde?.runden_nummer ? `Runde ${response.runde.runden_nummer}` : props.context.runde);
  return {
    key: "schuelerlisten:warteliste",
    title: response.title,
    verfahrenLabel: response.verfahren?.bezeichnung || props.context.verfahren,
    rundeLabel: roundLabel,
    generatedAt: response.generated_at || "-",
    total: Number(response.total || 0),
    rows: Array.isArray(response.rows) ? response.rows : [],
    columns: [
      { key: "lfd_nr", label: "Lfd. Nr." },
      { key: "schueler_id", label: "Schueler-ID" },
      { key: "name_vorname", label: "Name, Vorname" },
      { key: "geburtsdatum", label: "Geb.-Dat." },
      { key: "abgebende_schule_nr", label: "Nr. abg. Schule" },
      { key: "abgebende_schule_name", label: "Name abgebende Schule" },
      { key: "anmeldestatus", label: "Anmeldestatus" },
      { key: "schule", label: "Schule" },
      { key: "bemerkung", label: "Bemerkung" },
    ],
    emptyMessage: 'Fuer die ausgewaehlte Runde gibt es keine Schuelerinnen und Schueler mit den Anmeldestatus "Zuordnung", "Warteliste" oder "Ohne".',
    exportBereich: "schuelerlisten",
    exportAuswertung: "warteliste",
  };
}

function createPoolOriginPreviewState(response: PoolSchuelerAktuelleRundeResponse): PreviewState {
  const roundLabel = response.runde?.bezeichnung || (response.runde?.runden_nummer ? `Runde ${response.runde.runden_nummer}` : props.context.runde);
  return {
    key: "schuelerlisten:nur-pool",
    title: response.title,
    verfahrenLabel: response.verfahren?.bezeichnung || props.context.verfahren,
    rundeLabel: roundLabel,
    generatedAt: response.generated_at || "-",
    total: Number(response.total || 0),
    rows: Array.isArray(response.rows) ? response.rows : [],
    columns: [
      { key: "lfd_nr", label: "Lfd. Nr." },
      { key: "schueler_id", label: "Schueler-ID" },
      { key: "name_vorname", label: "Name, Vorname" },
      { key: "geburtsdatum", label: "Geb.-Dat." },
      { key: "abgebende_schule_nr", label: "Nr. abg. Schule" },
      { key: "abgebende_schule_name", label: "Name abgebende Schule" },
      { key: "anmeldestatus", label: "Anmeldestatus" },
      { key: "schule", label: "Schule" },
      { key: "bemerkung", label: "Bemerkung" },
    ],
    emptyMessage: 'Fuer die ausgewaehlte Runde gibt es keine Schuelerinnen und Schueler mit Herkunft "Pool".',
    exportBereich: "schuelerlisten",
    exportAuswertung: "nur-pool",
  };
}

function createSourceSchoolPreviewState(response: SchuelerNachHerkunftsschuleResponse): PreviewState {
  const roundLabel = response.runde?.bezeichnung || (response.runde?.runden_nummer ? `Runde ${response.runde.runden_nummer}` : props.context.runde);
  return {
    key: "schuelerlisten:nach-herkunftsschule",
    title: response.title,
    verfahrenLabel: response.verfahren?.bezeichnung || props.context.verfahren,
    rundeLabel: roundLabel,
    generatedAt: response.generated_at || "-",
    total: Number(response.total || 0),
    rows: Array.isArray(response.rows) ? response.rows : [],
    columns: [
      { key: "lfd_nr", label: "Lfd. Nr." },
      { key: "abgebende_schule_nr", label: "Schulnummer" },
      { key: "abgebende_schule_name", label: "Schulname" },
      { key: "name_vorname", label: "Name, Vorname" },
      { key: "geburtsdatum", label: "GebDat" },
      { key: "schule", label: "Zielschule" },
      { key: "anmeldestatus", label: "Anmeldestatus" },
      { key: "bemerkung", label: "Bemerkung" },
    ],
    emptyMessage: "Fuer die ausgewaehlte Runde gibt es keine Schuelerdaten.",
    exportBereich: "schuelerlisten",
    exportAuswertung: "nach-herkunftsschule",
  };
}

async function openPreview(card: AuswertungsKachel) {
  if (!props.verfahrenId || !props.rundeId) return;
  const selectedOption = String(selectedOptions.value[card.id] || "").trim();
  if (!isPreviewOption(card.id, selectedOption)) {
    errorMessage.value = "Die Vorschau ist fuer die aktuell ausgewaehlte Auswertung noch nicht verfuegbar.";
    successMessage.value = "";
    return;
  }

  try {
    actionLoadingKey.value = actionKey(card.id, "preview");
    previewOverlayOpen.value = true;
    previewLoading.value = true;
    previewErrorMessage.value = "";
    if (isRoundOverviewOption(card.id, selectedOption)) {
      const response = await auswertungenService.getSchuelerRundenuebersicht(props.verfahrenId, props.token);
      previewData.value = createRoundOverviewPreviewState(response);
    } else if (isOpenStatusOption(card.id, selectedOption)) {
      const response = await auswertungenService.getOffeneAnmeldungen(props.verfahrenId, props.rundeId, props.token);
      previewData.value = createOpenStatusPreviewState(response);
    } else if (isPoolOriginOption(card.id, selectedOption)) {
      const response = await auswertungenService.getPoolSchuelerAktuelleRunde(props.verfahrenId, props.rundeId, props.token);
      previewData.value = createPoolOriginPreviewState(response);
    } else {
      const response = await auswertungenService.getSchuelerNachHerkunftsschule(props.verfahrenId, props.rundeId, props.token);
      previewData.value = createSourceSchoolPreviewState(response);
    }
  } catch (error: any) {
    previewData.value = null;
    previewErrorMessage.value = error?.response?.data?.error || error?.message || "Die Vorschau konnte nicht geladen werden.";
  } finally {
    previewLoading.value = false;
    actionLoadingKey.value = "";
  }
}

async function exportPreview(format: "excel" | "pdf") {
  if (!props.verfahrenId || !props.rundeId || !previewData.value) return;

  try {
    actionLoadingKey.value = actionKey(previewData.value.exportBereich, `overlay-${format}`);
    errorMessage.value = "";
    successMessage.value = "";
    const response = await auswertungenService.download(
      {
        verfahren_id: props.verfahrenId,
        runde_id: props.rundeId,
        bereich: previewData.value.exportBereich,
        auswertung: previewData.value.exportAuswertung,
        format,
      },
      props.token,
    );
    triggerBrowserDownload(response.blob, response.fileName);
    successMessage.value = format === "excel"
      ? `${previewData.value.title}: CSV wurde heruntergeladen.`
      : `${previewData.value.title}: PDF wurde heruntergeladen.`;
  } catch (error: any) {
    previewErrorMessage.value = error?.response?.data?.error || error?.message || "Der Export konnte nicht erzeugt werden.";
  } finally {
    actionLoadingKey.value = "";
  }
}

async function runPlaceholder(card: AuswertungsKachel, format: AuswertungFormat) {
  if (!props.verfahrenId || !props.rundeId) return;
  const selectedOption = String(selectedOptions.value[card.id] || "").trim();
  if (!selectedOption) {
    errorMessage.value = "Bitte zuerst eine Auswertung auswaehlen.";
    successMessage.value = "";
    return;
  }

  try {
    actionLoadingKey.value = actionKey(card.id, format);
    errorMessage.value = "";
    successMessage.value = "";

    if (isImplementedDownload(card.id, selectedOption)) {
      const response = await auswertungenService.download(
        {
          verfahren_id: props.verfahrenId,
          runde_id: props.rundeId,
          bereich: card.id,
          auswertung: selectedOption,
          format,
        },
        props.token,
      );
      triggerBrowserDownload(response.blob, response.fileName);
      successMessage.value = `${card.title}: ${formatLabel(format)} wurde heruntergeladen.`;
      return;
    }

    const response = await auswertungenService.generate(
      {
        verfahren_id: props.verfahrenId,
        runde_id: props.rundeId,
        bereich: card.id,
        auswertung: selectedOption,
        format,
      },
      props.token,
    );
    successMessage.value = response.message || "Die Platzhalter-Auswertung wurde ausgelost.";
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Die Auswertung konnte nicht erzeugt werden.";
    successMessage.value = "";
  } finally {
    actionLoadingKey.value = "";
  }
}

watch(
  errorMessage,
  (value) => {
    clearErrorMessageTimer();
    if (!value) return;
    errorMessageTimer = setTimeout(() => {
      errorMessage.value = "";
      errorMessageTimer = null;
    }, 6000);
  },
);

watch(
  successMessage,
  (value) => {
    clearSuccessMessageTimer();
    if (!value) return;
    successMessageTimer = setTimeout(() => {
      successMessage.value = "";
      successMessageTimer = null;
    }, 6000);
  },
);

watch(
  () => [props.verfahrenId, props.rundeId],
  () => {
    expandedCardIds.value = [];
    closePreviewOverlay();
    previewData.value = null;
    void loadCatalog();
  },
  { immediate: true },
);
</script>

<template>
  <section class="auswertungen-view">
    <header class="auswertungen-header">
      <div>
        <p class="auswertungen-eyebrow">Auswertungen</p>
        <h2>Zentrale Ausgabe- und Druckzentrale</h2>
        <p class="auswertungen-intro">
          Alle Auswertungen beziehen sich auf
          <strong>{{ context.verfahren }}</strong>
          und
          <strong>{{ context.runde }}</strong>.
        </p>
      </div>
    </header>

    <div v-if="errorMessage" class="feedback-panel feedback-panel-error">
      <p class="feedback-title">Fehler</p>
      <p>{{ errorMessage }}</p>
    </div>

    <div v-if="successMessage" class="feedback-panel feedback-panel-success">
      <p class="feedback-title">Status</p>
      <p>{{ successMessage }}</p>
    </div>

    <section v-if="!canLoad" class="auswertungen-placeholder">
      <p>Waehle zuerst ein Verfahren und eine Runde, damit die Auswertungen bereitgestellt werden koennen.</p>
    </section>

    <section v-else-if="loading" class="auswertungen-placeholder">
      <p>Auswertungen werden geladen...</p>
    </section>

    <section v-else class="auswertungen-grid">
      <article
        v-for="(card, cardIndex) in cards"
        :key="card.id"
        class="auswertung-card"
        :class="{ 'is-expanded': isExpanded(card.id) }"
      >
        <button
          type="button"
          class="auswertung-card-head"
          :aria-expanded="isExpanded(card.id) ? 'true' : 'false'"
          @click="toggleCard(card.id)"
        >
          <div class="auswertung-card-copy">
            <h3>
              <span class="auswertung-title-index">{{ formatListNumber(cardIndex) }}</span>
              <span>{{ card.title }}</span>
            </h3>
            <p>{{ card.description }}</p>
          </div>
          <span
            class="auswertung-chevron"
            :class="{ 'is-open': isExpanded(card.id) }"
            aria-hidden="true"
          ></span>
        </button>

        <div v-if="isExpanded(card.id)" class="auswertung-card-body">
          <fieldset class="auswertung-options">
            <legend>Auswahl</legend>
            <label
              v-for="(option, optionIndex) in card.options"
              :key="`${card.id}-${option.key}`"
              class="auswertung-option"
              :class="{
                'is-highlighted': isPreviewOption(card.id, option.key),
                'is-selected': selectedOptions[card.id] === option.key,
              }"
            >
              <input
                v-model="selectedOptions[card.id]"
                type="radio"
                :name="`auswertung-${card.id}`"
                :value="option.key"
              />
              <span class="auswertung-option-index">{{ formatListNumber(optionIndex) }}</span>
              <span class="auswertung-option-label">{{ option.label }}</span>
            </label>
          </fieldset>

          <div class="auswertung-actions">
            <button
              v-if="shouldShowPreviewButton(card.id)"
              type="button"
              class="btn-primary auswertung-action-btn auswertung-preview-btn"
              :disabled="actionLoadingKey === actionKey(card.id, 'preview')"
              @click="openPreview(card)"
            >
              {{ actionLoadingKey === actionKey(card.id, "preview") ? "Lade Vorschau..." : "Vorschau" }}
            </button>
            <button
              v-for="format in isPreviewOnlyCard(card.id) ? [] : (shouldShowPreviewButton(card.id) ? [] : card.formats)"
              :key="`${card.id}-${format}`"
              type="button"
              class="btn-primary auswertung-action-btn"
              :disabled="actionLoadingKey === actionKey(card.id, format)"
              @click="runPlaceholder(card, format)"
            >
              {{
                actionLoadingKey === actionKey(card.id, format)
                  ? "Verarbeite..."
                  : formatLabel(format)
              }}
            </button>
          </div>
        </div>
      </article>
    </section>

    <div
      v-if="previewOverlayOpen"
      class="auswertungen-preview-overlay"
      @click.self="closePreviewOverlay"
    >
      <section class="auswertungen-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="auswertungen-preview-title">
        <div class="auswertungen-preview-head">
          <div>
            <p class="auswertungen-eyebrow">Auswertung</p>
            <h3 id="auswertungen-preview-title">{{ previewData?.title || "Auswertungsvorschau" }}</h3>
            <p class="auswertungen-preview-intro">
              <strong>{{ previewData?.verfahrenLabel || context.verfahren }}</strong>
              <span v-if="previewData?.rundeLabel">{{ previewData?.rundeLabel }}</span>
              <span>{{ previewData?.total ?? 0 }} Datensaetze</span>
            </p>
          </div>
          <button class="btn-secondary auswertungen-preview-close" type="button" @click="closePreviewOverlay">
            Schliessen
          </button>
        </div>

        <div v-if="previewErrorMessage" class="feedback-panel feedback-panel-error">
          <p class="feedback-title">Fehler</p>
          <p>{{ previewErrorMessage }}</p>
        </div>

        <section v-if="previewLoading" class="auswertungen-preview-placeholder">
          <p>Daten fuer die Vorschau werden geladen...</p>
        </section>

        <section v-else class="auswertungen-preview-body">
          <div class="auswertungen-preview-meta">
            <span>Verfahren: {{ previewData?.verfahrenLabel || context.verfahren }}</span>
            <span v-if="previewData?.rundeLabel">Runde: {{ previewData?.rundeLabel }}</span>
            <span>Erstellt: {{ previewData?.generatedAt || "-" }}</span>
          </div>

          <div v-if="!(previewData?.rows || []).length" class="auswertungen-preview-placeholder">
            <p>{{ previewData?.emptyMessage || "Keine Daten vorhanden." }}</p>
          </div>

          <div v-else class="auswertungen-preview-table-wrap">
            <table class="auswertungen-preview-table">
              <thead>
                <tr>
                  <th
                    v-for="column in previewData?.columns || []"
                    :key="`preview-head-${column.key}`"
                    :class="column.className || ''"
                  >
                    {{ column.label }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in previewData?.rows || []"
                  :key="`${previewData?.key || 'preview'}-${String(row.schueler_id || row.lfd_nr)}`"
                >
                  <td
                    v-for="column in previewData?.columns || []"
                    :key="`preview-cell-${String(row.lfd_nr || '')}-${column.key}`"
                    :class="column.className || ''"
                  >
                    {{ row[column.key] || "-" }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div class="auswertungen-preview-actions">
          <button class="btn-secondary" type="button" @click="closePreviewOverlay">
            Schliessen
          </button>
          <button
            class="btn-primary auswertung-action-btn"
            type="button"
            :disabled="actionLoadingKey === actionKey(previewData?.exportBereich || 'preview', 'overlay-excel')"
            @click="exportPreview('excel')"
          >
            {{ actionLoadingKey === actionKey(previewData?.exportBereich || "preview", "overlay-excel") ? "Exportiere..." : "Export CSV" }}
          </button>
          <button
            class="btn-primary auswertung-action-btn"
            type="button"
            :disabled="actionLoadingKey === actionKey(previewData?.exportBereich || 'preview', 'overlay-pdf')"
            @click="exportPreview('pdf')"
          >
            {{ actionLoadingKey === actionKey(previewData?.exportBereich || "preview", "overlay-pdf") ? "Exportiere..." : "Export PDF" }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.auswertungen-view {
  display: grid;
  gap: 18px;
}

.auswertungen-header,
.auswertungen-placeholder,
.auswertung-card {
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background:
    radial-gradient(circle at top right, rgba(143, 187, 233, 0.16), transparent 34%),
    linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-shadow: 0 18px 42px rgba(19, 54, 102, 0.08);
}

.auswertungen-header,
.auswertungen-placeholder {
  padding: 20px 22px;
}

.auswertungen-eyebrow {
  margin: 0 0 6px;
  color: #6680a3;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.auswertungen-header h2 {
  margin: 0;
  color: #17385f;
}

.auswertungen-intro {
  margin: 8px 0 0;
  color: #4a607e;
  line-height: 1.55;
}

.auswertungen-grid {
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.auswertung-card {
  overflow: hidden;
}

.auswertung-card-head {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 16px;
  padding: 20px 22px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.auswertung-card-copy h3 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #17385f;
  font-size: 1.08rem;
  line-height: 1.25;
}

.auswertung-title-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 34px;
  border-radius: 999px;
  background: linear-gradient(135deg, #184f95 0%, #2e7ccf 100%);
  color: #fff;
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  box-shadow: 0 10px 22px rgba(24, 79, 149, 0.18);
}

.auswertung-card-copy p {
  margin: 8px 0 0;
  color: #4a607e;
  line-height: 1.5;
}

.auswertung-chevron {
  width: 12px;
  height: 12px;
  margin-top: 8px;
  border-right: 2px solid #1459a8;
  border-bottom: 2px solid #1459a8;
  transform: rotate(-45deg);
  transition: transform 0.2s ease;
}

.auswertung-chevron.is-open {
  transform: rotate(45deg);
}

.auswertung-card-body {
  display: grid;
  gap: 18px;
  padding: 0 22px 22px;
}

.auswertung-options {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 14px;
  border: 1px solid #dde6f2;
  border-radius: 16px;
  background: rgba(246, 250, 255, 0.9);
}

.auswertung-options legend {
  padding: 0 8px;
  color: #6680a3;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.auswertung-option {
  position: relative;
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 9px 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.8);
  color: #214061;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.auswertung-option.is-highlighted {
  color: #0d66c2;
  font-weight: 700;
}

.auswertung-option.is-selected {
  border-color: #7fb1eb;
  background: linear-gradient(180deg, #eef6ff 0%, #ffffff 100%);
  box-shadow: 0 10px 22px rgba(24, 89, 168, 0.12);
}

.auswertung-option:hover {
  border-color: #c6d9f0;
  background: #ffffff;
}

.auswertung-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.auswertung-option-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid #cad9eb;
  background: #fff;
  color: #5d7594;
  font-size: 0.75rem;
  font-weight: 500;
}

.auswertung-option.is-selected .auswertung-option-index {
  border-color: #1559b7;
  background: #1559b7;
  color: #fff;
}

.auswertung-option-label {
  min-width: 0;
  line-height: 1.3;
}

.auswertung-option.is-selected .auswertung-option-label {
  color: #0c4e98;
}

.auswertung-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.auswertung-action-btn {
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  padding: 0 16px;
  background: #1f5fbf;
  color: #fff;
  font-weight: 700;
  box-shadow: 0 10px 24px rgba(31, 95, 191, 0.18);
}

.auswertung-action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

.auswertung-preview-btn {
  background: linear-gradient(135deg, #1559b7 0%, #0d7bdc 100%);
}

.feedback-panel {
  padding: 12px 14px;
  border-radius: 14px;
}

.feedback-panel-error {
  border: 1px solid #f2c2c2;
  background: #fff5f5;
  color: #a61b1b;
}

.feedback-panel-success {
  border: 1px solid #cde8d1;
  background: #f3fff4;
  color: #166534;
}

.feedback-title {
  margin: 0 0 4px;
  font-weight: 700;
}

.feedback-panel p:last-child,
.auswertungen-placeholder p {
  margin: 0;
}

.btn-secondary {
  min-height: 42px;
  border: 1px solid #ccd8e6;
  border-radius: 999px;
  padding: 0 16px;
  background: #ffffff;
  color: #23415f;
  font-weight: 700;
}

.auswertungen-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 1800;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.46);
  backdrop-filter: blur(4px);
}

.auswertungen-preview-dialog {
  width: min(1440px, calc(100vw - 32px));
  max-height: min(92vh, 980px);
  display: grid;
  gap: 18px;
  padding: 22px;
  border: 1px solid #dbe4f0;
  border-radius: 24px;
  background:
    radial-gradient(circle at top right, rgba(143, 187, 233, 0.2), transparent 30%),
    linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-shadow: 0 28px 56px rgba(17, 43, 79, 0.22);
}

.auswertungen-preview-head,
.auswertungen-preview-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.auswertungen-preview-head h3 {
  margin: 0;
  color: #17385f;
}

.auswertungen-preview-intro,
.auswertungen-preview-meta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin: 8px 0 0;
  color: #4a607e;
}

.auswertungen-preview-body {
  display: grid;
  gap: 14px;
  min-height: 0;
}

.auswertungen-preview-placeholder {
  padding: 18px;
  border: 1px dashed #cddbec;
  border-radius: 18px;
  background: #f8fbff;
  color: #56708f;
}

.auswertungen-preview-placeholder p {
  margin: 0;
}

.auswertungen-preview-table-wrap {
  overflow: auto;
  max-height: 56vh;
  border: 1px solid #dbe4f0;
  border-radius: 18px;
  background: #fff;
}

.auswertungen-preview-table {
  width: 100%;
  min-width: 1320px;
  border-collapse: collapse;
}

.auswertungen-preview-table th,
.auswertungen-preview-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e7eef7;
  text-align: left;
  vertical-align: top;
  font-size: 13px;
}

.auswertungen-preview-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f5f8fc;
  color: #17385f;
  white-space: nowrap;
}

.auswertungen-preview-table tbody tr:hover td {
  background: #eef6ff;
}

.auswertungen-preview-table tbody tr:hover td.round-col-r1 {
  background: #e8f4ff;
}

.auswertungen-preview-table tbody tr:hover td.round-col-r2 {
  background: #eef9ec;
}

.auswertungen-preview-table tbody tr:hover td.round-col-r3 {
  background: #fff3e8;
}

.round-col-r1 {
  background: #f1f8ff;
}

.round-col-r2 {
  background: #f3fbf0;
}

.round-col-r3 {
  background: #fff6ee;
}

@media (max-width: 720px) {
  .auswertungen-grid {
    grid-template-columns: 1fr;
  }

  .auswertungen-preview-overlay {
    padding: 12px;
  }

  .auswertungen-preview-dialog {
    width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
    padding: 16px;
  }
}
</style>
