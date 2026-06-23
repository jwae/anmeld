<script setup lang="ts">
type ValidationRow = {
  row_number: number;
  selected: boolean;
  import_action: string;
  status: "gueltig" | "warnung" | "fehler" | "uebersprungen";
  errors: string[];
  warnings: string[];
  changed_fields?: string[];
  data: Record<string, string | null>;
};

defineProps<{
  rows: ValidationRow[];
  busy: boolean;
}>();

defineEmits<{
  (event: "toggle-all"): void;
  (event: "toggle-row", rowNumber: number, selected: boolean): void;
}>();

function statusLabel(status: ValidationRow["status"]) {
  if (status === "gueltig") return "Gueltig";
  if (status === "warnung") return "Warnung";
  if (status === "fehler") return "Fehler";
  return "Wird uebersprungen";
}

function importActionLabel(action: string) {
  if (action === "NEU") return "Neu";
  if (action === "UPDATE") return "Update";
  if (action === "VORHANDEN") return "Vorhanden";
  return action;
}

function formatGermanDate(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-");
    return `${day}.${month}.${year}`;
  }
  return text;
}

function statusChipClass(row: ValidationRow) {
  if (row.status === "fehler") return "status-chip-fehler";
  if (row.import_action === "NEU") return "status-chip-neu";
  if (row.import_action === "UPDATE") return "status-chip-update";
  if (row.import_action === "VORHANDEN") return "status-chip-vorhanden";
  if (row.status === "warnung") return "status-chip-warnung";
  return "status-chip-gueltig";
}

function isChanged(row: ValidationRow, field: string) {
  return row.import_action === "UPDATE" && Array.isArray(row.changed_fields) && row.changed_fields.includes(field);
}
</script>

<template>
  <section class="wizard-step">
    <div class="validation-toolbar">
      <button class="validation-toggle-button" type="button" :disabled="busy" @click="$emit('toggle-all')">
        Auswahl umschalten
      </button>
    </div>

    <div class="table-wrap">
      <table class="wizard-table">
        <thead>
          <tr>
            <th>Import</th>
            <th>Zeile</th>
            <th>Schulnummer</th>
            <th>ID</th>
            <th>Vorname</th>
            <th>Nachname</th>
            <th>Geburtsdatum</th>
            <th>Status</th>
            <th>Hinweise</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="`validation-${row.row_number}`" :class="`status-${row.status}`">
            <td>
              <input
                :checked="row.selected"
                type="checkbox"
                :disabled="busy || row.status === 'fehler'"
                @change="$emit('toggle-row', row.row_number, ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td>{{ row.row_number }}</td>
            <td :class="{ 'cell-changed': isChanged(row, 'source_school_snr') }">{{ row.data?.source_school_snr || "-" }}</td>
            <td :class="{ 'cell-changed': isChanged(row, 'schueler_id') }">{{ row.data?.schueler_id || "-" }}</td>
            <td :class="{ 'cell-changed': isChanged(row, 'vorname') }">{{ row.data?.vorname || "-" }}</td>
            <td :class="{ 'cell-changed': isChanged(row, 'nachname') }">{{ row.data?.nachname || "-" }}</td>
            <td :class="{ 'cell-changed': isChanged(row, 'geburtsdatum') }">{{ formatGermanDate(row.data?.geburtsdatum) }}</td>
            <td>
              <span class="status-chip" :class="statusChipClass(row)">
                <template v-if="row.status === 'fehler'">{{ statusLabel(row.status) }}</template>
                <template v-else>{{ importActionLabel(row.import_action) || statusLabel(row.status) }}</template>
              </span>
            </td>
            <td>
              <span v-if="row.errors.length">{{ row.errors.join(", ") }}</span>
              <span v-else-if="row.warnings.length">{{ row.warnings.join(", ") }}</span>
              <span v-else>-</span>
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
  gap: 14px;
}

.validation-toolbar {
  display: flex;
  justify-content: flex-end;
}

.validation-toggle-button {
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid #cdd8e6;
  border-radius: 999px;
  background: linear-gradient(180deg, #ffffff 0%, #f4f8fc 100%);
  color: #355172;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.validation-toggle-button:hover:not(:disabled) {
  border-color: #9bb3cf;
  background: linear-gradient(180deg, #fdfefe 0%, #edf4fb 100%);
}

.validation-toggle-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.status-chip {
  display: inline-flex;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.status-chip-gueltig {
  background: #dcfce7;
  color: #166534;
}

.status-chip-neu {
  background: #dcfce7;
  color: #166534;
}

.status-chip-update {
  background: #fef3c7;
  color: #92400e;
}

.status-chip-vorhanden {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-chip-warnung {
  background: #fef3c7;
  color: #92400e;
}

.status-chip-fehler {
  background: #fee2e2;
  color: #991b1b;
}

.status-chip-uebersprungen {
  background: #e5e7eb;
  color: #4b5563;
}

.status-fehler {
  background: #fff7f7;
}

.cell-changed {
  background: #fef3c7;
}
</style>
