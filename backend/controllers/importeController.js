const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { assertWritableContext, assertStudentWritable } = require("../lib/anmeldeWriteGuard");
const { normalizeImportRecommendation, importRecommendationDiffers } = require("../lib/importRecommendation");
const { buildStammdatenabweichungNote } = require("../lib/importCaseNote");
const {
  findStudentByExternalId,
  findStudentsByPersonData,
  findStudentsByUmlautPersonData,
  normalizeExternalIdentity,
  pickNonEmptyAddressFields,
  resolveStudent,
  updateStudentMaster,
  updateStudentOrigin,
  upsertRoundState,
} = require("../lib/schuelerIdentityService");
const MAX_CSV_TEXT_LENGTH = 5 * 1024 * 1024;

const poolPreviewSessions = new Map();
const anmeldungsPreviewSessions = new Map();
const anmSchuelerImportSessions = new Map();
const anmSchuelerAnmeldungenImportSessions = new Map();
const rueckmeldungenMgImportSessions = new Map();
const tableColumnCache = new Map();
const PREVIEW_TTL_MS = 30 * 60 * 1000;
let svwsConnectionModulePromise = null;

function sendError(res, statusCode, message, details) {
  const payload = { error: message };
  if (details) payload.details = details;
  return res.status(statusCode).json(payload);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeTextLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = normalizeText(value);
  if (!text) return null;
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
    const [day, month, year] = text.split(".");
    return `${year}-${month}-${day}`;
  }
  return text;
}

function normalizeBoolean(value) {
  const text = normalizeTextLower(value);
  if (!text) return 0;
  if (["1", "true", "ja", "yes", "y"].includes(text)) return 1;
  if (["0", "false", "nein", "no", "n"].includes(text)) return 0;
  return 0;
}

function normalizeInteger(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function getSvwsConnectionModule() {
  if (!svwsConnectionModulePromise) {
    const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "lib", "svwsConnection.mjs")).href;
    svwsConnectionModulePromise = import(moduleUrl).catch((error) => {
      svwsConnectionModulePromise = null;
      throw error;
    });
  }
  return svwsConnectionModulePromise;
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ";" && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => String(cell || "").trim());
}

function normalizeHeaderName(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\u00e4/g, "ae")
    .replace(/\u00f6/g, "oe")
    .replace(/\u00fc/g, "ue")
    .replace(/\u00df/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getHeaderCandidates(header) {
  if (Array.isArray(header)) {
    return header.map((entry) => normalizeHeaderName(entry)).filter(Boolean);
  }
  return [normalizeHeaderName(header)].filter(Boolean);
}

function parseCsvText(csvText, requiredHeaders) {
  const normalized = String(csvText || "").replace(/^\uFEFF/, "");
  if (!normalized.trim()) {
    const error = new Error("Die CSV-Datei ist leer.");
    error.statusCode = 400;
    throw error;
  }
  if (normalized.length > MAX_CSV_TEXT_LENGTH) {
    const error = new Error("Die CSV-Datei ist zu gross.");
    error.statusCode = 413;
    throw error;
  }

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);

  if (lines.length < 2) {
    const error = new Error("Die CSV-Datei muss eine Kopfzeile und mindestens eine Datenzeile enthalten.");
    error.statusCode = 400;
    throw error;
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeaderName);
  const headerIndexByName = new Map();
  headers.forEach((header, index) => {
    if (!headerIndexByName.has(header)) headerIndexByName.set(header, index);
  });

  const missingHeaders = requiredHeaders.filter((header) => {
    const candidates = getHeaderCandidates(header);
    return !candidates.some((candidate) => headerIndexByName.has(candidate));
  });
  if (missingHeaders.length) {
    const labels = missingHeaders.map((header) => (Array.isArray(header) ? header.join(" oder ") : header));
    const error = new Error(`Die CSV-Datei muss die Spalten ${labels.join(", ")} enthalten.`);
    error.statusCode = 400;
    throw error;
  }

  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const getValue = (header) => {
      const candidates = getHeaderCandidates(header);
      for (const candidate of candidates) {
        const cellIndex = headerIndexByName.get(candidate);
        if (typeof cellIndex === "number") {
          return cells[cellIndex] || "";
        }
      }
      return "";
    };
    return {
      row_number: index + 2,
      getValue,
    };
  });
}

function cleanupPreviewSessions(store) {
  const now = Date.now();
  for (const [token, entry] of store.entries()) {
    if (!entry || Number(entry.expires_at || 0) <= now) {
      store.delete(token);
    }
  }
}

function createPreviewToken() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function storePreview(store, payload) {
  cleanupPreviewSessions(store);
  const token = createPreviewToken();
  const expiresAt = Date.now() + PREVIEW_TTL_MS;
  store.set(token, { ...payload, expires_at: expiresAt });
  return { token, expires_at: expiresAt };
}

function getPreview(store, token) {
  cleanupPreviewSessions(store);
  const preview = store.get(normalizeText(token));
  if (!preview) return null;
  if (Number(preview.expires_at || 0) <= Date.now()) {
    store.delete(normalizeText(token));
    return null;
  }
  return preview;
}

function getPoolImportFieldDefinitions(schuelerColumns, verfahrenstyp) {
  const requiresSourceSchool = normalizeText(verfahrenstyp) === "SEK1";
  const fields = [
    {
      key: "source_school_snr",
      label: requiresSourceSchool ? "Quell-SNR" : "Quell-SNR / Schulnummer",
      description: requiresSourceSchool
        ? "Schule, aus der der Pooldatensatz stammt."
        : "Optional: Schule, aus der der Pooldatensatz stammt.",
      required: requiresSourceSchool,
      warning: false,
    },
    {
      key: "externe_schueler_id",
      label: "Externe Schueler-ID",
      description: "Optional. Wird als externe Identitaet gespeichert; ohne ID erfolgt der Abgleich ueber Name und Geburtsdatum.",
      required: false,
      warning: false,
    },
    {
      key: "vorname",
      label: "Vorname",
      description: "Pflichtfeld aus der CSV.",
      required: true,
      warning: false,
    },
    {
      key: "nachname",
      label: "Nachname",
      description: "Pflichtfeld aus der CSV.",
      required: true,
      warning: false,
    },
    {
      key: "geburtsdatum",
      label: "Geburtsdatum",
      description: "Pflichtfeld aus der CSV.",
      required: true,
      warning: false,
    },
  ];

  const optionalFields = [
    ["strasse", "Strasse", "Adresse des Kindes."],
    ["plz", "PLZ", "Postleitzahl."],
    ["ort", "Ort", "Wohnort."],
    ["foerderbedarf", "LE", "Foerderbedarf als 0/1, Ja/Nein."],
    ["zieldifferent", "ZD", "Zieldifferent als 0/1, Ja/Nein."],
    ["ef", "EF", "EF als 0/1, Ja/Nein."],
    ["empfehlung", "Empfehlung", "Empfehlungscode aus dem Katalog."],
    ["teilnahmestatus", "Teilnahmestatus", "Aktiv, Wegzug, Abgemeldet oder Verstorben."],
    ["quell_jahrgang", "Quell-Jahrgang", "Jahrgang an der Herkunftsschule."],
    ["bemerkung", "Bemerkung", "Freie Notiz zum Datensatz."],
  ];

  for (const [key, label, description] of optionalFields) {
    if (!schuelerColumns.has(key)) continue;
    fields.push({
      key,
      label,
      description,
      required: false,
      warning: false,
    });
  }

  return fields;
}

function getAnmeldungenImportFieldDefinitions(schuelerColumns) {
  const fields = [
    {
      key: "externe_schueler_id",
      label: "Externe Schueler-ID",
      description: "Optional. Wird als externe Identitaet gespeichert; ohne ID erfolgt der Abgleich ueber Name und Geburtsdatum.",
      required: false,
      warning: false,
    },
    {
      key: "anmeldeschule_snr",
      label: "Aufnahmeschule",
      description: "Aus CSV oder globaler Auswahl.",
      required: true,
      warning: false,
    },
    {
      key: "anmeldestatus",
      label: "Status aus CSV",
      description: "Wird spaeter auf die Datenbankwerte gemappt.",
      required: true,
      warning: false,
    },
    {
      key: "vorname",
      label: "Vorname",
      description: "Pflichtfeld aus der CSV.",
      required: true,
      warning: false,
    },
    {
      key: "nachname",
      label: "Nachname",
      description: "Pflichtfeld aus der CSV.",
      required: true,
      warning: false,
    },
    {
      key: "geburtsdatum",
      label: "Geburtsdatum",
      description: "Pflichtfeld aus der CSV.",
      required: true,
      warning: false,
    },
  ];

  const optionalFields = [
    ["empfehlung", "Empfehlung", "Empfehlungscode aus dem Katalog."],
    ["foerderbedarf", "Foerderbedarf", "0/1, Ja/Nein."],
    ["foerder_id", "Foerder-ID", "Kennung des Foerderbedarfs."],
    ["zieldifferent", "Zieldifferent", "0/1, Ja/Nein."],
    ["bemerkung", "Bemerkung", "Freie Notiz."],
    ["strasse", "Strasse", "Adresse."],
    ["plz", "PLZ", "Postleitzahl."],
    ["ort", "Ort", "Wohnort."],
  ];
  for (const [key, label, description] of optionalFields) {
    if (!schuelerColumns.has(key) && !["foerder_id"].includes(key)) continue;
    fields.push({
      key,
      label,
      description,
      required: false,
      warning: false,
    });
  }
  return fields;
}

function getAnmeldestatusTargetValues() {
  return ["Neuaufnahme", "Warteliste", "Zugeordnet", "Abgelehnt", "Ohne"];
}

function isEmptyImportValue(value) {
  return normalizeText(value) === "";
}

function isValidImportBoolean(value) {
  const text = normalizeTextLower(value);
  return !text || ["1", "0", "true", "false", "ja", "nein", "yes", "no", "y", "n"].includes(text);
}

function isValidIsoDate(value) {
  const text = normalizeText(value);
  if (!text) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return true;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) return true;
  return false;
}

const MG_REQUIRED_HEADERS = ["SNr-Aufn.", "Name", "Vorname", "Geboren", "GL-Status", "Status"];
const MG_HEADER_KEYS = {
  "snr_aufn": "SNr-Aufn.",
  "sname_aufn": "SName-Aufn.",
  "name": "Name",
  "vorname": "Vorname",
  "geboren": "Geboren",
  "str": "Str",
  "plz": "PLZ",
  "ort": "Ort",
  "snr_abg": "SNr-Abg.",
  "sname_abg": "SName-Abg.",
  "empfehlung": "Empfehlung",
  "gl_status": "GL-Status",
  "anmeldedatum": "Anmeldedatum",
  "status": "Status",
  "bemerkung": "Bemerkung",
};

