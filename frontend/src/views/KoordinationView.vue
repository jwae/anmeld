<script setup lang="ts">
import { computed, ref, watch } from "vue";
import koordinationService from "../services/koordinationService";

type SchoolRow = {
  snr: string;
  name: string;
  short_name: string;
  kapazitaet: number;
  anmeldungen_gesamt: number;
  freie_plaetze: number;
  latitude: number | null;
  longitude: number | null;
};

type StudentRow = {
  row_id: number;
  schueler_id: string;
  vorname: string;
  nachname: string;
  empfehlung: string;
  anmeldestatus: string;
  abgleich_status: string;
  koordinierte_snr: string;
  koordinierte_schule: string;
  entfernung_km: number | null;
};

const props = defineProps<{
  token?: string;
  verfahrenId: number | null;
  rundeId: number | null;
  rundeStatus?: "geplant" | "aktiv" | "abgeschlossen" | null;
  context: {
    verfahren: string;
    runde: string;
  };
}>();

const loading = ref(false);
const assigning = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const schools = ref<SchoolRow[]>([]);
const students = ref<StudentRow[]>([]);
const selectedSchoolSnr = ref("");
const selectedStudentRowIds = ref<number[]>([]);
const distanceMode = ref("");

const selectedSchool = computed(
  () => schools.value.find((school) => school.snr === selectedSchoolSnr.value) || null,
);
const selectedStudentCount = computed(() => selectedStudentRowIds.value.length);
const allStudentsSelected = computed(
  () => students.value.length > 0 && students.value.every((student) => selectedStudentRowIds.value.includes(student.row_id)),
);
const isActiveRound = computed(() => props.rundeStatus === "aktiv");
const assignButtonLabel = computed(() => {
  if (assigning.value) return "Speichere...";
  if (selectedStudentCount.value === 1) return "1 Schueler zuordnen";
  return `${selectedStudentCount.value} Schueler zuordnen`;
});

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStatus(value: unknown) {
  return normalizeText(value) || "Ohne";
}

