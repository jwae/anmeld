<script setup lang="ts">
import VerfahrenUndRundenBereich from "../components/anmeldeverfahren/VerfahrenUndRundenBereich.vue";
import type { AnmeldeStatus, Anmeldeverfahrenstyp } from "../types";

const props = defineProps<{
  token?: string;
  verfahrenId?: number | null;
  rundeId?: number | null;
}>();

const emit = defineEmits<{
  (e: "update-context", payload: { verfahren: string; runde: string }): void;
  (e: "update-selection", payload: {
    verfahrenId: number | null;
    verfahrenstyp: Anmeldeverfahrenstyp | null;
    verfahrenStatus: AnmeldeStatus | null;
    rundeId: number | null;
    rundeStatus: AnmeldeStatus | null;
  }): void;
}>();

function handleBereichContextUpdate(payload: { verfahren: string; runde: string }) {
  emit("update-context", payload);
}

function handleBereichSelectionUpdate(payload: {
  verfahrenId: number | null;
  verfahrenstyp: Anmeldeverfahrenstyp | null;
  verfahrenStatus: AnmeldeStatus | null;
  rundeId: number | null;
  rundeStatus: AnmeldeStatus | null;
}) {
  emit("update-selection", payload);
}
</script>

<template>
  <section class="anm-view">
    <section class="anm-roadmap-card">
      <div class="anm-hero-grid">
        <div>
          <p class="anm-roadmap-eyebrow">Schritt 1</p>
          <h2>Grundlage des Schulanmeldeverfahrens</h2>
          <p>
            Hier können Sie: Verfahren und Runde festlegen / Kapazitaeten aktualisieren / Schuelerpool /Anmeldungen holen / Koordinieren.
          </p>
        </div>
      </div>
    </section>

    <VerfahrenUndRundenBereich
      :token="token"
      :initial-verfahren-id="verfahrenId"
      :initial-runde-id="rundeId"
      @update-context="handleBereichContextUpdate"
      @update-selection="handleBereichSelectionUpdate"
    />
  </section>
</template>

<style scoped>
.anm-view {
  display: grid;
  gap: 0;
}

.anm-roadmap-card {
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background:
    radial-gradient(circle at top right, rgba(143, 187, 233, 0.2), transparent 34%),
    linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-shadow: 0 18px 42px rgba(19, 54, 102, 0.08);
}

.anm-roadmap-card {
  display: grid;
  gap: 16px;
  padding: 22px;
}

.anm-hero-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr);
}

.anm-roadmap-eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: 700;
  color: #6680a3;
}

.anm-roadmap-card h2,
.anm-card h3 {
  margin: 0;
  color: #19385e;
}

.anm-roadmap-card h2 {
  font-size: 1.2em;
}

.anm-roadmap-card p,
.anm-roadmap-card p {
  margin: 8px 0 0;
  color: #4a607e;
  line-height: 1.55;
}
</style>
