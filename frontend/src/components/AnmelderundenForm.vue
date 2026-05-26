<script setup lang="ts">
import type { AnmeldeStatus, Anmeldeverfahren } from "../types";

defineProps<{
  verfahren: Anmeldeverfahren | null;
  modelValue: {
    id: number | null;
    runden_nummer: number | null;
    bezeichnung: string;
    startdatum: string;
    enddatum: string;
    status: AnmeldeStatus;
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
    status: AnmeldeStatus;
  }): void;
  (e: "submit"): void;
  (e: "reset"): void;
}>();

const statusOptions: AnmeldeStatus[] = ["geplant", "aktiv", "abgeschlossen"];
</script>

<template>
  <section class="anm-card">
    <div class="anm-card-head">
      <div>
        <h3>{{ modelValue.id ? "Runde bearbeiten" : "Neue Runde" }}</h3>
        <p v-if="verfahren">Verfahren: {{ verfahren.bezeichnung }}</p>
        <p v-else>Bitte zuerst ein Verfahren auswaehlen.</p>
      </div>
    </div>

    <div class="anm-form-grid anm-form-grid-3">
      <label class="field-block">
        <span class="field-label">Rundennummer</span>
        <input
          type="number"
          min="1"
          :value="modelValue.runden_nummer ?? ''"
          :disabled="saving || !verfahren"
          @input="emit('update:modelValue', { ...modelValue, runden_nummer: Number(($event.target as HTMLInputElement).value || 0) || null })"
        />
      </label>

      <label class="field-block">
        <span class="field-label">Startdatum</span>
        <input
          type="date"
          :value="modelValue.startdatum"
          :disabled="saving || !verfahren"
          @input="emit('update:modelValue', { ...modelValue, startdatum: String(($event.target as HTMLInputElement).value || '') })"
        />
      </label>

      <label class="field-block">
        <span class="field-label">Enddatum</span>
        <input
          type="date"
          :value="modelValue.enddatum"
          :disabled="saving || !verfahren"
          @input="emit('update:modelValue', { ...modelValue, enddatum: String(($event.target as HTMLInputElement).value || '') })"
        />
      </label>
    </div>

    <div class="anm-form-grid">
      <label class="field-block">
        <span class="field-label">Bezeichnung</span>
        <input
          :value="modelValue.bezeichnung"
          placeholder="Hauptverfahren"
          :disabled="saving || !verfahren"
          @input="emit('update:modelValue', { ...modelValue, bezeichnung: String(($event.target as HTMLInputElement).value || '') })"
        />
      </label>

      <label class="field-block">
        <span class="field-label">Status</span>
        <select
          :value="modelValue.status"
          :disabled="saving || !verfahren"
          @change="emit('update:modelValue', { ...modelValue, status: String(($event.target as HTMLSelectElement).value || 'geplant') as AnmeldeStatus })"
        >
          <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
        </select>
      </label>
    </div>

    <div class="anm-actions anm-actions-end">
      <button class="btn-secondary" type="button" :disabled="saving" @click="emit('reset')">Zuruecksetzen</button>
      <button class="btn-primary" type="button" :disabled="saving || !verfahren" @click="emit('submit')">
        {{ saving ? "Speichere..." : (modelValue.id ? "Aenderungen speichern" : "Runde anlegen") }}
      </button>
    </div>
  </section>
</template>