function formatDistance(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toFixed(1)} km`;
}

function schoolFreePlacesClass(value: number) {
  if (value < 0) return "value-danger";
  if (value === 0) return "value-warning";
  return "value-good";
}

function statusClass(value: string) {
  const normalized = normalizeStatus(value).toLowerCase();
  if (normalized === "ohne") return "status-chip status-chip-ohne";
  if (normalized === "zugeordnet") return "status-chip status-chip-zugeordnet";
  if (normalized === "warteliste") return "status-chip status-chip-warteliste";
  if (normalized === "abgelehnt" || normalized === "ablehnung") return "status-chip status-chip-abgelehnt";
  return "status-chip";
}

async function loadData(nextSelectedSnr = selectedSchoolSnr.value) {
  if (!props.verfahrenId || !props.rundeId) {
      schools.value = [];
      students.value = [];
      selectedSchoolSnr.value = "";
      selectedStudentRowIds.value = [];
      distanceMode.value = "";
      return;
  }

  try {
    loading.value = true;
    errorMessage.value = "";
    successMessage.value = "";

    const response = await koordinationService.getUebersicht(
      props.verfahrenId,
      props.rundeId,
      props.token,
      nextSelectedSnr || undefined,
    );

    schools.value = Array.isArray(response?.schools) ? response.schools : [];
    students.value = Array.isArray(response?.students) ? response.students : [];
    distanceMode.value = normalizeText(response?.distance_mode);
    selectedSchoolSnr.value = normalizeText(response?.selected_snr);

    selectedStudentRowIds.value = selectedStudentRowIds.value.filter((rowId) =>
      students.value.some((student) => student.row_id === rowId),
    );
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Die Koordinationsansicht konnte nicht geladen werden.";
    schools.value = [];
    students.value = [];
    distanceMode.value = "";
  } finally {
    loading.value = false;
  }
}

async function handleSchoolSelect(snr: string) {
  selectedSchoolSnr.value = snr;
  selectedStudentRowIds.value = [];
  await loadData(snr);
}

function isStudentSelected(rowId: number) {
  return selectedStudentRowIds.value.includes(rowId);
}

function toggleStudentSelection(rowId: number) {
  if (isStudentSelected(rowId)) {
    selectedStudentRowIds.value = selectedStudentRowIds.value.filter((value) => value !== rowId);
    return;
  }
  selectedStudentRowIds.value = [...selectedStudentRowIds.value, rowId];
}

function toggleSelectAllStudents() {
  if (allStudentsSelected.value) {
    selectedStudentRowIds.value = [];
    return;
  }
  selectedStudentRowIds.value = students.value.map((student) => student.row_id);
}

async function handleAssign() {
  if (!props.verfahrenId || !props.rundeId) return;
  if (!isActiveRound.value) return;
  if (!selectedSchool.value || !selectedStudentCount.value) return;

  try {
    assigning.value = true;
    errorMessage.value = "";
    successMessage.value = "";

    const response = await koordinationService.zuordnen(
      {
        verfahren_id: props.verfahrenId,
        runde_id: props.rundeId,
        row_ids: selectedStudentRowIds.value,
        schul_nr: selectedSchool.value.snr,
      },
      props.token,
    );

    successMessage.value = response?.message || "Die Zuordnung wurde gespeichert.";
    selectedStudentRowIds.value = [];
    await loadData(selectedSchool.value.snr);
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Die Zuordnung konnte nicht gespeichert werden.";
  } finally {
    assigning.value = false;
  }
}

watch(
  () => [props.verfahrenId, props.rundeId],
  () => {
    selectedSchoolSnr.value = "";
    selectedStudentRowIds.value = [];
    void loadData("");
  },
  { immediate: true },
);
</script>

<template>
  <section class="koordination-view">
    <div class="koordination-toolbar">
      <div>
        <p class="koordination-eyebrow">Koordination</p>
        <h2>Manuelle Verteilung auf freie Schulplaetze</h2>
        <p class="koordination-intro">
          Waehle links eine Schule aus. Rechts werden alle Schueler ohne Neuaufnahme nach Entfernung zur ausgewaehlten Schule sortiert angezeigt.
        </p>
      </div>
      <button class="btn-secondary" type="button" @click="loadData(selectedSchoolSnr)" :disabled="loading">
        {{ loading ? "Aktualisiere..." : "Aktualisieren" }}
      </button>
    </div>

    <div v-if="!verfahrenId || !rundeId" class="feedback-panel feedback-panel-warning">
      <p class="feedback-title">Kontext unvollstaendig</p>
      <p>Waehle zuerst ein Verfahren und eine Runde, damit die Koordination geladen werden kann.</p>
    </div>

    <div v-else-if="errorMessage" class="feedback-panel feedback-panel-error">
      <p class="feedback-title">Fehler</p>
      <p>{{ errorMessage }}</p>
    </div>

    <template v-else>
      <div v-if="successMessage" class="feedback-panel feedback-panel-success">
        <p class="feedback-title">Gespeichert</p>
        <p>{{ successMessage }}</p>
      </div>

      <section class="koordination-board">
        <article class="panel-card school-panel">
          <div class="section-head">
            <div>
              <p class="section-eyebrow">1</p>
              <h3>Schulen</h3>
            </div>
            <span class="section-meta">{{ schools.length }} Schulen</span>
          </div>

          <div class="table-wrap school-table-wrap">
            <table class="school-table">
              <thead>
                <tr>
                  <th>SNR</th>
                  <th>Name</th>
                  <th>Kapazitaet</th>
                  <th>Anmeldungen</th>
                  <th>Frei Plaetze</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading && !schools.length">
                  <td colspan="5" class="table-empty">Daten werden geladen...</td>
                </tr>
                <tr v-else-if="!schools.length">
                  <td colspan="5" class="table-empty">Keine aktiven Schulen fuer das aktuelle Verfahren gefunden.</td>
                </tr>
                <tr
                  v-for="school in schools"
                  :key="school.snr"
                  class="school-row"
                  :class="{ 'is-active': school.snr === selectedSchoolSnr }"
                  @click="handleSchoolSelect(school.snr)"
                >
                  <td>{{ school.snr }}</td>
                  <td :title="school.name">{{ school.short_name || school.name || "-" }}</td>
                  <td>{{ school.kapazitaet }}</td>
                  <td>{{ school.anmeldungen_gesamt }}</td>
                  <td>
                    <strong :class="schoolFreePlacesClass(school.freie_plaetze)">
                      {{ school.freie_plaetze }}
                    </strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <article class="panel-card student-panel">
          <div class="section-head">
            <div>
              <p class="section-eyebrow">2</p>
              <h3>Schueler</h3>
            </div>
            <span class="section-meta">
              {{ students.length }} Eintraege
              <template v-if="selectedSchool">
                | {{ selectedSchool.name }}
                <template v-if="distanceMode === 'ors'">| Entfernung per ORS</template>
                <template v-else-if="distanceMode === 'luftlinie'">| Entfernung per Luftlinie</template>
              </template>
            </span>
          </div>

          <div class="selection-bar">
            <div class="selection-summary">
              <strong>Schule:</strong><br/> {{ selectedSchool?.name || "Noch keine Schule ausgewaehlt" }}
            </div>
            <div class="selection-summary">
              <strong>Auswahl:</strong><br /> {{
                selectedStudentCount
                  ? `${selectedStudentCount} Schueler markiert`
                  : "Noch keine Schueler markiert"
              }}
            </div>
            <button
              class="btn-primary"
              type="button"
              :disabled="assigning || !isActiveRound || !selectedSchool || !selectedStudentCount"
              @click="handleAssign"
            >
              {{ assignButtonLabel }}
            </button>
          </div>

          <div class="table-wrap student-table-wrap">
            <table class="student-table">
              <thead>
                <tr>
                  <th>
                    <input
                      :checked="allStudentsSelected"
                      type="checkbox"
                      @change="toggleSelectAllStudents"
                    />
                  </th>
                  <th>Schueler-ID</th>
                  <th>Name</th>
                  <th>Empf.</th>
                  <th>Anmeldestatus</th>
                  <th>Abgleichstatus</th>
                  <th>Koordinierte Schule</th>
                  <th>Entfernung</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading && !students.length">
                  <td colspan="8" class="table-empty">Daten werden geladen...</td>
                </tr>
                <tr v-else-if="!students.length">
                  <td colspan="8" class="table-empty">Keine passenden Schueler fuer die Koordination gefunden.</td>
                </tr>
                <tr
                  v-for="student in students"
                  :key="student.row_id"
                  class="student-row"
                  :class="{ 'is-selected': isStudentSelected(student.row_id) }"
                  @click="toggleStudentSelection(student.row_id)"
                >
                  <td>
                    <input
                      :checked="isStudentSelected(student.row_id)"
                      type="checkbox"
                      @click.stop
                      @change="toggleStudentSelection(student.row_id)"
                    />
                  </td>
                  <td>{{ student.schueler_id || "-" }}</td>
                  <td>{{
                    [student.nachname, student.vorname].filter((value) => normalizeText(value)).join(", ") || "-"
                  }}</td>
                  <td>{{ student.empfehlung || "-" }}</td>
                  <td><span :class="statusClass(student.anmeldestatus)">{{ normalizeStatus(student.anmeldestatus) }}</span></td>
                  <td>{{ student.abgleich_status || "-" }}</td>
                  <td :title="student.koordinierte_schule || student.koordinierte_snr || '-'">{{
                    normalizeText(student.koordinierte_schule || student.koordinierte_snr).slice(0, 15) || "-"
                  }}</td>
                  <td>{{ selectedSchool ? formatDistance(student.entfernung_km) : "-" }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </template>
  </section>
</template>

<style scoped>
.koordination-view {
  display: grid;
  gap: 18px;
}

.koordination-toolbar,
.panel-card {
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background:
    radial-gradient(circle at top right, rgba(143, 187, 233, 0.16), transparent 34%),
    linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-shadow: 0 18px 42px rgba(19, 54, 102, 0.08);
}

.koordination-toolbar,
.panel-card {
  padding: 18px;
}

.koordination-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: end;
  flex-wrap: wrap;
}

.koordination-eyebrow,
.section-eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #6680a3;
}

.koordination-toolbar h2,
.section-head h3 {
  margin: 0;
  color: #17385f;
}

.koordination-intro {
  margin: 8px 0 0;
  color: #4a607e;
  max-width: 72ch;
  line-height: 1.55;
}

.koordination-board {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(320px, 0.95fr) minmax(0, 1.6fr);
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.section-meta {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6680a3;
}

.table-wrap {
  overflow: auto;
  border: 1px solid #e5edf6;
  border-radius: 16px;
  background: #fff;
}

.school-table-wrap,
.student-table-wrap {
  max-height: 680px;
}

.school-table,
.student-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.school-table {
  min-width: 520px;
}

.student-table {
  min-width: 980px;
}

.school-table th,
.school-table td,
.student-table th,
.student-table td {
  padding: 7px 10px;
  border-bottom: 1px solid #e5edf6;
  text-align: left;
  vertical-align: middle;
  line-height: 1.2;
}

.school-table th,
.student-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fbff;
  color: #5a7393;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.school-row,
.student-row {
  cursor: pointer;
  transition: background-color 0.18s ease, box-shadow 0.18s ease;
}

.school-row:hover,
.student-row:hover {
  background: #f8fbff;
}

.school-row.is-active {
  background: linear-gradient(180deg, #eff6ff 0%, #e6f0ff 100%);
  box-shadow: inset 3px 0 0 #2f6fce;
}

.student-row.is-selected {
  background: linear-gradient(180deg, #fff8e7 0%, #fff2cf 100%);
  box-shadow: inset 3px 0 0 #c27803;
}

.selection-bar {
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(180px, 1fr) minmax(220px, 1.2fr) auto auto;
  align-items: center;
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid #dbe4f0;
  border-radius: 16px;
  background: linear-gradient(180deg, #fcfdff 0%, #f4f8fd 100%);
}

.selection-summary {
  color: #385173;
  line-height: 1.4;
}

.btn-secondary,
.btn-primary {
  border-radius: 999px;
  padding: 10px 16px;
  font-weight: 700;
  border: 0;
}

.btn-secondary {
  background: #eef4fd;
  color: #17385f;
}

.btn-primary {
  background: #1f5fbf;
  color: #fff;
  box-shadow: 0 10px 24px rgba(31, 95, 191, 0.2);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

.value-good {
  color: #166534;
}

.value-warning {
  color: #9a5b00;
}

.value-danger {
  color: #b42318;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eff4fb;
  color: #3f5878;
}

.status-chip-ohne {
  background: #fdecec;
  color: #b42318;
}

.status-chip-zugeordnet {
  background: #e7f0ff;
  color: #1d4ed8;
}

.status-chip-warteliste {
  background: #fff4e5;
  color: #9a5b00;
}

.status-chip-abgelehnt {
  background: #f5eefc;
  color: #7c3aed;
}

.feedback-panel {
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 14px;
}

.feedback-panel-warning {
  border: 1px solid #d9d9c8;
  background: #fffdf3;
}

.feedback-panel-error {
  border: 1px solid #fca5a5;
  background: #fff5f5;
  color: #991b1b;
}

.feedback-panel-success {
  border: 1px solid #a7f3d0;
  background: #f0fdf4;
  color: #065f46;
}

.feedback-title,
.table-empty {
  font-weight: 700;
}

.table-empty {
  text-align: center;
  color: #6b7f99;
  padding: 24px 12px;
}

@media (max-width: 1180px) {
  .koordination-board {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .koordination-toolbar,
  .section-head {
    flex-direction: column;
    align-items: start;
  }

  .selection-bar {
    grid-template-columns: 1fr;
  }
}
</style>
