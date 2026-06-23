<script setup lang="ts">
defineProps<{
  columns: string[];
  previewRows: string[][];
  rowCount: number;
  delimiterLabel: string;
}>();
</script>

<template>
  <section class="wizard-step">
    <div class="step-summary-grid">
      <article class="summary-card">
        <span>Erkannte Zeilen</span>
        <strong>{{ rowCount }}</strong>
      </article>
      <article class="summary-card">
        <span>Erkannte Spalten</span>
        <strong>{{ columns.length }}</strong>
      </article>
      <article class="summary-card">
        <span>Trennzeichen</span>
        <strong>{{ delimiterLabel }}</strong>
      </article>
    </div>

    <div class="table-wrap">
      <table class="wizard-table">
        <thead>
          <tr>
            <th>#</th>
            <th v-for="column in columns" :key="column">{{ column }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in previewRows" :key="`preview-${rowIndex}`">
            <td>{{ rowIndex + 1 }}</td>
            <td v-for="(column, colIndex) in columns" :key="`${column}-${colIndex}`">
              {{ row[colIndex] || "-" }}
            </td>
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

.step-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(140px, 220px));
  gap: 14px;
  justify-content: start;
}

.summary-card {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid #dbe4f0;
  border-radius: 18px;
  background: #f8fbff;
}

.summary-card span {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6680a3;
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
  vertical-align: top;
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
  .step-summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