function normalizeMgDate(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const normalized = normalizeDate(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return normalized;
}

function normalizeMgStatus(value) {
  const text = normalizeTextLower(value);
  if (text === "neuaufnahme") return "Neuaufnahme";
  if (text === "warteliste") return "Warteliste";
  return null;
}

function normalizeMgGlStatus(value) {
  const text = normalizeTextLower(value);
  if (["", "0", "nein", "false", "no", "n"].includes(text)) return { valid: true, value: 0 };
  if (["1", "x", "ja", "true", "yes", "y"].includes(text)) return { valid: true, value: 1 };
  return { valid: false, value: null };
}

function getMgRowValue(row, header) {
  const expected = normalizeHeaderName(header);
  const key = Object.keys(row || {}).find((entry) => normalizeHeaderName(entry) === expected);
  return key ? row[key] : "";
}

function buildMgMatchKey(nachname, vorname, geburtsdatum) {
  return `${normalizeText(nachname)}\u0000${normalizeText(vorname)}\u0000${normalizeText(geburtsdatum)}`;
}

function getMgMatchingFields(student, data) {
  return [
    ["Nachname", normalizeText(student?.nachname) === normalizeText(data?.nachname)],
    ["Vorname", normalizeText(student?.vorname) === normalizeText(data?.vorname)],
    ["Geburtsdatum", normalizeMgDate(student?.geburtsdatum) === normalizeMgDate(data?.geburtsdatum)],
  ];
}

async function validateRueckmeldungenMgRows(pool, payload) {
  const verfahrenId = Number(payload?.verfahren_id || 0);
  const rundeId = Number(payload?.runde_id || 0);
  const headers = Array.isArray(payload?.headers) ? payload.headers.map(normalizeText) : [];
  const normalizedHeaders = new Set(headers.map(normalizeHeaderName));
  const missingHeaders = MG_REQUIRED_HEADERS.filter((header) => !normalizedHeaders.has(normalizeHeaderName(header)));
  if (missingHeaders.length) {
    const error = new Error(`Erforderliche Spalten fehlen: ${missingHeaders.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }
  const sourceRows = Array.isArray(payload?.rows) ? payload.rows : [];
  if (!sourceRows.length) {
    const error = new Error("Die Excel-Datei enthaelt keine Datenzeilen.");
    error.statusCode = 400;
    throw error;
  }
  if (sourceRows.length > 10000) {
    const error = new Error("Die Excel-Datei enthaelt zu viele Datenzeilen (maximal 10.000). ");
    error.statusCode = 413;
    throw error;
  }

  const [students] = await pool.query(
    `SELECT s.id, s.nachname, s.vorname, DATE_FORMAT(s.geburtsdatum, '%Y-%m-%d') AS geburtsdatum,
            sr.schul_nr AS anmeldeschule_snr, sr.anmeldestatus, s.foerderbedarf, s.empfehlung,
            s.herkunft, sr.abgleich_status, s.herkunftsschule_snr, s.strasse, s.plz, s.ort,
            s.notiz AS bemerkung
       FROM anm_schueler s
       JOIN anm_schueler_runde sr ON sr.schueler_id = s.id AND sr.verfahren_id = s.verfahren_id
      WHERE s.verfahren_id = ? AND sr.runde_id = ?`,
    [verfahrenId, rundeId],
  );
  const studentLookup = new Map();
  for (const student of students || []) {
    const key = buildMgMatchKey(student.nachname, student.vorname, normalizeMgDate(student.geburtsdatum));
    if (!studentLookup.has(key)) studentLookup.set(key, []);
    studentLookup.get(key).push(student);
  }
  const targetSchools = await loadProcedureSchoolLookup(pool, verfahrenId);
  const [allSchools] = await pool.query("SELECT snr, name FROM anm_schulen");
  const schoolLookup = new Map((allSchools || []).map((school) => [normalizeText(school.snr), school]));
  const hasRecommendation = normalizedHeaders.has(normalizeHeaderName(MG_HEADER_KEYS.empfehlung));
  const hasSourceSchool = normalizedHeaders.has(normalizeHeaderName(MG_HEADER_KEYS.snr_abg));
  const sourceMatchKeyCounts = new Map();
  for (const source of sourceRows) {
    const key = buildMgMatchKey(
      getMgRowValue(source, MG_HEADER_KEYS.name),
      getMgRowValue(source, MG_HEADER_KEYS.vorname),
      normalizeMgDate(getMgRowValue(source, MG_HEADER_KEYS.geboren)),
    );
    sourceMatchKeyCounts.set(key, Number(sourceMatchKeyCounts.get(key) || 0) + 1);
  }

  const rows = sourceRows.map((source, index) => {
    const data = {
      anmeldeschule_snr: normalizeText(getMgRowValue(source, MG_HEADER_KEYS.snr_aufn)),
      anmeldeschule_name: normalizeText(getMgRowValue(source, MG_HEADER_KEYS.sname_aufn)),
      nachname: normalizeText(getMgRowValue(source, MG_HEADER_KEYS.name)),
      vorname: normalizeText(getMgRowValue(source, MG_HEADER_KEYS.vorname)),
      geburtsdatum: normalizeMgDate(getMgRowValue(source, MG_HEADER_KEYS.geboren)),
      strasse: normalizeText(getMgRowValue(source, MG_HEADER_KEYS.str)),
      plz: normalizeText(getMgRowValue(source, MG_HEADER_KEYS.plz)),
      ort: normalizeText(getMgRowValue(source, MG_HEADER_KEYS.ort)),
      herkunftsschule_snr: normalizeText(getMgRowValue(source, MG_HEADER_KEYS.snr_abg)),
      herkunftsschule_name: normalizeText(getMgRowValue(source, MG_HEADER_KEYS.sname_abg)),
      bemerkung: normalizeText(getMgRowValue(source, MG_HEADER_KEYS.bemerkung)),
    };
    const recommendation = normalizeImportRecommendation(getMgRowValue(source, MG_HEADER_KEYS.empfehlung));
    const glStatus = normalizeMgGlStatus(getMgRowValue(source, MG_HEADER_KEYS.gl_status));
    const status = normalizeMgStatus(getMgRowValue(source, MG_HEADER_KEYS.status));
    data.empfehlung = recommendation.value;
    data.foerderbedarf = glStatus.value;
    data.anmeldestatus = status;
    data.has_empfehlung = hasRecommendation;
    data.has_herkunftsschule = hasSourceSchool;

    const errors = [];
    const warnings = [];
    if (!data.nachname) errors.push("Nachname fehlt.");
    if (!data.vorname) errors.push("Vorname fehlt.");
    if (!data.geburtsdatum) errors.push("Geburtsdatum ist ungueltig.");
    if (data.nachname && data.vorname && data.geburtsdatum
      && Number(sourceMatchKeyCounts.get(buildMgMatchKey(data.nachname, data.vorname, data.geburtsdatum)) || 0) > 1) {
      errors.push("Schueler ist in der Importdatei mehrfach enthalten.");
    }
    if (!status) errors.push("Ungueltiger Status.");
    if (!glStatus.valid) errors.push("Ungueltiger GL-Status.");
    if (!recommendation.valid) errors.push("Ungueltige Empfehlung.");
    const targetSchool = targetSchools.get(data.anmeldeschule_snr);
    const invalidTargetSchool = !targetSchool || !targetSchool.active;
    const invalidSourceSchool = Boolean(hasSourceSchool && data.herkunftsschule_snr && !schoolLookup.has(data.herkunftsschule_snr));
    if (invalidTargetSchool) errors.push("Ungueltige Schulnummer der aufnehmenden Schule.");
    if (invalidSourceSchool) {
      warnings.push("Ungueltige Schulnummer der abgebenden Schule. Der Datensatz wird importiert; die Schulnummer wird ignoriert.");
    }

    const matches = data.nachname && data.vorname && data.geburtsdatum
      ? (studentLookup.get(buildMgMatchKey(data.nachname, data.vorname, data.geburtsdatum)) || [])
      : [];
    const nearMatches = matches.length === 0 && data.nachname && data.vorname && data.geburtsdatum
      ? (students || []).filter((student) => getMgMatchingFields(student, data).filter(([, fieldMatches]) => fieldMatches).length === 2)
      : [];
    let classification = "VALIDIERUNGSFEHLER";
    if (matches.length > 1 || nearMatches.length > 1) {
      classification = "MEHRDEUTIG";
      errors.push("Mehrdeutiger Treffer.");
    } else if (matches.length === 0 && nearMatches.length === 1) {
      classification = "ABWEICHUNG";
      const differingFields = getMgMatchingFields(nearMatches[0], data)
        .filter(([, fieldMatches]) => !fieldMatches)
        .map(([field]) => field);
      warnings.push(`Moeglicher Schreibfehler bei ${differingFields.join(", ")}. Datensatz wird nicht importiert.`);
    } else if (matches.length === 0 && nearMatches.length === 0 && errors.length === 0) {
      classification = "NEU";
    } else if (errors.length === 0) {
      classification = "OK";
    }
    const student = matches.length === 1 ? matches[0] : null;
    const displayedStudent = student || (nearMatches.length === 1 ? nearMatches[0] : null);
    const abgleichStatus = student && hasPoolAbgleich(student) ? "Pool + Anm" : "Nur Anmeldung";
    const storedRecommendation = normalizeText(student?.empfehlung).toUpperCase();
    const recommendationMismatch = Boolean(
      student
      && recommendation.valid
      && importRecommendationDiffers(data.empfehlung, storedRecommendation, hasRecommendation)
    );
    if (recommendationMismatch) {
      warnings.push(`Empfehlung weicht ab (Datei: ${data.empfehlung || "-"}, DB: ${storedRecommendation || "-"}). Der DB-Wert bleibt erhalten.`);
    }
    if (student && data.herkunftsschule_snr && normalizeText(student.herkunftsschule_snr)
      && normalizeText(student.herkunftsschule_snr) !== data.herkunftsschule_snr) {
      warnings.push("SNr-Abg. weicht von der hinterlegten Herkunftsschule ab.");
    }
    return {
      row_number: Number(source?.__row_number || index + 2),
      classification,
      status: ["OK", "NEU"].includes(classification) ? "ok" : classification === "ABWEICHUNG" ? "warnung" : "fehler",
      errors,
      warnings,
      invalid_school_number: invalidTargetSchool || invalidSourceSchool,
      invalid_target_school_number: invalidTargetSchool,
      invalid_source_school_number: invalidSourceSchool,
      recommendation_mismatch: recommendationMismatch,
      abgleich_status: abgleichStatus,
      exact_match: Boolean(student),
      data,
      matched_student: displayedStudent ? {
        id: Number(displayedStudent.id), nachname: displayedStudent.nachname, vorname: displayedStudent.vorname,
        geburtsdatum: displayedStudent.geburtsdatum, anmeldeschule_snr: displayedStudent.anmeldeschule_snr,
        anmeldestatus: displayedStudent.anmeldestatus, foerderbedarf: Number(displayedStudent.foerderbedarf || 0), empfehlung: displayedStudent.empfehlung,
      } : null,
    };
  });

  const openCaseKeys = new Set();
  for (const row of rows) {
    const studentId = Number(row.matched_student?.id || 0);
    if (!studentId || !row.exact_match) {
      if (row.classification === "NEU" && row.invalid_source_school_number) {
        openCaseKeys.add(`NEU-${row.row_number}:HERKUNFTSFEHLER`);
      }
      continue;
    }
    if (row.invalid_target_school_number) openCaseKeys.add(`${studentId}:ANMELDEFEHLER`);
    if (row.invalid_source_school_number) openCaseKeys.add(`${studentId}:HERKUNFTSFEHLER`);
    if (row.recommendation_mismatch) openCaseKeys.add(`${studentId}:EMPFEHLUNG_ABWEICHUNG`);
  }
  return {
    rows,
    summary: {
      total: rows.length,
      importable: rows.filter((row) => ["OK", "NEU"].includes(row.classification)).length,
      new_students: rows.filter((row) => row.classification === "NEU").length,
      possible_typos: rows.filter((row) => row.classification === "ABWEICHUNG").length,
      not_found: rows.filter((row) => row.classification === "NICHT_GEFUNDEN").length,
      ambiguous: rows.filter((row) => row.classification === "MEHRDEUTIG").length,
      validation_errors: rows.filter((row) => row.classification === "VALIDIERUNGSFEHLER").length,
      invalid_school_numbers: rows.filter((row) => row.invalid_school_number).length,
      open_case_candidates: openCaseKeys.size,
      warnings: rows.filter((row) => row.warnings.length > 0).length,
    },
  };
}

async function updateRueckmeldungMgStudent(connection, row) {
  const data = row.data;
  const studentId = Number(row.matched_student.id);
  await updateStudentMaster(connection, studentId, {
    nachname: data.nachname, vorname: data.vorname, geburtsdatum: data.geburtsdatum,
    strasse: data.strasse, plz: data.plz, ort: data.ort, bemerkung: data.bemerkung,
    foerderbedarf: data.foerderbedarf,
    ...(data.has_empfehlung && !row.recommendation_mismatch ? { empfehlung: data.empfehlung } : {}),
    ...(data.has_herkunftsschule && data.herkunftsschule_snr && !row.invalid_source_school_number
      ? { herkunftsschule_snr: data.herkunftsschule_snr } : {}),
  });
  await upsertRoundState(connection, {
    verfahren_id: row.verfahren_id,
    schueler_id: studentId,
    runde_id: row.runde_id,
    schul_nr: data.anmeldeschule_snr,
    anmeldestatus: data.anmeldestatus,
    abgleich_status: row.abgleich_status,
  });
  return { action: "UPDATE", id: studentId };
}

async function insertRueckmeldungMgStudent(connection, verfahrenId, rundeId, row) {
  const data = row.data;
  const resolved = await resolveStudent(connection, {
    verfahren_id: verfahrenId, herkunft: "Anmeldung", ...data,
    notiz: data.bemerkung,
    ...(data.has_herkunftsschule && !row.invalid_source_school_number
      ? { herkunftsschule_snr: data.herkunftsschule_snr } : {}),
  });
  await upsertRoundState(connection, {
    verfahren_id: verfahrenId, schueler_id: resolved.student.id, runde_id: rundeId,
    schul_nr: data.anmeldeschule_snr, anmeldestatus: data.anmeldestatus,
    teilnahmestatus: "Aktiv", abgleich_status: row.abgleich_status,
  });
  return { action: resolved.created ? "INSERT" : "UPDATE", id: Number(resolved.student.id) };
}

async function importRueckmeldungMgStudent(connection, verfahrenId, rundeId, row) {
  row.verfahren_id = verfahrenId;
  row.runde_id = rundeId;
  if (row.classification === "NEU") {
    return insertRueckmeldungMgStudent(connection, verfahrenId, rundeId, row);
  }
  return updateRueckmeldungMgStudent(connection, row);
}

function buildPoolImportSummary(rows) {
  const totalRows = Number(rows.length || 0);
  const selectedRows = rows.filter((row) => row.selected && row.status !== "fehler").length;
  const skippedRows = rows.filter((row) => row.status !== "fehler" && !row.selected).length;
  const errorRows = rows.filter((row) => row.status === "fehler").length;
  const newRows = rows.filter((row) => row.selected && row.status !== "fehler" && row.import_action === "NEU").length;
  const updateRows = rows.filter((row) => row.selected && row.status !== "fehler" && row.import_action === "UPDATE").length;
  return {
    Gesamtzeilen: totalRows,
    Ausgewaehlt: selectedRows,
    Uebersprungen: skippedRows,
    Fehlerzeilen: errorRows,
    Neue_Datensaetze: newRows,
    Zu_aktualisieren: updateRows,
  };
}

function getPoolImportComparisonFieldKeys(fieldDefinitions, mapping) {
  const mappedFields = new Set(
    Object.entries(mapping || {})
      .filter(([, value]) => normalizeText(value))
      .map(([key]) => key),
  );

  return fieldDefinitions
    .filter((field) => {
      if (!field?.key) return false;
      if (field.readOnly) return true;
      return mappedFields.has(field.key);
    })
    .map((field) => field.key);
}

async function validatePoolImportRows(pool, payload) {
  const verfahrenId = Number(payload?.verfahren_id || 0);
  const rundeId = Number(payload?.runde_id || 0);
  const sourceArt = normalizeText(payload?.source_art || payload?.herkunft_art).toUpperCase() || "POOL";
  const csvRows = Array.isArray(payload?.csv_rows) ? payload.csv_rows : [];
  const mapping = payload?.mapping || {};
  const schuelerColumns = await loadTableColumns(pool, "anm_schueler");
  const verfahrenstyp = await loadProcedureType(pool, verfahrenId);
  const fieldDefinitions = getPoolImportFieldDefinitions(schuelerColumns, verfahrenstyp);
  const comparisonFieldKeys = new Set(getPoolImportComparisonFieldKeys(fieldDefinitions, mapping));
  const schoolRole = verfahrenstyp === "SEK1" ? "Quellschulen" : "Zielschulen";
  const schoolBySnr = await loadProcedureSchoolLookupByRole(pool, verfahrenId, schoolRole);
  const existingSourceSchoolSelect = "COALESCE(NULLIF(TRIM(s.herkunftsschule_snr), ''), NULLIF(TRIM(sr.schul_nr), ''), '') AS source_school_snr";
  const empfehlungByCode = schuelerColumns.has("empfehlung")
    ? await loadCatalogByCode(pool, "anm_kat_empfehlung")
    : new Map();

  const ids = csvRows
    .map((row) => normalizeText(row?.record?.[mapping.externe_schueler_id] || ""))
    .filter(Boolean);
  const [existingRows] = ids.length
    ? await pool.query(
      `
      SELECT
        s.id,
        x.externe_id AS externe_schueler_id,
        x.herkunft_snr_norm,
        COALESCE(s.vorname, '') AS vorname,
        COALESCE(s.nachname, '') AS nachname,
        DATE_FORMAT(s.geburtsdatum, '%Y-%m-%d') AS geburtsdatum,
        ${existingSourceSchoolSelect},
        COALESCE(s.strasse, '') AS strasse,
        COALESCE(s.plz, '') AS plz,
        COALESCE(s.ort, '') AS ort,
        COALESCE(s.foerderbedarf, '') AS foerderbedarf,
        COALESCE(s.zieldifferent, 0) AS zieldifferent,
        COALESCE(s.ef, 0) AS ef,
        COALESCE(s.empfehlung, '') AS empfehlung,
        COALESCE(sr.teilnahmestatus, '') AS teilnahmestatus,
        COALESCE(s.quell_jahrgang, '') AS quell_jahrgang,
        COALESCE(s.notiz, '') AS bemerkung
      FROM anm_schueler_externe_id x
      JOIN anm_schueler s ON s.id = x.schueler_id
      LEFT JOIN anm_schueler_runde sr
        ON sr.schueler_id = s.id AND sr.verfahren_id = s.verfahren_id AND sr.runde_id = ?
      WHERE s.verfahren_id = ?
        AND x.herkunft_art = ?
        AND x.externe_id IN (?)
      `,
      [rundeId, verfahrenId, sourceArt, ids],
    )
    : [[]];
  const existingByIdentity = new Map((existingRows || []).map((row) => [
    `${normalizeText(row?.herkunft_snr_norm)}\u0000${normalizeText(row?.externe_schueler_id)}`,
    row,
  ]));

  const duplicateCountById = new Map();
  for (const id of ids) {
    duplicateCountById.set(id, Number(duplicateCountById.get(id) || 0) + 1);
  }

  const rows = await Promise.all(csvRows.map(async (row) => {
    const record = row?.record || {};
    const rowNumber = Number(row?.row_number || 0);
    const recommendation = normalizeImportRecommendation(record?.[mapping.empfehlung] || "");
    const data = {
      source_school_snr: normalizeText(record?.[mapping.source_school_snr] || ""),
      externe_schueler_id: normalizeText(record?.[mapping.externe_schueler_id] || ""),
      vorname: normalizeText(record?.[mapping.vorname] || ""),
      nachname: normalizeText(record?.[mapping.nachname] || ""),
      geburtsdatum: normalizeDate(record?.[mapping.geburtsdatum] || ""),
      strasse: normalizeText(record?.[mapping.strasse] || ""),
      plz: normalizeText(record?.[mapping.plz] || ""),
      ort: normalizeText(record?.[mapping.ort] || ""),
      foerderbedarf: normalizeText(record?.[mapping.foerderbedarf] || ""),
      zieldifferent: normalizeText(record?.[mapping.zieldifferent] || ""),
      ef: normalizeText(record?.[mapping.ef] || ""),
      empfehlung: recommendation.value || "",
      teilnahmestatus: normalizeText(record?.[mapping.teilnahmestatus] || ""),
      quell_jahrgang: normalizeText(record?.[mapping.quell_jahrgang] || ""),
      bemerkung: normalizeText(record?.[mapping.bemerkung] || ""),
    };

    const errors = [];
    const warnings = [];

    const requiresSourceSchool = verfahrenstyp === "SEK1";
    if (requiresSourceSchool && !data.source_school_snr) errors.push("Quell-SNR fehlt.");
    if (data.source_school_snr && !schoolBySnr.has(data.source_school_snr)) {
      errors.push("Quell-SNR gehoert nicht zu einer Schule im Verfahren.");
    }
    if (data.externe_schueler_id && Number(duplicateCountById.get(data.externe_schueler_id) || 0) > 1) {
      errors.push("Import-ID ist in der CSV doppelt.");
    }
    if (!data.vorname) errors.push("Vorname fehlt.");
    if (!data.nachname) errors.push("Nachname fehlt.");
    if (!data.geburtsdatum) errors.push("Geburtsdatum fehlt.");
    if (data.geburtsdatum && !isValidIsoDate(data.geburtsdatum)) {
      errors.push("Geburtsdatum ist ungueltig.");
    }
    if (!isValidImportBoolean(data.foerderbedarf)) errors.push("LE ist ungueltig.");
    if (!isValidImportBoolean(data.zieldifferent)) errors.push("ZD ist ungueltig.");
    if (!isValidImportBoolean(data.ef)) errors.push("EF ist ungueltig.");
    if (data.teilnahmestatus && !["Aktiv", "Wegzug", "Abgemeldet", "Verstorben"].includes(data.teilnahmestatus)) {
      errors.push("Teilnahmestatus ist ungueltig.");
    }
    if (!recommendation.valid || (data.empfehlung && empfehlungByCode.size > 0 && !empfehlungByCode.has(normalizeTextLower(data.empfehlung)))) {
      errors.push("Empfehlung ist unbekannt.");
    }
    let existing = null;
    if (data.externe_schueler_id) {
      try {
        const identity = normalizeExternalIdentity({
          herkunft_art: sourceArt,
          herkunft_snr: data.source_school_snr,
          externe_id: data.externe_schueler_id,
        });
        existing = existingByIdentity.get(`${normalizeText(identity?.herkunft_snr)}\u0000${data.externe_schueler_id}`) || null;
      } catch (error) {
        errors.push(error?.message || "Externe Identitaet ist ungueltig.");
      }
    }
    const personMatches = !existing && data.vorname && data.nachname && isValidIsoDate(data.geburtsdatum)
      ? await findStudentsByPersonData(pool, {
        verfahren_id: verfahrenId,
        vorname: data.vorname,
        nachname: data.nachname,
        geburtsdatum: data.geburtsdatum,
      })
      : [];
    if (personMatches.length > 1) {
      errors.push(`Personendaten sind nicht eindeutig (${personMatches.length} Treffer).`);
    } else if (personMatches.length === 1) {
      existing = {
        ...personMatches[0],
        source_school_snr: personMatches[0]?.herkunftsschule_snr,
      };
    }
    const umlautMatches = !existing && data.vorname && data.nachname && isValidIsoDate(data.geburtsdatum)
      ? await findStudentsByUmlautPersonData(pool, {
        verfahren_id: verfahrenId,
        vorname: data.vorname,
        nachname: data.nachname,
        geburtsdatum: data.geburtsdatum,
      })
      : [];
    const umlautMatch = umlautMatches.length === 1;
    if (umlautMatches.length > 1) {
      errors.push(`Umlaut-Matching ist nicht eindeutig (${umlautMatches.length} Treffer).`);
    } else if (umlautMatch) {
      existing = {
        ...umlautMatches[0],
        source_school_snr: umlautMatches[0]?.herkunftsschule_snr,
      };
      const existingName = [normalizeText(existing?.nachname), normalizeText(existing?.vorname)].filter(Boolean).join(", ") || "-";
      const importName = [data.nachname, data.vorname].filter(Boolean).join(", ") || "-";
      warnings.push(`Möglicher vorhandener Datensatz durch Umlaut-Matching erkannt. Bisheriger Name: ${existingName}; Importname: ${importName}. Import ist zunächst deaktiviert und muss bewusst ausgewählt werden.`);
    }
    const hasUnknownSchoolError = errors.includes("Quell-SNR gehoert nicht zu einer Schule im Verfahren.");
    if (existing && hasUnknownSchoolError) {
      const index = errors.indexOf("Quell-SNR gehoert nicht zu einer Schule im Verfahren.");
      if (index >= 0) errors.splice(index, 1);
      warnings.push("Anmeldeschule existiert nicht im Verfahren. Offener Fall wird beim Import erzeugt.");
    }
    let importAction = "NEU";
    let changedFields = [];
    if (existing) {
      const comparisons = [
        {
          field: "source_school_snr",
          matches: normalizeText(existing?.source_school_snr) === data.source_school_snr,
        },
        {
          field: "externe_schueler_id",
          matches: normalizeText(existing?.externe_schueler_id) === data.externe_schueler_id,
        },
        {
          field: "vorname",
          matches: normalizeText(existing?.vorname) === data.vorname,
        },
        {
          field: "nachname",
          matches: normalizeText(existing?.nachname) === data.nachname,
        },
        {
          field: "geburtsdatum",
          matches: normalizeDate(existing?.geburtsdatum) === normalizeDate(data.geburtsdatum),
        },
      ];

      const filteredComparisons = comparisons.filter((entry) => comparisonFieldKeys.has(entry.field));
      if (comparisonFieldKeys.has("strasse") && data.strasse) filteredComparisons.push({ field: "strasse", matches: normalizeText(existing?.strasse) === data.strasse });
      if (comparisonFieldKeys.has("plz") && data.plz) filteredComparisons.push({ field: "plz", matches: normalizeText(existing?.plz) === data.plz });
      if (comparisonFieldKeys.has("ort") && data.ort) filteredComparisons.push({ field: "ort", matches: normalizeText(existing?.ort) === data.ort });
      if (comparisonFieldKeys.has("foerderbedarf")) filteredComparisons.push({ field: "foerderbedarf", matches: normalizeText(existing?.foerderbedarf) === data.foerderbedarf });
      if (comparisonFieldKeys.has("zieldifferent")) filteredComparisons.push({ field: "zieldifferent", matches: Number(existing?.zieldifferent || 0) === normalizeBoolean(data.zieldifferent) });
      if (comparisonFieldKeys.has("ef")) filteredComparisons.push({ field: "ef", matches: Number(existing?.ef || 0) === normalizeBoolean(data.ef) });
      if (comparisonFieldKeys.has("empfehlung")) filteredComparisons.push({ field: "empfehlung", matches: normalizeText(existing?.empfehlung) === data.empfehlung });
      if (comparisonFieldKeys.has("teilnahmestatus")) filteredComparisons.push({ field: "teilnahmestatus", matches: normalizeText(existing?.teilnahmestatus) === data.teilnahmestatus });
      if (comparisonFieldKeys.has("quell_jahrgang")) filteredComparisons.push({ field: "quell_jahrgang", matches: normalizeText(existing?.quell_jahrgang) === data.quell_jahrgang });
      if (comparisonFieldKeys.has("bemerkung")) filteredComparisons.push({ field: "bemerkung", matches: normalizeText(existing?.bemerkung) === data.bemerkung });

      changedFields = filteredComparisons.filter((entry) => !entry.matches).map((entry) => entry.field);
      const unchanged = changedFields.length === 0;
      importAction = unchanged ? "VORHANDEN" : "UPDATE";
    }
    const status = errors.length > 0 ? "fehler" : warnings.length > 0 ? "warnung" : "gueltig";

    return {
      row_number: rowNumber,
      selected: errors.length === 0 && importAction !== "VORHANDEN" && !umlautMatch,
      import_action: importAction,
      status,
      errors,
      warnings,
      changed_fields: changedFields,
      data,
    };
  }));

  return {
    rows,
    summary: buildPoolImportSummary(rows),
  };
}

function buildAnmeldungenImportSummary(rows) {
  const selectedRows = rows.filter((row) => row.selected && row.status !== "fehler");
  return {
    Gesamtzeilen: Number(rows.length || 0),
    Ausgewaehlt: selectedRows.length,
    Uebersprungen: rows.filter((row) => row.status !== "fehler" && !row.selected).length,
    Fehlerzeilen: rows.filter((row) => row.status === "fehler").length,
    Neue_Datensaetze: selectedRows.filter((row) => row.import_action === "NEU").length,
    Updates: selectedRows.filter((row) => row.import_action === "UPDATE").length,
    Pool_Treffer: selectedRows.filter((row) => row.pool_match).length,
    Nur_Anmeldung_Faelle: selectedRows.filter((row) => !row.pool_match).length,
  };
}

async function validateAnmeldungenImportRows(pool, payload) {
  const verfahrenId = Number(payload?.verfahren_id || 0);
  const rundeId = Number(payload?.runde_id || 0);
  const csvRows = Array.isArray(payload?.csv_rows) ? payload.csv_rows : [];
  const mapping = payload?.mapping || {};
  const statusMapping = payload?.status_mapping || {};
  const globalSchulNr = normalizeText(payload?.global_anmeldeschule_snr);
  const mappedFields = new Set(
    Object.entries(mapping)
      .filter(([, value]) => normalizeText(value))
      .map(([key]) => key),
  );
  const schoolBySnr = await loadProcedureSchoolLookup(pool, verfahrenId);
  const targetStatuses = new Set(getAnmeldestatusTargetValues().map((value) => normalizeTextLower(value)));

  const ids = csvRows
    .map((row) => normalizeText(row?.record?.[mapping.externe_schueler_id] || ""))
    .filter(Boolean);
  const duplicateCountById = new Map();
  for (const id of ids) {
    duplicateCountById.set(id, Number(duplicateCountById.get(id) || 0) + 1);
  }

  const rows = [];
  for (const row of csvRows) {
    const record = row?.record || {};
    const rowNumber = Number(row?.row_number || 0);
    const rawStatus = normalizeText(record?.[mapping.anmeldestatus] || "");
    const mappedStatus = normalizeText(statusMapping[rawStatus] || "");
    const schulNr = normalizeText(record?.[mapping.anmeldeschule_snr] || "") || globalSchulNr;
    const data = {
      externe_schueler_id: normalizeText(record?.[mapping.externe_schueler_id] || ""),
      anmeldeschule_snr: schulNr,
      anmeldestatus: mappedStatus,
      anmeldestatus_raw: rawStatus,
      vorname: normalizeText(record?.[mapping.vorname] || ""),
      nachname: normalizeText(record?.[mapping.nachname] || ""),
      geburtsdatum: normalizeDate(record?.[mapping.geburtsdatum] || ""),
      empfehlung: normalizeText(record?.[mapping.empfehlung] || ""),
      foerderbedarf: normalizeText(record?.[mapping.foerderbedarf] || ""),
      foerder_id: normalizeText(record?.[mapping.foerder_id] || ""),
      zieldifferent: normalizeText(record?.[mapping.zieldifferent] || ""),
      bemerkung: normalizeText(record?.[mapping.bemerkung] || ""),
      strasse: normalizeText(record?.[mapping.strasse] || ""),
      plz: normalizeText(record?.[mapping.plz] || ""),
      ort: normalizeText(record?.[mapping.ort] || ""),
    };

    const errors = [];
    const warnings = [];
    if (data.externe_schueler_id && Number(duplicateCountById.get(data.externe_schueler_id) || 0) > 1) errors.push("Externe Schueler-ID ist in der CSV doppelt.");
    if (!data.anmeldeschule_snr) errors.push("anmeldeschule_snr fehlt.");
    if (data.anmeldeschule_snr && !schoolBySnr.has(data.anmeldeschule_snr)) errors.push("anmeldeschule_snr existiert nicht im Verfahren.");
    if (!data.anmeldestatus_raw) errors.push("Status aus CSV fehlt.");
    if (data.anmeldestatus_raw && !mappedStatus) errors.push("Statuswert ist noch nicht zugeordnet.");
    if (mappedStatus && !targetStatuses.has(normalizeTextLower(mappedStatus))) errors.push("Zielstatus ist ungueltig.");
    if (!data.vorname) errors.push("Vorname fehlt.");
    if (!data.nachname) errors.push("Nachname fehlt.");
    if (!data.geburtsdatum) errors.push("Geburtsdatum fehlt.");
    if (data.geburtsdatum && !isValidIsoDate(data.geburtsdatum)) errors.push("Geburtsdatum ist ungueltig.");
    if (!isValidImportBoolean(data.foerderbedarf)) errors.push("Foerderbedarf ist ungueltig.");
    if (!isValidImportBoolean(data.zieldifferent)) errors.push("Zieldifferent ist ungueltig.");

    let existing = data.externe_schueler_id
      ? await findExistingSchuelerRecord(pool, verfahrenId, rundeId, data.externe_schueler_id, data.anmeldeschule_snr)
      : null;
    const umlautMatches = !existing && data.vorname && data.nachname && isValidIsoDate(data.geburtsdatum)
      ? await findStudentsByUmlautPersonData(pool, {
        verfahren_id: verfahrenId,
        vorname: data.vorname,
        nachname: data.nachname,
        geburtsdatum: data.geburtsdatum,
      })
      : [];
    const umlautMatch = umlautMatches.length === 1;
    if (umlautMatches.length > 1) {
      errors.push(`Umlaut-Matching ist nicht eindeutig (${umlautMatches.length} Treffer).`);
    } else if (umlautMatch) {
      [existing] = umlautMatches;
      warnings.push("Möglicher vorhandener Datensatz durch Umlaut-Matching erkannt. Import ist zunächst deaktiviert und muss bewusst ausgewählt werden.");
    }
    const hasUnknownSchoolError = errors.includes("anmeldeschule_snr existiert nicht im Verfahren.");
    if (existing && hasUnknownSchoolError) {
      const index = errors.indexOf("anmeldeschule_snr existiert nicht im Verfahren.");
      if (index >= 0) errors.splice(index, 1);
      warnings.push("anmeldeschule_snr existiert nicht im Verfahren. Offener Fall wird beim Import erzeugt.");
    }
    const isInitialSchoolAssignment = existing && !normalizeText(existing?.anmeldeschule_snr) && Boolean(data.anmeldeschule_snr);
    if (errors.includes("anmeldeschule_snr existiert nicht im Verfahren.") && isInitialSchoolAssignment) {
      const index = errors.indexOf("anmeldeschule_snr existiert nicht im Verfahren.");
      if (index >= 0) errors.splice(index, 1);
    }
    const poolMatch = hasPoolAbgleich(existing);
    let importAction = existing ? "UPDATE" : "NEU";
    let changedFields = [];
    if (existing) {
      const comparisons = [
        { field: "externe_schueler_id", matches: normalizeText(existing?.externe_schueler_id) === data.externe_schueler_id },
        { field: "anmeldeschule_snr", matches: normalizeText(existing?.anmeldeschule_snr) === data.anmeldeschule_snr },
        { field: "anmeldestatus", matches: normalizeTextLower(existing?.anmeldestatus) === normalizeTextLower(data.anmeldestatus) },
        { field: "vorname", matches: normalizeText(existing?.vorname) === data.vorname },
        { field: "nachname", matches: normalizeText(existing?.nachname) === data.nachname },
        { field: "geburtsdatum", matches: normalizeDate(existing?.geburtsdatum) === normalizeDate(data.geburtsdatum) },
      ];
      if (mappedFields.has("empfehlung")) comparisons.push({ field: "empfehlung", matches: normalizeText(existing?.empfehlung) === data.empfehlung });
      if (mappedFields.has("foerderbedarf") && normalizeText(data.foerderbedarf) !== "") {
        comparisons.push({ field: "foerderbedarf", matches: Number(existing?.foerderbedarf || 0) === normalizeBoolean(data.foerderbedarf) });
      }
      if (mappedFields.has("foerder_id")) comparisons.push({ field: "foerder_id", matches: normalizeText(existing?.foerder_id) === data.foerder_id });
      if (mappedFields.has("zieldifferent") && normalizeText(data.zieldifferent) !== "") {
        comparisons.push({ field: "zieldifferent", matches: Number(existing?.zieldifferent || 0) === normalizeBoolean(data.zieldifferent) });
      }
      if (mappedFields.has("bemerkung")) comparisons.push({ field: "bemerkung", matches: normalizeText(existing?.bemerkung) === data.bemerkung });
      if (mappedFields.has("strasse") && data.strasse) comparisons.push({ field: "strasse", matches: normalizeText(existing?.strasse) === data.strasse });
      if (mappedFields.has("plz") && data.plz) comparisons.push({ field: "plz", matches: normalizeText(existing?.plz) === data.plz });
      if (mappedFields.has("ort") && data.ort) comparisons.push({ field: "ort", matches: normalizeText(existing?.ort) === data.ort });

      changedFields = comparisons.filter((entry) => !entry.matches).map((entry) => entry.field);
      if (changedFields.length === 0) importAction = "VORHANDEN";
    }
    const abgleichStatus = existing ? "Pool + Anm" : "Nur Anmeldung";
    const status = errors.length > 0 ? "fehler" : warnings.length > 0 ? "warnung" : "gueltig";
    rows.push({
      row_number: rowNumber,
      selected: errors.length === 0 && importAction !== "VORHANDEN" && !umlautMatch,
      import_action: importAction,
      pool_match: poolMatch,
      abgleich_status: abgleichStatus,
      status,
      errors,
      warnings,
      changed_fields: changedFields,
      existing_data: existing
        ? {
            anmeldestatus: normalizeText(existing?.anmeldestatus),
            anmeldeschule_snr: normalizeText(existing?.anmeldeschule_snr),
            vorname: normalizeText(existing?.vorname),
            nachname: normalizeText(existing?.nachname),
            geburtsdatum: normalizeDate(existing?.geburtsdatum),
          }
        : null,
      data,
    });
  }

  return {
    rows,
    summary: buildAnmeldungenImportSummary(rows),
  };
}

async function upsertAnmeldungenWizardImportV3(connection, payload) {
  const verfahrenId = Number(payload?.verfahren_id || 0);
  const rundeId = Number(payload?.runde_id || 0);
  const row = payload?.row || {};
  const schoolSnr = normalizeText(row?.anmeldeschule_snr || row?.snr || row?.source_school_snr);
  const externalId = normalizeText(row?.externe_schueler_id);
  const existingByIdentity = externalId
    ? await findStudentByExternalId(connection, {
      herkunft_art: "SCHULE", herkunft_snr: schoolSnr || null, externe_id: externalId,
    })
    : null;
  const resolved = await resolveStudent(connection, {
    verfahren_id: verfahrenId,
    herkunft: normalizeText(payload?.herkunft) || "Anmeldung",
    vorname: row.vorname,
    nachname: row.nachname,
    geburtsdatum: row.geburtsdatum,
    strasse: row.strasse,
    plz: row.plz,
    ort: row.ort,
    foerderbedarf: normalizeBoolean(row.foerderbedarf),
    zieldifferent: normalizeBoolean(row.zieldifferent),
    empfehlung: row.empfehlung,
    foerder_id: row.foerder_id,
    notiz: row.bemerkung ?? row.notiz,
    external_identity: externalId ? {
      herkunft_art: "SCHULE", herkunft_snr: schoolSnr || null, externe_id: externalId,
    } : null,
  });
  await updateStudentMaster(connection, resolved.student.id, {
    vorname: row.vorname, nachname: row.nachname, geburtsdatum: row.geburtsdatum,
    ...pickNonEmptyAddressFields(row),
    foerderbedarf: normalizeBoolean(row.foerderbedarf),
    zieldifferent: normalizeBoolean(row.zieldifferent), empfehlung: row.empfehlung,
    foerder_id: row.foerder_id, notiz: row.bemerkung ?? row.notiz,
  });
  const [roundRows] = await connection.query(
    `SELECT abgleich_status FROM anm_schueler_runde
      WHERE verfahren_id = ? AND schueler_id = ? AND runde_id = ? LIMIT 1`,
    [verfahrenId, resolved.student.id, rundeId],
  );
  const poolMatch = hasPoolAbgleich(roundRows?.[0]) || normalizeTextLower(resolved.student.herkunft) === "pool";
  await upsertRoundState(connection, {
    verfahren_id: verfahrenId, schueler_id: resolved.student.id, runde_id: rundeId,
    schul_nr: schoolSnr || null,
    anmeldestatus: normalizeText(row.anmeldestatus) || "Ohne",
    teilnahmestatus: normalizeText(row.teilnahmestatus) || "Aktiv",
    abgleich_status: poolMatch ? "Pool + Anm" : "Nur Anmeldung",
  });
  const schoolBySnr = await loadProcedureSchoolLookup(connection, verfahrenId);
  const unknownProcedureSchool = Boolean(schoolSnr) && !schoolBySnr.has(schoolSnr);
  const unknownSchoolCase = unknownProcedureSchool
    ? await ensureOpenCaseForUnknownProcedureSchool(connection, {
      verfahren_id: verfahrenId, schueler_id: Number(resolved.student.id),
    })
    : { created: false, updated: false };
  return {
    action: resolved.created ? "INSERT" : "UPDATE",
    pool_match: poolMatch,
    id: Number(resolved.student.id),
    school_change_case: false,
    unknown_school_case: Boolean(unknownSchoolCase.created || unknownSchoolCase.updated),
    matched_by: existingByIdentity ? "EXTERNAL_ID" : resolved.matchedBy,
  };
}

async function upsertAnmSchuelerCsvImportV3(connection, payload) {
  const row = payload?.row || {};
  const importArt = normalizeTextLower(payload?.import_art) || "pool";
  const normalizedRow = {
    ...row,
    snr: row.source_school_snr || row.snr,
    notiz: row.bemerkung ?? row.notiz,
  };
  if (importArt !== "pool") {
    return upsertAnmeldungenWizardImportV3(connection, {
      ...payload, row: normalizedRow, herkunft: "Anmeldung",
    });
  }
  const result = await upsertStudent(connection, {
    ...payload,
    source_art: normalizeText(payload?.source_art || payload?.herkunft_art).toUpperCase() || "POOL",
    row: normalizedRow,
  });
  if (result.conflict) {
    const error = new Error("Mehrdeutiger Treffer bei den Personendaten.");
    error.statusCode = 409;
    throw error;
  }
  return { action: result.updated ? "UPDATE" : "INSERT", id: result.id, unknown_school_case: false };
}

async function loadPoolSchuelerRows(pool, verfahrenId, rundeId) {
  const filters = ["s.verfahren_id = ?", "sr.abgleich_status IN ('Nur Pool', 'Pool + Anm')"];
  const params = [verfahrenId];
  if (rundeId) { filters.push("sr.runde_id = ?"); params.push(rundeId); }
  const whereClause = `WHERE ${filters.join(" AND ")}`;
  const [rows] = await pool.query(
    `
    SELECT
      COALESCE(s.id, 0) AS interne_schueler_id,
      COALESCE(s.vorname, '') AS vorname,
      COALESCE(s.nachname, '') AS nachname,
      DATE_FORMAT(s.geburtsdatum, '%Y-%m-%d') AS geburtsdatum,
      COALESCE(s.foerderbedarf, '') AS foerderbedarf,
      COALESCE(s.foerder_id, '') AS foerder_id,
      '' AS foerder_label,
      COALESCE(s.zieldifferent, 0) AS zieldifferent,
      COALESCE(s.ef, 0) AS ef,
      NULLIF(TRIM(s.herkunftsschule_snr), '') AS herkunftsschule_snr,
      COALESCE(x.externe_id, '') AS externe_schueler_id,
      COALESCE(s.herkunft, '') AS herkunft,
      COALESCE(sr.abgleich_status, '') AS abgleich_status,
      COALESCE(sr.anmeldestatus, '') AS anmeldestatus,
      COALESCE(sr.teilnahmestatus, '') AS teilnahmestatus,
      NULLIF(TRIM(sr.schul_nr), '') AS schulnummer,
      COALESCE(s.strasse, '') AS strasse,
      COALESCE(s.plz, '') AS plz,
      COALESCE(s.ort, '') AS ort,
      COALESCE(s.notiz, '') AS bemerkung,
      COALESCE(NULLIF(TRIM(src.name), ''), '') AS schule
    FROM anm_schueler s
    JOIN anm_schueler_runde sr ON sr.schueler_id = s.id AND sr.verfahren_id = s.verfahren_id
    LEFT JOIN (
      SELECT schueler_id, MIN(NULLIF(TRIM(externe_id), '')) AS externe_id
      FROM anm_schueler_externe_id
      WHERE NULLIF(TRIM(externe_id), '') IS NOT NULL
      GROUP BY schueler_id
      HAVING COUNT(DISTINCT NULLIF(TRIM(externe_id), '')) = 1
    ) x ON x.schueler_id = s.id
    LEFT JOIN anm_schulen src
      ON src.snr = COALESCE(NULLIF(TRIM(s.herkunftsschule_snr), ''), NULLIF(TRIM(sr.schul_nr), ''))
    ${whereClause}
    ORDER BY COALESCE(s.nachname, '') ASC, COALESCE(s.vorname, '') ASC, COALESCE(s.id, 0) ASC
    `,
    params,
  );

  return (rows || []).map((row) => ({
    interne_schueler_id: Number(row?.interne_schueler_id || 0),
    externe_schueler_id: normalizeText(row?.externe_schueler_id),
    vorname: normalizeText(row?.vorname),
    nachname: normalizeText(row?.nachname),
    geburtsdatum: row?.geburtsdatum || null,
    foerderbedarf: normalizeText(row?.foerderbedarf),
    foerder_id: normalizeText(row?.foerder_id),
    foerder_label: normalizeText(row?.foerder_label),
    zieldifferent: normalizeText(row?.zieldifferent),
    ef: normalizeText(row?.ef),
    herkunftsschule_snr: normalizeText(row?.herkunftsschule_snr),
    herkunft: normalizeText(row?.herkunft),
    abgleich_status: normalizeText(row?.abgleich_status),
    anmeldestatus: normalizeText(row?.anmeldestatus),
    teilnahmestatus: normalizeText(row?.teilnahmestatus),
    schulnummer: normalizeText(row?.schulnummer),
    strasse: normalizeText(row?.strasse),
    plz: normalizeText(row?.plz),
    ort: normalizeText(row?.ort),
    bemerkung: normalizeText(row?.bemerkung),
    schule: normalizeText(row?.schule),
  }));
}

async function updatePoolSchuelerRow(pool, rowId, payload) {
  await updateStudentMaster(pool, rowId, {
    vorname: payload?.vorname, nachname: payload?.nachname, geburtsdatum: payload?.geburtsdatum,
    foerderbedarf: normalizeBoolean(payload?.foerderbedarf), zieldifferent: normalizeBoolean(payload?.zieldifferent),
    ef: normalizeBoolean(payload?.ef), herkunftsschule_snr: payload?.herkunftsschule_snr,
    strasse: payload?.strasse, plz: payload?.plz, ort: payload?.ort, notiz: payload?.bemerkung,
  });
  if (payload?.runde_id && payload?.verfahren_id) {
    await upsertRoundState(pool, {
      verfahren_id: payload.verfahren_id, schueler_id: rowId, runde_id: payload.runde_id,
      schul_nr: normalizeText(payload?.anmeldeschule_snr || payload?.schulnummer) || null,
      abgleich_status: normalizeText(payload?.abgleich_status) || "Nur Pool",
      anmeldestatus: normalizeText(payload?.anmeldestatus) || "Ohne",
      teilnahmestatus: normalizeText(payload?.teilnahmestatus) || "Aktiv",
    });
  }
}

async function deletePoolSchuelerRow(pool, rowId) {
  const [result] = await pool.query(
    `
    DELETE FROM anm_schueler
    WHERE id = ?
    `,
    [Number(rowId)],
  );
  if (!Number(result?.affectedRows || 0)) {
    const error = new Error("Der Datensatz wurde nicht gefunden.");
    error.statusCode = 404;
    throw error;
  }
}

async function loadCatalogByCode(pool, tableName) {
  const [rows] = await pool.query(`SELECT id, code, bezeichnung FROM ${tableName}`);
  const lookup = new Map();
  for (const row of rows || []) {
    const code = normalizeTextLower(row?.code);
    if (!code) continue;
    lookup.set(code, {
      id: Number(row?.id || 0),
      code: normalizeText(row?.code),
      bezeichnung: normalizeText(row?.bezeichnung),
    });
  }
  return lookup;
}

async function loadTableColumns(pool, tableName) {
  const cacheKey = normalizeTextLower(tableName);
  if (tableColumnCache.has(cacheKey)) {
    return tableColumnCache.get(cacheKey);
  }

  const [rows] = await pool.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
    `,
    [tableName],
  );
  const columns = new Set(
    (rows || [])
      .map((row) => normalizeTextLower(row?.COLUMN_NAME))
      .filter(Boolean),
  );
  tableColumnCache.set(cacheKey, columns);
  return columns;
}

async function loadSchuelerFieldComments(pool) {
  const [rows] = await pool.query(`
    SELECT COLUMN_NAME, COALESCE(COLUMN_COMMENT, '') AS column_comment
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'anm_schueler'
      AND COLUMN_NAME IN ('herkunft', 'anmeldestatus', 'abgleich_status')
  `);

  return Object.fromEntries((rows || []).map((row) => [
    normalizeTextLower(row?.COLUMN_NAME),
    normalizeText(row?.column_comment),
  ]).filter(([columnName]) => columnName));
}

async function loadProcedureSchoolLookup(pool, verfahrenId) {
  return loadProcedureSchoolLookupByRole(pool, verfahrenId, "Zielschulen");
}

async function loadProcedureSchoolLookupByRole(pool, verfahrenId, rolle) {
  const [rows] = await pool.query(
    `
    SELECT s.snr, s.name, s.is_active, s.db_host, s.db_name, s.db_user, s.db_password_enc
    FROM (
      SELECT DISTINCT sgs.snr
      FROM anm_verfahren_schulgruppe vsg
      JOIN anm_schulgruppe_schule sgs
        ON sgs.schulgruppe_id = vsg.schulgruppe_id
      WHERE vsg.verfahren_id = ?
        AND vsg.rolle = ?
    ) vzs
    JOIN anm_schulen s ON s.snr = vzs.snr
    `,
    [verfahrenId, rolle],
  );
  const lookup = new Map();
  for (const row of rows || []) {
    const snr = normalizeText(row?.snr);
    if (!snr) continue;
      lookup.set(snr, {
        snr,
        name: normalizeText(row?.name),
        active: Number(row?.is_active || 0) === 1,
        db_host: normalizeText(row?.db_host),
        db_name: normalizeText(row?.db_name),
        db_user: normalizeText(row?.db_user),
        db_password_enc: String(row?.db_password_enc || ""),
      });
  }
  return lookup;
}

async function loadProcedureType(pool, verfahrenId) {
  const [rows] = await pool.query(
    `
    SELECT verfahrenstyp
    FROM anm_verfahren
    WHERE id = ?
    LIMIT 1
    `,
    [verfahrenId],
  );
  return normalizeText(rows?.[0]?.verfahrenstyp) || "GS";
}

async function assertProcedureType(pool, verfahrenId, allowedTypes, errorMessage) {
  const expectedTypes = Array.isArray(allowedTypes) ? allowedTypes.map((entry) => normalizeText(entry)).filter(Boolean) : [];
  const verfahrenstyp = await loadProcedureType(pool, verfahrenId);
  if (expectedTypes.length && !expectedTypes.includes(verfahrenstyp)) {
    const error = new Error(errorMessage || `Dieser Import ist nur fuer ${expectedTypes.join(", ")} verfuegbar.`);
    error.statusCode = 409;
    throw error;
  }
  return verfahrenstyp;
}

async function loadLatestImportProtocolBySchool(pool, verfahrenId) {
  const columns = await loadTableColumns(pool, "anm_abgleich_protokoll");
  const timeColumn = columns.has("abrufzeitpunkt") ? "abrufzeitpunkt" : (columns.has("created_at") ? "created_at" : "");
  if (!columns.has("snr") || !timeColumn) {
    return new Map();
  }

  const filters = [];
  const params = [];

  if (columns.has("verfahren_id")) {
    filters.push("p.verfahren_id = ?");
    params.push(verfahrenId);
  }
  if (columns.has("import_typ")) {
    filters.push("p.import_typ = 'ANMELDUNG'");
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `
    SELECT p.snr, MAX(p.${timeColumn}) AS last_import_at
    FROM anm_abgleich_protokoll p
    ${whereClause}
    GROUP BY p.snr
    `,
    params,
  );
  const lookup = new Map();
  for (const row of rows || []) {
    lookup.set(normalizeText(row?.snr), row?.last_import_at || null);
  }
  return lookup;
}

function buildConnectionStatus(school) {
  if (!school?.active) return "inaktiv";
  return "bereit";
}

function firstDefinedValue(entry, keys = []) {
  for (const key of keys) {
    if (entry && entry[key] !== undefined && entry[key] !== null) {
      return entry[key];
    }
  }
  return null;
}

function extractRestArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  return payload.items || payload.data || payload.schueler || payload.students || payload.list || [];
}

function extractSchoolSections(payload) {
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const nested = extractSchoolSections(entry);
      if (nested.length) return nested;
    }
    return [];
  }
  if (!payload || typeof payload !== "object") return [];

  const direct = payload.abschnitte || payload.sections || payload.schuljahresabschnitte || payload.items || [];
  return Array.isArray(direct) ? direct : [];
}

