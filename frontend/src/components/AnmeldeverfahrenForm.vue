<script setup lang="ts">
import type { AnmeldeStatus } from "../types";

defineProps<{
  modelValue: {
    id: number | null;
    schuljahr: string;
    bezeichnung: string;
    status: AnmeldeStatus;
  };
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: { id: number | null; schuljahr: string; bezeichnung: string; status: AnmeldeStatus }): void;
  (e: "submit"): void;
  (e: "reset"): void;
}>();

const statusOptions: AnmeldeStatus[] = ["geplant", "aktiv", "abgeschlossen"];
</script>

<template>
  <section class="anm-card">
    <div class="anm-card-head">
      <div>
        <h3>{{ modelValue.id ? "Verfahren bearbeiten" : "Neues Verfahren" }}</h3>
        <p>Pflege der Stammdaten fuer das Anmeldeverfahren.</p>
      </div>
    </div>

    <div class="anm-form-grid">
      <label class="field-block">
        <span class="field-label">Schuljahr</span>
        <input
          :value="modelValue.schuljahr"
          placeholder="2026_27"
          :disabled="saving"
          @input="emit('update:modelValue', { ...modelValue, schuljahr: String(($event.target as HTMLInputElement).value || '') })"
        />
      </label>

      <label class="field-block">
        <span class="field-label">Status</span>
        <select
          :value="modelValue.status"
          :disabled="saving"
          @change="emit('update:modelValue', { ...modelValue, status: String(($event.target as HTMLSelectElement).value || 'geplant') as AnmeldeStatus })"
        >
          <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
        </select>
      </label>
    </div>

    <label class="field-block">
      <span class="field-label">Bezeichnung</span>
      <input
        :value="modelValue.bezeichnung"
        placeholder="Anmeldeverfahren 2026/27"
        :disabled="saving"
        @input="emit('update:modelValue', { ...modelValue, bezeichnung: String(($event.target as HTMLInputElement).value || '') })"
      />
    </label>

    <div class="anm-actions anm-actions-end">
      <button class="btn-secondary" type="button" :disabled="saving" @click="emit('reset')">Zuruecksetzen</button>
      <button class="btn-primary" type="button" :disabled="saving" @click="emit('submit')">
        {{ saving ? "Speichere..." : (modelValue.id ? "Aenderungen speichern" : "Verfahren anlegen") }}
      </button>
    </div>
  </section>
</template>
