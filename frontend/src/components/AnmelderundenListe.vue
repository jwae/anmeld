<script setup lang="ts">
import type { Anmelderunde, Anmeldeverfahren } from "../types";

defineProps<{
  verfahren: Anmeldeverfahren | null;
  items: Anmelderunde[];
  selectedId?: number | null;
  loading?: boolean;
  deletingId?: number | null;
  nextRoundId?: number | null;
  procedureLocked?: boolean;
}>();

const emit = defineEmits<{
  (e: "select", id: number): void;
  (e: "edit", item: Anmelderunde): void;
  (e: "delete", item: Anmelderunde): void;
  (e: "set-working", item: Anmelderunde): void;
  (e: "start-round", item: Anmelderunde): void;
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
            <th>Runde</th>
            <th>Zeitraum</th>
            <th>Status</th>
            <th>Arbeitsrunde</th>
            <th>Aktion</th>
            <th>Bearbeiten</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.id"
            :class="{ 'is-selected': item.id === selectedId }"
            @click="emit('select', item.id)"
          >
            <td class="anm-cell-title">
              <strong>Runde {{ item.runden_nummer }}</strong>
              <span>{{ item.bezeichnung }}</span>
            </td>
            <td class="anm-cell-date">{{ formatDate(item.startdatum) }} bis {{ formatDate(item.enddatum) }}</td>
            <td><span class="anm-status-pill" :data-status="item.status">{{ item.status }}</span></td>
            <td>{{ item.ist_arbeitsrunde ? "Ja" : "Nein" }}</td>
            <td class="anm-cell-actions">
              <div class="anm-action-stack">
                <button
                  v-if="!item.ist_arbeitsrunde"
                  class="btn-secondary anm-inline-btn"
                  type="button"
                  :disabled="procedureLocked"
                  @click.stop="emit('set-working', item)"
                >
                  Als Arbeitsrunde setzen
                </button>
                <button
                  v-if="item.id === nextRoundId"
                  class="btn-secondary anm-inline-btn"
                  type="button"
                  :disabled="procedureLocked"
                  @click.stop="emit('start-round', item)"
                >
                  Runde starten
                </button>
                <span v-if="item.ist_arbeitsrunde && item.id !== nextRoundId" class="anm-muted-action">-</span>
              </div>
            </td>
            <td class="anm-cell-actions">
              <div class="anm-actions">
                <button
                  class="btn-secondary anm-icon-btn"
                  type="button"
                  :disabled="procedureLocked"
                  title="Bearbeiten"
                  aria-label="Bearbeiten"
                  @click.stop="emit('edit', item)"
                >
                  <i class="bi bi-pencil-square" aria-hidden="true"></i>
                </button>
                <button
                  class="btn-secondary anm-icon-btn anm-danger-btn"
                  type="button"
                  :disabled="deletingId === item.id || procedureLocked || item.ist_arbeitsrunde || item.status === 'Beendet'"
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
  padding: 16px;
}

.anm-card-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.anm-card-head h3 {
  margin: 0;
  color: #19385e;
  font-size: 1.12rem;
  line-height: 1.25;
}

.anm-card-head p {
  margin: 4px 0 0;
  color: #607794;
  font-size: 12px;
}

.anm-badge {
  min-width: 38px;
  padding: 5px 10px;
  border-radius: 999px;
  background: #eef3f8;
  color: #20476f;
  font-weight: 800;
  text-align: center;
  font-size: 12px;
}

.anm-empty-state,
.anm-loading-state,
.anm-empty-cell {
  padding: 14px;
  border: 1px dashed #cfdbeb;
  border-radius: 14px;
  background: #f8fbff;
  color: #607794;
  font-size: 12px;
}

.anm-table-wrap {
  min-width: 0;
  overflow: auto;
  border: 1px solid #e3ebf4;
  border-radius: 14px;
  background: #ffffff;
}

.anm-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  min-width: 880px;
}

.anm-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 9px 12px;
  border-bottom: 1px solid #dbe6f2;
  background: #f7fafd;
  color: #6a82a0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
}

.anm-table tbody td {
  padding: 9px 12px;
  border-bottom: 1px solid #ebf1f7;
  vertical-align: middle;
  font-size: 12px;
  line-height: 1.2;
}

.anm-table tbody tr {
  cursor: pointer;
  transition: background-color 0.18s ease;
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

.anm-cell-title {
  min-width: 180px;
}

.anm-cell-title strong {
  display: block;
  color: #18395f;
  font-size: 13px;
}

.anm-cell-title span,
.anm-cell-date,
.anm-muted-action {
  color: #6b819c;
}

.anm-status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 9px;
  border-radius: 999px;
  background: #edf3f8;
  color: #38526e;
  font-size: 11px;
  font-weight: 800;
}

.anm-status-pill[data-status="In Bearbeitung"] {
  background: #e8f7eb;
  color: #266b35;
}

.anm-status-pill[data-status="Beendet"] {
  background: #eef1f4;
  color: #5b6775;
}

.anm-inline-btn {
  min-height: 30px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.anm-action-stack {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.anm-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.anm-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #30506f;
}

.anm-icon-btn:hover:not(:disabled) {
  background: #eef5fc;
}

.anm-icon-btn i {
  font-size: 13px;
}

.anm-danger-btn {
  color: #9a3a3a;
}

.anm-danger-btn:hover:not(:disabled) {
  background: #faeeee;
}
</style>