function toSchoolYearLabel(schoolYear, termNo) {
  const year = Number(schoolYear || 0);
  const term = Number(termNo || 0);
  if (!year || !term) return "";
  return `${year}.${String(term).padStart(2, "0")}`;
}

function getCurrentSchoolYearLabel(date = new Date()) {
  const currentDate = date instanceof Date ? date : new Date(date);
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  if (month >= 2 && month <= 7) return `${year - 1}.02`;
  if (month === 1) return `${year - 1}.01`;
  return `${year}.01`;
}

function resolveExternalSectionId(sections, targetLabel) {
  if (!targetLabel) return 0;

  for (const section of Array.isArray(sections) ? sections : []) {
    const rawSchoolYear = firstDefinedValue(section, [
      "sj",
      "schuljahr",
      "schoolyear",
      "school_year",
      "jahr",
      "year",
    ]);
    const rawTermNo = firstDefinedValue(section, [
      "abschnitt",
      "abschnittnummer",
      "term",
      "term_no",
      "section",
      "section_no",
      "halbjahr",
    ]);
    const label = toSchoolYearLabel(rawSchoolYear, rawTermNo);
    if (label !== targetLabel) continue;

    return Number(firstDefinedValue(section, [
      "id",
      "idSchuljahresabschnitt",
      "idAbschnitt",
      "id_abschnitt",
      "abschnitt_id",
      "section_id",
      "sectionId",
      "schuljahresabschnitt_id",
      "schuljahresabschnittId",
    ]) || 0);
  }

  return 0;
}

