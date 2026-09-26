<script setup lang="ts">
import type { AnmeldeStatus, Anmeldeverfahrenstyp } from "../types";

defineProps<{
  modelValue: {
    id: number | null;
    schuljahr: string;
    bezeichnung: string;
    verfahrenstyp: Anmeldeverfahrenstyp;
    status: AnmeldeStatus;
    sichtbar: boolean;
  };
  saving?: boolean;
  mode?: "full" | "limited" | "readonly";
  visibilityEditable?: boolean;
  hasChanges?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: {
    id: number | null;
    schuljahr: string;
    bezeichnung: string;
    verfahrenstyp: Anmeldeverfahrenstyp;
    status: AnmeldeStatus;
    sichtbar: boolean;
  }): void;
  (e: "submit"): void;
  (e: "reset"): void;
}>();

const verfahrenstypOptions: Array<{ value: Anmeldeverfahrenstyp; label: string }> = [
  { value: "GS", label: "Grundschule" },
  { value: "SEK1", label: "Sek I" },
];
</script>

<template>
  <section class="anm-form-shell">
    <details class="anm-section anm-procedure-surface" open>
      <summary>Stammdaten</summary>
      <div class="anm-form-grid">
        <label class="field-block anm-form-field anm-field anm-procedure-ui">
          <span class="field-label anm-label anm-procedure-ui">Schuljahr</span>
          <input class="anm-input anm-procedure-ui"
            :value="modelValue.schuljahr"
            placeholder="2026_27"
            :disabled="saving || mode !== 'full'"
            @input="emit('update:modelValue', { ...modelValue, schuljahr: String(($event.target as HTMLInputElement).value || '') })"
          />
        </label>

        <label class="field-block anm-form-field anm-field anm-procedure-ui">
          <span class="field-label anm-label anm-procedure-ui">Bezeichnung</span>
          <input class="anm-input anm-procedure-ui"
            :value="modelValue.bezeichnung"
            placeholder="Anmeldeverfahren 2026/27"
            :disabled="saving || mode === 'readonly'"
            @input="emit('update:modelValue', { ...modelValue, bezeichnung: String(($event.target as HTMLInputElement).value || '') })"
          />
        </label>

        <label class="field-block anm-form-field anm-field anm-procedure-ui">
          <span class="field-label anm-label anm-procedure-ui">Verfahrenstyp</span>
          <select class="anm-input anm-procedure-ui"
            :value="modelValue.verfahrenstyp"
            :disabled="saving || mode !== 'full'"
            @change="emit('update:modelValue', { ...modelValue, verfahrenstyp: String(($event.target as HTMLSelectElement).value || 'GS') as Anmeldeverfahrenstyp })"
          >
            <option v-for="option in verfahrenstypOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>
    </details>

    <details class="anm-section anm-procedure-surface" open>
      <summary>Status und Sichtbarkeit</summary>
      <div class="anm-form-grid">
        <label class="field-block anm-form-field anm-field anm-procedure-ui">
          <span class="field-label anm-label anm-procedure-ui">Status</span>
          <input class="anm-input anm-procedure-ui" :value="modelValue.status" disabled />
        </label>

        <label class="anm-checkbox-row anm-check anm-procedure-ui">
          <input class="anm-procedure-check-input anm-procedure-ui"
            type="checkbox"
            :checked="modelValue.sichtbar"
            :disabled="saving || visibilityEditable === false"
            @change="emit('update:modelValue', { ...modelValue, sichtbar: ($event.target as HTMLInputElement).checked })"
          />
          <span class="anm-label anm-procedure-ui">Verfahren sichtbar anzeigen</span>
        </label>
      </div>
    </details>

    <div v-if="mode !== 'readonly' || visibilityEditable" class="anm-actions">
      <button class="anm-form-secondary-btn anm-button anm-procedure-ui" type="button" :disabled="saving" @click="emit('reset')">
        Reset
      </button>
      <button
        class="anm-form-primary-btn anm-button anm-button--primary anm-procedure-ui"
        type="button"
        :disabled="saving || (modelValue.id !== null && !hasChanges)"
        @click="emit('submit')"
      >
        {{ saving ? "Speichere..." : (modelValue.id ? "Aenderungen speichern" : "Verfahren anlegen") }}
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

.anm-form-field :deep(input:where(:not(.anm-procedure-ui))),
.anm-form-field :deep(select:where(:not(.anm-procedure-ui))) {
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid #cfdceb;
  border-radius: 10px;
  background: #ffffff;
  color: #19385e;
}

.anm-checkbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.anm-checkbox-row:where(:not(.anm-procedure-ui)) {
  padding-top: 22px;
  color: #27486f;
  font-weight: 600;
}

.anm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.anm-form-primary-btn,
.anm-form-secondary-btn {
  cursor: pointer;
}

.anm-form-primary-btn:where(:not(.anm-procedure-ui)),
.anm-form-secondary-btn:where(:not(.anm-procedure-ui)) {
  min-height: 34px;
  padding: 10px 18px;
  border: 1px solid #cfdceb;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
}

@media (max-width: 760px) {
  .anm-form-grid {
    grid-template-columns: 1fr;
  }

  .anm-checkbox-row:where(:not(.anm-procedure-ui)) {
    padding-top: 0;
  }

  .anm-actions {
    justify-content: stretch;
  }
}
</style>
