<script setup lang="ts">
import { computed, ref, watch } from "vue";
import auswertungenService, {
  type AuswertungFormat,
  type AuswertungsKachel,
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

const canLoad = computed(() => !!props.verfahrenId && !!props.rundeId);

function formatLabel(format: AuswertungFormat) {
  if (format === "pdf") return "PDF erzeugen";
  if (format === "excel") return "Excel exportieren";
  return "Word erzeugen";
}

function actionKey(cardId: string, format: AuswertungFormat) {
  return `${cardId}:${format}`;
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

function isImplementedDownload(cardId: string, optionKey: string) {
  return cardId === "verfahrensuebersicht" && optionKey === "verfahrensdaten";
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
  () => [props.verfahrenId, props.rundeId],
  () => {
    expandedCardIds.value = [];
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
      <p class="feedback-title">Platzhalter</p>
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
        v-for="card in cards"
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
            <h3>{{ card.title }}</h3>
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
              v-for="option in card.options"
              :key="`${card.id}-${option.key}`"
              class="auswertung-option"
            >
              <input
                v-model="selectedOptions[card.id]"
                type="radio"
                :name="`auswertung-${card.id}`"
                :value="option.key"
              />
              <span>{{ option.label }}</span>
            </label>
          </fieldset>

          <div class="auswertung-actions">
            <button
              v-for="format in card.formats"
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
  color: #17385f;
  font-size: 1.08rem;
  line-height: 1.25;
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
  gap: 10px;
  margin: 0;
  padding: 16px;
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
  display: flex;
  gap: 10px;
  align-items: start;
  color: #214061;
}

.auswertung-option input {
  margin-top: 2px;
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

@media (max-width: 720px) {
  .auswertungen-grid {
    grid-template-columns: 1fr;
  }
}
</style>
