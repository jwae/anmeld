<script setup lang="ts">
import UserSessionCard from "./UserSessionCard.vue";

type CredentialsMenu = "verfahren" | "verfahrensdaten" | "abgleich" | "koordination" | "offene-faelle";

const emit = defineEmits<{
  (e: "navigate", menu: CredentialsMenu): void;
  (e: "logout"): void;
}>();

function emitNavigate(menu: CredentialsMenu) {
  emit("navigate", menu);
}

function formatCompactRoundLabel(value: string) {
  const text = String(value || "").trim();
  const match = text.match(/runde\s*(\d+)(?:\s*[-–:]\s*|\s+)?(.+)?/i);
  if (match) {
    const roundNumber = String(match[1] || "").trim();
    const roundName = String(match[2] || "").trim();
    return roundName ? `${roundNumber} ${roundName}` : roundNumber;
  }
  return text;
}

withDefaults(defineProps<{
  currentContext: {
    verfahren: string;
    runde: string;
  };
  activeMenu: CredentialsMenu;
  hasMenuSelectionContext?: boolean;
  hasSelectionAttentionContext?: boolean;
  user?: any;
  userLabel?: string;
  connectedHost?: string;
  connectedPort?: string | number;
  connectedDatabase?: string;
}>(), {
  hasMenuSelectionContext: false,
  hasSelectionAttentionContext: false,
  user: null,
  userLabel: "",
  connectedHost: "",
  connectedPort: "",
  connectedDatabase: "",
});
</script>

<template src="./AnmeldeverfahrenHeader.html"></template>
<style scoped src="./AnmeldeverfahrenHeader.css"></style>
