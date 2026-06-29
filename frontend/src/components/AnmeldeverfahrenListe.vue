<script setup lang="ts">
import type { Anmeldeverfahren } from "../types";

defineProps<{
  items: Anmeldeverfahren[];
  selectedId: number | null;
  loading?: boolean;
  deletingId?: number | null;
  canCreate?: boolean;
  canStart?: boolean;
  canFinish?: boolean;
}>();

const emit = defineEmits<{
  (e: "select", id: number): void;
  (e: "edit", item: Anmeldeverfahren): void;
  (e: "delete", item: Anmeldeverfahren): void;
  (e: "create"): void;
  (e: "start"): void;
  (e: "finish"): void;
}>();

function formatTimestamp(value: string) {
  const trimmed = String(value || "").trim();
  return trimmed || "-";
}
</script>

<template>
  <section class="anm-card">
    <div class="anm-card-head">
      <div>
        <h3>Anmeldeverfahren</h3>
        <p>Alle vorhandenen Verfahren, sortiert nach Schuljahr.</p>
      </div>
      <div class="anm-card-head-actions">
        <button class="btn-secondary anm-head-btn anm-head-btn-primary" type="button" :disabled="canCreate === false" @click="emit('create')">
          Neues Verfahren
        </button>
        <button class="btn-secondary anm-head-btn anm-head-btn-success" type="button" :disabled="canStart === false" @click="emit('start')">
          Verfahren starten
        </button>
        <button class="btn-secondary anm-head-btn anm-head-btn-danger" type="button" :disabled="canFinish === false" @click="emit('finish')">
          Verfahren beenden
        </button>
        <span class="anm-badge">{{ items.length }}</span>
      </div>
    </div>

    <div v-if="loading" class="anm-loading-state">Verfahren werden geladen...</div>

    <div v-else class="anm-table-wrap">
      <table class="anm-table">
        <thead>
          <tr>
            <th>Schuljahr</th>
            <th>Bezeichnung</th>
            <th>Typ</th>
            <th>Status</th>
            <th>Sichtbar</th>
            <th>Arbeitsrunde</th>
            <th>Geaendert am</th>
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
            <td class="anm-cell-primary">{{ item.schuljahr }}</td>
            <td class="anm-cell-title">
              <strong>{{ item.bezeichnung }}</strong>
            </td>
            <td class="anm-cell-primary">{{ item.verfahrenstyp }}</td>
            <td><span class="anm-status-pill" :data-status="item.status">{{ item.status }}</span></td>
            <td>{{ item.sichtbar ? "Ja" : "Nein" }}</td>
            <td>{{ item.arbeitsrunde_nummer ? `Runde ${item.arbeitsrunde_nummer}` : "-" }}</td>
            <td class="anm-cell-muted">{{ formatTimestamp(item.updated_at) }}</td>
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
            <td colspan="8" class="anm-empty-cell">Noch kein Anmeldeverfahren vorhanden.</td>
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

.anm-card-head-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border: 1px solid #dbe6f2;
  border-radius: 18px;
  background: linear-gradient(180deg, #f9fbfe 0%, #f1f6fb 100%);
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

.anm-head-btn {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: #ffffff;
  color: #1f466f;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  box-shadow: 0 6px 14px rgba(30, 68, 107, 0.08);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;
}

.anm-head-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(30, 68, 107, 0.12);
}

.anm-head-btn:disabled {
  background: #f3f6fa;
  color: #8ba0b8;
  box-shadow: none;
  cursor: not-allowed;
}

.anm-head-btn-primary {
  border-color: #c8dbef;
  background: #ffffff;
}

.anm-head-btn-success {
  border-color: #cde7d4;
  background: #f4fbf6;
  color: #2d6a39;
}

.anm-head-btn-danger {
  border-color: #f0d0d0;
  background: #fff7f7;
  color: #9a3a3a;
}

.anm-head-btn-danger:hover:not(:disabled) {
  background: #faeeee;
}

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
  min-width: 900px;
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

.anm-cell-title strong {
  color: #18395f;
  font-size: 13px;
}

.anm-cell-muted {
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

.anm-danger-btn {
  color: #9a3a3a;
}

.anm-danger-btn:hover:not(:disabled) {
  background: #faeeee;
}
</style>
