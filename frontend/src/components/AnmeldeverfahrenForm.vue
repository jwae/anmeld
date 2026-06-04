<script setup lang="ts">
import type { AnmeldeStatus, Anmeldeverfahrenstyp } from "../types";

defineProps<{
  modelValue: {
    id: number | null;
    schuljahr: string;
    bezeichnung: string;
    verfahrenstyp: Anmeldeverfahrenstyp;
    status: AnmeldeStatus;
  };
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: { id: number | null; schuljahr: string; bezeichnung: string; verfahrenstyp: Anmeldeverfahrenstyp; status: AnmeldeStatus }): void;
  (e: "submit"): void;
  (e: "reset"): void;
}>();

const statusOptions: AnmeldeStatus[] = ["geplant", "aktiv", "abgeschlossen"];
const verfahrenstypOptions: Array<{ value: Anmeldeverfahrenstyp; label: string }> = [
  { value: "GS", label: "Grundschule" },
  { value: "SEK1", label: "Sek I" },
];
</script>

<template>
  <section class="anm-card anm-verfahren-form-card" :class="{ 'is-editing': !!modelValue.id }">
    <div class="anm-card-head anm-verfahren-form-head">
      <div class="anm-verfahren-form-title">
        <h3>{{ modelValue.id ? "Verfahren bearbeiten" : "Neues Verfahren" }}</h3>        
      </div>
    </div>

    <div class="anm-form-grid anm-verfahren-form-grid anm-verfahren-form-grid-top">
      <label class="field-block anm-form-field anm-form-field-schoolyear">
        <span class="field-label">Schuljahr</span>
        <input
          :value="modelValue.schuljahr"
          placeholder="2026_27"
          :disabled="saving"
          @input="emit('update:modelValue', { ...modelValue, schuljahr: String(($event.target as HTMLInputElement).value || '') })"
        />
      </label>

      <label class="field-block anm-form-field anm-form-field-wide">
        <span class="field-label">Bezeichnung</span>
        <input
          :value="modelValue.bezeichnung"
          placeholder="Anmeldeverfahren 2026/27"
          :disabled="saving"
          @input="emit('update:modelValue', { ...modelValue, bezeichnung: String(($event.target as HTMLInputElement).value || '') })"
        />
      </label>

      <label class="field-block anm-form-field anm-form-field-type">
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

    <div class="anm-verfahren-form-bottom">
      <label class="field-block anm-form-field anm-form-field-status">
        <span class="field-label">Status</span>
        <select
          :value="modelValue.status"
          :disabled="saving"
          @change="emit('update:modelValue', { ...modelValue, status: String(($event.target as HTMLSelectElement).value || 'geplant') as AnmeldeStatus })"
        >
          <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
        </select>
      </label>

      <div class="anm-actions anm-verfahren-form-actions">
        <button class="btn-secondary anm-form-secondary-btn" type="button" :disabled="saving" @click="emit('reset')">
          Reset
        </button>
        <button class="btn-primary anm-form-primary-btn" type="button" :disabled="saving" @click="emit('submit')">
          {{ saving ? "Speichere..." : (modelValue.id ? "Aenderungen speichern" : "Verfahren anlegen") }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.anm-verfahren-form-card {
  gap: 12px;
  padding: 16px;
  background: linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
}

.anm-verfahren-form-head {
  display: flex;
  align-items: start;
  gap: 10px;
}

.anm-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.anm-verfahren-form-grid-top {
  align-items: end;
}

.anm-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.anm-actions-end {
  justify-content: flex-end;
}

.anm-verfahren-form-title {
  display: grid;
  gap: 4px;
}

.anm-verfahren-form-title h3 {
  margin: 0;
  font-size: 1.05rem;
}

.anm-verfahren-form-title p {
  margin: 0;
  color: #607794;
  font-size: 12px;
  line-height: 1.4;
}

.anm-form-field {
  gap: 5px;
}

.anm-form-field:focus-within {
  transform: none;
}

.anm-form-field-wide {
  min-width: 0;
}

.anm-verfahren-form-bottom {
  display: grid;
  grid-template-columns: minmax(180px, 240px) auto;
  gap: 10px;
  align-items: end;
}

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

.anm-verfahren-form-actions {
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
  .anm-form-grid {
    grid-template-columns: 1fr;
  }

  .anm-verfahren-form-bottom {
    grid-template-columns: 1fr;
  }

  .anm-verfahren-form-head {
    display: block;
  }

  .anm-verfahren-form-actions {
    justify-content: stretch;
  }

  .anm-form-primary-btn,
  .anm-form-secondary-btn {
    flex: 1 1 100%;
  }
}
</style>
