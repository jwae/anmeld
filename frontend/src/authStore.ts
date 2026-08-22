import { reactive } from "vue";

export interface AuthStore {
  token: string;
  userId: string;
  username: string;
  groupName: string;
  permissions: string[];
}

export const authStore: AuthStore = reactive({
  token: "",
  userId: "",
  username: "",
  groupName: "",
  permissions: [],
});

function normalizePermissions(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean))];
}

export function can(permissionKey: string): boolean {
  const key = String(permissionKey || "").trim();
  return !!key && authStore.permissions.includes(key);
}

export function setToken(token: string, username: string, groupName: string, userId: string | number = "", permissions: string[] = []) {
  authStore.token = token;
  authStore.userId = userId ? String(userId) : "";
  authStore.username = username || "";
  authStore.groupName = groupName || "";
  authStore.permissions = normalizePermissions(permissions);
  localStorage.setItem("token", authStore.token);
  localStorage.setItem("userId", authStore.userId);
  localStorage.setItem("username", authStore.username);
  localStorage.setItem("groupName", authStore.groupName);
  localStorage.setItem("permissions", JSON.stringify(authStore.permissions));
}

export function loadToken() {
  authStore.token = localStorage.getItem("token") || "";
  authStore.userId = localStorage.getItem("userId") || "";
  authStore.username = localStorage.getItem("username") || "";
  authStore.groupName = localStorage.getItem("groupName") || "";
  try {
    authStore.permissions = normalizePermissions(JSON.parse(localStorage.getItem("permissions") || "[]"));
  } catch {
    authStore.permissions = [];
  }
}

export function clearToken() {
  authStore.token = "";
  authStore.userId = "";
  authStore.username = "";
  authStore.groupName = "";
  authStore.permissions = [];
  localStorage.removeItem("token");
  localStorage.removeItem("userId");
  localStorage.removeItem("username");
  localStorage.removeItem("groupName");
  localStorage.removeItem("permissions");
}
