<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import apiClient from "../services/apiClient";

type Props = {
  managementToken?: string;
  isManagementSessionActive?: boolean;
  managementSchools?: any[];
  managementSchoolGroups?: any[];
};

type SchoolGroup = {
  id: number;
  name: string;
  beschreibung: string;
  aktiv: boolean;
  schoolSnrs: string[];
};

type SortKey = "selected" | "snr" | "name" | "school_form" | "plz" | "ort";
type SortDirection = "asc" | "desc";

const props = withDefaults(defineProps<Props>(), {
  managementToken: "",
  isManagementSessionActive: false,
  managementSchools: () => [],
  managementSchoolGroups: () => [],
});

const emit = defineEmits<{
  (e: "feedback", payload: { error?: string; notice?: string }): void;
  (e: "bootstrap-updated", payload: any): void;
}>();

const localFeedbackError = ref("");
const localFeedbackNotice = ref("");
const selectedGroupId = ref("");
const schoolSearch = ref("");
const sortKey = ref<SortKey>("name");
const sortDirection = ref<SortDirection>("asc");
const managementSaving = ref(false);
const deleteGroupConfirmOpen = ref(false);

const groupForm = reactive({
  name: "",
  beschreibung: "",
  aktiv: true,
});

watch(
  () => props.managementSchoolGroups,
  (groups) => {
    const normalizedGroups = Array.isArray(groups) ? groups : [];
    if (!normalizedGroups.length) {
      selectedGroupId.value = "";
      return;
    }
    if (!selectedGroupId.value) {
      selectedGroupId.value = String(normalizedGroups[0]?.id || "");
      return;
    }
    const exists = normalizedGroups.some((group) => String(group?.id || "") === String(selectedGroupId.value || ""));
    if (!exists) selectedGroupId.value = String(normalizedGroups[0]?.id || "");
  },
  { deep: true, immediate: true },
);

watch(deleteGroupConfirmOpen, (isOpen) => {
  if (typeof document === "undefined") return;
  document.body.style.overflow = isOpen ? "hidden" : "";
});

const normalizedSchools = computed(() =>
  (Array.isArray(props.managementSchools) ? props.managementSchools : []).map((school) => ({
    snr: String(school?.snr || "").trim(),
    name: String(school?.name || "").trim(),
    schoolForm: String(school?.school_form_sf || school?.sf_id || "").trim(),
    plz: String(school?.plz || "").trim(),
    ort: String(school?.ort || school?.city || "").trim(),
  })),
);

const schoolGroups = computed<SchoolGroup[]>(() =>
  (Array.isArray(props.managementSchoolGroups) ? props.managementSchoolGroups : []).map((group) => ({
    id: Number(group?.id || 0),
    name: String(group?.name || "").trim(),
    beschreibung: String(group?.beschreibung || "").trim(),
    aktiv: Number(group?.aktiv || 0) === 1 || group?.aktiv === true,
    schoolSnrs: Array.isArray(group?.schoolSnrs)
      ? group.schoolSnrs.map((snr: unknown) => String(snr || "").trim()).filter(Boolean)
      : [],
  })),
);

const sortedGroups = computed(() =>
  [...schoolGroups.value].sort((a, b) =>
    a.name.localeCompare(b.name, "de", { sensitivity: "base", numeric: true }),
  ),
);

const selectedGroup = computed<SchoolGroup | null>(
  () => schoolGroups.value.find((group) => String(group.id) === String(selectedGroupId.value || "")) || null,
);

const selectedSchoolSnrSet = computed(() => new Set(selectedGroup.value?.schoolSnrs || []));

