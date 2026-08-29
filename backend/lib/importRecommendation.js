const RECOMMENDATION_IMPORT_MAPPING = new Map([
  ["H", "HS"],
  ["R", "RS"],
  ["G", "GY"],
  ["HAUPTSCHULE", "HS"],
  ["REALSCHULE", "RS"],
  ["GYMNASIUM", "GY"],
  ["OHNE", "KEINE"],
  ["-", "KEINE"],
  ["H/R", "HS_RS"],
  ["R/GY", "RS_GY"],
  ["HS", "HS"],
  ["RS", "RS"],
  ["GY", "GY"],
  ["KEINE", "KEINE"],
  ["HS_RS", "HS_RS"],
  ["RS_GY", "RS_GY"],
]);

function normalizeImportRecommendation(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return { valid: true, value: "KEINE", normalized };
  if (!RECOMMENDATION_IMPORT_MAPPING.has(normalized)) {
    return { valid: false, value: null, normalized };
  }
  return {
    valid: true,
    value: RECOMMENDATION_IMPORT_MAPPING.get(normalized),
    normalized,
  };
}

function importRecommendationDiffers(importedValue, storedValue, fieldPresent = true) {
  if (!fieldPresent) return false;
  return String(importedValue ?? "").trim().toUpperCase() !== String(storedValue ?? "").trim().toUpperCase();
}

module.exports = { normalizeImportRecommendation, importRecommendationDiffers };
