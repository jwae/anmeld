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
        <h3>{{ modelValue.id ? "Runde bearbeiten" : "Neue Runde" }}</h3>
        <p v-if="verfahren">Verfahren: {{ verfahren.bezeichnung }}</p>
        <p v-else>Bitte zuerst ein Verfahren auswaehlen.</p>
      </div>
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
  gap: 12px;
  padding: 16px;
  background: linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
}

.anm-runden-form-head {
  display: flex;
  align-items: start;
  gap: 10px;
}

.anm-runden-form-title {
  display: grid;
  gap: 4px;
}

.anm-runden-form-title h3 {
  margin: 0;
  font-size: 1.05rem;
}

.anm-runden-form-title p {
  margin: 0;
  color: #607794;
  font-size: 12px;
  line-height: 1.4;
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
  background: #fdfefe;
}

.anm-runden-form-bottom {
  display: grid;
  grid-template-columns: minmax(180px, 240px) auto;
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
  padding-top: 2px;
  justify-content: flex-start;
}

.anm-form-primary-btn,
.anm-form-secondary-btn {
  min-height: 34px;
  padding: 6px 12px;
  border-radius: 10px;
  font-weight: 600;
}

@media (max-width: 760px) {
  .anm-form-grid,
  .anm-runden-form-grid-dates,
  .anm-runden-form-bottom {
    grid-template-columns: 1fr;
  }

  .anm-runden-form-head {
    display: block;
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
