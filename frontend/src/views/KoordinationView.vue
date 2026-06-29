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
  foerderbedarf: string;
  zieldifferent: string;
  anmeldestatus: string;
  abgleich_status: string;
  geocoding_status: string;
  geocoding_fehler: string;
  koordinierte_snr: string;
  koordinierte_schule: string;
  latitude: number | null;
  longitude: number | null;
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
const autoGeocoding = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const autoGeocodingMessage = ref("");
const schools = ref<SchoolRow[]>([]);
const students = ref<StudentRow[]>([]);
const selectedSchoolSnr = ref("");
const selectedStudentRowIds = ref<number[]>([]);
const distanceMode = ref("");
const geocodeInfoOverlayOpen = ref(false);
const attemptedVisibleGeocodingRowIds = new Set<number>();
let loadSequence = 0;

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

function isPositiveFlag(value: unknown) {
  return normalizeText(value) === "1";
}

function formatDistance(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toFixed(1)} km`;
}

function displayDistance(student: StudentRow, hasSelectedSchool: boolean) {
  if (!hasSelectedSchool) return "-";
  if (normalizeText(student.geocoding_fehler)) return "Adresse fehlerhaft";
  if (student.entfernung_km === null || student.entfernung_km === undefined || Number.isNaN(Number(student.entfernung_km))) {
    return "Adresse fehlerhaft";
  }
  return formatDistance(student.entfernung_km);
}

function distanceTitle(student: StudentRow, hasSelectedSchool: boolean) {
  if (!hasSelectedSchool) return "";
  if (student.entfernung_km === null || student.entfernung_km === undefined || Number.isNaN(Number(student.entfernung_km))) {
    return normalizeText(student.geocoding_fehler) || "Adresse fehlerhaft";
  }
  return "";
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

function openGeocodeInfoOverlay() {
  geocodeInfoOverlayOpen.value = true;
}

function closeGeocodeInfoOverlay() {
  geocodeInfoOverlayOpen.value = false;
}

function getVisibleStudentsMissingCoordinates() {
  return students.value
    .filter((student) =>
      student.row_id > 0
      && (student.latitude === null || student.longitude === null)
      && !attemptedVisibleGeocodingRowIds.has(student.row_id),
    )
    .map((student) => student.row_id);
}

async function geocodeVisibleStudentsInBackground(loadToken: number) {
  if (autoGeocoding.value) return;
  if (!props.verfahrenId || !props.rundeId) return;

  const rowIds = getVisibleStudentsMissingCoordinates();
  if (!rowIds.length) {
    autoGeocodingMessage.value = "";
    return;
  }

  rowIds.forEach((rowId) => attemptedVisibleGeocodingRowIds.add(rowId));
  autoGeocoding.value = true;
  autoGeocodingMessage.value = "Fehlende Koordinaten der aktuell sichtbaren Schueler werden im Hintergrund ergaenzt.";

  try {
    await koordinationService.geocodeVisibleStudents(
      {
        verfahren_id: props.verfahrenId,
        runde_id: props.rundeId,
        row_ids: rowIds,
      },
      props.token,
    );

    if (loadToken !== loadSequence) return;
    autoGeocodingMessage.value = "";
    autoGeocoding.value = false;
    await loadData(selectedSchoolSnr.value);
  } catch (_error: any) {
    if (loadToken !== loadSequence) return;
    autoGeocodingMessage.value = "Die automatischen Geocodes konnten nicht vollstaendig aktualisiert werden.";
  } finally {
    autoGeocoding.value = false;
  }
}

async function loadData(nextSelectedSnr = selectedSchoolSnr.value) {
  const loadToken = ++loadSequence;
  if (!props.verfahrenId || !props.rundeId) {
      schools.value = [];
      students.value = [];
      selectedSchoolSnr.value = "";
      selectedStudentRowIds.value = [];
      distanceMode.value = "";
      autoGeocodingMessage.value = "";
      return;
  }

  let loadedSuccessfully = false;
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
    loadedSuccessfully = true;
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Die Koordinationsansicht konnte nicht geladen werden.";
    schools.value = [];
    students.value = [];
    distanceMode.value = "";
  } finally {
    if (loadToken === loadSequence) {
      loading.value = false;
    }
  }

  if (loadedSuccessfully && loadToken === loadSequence) {
    void geocodeVisibleStudentsInBackground(loadToken);
  }
}

async function handleSchoolSelect(snr: string) {
  selectedSchoolSnr.value = snr;
  selectedStudentRowIds.value = [];
  await loadData(snr);
}

async function refreshData() {
  attemptedVisibleGeocodingRowIds.clear();
  autoGeocodingMessage.value = "";
  await loadData(selectedSchoolSnr.value);
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
    attemptedVisibleGeocodingRowIds.clear();
    autoGeocodingMessage.value = "";
    selectedSchoolSnr.value = "";
    selectedStudentRowIds.value = [];
    void loadData("");
  },
  { immediate: true },
);
</script>

<template>
  <section class="koordination-view">
    <div v-if="loading && verfahrenId && rundeId" class="loading-overlay" role="status" aria-live="polite">
      <div class="loading-overlay-card">
        <p class="loading-overlay-title">Koordination wird geladen</p>
        <p>Schulen und Schuelerdaten werden geladen.</p>
      </div>
    </div>

    <div class="koordination-toolbar">
      <div>
        <p class="koordination-eyebrow">Koordination</p>
        <h2>Manuelle Verteilung auf freie Schulplaetze</h2>
        <p class="koordination-intro">
          Waehle eine Schule aus. Die Schueler werden nach Entfernung zur ausgewaehlten Schule sortiert angezeigt.
        </p>
      </div>
      <div class="toolbar-actions">
        <button class="btn-secondary" type="button" @click="openGeocodeInfoOverlay">
          ? Info Geocodes
        </button>
        <button class="btn-secondary" type="button" @click="refreshData" :disabled="loading || autoGeocoding">
          {{ loading ? "Aktualisiere..." : autoGeocoding ? "Geocodiere..." : "Aktualisieren" }}
        </button>
      </div>
    </div>

    <div v-if="autoGeocodingMessage" class="feedback-panel feedback-panel-warning">
      <p class="feedback-title">Geocodes im Hintergrund</p>
      <p>{{ autoGeocodingMessage }}</p>
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
              <h4>Schulen aus dem Verfahren mit freien Kapazitaeten</h4>
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
              <h4>Schueler ohne Anmeldung oder Aufnahme</h4>
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
                  <th>ID</th>
                  <th>Name</th>
                  <th>Empf.</th>
                  <th>LE</th>
                  <th>ZD</th>
                  <th>Anmeldestatus</th>
                  <th>Abgleichstatus</th>
                  <th>Koordinierte Schule</th>
                  <th>Entfernung</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading && !students.length">
                  <td colspan="10" class="table-empty">Daten werden geladen...</td>
                </tr>
                <tr v-else-if="!students.length">
                  <td colspan="10" class="table-empty">Keine passenden Schueler fuer die Koordination gefunden.</td>
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
                  <td>
                    <span v-if="isPositiveFlag(student.foerderbedarf)" class="status-badge status-badge-le">ja</span>
                  </td>
                  <td>
                    <span v-if="isPositiveFlag(student.zieldifferent)" class="status-badge status-badge-zd">ja</span>
                  </td>
                  <td><span :class="statusClass(student.anmeldestatus)">{{ normalizeStatus(student.anmeldestatus) }}</span></td>
                  <td>{{ student.abgleich_status || "-" }}</td>
                  <td :title="student.koordinierte_schule || student.koordinierte_snr || '-'">{{
                    normalizeText(student.koordinierte_schule || student.koordinierte_snr).slice(0, 25) || "-"
                  }}</td>
                  <td :title="distanceTitle(student, !!selectedSchool)">{{ displayDistance(student, !!selectedSchool) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </template>

    <div
      v-if="geocodeInfoOverlayOpen"
      class="koordination-modal-overlay"
      @click.self="closeGeocodeInfoOverlay"
    >
      <section class="koordination-modal" role="dialog" aria-modal="true" aria-label="Info zur Geocodes-Berechnung">
        <div class="section-head">
          <div>
            <p class="section-eyebrow">Info</p>
            <h4>Info zur Geocodes-Berechnung</h4>
          </div>
          <button class="btn-secondary" type="button" @click="closeGeocodeInfoOverlay">
            Schliessen
          </button>
        </div>
        <div class="koordination-info-grid">
          <section class="koordination-info-card">
            <h5>Berechnung</h5>
            <p>Fehlende Adressen werden ueber <code>strasse</code>, <code>plz</code> und <code>ort</code> geocodiert.</p>
            <p>Aus dem Treffer werden <code>Latitude</code> und <code>Longitude</code> fuer die Distanzberechnung zur gewaehlten Schule gespeichert.</p>
            <p>Wenn eine Adresse unvollstaendig ist oder kein Treffer gefunden wird, bleibt die Entfernung fuer diesen Datensatz leer.</p>
          </section>
          <section class="koordination-info-card">
            <h5>Dienst</h5>
            <p>Die Anwendung nutzt das Geocoding von OpenRouteService.</p>
            <p>
              <a href="https://openrouteservice.org/dev/#/api-docs/geocode/search/get" target="_blank" rel="noopener noreferrer">
                OpenRouteService Geocoding
              </a>
            </p>
          </section>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.koordination-view {
  position: relative;
  display: grid;
  gap: 18px;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: start;
  justify-content: center;
  padding-top: 72px;
  background: rgba(248, 251, 255, 0.82);
  backdrop-filter: blur(2px);
  border-radius: 24px;
}

.loading-overlay-card {
  max-width: 360px;
  padding: 14px 18px;
  border: 1px solid #cfe0f5;
  border-radius: 18px;
  background: linear-gradient(180deg, #ffffff 0%, #f4f8fd 100%);
  box-shadow: 0 18px 42px rgba(19, 54, 102, 0.12);
  color: #17385f;
  text-align: center;
}

.loading-overlay-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 800;
  color: #17385f;
}

.loading-overlay-card p:last-child {
  margin: 0;
  line-height: 1.45;
  color: #4a607e;
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

.toolbar-actions {
  display: flex;
  gap: 10px;
  align-items: center;
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
  grid-template-columns: minmax(0, 1fr);
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

.student-table-wrap {
  max-height: 320px;
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

.student-table th,
.student-table td {
  padding: 4px 8px;
  line-height: 1.1;
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

.student-table .status-chip {
  min-height: 20px;
  padding: 2px 7px;
  font-size: 11px;
  line-height: 1;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 18px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.status-badge-le {
  background: #e9f6ec;
  color: #21653a;
}

.status-badge-zd {
  background: #e7f0ff;
  color: #1d4ed8;
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

.koordination-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(22, 34, 52, 0.45);
  backdrop-filter: blur(2px);
}

.koordination-modal {
  width: min(760px, 100%);
  padding: 22px;
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background: linear-gradient(180deg, #ffffff 0%, #f4f8fe 100%);
  box-shadow: 0 28px 70px rgba(18, 45, 88, 0.24);
}

.koordination-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.koordination-info-card {
  padding: 16px;
  border: 1px solid #dbe4f0;
  border-radius: 16px;
  background: #fff;
}

.koordination-info-card h5 {
  margin: 0 0 8px;
  color: #17385f;
  font-size: 15px;
}

.koordination-info-card p {
  margin: 0 0 8px;
  color: #4a607e;
  line-height: 1.5;
}

.koordination-info-card p:last-child {
  margin-bottom: 0;
}

.koordination-info-card a {
  color: #1459a8;
  font-weight: 700;
  text-decoration: none;
}

.koordination-info-card a:hover {
  text-decoration: underline;
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

  .toolbar-actions,
  .koordination-info-grid {
    width: 100%;
    grid-template-columns: 1fr;
  }
}
</style>
