<script setup lang="ts">
defineProps<{
  fileName: string;
  options: {
    delimiter: "auto" | ";" | "," | "\t";
    hasHeaders: boolean;
    charset: "utf-8";
  };
  dragActive: boolean;
  busy: boolean;
}>();

defineEmits<{
  (event: "pick"): void;
  (event: "drop", file: File | null | undefined): void;
  (event: "update:delimiter", value: "auto" | ";" | "," | "\t"): void;
  (event: "update:hasHeaders", value: boolean): void;
}>();

function handleDragOver(event: DragEvent) {
  event.preventDefault();
}
</script>

<template>
  <section class="wizard-step">
    <div
      class="upload-dropzone"
      :class="{ 'is-active': dragActive, 'is-disabled': busy }"
      @dragover="handleDragOver"
      @drop.prevent="$emit('drop', $event.dataTransfer?.files?.[0])"
    >
      <p class="upload-title">CSV-Datei auswählen</p>
      <p class="upload-copy">Datei per Drag & Drop ablegen oder über den Dateidialog auswählen.</p>
      <button class="btn-primary" type="button" :disabled="busy" @click="$emit('pick')">
        Datei auswählen
      </button>
      <p v-if="fileName" class="upload-file">
        {{ fileName }}
      </p>
    </div>

    <div class="upload-options">
      <label class="upload-option upload-option-compact">
        <span>Trennzeichen</span>
        <select :value="options.delimiter" @change="$emit('update:delimiter', ($event.target as HTMLSelectElement).value as 'auto' | ';' | ',' | '\t')">
          <option value="auto">Automatisch</option>
          <option value=";">Semikolon</option>
          <option value=",">Komma</option>
          <option :value="'\t'">Tab</option>
        </select>
      </label>
      <label class="upload-option upload-option-binary">
        <span>Erste Zeile enthält Spaltennamen</span>
        <select :value="options.hasHeaders ? 'ja' : 'nein'" @change="$emit('update:hasHeaders', ($event.target as HTMLSelectElement).value === 'ja')">
          <option value="ja">Ja</option>
          <option value="nein">Nein</option>
        </select>
      </label>
      <label class="upload-option upload-option-compact">
        <span>Zeichensatz</span>
        <input type="text" value="UTF-8 (mit Fallback)" disabled />
      </label>
    </div>
  </section>
</template>

<style scoped>
.wizard-step {
  display: grid;
  gap: 18px;
}

.upload-dropzone {
  display: grid;
  gap: 12px;
  justify-items: start;
  padding: 28px;
  border: 2px dashed #9bb3cf;
  border-radius: 24px;
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
}

.upload-dropzone.is-active {
  border-color: #2f6fb3;
  background: linear-gradient(180deg, #eef6ff 0%, #ffffff 100%);
}

.upload-dropzone.is-disabled {
  opacity: 0.7;
}

.upload-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #19365b;
}

.upload-copy,
.upload-file {
  margin: 0;
  color: #4f6483;
}

.upload-options {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 14px;
  width: fit-content;
  max-width: 100%;
}

.upload-options label {
  display: grid;
  gap: 6px;
}

.upload-option {
  align-content: start;
}

.upload-option-compact {
  width: 25%;
  min-width: 110px;
}

.upload-option-binary {
  width: max-content;
  min-width: 210px;
}

.upload-options span {
  font-size: 13px;
  font-weight: 700;
  color: #45617f;
}

.upload-options select,
.upload-options input[type="text"] {
  min-height: 42px;
  border: 1px solid #c8d6e8;
  border-radius: 14px;
  padding: 0 12px;
}

@media (max-width: 760px) {
  .upload-options {
    display: grid;
    grid-template-columns: 1fr;
    width: 100%;
  }

  .upload-option-compact,
  .upload-option-binary {
    width: 100%;
    min-width: 0;
  }
}
</style>
