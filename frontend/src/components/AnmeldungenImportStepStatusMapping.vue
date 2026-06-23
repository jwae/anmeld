<script setup lang="ts">
defineProps<{ statusValues: string[]; targetValues: string[]; statusMapping: Record<string, string> }>();
defineEmits<{ (event: "change", payload: { raw: string; value: string }): void; }>();
</script>
<template>
  <section class="wizard-step">
    <div class="mapping-grid">
      <article v-for="statusValue in statusValues" :key="statusValue" class="mapping-card">
        <div class="mapping-copy">
          <p class="mapping-title">{{ statusValue || "(leer)" }}</p>
          <p>CSV-Statuswert einem Datenbankstatus zuordnen.</p>
        </div>
        <select :value="statusMapping[statusValue] || ''" @change="$emit('change', { raw: statusValue, value: ($event.target as HTMLSelectElement).value })">
          <option value="">Bitte zuordnen</option>
          <option v-for="target in targetValues" :key="target" :value="target">{{ target }}</option>
        </select>
      </article>
    </div>
  </section>
</template>
<style scoped>
.wizard-step { display: grid; }
.mapping-grid { display: grid; gap: 10px; }
.mapping-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, 240px); gap: 12px; align-items: center; padding: 12px 14px; border: 1px solid #dbe4f0; border-radius: 14px; background: #fff; }
.mapping-title { margin: 0 0 4px; font-weight: 700; color: #19365b; font-size: 14px; }
.mapping-copy p:last-child { margin: 0; color: #526985; font-size: 12px; }
select { min-height: 38px; border: 1px solid #c8d6e8; border-radius: 12px; padding: 8px 10px; font-size: 13px; }
@media (max-width: 900px) { .mapping-card { grid-template-columns: 1fr; } }
</style>
