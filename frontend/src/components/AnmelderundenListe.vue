<script setup lang="ts">
import type { Anmelderunde, Anmeldeverfahren } from "../types";

defineProps<{
  verfahren: Anmeldeverfahren | null;
  items: Anmelderunde[];
  selectedId?: number | null;
  loading?: boolean;
  deletingId?: number | null;
}>();

const emit = defineEmits<{
  (e: "select", id: number): void;
  (e: "edit", item: Anmelderunde): void;
  (e: "delete", item: Anmelderunde): void;
}>();

function formatDate(value: string | null) {
  return String(value || "").trim() || "-";
}
</script>

<template>
  <section class="anm-card">
    <div class="anm-card-head">
      <div>
        <h3>Anmelderunden</h3>
        <p v-if="verfahren">Runden fuer {{ verfahren.bezeichnung }}.</p>
        <p v-else>Bitte zuerst ein Verfahren auswaehlen.</p>
      </div>
      <span v-if="verfahren" class="anm-badge">{{ items.length }}</span>
    </div>

    <div v-if="!verfahren" class="anm-empty-state">
      Nach Auswahl eines Verfahrens erscheinen hier die zugehoerigen Anmelderunden.
    </div>

    <div v-else-if="loading" class="anm-loading-state">Runden werden geladen...</div>

    <div v-else class="anm-table-wrap">
      <table class="anm-table">
        <thead>
          <tr>
            <th>Rundennummer</th>
            <th>Bezeichnung</th>
            <th>Startdatum</th>
            <th>Enddatum</th>
            <th>Status</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.id"
            :class="{ 'is-selected': item.id === selectedId }"
            @click="emit('select', item.id)"
          >
            <td class="anm-cell-primary">{{ item.runden_nummer }}</td>
            <td class="anm-cell-title">
              <strong>{{ item.bezeichnung }}</strong>
            </td>
            <td class="anm-cell-date">{{ formatDate(item.startdatum) }}</td>
            <td class="anm-cell-date">{{ formatDate(item.enddatum) }}</td>
            <td><span class="anm-status-pill" :data-status="item.status">{{ item.status }}</span></td>
            <td class="anm-cell-actions">
              <div class="anm-actions">
                <button
                  class="btn-secondary anm-icon-btn"
                  type="button"
                  title="Bearbeiten"
                  aria-label="Bearbeiten"
                  @click.stop="emit('edit', item)"
                >
                  <i class="bi bi-pencil-square" aria-hidden="true"></i>
                </button>
                <button
                  class="btn-secondary anm-icon-btn anm-danger-btn"
                  type="button"
                  :disabled="deletingId === item.id"
                  title="Loeschen"
                  aria-label="Loeschen"
                  @click.stop="emit('delete', item)"
                >
                  <i v-if="deletingId !== item.id" class="bi bi-trash" aria-hidden="true"></i>
                  <span v-else class="anm-icon-btn-text">...</span>
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!items.length">
            <td colspan="6" class="anm-empty-cell">Noch keine Runden fuer dieses Verfahren vorhanden.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.anm-card {
  min-width: 0;
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background: #ffffff;
  box-shadow: 0 16px 32px rgba(23, 58, 108, 0.05);
}

.anm-card-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 14px;
}

.anm-card-head h3 {
  margin: 0;
  color: #19385e;
}

.anm-card-head p {
  margin: 6px 0 0;
  color: #607794;
}

.anm-badge {
  min-width: 44px;
  padding: 7px 12px;
  border-radius: 999px;
  background: #eef3f8;
  color: #20476f;
  font-weight: 800;
  text-align: center;
}

.anm-empty-state,
.anm-loading-state,
.anm-empty-cell {
  padding: 18px;
  border: 1px dashed #cfdbeb;
  border-radius: 18px;
  background: #f8fbff;
  color: #607794;
}

.anm-table-wrap {
  min-width: 0;
  overflow: auto;
  border: 1px solid #e3ebf4;
  border-radius: 16px;
  background: #ffffff;
}

.anm-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  min-width: 720px;
}

.anm-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 14px 16px;
  border-bottom: 1px solid #dbe6f2;
  background: #f7fafd;
  color: #6a82a0;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: left;
}

.anm-table tbody td {
  padding: 16px;
  border-bottom: 1px solid #ebf1f7;
  vertical-align: middle;
}

.anm-table tbody tr {
  cursor: pointer;
  transition: background-color 0.18s ease, transform 0.18s ease;
}

.anm-table tbody tr:hover {
  background: #f8fbff;
}

.anm-table tbody tr.is-selected {
  background: #eef6ff;
  box-shadow: inset 4px 0 0 #7da8d8;
}

.anm-table tbody tr:last-child td {
  border-bottom: 0;
}

.anm-cell-primary,
.anm-cell-actions {
  white-space: nowrap;
}

.anm-cell-title {
  min-width: 220px;
}

.anm-cell-title strong {
  color: #18395f;
  font-size: 15px;
}

.anm-cell-date {
  color: #6b819c;
  font-size: 13px;
}

.anm-status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 4px 12px;
  border-radius: 999px;
  background: #edf3f8;
  color: #38526e;
  font-weight: 800;
  text-transform: capitalize;
}

.anm-status-pill[data-status="aktiv"] {
  background: #e8f7eb;
  color: #266b35;
}

.anm-status-pill[data-status="abgeschlossen"] {
  background: #eef1f4;
  color: #5b6775;
}

.anm-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.anm-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
}

.anm-icon-btn-text {
  font-weight: 700;
}

.anm-danger-btn {
  border-color: #e6c9c9;
  color: #8f3333;
}

@media (max-width: 900px) {
  .anm-table {
    min-width: 640px;
  }
}
</style>
