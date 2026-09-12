<script setup lang="ts">
import { computed, ref } from "vue";
import importService from "../services/importService";
import { can } from "../authStore";
import KapazitaetenView from "./KapazitaetenView.vue";
import PoolImport from "../components/PoolImport.vue";
import AnmeldungImport from "../components/AnmeldungImport.vue";
import type { Anmeldeverfahrenstyp } from "../types";

const props = defineProps<{
  token?: string;
  verfahrenId: number | null;
  rundeId: number | null;
  verfahrenstyp: Anmeldeverfahrenstyp | null;
  context: {
    verfahren: string;
    runde: string;
  };
  isReadonly?: boolean;
}>();

const loading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const refreshVersion = ref(0);
const deleteAllConfirmOpen = ref(false);
const canDeleteStudentData = computed(() => can("verfahren.bearbeiten"));

function openDeleteAllConfirm() {
  if (!canDeleteStudentData.value || props.isReadonly || !props.verfahrenId) return;
  deleteAllConfirmOpen.value = true;
}

function closeDeleteAllConfirm() {
  if (!loading.value) deleteAllConfirmOpen.value = false;
}

async function handleDeleteAll() {
  if (!canDeleteStudentData.value || props.isReadonly || !props.verfahrenId || loading.value) return;
  try {
    errorMessage.value = "";
    successMessage.value = "";
    loading.value = true;

    const res = await importService.clearSchueler(props.verfahrenId, props.token);
    successMessage.value = res?.message || "Alle Schuelerdaten des aktuellen Verfahrens wurden erfolgreich geloescht.";
    refreshVersion.value += 1;
    deleteAllConfirmOpen.value = false;
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Das Loeschen der Schuelerdaten ist fehlgeschlagen.";
    deleteAllConfirmOpen.value = false;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="importe-view">
    <KapazitaetenView
      :key="`kapazitaeten-${verfahrenId ?? 'kein-verfahren'}-${refreshVersion}`"
      :token="token"
      :verfahren-id="verfahrenId"
      :is-readonly="isReadonly"
    />

    <PoolImport
      v-if="verfahrenstyp === 'GS'"
      :key="`pool-gs-${verfahrenId ?? 'kein-verfahren'}-${rundeId ?? 'keine-runde'}-${refreshVersion}`"
      :token="token"
      :verfahren-id="verfahrenId"
      :runde-id="rundeId"
      :verfahrenstyp="verfahrenstyp"
      :is-readonly="isReadonly"
      title="KiTa Schuelerpool importieren (CSV, EWO-Datei)"
    />

    <PoolImport
      v-else-if="verfahrenstyp === 'SEK1'"
      :key="`pool-sek1-${verfahrenId ?? 'kein-verfahren'}-${rundeId ?? 'keine-runde'}-${refreshVersion}`"
      :token="token"
      :verfahren-id="verfahrenId"
      :runde-id="rundeId"
      :verfahrenstyp="verfahrenstyp"
      :is-readonly="isReadonly"
      title="GS Schuelerpool importieren (CSV, EWO-Datei)"
    />

    <AnmeldungImport
      v-if="verfahrenstyp === 'GS' || verfahrenstyp === 'SEK1'"
      :key="`anmeldungen-${verfahrenId ?? 'kein-verfahren'}-${rundeId ?? 'keine-runde'}-${refreshVersion}`"
      :token="token"
      :verfahren-id="verfahrenId"
      :runde-id="rundeId"
      :verfahrenstyp="verfahrenstyp"
      :is-readonly="isReadonly"
    />

    <section v-if="canDeleteStudentData" class="importe-danger-zone">
      <div class="importe-danger-zone-copy">
        <p class="importe-eyebrow">Gefahrenbereich</p>
        <h3>
          <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
          <span>Schülerdaten löschen</span>
        </h3>
        <p>Diese Aktion löscht aus dem aktivierten Verfahren alle Schülerdaten aus den Import-, Abgleich- und Falltabellen.</p>
      </div>

      <button
        class="btn-danger"
        type="button"
        :disabled="loading || isReadonly || !verfahrenId"
        @click="openDeleteAllConfirm"
      >
        {{ loading ? "Loesche..." : "Alle Schuelerdaten loeschen" }}
      </button>
    </section>

    <Teleport to="body">
      <div v-if="deleteAllConfirmOpen" class="delete-all-backdrop" @click.self="closeDeleteAllConfirm">
        <section class="delete-all-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-all-title">
          <button class="delete-all-close" type="button" aria-label="Overlay schließen" :disabled="loading" @click="closeDeleteAllConfirm">×</button>
          <div class="delete-all-icon"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i></div>
          <div class="delete-all-copy">
            <h3 id="delete-all-title">Alle Schülerdaten löschen?</h3>
            <p>Alle Schülerdaten des Verfahrens <strong>{{ context?.verfahren || "Aktuelles Verfahren" }}</strong> werden aus den Import-, Abgleich- und Falltabellen gelöscht.</p>
            <p class="delete-all-warning">Diese Aktion kann nicht rückgängig gemacht werden.</p>
          </div>
          <footer>
            <button class="delete-all-submit" type="button" :disabled="loading" @click="handleDeleteAll">
              <i class="bi bi-trash3" aria-hidden="true"></i>
              {{ loading ? "Lösche..." : "Endgültig löschen" }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.importe-view {
  display: grid;
  gap: 0;
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
  font-size: 1.3em;
  display: flex;
  align-items: center;
  gap: 10px;
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

.delete-all-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(31, 20, 24, 0.48);
}

.delete-all-dialog {
  position: relative;
  width: min(500px, 100%);
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 15px;
  padding: 24px;
  border: 1px solid #fecaca;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(69, 10, 10, 0.32);
}

.delete-all-close {
  position: absolute;
  top: 9px;
  right: 11px;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #7f6570;
  font-size: 24px;
  line-height: 1;
}

.delete-all-close:hover:not(:disabled) { background: #fff1f2; color: #991b1b; }
.delete-all-close:disabled { cursor: wait; opacity: 0.55; }
.delete-all-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; background: #fee2e2; color: #b91c1c; font-size: 18px; }
.delete-all-copy h3 { margin: 0; color: #7f1d1d; font-size: 19px; }
.delete-all-copy p { margin: 8px 0 0; color: #65434a; line-height: 1.5; }
.delete-all-copy .delete-all-warning { color: #991b1b; font-weight: 700; }
.delete-all-dialog footer { grid-column: 1 / -1; display: flex; justify-content: center; margin-top: 5px; }
.delete-all-submit { min-height: 38px; padding: 8px 16px; border: 1px solid #b91c1c; border-radius: 9px; background: #b91c1c; color: #fff; font-weight: 700; }
.delete-all-submit:hover:not(:disabled) { background: #991b1b; }
.delete-all-submit:disabled { cursor: wait; opacity: 0.65; }

@media (max-width: 760px) {
  .importe-danger-zone {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
