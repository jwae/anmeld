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

const isAdminUser = computed<boolean>(
  () => String(props.user?.group_name || "").trim().toLowerCase() === "admin",
);

const userManagementRef = ref<{ requestLeave: () => Promise<boolean> } | null>(null);

async function requestClose() {
  const allowed = await (userManagementRef.value?.requestLeave() || Promise.resolve(true));
  if (allowed) emit("close");
}
</script>

<template src="./APPManagement.html"></template>
<style scoped src="./APPManagement.css"></style>
