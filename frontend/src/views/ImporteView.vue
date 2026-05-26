<script setup lang="ts">
import { ref } from "vue";
import importService from "../services/importService";
import KapazitaetenView from "./KapazitaetenView.vue";
import PoolImport from "../components/PoolImport.vue";
import AnmeldungImport from "../components/AnmeldungImport.vue";

const props = defineProps<{
  token?: string;
  verfahrenId: number | null;
  rundeId: number | null;
  context: {
    verfahren: string;
    runde: string;
  };
}>();

const loading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");

async function handleDeleteAll() {
  const firstConfirm = confirm(
    "MÃ¶chten Sie wirklich alle SchÃ¼lerdaten aus der Tabelle 'anm_schueler_pool' lÃ¶schen?\n\nDies lÃ¶scht auch alle damit verknÃ¼pften offenen FÃ¤lle und Merkzettel-EintrÃ¤ge!"
  );
  if (!firstConfirm) return;

  const secondConfirm = confirm(
    "Sind Sie sich absolut sicher? Diese Aktion kann nicht rÃ¼ckgÃ¤ngig gemacht werden!"
  );
  if (!secondConfirm) return;

  try {
    errorMessage.value = "";
    successMessage.value = "";
    loading.value = true;

    const res = await importService.clearSchueler(props.token);
    successMessage.value = res?.message || "Alle SchÃ¼lerdaten wurden erfolgreich gelÃ¶scht.";
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Das LÃ¶schen der SchÃ¼lerdaten ist fehlgeschlagen.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="importe-view">
    <KapazitaetenView
      :token="token"
      :verfahren-id="verfahrenId"
    />

    <PoolImport
      :token="token"
      :verfahren-id="verfahrenId"
      :runde-id="rundeId"
    />

    <AnmeldungImport
      :token="token"
      :verfahren-id="verfahrenId"
      :runde-id="rundeId"
    />

    <section class="importe-danger-zone">
      <div class="importe-danger-zone-copy">
        <p class="importe-eyebrow">Gefahrenbereich</p>
        <h3>Schuelerdaten entfernen (für Testmodus)</h3>
        <p>Diese Aktion loescht den gesamten importierten Schuelerpool inklusive verknuepfter offener Faelle und Merkzettel-Eintraege.</p>
      </div>

      <button
        class="btn-danger"
        type="button"
        :disabled="loading"
        @click="handleDeleteAll"
      >
        {{ loading ? "Loesche..." : "Alle Schuelerdaten loeschen" }}
      </button>
    </section>
  </section>
</template>

<style scoped>
.importe-view {
  display: grid;
  gap: 18px;
}

.importe-eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: 700;
  color: #6680a3;
}

.importe-danger-zone {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border: 1px solid #fecaca;
  border-radius: 22px;
  padding: 20px 22px;
  background:
    radial-gradient(circle at top right, rgba(252, 165, 165, 0.18), transparent 34%),
    linear-gradient(180deg, #fff7f7 0%, #ffffff 100%);
  box-shadow: 0 18px 42px rgba(153, 27, 27, 0.08);
}

.importe-danger-zone-copy {
  display: grid;
  gap: 8px;
}

.importe-danger-zone-copy h3 {
  margin: 0;
  color: #7f1d1d;
}

.importe-danger-zone-copy p:not(.importe-eyebrow) {
  margin: 0;
  color: #7f1d1d;
  line-height: 1.55;
}

.btn-danger {
  border-radius: 999px;
  padding: 10px 18px;
  font-weight: 700;
  border: 1px solid #fca5a5;
  background: #fee2e2;
  color: #991b1b;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-danger:hover:not(:disabled) {
  background: #fecaca;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15);
}

.btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.feedback-panel {
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 14px;
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

.feedback-title {
  font-weight: 700;
  margin: 0 0 4px;
}

@media (max-width: 760px) {
  .importe-danger-zone {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
