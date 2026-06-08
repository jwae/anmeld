<script setup lang="ts">
import { computed } from "vue";
import type { AnmeldeStatus, Anmeldeverfahren } from "../types";

const props = defineProps<{
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
const isLocked = computed<boolean>(() => Boolean(props.modelValue.id) && props.modelValue.status === "abgeschlossen");
</script>

<template>
  <section class="anm-card anm-runden-form-card">
    <div class="anm-card-head anm-runden-form-head">
      <div class="anm-runden-form-title">
        <p class="anm-runden-form-eyebrow">{{ modelValue.id ? "Runde bearbeiten" : "Neue Runde" }}</p>
        <h4>{{ modelValue.id ? "Anmelderunde bearbeiten" : "Neue Anmelderunde anlegen" }}</h4>
        <p class="anm-runden-form-copy" v-if="verfahren">Verfahren: {{ verfahren.bezeichnung }}</p>
        <p class="anm-runden-form-copy" v-else>Bitte zuerst ein Verfahren auswaehlen.</p>
      </div>
      <span class="anm-runden-form-badge">{{ modelValue.id ? "Edit" : "Neu" }}</span>
    </div>

    <div class="anm-form-grid anm-runden-form-grid anm-runden-form-grid-top">
      <label class="field-block anm-form-field anm-form-field-round-number">
        <span class="field-label">Rundennummer</span>
        <input
          type="number"
          min="1"
          :value="modelValue.runden_nummer ?? ''"
          :disabled="saving || !verfahren || isLocked"
          @input="emit('update:modelValue', { ...modelValue, runden_nummer: Number(($event.target as HTMLInputElement).value || 0) || null })"
        />
      </label>

      <label class="field-block anm-form-field anm-form-field-wide">
        <span class="field-label">Bezeichnung</span>
        <input
          :value="modelValue.bezeichnung"
          placeholder="Hauptverfahren"
          :disabled="saving || !verfahren || isLocked"
          @input="emit('update:modelValue', { ...modelValue, bezeichnung: String(($event.target as HTMLInputElement).value || '') })"
        />
      </label>
    </div>

    <div class="anm-form-grid anm-runden-form-grid-dates">
      <label class="field-block anm-form-field">
        <span class="field-label">Startdatum</span>
        <input
          type="date"
          :value="modelValue.startdatum"
          :disabled="saving || !verfahren || isLocked"
          @input="emit('update:modelValue', { ...modelValue, startdatum: String(($event.target as HTMLInputElement).value || '') })"
        />
      </label>

      <label class="field-block anm-form-field">
        <span class="field-label">Enddatum</span>
        <input
          type="date"
          :value="modelValue.enddatum"
          :disabled="saving || !verfahren || isLocked"
          @input="emit('update:modelValue', { ...modelValue, enddatum: String(($event.target as HTMLInputElement).value || '') })"
        />
      </label>
    </div>

    <div class="anm-runden-form-bottom">
      <label class="field-block anm-form-field anm-form-field-status">
        <span class="field-label">Status</span>
        <select
          :value="modelValue.status"
          :disabled="saving || !verfahren || isLocked"
          @change="emit('update:modelValue', { ...modelValue, status: String(($event.target as HTMLSelectElement).value || 'geplant') as AnmeldeStatus })"
        >
          <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
        </select>
      </label>

      <div class="anm-actions anm-runden-form-actions">
        <button class="btn-secondary anm-form-secondary-btn" type="button" :disabled="saving" @click="emit('reset')">Reset</button>
        <button class="btn-primary anm-form-primary-btn" type="button" :disabled="saving || !verfahren || isLocked" @click="emit('submit')">
          {{ saving ? "Speichere..." : (modelValue.id ? "Aenderungen speichern" : "Runde anlegen") }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.anm-runden-form-card {
  padding: 16px;
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background: #ffffff;
  box-shadow: 0 16px 32px rgba(23, 58, 108, 0.05);
}

.anm-runden-form-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.anm-runden-form-title {
  display: grid;
  gap: 4px;
}

.anm-runden-form-eyebrow {
  margin: 0 0 4px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: 700;
  color: #6680a3;
}

.anm-runden-form-title h4 {
  margin: 0;
  color: #19385e;
  font-size: 1.12rem;
  line-height: 1.25;
}

.anm-runden-form-copy {
  margin: 4px 0 0;
  color: #607794;
  font-size: 12px;
  line-height: 1.4;
}

.anm-runden-form-badge {
  min-width: 46px;
  padding: 5px 10px;
  border-radius: 999px;
  background: #eef3f8;
  color: #20476f;
  font-weight: 800;
  text-align: center;
  font-size: 12px;
}

.anm-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.anm-runden-form-grid-top {
  align-items: end;
}

.anm-runden-form-grid-dates {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.anm-form-field {
  gap: 5px;
}

.anm-form-field-wide,
.anm-form-field-status {
  min-width: 0;
}

.anm-form-field :deep(input),
.anm-form-field :deep(select) {
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid #cfdceb;
  border-radius: 10px;
  background: linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  color: #19385e;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
}

.anm-form-field :deep(input:disabled),
.anm-form-field :deep(select:disabled) {
  background: #f5f8fc;
  color: #7d90a8;
}

.anm-runden-form-bottom {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  align-items: end;
}

.anm-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.anm-runden-form-actions {
  align-items: center;
  justify-content: flex-end;
  min-height: 34px;
}

.anm-form-primary-btn,
.anm-form-secondary-btn {
  min-height: 34px;
  padding: 10px 18px;
  border: 1px solid #cfdceb;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s ease;
}

.anm-form-primary-btn {
  border-color: #b9d0e8;
}

.anm-form-primary-btn:hover:not(:disabled),
.anm-form-secondary-btn:hover:not(:disabled) {
  box-shadow: 0 4px 12px rgba(23, 58, 108, 0.12);
}

@media (max-width: 760px) {
  .anm-form-grid,
  .anm-runden-form-grid-dates,
  .anm-runden-form-bottom {
    grid-template-columns: 1fr;
  }

  .anm-runden-form-head {
    display: grid;
    grid-template-columns: 1fr;
  }

  .anm-runden-form-actions {
    justify-content: stretch;
  }

  .anm-form-primary-btn,
  .anm-form-secondary-btn {
    flex: 1 1 100%;
  }
}
</style>