function normalizeCurrentSelectionStudent(entry) {
  const studentId = Number(firstDefinedValue(entry, ["id", "student_id", "studentId", "schueler_id", "schuelerId"]) || 0);
  if (!studentId) return null;

  return {
    id: studentId,
    section_id: Number(firstDefinedValue(entry, [
      "idSchuljahresabschnitt",
      "idAbschnitt",
      "id_abschnitt",
      "abschnitt_id",
      "section_id",
      "sectionId",
      "schuljahresabschnitt_id",
      "schuljahresabschnittId",
    ]) || 0),
    nachname: normalizeText(firstDefinedValue(entry, ["nachname", "last_name", "lastname", "name"])),
    vorname: normalizeText(firstDefinedValue(entry, ["vorname", "first_name", "firstname"])),
    geburtsdatum: normalizeDate(firstDefinedValue(entry, ["geburtsdatum", "birth_date", "birthDate", "geburtstag", "dateOfBirth"])),
    zieldifferent: firstDefinedValue(entry, ["hatZieldifferentenUnterricht", "hat_zieldifferenten_unterricht", "target_different", "targetDifferent", "zieldifferent"]),
    foerderschwerpunkt1ID: firstDefinedValue(entry, ["foerderschwerpunkt1ID", "foerderschwerpunkt1_id", "foerderschwerpunkt1Id", "support_focus1_id", "supportFocus1Id"]),
    foerderschwerpunkt2ID: firstDefinedValue(entry, ["foerderschwerpunkt2ID", "foerderschwerpunkt2_id", "foerderschwerpunkt2Id", "support_focus2_id", "supportFocus2Id"]),
    status: firstDefinedValue(entry, ["status", "status_id", "statusId", "schuelerstatus", "schueler_status", "schuelerStatus"]),
    year_group_id: firstDefinedValue(entry, ["idJahrgang", "jahrgangID", "jahrgangId"]),
    jahrgang: firstDefinedValue(entry, ["jahrgang", "grade", "grade_level", "year"]),
    klassenart: firstDefinedValue(entry, ["klassenart", "klassenArt", "Klassenart", "class_type", "classType"]),
  };
}

function extractSelectionStudents(payload) {
  return extractRestArray(payload)
    .map((entry) => normalizeCurrentSelectionStudent(entry))
    .filter(Boolean);
}

function resolveStudentStatusValue(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = Number(String(value).trim());
  return Number.isFinite(normalized) ? normalized : null;
}

function mapSvwsStatusToAnmeldestatusCode(statusValue) {
  const normalized = resolveStudentStatusValue(statusValue);
  if (normalized === 0) return "NEUAUFNAHME";
  if (normalized === 1) return "WARTELISTE";
  return "";
}

function normalizeYearGroupEntries(payload) {
  return extractRestArray(payload)
    .map((entry) => ({
      external_id: String(firstDefinedValue(entry, ["idJahrgang", "jahrgangID", "jahrgangId", "id", "ID"]) ?? "").trim(),
      statistik_code: String(firstDefinedValue(entry, ["kuerzelstatistik", "kuerzelStatistik", "KuerzelStatistik", "jahrgang", "grade"]) ?? "").trim(),
    }))
    .filter((entry) => entry.external_id);
}

function buildYearGroupLookup(entries) {
  const byId = new Map();
  for (const entry of entries || []) {
    const externalId = String(entry?.external_id || "").trim();
    if (!externalId) continue;
    byId.set(externalId, String(entry?.statistik_code || "").trim());
  }
  return byId;
}

function normalizeGradeValue(value) {
  const text = normalizeText(value);
  if (!text) return "";
  const match = text.match(/\d+/);
  return match ? String(Number(match[0])) : text.toUpperCase();
}

function resolveStudentGrade(student, yearGroupLookup = null) {
  const mappedYearGroup = yearGroupLookup instanceof Map
    ? normalizeGradeValue(yearGroupLookup.get(String(student?.year_group_id ?? "").trim()) || "")
    : "";
  if (mappedYearGroup) return mappedYearGroup;
  return normalizeGradeValue(student?.jahrgang);
}

function resolveEfFromKlassenart(value) {
  const klassenart = normalizeText(value).toUpperCase();
  if (!klassenart) return 0;
  return klassenart !== "RK" ? 1 : 0;
}

function explainSvwsLearningSectionError(error, schoolLabel, studentId, externalSectionId) {
  const message = String(error?.message || error || "").trim();
  if (
    message.includes("Ungueltige JSON-Antwort")
    && message.includes("/lernabschnittsdaten")
  ) {
    return `[Pool-Schild-Import] ${schoolLabel}: lernabschnittsdaten fuer Schueler ${studentId} im Abschnitt ${externalSectionId} fehlen. Fachliche Bedeutung: Der Schueler ist im gewaehlten Abschnitt nicht vorhanden. Verwende Fallback aus Auswahlliste. Rohfehler: ${message}`;
  }
  return `[Pool-Schild-Import] ${schoolLabel}: lernabschnittsdaten fuer Schueler ${studentId} konnten nicht geladen werden. Verwende Fallback aus Auswahlliste. Grund: ${message}`;
}

function normalizeSvwsStreet(payload) {
  const source = Array.isArray(payload) ? payload[0] || {} : payload || {};
  const directStreet = firstDefinedValue(source, [
    "strasse",
    "strassennameHausnummer",
    "strassenname_hausnummer",
    "street",
    "addressLine1",
  ]);
  if (normalizeText(directStreet)) return directStreet;

  const streetName = firstDefinedValue(source, [
    "strassenname",
    "street_name",
    "streetName",
  ]);
  const houseNumber = firstDefinedValue(source, [
    "hausnummer",
    "haus_nr",
    "house_number",
    "houseNumber",
  ]);
  const houseNumberSuffix = firstDefinedValue(source, [
    "hausnummerzusatz",
    "hausnummer_zusatz",
    "house_number_suffix",
    "houseNumberSuffix",
  ]);

  return [
    normalizeText(streetName),
    [normalizeText(houseNumber), normalizeText(houseNumberSuffix)].filter(Boolean).join(" "),
  ].filter(Boolean).join(" ");
}

function normalizeSvwsStudentMasterData(payload) {
  const source = Array.isArray(payload) ? payload[0] || {} : payload || {};
  return {
    studentId: firstDefinedValue(source, ["id", "student_id", "studentId", "schueler_id", "schuelerId", "schuelerID"]),
    nachname: firstDefinedValue(source, ["nachname", "last_name", "lastname", "name"]),
    vorname: firstDefinedValue(source, ["vorname", "first_name", "firstname"]),
    geburtsdatum: firstDefinedValue(source, ["geburtsdatum", "birth_date", "birthDate", "geburtstag", "dateOfBirth"]),
    strasse: normalizeSvwsStreet(source),
    plz: firstDefinedValue(source, ["plz", "postleitzahl", "postal_code", "postalCode"]),
    ort: firstDefinedValue(source, ["ort", "wohnort", "wohnortname", "city", "cityName"]),
  };
}

function normalizeSvwsStudentLearningSectionData(payload) {
  const source = Array.isArray(payload) ? payload[0] || {} : payload || {};
  return {
    hatZieldifferentenUnterricht: firstDefinedValue(source, [
      "hatZieldifferentenUnterricht",
      "hat_zieldifferenten_unterricht",
      "target_different",
      "targetDifferent",
      "zieldifferent",
    ]),
    foerderschwerpunkt1ID: firstDefinedValue(source, [
      "foerderschwerpunkt1ID",
      "foerderschwerpunkt1_id",
      "foerderschwerpunkt1Id",
      "support_focus1_id",
      "supportFocus1Id",
    ]),
    foerderschwerpunkt2ID: firstDefinedValue(source, [
      "foerderschwerpunkt2ID",
      "foerderschwerpunkt2_id",
      "foerderschwerpunkt2Id",
      "support_focus2_id",
      "supportFocus2Id",
    ]),
    klassenart: firstDefinedValue(source, [
      "klassenart",
      "klassenArt",
      "Klassenart",
      "class_type",
      "classType",
    ]),
  };
}

async function mapWithConcurrency(items, worker, concurrency = 8) {
  const results = new Array(items.length);
  let index = 0;

  async function consume() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, () => consume());
  await Promise.all(runners);
  return results;
}

function mapAnmeldestatusToSchuelerStatus(value) {
  const normalized = normalizeTextLower(value);
  if (!normalized) return "Ohne";
  if (normalized === "warteliste") return "Warteliste";
  if (["ablehnung", "abgelehnt"].includes(normalized)) return "Abgelehnt";
  if (["neuaufnahme", "aufnahme"].includes(normalized)) return "Neuaufnahme";
  if (normalized === "ohne") return "Ohne";
  return "Ohne";
}

function hasPoolAbgleich(existingStudent) {
  const herkunft = normalizeTextLower(existingStudent?.herkunft);
  const abgleichStatus = normalizeTextLower(existingStudent?.abgleich_status).replace(/\s+/g, " ");
  return herkunft === "pool" || abgleichStatus === "nur pool" || abgleichStatus === "pool + anm" || abgleichStatus === "pool+anm";
}