const visibleSchools = computed(() => {
  const query = schoolSearch.value.trim().toLowerCase();
  const directionFactor = sortDirection.value === "desc" ? -1 : 1;

  return normalizedSchools.value
    .filter((school) => {
      if (!query) return true;
      return (
        school.snr.toLowerCase().includes(query)
        || school.name.toLowerCase().includes(query)
        || school.ort.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const aSelected = selectedSchoolSnrSet.value.has(a.snr) ? 1 : 0;
      const bSelected = selectedSchoolSnrSet.value.has(b.snr) ? 1 : 0;

      if (sortKey.value === "selected") return (aSelected - bSelected) * directionFactor;

      const map: Record<Exclude<SortKey, "selected">, string> = {
        snr: a.snr,
        name: a.name,
        school_form: a.schoolForm,
        plz: a.plz,
        ort: a.ort,
      };
      const compareMap: Record<Exclude<SortKey, "selected">, string> = {
        snr: b.snr,
        name: b.name,
        school_form: b.schoolForm,
        plz: b.plz,
        ort: b.ort,
      };

      return String(map[sortKey.value as Exclude<SortKey, "selected">] || "").localeCompare(
        String(compareMap[sortKey.value as Exclude<SortKey, "selected">] || ""),
        "de",
        { sensitivity: "base", numeric: true },
      ) * directionFactor;
    });
});

function emitFeedback(error = "", notice = "") {
  localFeedbackError.value = String(error || "").trim();
  localFeedbackNotice.value = String(notice || "").trim();
  emit("feedback", { error: localFeedbackError.value, notice: localFeedbackNotice.value });
}

function managementAuthHeaders() {
  return props.managementToken
    ? { Authorization: `Bearer ${String(props.managementToken || "").trim()}` }
    : {};
}

function resetGroupForm() {
  groupForm.name = "";
  groupForm.beschreibung = "";
  groupForm.aktiv = true;
}

async function saveGroup() {
  const name = String(groupForm.name || "").trim();
  if (!name) {
    emitFeedback("Bitte einen Namen fuer die Schulgruppe eingeben.", "");
    return;
  }

  managementSaving.value = true;
  emitFeedback("", "");

  try {
    const response = await apiClient.post(
      "/api/auth/admin/school-groups",
      {
        name,
        beschreibung: String(groupForm.beschreibung || "").trim(),
        aktiv: groupForm.aktiv ? 1 : 0,
      },
      { headers: managementAuthHeaders() },
    );
    emit("bootstrap-updated", response.data || {});
    const nextGroups = Array.isArray(response.data?.school_groups) ? response.data.school_groups : [];
    const createdGroup = nextGroups.find((group: any) => String(group?.name || "").trim().toLowerCase() === name.toLowerCase());
    selectedGroupId.value = createdGroup ? String(createdGroup.id || "") : "";
    resetGroupForm();
    emitFeedback("", "Schulgruppe gespeichert.");
  } catch (error: any) {
    emitFeedback(error?.response?.data?.error || error?.message || "Die Schulgruppe konnte nicht gespeichert werden.", "");
  } finally {
    managementSaving.value = false;
  }
}

async function deleteSelectedGroup() {
  if (!selectedGroup.value) {
    emitFeedback("Bitte zuerst eine Schulgruppe auswaehlen.", "");
    return;
  }
  deleteGroupConfirmOpen.value = true;
}

function closeDeleteGroupConfirm() {
  deleteGroupConfirmOpen.value = false;
}

async function confirmDeleteSelectedGroup() {
  if (!selectedGroup.value) {
    closeDeleteGroupConfirm();
    emitFeedback("Bitte zuerst eine Schulgruppe auswaehlen.", "");
    return;
  }

  managementSaving.value = true;
  emitFeedback("", "");

  try {
    const deletedName = selectedGroup.value.name;
    const response = await apiClient.delete(
      `/api/auth/admin/school-groups/${selectedGroup.value.id}`,
      { headers: managementAuthHeaders() },
    );
    emit("bootstrap-updated", response.data || {});
    selectedGroupId.value = "";
    closeDeleteGroupConfirm();
    emitFeedback("", `Schulgruppe "${deletedName}" geloescht.`);
  } catch (error: any) {
    emitFeedback(error?.response?.data?.error || error?.message || "Die Schulgruppe konnte nicht geloescht werden.", "");
  } finally {
    managementSaving.value = false;
  }
}

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
    return;
  }
  sortKey.value = key;
  sortDirection.value = "asc";
}

function sortIndicator(key: SortKey) {
  if (sortKey.value !== key) return "";
  return sortDirection.value === "asc" ? "▲" : "▼";
}

function isAssigned(snr: string) {
  return selectedSchoolSnrSet.value.has(String(snr || "").trim());
}

async function toggleSchoolAssignment(snr: string, checked: boolean) {
  if (!selectedGroup.value) {
    emitFeedback("Bitte zuerst eine Schulgruppe auswaehlen.", "");
    return;
  }

  const normalizedSnr = String(snr || "").trim();
  if (!normalizedSnr) return;

  managementSaving.value = true;
  emitFeedback("", "");

  try {
    const response = checked
      ? await apiClient.post(
          `/api/auth/admin/school-groups/${selectedGroup.value.id}/schools/${encodeURIComponent(normalizedSnr)}`,
          {},
          { headers: managementAuthHeaders() },
        )
      : await apiClient.delete(
          `/api/auth/admin/school-groups/${selectedGroup.value.id}/schools/${encodeURIComponent(normalizedSnr)}`,
          { headers: managementAuthHeaders() },
        );
    emit("bootstrap-updated", response.data || {});
    emitFeedback(
      "",
      checked
        ? `Schule ${normalizedSnr} wurde der Gruppe zugeordnet.`
        : `Schule ${normalizedSnr} wurde aus der Gruppe entfernt.`,
    );
  } catch (error: any) {
    emitFeedback(error?.response?.data?.error || error?.message || "Die Schulzuordnung konnte nicht gespeichert werden.", "");
  } finally {
    managementSaving.value = false;
  }
}

function handleAssignmentChange(snr: string, event: Event) {
  const target = event.target as HTMLInputElement | null;
  toggleSchoolAssignment(snr, !!target?.checked);
}

function clearSchoolSearch() {
  schoolSearch.value = "";
}
</script>

<template src="./SchoolGroupManagement.html"></template>
<style scoped src="./SchoolGroupManagement.css"></style>
