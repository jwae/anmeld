<script setup lang="ts">
const props = defineProps<{
  rows: any[];
  loading: boolean;
  verfahrenId: number | null;
}>();

const emit = defineEmits<{
  (e: "add", row: any): void;
  (e: "edit", row: any): void;
  (e: "delete", id: number): void;
  (e: "refresh"): void;
  (e: "import"): void;
}>();

function formatNumber(value: any) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return Number(value);
}

function formatAvailableSeats(row: any) {
  const total = Number(row.gesamtkapazitaet || 0);
  const reserved = Number(row.reservierte_plaetze || 0);
  return total - reserved;
}
</script>

<template>
  <section class="anm-card kapazitaeten-list-card">
    <div class="anm-card-head-row">
      <p class="anm-roadmap-eyebrow">Uebersicht</p>
      <div class="kapazitaeten-list-actions">
        <button type="button" class="btn-secondary" @click="emit('refresh')">Aktualisieren</button>
        <button type="button" class="btn-primary" :disabled="!verfahrenId" @click="emit('import')">Kapazitaeten importieren</button>
      </div>
    </div>
    <div class="anm-card-head">
      <div>
        <h3>Schulkapazitaeten</h3>
      </div>

    </div>

    <div v-if="loading" class="anm-loading-state">Lade Daten...</div>

    <div v-else class="anm-table-wrap">
      <table class="anm-table kapazitaeten-table">
        <thead>
          <tr>
            <th>SNR</th>
            <th>Schulname</th>
            <th>Schulform</th>
            <th>Status</th>
            <th>Jahrgang</th>
            <th>Max. Klassen</th>
            <th>Schueler/Klasse</th>
            <th>Gesamtkapazitaet</th>
            <th>Reserviert</th>
            <th>Verfuegbar</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="rows.length === 0">
            <td colspan="11" class="anm-empty-cell">Keine Eintraege gefunden.</td>
          </tr>
          <tr
            v-for="row in rows"
            :key="row.id || `missing-${row.snr}`"
            :class="{ 'row-missing': !row.hasCapacity }"
          >
            <td>{{ row.snr }}</td>
            <td>{{ row.schulname || row.name }}</td>
            <td>{{ row.schulform_name || "-" }}</td>
            <td>
              <span class="status-chip" :class="row.is_active === false ? 'status-inactive' : 'status-active'">
                {{ row.is_active === false ? "Inaktiv" : "Aktiv" }}
              </span>
            </td>
            <td>{{ row.hasCapacity ? row.jahrgang : "-" }}</td>
            <td>{{ row.hasCapacity ? formatNumber(row.maximale_klassen) : "-" }}</td>
            <td>{{ row.hasCapacity ? formatNumber(row.maximale_schueler_pro_klasse) : "-" }}</td>
            <td>{{ row.hasCapacity ? formatNumber(row.gesamtkapazitaet) : "-" }}</td>
            <td>{{ row.hasCapacity ? formatNumber(row.reservierte_plaetze) : "-" }}</td>
            <td>{{ row.hasCapacity ? formatAvailableSeats(row) : "-" }}</td>
            <td>
              <div class="anm-actions anm-actions-icons">
                <button
                  v-if="row.hasCapacity"
                  type="button"
                  class="btn-secondary"
                  aria-label="Kapazitaet bearbeiten"
                  title="Bearbeiten"
                  @click="emit('edit', row)"
                >
                  <i class="bi bi-pencil-square" aria-hidden="true"></i>
                </button>
                <button
                  v-if="row.hasCapacity"
                  type="button"
                  class="btn-secondary"
                  aria-label="Kapazitaet loeschen"
                  title="Loeschen"
                  @click="emit('delete', Number(row.id))"
                >
                  <i class="bi bi-trash" aria-hidden="true"></i>
                </button>
                <button
                  v-else
                  type="button"
                  class="btn-secondary"
                  aria-label="Kapazitaet anlegen"
                  title="Kapazitaet anlegen"
                  @click="emit('add', row)"
                >
                  <i class="bi bi-pencil-square" aria-hidden="true"></i>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.kapazitaeten-list-card {
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background:
    radial-gradient(circle at top right, rgba(143, 187, 233, 0.2), transparent 34%),
    linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-shadow: 0 18px 42px rgba(19, 54, 102, 0.08);
  display: grid;
  gap: 16px;
  padding: 18px;
}

.anm-card-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.anm-roadmap-eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: 700;
  color: #6680a3;
}

.kapazitaeten-list-card h3 {
  margin: 0;
  color: #19365b;
}

.kapazitaeten-list-description {
  margin: 0;
  color: #4a607e;
  line-height: 1.55;
}

.anm-table-wrap {
  overflow-x: auto;
}

.anm-loading-state,
.anm-empty-cell {
  padding: 16px;
  border: 1px dashed #ccd9ea;
  border-radius: 16px;
  background: #f8fbff;
  color: #5d7390;
}

.anm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  min-width: 980px;
}

.anm-table th,
.anm-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e5edf6;
  text-align: left;
  vertical-align: middle;
}

.anm-table th {
  color: #5a7393;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.anm-table tbody tr {
  transition: background-color 0.18s ease;
}

.anm-table tbody tr:hover {
  background: #f7fbff;
}

.row-missing {
  background: #eef6ff;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
}

.status-active {
  background: #e7f7ed;
  color: #16653a;
}

.status-inactive {
  background: #fbeaea;
  color: #8b1f1f;
}

.anm-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.anm-actions-icons {
  flex-wrap: nowrap;
}

.btn-primary,
.btn-secondary,
.btn-danger {
  border-radius: 999px;
  padding: 8px 12px;
  font-weight: 700;
  border: 0;
}

.btn-primary {
  background: linear-gradient(180deg, #1f72d8 0%, #1459a8 100%);
  color: #ffffff;
}

.btn-secondary {
  background: #eef4fd;
  color: #17385f;
}

.btn-danger {
  background: #fdecec;
  color: #962424;
}

.anm-actions-icons .btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 8px 10px;
}

.anm-card-head-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

@media (max-width: 900px) {
  .anm-card-head-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .anm-card-head {
    flex-direction: column;
  }
}

.kapazitaeten-list-actions {
  display: flex;
  gap: 10px;
}

.kapazitaeten-list-actions .btn-primary,
.kapazitaeten-list-actions .btn-secondary {
  padding: 10px 16px;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
