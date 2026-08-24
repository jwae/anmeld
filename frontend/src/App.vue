<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { loadToken, authStore, can } from "./authStore";
import { APP_PATHS, isAnmRoutePath, navigateTo, replaceRoute, routeState } from "./router";
import { useDatabaseLogin } from "./composables/useDatabaseLogin";
import { useAuth } from "./composables/useAuth";
import { authService } from "./services/apiService";

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
  isAuthenticated, currentUserLabel, pendingLoginUser, pendingLoginUserLabel, canPendingManageApp, canPendingViewProcedures,
  login: performLogin, continueAfterLogin: performContinueAfterLogin, logout: performLogout,
  testLoginPassword,
} = useAuth();

const databaseConnectionConfirmed = ref<boolean>(false);
const showAppManagement = ref<boolean>(false);
const managementSessionLoading = ref<boolean>(false);

const isDatabaseConfigured = computed<boolean>(() => isDbConfigured.value);
const showDatabaseConnectStep = computed<boolean>(
  () => !isDatabaseConfigured.value || !databaseConnectionConfirmed.value,
);
const currentPath = computed<string>(() => routeState.path);
const isAnmRoute = computed<boolean>(() => isAnmRoutePath(currentPath.value));
const canViewProcedures = computed<boolean>(() => can("verfahren.anzeigen"));

applyDbDefaults();
loadToken();

async function login() {
  await performLogin();
  showAppManagement.value = false;
}

function openAnmeldeverfahren() {
  if (managementSessionLoading.value) return;
  const activatedSession = performContinueAfterLogin();
  if (!activatedSession) return;

  showAppManagement.value = false;
  navigateTo(APP_PATHS.anmVerfahren);
}

async function openAppManagement() {
  const token = String(pendingLogin.value?.token || "").trim();
  if (!token || managementSessionLoading.value) return;

  managementSessionLoading.value = true;
  loginError.value = "";
  try {
    await authService.loginManagementArea(token);
    showAppManagement.value = true;
  } catch (error: any) {
    loginError.value = error?.response?.data?.error || error?.message || "Verwaltungsbereich konnte nicht geoeffnet werden.";
  } finally {
    managementSessionLoading.value = false;
  }
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

async function logoutPendingManagementSession() {
  if (managementSessionLoading.value) return;
  const token = String(pendingLogin.value?.token || "").trim();
  managementSessionLoading.value = true;
  loginError.value = "";
  try {
    if (token) await authService.logoutManagementArea(token);
  } catch (error: any) {
    loginError.value = error?.response?.data?.error || error?.message || "Abmeldung vom Verwaltungsbereich fehlgeschlagen.";
  } finally {
    managementSessionLoading.value = false;
    showAppManagement.value = false;
    pendingLogin.value = null;
    loginPassword.value = testLoginPassword;
  }
}

async function logout() {
  await performLogout();
  showAppManagement.value = false;
  databaseConnectionConfirmed.value = isDatabaseConfigured.value;
  navigateTo(APP_PATHS.home);
}

watch([currentPath, isAuthenticated, canViewProcedures], ([path, authenticated, mayView]) => {
  if (isAnmRoutePath(path) && (!authenticated || !mayView)) {
    replaceRoute(APP_PATHS.home);
  }
}, { immediate: true });

onMounted(async () => {
  await loadStatus();
  if (!isDatabaseConfigured.value || !isAuthenticated.value) return;

  databaseConnectionConfirmed.value = true;
  if (canViewProcedures.value) {
    if (!isAnmRoute.value) replaceRoute(APP_PATHS.anmVerfahren);
    return;
  }

  await performLogout();
});
</script>

<template src="./App.html"></template>
<style scoped src="./App.css"></style>
