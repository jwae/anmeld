<script setup lang="ts">
defineProps<{ fileName: string; busy: boolean; options: { delimiter: "auto" | ";" | "," | "\t"; hasHeaders: boolean } }>();
defineEmits<{ (event: "pick"): void; (event: "update:delimiter", value: "auto" | ";" | "," | "\t"): void; (event: "update:hasHeaders", value: boolean): void; }>();
</script>
<template>
  <section class="wizard-step">
    <div class="upload-dropzone">
      <p class="upload-title">CSV-Datei auswählen</p>
      <p class="upload-copy">Datei per Drag & Drop oder Dateidialog auswählen.</p>
      <button class="btn-primary" type="button" :disabled="busy" @click="$emit('pick')">Datei auswählen</button>
      <p v-if="fileName" class="upload-file">{{ fileName }}</p>
    </div>
    <div class="upload-options">
      <label><span>Trennzeichen</span><select :value="options.delimiter" @change="$emit('update:delimiter', ($event.target as HTMLSelectElement).value as 'auto' | ';' | ',' | '\t')"><option value="auto">Automatisch</option><option value=";">Semikolon</option><option value=",">Komma</option><option :value="'\t'">Tab</option></select></label>
      <label class="checkbox-row"><input :checked="options.hasHeaders" type="checkbox" @change="$emit('update:hasHeaders', ($event.target as HTMLInputElement).checked)" /><span>Erste Zeile enthält Spaltennamen</span></label>
    </div>
  </section>
</template>
<style scoped>
.wizard-step { display: grid; gap: 18px; }
.upload-dropzone { display: grid; gap: 12px; justify-items: start; padding: 28px; border: 2px dashed #9bb3cf; border-radius: 24px; background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%); }
.upload-title { margin: 0; font-size: 18px; font-weight: 700; color: #19365b; }
.upload-copy,.upload-file { margin: 0; color: #4f6483; }
.upload-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.upload-options label { display: grid; gap: 6px; }
.upload-options span { font-size: 13px; font-weight: 700; color: #45617f; }
.upload-options select { min-height: 42px; border: 1px solid #c8d6e8; border-radius: 14px; padding: 0 12px; }
.checkbox-row { align-content: center; }
@media (max-width: 760px) { .upload-options { grid-template-columns: 1fr; } }
</style>
