<script setup lang="ts">defineProps<{ summary: Record<string, number> }>();</script>
<template><section class="wizard-step"><div class="summary-grid"><article v-for="(value,key) in summary" :key="key" class="summary-card"><span>{{ key }}</span><strong>{{ value }}</strong></article></div></section></template>
<style scoped>
.wizard-step{display:grid}.summary-grid{display:grid;grid-template-columns:repeat(4,minmax(130px,190px));gap:14px;justify-content:start}.summary-card{display:grid;gap:8px;padding:12px 14px;border:1px solid #dbe4f0;border-radius:18px;background:#fff}.summary-card span{font-size:11px;color:#5f7697}.summary-card strong{font-size:17px;color:#19365b}@media (max-width:760px){.summary-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
</style>
