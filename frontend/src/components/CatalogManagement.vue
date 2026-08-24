<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import apiClient from "../services/apiClient";

interface CatalogSummary {
  name: string;
  comment: string;
  label?: string;
  allow_insert?: boolean;
  allow_delete?: boolean;
  notice?: string;
}

interface CatalogColumn {
  name: string;
  comment: string;
  data_type: string;
  column_type: string;
  nullable: boolean;
  default: any;
  max_length: number | null;
  precision: number | null;
  scale: number | null;
  primary: boolean;
  auto_increment: boolean;
  generated: boolean;
  readonly: boolean;
  input_kind: string;
  enum_values: string[];
}

interface CatalogRow {
  localId: string;
  values: Record<string, any>;
  original: Record<string, any>;
  isNew: boolean;
  deleted: boolean;
}

const props = withDefaults(defineProps<{
  managementToken?: string;
  isManagementSessionActive?: boolean;
  canEditCatalogs?: boolean;
}>(), {
  managementToken: "",
  isManagementSessionActive: false,
  canEditCatalogs: false,
});

const catalogs = ref<CatalogSummary[]>([]);
const selectedCatalogName = ref("");
const selectedCatalog = ref<CatalogSummary | null>(null);
const columns = ref<CatalogColumn[]>([]);
const primaryKey = ref<string[]>([]);
const rows = ref<CatalogRow[]>([]);
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const noticeMessage = ref("");
const leaveDialogOpen = ref(false);
const deleteDialogOpen = ref(false);
const deactivateDialogOpen = ref(false);
let localRowSequence = 0;
let leaveResolver: ((allowed: boolean) => void) | null = null;
let deleteResolver: ((confirmed: boolean) => void) | null = null;
let deactivateResolver: ((confirmed: boolean) => void) | null = null;

function headers() {
  return props.managementToken
    ? { Authorization: `Bearer ${props.managementToken}` }
    : {};
}

