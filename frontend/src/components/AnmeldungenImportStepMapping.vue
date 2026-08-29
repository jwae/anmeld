<script setup lang="ts">
defineProps<{ fields: Array<{ key: string; label: string; description: string; required: boolean; readOnly?: boolean; systemValue?: string }>; columns: string[]; mapping: Record<string, string>; globalSchulNr: string }>();
defineEmits<{
  (event: "change", payload: { key: string; value: string }): void;
  (event: "update:globalSchulNr", value: string): void;
}>();

function normalizeColumnName(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isSourceSchoolColumn(column: string) {
  const normalized = normalizeColumnName(column);
  return normalized.includes("herkunftsschule")
    || normalized.includes("quellschule")
    || normalized === "source_school_snr"
    || normalized === "snr_abg";
}

function columnsForField(fieldKey: string, columns: string[]) {
  return fieldKey === "anmeldeschule_snr"
    ? columns.filter((column) => !isSourceSchoolColumn(column))
    : columns;
}

function isMissingRequiredMapping(
  field: { key: string; required: boolean; readOnly?: boolean },
  mapping: Record<string, string>,
  globalSchulNr: string,
) {
  if (!field.required || field.readOnly) return false;
  if (field.key === "anmeldeschule_snr" && String(globalSchulNr || "").trim()) return false;
  return !String(mapping[field.key] || "").trim();
}

function hasImportMapping(
  field: { key: string; required: boolean; readOnly?: boolean },
  mapping: Record<string, string>,
  globalSchulNr: string,
) {
  if (!field.required || field.readOnly) return false;
  if (field.key === "anmeldeschule_snr" && String(globalSchulNr || "").trim()) return true;
  return Boolean(String(mapping[field.key] || "").trim());
}
</script>
<template>
  <section class="wizard-step">
    <article class="mapping-card mapping-card-global">
      <div class="mapping-copy">
        <p class="mapping-title">Globale anmeldeschule_snr</p>
        <p>Falls die CSV keine Schulnummer-Spalte hat, kann hier eine Schulnummer fuer alle Importzeilen gesetzt werden.</p>
      </div>
      <input
        :value="globalSchulNr"
        type="text"
        inputmode="numeric"
        placeholder="z. B. 123456"
        @input="$emit('update:globalSchulNr', ($event.target as HTMLInputElement).value)"
      />
    </article>
    <div class="mapping-grid">
      <article
        v-for="field in fields"
        :key="field.key"
        class="mapping-card"
        :class="{
          'is-required-unmapped': isMissingRequiredMapping(field, mapping, globalSchulNr),
          'is-mapped': hasImportMapping(field, mapping, globalSchulNr),
        }"
      >
        <div class="mapping-copy">
          <p class="mapping-title">{{ field.label }}<span v-if="field.required" class="mapping-badge is-required">Pflicht</span><span v-else-if="field.readOnly" class="mapping-badge">Automatisch</span></p>
          <p>{{ field.key === 'anmeldeschule_snr' && globalSchulNr ? 'Globaler Schulwert vorhanden, CSV-Feld optional.' : field.description }}</p>
        </div>
        <template v-if="field.readOnly"><div class="mapping-readonly">{{ field.systemValue || "Automatisch gesetzt" }}</div></template>
        <template v-else><select :value="mapping[field.key] || ''" @change="$emit('change', { key: field.key, value: ($event.target as HTMLSelectElement).value })"><option value="">Nicht zuordnen</option><option v-for="column in columnsForField(field.key, columns)" :key="column" :value="column">{{ column }}</option></select></template>
      </article>
    </div>
  </section>
</template>
<style scoped>
.wizard-step { display: grid; gap: 12px; }
.mapping-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.mapping-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, 220px); gap: 12px; align-items: center; padding: 12px 14px; border: 1px solid #dbe4f0; border-radius: 14px; background: #fff; }
.mapping-card.is-required-unmapped { border-color: #e7b8bd; background: #fff8f8; }
.mapping-card.is-required-unmapped select { border-color: #dca7ad; background: #fffafa; }
.mapping-card.is-mapped { border-color: #68b883; background: #dcfce7; }
.mapping-card.is-mapped select { border-color: #4fa36d; background: #f0fdf4; }
.mapping-card-global { grid-template-columns: minmax(0, 1fr) minmax(220px, 260px); }
.mapping-title { margin: 0 0 4px; font-weight: 700; color: #19365b; font-size: 14px; }
.mapping-copy p:last-child { margin: 0; color: #526985; font-size: 12px; line-height: 1.35; }
.mapping-badge { display: inline-flex; margin-left: 8px; padding: 2px 7px; border-radius: 999px; background: #e8eef6; font-size: 10px; color: #45617f; }
.mapping-badge.is-required { background: #dbeafe; color: #1d4ed8; }
select,input,.mapping-readonly { min-height: 38px; border: 1px solid #c8d6e8; border-radius: 12px; padding: 8px 10px; font-size: 13px; }
.mapping-readonly { display: flex; align-items: center; background: #f8fbff; color: #45617f; }
@media (max-width: 1080px) { .mapping-grid,.mapping-card { grid-template-columns: 1fr; } }
</style>
