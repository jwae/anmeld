<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  schools: any[];
  gradeLevels: string[];
}>();

const emit = defineEmits<{
  (e: 'filter', filters: { search: string; schoolType: string; gradeLevel: string; showInactive: boolean }): void;
}>();

const search = ref('');
const schoolType = ref('');
const gradeLevel = ref('');
const showInactive = ref(true);

const schoolTypeOptions = computed(() => {
  const names = new Set<string>();
  for (const school of props.schools) {
    if (school.schulform_name) {
      names.add(String(school.schulform_name));
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
});

function applyFilter() {
  emit('filter', {
    search: search.value,
    schoolType: schoolType.value,
    gradeLevel: gradeLevel.value,
    showInactive: showInactive.value,
  });
}

function clearFilter() {
  search.value = '';
  schoolType.value = '';
  gradeLevel.value = '';
  showInactive.value = true;
  applyFilter();
}
</script>

<template>
  <section class="kapazitaet-filter-card">
    <div>
      <p class="kapazitaet-filter-eyebrow">Filter</p>
      <h3>Kapazitäten filtern</h3>
    </div>

    <div class="kapazitaet-filter-grid">
      <label class="field-block">
        <span class="field-label">Suche</span>
        <input
          v-model="search"
          type="search"
          placeholder="Schule oder SNR"
          @input="applyFilter"
        />
      </label>

      <label class="field-block">
        <span class="field-label">Schulform</span>
        <select v-model="schoolType" @change="applyFilter">
          <option value="">Alle Schulformen</option>
          <option v-for="option in schoolTypeOptions" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
      </label>

      <label class="field-block">
        <span class="field-label">Jahrgang</span>
        <select v-model="gradeLevel" @change="applyFilter">
          <option value="">Alle Jahrgänge</option>
          <option v-for="option in gradeLevels" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
      </label>

      <label class="field-block kapazitaet-filter-toggle">
        <span class="field-label">Aktive Schulen</span>
        <label class="kapazitaet-toggle-row">
          <input type="checkbox" v-model="showInactive" @change="applyFilter" />
          <span>Alle anzeigen</span>
        </label>
      </label>
    </div>

    <div class="kapazitaet-filter-actions">
      <button type="button" class="btn-secondary" @click="clearFilter">Zurücksetzen</button>
    </div>
  </section>
</template>

<style scoped>
.kapazitaet-filter-card {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid #dbe4f0;
  border-radius: 18px;
  background: #fbfdff;
}

.kapazitaet-filter-eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #6680a3;
}

.kapazitaet-filter-card h3 {
  margin: 0;
  color: #17385f;
}

.kapazitaet-filter-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.kapazitaet-filter-toggle {
  justify-content: end;
}

.kapazitaet-toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  color: #4a607e;
}

.kapazitaet-filter-actions {
  display: flex;
  justify-content: flex-end;
}

.btn-secondary {
  border: 1px solid #cbd8e7;
  border-radius: 999px;
  padding: 8px 14px;
  background: #ffffff;
  color: #1f3556;
  font-weight: 700;
}
</style>