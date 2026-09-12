<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import apiClient from "../services/apiClient";

interface ProtocolRow {
  id: number;
  zeitpunkt: string;
  ergebnis: "ERFOLG" | "FEHLER";
  ereignis_code: string;
  ereignis_bezeichnung: string;
  benutzer_id: number | null;
  benutzername: string | null;
  user_fullname: string | null;
  verfahren_id: number | null;
  verfahren_bezeichnung: string | null;
  runde_id: number | null;
  runde_bezeichnung: string | null;
  objekt_typ: string | null;
  objekt_id: string | null;
  aenderungen: any;
  details: any;
  ip_adresse: string | null;
  korrelation_id: string | null;
}

const props = withDefaults(defineProps<{
  managementToken?: string;
  isManagementSessionActive?: boolean;
  canDeleteProtocol?: boolean;
}>(), {
  managementToken: "",
  isManagementSessionActive: false,
  canDeleteProtocol: false,
});

const rows = ref<ProtocolRow[]>([]);
const total = ref(0);
const limit = ref(200);
const loading = ref(false);
const errorMessage = ref("");
const searchText = ref("");
const eventFilter = ref("");
const resultFilter = ref("");
const deleteBeforeDate = ref("");
const deleting = ref(false);
const deleteConfirmOpen = ref(false);
const deleteConfirmResult = ref("");
let latestProtocolRequest = 0;

const reasonLabels: Record<string, string> = {
  UNVOLLSTAENDIGE_ZUGANGSDATEN: "Unvollständige Zugangsdaten",
  UNGUELTIGE_ZUGANGSDATEN: "Ungültige Zugangsdaten",
  KEINE_AKTIVEN_BERECHTIGUNGEN: "Keine aktiven Berechtigungen",
  KEINE_VERWALTUNGSBERECHTIGUNG: "Keine Verwaltungsberechtigung",
  TECHNISCHER_FEHLER: "Technischer Fehler",
};

function headers() {
  return props.managementToken
    ? { Authorization: `Bearer ${props.managementToken}` }
    : {};
}

