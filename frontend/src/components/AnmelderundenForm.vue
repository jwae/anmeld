<script setup lang="ts">
import type { Anmeldeverfahren } from "../types";

defineProps<{
  verfahren: Anmeldeverfahren | null;
  availableRoundNumbers?: number[];
  mode?: "full" | "limited" | "readonly";
  modelValue: {
    id: number | null;
    runden_nummer: number | null;
    bezeichnung: string;
    startdatum: string;
    enddatum: string;
    status: string;
  };
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: {
    id: number | null;
    runden_nummer: number | null;
    bezeichnung: string;
    startdatum: string;
    enddatum: string;
    status: string;
  }): void;
  (e: "submit"): void;
  (e: "reset"): void;
}>();
</script>

<template>
  <section class="anm-form-shell">
    <details class="anm-section" open>
      <summary>Rundendaten</summary>
      <div class="anm-form-grid">
        <label class="field-block anm-form-field">
          <span class="field-label">Rundennummer</span>
          <select
            :value="modelValue.runden_nummer ?? ''"
            :disabled="saving || !verfahren || mode !== 'full'"
            @change="emit('update:modelValue', { ...modelValue, runden_nummer: Number(($event.target as HTMLSelectElement).value || 0) || null })"
          >
            <option value="" disabled>Bitte waehlen</option>
            <option v-for="roundNumber in (availableRoundNumbers || [])" :key="roundNumber" :value="roundNumber">
              Runde {{ roundNumber }}
            </option>
          </select>
        </label>

        <label class="field-block anm-form-field">
          <span class="field-label">Bezeichnung</span>
          <input
            :value="modelValue.bezeichnung"
            placeholder="Runde 2"
            :disabled="saving || !verfahren || mode === 'readonly'"
            @input="emit('update:modelValue', { ...modelValue, bezeichnung: String(($event.target as HTMLInputElement).value || '') })"
          />
        </label>

        <label class="field-block anm-form-field">
          <span class="field-label">Startdatum</span>
          <input
            type="date"
            :value="modelValue.startdatum"
            :disabled="saving || !verfahren || mode === 'readonly'"
            @input="emit('update:modelValue', { ...modelValue, startdatum: String(($event.target as HTMLInputElement).value || '') })"
          />
        </label>

        <label class="field-block anm-form-field">
          <span class="field-label">Enddatum</span>
          <input
            type="date"
            :value="modelValue.enddatum"
            :disabled="saving || !verfahren || mode === 'readonly'"
            @input="emit('update:modelValue', { ...modelValue, enddatum: String(($event.target as HTMLInputElement).value || '') })"
          />
        </label>
      </div>
      <p v-if="mode === 'limited'" class="anm-inline-hint">
        Bei einer aktiven Runde koennen Bezeichnung und Zeitraum geaendert werden.
      </p>
      <p v-else-if="mode === 'readonly'" class="anm-inline-hint">
        Diese Runde wird schreibgeschuetzt angezeigt.
      </p>
    </details>

    <details class="anm-section" open>
      <summary>Status</summary>
      <div class="anm-form-grid">
        <label class="field-block anm-form-field">
          <span class="field-label">Aktueller Status</span>
          <input :value="modelValue.status" disabled />
        </label>
      </div>
    </details>

    <div v-if="mode !== 'readonly'" class="anm-actions">
      <button class="btn-secondary anm-form-secondary-btn" type="button" :disabled="saving" @click="emit('reset')">
        Reset
      </button>
      <button class="btn-primary anm-form-primary-btn" type="button" :disabled="saving || !verfahren" @click="emit('submit')">
        {{ saving ? "Speichere..." : (modelValue.id ? "Aenderungen speichern" : "Runde anlegen") }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.anm-form-shell {
  display: grid;
  gap: 14px;
}

.anm-section {
  border: 1px solid #dbe4f0;
  border-radius: 16px;
  background: #f9fbfe;
  overflow: hidden;
}

.anm-section summary {
  cursor: pointer;
  padding: 12px 14px;
  font-weight: 700;
  color: #19385e;
}

.anm-section > :not(summary) {
  padding: 0 14px 14px;
}

.anm-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.anm-form-field {
  gap: 5px;
}

.anm-form-field :deep(input),
.anm-form-field :deep(select) {
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid #cfdceb;
  border-radius: 10px;
  background: #ffffff;
  color: #19385e;
}

.anm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.anm-inline-hint {
  margin: 4px 0 0;
  color: #607794;
  font-size: 12px;
  line-height: 1.45;
}

.anm-form-primary-btn,
.anm-form-secondary-btn {
  min-height: 34px;
  padding: 10px 18px;
  border: 1px solid #cfdceb;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
}

@media (max-width: 760px) {
  .anm-form-grid {
    grid-template-columns: 1fr;
  }

  .anm-actions {
    justify-content: stretch;
  }
}
</style>
