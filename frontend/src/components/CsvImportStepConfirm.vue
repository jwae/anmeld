<script setup lang="ts">
defineProps<{
  summary: Record<string, number>;
}>();
</script>

<template>
  <section class="wizard-step">
    <div class="summary-grid">
      <article v-for="(value, key) in summary" :key="key" class="summary-card">
        <span>{{ key }}</span>
        <strong>{{ value }}</strong>
      </article>
    </div>
  </section>
</template>

<style scoped>
.wizard-step {
  display: grid;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.summary-card {
  display: grid;
  gap: 8px;
  padding: 16px 18px;
  border: 1px solid #dbe4f0;
  border-radius: 18px;
  background: #fff;
}

.summary-card span {
  color: #5f7697;
  text-transform: capitalize;
}

.summary-card strong {
  font-size: 24px;
  color: #19365b;
}

@media (max-width: 760px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