function formatDateTime(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]} ${match[4]}:${match[5]}:${match[6]}` : String(value || "–");
}

function displayIp(value: string | null) {
  const address = String(value || "").trim();
  return address === "::1" ? "localhost" : address;
}

function humanize(value: string) {
  return String(value || "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function displayValue(value: any): string {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function detailLines(row: ProtocolRow) {
  const details = row.details;
  if (!details) return [];
  if (typeof details !== "object") return [String(details)];
  return Object.entries(details).map(([key, value]) => {
    const displayed = key === "grund" ? (reasonLabels[String(value)] || humanize(String(value))) : displayValue(value);
    return `${humanize(key)}: ${displayed}`;
  });
}

function changeLines(row: ProtocolRow) {
  const changes = row.aenderungen;
  if (!changes) return [];
  if (typeof changes !== "object") return [String(changes)];
  return Object.entries(changes).map(([field, change]: [string, any]) => {
    if (change && typeof change === "object" && ("vorher" in change || "nachher" in change)) {
      return `${humanize(field)}: ${displayValue(change.vorher)} → ${displayValue(change.nachher)}`;
    }
    return `${humanize(field)}: ${displayValue(change)}`;
  });
}

function referenceLines(row: ProtocolRow) {
  const references: string[] = [];
  if (row.verfahren_id) {
    references.push(`Verfahren: ${row.verfahren_bezeichnung || `#${row.verfahren_id}`}`);
  }
  if (row.runde_id) references.push(`Runde: ${row.runde_bezeichnung || `#${row.runde_id}`}`);
  if (row.objekt_typ || row.objekt_id) {
    references.push(`${humanize(row.objekt_typ || "Objekt")}: ${row.objekt_id || "–"}`);
  }
  return references;
}

const eventOptions = computed(() => [...new Map(
  rows.value.map((row) => [row.ereignis_code, row.ereignis_bezeichnung || humanize(row.ereignis_code)]),
).entries()].sort((left, right) => left[1].localeCompare(right[1], "de")));

const filteredRows = computed(() => {
  const needle = searchText.value.trim().toLocaleLowerCase("de");
  return rows.value.filter((row) => {
    if (eventFilter.value && row.ereignis_code !== eventFilter.value) return false;
    if (resultFilter.value && row.ergebnis !== resultFilter.value) return false;
    if (!needle) return true;
    const haystack = [
      row.ereignis_code,
      row.ereignis_bezeichnung,
      row.benutzername,
      row.user_fullname,
      row.verfahren_bezeichnung,
      row.runde_bezeichnung,
      ...detailLines(row),
      ...changeLines(row),
    ].join(" ").toLocaleLowerCase("de");
    return haystack.includes(needle);
  });
});

async function loadProtocol() {
  if (!props.isManagementSessionActive || !props.managementToken) return;
  const requestId = ++latestProtocolRequest;
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await apiClient.get(`/api/auth/admin/protokoll?limit=${limit.value}&_=${Date.now()}`, {
      headers: { ...headers(), "Cache-Control": "no-cache" },
    });
    // Eine aeltere Antwort darf keinen neueren Tabellenstand (z. B. nach
    // einer Loeschung) wieder mit ihren zwischengespeicherten Daten ersetzen.
    if (requestId !== latestProtocolRequest) return;
    rows.value = Array.isArray(response.data?.rows) ? response.data.rows : [];
    total.value = Number(response.data?.total || 0);
  } catch (error: any) {
    if (requestId !== latestProtocolRequest) return;
    errorMessage.value = error?.response?.data?.error || error?.message || "Das App-Protokoll konnte nicht geladen werden.";
  } finally {
    if (requestId === latestProtocolRequest) loading.value = false;
  }
}

async function deleteProtocolBeforeDate() {
  if (!deleteBeforeDate.value || deleting.value) return;
  deleteConfirmResult.value = "";
  deleteConfirmOpen.value = true;
}

function cancelDeleteProtocol() {
  if (deleting.value) return;
  deleteConfirmOpen.value = false;
  deleteConfirmResult.value = "";
}

async function confirmDeleteProtocol() {
  if (!deleteBeforeDate.value || deleting.value) return;
  const formattedDate = new Date(`${deleteBeforeDate.value}T00:00:00`).toLocaleDateString("de-DE");
  deleting.value = true;
  errorMessage.value = "";
  try {
    const response = await apiClient.delete("/api/auth/admin/protokoll/before", {
      headers: headers(), data: { before_date: deleteBeforeDate.value },
    });
    const deleted = Number(response.data?.deleted || 0);
    const cutoff = `${deleteBeforeDate.value} 00:00:00`;
    // Die Tabelle reagiert unmittelbar; der anschliessende Abruf gleicht sie
    // mit dem Server ab und erfasst auch Eintraege ausserhalb des aktuellen Limits.
    rows.value = rows.value.filter((row) => String(row.zeitpunkt || "") >= cutoff);
    total.value = Math.max(0, total.value - deleted);
    await loadProtocol();
    deleteConfirmResult.value = `${deleted} Protokolleinträge wurden gelöscht.`;
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Die Protokolleintraege konnten nicht geloescht werden.";
  } finally {
    deleting.value = false;
  }
}

watch(() => props.managementToken, (token, oldToken) => {
  if (token && token !== oldToken) void loadProtocol();
});

onMounted(() => void loadProtocol());
</script>

<template>
  <section class="app-protocol">
    <header class="app-protocol-toolbar">
      <div>
        <h3>App-Protokoll</h3>
        <p>Neueste {{ rows.length }} von insgesamt {{ total }} Einträgen.</p>
      </div>
      <button class="app-protocol-refresh" type="button" :disabled="loading" @click="loadProtocol">
        <i class="bi bi-arrow-clockwise" :class="{ 'is-spinning': loading }" aria-hidden="true"></i>
        <span>{{ loading ? "Lade..." : "Aktualisieren" }}</span>
      </button>
      <div v-if="canDeleteProtocol" class="app-protocol-delete">
        <label>
          <span>Eintraege vor</span>
          <input v-model="deleteBeforeDate" type="date" :disabled="deleting" />
        </label>
        <button type="button" :disabled="!deleteBeforeDate || deleting" @click="deleteProtocolBeforeDate">
          <i class="bi bi-trash3" aria-hidden="true"></i>
          {{ deleting ? "Loesche..." : "Protokoll loeschen" }}
        </button>
      </div>
    </header>

    <div class="app-protocol-filters">
      <label>
        <span>Suche</span>
        <input v-model="searchText" type="search" placeholder="Ereignis, Benutzer oder Inhalt" />
      </label>
      <label>
        <span>Ereignis</span>
        <select v-model="eventFilter">
          <option value="">Alle Ereignisse</option>
          <option v-for="option in eventOptions" :key="option[0]" :value="option[0]">{{ option[1] }}</option>
        </select>
      </label>
      <label>
        <span>Ergebnis</span>
        <select v-model="resultFilter">
          <option value="">Alle Ergebnisse</option>
          <option value="ERFOLG">Erfolg</option>
          <option value="FEHLER">Fehler</option>
        </select>
      </label>
    </div>

    <Teleport to="body">
      <div v-if="deleteConfirmOpen" class="app-protocol-confirm-backdrop" @click.self="cancelDeleteProtocol">
        <section class="app-protocol-confirm" role="dialog" aria-modal="true" aria-labelledby="app-protocol-confirm-title">
          <button class="app-protocol-confirm-x" type="button" aria-label="Overlay schließen" :disabled="deleting" @click="cancelDeleteProtocol">×</button>
          <div class="app-protocol-confirm-icon"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i></div>
          <div>
            <h4 id="app-protocol-confirm-title">Protokolleinträge löschen?</h4>
            <p>Alle Einträge vor dem <strong>{{ new Date(`${deleteBeforeDate}T00:00:00`).toLocaleDateString("de-DE") }}</strong> werden unwiderruflich gelöscht.</p>
            <div v-if="deleteConfirmResult" class="app-protocol-confirm-result">
              <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
              <span>{{ deleteConfirmResult }}</span>
            </div>
          </div>
          <footer>
            <template v-if="!deleteConfirmResult">
              <button type="button" class="app-protocol-confirm-delete" :disabled="deleting" @click="confirmDeleteProtocol">
                <i class="bi bi-trash3" aria-hidden="true"></i>
                {{ deleting ? "Lösche..." : "Endgültig löschen" }}
              </button>
            </template>
            <button v-else type="button" class="app-protocol-confirm-close" @click="cancelDeleteProtocol">Schließen</button>
          </footer>
        </section>
      </div>
    </Teleport>

    <div v-if="errorMessage" class="app-protocol-message is-error">{{ errorMessage }}</div>
    <div v-if="loading" class="app-protocol-message">Protokoll wird geladen...</div>

    <div v-else class="app-protocol-table-wrap">
      <table class="app-protocol-table">
        <thead>
          <tr>
            <th>Zeitpunkt</th>
            <th>Ereignis</th>
            <th>Ergebnis</th>
            <th>Benutzer</th>
            <th>IP-Adresse</th>
            <th>Bezug</th>
            <th>Inhalt</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filteredRows" :key="row.id">
            <td class="is-nowrap">{{ formatDateTime(row.zeitpunkt) }}</td>
            <td>
              <strong>{{ row.ereignis_bezeichnung || humanize(row.ereignis_code) }}</strong>
              <small>{{ row.ereignis_code }}</small>
            </td>
            <td>
              <span class="app-protocol-result" :class="row.ergebnis === 'ERFOLG' ? 'is-success' : 'is-failure'">
                {{ row.ergebnis === "ERFOLG" ? "Erfolg" : "Fehler" }}
              </span>
            </td>
            <td>
              <strong>{{ row.user_fullname || row.benutzername || "Unbekannt" }}</strong>
              <small v-if="row.user_fullname && row.benutzername">{{ row.benutzername }}</small>
            </td>
            <td class="is-nowrap">{{ row.ip_adresse ? displayIp(row.ip_adresse) : "–" }}</td>
            <td>
              <template v-if="referenceLines(row).length">
                <span v-for="line in referenceLines(row)" :key="line">{{ line }}</span>
              </template>
              <span v-else>–</span>
            </td>
            <td>
              <span v-for="line in changeLines(row)" :key="`change-${line}`" class="is-change">{{ line }}</span>
              <span v-for="line in detailLines(row)" :key="`detail-${line}`">{{ line }}</span>
              <span v-if="!changeLines(row).length && !detailLines(row).length">–</span>
            </td>
          </tr>
          <tr v-if="!filteredRows.length">
            <td colspan="7" class="app-protocol-empty">Keine passenden Protokolleinträge gefunden.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped src="./AppProtocol.css"></style>
