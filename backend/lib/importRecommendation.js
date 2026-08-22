const RECOMMENDATION_IMPORT_MAPPING = new Map([
  ["H", "HS"],
  ["R", "RS"],
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

module.exports = { normalizeImportRecommendation };
