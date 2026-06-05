<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  kapazitaet: any | null;
  schulen: any[];
  verfahrenId: number | null;
}>();

const emit = defineEmits<{
  (e: 'save', data: any): void;
  (e: 'cancel'): void;
}>();

const formData = ref({
  id: null as number | null,
  verfahren_id: props.verfahrenId ?? 0,
  snr: '',
  jahrgang: '',
  maximale_klassen: 0,
  maximale_schueler_pro_klasse: 0,
  gesamtkapazitaet: 0,
  reservierte_plaetze: 0,
  bemerkung: '',
});

const errors = ref<string[]>([]);

const isEditMode = computed(() => Boolean(formData.value.id));

watch(() => props.kapazitaet, (newVal) => {
  if (newVal) {
    formData.value = {
      id: Number(newVal.id || 0) || null,
      verfahren_id: Number(newVal.verfahren_id || props.verfahrenId || 0),
      snr: String(newVal.snr || ''),
      jahrgang: String(newVal.jahrgang || ''),
      maximale_klassen: Number(newVal.maximale_klassen || 0),
      maximale_schueler_pro_klasse: Number(newVal.maximale_schueler_pro_klasse || 0),
      gesamtkapazitaet: Number(newVal.gesamtkapazitaet || 0),
      reservierte_plaetze: Number(newVal.reservierte_plaetze || 0),
      bemerkung: String(newVal.bemerkung || ''),
    };
    return;
  }

  formData.value = {
    id: null,
    verfahren_id: props.verfahrenId ?? 0,
    snr: '',
    jahrgang: '',
    maximale_klassen: 0,
    maximale_schueler_pro_klasse: 0,
    gesamtkapazitaet: 0,
    reservierte_plaetze: 0,
    bemerkung: '',
  };
}, { immediate: true });

function validate() {
  errors.value = [];

  if (!formData.value.verfahren_id) {
    errors.value.push('Ein Anmeldeverfahren ist erforderlich.');
  }
  if (!formData.value.snr) {
    errors.value.push('Schule ist erforderlich.');
  }
  if (!formData.value.jahrgang) {
    errors.value.push('Jahrgang ist erforderlich.');
  }
  if (formData.value.maximale_klassen < 0) {
    errors.value.push('Maximale Klassen dürfen nicht negativ sein.');
  }
  if (formData.value.maximale_schueler_pro_klasse < 0) {
    errors.value.push('Schüler pro Klasse dürfen nicht negativ sein.');
  }
  if (formData.value.gesamtkapazitaet < 0) {
    errors.value.push('Gesamtkapazität darf nicht negativ sein.');
  }
  if (formData.value.reservierte_plaetze < 0) {
    errors.value.push('Reservierte Plätze dürfen nicht negativ sein.');
  }
  if (formData.value.reservierte_plaetze > formData.value.gesamtkapazitaet) {
    errors.value.push('Reservierte Plätze dürfen die Gesamtkapazität nicht überschreiten.');
  }

  return errors.value.length === 0;
}

function save() {
  if (!validate()) {
    return;
  }

  emit('save', {
    id: formData.value.id,
    verfahren_id: Number(formData.value.verfahren_id || 0),
    snr: String(formData.value.snr || '').trim(),
    jahrgang: String(formData.value.jahrgang || '').trim(),
    maximale_klassen: Number(formData.value.maximale_klassen || 0),
    maximale_schueler_pro_klasse: Number(formData.value.maximale_schueler_pro_klasse || 0),
    gesamtkapazitaet: Number(formData.value.gesamtkapazitaet || 0),
    reservierte_plaetze: Number(formData.value.reservierte_plaetze || 0),
    bemerkung: String(formData.value.bemerkung || '').trim(),
  });
}
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('cancel')">
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-header-copy">
          <p class="modal-eyebrow">Kapazitätsformular</p>
          <h2>{{ isEditMode ? 'Kapazität bearbeiten' : 'Neue Kapazität anlegen' }}</h2>
          <p class="modal-subtitle">
            Pflege hier Jahrgang, Kapazität und reservierte Plätze für die ausgewählte Schule.
          </p>
        </div>
        <button type="button" class="btn-secondary modal-close-button" @click="$emit('cancel')">
          Schliessen
        </button>
      </div>

      <div v-if="errors.length" class="feedback-panel feedback-panel-error">
        <p class="feedback-title">Bitte prüfen</p>
        <ul class="validation-list">
          <li v-for="error in errors" :key="error">{{ error }}</li>
        </ul>
      </div>

      <form class="kapazitaet-form-grid" @submit.prevent="save">
        <label class="field-block">
          <span class="field-label">Schule *</span>
          <select v-model="formData.snr" :disabled="isEditMode" required>
            <option value="" disabled>Bitte wählen</option>
            <option v-for="school in schulen" :key="school.snr" :value="school.snr">
              {{ school.name }}
            </option>
          </select>
        </label>

        <label class="field-block">
          <span class="field-label">Jahrgang *</span>
          <input v-model="formData.jahrgang" :disabled="isEditMode" type="text" placeholder="z. B. 5" required />
        </label>

        <label class="field-block">
          <span class="field-label">Maximale Klassen</span>
          <input v-model.number="formData.maximale_klassen" type="number" min="0" />
        </label>

        <label class="field-block">
          <span class="field-label">Schüler pro Klasse</span>
          <input v-model.number="formData.maximale_schueler_pro_klasse" type="number" min="0" />
        </label>

        <label class="field-block">
          <span class="field-label">Gesamtkapazität</span>
          <input v-model.number="formData.gesamtkapazitaet" type="number" min="0" />
        </label>

        <label class="field-block">
          <span class="field-label">Reservierte Plätze</span>
          <input v-model.number="formData.reservierte_plaetze" type="number" min="0" />
        </label>

        <label class="field-block kapazitaet-form-full-width">
          <span class="field-label">Bemerkung</span>
          <textarea v-model="formData.bemerkung" rows="4" placeholder="Hinweise, Sonderfälle, interne Notizen"></textarea>
        </label>
      </form>

      <div class="modal-actions">
        <button type="button" class="btn-secondary" @click="$emit('cancel')">Abbrechen</button>
        <button type="submit" class="btn-primary" @click="save">Speichern</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(circle at top, rgba(56, 118, 196, 0.18), transparent 30%),
    rgba(15, 31, 58, 0.52);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 1000;
}

