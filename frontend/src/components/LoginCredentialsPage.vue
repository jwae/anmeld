<script setup lang="ts">
import { ref } from "vue";
import UserSessionCard from "./UserSessionCard.vue";
import AnmeldeverfahrenView from "../views/AnmeldeverfahrenView.vue";
import ImporteView from "../views/ImporteView.vue";
import AbgleichView from "../views/AbgleichView.vue";
import KoordinationView from "../views/KoordinationView.vue";

const emit = defineEmits<{
  (e: "close"): void;
}>();

const props = defineProps<{
  user?: any;
  loginUserLabel?: string;
  connectedHost?: string;
  connectedPort?: string | number;
  connectedDatabase?: string;
  token?: string;
}>();

const activeCredentialsMenu = ref<"verfahren" | "importe" | "abgleich" | "koordination" | "roadmap">("verfahren");
const currentContext = ref<{ verfahren: string; runde: string }>({
  verfahren: "Kein Verfahren ausgewaehlt",
  runde: "Keine Runde ausgewaehlt",
});
const selectedVerfahrenId = ref<number | null>(null);
const selectedRundenId = ref<number | null>(null);
const selectedRundenStatus = ref<"geplant" | "aktiv" | "abgeschlossen" | null>(null);

function handleContextUpdate(payload: { verfahren: string; runde: string }) {
  currentContext.value = {
    verfahren: String(payload?.verfahren || "Kein Verfahren ausgewaehlt"),
    runde: String(payload?.runde || "Keine Runde ausgewaehlt"),
  };
}

function handleSelectionUpdate(payload: { verfahrenId: number | null; rundeId: number | null; rundeStatus: "geplant" | "aktiv" | "abgeschlossen" | null }) {
  selectedVerfahrenId.value = payload?.verfahrenId ?? null;
  selectedRundenId.value = payload?.rundeId ?? null;
  selectedRundenStatus.value = payload?.rundeStatus ?? null;
}
</script>

<template src="./LoginCredentialsPage.html"></template>
<style scoped src="./LoginCredentialsPage.css"></style>
