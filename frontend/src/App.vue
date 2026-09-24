<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { loadToken, authStore, can } from "./authStore";
import { APP_PATHS, isAnmRoutePath, navigateTo, replaceRoute, routeState } from "./router";
import { useDatabaseLogin } from "./composables/useDatabaseLogin";
import { useAuth } from "./composables/useAuth";
import { authService } from "./services/apiService";
import appStructureImage from "./assets/app_struktur.png";

import APPManagement from "./components/APPManagement.vue";
import LoginCredentialsPage from "./components/LoginCredentialsPage.vue";

const {
  host, port, database, username: dbUsername, password: dbPassword,
  error, errorDetails, errorCode, connecting,
  testing, testSuccess, testConnection,
  connectedHost, connectedPort, connectedDatabase,
  connect: connectDb, isConfigured: isDbConfigured, loadStatus,
} = useDatabaseLogin();

const {
  loginUsername, loginPassword, loginLoading, loginError, pendingLogin,
  isAuthenticated, currentUserLabel, pendingLoginUser, pendingLoginUserLabel, canPendingManageApp, canPendingViewProcedures,
  login: performLogin, continueAfterLogin: performContinueAfterLogin, logout: performLogout,
  testLoginPassword,
} = useAuth();

const initializing = ref(true);
const showConnectionSettings = ref(false);
const connectedSettings = ref("");
const connectionSettings = computed(() => JSON.stringify([
  host.value.trim(), port.value, database.value.trim(), dbUsername.value.trim(), dbPassword.value,
]));
const loginBusy = computed(() => initializing.value || connecting.value || loginLoading.value || testing.value);
const showAppManagement = ref<boolean>(false);
const managementSessionLoading = ref<boolean>(false);

const isDatabaseConfigured = computed<boolean>(() => isDbConfigured.value);
const currentPath = computed<string>(() => routeState.path);
const isAnmRoute = computed<boolean>(() => isAnmRoutePath(currentPath.value));
const canViewProcedures = computed<boolean>(() => can("verfahren.anzeigen"));

loadToken();

async function login() {
  if (loginBusy.value || pendingLogin.value) return;
  loginError.value = "";
  error.value = "";
  errorDetails.value = "";
  errorCode.value = "";
  if (!host.value.trim()) {
    showConnectionSettings.value = true;
    error.value = "Bitte den Server in den Einstellungen angeben.";
    return;
  }
  if (!loginUsername.value.trim() || !loginPassword.value) {
    loginError.value = "Benutzername und Passwort sind erforderlich.";
    return;
  }
  if (!isDatabaseConfigured.value || connectedSettings.value !== connectionSettings.value) {
    const connected = await connectDb();
    if (!connected) {
      showConnectionSettings.value = true;
      return;
    }
    connectedSettings.value = connectionSettings.value;
  }
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
  navigateTo(APP_PATHS.home);
}

async function logoutFromAreaSelection() {
  if (managementSessionLoading.value) return;
  managementSessionLoading.value = true;
  loginError.value = "";
  try {
    await logout();
  } finally {
    managementSessionLoading.value = false;
  }
}

watch([currentPath, isAuthenticated, canViewProcedures], ([path, authenticated, mayView]) => {
  if (isAnmRoutePath(path) && (!authenticated || !mayView)) {
    replaceRoute(APP_PATHS.home);
  }
}, { immediate: true });

onMounted(async () => {
  await loadStatus();
  if (!host.value.trim() || error.value) showConnectionSettings.value = true;
  if (isDatabaseConfigured.value) connectedSettings.value = connectionSettings.value;
  initializing.value = false;
  if (!isDatabaseConfigured.value) {
    await performLogout();
    return;
  }
  if (!isAuthenticated.value) return;

  if (canViewProcedures.value) {
    if (!isAnmRoute.value) replaceRoute(APP_PATHS.anmVerfahren);
    return;
  }

  await performLogout();
});
</script>

<template src="./App.html"></template>
<style scoped src="./App.css"></style>
