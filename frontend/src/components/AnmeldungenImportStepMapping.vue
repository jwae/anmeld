<script setup lang="ts">
defineProps<{ fields: Array<{ key: string; label: string; description: string; required: boolean; readOnly?: boolean; systemValue?: string }>; columns: string[]; mapping: Record<string, string>; globalSchulNr: string }>();
defineEmits<{ (event: "change", payload: { key: string; value: string }): void; }>();
</script>
<template>
  <section class="wizard-step">
    <div class="mapping-grid">
      <article v-for="field in fields" :key="field.key" class="mapping-card">
        <div class="mapping-copy">
          <p class="mapping-title">{{ field.label }}<span v-if="field.required" class="mapping-badge is-required">Pflicht</span><span v-else-if="field.readOnly" class="mapping-badge">Automatisch</span></p>
          <p>{{ field.key === 'anmeldeschule_snr' && globalSchulNr ? 'Globaler Schulwert vorhanden, CSV-Feld optional.' : field.description }}</p>
        </div>
        <template v-if="field.readOnly"><div class="mapping-readonly">{{ field.systemValue || "Automatisch gesetzt" }}</div></template>
        <template v-else><select :value="mapping[field.key] || ''" @change="$emit('change', { key: field.key, value: ($event.target as HTMLSelectElement).value })"><option value="">Nicht zuordnen</option><option v-for="column in columns" :key="column" :value="column">{{ column }}</option></select></template>
      </article>
    </div>
  </section>
</template>
<style scoped>
.wizard-step { display: grid; }
.mapping-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.mapping-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, 220px); gap: 12px; align-items: center; padding: 12px 14px; border: 1px solid #dbe4f0; border-radius: 14px; background: #fff; }
.mapping-title { margin: 0 0 4px; font-weight: 700; color: #19365b; font-size: 14px; }
.mapping-copy p:last-child { margin: 0; color: #526985; font-size: 12px; line-height: 1.35; }
.mapping-badge { display: inline-flex; margin-left: 8px; padding: 2px 7px; border-radius: 999px; background: #e8eef6; font-size: 10px; color: #45617f; }
.mapping-badge.is-required { background: #dbeafe; color: #1d4ed8; }
select,.mapping-readonly { min-height: 38px; border: 1px solid #c8d6e8; border-radius: 12px; padding: 8px 10px; font-size: 13px; }
.mapping-readonly { display: flex; align-items: center; background: #f8fbff; color: #45617f; }
@media (max-width: 1080px) { .mapping-grid,.mapping-card { grid-template-columns: 1fr; } }
</style>
