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
    <details class="anm-section" open>
      <summary>Stammdaten</summary>
      <div class="anm-form-grid">
        <label class="field-block anm-form-field">
          <span class="field-label">Schuljahr</span>
          <input
            :value="modelValue.schuljahr"
            placeholder="2026_27"
            :disabled="saving"
            @input="emit('update:modelValue', { ...modelValue, schuljahr: String(($event.target as HTMLInputElement).value || '') })"
          />
        </label>

        <label class="field-block anm-form-field">
          <span class="field-label">Bezeichnung</span>
          <input
            :value="modelValue.bezeichnung"
            placeholder="Anmeldeverfahren 2026/27"
            :disabled="saving"
            @input="emit('update:modelValue', { ...modelValue, bezeichnung: String(($event.target as HTMLInputElement).value || '') })"
          />
        </label>

        <label class="field-block anm-form-field">
          <span class="field-label">Verfahrenstyp</span>
          <select
            :value="modelValue.verfahrenstyp"
            :disabled="saving"
            @change="emit('update:modelValue', { ...modelValue, verfahrenstyp: String(($event.target as HTMLSelectElement).value || 'GS') as Anmeldeverfahrenstyp })"
          >
            <option v-for="option in verfahrenstypOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>
    </details>

    <details class="anm-section" open>
      <summary>Status und Sichtbarkeit</summary>
      <div class="anm-form-grid">
        <label class="field-block anm-form-field">
          <span class="field-label">Status</span>
          <input :value="modelValue.status" disabled />
        </label>

        <label class="anm-checkbox-row">
          <input
            type="checkbox"
            :checked="modelValue.sichtbar"
            :disabled="saving"
            @change="emit('update:modelValue', { ...modelValue, sichtbar: ($event.target as HTMLInputElement).checked })"
          />
          <span>Verfahren sichtbar anzeigen</span>
        </label>
      </div>
    </details>

    <div class="anm-actions">
      <button class="btn-secondary anm-form-secondary-btn" type="button" :disabled="saving" @click="emit('reset')">
        Reset
      </button>
      <button class="btn-primary anm-form-primary-btn" type="button" :disabled="saving" @click="emit('submit')">
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

.anm-form-field :deep(input),
.anm-form-field :deep(select) {
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

  .anm-checkbox-row {
    padding-top: 0;
  }

  .anm-actions {
    justify-content: stretch;
  }
}
</style>
