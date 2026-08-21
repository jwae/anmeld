<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { loadToken, authStore } from "./authStore";
import { APP_PATHS, isAnmRoutePath, navigateTo, replaceRoute, routeState } from "./router";
import { useDatabaseLogin } from "./composables/useDatabaseLogin";
import { useAuth } from "./composables/useAuth";

import DatabaseConnectPanel from "./components/DatabaseConnectPanel.vue";
import APPManagement from "./components/APPManagement.vue";
import LoginCredentialsPage from "./components/LoginCredentialsPage.vue";

const {
  host, port, database, username: dbUsername, password: dbPassword,
  error, errorDetails, errorCode, connecting, serverConnected, serverStatus,
  connectedHost, connectedPort, connectedDatabase,
  applyDefaults: applyDbDefaults, connect: connectDb, isConfigured: isDbConfigured, loadStatus,
} = useDatabaseLogin();

const {
  loginUsername, loginPassword, loginLoading, loginError, pendingLogin,
  isAuthenticated, currentUserLabel, pendingLoginUser, pendingLoginUserLabel, isPendingAdmin,
  login: performLogin, continueAfterLogin: performContinueAfterLogin, logout: performLogout,
  testLoginPassword,
} = useAuth();

const databaseConnectionConfirmed = ref<boolean>(false);
const showAppManagement = ref<boolean>(false);

const isDatabaseConfigured = computed<boolean>(() => isDbConfigured.value);
const showDatabaseConnectStep = computed<boolean>(
  () => !isDatabaseConfigured.value || !databaseConnectionConfirmed.value,
);
const currentPath = computed<string>(() => routeState.path);
const isAnmRoute = computed<boolean>(() => isAnmRoutePath(currentPath.value));
const isAuthenticatedAdmin = computed<boolean>(
  () => String(authStore.groupName || "").trim().toLowerCase() === "admin",
);

applyDbDefaults();
loadToken();

async function login() {
  await performLogin();
  showAppManagement.value = false;
}

function openAnmeldeverfahren() {
  const activatedSession = performContinueAfterLogin();
  if (!activatedSession) return;

  showAppManagement.value = false;
  navigateTo(APP_PATHS.anmVerfahren);
}

async function connectDatabase() {
  const connected = await connectDb();
  if (!connected) return;

  await performLogout();
  loginPassword.value = testLoginPassword;
  showAppManagement.value = false;
  databaseConnectionConfirmed.value = false;
  navigateTo(APP_PATHS.home);
}

function continueAfterDatabaseConnect() {
  if (!isDatabaseConfigured.value) return;
  databaseConnectionConfirmed.value = true;
}

function backToDatabaseConnect() {
  loginError.value = "";
  loginPassword.value = testLoginPassword;
  databaseConnectionConfirmed.value = false;
  showAppManagement.value = false;
  navigateTo(APP_PATHS.home);
}

function logoutPendingManagementSession() {
  showAppManagement.value = false;
  pendingLogin.value = null;
  loginPassword.value = testLoginPassword;
  loginError.value = "";
}

async function logout() {
  await performLogout();
  showAppManagement.value = false;
  databaseConnectionConfirmed.value = isDatabaseConfigured.value;
  navigateTo(APP_PATHS.home);
}

watch([currentPath, isAuthenticated, isAuthenticatedAdmin], ([path, authenticated, admin]) => {
  if (isAnmRoutePath(path) && (!authenticated || !admin)) {
    replaceRoute(APP_PATHS.home);
  }
}, { immediate: true });

onMounted(async () => {
  await loadStatus();
  if (!isDatabaseConfigured.value || !isAuthenticated.value) return;

  databaseConnectionConfirmed.value = true;
  if (isAuthenticatedAdmin.value) {
    if (!isAnmRoute.value) replaceRoute(APP_PATHS.anmVerfahren);
    return;
  }

  await performLogout();
});
</script>

<template src="./App.html"></template>
<style scoped src="./App.css"></style>