.modal-content {
  width: min(720px, 100%);
  max-height: min(88vh, 900px);
  overflow: auto;
  background:
    linear-gradient(180deg, rgba(247, 251, 255, 0.96) 0%, rgba(255, 255, 255, 0.98) 100%);
  border: 1px solid rgba(207, 222, 239, 0.9);
  border-radius: 28px;
  padding: 26px;
  box-shadow:
    0 28px 80px rgba(19, 54, 102, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.85);
}

.modal-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e4edf7;
}

.modal-header-copy {
  display: grid;
  gap: 6px;
}

.modal-close-button {
  flex-shrink: 0;
  align-self: start;
}

.modal-eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #6680a3;
}

.modal-header h2 {
  margin: 0;
  color: #17385f;
  font-size: clamp(24px, 3vw, 30px);
  line-height: 1.15;
}

.modal-subtitle {
  margin: 0;
  color: #597190;
  line-height: 1.5;
  max-width: 56ch;
}

.kapazitaet-form-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.kapazitaet-form-full-width {
  grid-column: 1 / -1;
}

.field-block {
  display: grid;
  gap: 8px;
}

.field-label {
  font-size: 13px;
  font-weight: 700;
  color: #26476f;
}

select,
input,
textarea {
  width: 100%;
  border: 1px solid #cddaea;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.96);
  color: #17385f;
  padding: 12px 14px;
  font: inherit;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

textarea {
  min-height: 118px;
  resize: vertical;
}

select:focus,
input:focus,
textarea:focus {
  outline: none;
  border-color: #5a97e5;
  box-shadow: 0 0 0 4px rgba(90, 151, 229, 0.18);
  background: #ffffff;
}

select:disabled,
input:disabled,
textarea:disabled {
  background: #f2f6fb;
  color: #6c7f98;
  cursor: not-allowed;
}

.validation-list {
  margin: 0;
  padding-left: 18px;
}

.modal-actions {
  margin-top: 22px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 18px;
  border-top: 1px solid #e4edf7;
}

.btn-primary {
  border: 0;
  border-radius: 999px;
  padding: 11px 18px;
  background: linear-gradient(180deg, #1f72d8 0%, #1459a8 100%);
  color: #ffffff;
  font-weight: 700;
  box-shadow: 0 12px 28px rgba(20, 89, 168, 0.2);
  transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
}

.btn-secondary {
  border: 1px solid #cbd8e7;
  border-radius: 999px;
  padding: 11px 18px;
  background: rgba(255, 255, 255, 0.9);
  color: #1f3556;
  font-weight: 700;
  transition: transform 0.18s ease, border-color 0.18s ease, background-color 0.18s ease;
}

.btn-primary:hover,
.btn-secondary:hover {
  transform: translateY(-1px);
}

.btn-primary:hover {
  filter: brightness(1.03);
  box-shadow: 0 14px 32px rgba(20, 89, 168, 0.24);
}

.btn-secondary:hover {
  border-color: #b4c7de;
  background: #ffffff;
}

@media (max-width: 720px) {
  .modal-overlay {
    padding: 14px;
  }

  .modal-content {
    padding: 18px;
    border-radius: 22px;
  }

  .modal-header {
    flex-direction: column;
    align-items: stretch;
  }

  .modal-close-button {
    width: 100%;
  }

  .kapazitaet-form-grid {
    grid-template-columns: 1fr;
  }

  .modal-actions {
    flex-direction: column-reverse;
  }

  .modal-actions .btn-primary,
  .modal-actions .btn-secondary {
    width: 100%;
  }
}
</style>
