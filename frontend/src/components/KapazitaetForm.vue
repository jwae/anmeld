<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  kapazitaet: any | null;
  schulen: any[];
  verfahrenId: number | null;
  errorMessage?: string;
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
  reservierte_plaetze: 0,
  bemerkung: '',
});

const errors = ref<string[]>([]);

const isEditMode = computed(() => Boolean(formData.value.id));
const gesamtkapazitaet = computed(() =>
  Number(formData.value.maximale_klassen || 0)
  * Number(formData.value.maximale_schueler_pro_klasse || 0)
  + Number(formData.value.reservierte_plaetze || 0),
);

watch(() => props.kapazitaet, (newVal) => {
  if (newVal) {
    formData.value = {
      id: Number(newVal.id || 0) || null,
      verfahren_id: Number(newVal.verfahren_id || props.verfahrenId || 0),
      snr: String(newVal.snr || ''),
      jahrgang: String(newVal.jahrgang || ''),
      maximale_klassen: Number(newVal.maximale_klassen || 0),
      maximale_schueler_pro_klasse: Number(newVal.maximale_schueler_pro_klasse || 0),
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
  if (gesamtkapazitaet.value < 0) {
    errors.value.push('Gesamtkapazität darf nicht negativ sein.');
  }
  if (formData.value.reservierte_plaetze < 0) {
    errors.value.push('Reservierte Plätze dürfen nicht negativ sein.');
  }
  if (formData.value.reservierte_plaetze > gesamtkapazitaet.value) {
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
    gesamtkapazitaet: gesamtkapazitaet.value,
    reservierte_plaetze: Number(formData.value.reservierte_plaetze || 0),
    bemerkung: String(formData.value.bemerkung || '').trim(),
  });
}
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('cancel')">
    <div class="modal-content anm-procedure-surface">
      <div class="modal-header">
        <div class="modal-header-copy">
          <p class="modal-eyebrow anm-procedure-copy anm-procedure-ui">Kapazitätsformular</p>
          <h2 class="anm-procedure-title anm-procedure-ui">{{ isEditMode ? 'Kapazität bearbeiten' : 'Neue Kapazität anlegen' }}</h2>
          <p class="modal-subtitle anm-procedure-copy anm-procedure-ui">
            Pflege hier Jahrgang, Kapazität und reservierte Plätze für die ausgewählte Schule.
          </p>
        </div>
        <button type="button" class="modal-close-button anm-button anm-procedure-ui" @click="$emit('cancel')">
          Schliessen
        </button>
      </div>

      <div
        v-if="errorMessage || errors.length"
        class="feedback-panel feedback-panel-error kapazitaet-form-error anm-alert anm-status--danger anm-procedure-ui"
        role="alert"
        aria-live="assertive"
      >
        <div class="kapazitaet-form-error-heading">
          <i class="bi bi-exclamation-octagon-fill" aria-hidden="true"></i>
          <p class="feedback-title anm-procedure-copy anm-procedure-ui">Eingaben konnten nicht gespeichert werden</p>
        </div>
        <p v-if="errorMessage" class="kapazitaet-form-error-message anm-procedure-copy anm-procedure-ui">{{ errorMessage }}</p>
        <ul v-if="errors.length" class="validation-list">
          <li v-for="error in errors" :key="error">{{ error }}</li>
        </ul>
      </div>

      <form class="kapazitaet-form-grid" @submit.prevent="save">
        <label class="field-block anm-field anm-procedure-ui">
          <span class="field-label anm-label anm-procedure-ui">Schule *</span>
          <select class="anm-input anm-procedure-ui" v-model="formData.snr" :disabled="isEditMode" required>
            <option value="" disabled>Bitte wählen</option>
            <option v-for="school in schulen" :key="school.snr" :value="school.snr">
              {{ school.name }}
            </option>
          </select>
        </label>

        <label class="field-block anm-field anm-procedure-ui">
          <span class="field-label anm-label anm-procedure-ui">Jahrgang *</span>
          <input class="anm-input anm-procedure-ui" v-model="formData.jahrgang" :disabled="isEditMode" type="text" placeholder="z. B. 5" required />
        </label>

        <label class="field-block anm-field anm-procedure-ui">
          <span class="field-label anm-label anm-procedure-ui">Maximale Klassen</span>
          <input class="anm-input anm-procedure-ui" v-model.number="formData.maximale_klassen" type="number" min="0" />
        </label>

        <label class="field-block anm-field anm-procedure-ui">
          <span class="field-label anm-label anm-procedure-ui">Schüler pro Klasse</span>
          <input class="anm-input anm-procedure-ui" v-model.number="formData.maximale_schueler_pro_klasse" type="number" min="0" />
        </label>

        <label class="field-block anm-field anm-procedure-ui">
          <span class="field-label anm-label anm-procedure-ui">Reservierte Plätze</span>
          <input class="anm-input anm-procedure-ui" v-model.number="formData.reservierte_plaetze" type="number" min="0" />
        </label>

        <label class="field-block anm-field anm-procedure-ui">
          <span class="field-label anm-label anm-procedure-ui">Gesamtkapazität</span>
          <input class="anm-input anm-procedure-ui"
            :value="gesamtkapazitaet"
            type="text"
            readonly
            title="Automatisch berechnet: Klassen × Schüler pro Klasse + reservierte Plätze"
            aria-label="Gesamtkapazität. Automatisch berechnet aus Klassen, Schülern pro Klasse und reservierten Plätzen."
          />
        </label>



        <label class="field-block kapazitaet-form-full-width anm-field anm-procedure-ui">
          <span class="field-label anm-label anm-procedure-ui">Bemerkung</span>
          <textarea class="anm-input anm-procedure-ui" v-model="formData.bemerkung" rows="4" placeholder="Hinweise, Sonderfälle, interne Notizen"></textarea>
        </label>
      </form>

      <div class="modal-actions">
        <button type="button" class="anm-button anm-procedure-ui" @click="$emit('cancel')">Abbrechen</button>
        <button type="submit" class="anm-button anm-button--primary anm-procedure-ui" @click="save">Speichern</button>
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
  text-transform: uppercase;
}

.modal-eyebrow:where(:not(.anm-procedure-ui)) {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #6680a3;
}

.modal-header h2 {
  margin: 0;
}

.modal-header h2:where(:not(.anm-procedure-ui)) {
  color: #17385f;
  font-size: clamp(24px, 3vw, 30px);
  line-height: 1.15;
}

.modal-subtitle {
  margin: 0;
  max-width: 56ch;
}

.modal-subtitle:where(:not(.anm-procedure-ui)) {
  color: #597190;
  line-height: 1.5;
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

.field-label:where(:not(.anm-procedure-ui)) {
  font-size: 13px;
  font-weight: 700;
  color: #26476f;
}

select,
input,
textarea {
  width: 100%;
}

select:where(:not(.anm-procedure-ui)),
input:where(:not(.anm-procedure-ui)),
textarea:where(:not(.anm-procedure-ui)) {
  border: 1px solid #cddaea;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.96);
  color: #17385f;
  padding: 12px 14px;
  font: inherit;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

textarea {
  resize: vertical;
}

textarea:where(:not(.anm-procedure-ui)) {
  min-height: 118px;
}

select:focus,
input:focus,
textarea:focus {
  outline: none;
}

select:focus:where(:not(.anm-procedure-ui)),
input:focus:where(:not(.anm-procedure-ui)),
textarea:focus:where(:not(.anm-procedure-ui)) {
  border-color: #5a97e5;
  box-shadow: 0 0 0 4px rgba(90, 151, 229, 0.18);
  background: #ffffff;
}

input[readonly] {
  cursor: default;
}

input[readonly]:where(:not(.anm-procedure-ui)) {
  background: #f2f6fb;
  color: #6c7f98;
  border-color: #dce5ef;
}

select:disabled,
input:disabled,
textarea:disabled {
  cursor: not-allowed;
}

select:disabled:where(:not(.anm-procedure-ui)),
input:disabled:where(:not(.anm-procedure-ui)),
textarea:disabled:where(:not(.anm-procedure-ui)) {
  background: #f2f6fb;
  color: #6c7f98;
}

.validation-list {
  margin: 0;
  padding-left: 18px;
}

.kapazitaet-form-error {
  margin-bottom: 20px;
}

.kapazitaet-form-error:where(:not(.anm-procedure-ui)) {
  padding: 16px 18px;
  border: 2px solid #dc2626;
  border-left-width: 6px;
  border-radius: 16px;
  background: linear-gradient(135deg, #fff1f2 0%, #fee2e2 100%);
  color: #7f1d1d;
  box-shadow: 0 10px 26px rgba(185, 28, 28, 0.16);
}

.kapazitaet-form-error-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kapazitaet-form-error-heading i {
  flex: 0 0 auto;
  color: #dc2626;
  font-size: 22px;
}

.kapazitaet-form-error-heading .feedback-title,
.kapazitaet-form-error-message {
  margin: 0;
}

.kapazitaet-form-error-heading .feedback-title:where(:not(.anm-procedure-ui)) {
  color: #991b1b;
  font-size: 16px;
  font-weight: 800;
}

.kapazitaet-form-error-message,
.kapazitaet-form-error .validation-list {
  margin-top: 10px;
}

.kapazitaet-form-error-message:where(:not(.anm-procedure-ui)),
.kapazitaet-form-error .validation-list {
  font-weight: 650;
  line-height: 1.45;
}

.modal-actions {
  margin-top: 22px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 18px;
  border-top: 1px solid #e4edf7;
}

.btn-primary:where(:not(.anm-procedure-ui)) {
  border: 0;
  border-radius: 999px;
  padding: 11px 18px;
  background: linear-gradient(180deg, #1f72d8 0%, #1459a8 100%);
  color: #ffffff;
  font-weight: 700;
  box-shadow: 0 12px 28px rgba(20, 89, 168, 0.2);
  transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
}

.btn-secondary:where(:not(.anm-procedure-ui)) {
  border: 1px solid #cbd8e7;
  border-radius: 999px;
  padding: 11px 18px;
  background: rgba(255, 255, 255, 0.9);
  color: #1f3556;
  font-weight: 700;
  transition: transform 0.18s ease, border-color 0.18s ease, background-color 0.18s ease;
}

.btn-primary:hover:where(:not(.anm-procedure-ui)),
.btn-secondary:hover:where(:not(.anm-procedure-ui)) {
  transform: translateY(-1px);
}

.btn-primary:hover {
  filter: brightness(1.03);
}

.btn-primary:hover:where(:not(.anm-procedure-ui)) {
  box-shadow: 0 14px 32px rgba(20, 89, 168, 0.24);
}

.btn-secondary:hover:where(:not(.anm-procedure-ui)) {
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
