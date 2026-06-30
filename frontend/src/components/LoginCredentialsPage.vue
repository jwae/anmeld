<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AnmeldeverfahrenHeader from "./AnmeldeverfahrenHeader.vue";
import AnmeldeverfahrenView from "../views/AnmeldeverfahrenView.vue";
import ImporteView from "../views/ImporteView.vue";
import AbgleichView from "../views/AbgleichView.vue";
import KoordinationView from "../views/KoordinationView.vue";
import OffeneFaelleView from "../views/OffeneFaelleView.vue";
import AuswertungenView from "../views/AuswertungenView.vue";
import SchulenImVerfahrenBereich from "./anmeldeverfahren/SchulenImVerfahrenBereich.vue";
import type { AnmeldeStatus, Anmeldeverfahrenstyp } from "../types";
import { APP_PATHS, navigateTo, replaceRoute, routeState } from "../router";
const emit = defineEmits<{
  (e: "close"): void;
}>();

const props = defineProps<{
  user?: any;
  userLabel?: string;
  loginUserLabel?: string;
  connectedHost?: string;
  connectedPort?: string | number;
  connectedDatabase?: string;
  token?: string;
}>();

const currentContext = ref<{ verfahren: string; runde: string }>({
  verfahren: "Kein Verfahren ausgewaehlt",
  runde: "Keine Runde ausgewaehlt",
});
const selectedVerfahrenId = ref<number | null>(null);
const selectedVerfahrenstyp = ref<Anmeldeverfahrenstyp | null>(null);
const selectedRundenId = ref<number | null>(null);
const selectedRundenStatus = ref<AnmeldeStatus | null>(null);
const hasMountedVerfahrenView = ref(routeState.path === APP_PATHS.anmVerfahren);
const hasMenuSelectionContext = computed<boolean>(
  () => selectedRundenId.value !== null,
);
const hasSelectionAttentionContext = computed<boolean>(
  () => selectedVerfahrenId.value === null || selectedRundenId.value === null,
);
const activeCredentialsMenu = computed<"verfahren" | "verfahrensdaten" | "abgleich" | "koordination" | "offene-faelle" | "auswertungen">(() => {
  switch (routeState.path) {
    case APP_PATHS.anmVerfahrensdaten:
      return "verfahrensdaten";
    case APP_PATHS.anmAbgleich:
      return "abgleich";
    case APP_PATHS.anmKoordination:
      return "koordination";
    case APP_PATHS.anmOffeneFaelle:
      return "offene-faelle";
    case APP_PATHS.anmAuswertungen:
      return "auswertungen";
    default:
      return "verfahren";
  }
});

function handleContextUpdate(payload: { verfahren: string; runde: string }) {
  currentContext.value = {
    verfahren: String(payload?.verfahren || "Kein Verfahren ausgewaehlt"),
    runde: String(payload?.runde || "Keine Runde ausgewaehlt"),
  };
}

function handleSelectionUpdate(payload: {
  verfahrenId: number | null;
  verfahrenstyp: Anmeldeverfahrenstyp | null;
  rundeId: number | null;
  rundeStatus: AnmeldeStatus | null;
}) {
  selectedVerfahrenId.value = payload?.verfahrenId ?? null;
  selectedVerfahrenstyp.value = payload?.verfahrenstyp ?? null;
  selectedRundenId.value = payload?.rundeId ?? null;
  selectedRundenStatus.value = payload?.rundeStatus ?? null;
}

function navigateToMenu(menu: "verfahren" | "verfahrensdaten" | "abgleich" | "koordination" | "offene-faelle" | "auswertungen") {
  if (menu !== "verfahren" && !hasMenuSelectionContext.value) return;

  const routeByMenu = {
    verfahren: APP_PATHS.anmVerfahren,
    verfahrensdaten: APP_PATHS.anmVerfahrensdaten,
    abgleich: APP_PATHS.anmAbgleich,
    koordination: APP_PATHS.anmKoordination,
    "offene-faelle": APP_PATHS.anmOffeneFaelle,
    auswertungen: APP_PATHS.anmAuswertungen,
  } as const;

  navigateTo(routeByMenu[menu]);
}

watch(hasMenuSelectionContext, (isAvailable) => {
  if (!isAvailable && activeCredentialsMenu.value !== "verfahren") {
    replaceRoute(APP_PATHS.anmVerfahren);
  }
});

watch(activeCredentialsMenu, (menu) => {
  if (menu === "verfahren") {
    hasMountedVerfahrenView.value = true;
  }
}, { immediate: true });
</script>

<template src="./LoginCredentialsPage.html"></template>
<style scoped src="./LoginCredentialsPage.css"></style>
