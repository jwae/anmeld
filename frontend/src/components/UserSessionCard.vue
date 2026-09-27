<script setup lang="ts">
import { computed } from "vue";
import LoginIcon from "./LoginIcon.vue";

const emit = defineEmits<{
  (e: "action"): void;
}>();

const props = withDefaults(defineProps<{
  user?: any;
  userLabel?: string;
  userTitle?: string;
  emptyUserLabel?: string;
  connectedHost?: string;
  connectedPort?: string | number;
  connectedDatabase?: string;
  actionLabel?: string;
  actionDisabled?: boolean;
}>(), {
  user: null,
  userLabel: "",
  emptyUserLabel: "Nutzer",
  connectedHost: "",
  connectedPort: "",
  connectedDatabase: "",
  actionLabel: "",
});

const resolvedUserLabel = computed<string>(() => {
  const explicit = String(props.userLabel || "").trim();
  if (explicit) return explicit;

  return String(props.user?.user_fullname || "").trim();
});

const resolvedUserTitle = computed<string>(() => {
  if (props.userTitle !== undefined) return props.userTitle;
  return [props.user?.username, props.user?.group_name]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" · ");
});

const connectionLabel = computed<string>(() => {
  const host = String(props.connectedHost || "").trim();
  const port = String(props.connectedPort || "").trim();
  if (!host && !port) return "";
  return port ? `${host}:${port}` : host;
});
</script>

<template src="./UserSessionCard.html"></template>
<style scoped src="./UserSessionCard.css"></style>
