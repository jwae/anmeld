<script setup lang="ts">
defineProps<{
  result: {
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
    row_results?: Array<{
      row_number: number;
      action: string;
      message: string;
    }>;
  } | null;
}>();
</script>

<template>
  <section class="wizard-step" v-if="result">
    <div class="summary-grid">
      <article class="summary-card">
        <span>Neu eingefügt</span>
        <strong>{{ result.inserted }}</strong>
      </article>
      <article class="summary-card">
        <span>Aktualisiert</span>
        <strong>{{ result.updated }}</strong>
      </article>
      <article class="summary-card">
        <span>Übersprungen</span>
        <strong>{{ result.skipped }}</strong>
      </article>
      <article class="summary-card">
        <span>Fehler</span>
        <strong>{{ result.errors }}</strong>
      </article>
    </div>

    <div v-if="result.row_results?.length" class="table-wrap">
      <table class="wizard-table">
        <thead>
          <tr>
            <th>Zeile</th>
            <th>Aktion</th>
            <th>Ergebnis</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in result.row_results" :key="`result-${entry.row_number}`">
            <td>{{ entry.row_number }}</td>
            <td>{{ entry.action }}</td>
            <td>{{ entry.message }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.wizard-step {
  display: grid;
  gap: 18px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(130px, 190px));
  gap: 14px;
  justify-content: start;
}

.summary-card {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid #dbe4f0;
  border-radius: 18px;
  background: #fff;
}

.summary-card span {
  font-size: 11px;
  color: #5f7697;
}

.summary-card strong {
  font-size: 17px;
  color: #19365b;
}

.table-wrap {
  overflow: auto;
  border: 1px solid #dbe4f0;
  border-radius: 18px;
  max-height: 520px;
}

.wizard-table {
  width: 100%;
  border-collapse: collapse;
}

.wizard-table th,
.wizard-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #e6eef7;
  text-align: left;
  line-height: 1.25;
  font-size: 13px;
}

.wizard-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f5f8fc;
  color: #19365b;
}

.wizard-table tbody tr:hover td {
  background: #e8f2ff;
  box-shadow: inset 0 1px 0 #d3e5ff, inset 0 -1px 0 #d3e5ff;
}

@media (max-width: 760px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
