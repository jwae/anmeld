<script setup lang="ts">
import UserSessionCard from "./UserSessionCard.vue";
</script>

<template>
  <!-- Props and the action listener fall through to the existing session card. -->
  <UserSessionCard class="management-session-card" />
</template>

<style scoped>
.management-session-card {
  padding: var(--anm-space-3) var(--anm-space-4);
  border: var(--anm-border-width) solid var(--anm-border);
  border-radius: var(--anm-radius-card);
  background: var(--anm-surface);
  box-shadow: var(--anm-shadow-none);
}
.management-session-card :deep(.user-session-card-user) {
  color: var(--anm-text);
  font-size: var(--anm-text-button);
  line-height: var(--anm-leading);
  overflow-wrap: anywhere;
}
.management-session-card :deep(.user-session-card-badge) {
  background: var(--anm-surface-muted);
  color: var(--anm-text-muted);
  border-radius: var(--anm-radius-control);
  line-height: var(--anm-leading);
  overflow-wrap: anywhere;
}
.management-session-card :deep(.user-session-card-action) {
  min-height: var(--anm-control-height);
  padding: var(--anm-space-2) var(--anm-space-3);
  border: var(--anm-border-width) solid var(--anm-border-control);
  border-radius: var(--anm-radius-control);
  background: var(--anm-surface);
  color: var(--anm-text);
  font-size: var(--anm-text-button);
  font-weight: var(--anm-weight-bold);
}
.management-session-card :deep(.user-session-card-action:hover) {
  background: var(--anm-brand-soft);
  border-color: var(--anm-brand);
  color: var(--anm-brand-hover);
}
.management-session-card :deep(.user-session-card-action:focus-visible) {
  outline: var(--anm-focus-width) solid var(--anm-focus);
  outline-offset: var(--anm-focus-offset);
  box-shadow: none;
}
</style>