async function findExistingSchuelerRecord(pool, verfahrenId, rundeId, schuelerId, herkunftSnr = "") {
  const normalizedSchuelerId = normalizeText(schuelerId);
  if (!verfahrenId || !rundeId || !normalizedSchuelerId) return null;
  const [rows] = await pool.query(
    `
    SELECT
      s.id,
      COALESCE(TRIM(x.externe_id), '') AS externe_schueler_id,
      COALESCE(TRIM(sr.schul_nr), '') AS anmeldeschule_snr,
      COALESCE(TRIM(s.vorname), '') AS vorname,
      COALESCE(TRIM(s.nachname), '') AS nachname,
      DATE_FORMAT(s.geburtsdatum, '%Y-%m-%d') AS geburtsdatum,
      COALESCE(TRIM(s.foerderbedarf), '') AS foerderbedarf,
      COALESCE(TRIM(s.foerder_id), '') AS foerder_id,
      COALESCE(s.zieldifferent, 0) AS zieldifferent,
      COALESCE(TRIM(s.empfehlung), '') AS empfehlung,
      COALESCE(TRIM(s.notiz), '') AS bemerkung,
      COALESCE(TRIM(s.strasse), '') AS strasse,
      COALESCE(TRIM(s.plz), '') AS plz,
      COALESCE(TRIM(s.ort), '') AS ort,
      COALESCE(TRIM(s.herkunft), '') AS herkunft,
      COALESCE(TRIM(sr.abgleich_status), '') AS abgleich_status,
      COALESCE(TRIM(sr.anmeldestatus), '') AS anmeldestatus,
      COALESCE((SELECT TRIM(prev.schul_nr)
                  FROM anm_schueler_runde prev
                  JOIN anm_runde prev_runde ON prev_runde.id = prev.runde_id
                 WHERE prev.verfahren_id = s.verfahren_id
                   AND prev.schueler_id = s.id
                   AND prev_runde.runden_nummer < (
                     SELECT aktuelle_runde.runden_nummer
                       FROM anm_runde aktuelle_runde
                      WHERE aktuelle_runde.id = ?
                   )
                   AND prev.schul_nr IS NOT NULL
                 ORDER BY prev_runde.runden_nummer DESC, prev.runde_id DESC
                 LIMIT 1), '') AS erwartete_snr
    FROM anm_schueler s
    LEFT JOIN anm_schueler_runde sr
      ON sr.schueler_id = s.id AND sr.verfahren_id = s.verfahren_id AND sr.runde_id = ?
    LEFT JOIN anm_schueler_externe_id x
      ON x.schueler_id = s.id
     AND x.herkunft_art = 'SCHULE'
     AND x.externe_id = ?
     AND (? = '' OR x.herkunft_snr_norm = ?)
    WHERE s.verfahren_id = ?
      AND x.id IS NOT NULL
    ORDER BY s.id DESC
    LIMIT 1
    `,
    [rundeId, rundeId, normalizedSchuelerId, normalizeText(herkunftSnr), normalizeText(herkunftSnr), verfahrenId],
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function upsertSchuelerForAnmeldungImport(pool, payload) {
  const verfahrenId = Number(payload?.verfahren_id || 0);
  const rundeId = Number(payload?.runde_id || 0);
  const externalId = normalizeText(payload?.externe_schueler_id);
  const importierteSchulnummer = normalizeText(payload?.snr);
  const anmeldestatus = mapAnmeldestatusToSchuelerStatus(payload?.anmeldestatus_code);
  const identity = externalId ? {
    herkunft_art: "SCHULE",
    herkunft_snr: importierteSchulnummer || null,
    externe_id: externalId,
  } : null;
  const resolved = await resolveStudent(pool, {
    verfahren_id: verfahrenId,
    herkunft: "Anmeldung",
    vorname: payload?.vorname,
    nachname: payload?.nachname,
    geburtsdatum: payload?.geburtsdatum,
    foerderbedarf: normalizeBoolean(payload?.foerderbedarf),
    zieldifferent: normalizeBoolean(payload?.zieldifferent),
    external_identity: identity,
  });
  await updateStudentMaster(pool, resolved.student.id, {
    vorname: payload?.vorname,
    nachname: payload?.nachname,
    geburtsdatum: payload?.geburtsdatum,
    foerderbedarf: normalizeBoolean(payload?.foerderbedarf),
    zieldifferent: normalizeBoolean(payload?.zieldifferent),
  });
  const previousRound = await (async () => {
    const [rows] = await pool.query(
      `SELECT sr.schul_nr AS erwartete_snr
         FROM anm_schueler_runde sr
         JOIN anm_runde vorherige_runde ON vorherige_runde.id = sr.runde_id
        WHERE sr.verfahren_id = ?
          AND sr.schueler_id = ?
          AND vorherige_runde.runden_nummer < (
            SELECT aktuelle_runde.runden_nummer
              FROM anm_runde aktuelle_runde
             WHERE aktuelle_runde.id = ?
          )
          AND sr.schul_nr IS NOT NULL
        ORDER BY vorherige_runde.runden_nummer DESC, sr.runde_id DESC
        LIMIT 1`,
      [verfahrenId, resolved.student.id, rundeId],
    );
    return rows?.[0] || null;
  })();
  const [currentRows] = await pool.query(
    `SELECT abgleich_status FROM anm_schueler_runde
      WHERE verfahren_id = ? AND schueler_id = ? AND runde_id = ? LIMIT 1`,
    [verfahrenId, resolved.student.id, rundeId],
  );
  const abgleichStatus = hasPoolAbgleich(currentRows?.[0]) ? "Pool + Anm" : "Nur Anmeldung";
  await upsertRoundState(pool, {
    verfahren_id: verfahrenId,
    schueler_id: resolved.student.id,
    runde_id: rundeId,
    schul_nr: importierteSchulnummer || null,
    abgleich_status: abgleichStatus,
    anmeldestatus,
    teilnahmestatus: "Aktiv",
  });
  const erwarteteSchulnummer = normalizeText(previousRound?.erwartete_snr);
  let schoolChangeCase = false;
  if (erwarteteSchulnummer && importierteSchulnummer
    && normalizeTextLower(erwarteteSchulnummer) !== normalizeTextLower(importierteSchulnummer)) {
    const openCaseResult = await ensureOpenCaseForSchoolChange(pool, {
      verfahren_id: verfahrenId,
      schueler_id: Number(resolved.student.id),
      erwartete_schulnummer: erwarteteSchulnummer,
      importierte_schulnummer: importierteSchulnummer,
    });
    schoolChangeCase = Boolean(openCaseResult.created || openCaseResult.updated);
  }
  return {
    id: Number(resolved.student.id),
    created: resolved.created,
    abgleich_status: abgleichStatus,
    school_change_case: schoolChangeCase,
  };
}

async function upsertStudent(pool, payload) {
  const verfahrenId = Number(payload?.verfahren_id || 0);
  const rundeId = Number(payload?.runde_id || 0);
  const row = payload?.row || {};
  const snr = normalizeText(row?.snr);
  const externalId = normalizeText(row?.externe_schueler_id);
  const vorname = normalizeText(row?.vorname);
  const nachname = normalizeText(row?.nachname);
  const geburtsdatum = normalizeDate(row?.geburtsdatum);
  const strasse = normalizeText(row?.strasse);
  const plz = normalizeText(row?.plz);
  const ort = normalizeText(row?.ort);
  const foerderbedarf = normalizeText(row?.foerderbedarf);
  const zieldifferent = normalizeBoolean(row?.zieldifferent);
  const ef = normalizeBoolean(row?.ef);
  const empfehlung = normalizeText(row?.empfehlung) || normalizeText(row?.empfehlung_code) || "KEINE";
  const sourceArt = normalizeText(payload?.source_art || payload?.herkunft_art).toUpperCase() || "POOL";
  let hasAnmeldung = false;
  const identity = externalId ? {
    herkunft_art: sourceArt,
    herkunft_snr: ["SCHULE", "KITA", "SONST"].includes(sourceArt) ? (snr || null) : null,
    externe_id: externalId,
  } : null;
  let resolved;
  try {
    resolved = await resolveStudent(pool, {
      verfahren_id: verfahrenId,
      herkunft: "Pool",
      vorname,
      nachname,
      geburtsdatum,
      strasse,
      plz,
      ort,
      foerderbedarf,
      zieldifferent,
      ef,
      empfehlung,
      notiz: normalizeText(row?.notiz) || null,
      herkunftsschule_snr: snr || null,
      external_identity: identity,
    });
  } catch (error) {
    if (error?.code !== "AMBIGUOUS_STUDENT_MATCH") throw error;
    return {
      conflict: true,
      updated: false,
      hasAnmeldung,
      conflict_detail: { externe_schueler_id: externalId, nachname, vorname, anmeldeschule_snr: snr },
    };
  }
  const [roundRows] = await pool.query(
    `SELECT abgleich_status, anmeldestatus
       FROM anm_schueler_runde
      WHERE verfahren_id = ? AND schueler_id = ? AND runde_id = ?
      LIMIT 1`,
    [verfahrenId, resolved.student.id, rundeId],
  );
  const currentRound = roundRows?.[0] || null;
  hasAnmeldung = ["Nur Anmeldung", "Pool + Anm"].includes(normalizeText(currentRound?.abgleich_status));
  const abgleichStatus = hasAnmeldung ? "Pool + Anm" : "Nur Pool";
  const anmeldestatus = hasAnmeldung ? normalizeText(currentRound?.anmeldestatus) || "Ohne" : "Ohne";
  await updateStudentMaster(pool, resolved.student.id, {
    vorname, nachname, geburtsdatum, ...pickNonEmptyAddressFields({ strasse, plz, ort }), foerderbedarf,
    zieldifferent, ef, empfehlung, notiz: normalizeText(row?.notiz) || null,
    herkunftsschule_snr: snr || null,
  });
  await updateStudentOrigin(pool, resolved.student.id, "Pool");
  const existingRound = await upsertRoundState(pool, {
    verfahren_id: verfahrenId,
    schueler_id: resolved.student.id,
    runde_id: rundeId,
    schul_nr: snr || null,
    abgleich_status: abgleichStatus,
    anmeldestatus,
    teilnahmestatus: normalizeText(row?.teilnahmestatus) || "Aktiv",
  });
  return { id: Number(resolved.student.id), updated: !resolved.created, hasAnmeldung, round_created: existingRound.created };
}

function buildSek1ImportErrorNote(row) {
  const parts = [];
  const rowNumber = Number(row?.row_number || 0);
  const importId = normalizeText(row?.data?.externe_schueler_id);
  const schulNr = normalizeText(row?.data?.anmeldeschule_snr);
  const errors = Array.isArray(row?.errors) ? row.errors.map((entry) => normalizeText(entry)).filter(Boolean) : [];
  if (rowNumber) parts.push(`Zeile ${rowNumber}`);
  if (importId) parts.push(`Import-ID ${importId}`);
  if (schulNr) parts.push(`anmeldeschule_snr ${schulNr}`);
  if (errors.length) parts.push(`Fehler: ${errors.join(", ")}`);
  return parts.join(" | ");
}

async function ensureSek1OpenCaseByCode(pool, payload) {
  const verfahrenId = Number(payload?.verfahren_id || 0);
  const schuelerId = Number(payload?.schueler_id || 0);
  const fallgrundCode = normalizeText(payload?.fallgrund_code);
  const noteText = normalizeText(payload?.note);
  if (!verfahrenId || !fallgrundCode || !noteText) {
    return { created: false, updated: false };
  }

  const offenerFallColumns = await loadTableColumns(pool, "anm_offener_fall");
  const fallgrundByCode = await loadCatalogByCode(pool, "anm_kat_fallgrund");
  const fallgrund = fallgrundByCode.get(normalizeTextLower(fallgrundCode));
  if (!fallgrund?.id) {
    return { created: false, updated: false };
  }

  const statusCodeColumn = offenerFallColumns.has("fallstatus_code") ? "fallstatus_code" : "";
  const statusIdColumn = offenerFallColumns.has("fallstatus_id") ? "fallstatus_id" : "";
  const noteColumn = offenerFallColumns.has("bemerkung") ? "bemerkung" : (offenerFallColumns.has("notiz") ? "notiz" : "");
  const schuelerIdColumn = offenerFallColumns.has("schueler_id") ? "schueler_id" : "";
  const assignedSchoolColumn = offenerFallColumns.has("zugewiesene_snr") ? "zugewiesene_snr" : "";
  let openStatusId = 0;
  if (statusIdColumn) {
    const fallstatusByCode = await loadCatalogByCode(pool, "anm_kat_fallstatus");
    openStatusId = Number(fallstatusByCode.get("offen")?.id || 0);
  }

  const whereParts = ["verfahren_id = ?", "fallgrund_id = ?"];
  const whereParams = [verfahrenId, Number(fallgrund.id)];
  if (schuelerId && schuelerIdColumn) {
    whereParts.push("schueler_id = ?");
    whereParams.push(schuelerId);
  } else if (noteColumn) {
    whereParts.push(`${noteColumn} = ?`);
    whereParams.push(noteText);
  } else {
    return { created: false, updated: false };
  }

  const [existingRows] = await pool.query(
    `
    SELECT id
    FROM anm_offener_fall
    WHERE ${whereParts.join(" AND ")}
    LIMIT 1
    `,
    whereParams,
  );

  if (Array.isArray(existingRows) && existingRows.length) {
    const assignments = ["updated_at = NOW()"];
    const values = [];
    if (statusIdColumn && openStatusId) {
      assignments.push(`${statusIdColumn} = ?`);
      values.push(openStatusId);
    } else if (statusCodeColumn) {
      assignments.push(`${statusCodeColumn} = ?`);
      values.push("OFFEN");
    }
    if (noteColumn) {
      assignments.push(`${noteColumn} = ?`);
      values.push(noteText);
    }
    if (assignedSchoolColumn && normalizeText(payload?.zugewiesene_snr)) {
      assignments.push(`${assignedSchoolColumn} = ?`);
      values.push(normalizeText(payload?.zugewiesene_snr));
    }
    values.push(Number(existingRows[0].id));
    await pool.query(
      `
      UPDATE anm_offener_fall
      SET ${assignments.join(", ")}
      WHERE id = ?
      `,
      values,
    );
    return { created: false, updated: true };
  }

  const insertColumns = ["verfahren_id", "fallgrund_id"];
  const placeholders = ["?", "?"];
  const values = [verfahrenId, Number(fallgrund.id)];
  if (offenerFallColumns.has("schueler_pool_id")) {
    insertColumns.push("schueler_pool_id");
    placeholders.push("?");
    values.push(null);
  }
  if (schuelerIdColumn) {
    insertColumns.push("schueler_id");
    placeholders.push("?");
    values.push(schuelerId || null);
  }
  if (offenerFallColumns.has("schueler_anmeldung_id")) {
    insertColumns.push("schueler_anmeldung_id");
    placeholders.push("?");
    values.push(null);
  }
  if (statusIdColumn && openStatusId) {
    insertColumns.push(statusIdColumn);
    placeholders.push("?");
    values.push(openStatusId);
  } else if (statusCodeColumn) {
    insertColumns.push(statusCodeColumn);
    placeholders.push("?");
    values.push("OFFEN");
  }
  if (noteColumn) {
    insertColumns.push(noteColumn);
    placeholders.push("?");
    values.push(noteText);
  }
  if (assignedSchoolColumn && normalizeText(payload?.zugewiesene_snr)) {
    insertColumns.push(assignedSchoolColumn);
    placeholders.push("?");
    values.push(normalizeText(payload?.zugewiesene_snr));
  }

  await pool.query(
    `
    INSERT INTO anm_offener_fall (${insertColumns.join(", ")})
    VALUES (${placeholders.join(", ")})
    `,
    values,
  );
  return { created: true, updated: false };
}

async function ensureOpenCaseForSchoolChange(pool, payload) {
  const verfahrenId = Number(payload?.verfahren_id || 0);
  const schuelerId = Number(payload?.schueler_id || 0);
  const erwarteteSchulnummer = normalizeText(payload?.erwartete_schulnummer);
  const importierteSchulnummer = normalizeText(payload?.importierte_schulnummer);
  if (!verfahrenId || !schuelerId || !erwarteteSchulnummer || !importierteSchulnummer) {
    return { created: false, updated: false };
  }

  const bemerkung = `Schueler wurde an einer anderen Schule angemeldet als aufgrund der vorherigen Runde erwartet. Erwartete Schule: ${erwarteteSchulnummer}. Tatsaechliche Anmeldung: ${importierteSchulnummer}.`;
  return ensureSek1OpenCaseByCode(pool, {
    verfahren_id: verfahrenId,
    schueler_id: schuelerId,
    fallgrund_code: "SCHULE_ABWEICHEND",
    zugewiesene_snr: erwarteteSchulnummer,
    note: bemerkung,
  });
}

async function ensureOpenCaseForUnknownProcedureSchool(pool, payload) {
  const verfahrenId = Number(payload?.verfahren_id || 0);
  const schuelerId = Number(payload?.schueler_id || 0);
  if (!verfahrenId || !schuelerId) {
    return { created: false, updated: false };
  }

  return ensureSek1OpenCaseByCode(pool, {
    verfahren_id: verfahrenId,
    schueler_id: schuelerId,
    fallgrund_code: "ANMELDEFEHLER",
    note: "Anmeldeschule existiert nicht im Verfahren.",
  });
}

function buildPoolPreviewRow(parsedRow, schoolBySnr, empfehlungByCode) {
  const recommendation = normalizeImportRecommendation(
    normalizeText(parsedRow.getValue(["empfehlung", "empfehlung_code"])) || "KEINE",
  );
  const data = {
    snr: normalizeText(parsedRow.getValue(["snr", "anmeldeschule_snr", "herkunftsschule_snr", "herkunftsschule_snr_nr"])),
    externe_schueler_id: normalizeText(parsedRow.getValue("externe_schueler_id")),
    vorname: normalizeText(parsedRow.getValue("vorname")),
    nachname: normalizeText(parsedRow.getValue("nachname")),
    geburtsdatum: normalizeDate(parsedRow.getValue("geburtsdatum")),
    strasse: normalizeText(parsedRow.getValue(["strasse", "straÃŸe", "street"])),
    plz: normalizeText(parsedRow.getValue(["plz", "postleitzahl"])),
    ort: normalizeText(parsedRow.getValue(["ort", "city"])),
    foerderbedarf: normalizeText(parsedRow.getValue("foerderbedarf")),
    zieldifferent: normalizeText(parsedRow.getValue("zieldifferent")),
    empfehlung: recommendation.value || recommendation.normalized,
  };

  const errors = [];
  const school = schoolBySnr.get(data.snr) || null;
  if (!data.snr) errors.push("snr fehlt.");
  if (!school && data.snr) errors.push("snr gehoert nicht zu einer Schule im Verfahren.");
  if (!data.vorname) errors.push("vorname fehlt.");
  if (!data.nachname) errors.push("nachname fehlt.");
  if (!data.geburtsdatum) errors.push("geburtsdatum fehlt.");
  if (!data.strasse) errors.push("strasse fehlt.");
  if (!data.plz) errors.push("plz fehlt.");
  if (!data.ort) errors.push("ort fehlt.");
  if (!recommendation.valid || !empfehlungByCode.has(normalizeTextLower(data.empfehlung))) {
    errors.push("empfehlung ist unbekannt.");
  }

  return {
    row_number: parsedRow.row_number,
    data,
    valid: errors.length === 0,
    errors,
    selected: errors.length === 0,
  };
}

async function buildAnmeldungPreviewRowFromData(rowNumber, data, schoolBySnr, statusByCode, pool, verfahrenId, rundeId) {
  const errors = [];
  const warnings = [];
  const school = schoolBySnr.get(data.snr) || null;
  if (!data.snr) errors.push("anmeldeschule_snr fehlt.");
  if (!school && data.snr) errors.push("anmeldeschule_snr gehoert nicht zu einer Schule im Verfahren.");
  if (!data.vorname) errors.push("vorname fehlt.");
  if (!data.nachname) errors.push("nachname fehlt.");
  if (!data.geburtsdatum) errors.push("geburtsdatum fehlt.");
  if (!data.anmeldestatus_code) errors.push("anmeldestatus_code fehlt.");
  if (data.anmeldestatus_code && !statusByCode.has(normalizeTextLower(data.anmeldestatus_code))) {
    errors.push("anmeldestatus_code ist unbekannt.");
  }

  const existingStudent = data.externe_schueler_id
    ? await findExistingSchuelerRecord(pool, verfahrenId, rundeId, data.externe_schueler_id, data.snr)
    : null;
  if (existingStudent && errors.includes("anmeldeschule_snr gehoert nicht zu einer Schule im Verfahren.")) {
    const index = errors.indexOf("anmeldeschule_snr gehoert nicht zu einer Schule im Verfahren.");
    if (index >= 0) errors.splice(index, 1);
    warnings.push("anmeldeschule_snr gehoert nicht zu einer Schule im Verfahren. Offener Fall wird beim Import erzeugt.");
  }
  const match_status = hasPoolAbgleich(existingStudent) ? "GEFUNDEN" : "NUR_ANMELDUNG";
  let match_hinweis = hasPoolAbgleich(existingStudent)
    ? "Im Pool (Gefunden)"
    : "Nicht aus";

  if (existingStudent) {
    match_hinweis += " - Update";
  } else {
    match_hinweis += " - Neu";
  }

  const match = { match_status, match_hinweis };

  return {
    row_number: rowNumber,
    data,
    school_name: school?.name || "",
    valid: errors.length === 0,
    errors,
    warnings,
    selected: errors.length === 0,
    match,
  };
}

async function buildAnmeldungPreviewRow(parsedRow, schoolBySnr, statusByCode, pool, verfahrenId, rundeId) {
  const data = {
    snr: normalizeText(parsedRow.getValue(["anmeldeschule_snr", "snr"])),
    externe_schueler_id: normalizeText(parsedRow.getValue("externe_schueler_id")),
    vorname: normalizeText(parsedRow.getValue("vorname")),
    nachname: normalizeText(parsedRow.getValue("nachname")),
    geburtsdatum: normalizeDate(parsedRow.getValue("geburtsdatum")),
    foerderbedarf: normalizeText(parsedRow.getValue("foerderbedarf")),
    zieldifferent: normalizeText(parsedRow.getValue("zieldifferent")),
    anmeldestatus_code: normalizeText(parsedRow.getValue(["anmeldestatus_code", "anmeldestatus"])),
  };

  return buildAnmeldungPreviewRowFromData(
    parsedRow.row_number,
    data,
    schoolBySnr,
    statusByCode,
    pool,
    verfahrenId,
    rundeId,
  );
}

async function fetchSvwsAnmeldungenPreviewRowsForSchool(pool, school, verfahrenId, rundeId, statusByCode) {
  const schoolLabel = school?.name || school?.snr || "die Schule";
  const diagnostics = {
    school_name: normalizeText(school?.name),
    school_snr: normalizeText(school?.snr),
    host: normalizeText(school?.db_host),
    db_name: normalizeText(school?.db_name),
    connection_established: false,
    current_section_label: "",
    current_section_id: 0,
    selection_count: 0,
    status_0_count: 0,
    status_1_count: 0,
    status_2_count: 0,
    eligible_count: 0,
  };
  if (!school?.db_host || !school?.db_name || !school?.db_user) {
    const error = new Error(`Fuer ${schoolLabel} fehlen SVWS-Zugangsdaten in anm_schulen.`);
    error.statusCode = 400;
    error.diagnostics = diagnostics;
    throw error;
  }

  const { createSvwsClient } = await getSvwsConnectionModule();
  const client = createSvwsClient({
    host: school.db_host,
    schule: school.db_name,
    user: school.db_user,
    passwort: school.db_password_enc,
  });
  const normalizedHost = school.db_host;

  const currentSectionLabel = getCurrentSchoolYearLabel();
  const schoolMetaResponse = await client.get("/schule/stammdaten");
  diagnostics.connection_established = true;
  const externalSectionId = resolveExternalSectionId(extractSchoolSections(schoolMetaResponse?.data), currentSectionLabel);
  diagnostics.current_section_label = currentSectionLabel;
  diagnostics.current_section_id = Number(externalSectionId || 0);
  console.log(`[Schild3-Import] Host: ${normalizedHost}`);
  console.log(`[Schild3-Import] Aktueller Abschnitt (${currentSectionLabel}) ID: ${externalSectionId || "-"}`);
  if (!externalSectionId) {
    const error = new Error(`Fuer ${schoolLabel} wurde kein aktueller Abschnitt (${currentSectionLabel}) im SVWS-Server gefunden.`);
    error.statusCode = 400;
    error.diagnostics = diagnostics;
    throw error;
  }

  const selectionResponse = await client.get(`/schueler/abschnitt/${encodeURIComponent(String(externalSectionId))}/auswahlliste`);
  const rawStudents = Array.isArray(selectionResponse?.data?.schueler) ? selectionResponse.data.schueler : extractRestArray(selectionResponse?.data);
  diagnostics.selection_count = Number(rawStudents.length || 0);
  console.log(`[Schild3-Import] Schueler in Auswahlliste: ${Number(rawStudents.length || 0)}`);
  if (rawStudents.length > 0) {
    console.log("[Schild3-Import] Erstes Schuelerobjekt aus der Auswahlliste:");
    console.log(rawStudents[0]);
  }
  const normalizedStudents = rawStudents
    .map((entry) => normalizeCurrentSelectionStudent(entry))
    .filter(Boolean);
  diagnostics.status_0_count = normalizedStudents
    .filter((student) => resolveStudentStatusValue(student?.status) === 0).length;
  diagnostics.status_1_count = normalizedStudents
    .filter((student) => resolveStudentStatusValue(student?.status) === 1).length;
  diagnostics.status_2_count = normalizedStudents
    .filter((student) => resolveStudentStatusValue(student?.status) === 2).length;
  const eligibleStudents = normalizedStudents
    .filter((student) => ["0", "1"].includes(String(resolveStudentStatusValue(student?.status) ?? "")));
  diagnostics.eligible_count = eligibleStudents.length;

  const rows = await mapWithConcurrency(eligibleStudents, async (student, index) => {
    const studentId = Number(student?.id || 0);
    const masterDataResponse = await client.get(`/schueler/${encodeURIComponent(String(studentId))}/stammdaten`);
    const masterData = normalizeSvwsStudentMasterData(masterDataResponse?.data);
    const anmeldestatusCode = mapSvwsStatusToAnmeldestatusCode(student?.status);
    const foerderbedarf = student?.foerderschwerpunkt1ID || student?.foerderschwerpunkt2ID ? "1" : "0";
    const zieldifferent = normalizeBoolean(student?.zieldifferent) ? "1" : "0";

    return await buildAnmeldungPreviewRowFromData(
      index + 1,
      {
        snr: school.snr,
        externe_schueler_id: normalizeText(masterData?.studentId || studentId),
        vorname: normalizeText(masterData?.vorname || student?.vorname),
        nachname: normalizeText(masterData?.nachname || student?.nachname),
        geburtsdatum: normalizeDate(masterData?.geburtsdatum || student?.geburtsdatum),
        foerderbedarf,
        zieldifferent,
        anmeldestatus_code: anmeldestatusCode,
      },
      new Map([[school.snr, school]]),
      statusByCode,
      pool,
      verfahrenId,
      rundeId,
    );
  }, 8);

  return { rows, diagnostics };
}

function buildPoolImportRowFromData(rowNumber, data, schoolBySnr) {
  const errors = [];
  const school = schoolBySnr.get(data.snr) || null;
  if (!data.snr) errors.push("snr fehlt.");
  if (!school && data.snr) errors.push("snr gehoert nicht zu einer Schule im Verfahren.");
  if (!data.vorname) errors.push("vorname fehlt.");
  if (!data.nachname) errors.push("nachname fehlt.");

  return {
    row_number: rowNumber,
    data,
    valid: errors.length === 0,
    errors,
    selected: errors.length === 0,
  };
}

async function fetchSvwsPoolJg4RowsForSchool(pool, school, verfahrenId, rundeId) {
  const schoolLabel = school?.name || school?.snr || "die Schule";
  console.log(`[Pool-Schild-Import] Starte SVWS-Abruf fuer ${schoolLabel} (SNR ${school?.snr || "-"}) | Verfahren ${verfahrenId} | Runde ${rundeId}`);
  const diagnostics = {
    school_name: normalizeText(school?.name),
    school_snr: normalizeText(school?.snr),
    host: normalizeText(school?.db_host),
    db_name: normalizeText(school?.db_name),
    connection_established: false,
    current_section_label: "",
    current_section_id: 0,
    selection_count: 0,
    status_2_count: 0,
    grade_4_count: 0,
    eligible_count: 0,
  };
  if (!school?.db_host || !school?.db_name || !school?.db_user) {
    const error = new Error(`Fuer ${schoolLabel} fehlen SVWS-Zugangsdaten in anm_schulen.`);
    error.statusCode = 400;
    error.diagnostics = diagnostics;
    throw error;
  }

  const { createSvwsClient } = await getSvwsConnectionModule();
  const client = createSvwsClient({
    host: school.db_host,
    schule: school.db_name,
    user: school.db_user,
    passwort: school.db_password_enc,
  });

  const currentSectionLabel = getCurrentSchoolYearLabel();
  const [schoolMetaResponse, yearGroupsResponse] = await Promise.all([
    client.get("/schule/stammdaten"),
    client.get("/jahrgaenge/jahrgangsdaten"),
  ]);
  diagnostics.connection_established = true;
  const externalSectionId = resolveExternalSectionId(extractSchoolSections(schoolMetaResponse?.data), currentSectionLabel);
  diagnostics.current_section_label = currentSectionLabel;
  diagnostics.current_section_id = Number(externalSectionId || 0);
  console.log(`[Pool-Schild-Import] ${schoolLabel}: aktueller Abschnitt ${currentSectionLabel}, externe Abschnitts-ID ${externalSectionId || "-"}`);
  if (!externalSectionId) {
    const error = new Error(`Fuer ${schoolLabel} wurde kein aktueller Abschnitt (${currentSectionLabel}) im SVWS-Server gefunden.`);
    error.statusCode = 400;
    error.diagnostics = diagnostics;
    throw error;
  }

  const yearGroupLookup = buildYearGroupLookup(normalizeYearGroupEntries(yearGroupsResponse?.data));
  const selectionResponse = await client.get(`/schueler/abschnitt/${encodeURIComponent(String(externalSectionId))}/auswahlliste`);
  const rawStudents = Array.isArray(selectionResponse?.data?.schueler) ? selectionResponse.data.schueler : extractRestArray(selectionResponse?.data);
  diagnostics.selection_count = Number(rawStudents.length || 0);
  console.log(`[Pool-Schild-Import] ${schoolLabel}: Auswahlliste enthaelt ${Number(rawStudents.length || 0)} Schueler`);
  const normalizedStudents = rawStudents
    .map((entry) => normalizeCurrentSelectionStudent(entry))
    .filter(Boolean);
  const statusTwoStudents = normalizedStudents
    .filter((student) => resolveStudentStatusValue(student?.status) === 2);
  diagnostics.status_2_count = statusTwoStudents.length;
  const gradeFourStudents = normalizedStudents
    .filter((student) => resolveStudentGrade(student, yearGroupLookup) === "4");
  diagnostics.grade_4_count = gradeFourStudents.length;
  const eligibleStudents = statusTwoStudents
    .filter((student) => resolveStudentGrade(student, yearGroupLookup) === "4");
  diagnostics.eligible_count = eligibleStudents.length;
  console.log(`[Pool-Schild-Import] ${schoolLabel}: ${eligibleStudents.length} Schueler mit Jahrgang 4 und Status 2 gefunden`);

  const rows = await mapWithConcurrency(eligibleStudents, async (student, index) => {
    const studentId = Number(student?.id || 0);
    const masterDataResponse = await client.get(`/schueler/${encodeURIComponent(String(studentId))}/stammdaten`);
    let learningSectionResponse = { data: null };
    try {
      learningSectionResponse = await client.get(
        `/schueler/${encodeURIComponent(String(studentId))}/abschnitt/${encodeURIComponent(String(externalSectionId))}/lernabschnittsdaten`,
      );
    } catch (error) {
      console.warn(explainSvwsLearningSectionError(error, schoolLabel, studentId, externalSectionId));
    }
    const masterData = normalizeSvwsStudentMasterData(masterDataResponse?.data);
    const learningSection = normalizeSvwsStudentLearningSectionData(learningSectionResponse?.data);
    const foerderschwerpunktId = firstDefinedValue(learningSection, ["foerderschwerpunkt1ID", "foerderschwerpunkt2ID"])
      || firstDefinedValue(student, ["foerderschwerpunkt1ID", "foerderschwerpunkt2ID"]);
    const hatFoerderbedarf = String(foerderschwerpunktId ?? "").trim() !== "";
    const hatZieldifferentenUnterricht = normalizeBoolean(
      learningSection?.hatZieldifferentenUnterricht ?? student?.zieldifferent,
    ) ? 1 : 0;
    const ef = resolveEfFromKlassenart(learningSection?.klassenart || student?.klassenart);
    console.log(
      `[Pool-Schild-Import] ${schoolLabel}: Kandidat ${index + 1}/${eligibleStudents.length} | ID ${studentId} | ${normalizeText(masterData?.nachname || student?.nachname)}, ${normalizeText(masterData?.vorname || student?.vorname)} | Foerder ${hatFoerderbedarf ? "1" : "0"} | ZD ${hatZieldifferentenUnterricht} | EF ${ef}`,
    );

    return buildPoolImportRowFromData(
      index + 1,
      {
        snr: school.snr,
        externe_schueler_id: normalizeText(masterData?.studentId || studentId),
        vorname: normalizeText(masterData?.vorname || student?.vorname),
        nachname: normalizeText(masterData?.nachname || student?.nachname),
        geburtsdatum: normalizeDate(masterData?.geburtsdatum || student?.geburtsdatum),
        strasse: normalizeText(masterData?.strasse),
        plz: normalizeText(masterData?.plz),
        ort: normalizeText(masterData?.ort),
        foerderbedarf: hatFoerderbedarf ? "1" : "0",
        zieldifferent: hatZieldifferentenUnterricht ? "1" : "0",
        ef: String(ef),
        klassenart: normalizeText(learningSection?.klassenart || student?.klassenart),
        foerderschwerpunkt_id: normalizeText(foerderschwerpunktId),
      },
      new Map([[school.snr, school]]),
    );
  }, 8);

  return { rows, diagnostics };
}

async function writeImportProtocol(pool, payload) {
  const columns = await loadTableColumns(pool, "anm_abgleich_protokoll");
  if (!columns.size) return;

  const insertColumns = [];
  const placeholders = [];
  const values = [];

  if (columns.has("verfahren_id")) {
    insertColumns.push("verfahren_id");
    placeholders.push("?");
    values.push(payload.verfahren_id);
  }
  if (columns.has("runde_id")) {
    insertColumns.push("runde_id");
    placeholders.push("?");
    values.push(payload.runde_id);
  }
  if (columns.has("snr")) {
    insertColumns.push("snr");
    placeholders.push("?");
    values.push(payload.snr);
  }
  if (columns.has("import_typ")) {
    insertColumns.push("import_typ");
    placeholders.push("?");
    values.push("ANMELDUNG");
  }
  if (columns.has("abrufzeitpunkt")) {
    insertColumns.push("abrufzeitpunkt");
    placeholders.push("NOW()");
  }
  if (columns.has("status_code")) {
    insertColumns.push("status_code");
    placeholders.push("?");
    values.push(payload.status_code);
  }
  if (columns.has("status")) {
    insertColumns.push("status");
    placeholders.push("?");
    values.push(payload.status_code);
  }
  if (columns.has("message")) {
    insertColumns.push("message");
    placeholders.push("?");
    values.push(normalizeText(payload.message) || null);
  }
  if (columns.has("fehlermeldung")) {
    insertColumns.push("fehlermeldung");
    placeholders.push("?");
    values.push(normalizeText(payload.message) || null);
  }
  if (columns.has("rows_read")) {
    insertColumns.push("rows_read");
    placeholders.push("?");
    values.push(Number(payload.rows_read || 0));
  }
  if (columns.has("anzahl_datensaetze")) {
    insertColumns.push("anzahl_datensaetze");
    placeholders.push("?");
    values.push(Number(payload.rows_read || 0));
  }
  if (columns.has("imported_rows")) {
    insertColumns.push("imported_rows");
    placeholders.push("?");
    values.push(Number(payload.imported_rows || 0));
  }
  if (columns.has("error_rows")) {
    insertColumns.push("error_rows");
    placeholders.push("?");
    values.push(Number(payload.error_rows || 0));
  }

  if (!insertColumns.length) return;

  await pool.query(
    `
    INSERT INTO anm_abgleich_protokoll (${insertColumns.join(", ")})
    VALUES (${placeholders.join(", ")})
    `,
    values,
  );
}

async function importAnmeldungenForSchool(connection, payload) {
  const verfahrenId = Number(payload?.verfahren_id || 0);
  const rundeId = Number(payload?.runde_id || 0);
  const snr = normalizeText(payload?.snr);
  const preview = payload?.preview;
  const selectedRowNumbers = Array.isArray(payload?.selected_row_numbers)
    ? payload.selected_row_numbers.map((value) => Number(value || 0)).filter((value) => value > 0)
    : [];

  if (!verfahrenId) {
    const error = new Error("verfahren_id ist erforderlich.");
    error.statusCode = 400;
    throw error;
  }
  if (!rundeId) {
    const error = new Error("runde_id ist erforderlich.");
    error.statusCode = 400;
    throw error;
  }
  await assertWritableContext(connection, verfahrenId, rundeId);
  if (!snr) {
    const error = new Error("snr ist erforderlich.");
    error.statusCode = 400;
    throw error;
  }
  if (!preview || Number(preview.verfahren_id || 0) !== verfahrenId || Number(preview.runde_id || 0) !== rundeId) {
    const error = new Error("Die Vorschau ist abgelaufen oder nicht mehr vorhanden.");
    error.statusCode = 409;
    throw error;
  }

  const schoolBySnr = await loadProcedureSchoolLookup(connection, verfahrenId);
  const school = schoolBySnr.get(snr);
  if (!school) {
    const error = new Error("snr gehoert nicht zum aktuellen Verfahren.");
    error.statusCode = 400;
    throw error;
  }
  if (!school.active) {
    const error = new Error("Inaktive Schulen duerfen nicht importiert werden.");
    error.statusCode = 400;
    throw error;
  }

  const statusByCode = await loadCatalogByCode(connection, "anm_kat_anmeldestatus");
  const selectedSet = new Set(selectedRowNumbers);
  const relevantRows = (preview.rows || []).filter((row) => normalizeText(row?.data?.snr) === snr);
  const schoolRows = relevantRows.filter((row) => (
    row?.valid && (selectedSet.size === 0 || selectedSet.has(Number(row?.row_number || 0)))
  ));
  const invalidRows = relevantRows.filter((row) => !row?.valid).length;

  let insertedApplications = 0;
  let updatedApplications = 0;
  let errorRows = 0;
  let createdStudents = 0;
  let createdOpenCases = 0;
  const rowErrors = [];

  await connection.beginTransaction();
  try {
    for (const row of schoolRows) {
      const counterSnapshot = { insertedApplications, updatedApplications, createdStudents, createdOpenCases };
      await connection.query("SAVEPOINT phase3a_import_row");
      try {
        const status = statusByCode.get(normalizeTextLower(row.data.anmeldestatus_code));
        if (!status?.id) throw new Error("Anmeldestatus konnte nicht aufgeloest werden.");

        const externalId = row.data.externe_schueler_id;
        const schuelerResult = await upsertSchuelerForAnmeldungImport(connection, {
          verfahren_id: verfahrenId,
          runde_id: rundeId,
          snr,
          externe_schueler_id: externalId,
          vorname: row.data.vorname,
          nachname: row.data.nachname,
          geburtsdatum: row.data.geburtsdatum,
          foerderbedarf: row.data.foerderbedarf,
          zieldifferent: row.data.zieldifferent,
          anmeldestatus_code: row.data.anmeldestatus_code,
        });
        if (schuelerResult.created) {
          createdStudents += 1;
        }
        if (schuelerResult.school_change_case) {
          createdOpenCases += 1;
        }

        if (schuelerResult.created) insertedApplications += 1;
        else updatedApplications += 1;

        if (["WARTELISTE", "ABLEHNUNG"].includes(row.data.anmeldestatus_code)) {
          const openCaseResult = await ensureSek1OpenCaseByCode(connection, {
            verfahren_id: verfahrenId,
            schueler_id: Number(schuelerResult.id),
            fallgrund_code: row.data.anmeldestatus_code,
          });
          if (openCaseResult.created || openCaseResult.updated) createdOpenCases += 1;
        }

        await connection.query("RELEASE SAVEPOINT phase3a_import_row");
      } catch (error) {
        await connection.query("ROLLBACK TO SAVEPOINT phase3a_import_row");
        await connection.query("RELEASE SAVEPOINT phase3a_import_row");
        ({ insertedApplications, updatedApplications, createdStudents, createdOpenCases } = counterSnapshot);
        errorRows += 1;
        rowErrors.push({
          row_number: Number(row?.row_number || 0),
          externe_schueler_id: normalizeText(row?.data?.externe_schueler_id),
          message: error?.message || "Unbekannter Fehler",
        });
      }
    }

    const successfulRows = insertedApplications + updatedApplications;
    if (successfulRows === 0) {
      const detailText = rowErrors.slice(0, 3).map((entry) => `Zeile ${entry.row_number}: ${entry.message}`).join(" | ");
      const error = new Error(detailText
        ? `Keine neue Anmeldung. ${detailText}`
        : "Keine neue Anmeldung.");
      error.statusCode = 422;
      throw error;
    }

    await writeImportProtocol(connection, {
      verfahren_id: verfahrenId,
      runde_id: rundeId,
      snr,
      status_code: errorRows > 0 ? "WARNUNG" : "OK",
      message: errorRows > 0 ? "Mindestens eine Zeile konnte nicht importiert werden." : "CSV-Import erfolgreich abgeschlossen.",
      rows_read: relevantRows.length,
      imported_rows: successfulRows,
      error_rows: errorRows + invalidRows,
    });

    await connection.commit();
    return {
      snr,
      imported_rows: insertedApplications,
      updated_rows: updatedApplications,
      created_students: createdStudents,
      created_open_cases: createdOpenCases,
      skipped_rows: relevantRows.length - schoolRows.length,
      error_rows: errorRows + invalidRows,
      rows_read: relevantRows.length,
      school_name: school.name,
    };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  }
}

function createImporteController({ getPool }) {
  return {
    anmSchuelerImportSchema: async (req, res) => {
      try {
        const verfahrenId = Number(req.query?.verfahren_id || 0);
        const rundeId = Number(req.query?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");
        const pool = getPool();
        await assertProcedureType(pool, verfahrenId, ["GS", "SEK1"], "Der Pool-Import ist nur fuer GS- oder SEK1-Verfahren verfuegbar.");
        const schuelerColumns = await loadTableColumns(pool, "anm_schueler");
        const verfahrenstyp = await loadProcedureType(pool, verfahrenId);
        return res.json({
          fields: getPoolImportFieldDefinitions(schuelerColumns, verfahrenstyp),
        });
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Das Importschema konnte nicht geladen werden.");
      }
    },

    anmSchuelerImportValidate: async (req, res) => {
      try {
        const verfahrenId = Number(req.body?.verfahren_id || 0);
        const rundeId = Number(req.body?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");

        const pool = getPool();
        await assertProcedureType(pool, verfahrenId, ["GS", "SEK1"], "Der Pool-Import ist nur fuer GS- oder SEK1-Verfahren verfuegbar.");
        const validation = await validatePoolImportRows(pool, req.body || {});
        const session = storePreview(anmSchuelerImportSessions, {
          verfahren_id: verfahrenId,
          runde_id: rundeId,
          import_art: req.body?.import_art || "pool",
          source_art: normalizeText(req.body?.source_art || req.body?.herkunft_art).toUpperCase() || "POOL",
          mapping: req.body?.mapping || {},
          rows: validation.rows,
        });
        return res.json({
          validation_token: session.token,
          expires_at: new Date(session.expires_at).toISOString(),
          rows: validation.rows,
          summary: validation.summary,
        });
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Die Validierung des CSV-Imports ist fehlgeschlagen.");
      }
    },

    anmSchuelerImportExecute: async (req, res) => {
      const connection = await getPool().getConnection();
      try {
        const verfahrenId = Number(req.body?.verfahren_id || 0);
        const rundeId = Number(req.body?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");
        await assertWritableContext(connection, verfahrenId, rundeId);
        await assertProcedureType(connection, verfahrenId, ["GS", "SEK1"], "Der Pool-Import ist nur fuer GS- oder SEK1-Verfahren verfuegbar.");

        const validation = getPreview(anmSchuelerImportSessions, req.body?.validation_token);
        if (!validation) return sendError(res, 409, "Die Validierung ist abgelaufen oder nicht mehr vorhanden.");
        if (Number(validation?.verfahren_id || 0) !== verfahrenId || Number(validation?.runde_id || 0) !== rundeId) {
          return sendError(res, 409, "Die Validierung passt nicht mehr zur aktuellen Runde.");
        }

        const selectedRowNumbers = Array.isArray(req.body?.selected_row_numbers)
          ? req.body.selected_row_numbers.map((value) => Number(value || 0)).filter((value) => value > 0)
          : [];
        if (!selectedRowNumbers.length) {
          return sendError(res, 400, "Bitte mindestens eine gueltige Zeile fuer den Import auswaehlen.");
        }

        const selectedSet = new Set(selectedRowNumbers);
        const rows = (validation.rows || []).filter((row) => selectedSet.has(Number(row?.row_number || 0)) && row?.status !== "fehler");
        if (!rows.length) {
          return sendError(res, 400, "Es wurden keine importierbaren Zeilen ausgewaehlt.");
        }

        await connection.beginTransaction();
        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        let errors = 0;
        const rowResults = [];

        for (const row of rows) {
          await connection.query("SAVEPOINT phase3a_import_row");
          try {
            const result = await upsertAnmSchuelerCsvImportV3(connection, {
              verfahren_id: verfahrenId,
              runde_id: rundeId,
              import_art: validation.import_art || "pool",
              source_art: validation.source_art || "POOL",
              row: row.data,
              mapping: validation.mapping || {},
            });
            if (result.action === "INSERT") inserted += 1;
            else updated += 1;
            rowResults.push({
              row_number: Number(row.row_number || 0),
              action: result.action,
              message: result.unknown_school_case
                ? "Datensatz importiert. Offener Fall wegen unbekannter anmeldeschule_snr erzeugt."
                : result.action === "INSERT" ? "Datensatz neu angelegt." : "Datensatz aktualisiert.",
            });
            await connection.query("RELEASE SAVEPOINT phase3a_import_row");
          } catch (error) {
            await connection.query("ROLLBACK TO SAVEPOINT phase3a_import_row");
            await connection.query("RELEASE SAVEPOINT phase3a_import_row");
            errors += 1;
            rowResults.push({
              row_number: Number(row.row_number || 0),
              action: "FEHLER",
              message: error?.message || "Unbekannter Fehler",
            });
          }
        }

        skipped = (validation.rows || []).filter((row) => !selectedSet.has(Number(row?.row_number || 0)) || row?.status === "fehler").length;
        await connection.commit();
        anmSchuelerImportSessions.delete(normalizeText(req.body?.validation_token));

        return res.status(201).json({
          inserted,
          updated,
          skipped,
          errors,
          row_results: rowResults,
        });
      } catch (error) {
        await connection.rollback().catch(() => {});
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Der CSV-Import konnte nicht abgeschlossen werden.");
      } finally {
        connection.release();
      }
    },

    anmSchuelerAnmeldungenSchema: async (req, res) => {
      try {
        const verfahrenId = Number(req.query?.verfahren_id || 0);
        const rundeId = Number(req.query?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");
        const pool = getPool();
        await assertProcedureType(pool, verfahrenId, ["GS", "SEK1"], "Der CSV-Anmeldungsimport ist nur fuer GS- oder SEK1-Verfahren verfuegbar.");
        const schuelerColumns = await loadTableColumns(pool, "anm_schueler");
        return res.json({
          fields: getAnmeldungenImportFieldDefinitions(schuelerColumns),
          status_target_values: getAnmeldestatusTargetValues(),
        });
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Das Schema fuer den Anmeldungsimport konnte nicht geladen werden.");
      }
    },

    anmSchuelerAnmeldungenValidate: async (req, res) => {
      try {
        const verfahrenId = Number(req.body?.verfahren_id || 0);
        const rundeId = Number(req.body?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");
        const pool = getPool();
        await assertProcedureType(pool, verfahrenId, ["GS", "SEK1"], "Der CSV-Anmeldungsimport ist nur fuer GS- oder SEK1-Verfahren verfuegbar.");
        const validation = await validateAnmeldungenImportRows(pool, req.body || {});
        const session = storePreview(anmSchuelerAnmeldungenImportSessions, {
          verfahren_id: verfahrenId,
          runde_id: rundeId,
          file_name: normalizeText(req.body?.file_name),
          mapping: req.body?.mapping || {},
          rows: validation.rows,
        });
        return res.json({
          validation_token: session.token,
          expires_at: new Date(session.expires_at).toISOString(),
          rows: validation.rows,
          summary: validation.summary,
        });
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Die Validierung des Anmeldungsimports ist fehlgeschlagen.");
      }
    },

    anmSchuelerAnmeldungenExecute: async (req, res) => {
      const connection = await getPool().getConnection();
      try {
        const verfahrenId = Number(req.body?.verfahren_id || 0);
        const rundeId = Number(req.body?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");
        await assertWritableContext(connection, verfahrenId, rundeId);
        await assertProcedureType(connection, verfahrenId, ["GS", "SEK1"], "Der CSV-Anmeldungsimport ist nur fuer GS- oder SEK1-Verfahren verfuegbar.");
        const validation = getPreview(anmSchuelerAnmeldungenImportSessions, req.body?.validation_token);
        if (!validation) return sendError(res, 409, "Die Validierung ist abgelaufen oder nicht mehr vorhanden.");
        if (Number(validation?.verfahren_id || 0) !== verfahrenId || Number(validation?.runde_id || 0) !== rundeId) {
          return sendError(res, 409, "Die Validierung passt nicht mehr zur aktuellen Runde.");
        }
        const selectedRowNumbers = Array.isArray(req.body?.selected_row_numbers)
          ? req.body.selected_row_numbers.map((value) => Number(value || 0)).filter((value) => value > 0)
          : [];
        if (!selectedRowNumbers.length) return sendError(res, 400, "Bitte mindestens eine gueltige Zeile auswaehlen.");

        const selectedSet = new Set(selectedRowNumbers);
        const rows = (validation.rows || []).filter((row) => selectedSet.has(Number(row?.row_number || 0)) && row?.status !== "fehler");
        if (!rows.length) return sendError(res, 400, "Es wurden keine importierbaren Zeilen ausgewaehlt.");

        await connection.beginTransaction();
        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        let errors = 0;
        let openCases = 0;
        let poolAnmeldung = 0;
        let nurAnmeldung = 0;
        const row_results = [];
        const validationRows = Array.isArray(validation.rows) ? validation.rows : [];
        const errorRows = validationRows.filter((row) => row?.status === "fehler");
        for (const row of errorRows) {
          const existingForError = row?.data?.externe_schueler_id
            ? await findExistingSchuelerRecord(connection, verfahrenId, rundeId, row.data.externe_schueler_id, row.data.anmeldeschule_snr)
            : null;
          const openCaseResult = await ensureSek1OpenCaseByCode(connection, {
            verfahren_id: verfahrenId,
            schueler_id: Number(existingForError?.id || 0),
            fallgrund_code: "ANMELDEFEHLER",
            note: buildSek1ImportErrorNote(row),
          });
          if (openCaseResult.created || openCaseResult.updated) openCases += 1;
        }
        for (const row of rows) {
          const counterSnapshot = { inserted, updated, openCases, poolAnmeldung, nurAnmeldung };
          await connection.query("SAVEPOINT phase3a_import_row");
          try {
            const result = await upsertAnmeldungenWizardImportV3(connection, {
              verfahren_id: verfahrenId,
              runde_id: rundeId,
              row: row.data,
              mapping: validation.mapping || {},
            });
            if (result.action === "INSERT") inserted += 1;
            else updated += 1;
            if (result.pool_match) poolAnmeldung += 1;
            else nurAnmeldung += 1;
            if (result.school_change_case) openCases += 1;
            if (result.unknown_school_case) openCases += 1;
            const hasStammdatenabweichung = Array.isArray(row?.changed_fields)
              && row.changed_fields.some((field) => ["vorname", "nachname", "geburtsdatum"].includes(String(field)));
            if (hasStammdatenabweichung) {
              const openCaseResult = await ensureSek1OpenCaseByCode(connection, {
                verfahren_id: verfahrenId,
                schueler_id: Number(result?.id || 0),
                fallgrund_code: "STAMMDATEN_ABWEICHUNG",
                note: buildStammdatenabweichungNote(row, validation.file_name),
              });
              if (openCaseResult.created || openCaseResult.updated) openCases += 1;
            }
            row_results.push({
              row_number: Number(row.row_number || 0),
              action: result.action,
              message: result.unknown_school_case
                ? "Datensatz importiert. Offener Fall wegen unbekannter anmeldeschule_snr erzeugt."
                : result.action === "INSERT" ? "Datensatz neu angelegt." : "Datensatz aktualisiert.",
            });
            await connection.query("RELEASE SAVEPOINT phase3a_import_row");
          } catch (error) {
            await connection.query("ROLLBACK TO SAVEPOINT phase3a_import_row");
            await connection.query("RELEASE SAVEPOINT phase3a_import_row");
            ({ inserted, updated, openCases, poolAnmeldung, nurAnmeldung } = counterSnapshot);
            errors += 1;
            row_results.push({
              row_number: Number(row.row_number || 0),
              action: "FEHLER",
              message: error?.message || "Unbekannter Fehler",
            });
          }
        }
        skipped = (validation.rows || []).filter((row) => !selectedSet.has(Number(row?.row_number || 0)) || row?.status === "fehler").length;
        await connection.commit();
        anmSchuelerAnmeldungenImportSessions.delete(normalizeText(req.body?.validation_token));
        return res.status(201).json({
          inserted,
          updated,
          skipped,
          errors,
          open_cases: openCases,
          pool_anmeldung: poolAnmeldung,
          nur_anmeldung: nurAnmeldung,
          row_results,
        });
      } catch (error) {
        await connection.rollback().catch(() => {});
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Der Anmeldungsimport konnte nicht abgeschlossen werden.");
      } finally {
        connection.release();
      }
    },

    poolStats: async (req, res) => {
      try {
        const verfahrenId = Number(req.query?.verfahren_id || 0);
        const rundeId = Number(req.query?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");

        const pool = getPool();
        const filters = ["s.verfahren_id = ?", "LOWER(TRIM(COALESCE(s.herkunft, ''))) = 'pool'"];
        const params = [verfahrenId];
        if (rundeId) { filters.push("sr.runde_id = ?"); params.push(rundeId); }
        const [rows] = await pool.query(
          `SELECT COUNT(DISTINCT s.id) AS pool_count
             FROM anm_schueler s
             JOIN anm_schueler_runde sr ON sr.schueler_id = s.id AND sr.verfahren_id = s.verfahren_id
            WHERE ${filters.join(" AND ")}`,
          params,
        );

        return res.json({
          pool_count: Number(rows?.[0]?.pool_count || 0),
        });
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Die Schuelerpool-Statistik konnte nicht geladen werden.");
      }
    },

    poolSchuelerList: async (req, res) => {
      try {
        const verfahrenId = Number(req.query?.verfahren_id || 0);
        const rundeId = Number(req.query?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");

        const pool = getPool();
        const rows = await loadPoolSchuelerRows(pool, verfahrenId, rundeId);
        const fieldComments = await loadSchuelerFieldComments(pool);
        return res.json({ rows, fieldComments });
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Die Pool-Schuelerliste konnte nicht geladen werden.");
      }
    },

    poolPreview: async (req, res) => {
      try {
        const csvText = String(req.body?.csv_text || "");
        const verfahrenId = Number(req.body?.verfahren_id || 0);
        const rundeId = Number(req.body?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");
        const pool = getPool();
        await assertProcedureType(pool, verfahrenId, ["GS", "SEK1"], "Die Pool-Vorschau ist nur fuer GS- oder SEK1-Verfahren verfuegbar.");
        const parsedRows = parseCsvText(csvText, [
          ["snr", "anmeldeschule_snr", "herkunftsschule_snr", "herkunftsschule_snr_nr"],
          "vorname",
          "nachname",
          "geburtsdatum",
          ["strasse", "straÃŸe", "street"],
          ["plz", "postleitzahl"],
          ["ort", "city"],
        ]);
        const verfahrenstyp = await loadProcedureType(pool, verfahrenId);
        const requiredSchoolRole = verfahrenstyp === "SEK1" ? "Quellschulen" : "Zielschulen";
        const schoolBySnr = await loadProcedureSchoolLookupByRole(pool, verfahrenId, requiredSchoolRole);
        const empfehlungByCode = await loadCatalogByCode(pool, "anm_kat_empfehlung");
        const ids = parsedRows
          .map((row) => normalizeText(row.getValue("externe_schueler_id")))
          .filter(Boolean);

        let existingStudents = [];
        if (ids.length > 0) {
          const [dbRows] = await pool.query(
            `SELECT s.id, x.externe_id AS externe_schueler_id,
                    s.vorname, s.nachname, s.geburtsdatum, s.foerderbedarf, s.zieldifferent,
                    s.notiz AS bemerkung, sr.anmeldestatus, sr.abgleich_status, s.empfehlung,
                    COALESCE(s.herkunftsschule_snr, sr.schul_nr, '') AS source_school_snr,
                    s.strasse, s.plz, s.ort
               FROM anm_schueler_externe_id x
               JOIN anm_schueler s ON s.id = x.schueler_id
               LEFT JOIN anm_schueler_runde sr
                 ON sr.schueler_id = s.id AND sr.verfahren_id = s.verfahren_id AND sr.runde_id = ?
              WHERE s.verfahren_id = ?
                AND x.herkunft_art = 'POOL'
                AND x.herkunft_snr_norm = ''
                AND x.externe_id IN (?)`,
            [rundeId, verfahrenId, ids],
          );
          existingStudents = dbRows || [];
        }
        const studentMap = new Map(existingStudents.map((student) => [normalizeText(student.externe_schueler_id), student]));

        const rows = parsedRows.map((row) => {
          const previewRow = buildPoolPreviewRow(row, schoolBySnr, empfehlungByCode);

          const idVal = normalizeText(previewRow.data.externe_schueler_id);
          if (!idVal || !studentMap.has(idVal)) {
            previewRow.import_status = "NEU";
          } else {
            const existing = studentMap.get(idVal);
            const matchesName = normalizeText(existing.vorname).toLowerCase() === normalizeText(previewRow.data.vorname).toLowerCase();
            const matchesSurname = normalizeText(existing.nachname).toLowerCase() === normalizeText(previewRow.data.nachname).toLowerCase();
            const matchesBirth = normalizeDate(existing.geburtsdatum) === normalizeDate(previewRow.data.geburtsdatum);
            const matchesFoerderbedarf = normalizeText(existing.foerderbedarf).toLowerCase() === normalizeText(previewRow.data.foerderbedarf).toLowerCase();
            const matchesZieldifferent = Number(existing.zieldifferent || 0) === normalizeBoolean(previewRow.data.zieldifferent);
            const matchesEmpfehlung = normalizeText(existing.empfehlung).toLowerCase() === normalizeText(previewRow.data.empfehlung).toLowerCase();
            const matchesSnr = normalizeText(existing.source_school_snr).toLowerCase() === normalizeText(previewRow.data.snr).toLowerCase();
            const matchesStrasse = normalizeText(existing.strasse).toLowerCase() === normalizeText(previewRow.data.strasse).toLowerCase();
            const matchesPlz = normalizeText(existing.plz).toLowerCase() === normalizeText(previewRow.data.plz).toLowerCase();
            const matchesOrt = normalizeText(existing.ort).toLowerCase() === normalizeText(previewRow.data.ort).toLowerCase();

            if (matchesName && matchesSurname && matchesBirth && matchesFoerderbedarf && matchesZieldifferent && matchesEmpfehlung && matchesSnr && matchesStrasse && matchesPlz && matchesOrt) {
              previewRow.import_status = "VORHANDEN";
            } else {
              previewRow.import_status = "UPDATE";
            }
          }
          return previewRow;
        });

        const session = storePreview(poolPreviewSessions, { rows });
        return res.json({
          preview_token: session.token,
          expires_at: new Date(session.expires_at).toISOString(),
          rows,
        });
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Die Vorschau fuer den Schuelerpool-Import ist fehlgeschlagen.");
      }
    },

    poolImport: async (req, res) => {
      const connection = await getPool().getConnection();
      try {
        const verfahrenId = Number(req.body?.verfahren_id || 0);
        const rundeId = Number(req.body?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");
        await assertWritableContext(connection, verfahrenId, rundeId);
        await assertProcedureType(connection, verfahrenId, ["GS", "SEK1"], "Der Pool-Import ist nur fuer GS- oder SEK1-Verfahren verfuegbar.");

        const preview = getPreview(poolPreviewSessions, req.body?.preview_token);
        if (!preview) return sendError(res, 409, "Die Vorschau ist abgelaufen oder nicht mehr vorhanden.");

        const selectedRowNumbers = Array.isArray(req.body?.selected_row_numbers)
          ? req.body.selected_row_numbers.map((value) => Number(value || 0)).filter((value) => value > 0)
          : [];
        if (!selectedRowNumbers.length) return sendError(res, 400, "Bitte mindestens eine Zeile fuer den Import auswaehlen.");

        const selectedSet = new Set(selectedRowNumbers);
        const rows = (preview.rows || []).filter((row) => selectedSet.has(Number(row?.row_number || 0)) && row?.valid);
        if (!rows.length) return sendError(res, 400, "Es wurden keine gueltigen Zeilen fuer den Import ausgewaehlt.");

        await connection.beginTransaction();
        let importedStudents = 0;
        let updatedStudents = 0;
        const createdOpenCases = 0;

        for (const row of rows) {
          const studentResult = await upsertStudent(connection, {
            verfahren_id: verfahrenId,
            runde_id: rundeId,
            source_art: "POOL",
            row: row.data,
          });
          if (studentResult.updated) updatedStudents += 1;
          else importedStudents += 1;
        }

        await connection.commit();
        poolPreviewSessions.delete(normalizeText(req.body?.preview_token));

        return res.status(201).json({
          rows_read: Number((preview.rows || []).length),
          imported_students: importedStudents,
          updated_students: updatedStudents,
          created_open_cases: createdOpenCases,
          skipped_rows: Number((preview.rows || []).length) - rows.length,
          error_rows: Number((preview.rows || []).filter((row) => !row?.valid).length),
        });
      } catch (error) {
        await connection.rollback().catch(() => {});
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Der Schuelerpool-Import ist fehlgeschlagen.");
      } finally {
        connection.release();
      }
    },

    updatePoolSchueler: async (req, res) => {
      try {
        const rowId = Number(req.params?.id || 0);
        if (!rowId) return sendError(res, 400, "id ist erforderlich.");
        await assertStudentWritable(getPool(), rowId);
        await updatePoolSchuelerRow(getPool(), rowId, req.body || {});
        return res.json({ message: "Datensatz wurde gespeichert." });
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Der Datensatz konnte nicht gespeichert werden.");
      }
    },

    deletePoolSchueler: async (req, res) => {
      try {
        const rowId = Number(req.params?.id || 0);
        if (!rowId) return sendError(res, 400, "id ist erforderlich.");
        await assertStudentWritable(getPool(), rowId);
        await deletePoolSchuelerRow(getPool(), rowId);
        return res.json({ message: "Datensatz wurde geloescht." });
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Der Datensatz konnte nicht geloescht werden.");
      }
    },

    importJg4ausSchild: async (req, res) => {
      try {
        const verfahrenId = Number(req.body?.verfahren_id || 0);
        const rundeId = Number(req.body?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");
        console.log(`[Pool-Schild-Import] Starte Import fuer Verfahren ${verfahrenId}, Runde ${rundeId}`);
        const pool = getPool();
        await assertWritableContext(pool, verfahrenId, rundeId);
        await assertProcedureType(pool, verfahrenId, ["SEK1"], "Der JG4-Schild-Import ist nur fuer SEK1-Verfahren verfuegbar.");
        const schoolBySnr = await loadProcedureSchoolLookupByRole(pool, verfahrenId, "Quellschulen");
        console.log(`[Pool-Schild-Import] ${schoolBySnr.size} Quellschulen fuer das Verfahren gefunden`);
        const resultBySchool = [];
        let totalRowsRead = 0;
        let totalImportedStudents = 0;
        let totalUpdatedStudents = 0;
        let totalSkippedRows = 0;
        let totalErrorRows = 0;
        let totalLeCount = 0;
        let totalZdCount = 0;
        let totalEfCount = 0;
        const updatedMessages = [];
        const duplicateIdConflicts = [];

        for (const school of schoolBySnr.values()) {
          console.log(`[Pool-Schild-Import] Verarbeite Schule ${school.name || "-"} (${school.snr}) | aktiv=${school.active ? "ja" : "nein"}`);
          if (!school.active) {
            resultBySchool.push({
              snr: school.snr,
              imported_students: 0,
              updated_students: 0,
              created_open_cases: 0,
              skipped_rows: 0,
              error_rows: 0,
              rows_read: 0,
              skipped: true,
              diagnostics: {
                school_name: normalizeText(school?.name),
                school_snr: normalizeText(school?.snr),
                host: normalizeText(school?.db_host),
                db_name: normalizeText(school?.db_name),
                connection_established: false,
                current_section_label: "",
                current_section_id: 0,
                selection_count: 0,
                status_2_count: 0,
                grade_4_count: 0,
                eligible_count: 0,
              },
              message: "Schule ist inaktiv.",
            });
            continue;
          }

          try {
            const fetchResult = await fetchSvwsPoolJg4RowsForSchool(pool, school, verfahrenId, rundeId);
            const rows = Array.isArray(fetchResult?.rows) ? fetchResult.rows : [];
            const diagnostics = fetchResult?.diagnostics || {
              school_name: normalizeText(school?.name),
              school_snr: normalizeText(school?.snr),
              host: normalizeText(school?.db_host),
              db_name: normalizeText(school?.db_name),
              connection_established: false,
              current_section_label: "",
              current_section_id: 0,
              selection_count: 0,
              status_2_count: 0,
              grade_4_count: 0,
              eligible_count: 0,
            };
            const rowsRead = Number(rows.length || 0);
            const validRows = rows.filter((row) => row?.valid);
            const invalidRows = rows.filter((row) => !row?.valid);
            const leCount = validRows.filter((row) => normalizeBoolean(row?.data?.foerderbedarf)).length;
            const zdCount = validRows.filter((row) => normalizeBoolean(row?.data?.zieldifferent)).length;
            const efCount = validRows.filter((row) => normalizeBoolean(row?.data?.ef)).length;
            console.log(`[Pool-Schild-Import] ${school.snr}: ${rowsRead} Zeilen gelesen | ${validRows.length} gueltig | ${invalidRows.length} ungueltig`);
            totalRowsRead += rowsRead;

            if (!rowsRead) {
              console.log(`[Pool-Schild-Import] ${school.snr}: keine passenden Schueler gefunden`);
              resultBySchool.push({
                snr: school.snr,
                imported_students: 0,
                updated_students: 0,
                created_open_cases: 0,
                skipped_rows: 0,
                error_rows: 0,
                le_count: 0,
                zd_count: 0,
                ef_count: 0,
                rows_read: 0,
                skipped: false,
                diagnostics,
                message: "Keine Schueler mit Jahrgang 4 und Status 2 im aktuellen Abschnitt gefunden.",
              });
              continue;
            }

            if (!validRows.length) {
              totalErrorRows += invalidRows.length;
              console.log(`[Pool-Schild-Import] ${school.snr}: keine gueltigen Datensaetze fuer den Import`);
              resultBySchool.push({
                snr: school.snr,
                imported_students: 0,
                updated_students: 0,
                created_open_cases: 0,
                skipped_rows: 0,
                error_rows: invalidRows.length,
                le_count: leCount,
                zd_count: zdCount,
                ef_count: efCount,
                rows_read: rowsRead,
                skipped: false,
                diagnostics,
                message: invalidRows[0]?.errors?.join(", ") || "Keine gueltigen Schild-Pooldaten gefunden.",
              });
              continue;
            }

            const connection = await pool.getConnection();
            try {
              await connection.beginTransaction();
              let importedStudents = 0;
              let updatedStudents = 0;
              let duplicateConflictCount = 0;
              const schoolUpdatedMessages = [];

              for (const row of validRows) {
                console.log(
                  `[Pool-Schild-Import] ${school.snr}: importiere Schueler ${row?.data?.externe_schueler_id || "-"} | ${row?.data?.nachname || "-"}, ${row?.data?.vorname || "-"}`,
                );
                const studentResult = await upsertStudent(connection, {
                  verfahren_id: verfahrenId,
                  runde_id: rundeId,
                  source_art: "SCHILD",
                  row: row.data,
                });
                if (studentResult?.conflict) {
                  duplicateConflictCount += 1;
                  const conflictDetail = {
                    externe_schueler_id: normalizeText(studentResult?.conflict_detail?.externe_schueler_id || row?.data?.externe_schueler_id),
                    nachname: normalizeText(studentResult?.conflict_detail?.nachname || row?.data?.nachname),
                    vorname: normalizeText(studentResult?.conflict_detail?.vorname || row?.data?.vorname),
                    anmeldeschule_snr: normalizeText(studentResult?.conflict_detail?.anmeldeschule_snr || school?.snr),
                    schulname: normalizeText(school?.name),
                  };
                  duplicateIdConflicts.push(conflictDetail);
                  console.warn(
                    `[Pool-Schild-Import] ${school.snr}: Doppelte externe Schueler-ID ${conflictDetail.externe_schueler_id} erkannt | ${conflictDetail.nachname}, ${conflictDetail.vorname} | ${conflictDetail.anmeldeschule_snr} | ${conflictDetail.schulname}`,
                  );
                  continue;
                }
                if (studentResult.updated) {
                  updatedStudents += 1;
                  const updateMessage = `[Pool-Schild-Import] ${school.snr}: Schueler ${row?.data?.externe_schueler_id || "-"} aktualisiert`;
                  schoolUpdatedMessages.push(updateMessage);
                  updatedMessages.push(updateMessage);
                  console.log(updateMessage);
                } else {
                  importedStudents += 1;
                  console.log(`[Pool-Schild-Import] ${school.snr}: Schueler ${row?.data?.externe_schueler_id || "-"} neu angelegt`);
                }
              }

              await connection.commit();
              console.log(`[Pool-Schild-Import] ${school.snr}: Commit erfolgreich | neu=${importedStudents} | update=${updatedStudents}`);
              totalImportedStudents += importedStudents;
              totalUpdatedStudents += updatedStudents;
              totalSkippedRows += invalidRows.length + duplicateConflictCount;
              totalErrorRows += invalidRows.length + duplicateConflictCount;
              totalLeCount += leCount;
              totalZdCount += zdCount;
              totalEfCount += efCount;
              resultBySchool.push({
                snr: school.snr,
                imported_students: importedStudents,
                updated_students: updatedStudents,
                created_open_cases: 0,
                skipped_rows: invalidRows.length + duplicateConflictCount,
                error_rows: invalidRows.length + duplicateConflictCount,
                le_count: leCount,
                zd_count: zdCount,
                ef_count: efCount,
                rows_read: rowsRead,
                skipped: false,
                updated_messages: schoolUpdatedMessages,
                duplicate_id_conflicts: duplicateIdConflicts.filter((entry) => entry.anmeldeschule_snr === school.snr),
                diagnostics,
                message: "",
              });
            } catch (error) {
              await connection.rollback().catch(() => {});
              console.error(`[Pool-Schild-Import] ${school.snr}: Rollback wegen Fehler: ${error?.message || error}`);
              throw error;
            } finally {
              connection.release();
            }
          } catch (error) {
            console.error(`[Pool-Schild-Import] ${school.snr}: Fehler: ${error?.message || error}`);
            resultBySchool.push({
              snr: school.snr,
              imported_students: 0,
              updated_students: 0,
              created_open_cases: 0,
              skipped_rows: 0,
              error_rows: 0,
              le_count: 0,
              zd_count: 0,
              ef_count: 0,
              rows_read: 0,
              skipped: false,
              updated_messages: [],
              duplicate_id_conflicts: [],
              diagnostics: error?.diagnostics || {
                school_name: normalizeText(school?.name),
                school_snr: normalizeText(school?.snr),
                host: normalizeText(school?.db_host),
                db_name: normalizeText(school?.db_name),
                connection_established: false,
                current_section_label: "",
                current_section_id: 0,
                selection_count: 0,
                status_2_count: 0,
                grade_4_count: 0,
                eligible_count: 0,
              },
              message: error?.message || "Schild-Poolimport fehlgeschlagen.",
            });
          }
        }

        console.log(
          `[Pool-Schild-Import] Fertig | gelesen=${totalRowsRead} | neu=${totalImportedStudents} | update=${totalUpdatedStudents} | skipped=${totalSkippedRows} | fehler=${totalErrorRows}`,
        );
        return res.status(201).json({
          schools: resultBySchool,
          total_summary: {
            rows_read: totalRowsRead,
            imported_students: totalImportedStudents,
            updated_students: totalUpdatedStudents,
            created_open_cases: 0,
            skipped_rows: totalSkippedRows,
            error_rows: totalErrorRows,
            le_count: totalLeCount,
            zd_count: totalZdCount,
            ef_count: totalEfCount,
            updated_messages: updatedMessages,
            duplicate_id_conflicts: duplicateIdConflicts,
          },
          updated_messages: updatedMessages,
          duplicate_id_conflicts: duplicateIdConflicts,
        });
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Der Schild-Poolimport ist fehlgeschlagen.");
      }
    },

    anmeldungenSchulen: async (req, res) => {
      try {
        const verfahrenId = Number(req.query.verfahren_id || 0);
        const rundeId = Number(req.query.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");

        const pool = getPool();
        await assertProcedureType(pool, verfahrenId, ["GS", "SEK1"], "Der Anmeldungsimport ist nur fuer GS- oder SEK1-Verfahren verfuegbar.");
        const schoolBySnr = await loadProcedureSchoolLookup(pool, verfahrenId);
        const latestBySnr = await loadLatestImportProtocolBySchool(pool, verfahrenId);
        const schuelerFilters = [];
        const schuelerParams = [];

        schuelerFilters.push("sr.verfahren_id = ?");
        schuelerParams.push(verfahrenId);
        if (rundeId) {
          schuelerFilters.push("sr.runde_id = ?");
          schuelerParams.push(rundeId);
        }
        const schuelerWhereClause = schuelerFilters.length
          ? `WHERE ${schuelerFilters.join(" AND ")}`
          : "";
        const schuelerStatJoin = `
          LEFT JOIN (
            SELECT
              sr.schul_nr AS snr,
              SUM(CASE WHEN LOWER(TRIM(COALESCE(sr.anmeldestatus, ''))) = 'neuaufnahme' THEN 1 ELSE 0 END) AS neuaufnahme,
              SUM(CASE WHEN LOWER(TRIM(COALESCE(sr.anmeldestatus, ''))) = 'warteliste' THEN 1 ELSE 0 END) AS warteliste
            FROM anm_schueler_runde sr
            ${schuelerWhereClause}
            GROUP BY sr.schul_nr
          ) stat
            ON stat.snr = vzs.snr
          `;
        const [capacityRows] = await pool.query(
          `
          SELECT
            vzs.snr,
            COALESCE(cap.kapazitaet, 0) AS kapazitaet,
            COALESCE(stat.neuaufnahme, 0) AS neuaufnahme,
            COALESCE(stat.warteliste, 0) AS warteliste
          FROM (
            SELECT DISTINCT sgs.snr
            FROM anm_verfahren_schulgruppe vsg
            JOIN anm_schulgruppe_schule sgs
              ON sgs.schulgruppe_id = vsg.schulgruppe_id
            WHERE vsg.verfahren_id = ?
              AND vsg.rolle = 'Zielschulen'
          ) vzs
          LEFT JOIN (
            SELECT
              k.snr,
              SUM(COALESCE(k.gesamtkapazitaet, 0)) AS kapazitaet
            FROM anm_kapazitaet k
            WHERE k.verfahren_id = ?
            GROUP BY k.snr
          ) cap
            ON cap.snr = vzs.snr
          ${schuelerStatJoin}
          `,
          [verfahrenId, verfahrenId, ...schuelerParams],
        );

        const metricsBySnr = new Map();
        for (const row of capacityRows || []) {
          const snr = normalizeText(row?.snr);
          if (!snr) continue;
          const kapazitaet = Number(row?.kapazitaet || 0);
          const neuaufnahme = Number(row?.neuaufnahme || 0);
          const warteliste = Number(row?.warteliste || 0);
          metricsBySnr.set(snr, {
            kapazitaet,
            neuaufnahme,
            warteliste,
            freie_plaetze: kapazitaet - neuaufnahme,
          });
        }

        const rows = [...schoolBySnr.values()].map((school) => {
          const metrics = metricsBySnr.get(school.snr) || {
            kapazitaet: 0,
            neuaufnahme: 0,
            warteliste: 0,
            freie_plaetze: 0,
          };
          return {
            snr: school.snr,
            name: school.name,
            active: school.active,
            last_import_at: latestBySnr.get(school.snr) || null,
            connection_status: buildConnectionStatus(school),
            kapazitaet: metrics.kapazitaet,
            neuaufnahme: metrics.neuaufnahme,
            warteliste: metrics.warteliste,
            freie_plaetze: metrics.freie_plaetze,
          };
        });
        return res.json({ rows });
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Die Schulen fuer den Anmeldungsimport konnten nicht geladen werden.");
      }
    },

    anmeldungenPreview: async (req, res) => {
      try {
        const verfahrenId = Number(req.body?.verfahren_id || 0);
        const rundeId = Number(req.body?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");

        const csvText = String(req.body?.csv_text || "");
        const parsedRows = parseCsvText(csvText, [
          ["anmeldeschule_snr", "snr"],
          "vorname",
          "nachname",
          ["anmeldestatus_code", "anmeldestatus"],
        ]);
        const pool = getPool();
        const schoolBySnr = await loadProcedureSchoolLookup(pool, verfahrenId);
        const statusByCode = await loadCatalogByCode(pool, "anm_kat_anmeldestatus");

        const rows = [];
        for (const parsedRow of parsedRows) {
          rows.push(await buildAnmeldungPreviewRow(parsedRow, schoolBySnr, statusByCode, pool, verfahrenId, rundeId));
        }

        const session = storePreview(anmeldungsPreviewSessions, {
          verfahren_id: verfahrenId,
          runde_id: rundeId,
          rows,
        });
        return res.json({
          preview_token: session.token,
          expires_at: new Date(session.expires_at).toISOString(),
          rows,
        });
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Die Vorschau fuer den Anmeldungsimport ist fehlgeschlagen.");
      }
    },

    anmeldungenImportSchool: async (req, res) => {
      const connection = await getPool().getConnection();
      try {
        const preview = getPreview(anmeldungsPreviewSessions, req.body?.preview_token);
        const result = await importAnmeldungenForSchool(connection, {
          verfahren_id: req.body?.verfahren_id,
          runde_id: req.body?.runde_id,
          snr: req.params.snr,
          preview,
          selected_row_numbers: req.body?.selected_row_numbers,
        });
        return res.status(201).json(result);
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Der Import fuer die Schule ist fehlgeschlagen.");
      } finally {
        connection.release();
      }
    },

    anmeldungenImportAll: async (req, res) => {
      try {
        const verfahrenId = Number(req.body?.verfahren_id || 0);
        const rundeId = Number(req.body?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");

        const preview = getPreview(anmeldungsPreviewSessions, req.body?.preview_token);
        if (!preview || Number(preview.verfahren_id || 0) !== verfahrenId || Number(preview.runde_id || 0) !== rundeId) {
          return sendError(res, 409, "Die Vorschau ist abgelaufen oder nicht mehr vorhanden.");
        }

        const schoolBySnr = await loadProcedureSchoolLookup(getPool(), verfahrenId);
        const resultBySchool = [];
        let totalImportedRows = 0;
        let totalUpdatedRows = 0;
        let totalCreatedStudents = 0;
        let totalCreatedOpenCases = 0;
        let totalSkippedRows = 0;
        let totalErrorRows = 0;

        for (const school of schoolBySnr.values()) {
          if (!school.active) {
            resultBySchool.push({
              snr: school.snr,
              imported_rows: 0,
              updated_rows: 0,
              created_students: 0,
              created_open_cases: 0,
              skipped_rows: 0,
              error_rows: 0,
              rows_read: 0,
              skipped: true,
              message: "Schule ist inaktiv.",
            });
            continue;
          }
          const connection = await getPool().getConnection();
          try {
            const payload = await importAnmeldungenForSchool(connection, {
              verfahren_id: verfahrenId,
              runde_id: rundeId,
              snr: school.snr,
              preview,
              selected_row_numbers: req.body?.selected_row_numbers,
            });
            const importedRows = Number(payload?.imported_rows || 0);
            const updatedRows = Number(payload?.updated_rows || 0);
            const createdStudents = Number(payload?.created_students || 0);
            const createdOpenCases = Number(payload?.created_open_cases || 0);
            const skippedRows = Number(payload?.skipped_rows || 0);
            const errorRows = Number(payload?.error_rows || 0);
            totalImportedRows += importedRows;
            totalUpdatedRows += updatedRows;
            totalCreatedStudents += createdStudents;
            totalCreatedOpenCases += createdOpenCases;
            totalSkippedRows += skippedRows;
            totalErrorRows += errorRows;
            resultBySchool.push({
              snr: school.snr,
              imported_rows: importedRows,
              updated_rows: updatedRows,
              created_students: createdStudents,
              created_open_cases: createdOpenCases,
              skipped_rows: skippedRows,
              error_rows: errorRows,
              rows_read: Number(payload?.rows_read || 0),
              skipped: false,
              message: "",
            });
          } catch (error) {
            const rowsRead = (preview.rows || []).filter((row) => normalizeText(row?.data?.snr) === school.snr).length;
            totalErrorRows += rowsRead;
            resultBySchool.push({
              snr: school.snr,
              imported_rows: 0,
              updated_rows: 0,
              created_students: 0,
              created_open_cases: 0,
              skipped_rows: 0,
              error_rows: rowsRead,
              rows_read: rowsRead,
              skipped: false,
              message: error?.message || "Import fehlgeschlagen.",
            });
          } finally {
            connection.release();
          }
        }

        if (totalImportedRows + totalUpdatedRows === 0) {
          return sendError(res, 422, "Keine neue Anmeldung.", {
            schools: resultBySchool,
          });
        }

        anmeldungsPreviewSessions.delete(normalizeText(req.body?.preview_token));

        return res.status(201).json({
          schools: resultBySchool,
          total_summary: {
            rows_read: Number((preview.rows || []).length),
            imported_rows: totalImportedRows,
            updated_rows: totalUpdatedRows,
            created_students: totalCreatedStudents,
            created_open_cases: totalCreatedOpenCases,
            skipped_rows: totalSkippedRows,
            error_rows: totalErrorRows,
          },
        });
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Der Import fuer alle Schulen ist fehlgeschlagen.");
      }
    },

    importiereAnmeldungenAusSchild3: async (req, res) => {
      try {
        const verfahrenId = Number(req.body?.verfahren_id || 0);
        const rundeId = Number(req.body?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");

        const pool = getPool();
        await assertWritableContext(pool, verfahrenId, rundeId);
        await assertProcedureType(pool, verfahrenId, ["GS", "SEK1"], "Der Schild3-Anmeldungsimport ist nur fuer GS- oder SEK1-Verfahren verfuegbar.");
        const schoolBySnr = await loadProcedureSchoolLookup(pool, verfahrenId);
        const statusByCode = await loadCatalogByCode(pool, "anm_kat_anmeldestatus");
        const resultBySchool = [];
        let totalRowsRead = 0;
        let totalImportedRows = 0;
        let totalUpdatedRows = 0;
        let totalCreatedStudents = 0;
        let totalCreatedOpenCases = 0;
        let totalSkippedRows = 0;
        let totalErrorRows = 0;

        for (const school of schoolBySnr.values()) {
          if (!school.active) {
            resultBySchool.push({
              snr: school.snr,
              imported_rows: 0,
              updated_rows: 0,
              created_students: 0,
              created_open_cases: 0,
              skipped_rows: 0,
              error_rows: 0,
              rows_read: 0,
              skipped: true,
              diagnostics: {
                school_name: normalizeText(school?.name),
                school_snr: normalizeText(school?.snr),
                host: normalizeText(school?.db_host),
                db_name: normalizeText(school?.db_name),
                connection_established: false,
                current_section_label: "",
                current_section_id: 0,
                selection_count: 0,
                status_0_count: 0,
                status_1_count: 0,
                status_2_count: 0,
                eligible_count: 0,
              },
              message: "Schule ist inaktiv.",
            });
            continue;
          }

          try {
            const previewResult = await fetchSvwsAnmeldungenPreviewRowsForSchool(
              pool,
              school,
              verfahrenId,
              rundeId,
              statusByCode,
            );
            const previewRows = Array.isArray(previewResult?.rows) ? previewResult.rows : [];
            const diagnostics = previewResult?.diagnostics || {
              school_name: normalizeText(school?.name),
              school_snr: normalizeText(school?.snr),
              host: normalizeText(school?.db_host),
              db_name: normalizeText(school?.db_name),
              connection_established: false,
              current_section_label: "",
              current_section_id: 0,
              selection_count: 0,
              status_0_count: 0,
              status_1_count: 0,
              status_2_count: 0,
              eligible_count: 0,
            };
            const rowsRead = Number(previewRows.length || 0);
            const validRows = previewRows.filter((row) => row?.valid);
            const invalidRows = previewRows.filter((row) => !row?.valid);
            totalRowsRead += rowsRead;

            if (!rowsRead) {
              resultBySchool.push({
                snr: school.snr,
                imported_rows: 0,
                updated_rows: 0,
                created_students: 0,
                created_open_cases: 0,
                skipped_rows: 0,
                error_rows: 0,
                rows_read: 0,
                skipped: false,
                diagnostics,
                message: "Keine Schueler mit Status 0 oder 1 im aktuellen Abschnitt gefunden.",
              });
              continue;
            }

            if (!validRows.length) {
              totalErrorRows += invalidRows.length;
              resultBySchool.push({
                snr: school.snr,
                imported_rows: 0,
                updated_rows: 0,
                created_students: 0,
                created_open_cases: 0,
                skipped_rows: 0,
                error_rows: invalidRows.length,
                rows_read: rowsRead,
                skipped: false,
                diagnostics,
                message: invalidRows[0]?.errors?.join(", ") || "Keine gueltigen SVWS-Anmeldungen gefunden.",
              });
              continue;
            }

            const connection = await pool.getConnection();
            try {
              const payload = await importAnmeldungenForSchool(connection, {
                verfahren_id: verfahrenId,
                runde_id: rundeId,
                snr: school.snr,
                preview: {
                  verfahren_id: verfahrenId,
                  runde_id: rundeId,
                  rows: previewRows,
                },
              });
              const importedRows = Number(payload?.imported_rows || 0);
              const updatedRows = Number(payload?.updated_rows || 0);
              const createdStudents = Number(payload?.created_students || 0);
              const createdOpenCases = Number(payload?.created_open_cases || 0);
              const skippedRows = Number(payload?.skipped_rows || 0);
              const errorRows = Number(payload?.error_rows || 0);
              totalImportedRows += importedRows;
              totalUpdatedRows += updatedRows;
              totalCreatedStudents += createdStudents;
              totalCreatedOpenCases += createdOpenCases;
              totalSkippedRows += skippedRows;
              totalErrorRows += errorRows;
              resultBySchool.push({
                snr: school.snr,
                imported_rows: importedRows,
                updated_rows: updatedRows,
                created_students: createdStudents,
                created_open_cases: createdOpenCases,
                skipped_rows: skippedRows,
                error_rows: errorRows,
                rows_read: Number(payload?.rows_read || rowsRead),
                skipped: false,
                diagnostics,
                message: "",
              });
            } finally {
              connection.release();
            }
          } catch (error) {
            resultBySchool.push({
              snr: school.snr,
              imported_rows: 0,
              updated_rows: 0,
              created_students: 0,
              created_open_cases: 0,
              skipped_rows: 0,
              error_rows: 0,
              rows_read: 0,
              skipped: false,
              diagnostics: error?.diagnostics || {
                school_name: normalizeText(school?.name),
                school_snr: normalizeText(school?.snr),
                host: normalizeText(school?.db_host),
                db_name: normalizeText(school?.db_name),
                connection_established: false,
                current_section_label: "",
                current_section_id: 0,
                selection_count: 0,
                status_0_count: 0,
                status_1_count: 0,
                status_2_count: 0,
                eligible_count: 0,
              },
              message: error?.message || "SVWS-Import fehlgeschlagen.",
            });
          }
        }

        return res.status(201).json({
          schools: resultBySchool,
          total_summary: {
            rows_read: totalRowsRead,
            imported_rows: totalImportedRows,
            updated_rows: totalUpdatedRows,
            created_students: totalCreatedStudents,
            created_open_cases: totalCreatedOpenCases,
            skipped_rows: totalSkippedRows,
            error_rows: totalErrorRows,
          },
        });
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Der Schild3-Import ist fehlgeschlagen.");
      }
    },

    rueckmeldungenMgValidate: async (req, res) => {
      try {
        const verfahrenId = Number(req.body?.verfahren_id || 0);
        const rundeId = Number(req.body?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");
        const pool = getPool();
        await assertWritableContext(pool, verfahrenId, rundeId);
        await assertProcedureType(pool, verfahrenId, ["GS", "SEK1"], "Der Import Rueckmeldungen MG ist nur fuer GS- oder SEK1-Verfahren verfuegbar.");
        const validation = await validateRueckmeldungenMgRows(pool, req.body || {});
        const session = storePreview(rueckmeldungenMgImportSessions, {
          verfahren_id: verfahrenId,
          runde_id: rundeId,
          rows: validation.rows,
          summary: validation.summary,
        });
        return res.json({
          validation_token: session.token,
          expires_at: new Date(session.expires_at).toISOString(),
          rows: validation.rows,
          summary: validation.summary,
        });
      } catch (error) {
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Die Rueckmeldungen MG konnten nicht validiert werden.");
      }
    },

    rueckmeldungenMgExecute: async (req, res) => {
      const connection = await getPool().getConnection();
      try {
        const verfahrenId = Number(req.body?.verfahren_id || 0);
        const rundeId = Number(req.body?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");
        await assertWritableContext(connection, verfahrenId, rundeId);
        await assertProcedureType(connection, verfahrenId, ["GS", "SEK1"], "Der Import Rueckmeldungen MG ist nur fuer GS- oder SEK1-Verfahren verfuegbar.");
        const validationToken = normalizeText(req.body?.validation_token);
        const validation = getPreview(rueckmeldungenMgImportSessions, validationToken);
        if (!validation) return sendError(res, 409, "Die Validierung ist abgelaufen oder nicht mehr vorhanden.");
        if (Number(validation.verfahren_id) !== verfahrenId || Number(validation.runde_id) !== rundeId) {
          return sendError(res, 409, "Die Validierung gehoert nicht zum ausgewaehlten Verfahren und zur ausgewaehlten Runde.");
        }
        const importableRows = (validation.rows || []).filter((row) => ["OK", "NEU"].includes(row.classification));
        const openCasesByKey = new Map();
        for (const row of validation.rows || []) {
          const studentId = Number(row?.matched_student?.id || 0);
          if (!studentId || !row?.exact_match) continue;
          if (row?.invalid_target_school_number) {
            openCasesByKey.set(`${studentId}:ANMELDEFEHLER`, { studentId, row, fallgrundCode: "ANMELDEFEHLER" });
          }
          if (row?.invalid_source_school_number) {
            openCasesByKey.set(`${studentId}:HERKUNFTSFEHLER`, { studentId, row, fallgrundCode: "HERKUNFTSFEHLER" });
          }
          if (row?.recommendation_mismatch) {
            openCasesByKey.set(`${studentId}:EMPFEHLUNG_ABWEICHUNG`, { studentId, row, fallgrundCode: "EMPFEHLUNG_ABWEICHUNG" });
          }
        }
        if (!importableRows.length && !openCasesByKey.size) {
          return sendError(res, 400, "Es sind keine importierbaren Datensaetze oder offenen Faelle vorhanden.");
        }

        await connection.beginTransaction();
        const rowResults = [];
        let openCases = 0;
        let inserted = 0;
        let updated = 0;
        for (const { studentId, row, fallgrundCode } of openCasesByKey.values()) {
          const isSourceError = fallgrundCode === "HERKUNFTSFEHLER";
          const isRecommendationError = fallgrundCode === "EMPFEHLUNG_ABWEICHUNG";
          const caseDetails = isRecommendationError
            ? `Empfehlung Datei: ${row.data?.empfehlung || "-"}, DB: ${row.matched_student?.empfehlung || "-"}`
            : [...(row.errors || []), ...(row.warnings || [])].filter((message) => {
              const normalizedMessage = normalizeTextLower(message);
              return isSourceError ? normalizedMessage.includes("abgebenden schule") : normalizedMessage.includes("aufnehmenden schule");
            }).join(" ");
          const noteParts = [
            `Rueckmeldungen MG, Zeile ${Number(row.row_number || 0)}`,
            `${row.data?.nachname || ""}, ${row.data?.vorname || ""}`.trim(),
            caseDetails,
          ].filter(Boolean);
          const openCaseResult = await ensureSek1OpenCaseByCode(connection, {
            verfahren_id: verfahrenId,
            schueler_id: studentId,
            fallgrund_code: fallgrundCode,
            note: noteParts.join(" | "),
          });
          if (openCaseResult.created || openCaseResult.updated) openCases += 1;
          rowResults.push({
            row_number: row.row_number,
            action: openCaseResult.created ? "OFFENER_FALL_ERSTELLT" : "OFFENER_FALL_AKTUALISIERT",
            message: `Offener Fall ${fallgrundCode} wurde angelegt bzw. aktualisiert.`,
          });
        }
        for (const row of importableRows) {
          const importResult = await importRueckmeldungMgStudent(connection, verfahrenId, rundeId, row);
          if (importResult.action === "INSERT") inserted += 1;
          else updated += 1;
          if (importResult.action === "INSERT" && row.invalid_source_school_number) {
            const openCaseResult = await ensureSek1OpenCaseByCode(connection, {
              verfahren_id: verfahrenId,
              schueler_id: importResult.id,
              fallgrund_code: "HERKUNFTSFEHLER",
              note: `Rueckmeldungen MG, Zeile ${Number(row.row_number || 0)} | ${row.data?.nachname || ""}, ${row.data?.vorname || ""} | Ungueltige Schulnummer der abgebenden Schule: ${row.data?.herkunftsschule_snr || "-"}`,
            });
            if (openCaseResult.created || openCaseResult.updated) openCases += 1;
          }
          rowResults.push({
            row_number: row.row_number,
            action: importResult.action === "INSERT" ? "NEU_ANGELEGT" : "AKTUALISIERT",
            message: importResult.action === "INSERT" ? "Schueler wurde neu angelegt und die Rueckmeldung uebernommen." : "Rueckmeldung wurde uebernommen.",
          });
        }
        await connection.commit();
        rueckmeldungenMgImportSessions.delete(validationToken);
        return res.status(201).json({
          success: true,
          inserted,
          updated,
          skipped: Number(validation.summary?.total || 0) - importableRows.length,
          not_found: Number(validation.summary?.not_found || 0),
          ambiguous: Number(validation.summary?.ambiguous || 0),
          validation_errors: Number(validation.summary?.validation_errors || 0),
          technical_errors: 0,
          open_cases: openCases,
          row_results: rowResults,
        });
      } catch (error) {
        await connection.rollback().catch(() => {});
        console.error(error);
        return sendError(res, error?.statusCode || 500, error?.message || "Der Import Rueckmeldungen MG konnte nicht abgeschlossen werden.");
      } finally {
        connection.release();
      }
    },

    clearSchuelerDaten: async (req, res) => {
      const verfahrenId = Number(req.query?.verfahren_id || 0);
      if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
      const pool = getPool();
      const connection = await pool.getConnection();
      try {
        await assertWritableContext(connection, verfahrenId);
        const [lockedRows] = await connection.query(
          `SELECT COUNT(*) AS beendete_runden
             FROM anm_runde
            WHERE verfahren_id = ?
              AND status = 'Beendet'`,
          [verfahrenId],
        );
        if (Number(lockedRows?.[0]?.beendete_runden || 0) > 0) {
          return sendError(res, 409, "Die Schuelerdaten koennen nicht geloescht werden, weil das Verfahren beendete Runden enthaelt.");
        }
        await connection.beginTransaction();

        const tableDeletionOrder = [
          "anm_schueler_abgleich",
          "anm_offener_fall",
          "anm_merkzettel",
          "anm_anmeldung",
          "anm_schueler_anmeldung",
          "anm_schueler",
        ];
        const tableColumnsByName = new Map();
        for (const tableName of [...tableDeletionOrder, "anm_schueler_pool"]) {
          tableColumnsByName.set(tableName, await loadTableColumns(connection, tableName));
        }

        const poolColumns = tableColumnsByName.get("anm_schueler_pool") || new Set();
        const poolReferenceTables = ["anm_schueler_abgleich", "anm_offener_fall", "anm_merkzettel", "anm_anmeldung"]
          .filter((tableName) => {
            const columns = tableColumnsByName.get(tableName) || new Set();
            return columns.has("verfahren_id") && columns.has("schueler_pool_id");
          });
        const legacyPoolIds = new Set();
        if (poolColumns.size > 0 && !poolColumns.has("verfahren_id")) {
          for (const tableName of poolReferenceTables) {
            const [referenceRows] = await connection.query(
              `SELECT DISTINCT schueler_pool_id AS id FROM ${tableName} WHERE verfahren_id = ? AND schueler_pool_id IS NOT NULL`,
              [verfahrenId],
            );
            for (const row of referenceRows || []) {
              const id = Number(row?.id || 0);
              if (id > 0) legacyPoolIds.add(id);
            }
          }
        }

        const deletedByTable = {};
        let deletedRows = 0;

        for (const tableName of tableDeletionOrder) {
          const tableColumns = tableColumnsByName.get(tableName) || new Set();
          if (tableColumns.size === 0) continue;
          if (!tableColumns.has("verfahren_id")) {
            const error = new Error(`${tableName} kann nicht sicher nach Verfahren geloescht werden, weil verfahren_id fehlt.`);
            error.statusCode = 500;
            throw error;
          }

          const [result] = await connection.query(`DELETE FROM ${tableName} WHERE verfahren_id = ?`, [verfahrenId]);
          const affectedRows = Number(result?.affectedRows || 0);
          deletedByTable[tableName] = affectedRows;
          deletedRows += affectedRows;
        }

        if (poolColumns.size > 0) {
          let poolResult = { affectedRows: 0 };
          if (poolColumns.has("verfahren_id")) {
            [poolResult] = await connection.query("DELETE FROM anm_schueler_pool WHERE verfahren_id = ?", [verfahrenId]);
          } else if (legacyPoolIds.size > 0) {
            const referenceGuards = poolReferenceTables.map(
              (tableName) => `NOT EXISTS (SELECT 1 FROM ${tableName} ref WHERE ref.schueler_pool_id = p.id)`,
            );
            [poolResult] = await connection.query(
              `DELETE p FROM anm_schueler_pool p WHERE p.id IN (?)${referenceGuards.length ? ` AND ${referenceGuards.join(" AND ")}` : ""}`,
              [[...legacyPoolIds]],
            );
          }
          const affectedRows = Number(poolResult?.affectedRows || 0);
          deletedByTable.anm_schueler_pool = affectedRows;
          deletedRows += affectedRows;
        }

        await connection.commit();
        poolPreviewSessions.clear();
        anmeldungsPreviewSessions.clear();
        anmSchuelerImportSessions.clear();
        rueckmeldungenMgImportSessions.clear();
        return res.json({
          success: true,
          message: `Alle Schuelerdaten des aktuellen Verfahrens (${deletedRows} Datensaetze) wurden erfolgreich geloescht.`,
          verfahren_id: verfahrenId,
          deleted_by_table: deletedByTable,
        });
      } catch (error) {
        await connection.rollback().catch(() => {});
        console.error("Error clearing student data:", error);
        return sendError(res, error?.statusCode || 500, error?.message || "Die Schuelerdaten konnten nicht geloescht werden.");
      } finally {
        connection.release();
      }
    },
  };
}

module.exports = createImporteController;

