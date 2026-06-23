<script setup lang="ts">
defineProps<{
  verfahrenId: number | null;
  rundeId: number | null;
  globalSchulNr: string;
  schools: Array<{ snr: string; name: string }>;
}>();

defineEmits<{
  (event: "update:globalSchulNr", value: string): void;
}>();
</script>

<template>
  <section class="wizard-step">
    <div class="context-grid">
      <article class="context-card">
        <span>Verfahren</span>
        <strong>{{ verfahrenId || "-" }}</strong>
      </article>
      <article class="context-card">
        <span>Runde</span>
        <strong>{{ rundeId || "-" }}</strong>
      </article>
      <article class="context-card">
        <span>Importtyp</span>
        <strong>Anmeldung</strong>
      </article>
    </div>

    <label class="context-select">
      <span>Globale Aufnahmeschule (optional)</span>
      <select :value="globalSchulNr" @change="$emit('update:globalSchulNr', ($event.target as HTMLSelectElement).value)">
        <option value="">Aus CSV ableiten</option>
        <option v-for="school in schools" :key="school.snr" :value="school.snr">
          {{ school.snr }} | {{ school.name }}
        </option>
      </select>
    </label>
  </section>
</template>

<style scoped>
.wizard-step { display: grid; gap: 16px; }
.context-grid { display: grid; grid-template-columns: repeat(3, minmax(140px, 220px)); gap: 12px; }
.context-card { display: grid; gap: 6px; padding: 12px 14px; border: 1px solid #dbe4f0; border-radius: 18px; background: #f8fbff; }
.context-card span { font-size: 11px; text-transform: uppercase; color: #6680a3; letter-spacing: 0.08em; }
.context-card strong { font-size: 18px; color: #19365b; }
.context-select { display: grid; gap: 6px; max-width: 420px; }
.context-select span { font-size: 13px; font-weight: 700; color: #45617f; }
.context-select select { min-height: 42px; border: 1px solid #c8d6e8; border-radius: 14px; padding: 0 12px; }
@media (max-width: 760px) { .context-grid { grid-template-columns: 1fr; } }
</style>
