<script setup lang="ts">
const props = defineProps<{
  verfahren: string;
  runde: string;
  summary: {
    schueler_gesamt: number;
    neuaufnahmen: number;
    warteliste: number;
    ablehnungen: number;
    ohne_anmeldung: number;
    freie_plaetze: number;
  } | null;
}>();

const fallbackSummary = {
  schueler_gesamt: 0,
  neuaufnahmen: 0,
  warteliste: 0,
  ablehnungen: 0,
  ohne_anmeldung: 0,
  freie_plaetze: 0,
};
</script>

<template>
  <section class="abgleich-summary-card">
    <div class="abgleich-summary-copy">
      <p class="abgleich-summary-eyebrow">Zusammenfassung</p>
      <h2>Verfahrensuebersicht nach dem Abgleich</h2>
      <p>
        Verfahren {{ verfahren }}, {{ runde }}:
        {{ (summary || fallbackSummary).schueler_gesamt }} Schueler beruecksichtigt.
        {{ (summary || fallbackSummary).neuaufnahmen }} Neuaufnahmen,
        {{ (summary || fallbackSummary).warteliste }} Warteliste,
        {{ (summary || fallbackSummary).ablehnungen }} Ablehnungen,
        {{ (summary || fallbackSummary).ohne_anmeldung }} ohne Anmeldung.
        {{ (summary || fallbackSummary).freie_plaetze }} freie Plaetze verfuegbar.
      </p>
    </div>

    <div class="abgleich-summary-grid">
      <article class="abgleich-summary-metric">
        <span>Schueler aus Pool</span>
        <strong>{{ (summary || fallbackSummary).schueler_gesamt }}</strong>
      </article>
      <article class="abgleich-summary-metric">
        <span>Neuaufnahmen</span>
        <strong>{{ (summary || fallbackSummary).neuaufnahmen }}</strong>
      </article>
      <article class="abgleich-summary-metric">
        <span>Warteliste</span>
        <strong>{{ (summary || fallbackSummary).warteliste }}</strong>
      </article>
      <article class="abgleich-summary-metric">
        <span>Ablehnungen</span>
        <strong>{{ (summary || fallbackSummary).ablehnungen }}</strong>
      </article>
      <article class="abgleich-summary-metric">
        <span>Ohne Anmeldung</span>
        <strong>{{ (summary || fallbackSummary).ohne_anmeldung }}</strong>
      </article>
      <article class="abgleich-summary-metric">
        <span>Freie Plaetze</span>
        <strong>{{ (summary || fallbackSummary).freie_plaetze }}</strong>
      </article>
    </div>
  </section>
</template>

<style scoped>
.abgleich-summary-card {
  display: grid;
  gap: 16px;
  padding: 20px 22px;
  border: 1px solid #dbe4f0;
  border-radius: 22px;
  background:
    radial-gradient(circle at top right, rgba(143, 187, 233, 0.18), transparent 34%),
    linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
  box-shadow: 0 18px 42px rgba(19, 54, 102, 0.08);
}

.abgleich-summary-eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: 700;
  color: #6680a3;
}

.abgleich-summary-copy h2 {
  margin: 0;
  color: #19365b;
}

.abgleich-summary-copy p {
  margin: 8px 0 0;
  color: #4a607e;
  line-height: 1.55;
}

.abgleich-summary-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.abgleich-summary-metric {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid #dbe4f0;
  border-radius: 16px;
  background: #ffffff;
}

.abgleich-summary-metric span {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6680a3;
  font-weight: 700;
}

.abgleich-summary-metric strong {
  color: #19365b;
  font-size: 24px;
}
</style>