function humanizeName(value: string, prefix = "") {
  let text = String(value || "").trim();
  if (prefix && text.startsWith(prefix)) text = text.slice(prefix.length);
  const words = text.split("_").filter(Boolean).map((word) => {
    const lowered = word.toLowerCase();
    if (lowered === "id") return "ID";
    if (lowered === "sf") return "SF";
    if (lowered === "asd") return "ASD";
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
  return words.join(" ") || text;
}

function catalogLabel(catalog: CatalogSummary | null) {
  if (!catalog) return "Katalog";
  return String(catalog.comment || "").trim() || humanizeName(catalog.name, "anm_kat_");
}

function columnLabel(column: CatalogColumn) {
  return String(column.comment || "").trim() || humanizeName(column.name);
}

function cloneValues(values: Record<string, any>) {
  return Object.fromEntries(Object.entries(values || {}).map(([key, value]) => [key, value]));
}

function comparableValue(value: any, column: CatalogColumn) {
  if (column.input_kind === "boolean") return Number(Boolean(Number(value)));
  if (value === undefined) return null;
  return value;
}

function rowChanged(row: CatalogRow) {
  if (row.isNew || row.deleted) return true;
  return columns.value.some((column) =>
    !column.readonly
    && comparableValue(row.values[column.name], column) !== comparableValue(row.original[column.name], column),
  );
}

const hasChanges = computed(() => rows.value.some(rowChanged));
const deletedRows = computed(() => rows.value.filter((row) => row.deleted && !row.isNew));
const selectedLabel = computed(() => catalogLabel(selectedCatalog.value));
const canInsertRows = computed(() => props.canEditCatalogs && selectedCatalog.value?.allow_insert !== false);
const canDeleteRows = computed(() => props.canEditCatalogs && selectedCatalog.value?.allow_delete !== false);
const deactivatedEventRows = computed(() => {
  if (selectedCatalogName.value !== "anm_kat_ereignisse") return [];
  return rows.value.filter((row) => (
    !row.isNew
    && !row.deleted
    && Number(row.original.aktiv) === 1
    && Number(row.values.aktiv) === 0
  ));
});

function rowKey(row: CatalogRow) {
  return Object.fromEntries(primaryKey.value.map((name) => [name, row.original[name]]));
}

function rowDisplayName(row: CatalogRow) {
  for (const name of ["bezeichnung", "name", "code", "asd", "sf", "sf_kurz"]) {
    const value = String(row.values[name] ?? "").trim();
    if (value) return value;
  }
  return primaryKey.value.map((name) => String(row.values[name] ?? "")).filter(Boolean).join(" / ") || "Eintrag";
}

function applyCatalogData(data: any) {
  selectedCatalog.value = data?.table || null;
  columns.value = Array.isArray(data?.columns) ? data.columns : [];
  primaryKey.value = Array.isArray(data?.primary_key) ? data.primary_key : [];
  rows.value = (Array.isArray(data?.rows) ? data.rows : []).map((entry: any) => ({
    localId: `stored-${++localRowSequence}`,
    values: cloneValues(entry),
    original: cloneValues(entry),
    isNew: false,
    deleted: false,
  }));
}

async function loadCatalogs() {
  if (!props.isManagementSessionActive || !props.managementToken) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await apiClient.get("/api/auth/admin/catalogs", { headers: headers() });
    catalogs.value = (Array.isArray(response.data?.catalogs) ? response.data.catalogs : [])
      .map((catalog: CatalogSummary) => ({ ...catalog, label: catalogLabel(catalog) }))
      .sort((left: CatalogSummary, right: CatalogSummary) =>
        String(left.label || "").localeCompare(String(right.label || ""), "de", { sensitivity: "base" }),
      );
    const firstCatalog = catalogs.value[0]?.name || "";
    selectedCatalogName.value = firstCatalog;
    if (firstCatalog) await loadCatalog(firstCatalog);
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Die Kataloge konnten nicht geladen werden.";
  } finally {
    loading.value = false;
  }
}

async function loadCatalog(tableName: string) {
  if (!tableName) return;
  loading.value = true;
  errorMessage.value = "";
  noticeMessage.value = "";
  try {
    const response = await apiClient.get(`/api/auth/admin/catalogs/${encodeURIComponent(tableName)}`, {
      headers: headers(),
    });
    selectedCatalogName.value = tableName;
    applyCatalogData(response.data || {});
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Der Katalog konnte nicht geladen werden.";
  } finally {
    loading.value = false;
  }
}

async function selectCatalog(tableName: string) {
  if (tableName === selectedCatalogName.value || loading.value || saving.value) return;
  if (!(await requestLeave())) return;
  await loadCatalog(tableName);
}

function defaultValue(column: CatalogColumn) {
  if (column.readonly) return null;
  if (column.default !== null && column.default !== undefined) {
    const defaultText = String(column.default);
    if (/current_timestamp/i.test(defaultText)) return undefined;
    if (column.input_kind === "boolean") return Number(Boolean(Number(column.default)));
    if (column.input_kind === "number") return Number(column.default);
    return column.default;
  }
  if (column.input_kind === "boolean") return 0;
  return column.nullable ? null : "";
}

function addRow() {
  if (!canInsertRows.value) return;
  const values: Record<string, any> = {};
  for (const column of columns.value) values[column.name] = defaultValue(column);
  rows.value.push({
    localId: `new-${++localRowSequence}`,
    values,
    original: {},
    isNew: true,
    deleted: false,
  });
}

function toggleDeleted(row: CatalogRow) {
  if (!canDeleteRows.value) return;
  row.deleted = !row.deleted;
}

function discardChanges() {
  rows.value = rows.value
    .filter((row) => !row.isNew)
    .map((row) => ({ ...row, values: cloneValues(row.original), deleted: false }));
  errorMessage.value = "";
  noticeMessage.value = "Änderungen verworfen.";
}

function validateRows() {
  for (const row of rows.value) {
    if (row.deleted) continue;
    for (const column of columns.value) {
      if (column.readonly) continue;
      const value = row.values[column.name];
      if (!column.nullable && column.default === null && (value === null || value === undefined || value === "")) {
        return `${columnLabel(column)} ist in einer Zeile erforderlich.`;
      }
    }
  }
  return "";
}

function changedValues(row: CatalogRow) {
  const values: Record<string, any> = {};
  for (const column of columns.value) {
    if (column.readonly) continue;
    const current = comparableValue(row.values[column.name], column);
    const original = comparableValue(row.original[column.name], column);
    if (row.isNew || current !== original) values[column.name] = row.values[column.name];
  }
  return values;
}

function confirmDeletes() {
  deleteDialogOpen.value = true;
  return new Promise<boolean>((resolve) => {
    deleteResolver = resolve;
  });
}

function finishDeleteDialog(confirmed: boolean) {
  deleteDialogOpen.value = false;
  const resolver = deleteResolver;
  deleteResolver = null;
  resolver?.(confirmed);
}

function confirmEventDeactivation() {
  deactivateDialogOpen.value = true;
  return new Promise<boolean>((resolve) => {
    deactivateResolver = resolve;
  });
}

function finishDeactivateDialog(confirmed: boolean) {
  deactivateDialogOpen.value = false;
  const resolver = deactivateResolver;
  deactivateResolver = null;
  resolver?.(confirmed);
}

async function saveChanges(options: { confirmDeletion?: boolean } = {}) {
  if (!hasChanges.value || saving.value || !selectedCatalogName.value) return !saving.value;
  const validationError = validateRows();
  if (validationError) {
    errorMessage.value = validationError;
    noticeMessage.value = "";
    return false;
  }
  if (deletedRows.value.length && options.confirmDeletion !== false && !(await confirmDeletes())) return false;
  if (deactivatedEventRows.value.length && !(await confirmEventDeactivation())) return false;

  saving.value = true;
  errorMessage.value = "";
  noticeMessage.value = "";
  try {
    const payload = {
      inserts: rows.value.filter((row) => row.isNew && !row.deleted).map((row) => ({ values: changedValues(row) })),
      updates: rows.value.filter((row) => !row.isNew && !row.deleted && rowChanged(row)).map((row) => ({
        key: rowKey(row),
        values: changedValues(row),
      })),
      deletes: deletedRows.value.map((row) => ({ key: rowKey(row) })),
      confirm_deactivation: deactivatedEventRows.value.length > 0,
    };
    const response = await apiClient.post(
      `/api/auth/admin/catalogs/${encodeURIComponent(selectedCatalogName.value)}/changes`,
      payload,
      { headers: headers() },
    );
    applyCatalogData(response.data || {});
    noticeMessage.value = "Änderungen gespeichert.";
    return true;
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || "Die Änderungen konnten nicht gespeichert werden.";
    return false;
  } finally {
    saving.value = false;
  }
}

function requestLeave() {
  if (!hasChanges.value) return Promise.resolve(true);
  leaveDialogOpen.value = true;
  return new Promise<boolean>((resolve) => {
    leaveResolver = resolve;
  });
}

function finishLeaveDialog(allowed: boolean) {
  leaveDialogOpen.value = false;
  const resolver = leaveResolver;
  leaveResolver = null;
  resolver?.(allowed);
}

async function saveAndLeave() {
  const saved = await saveChanges();
  if (saved) finishLeaveDialog(true);
}

function discardAndLeave() {
  discardChanges();
  finishLeaveDialog(true);
}

function formatInputValue(value: any, column: CatalogColumn) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (column.input_kind === "date") return text.slice(0, 10);
  if (column.input_kind === "datetime-local") return text.replace(" ", "T").slice(0, 16);
  return text;
}

function updateInput(row: CatalogRow, column: CatalogColumn, event: Event) {
  const element = event.target as HTMLInputElement | HTMLSelectElement;
  if (column.input_kind === "boolean") {
    row.values[column.name] = (element as HTMLInputElement).checked ? 1 : 0;
    return;
  }
  const value = element.value;
  if (!value && column.nullable) row.values[column.name] = null;
  else if (column.input_kind === "number") row.values[column.name] = value;
  else row.values[column.name] = value;
}

watch(() => props.managementToken, (token, oldToken) => {
  if (token && token !== oldToken) void loadCatalogs();
});

onMounted(() => {
  void loadCatalogs();
});

defineExpose({ requestLeave });
</script>

<template src="./CatalogManagement.html"></template>
<style scoped src="./CatalogManagement.css"></style>
