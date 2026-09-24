<script setup lang="ts">
defineProps<{
  name: "user" | "lock" | "chevron" | "login" | "logout" | "database" | "settings" | "check" | "alert";
}>();

const paths = {
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5ZM12 14v3",
  chevron: "m6 9 6 6 6-6",
  login: "M14 3h6v18h-6M3 12h12m-5-5 5 5-5 5",
  logout: "M10 3H4v18h6m-1-9h12m-5-5 5 5-5 5",
  database: "M20 5c0 2-4 3-8 3S4 7 4 5s4-3 8-3 8 1 8 3ZM4 5v14c0 2 4 3 8 3s8-1 8-3V5M4 12c0 2 4 3 8 3s8-1 8-3",
  settings: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
  check: "m5 12 4 4L19 6",
  alert: "M12 3 2 21h20ZM12 9v5m0 3v1",
};
</script>

<template>
  <svg class="login-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">
    <path :d="paths[name]" />
  </svg>
</template>

<style scoped>
.login-icon {
  display: inline-block;
  width: var(--anm-icon-size);
  height: var(--anm-icon-size);
  flex: 0 0 auto;
  vertical-align: -0.2em;
}
</style>
