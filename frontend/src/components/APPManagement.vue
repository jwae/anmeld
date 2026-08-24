<script setup lang="ts">
import { computed, ref } from "vue";
import UserSessionCard from "./UserSessionCard.vue";
import UserManagementPanel from "./UserManagementPanel.vue";

const emit = defineEmits<{
  (e: "close"): void;
}>();

const props = defineProps<{
  token?: string;
  user?: any;
  connectedHost?: string;
  connectedPort?: string | number;
  connectedDatabase?: string;
  showCloseButton?: boolean;
  closeLabel?: string;
}>();

const canManageApp = computed<boolean>(() => {
  const permissions = Array.isArray(props.user?.permissions) ? props.user.permissions : [];
  return permissions.includes("benutzer.bearbeiten")
    || permissions.includes("gruppen.bearbeiten")
    || permissions.includes("kataloge.anzeigen")
    || permissions.includes("kataloge.bearbeiten")
    || permissions.includes("protokoll.anzeigen")
    || permissions.includes("protokoll.bearbeiten");
});

const userManagementRef = ref<{ requestLeave: () => Promise<boolean> } | null>(null);

async function requestClose() {
  const allowed = await (userManagementRef.value?.requestLeave() || Promise.resolve(true));
  if (allowed) emit("close");
}
</script>

<template src="./APPManagement.html"></template>
<style scoped src="./APPManagement.css"></style>
