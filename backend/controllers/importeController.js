const MAX_CSV_TEXT_LENGTH = 5 * 1024 * 1024;

const poolPreviewSessions = new Map();
const anmeldungsPreviewSessions = new Map();
const tableColumnCache = new Map();
const PREVIEW_TTL_MS = 30 * 60 * 1000;

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
  const text = normalizeText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
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

async function loadPoolSchuelerRows(pool, verfahrenId, rundeId) {
  const schuelerCols = await loadTableColumns(pool, "anm_schueler");
  if (!schuelerCols.size) return [];

  const studentIdColumn = schuelerCols.has("schueler_id")
    ? "s.schueler_id"
    : (schuelerCols.has("schueler_nr") ? "s.schueler_nr" : "''");

  const filters = [];
  const params = [];
  if (schuelerCols.has("verfahren_id")) {
    filters.push("s.verfahren_id = ?");
    params.push(verfahrenId);
  }
  if (rundeId && schuelerCols.has("runde_id")) {
    filters.push("s.runde_id = ?");
    params.push(rundeId);
  }
  if (schuelerCols.has("herkunft")) {
    filters.push("LOWER(TRIM(COALESCE(s.herkunft, ''))) = 'pool'");
  }
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `
    SELECT
      COALESCE(s.id, 0) AS schueler_id,
      COALESCE(s.vorname, '') AS vorname,
      COALESCE(s.nachname, '') AS nachname,
      DATE_FORMAT(s.geburtsdatum, '%Y-%m-%d') AS geburtsdatum,
      COALESCE(s.foerderbedarf, '') AS foerderbedarf,
      '' AS foerder_id,
      '' AS foerder_label,
      COALESCE(s.zieldifferent, 0) AS zieldifferent,
      COALESCE(s.herkunft, '') AS herkunft,
      COALESCE(s.abgleich_status, '') AS abgleich_status,
      COALESCE(s.anmeldestatus, '') AS anmeldestatus,
      ${schuelerCols.has("schul_nr") ? "NULLIF(TRIM(s.schul_nr), '')" : "''"} AS schulnummer,
      NULLIF(TRIM(${studentIdColumn}), '') AS schueler_schul_id,
      '' AS schule
    FROM anm_schueler s
    ${whereClause}
    ORDER BY COALESCE(s.nachname, '') ASC, COALESCE(s.vorname, '') ASC, COALESCE(s.id, 0) ASC
    `,
    params,
  );

  return (rows || []).map((row) => ({
    schueler_id: Number(row?.schueler_id || 0),
    vorname: normalizeText(row?.vorname),
    nachname: normalizeText(row?.nachname),
    geburtsdatum: row?.geburtsdatum || null,
    foerderbedarf: normalizeText(row?.foerderbedarf),
    foerder_id: normalizeText(row?.foerder_id),
    foerder_label: normalizeText(row?.foerder_label),
    zieldifferent: normalizeText(row?.zieldifferent),
    herkunft: normalizeText(row?.herkunft),
    abgleich_status: normalizeText(row?.abgleich_status),
    anmeldestatus: normalizeText(row?.anmeldestatus),
    schulnummer: normalizeText(row?.schulnummer),
    schueler_schul_id: normalizeText(row?.schueler_schul_id),
    schule: normalizeText(row?.schule),
  }));
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

async function loadProcedureSchoolLookup(pool, verfahrenId) {
  return loadProcedureSchoolLookupByRole(pool, verfahrenId, "Zielschulen");
}

async function loadProcedureSchoolLookupByRole(pool, verfahrenId, rolle) {
  const [rows] = await pool.query(
    `
    SELECT s.snr, s.name, s.is_active
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

async function findStudentCandidates(pool, data) {
  const vorname = normalizeText(data?.vorname);
  const nachname = normalizeText(data?.nachname);
  if (!vorname || !nachname) return [];

  const [rows] = await pool.query(
    `
    SELECT id, vorname, nachname, geburtsdatum, adresse, erzieher
    FROM anm_schueler_pool
    WHERE LOWER(TRIM(vorname)) = LOWER(TRIM(?))
      AND LOWER(TRIM(nachname)) = LOWER(TRIM(?))
    `,
    [vorname, nachname],
  );
  return rows || [];
}

async function matchStudent(pool, data) {
  const candidates = await findStudentCandidates(pool, data);
  const geburtsdatum = normalizeDate(data?.geburtsdatum);
  const adresse = normalizeTextLower(data?.adresse);
  const erzieher = normalizeTextLower(data?.erzieher);

  const byBirthdate = candidates.filter((row) => normalizeDate(row?.geburtsdatum) === geburtsdatum && geburtsdatum);
  if (byBirthdate.length === 1) {
    return { schueler_pool_id: Number(byBirthdate[0].id), match_status: "SICHER", match_hinweis: "Name + Geburtsdatum" };
  }

  const byAddress = candidates.filter((row) => normalizeTextLower(row?.adresse) === adresse && adresse);
  if (byAddress.length === 1) {
    return { schueler_pool_id: Number(byAddress[0].id), match_status: "SICHER", match_hinweis: "Name + Adresse" };
  }

  const byGuardian = candidates.filter((row) => normalizeTextLower(row?.erzieher) === erzieher && erzieher);
  if (byGuardian.length === 1) {
    return { schueler_pool_id: Number(byGuardian[0].id), match_status: "SICHER", match_hinweis: "Name + Erzieher" };
  }

  if (candidates.length === 1) {
    return { schueler_pool_id: Number(candidates[0].id), match_status: "UNSICHER", match_hinweis: "Nur Name" };
  }
  if (candidates.length > 1) {
    return { schueler_pool_id: null, match_status: "MEHRDEUTIG", match_hinweis: "Name mehrfach vorhanden" };
  }
  return { schueler_pool_id: null, match_status: "OFFEN", match_hinweis: "Kein Treffer" };
}

async function findExistingApplication(pool, verfahrenId, rundeId, snr, schuelerSchulId) {
  const columns = await loadTableColumns(pool, "anm_anmeldung");
  const selectColumns = ["id"];
  if (columns.has("schueler_pool_id")) {
    selectColumns.push("schueler_pool_id");
  }

  const [rows] = await pool.query(
    `
    SELECT ${selectColumns.join(", ")}
    FROM anm_anmeldung
    WHERE verfahren_id = ?
      AND runde_id = ?
      AND snr = ?
      AND schueler_schul_id = ?
    ORDER BY id DESC
    LIMIT 1
    `,
    [verfahrenId, rundeId, snr, schuelerSchulId],
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
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

async function findApplicationBySchuelerNr(pool, verfahrenId, rundeId, schuelerNr) {
  const normalizedSchuelerNr = normalizeText(schuelerNr);
  if (!verfahrenId || !rundeId || !normalizedSchuelerNr) return null;

  const [rows] = await pool.query(
    `
    SELECT
      a.id,
      a.anmeldestatus_id,
      COALESCE(NULLIF(TRIM(ast.bezeichnung), ''), NULLIF(TRIM(ast.code), '')) AS anmeldestatus_text
    FROM anm_anmeldung a
    LEFT JOIN anm_kat_anmeldestatus ast
      ON ast.id = a.anmeldestatus_id
    WHERE a.verfahren_id = ?
      AND a.runde_id = ?
      AND TRIM(a.schueler_schul_id) = ?
    ORDER BY a.id DESC
    LIMIT 1
    `,
    [verfahrenId, rundeId, normalizedSchuelerNr],
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function findExistingSchuelerRecord(pool, verfahrenId, rundeId, schuelerNr) {
  const normalizedSchuelerNr = normalizeText(schuelerNr);
  if (!verfahrenId || !rundeId || !normalizedSchuelerNr) return null;

  const [rows] = await pool.query(
    `
    SELECT id, herkunft, abgleich_status, anmeldestatus
    FROM anm_schueler
    WHERE verfahren_id = ?
      AND runde_id = ?
      AND (
        TRIM(schueler_id) = ?
        OR TRIM(COALESCE(schueler_nr, '')) = ?
      )
    ORDER BY id DESC
    LIMIT 1
    `,
    [verfahrenId, rundeId, normalizedSchuelerNr, normalizedSchuelerNr],
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function updateApplicationForCurrentRound(pool, applicationId, statusId, data) {
  const columns = await loadTableColumns(pool, "anm_anmeldung");
  const assignments = [];
  const values = [];

  if (columns.has("vorname")) {
    assignments.push("vorname = ?");
    values.push(normalizeText(data?.vorname));
  }
  if (columns.has("nachname")) {
    assignments.push("nachname = ?");
    values.push(normalizeText(data?.nachname));
  }
  if (columns.has("anmeldestatus_id")) {
    assignments.push("anmeldestatus_id = ?");
    values.push(statusId);
  }
  if (columns.has("match_status")) {
    assignments.push("match_status = ?");
    values.push("AKTUALISIERT");
  }
  if (columns.has("match_hinweis")) {
    assignments.push("match_hinweis = ?");
    values.push("Vorhandene Rueckmeldung in aktueller Runde aktualisiert");
  }
  if (columns.has("updated_at")) {
    assignments.push("updated_at = NOW()");
  }

  if (!assignments.length) {
    const error = new Error("anm_anmeldung enthaelt keine aktualisierbaren Spalten.");
    error.statusCode = 500;
    throw error;
  }

  values.push(Number(applicationId));
  await pool.query(
    `
    UPDATE anm_anmeldung
    SET ${assignments.join(", ")}
    WHERE id = ?
    `,
    values,
  );
}

async function insertApplicationForCurrentRound(pool, payload) {
  const columns = await loadTableColumns(pool, "anm_anmeldung");
  const insertColumns = [];
  const placeholders = [];
  const values = [];

  const add = (column, value) => {
    if (!columns.has(column)) return;
    insertColumns.push(column);
    placeholders.push("?");
    values.push(value);
  };

  add("verfahren_id", payload.verfahren_id);
  add("runde_id", payload.runde_id);
  add("snr", payload.snr);
  add("schueler_schul_id", payload.schueler_schul_id);
  add("vorname", normalizeText(payload.vorname));
  add("nachname", normalizeText(payload.nachname));
  add("anmeldestatus_id", payload.anmeldestatus_id);
  add("schueler_pool_id", payload.schueler_pool_id);
  add("match_status", payload.match_status);
  add("match_hinweis", payload.match_hinweis);

  if (!insertColumns.length) {
    const error = new Error("anm_anmeldung enthaelt keine importierbaren Spalten.");
    error.statusCode = 500;
    throw error;
  }

  await pool.query(
    `
    INSERT INTO anm_anmeldung (${insertColumns.join(", ")})
    VALUES (${placeholders.join(", ")})
    `,
    values,
  );
}

async function findExistingStudentByCsvId(pool, csvStudentId, options = {}) {
  const columns = await loadTableColumns(pool, "anm_schueler_pool");
  const verfahrenId = Number(options?.verfahrenId || 0);
  const snr = normalizeText(options?.snr);
  const schulId = normalizeText(csvStudentId);

  if (columns.has("verfahren_id") && columns.has("snr") && columns.has("schueler_schul_id") && verfahrenId && snr && schulId) {
    const [rows] = await pool.query(
      `
      SELECT id
      FROM anm_schueler_pool
      WHERE verfahren_id = ?
        AND snr = ?
        AND schueler_schul_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [verfahrenId, snr, schulId],
    );
    if (Array.isArray(rows) && rows.length) {
      return Number(rows[0].id);
    }
  }

  const normalizedId = normalizeInteger(csvStudentId);
  if (!normalizedId) return null;

  const [rows] = await pool.query(
    `
    SELECT id
    FROM anm_schueler_pool
    WHERE id = ?
    LIMIT 1
    `,
    [normalizedId],
  );
  return Array.isArray(rows) && rows.length ? Number(rows[0].id) : null;
}

async function updateStudentForApplicationImport(pool, studentId, data) {
  const columns = await loadTableColumns(pool, "anm_schueler_pool");
  const assignments = [];
  const values = [];

  if (columns.has("verfahren_id") && Number(data?.verfahren_id || 0) > 0) {
    assignments.push("verfahren_id = ?");
    values.push(Number(data.verfahren_id));
  }
  if (columns.has("snr") && normalizeText(data?.snr)) {
    assignments.push("snr = ?");
    values.push(normalizeText(data.snr));
  }
  if (columns.has("schueler_schul_id") && normalizeText(data?.schueler_schul_id)) {
    assignments.push("schueler_schul_id = ?");
    values.push(normalizeText(data.schueler_schul_id));
  }
  if (columns.has("foerderbedarf")) {
    assignments.push("foerderbedarf = ?");
    values.push(normalizeText(data?.foerderbedarf) || null);
  }
  if (columns.has("zieldifferent")) {
    assignments.push("zieldifferent = ?");
    values.push(normalizeBoolean(data?.zieldifferent));
  }
  if (!assignments.length) return;

  assignments.push("updated_at = NOW()");
  values.push(Number(studentId));

  await pool.query(
    `
    UPDATE anm_schueler_pool
    SET ${assignments.join(", ")}
    WHERE id = ?
    `,
    values,
  );
}

async function createStudentForApplicationImport(pool, data) {
  const columns = await loadTableColumns(pool, "anm_schueler_pool");
  const insertColumns = ["vorname", "nachname"];
  const placeholders = ["?", "?"];
  const values = [normalizeText(data?.vorname), normalizeText(data?.nachname)];

  const studentId = normalizeInteger(data?.schueler_schul_id);
  if (studentId) {
    insertColumns.push("id");
    placeholders.push("?");
    values.push(studentId);
  }

  if (columns.has("geburtsdatum")) {
    insertColumns.push("geburtsdatum");
    placeholders.push("?");
    values.push(normalizeDate(data?.geburtsdatum));
  }
  if (columns.has("verfahren_id") && Number(data?.verfahren_id || 0) > 0) {
    insertColumns.push("verfahren_id");
    placeholders.push("?");
    values.push(Number(data.verfahren_id));
  }
  if (columns.has("snr") && normalizeText(data?.snr)) {
    insertColumns.push("snr");
    placeholders.push("?");
    values.push(normalizeText(data.snr));
  }
  if (columns.has("schueler_schul_id") && normalizeText(data?.schueler_schul_id)) {
    insertColumns.push("schueler_schul_id");
    placeholders.push("?");
    values.push(normalizeText(data.schueler_schul_id));
  }
  if (columns.has("foerderbedarf")) {
    insertColumns.push("foerderbedarf");
    placeholders.push("?");
    values.push(normalizeText(data?.foerderbedarf) || null);
  }
  if (columns.has("zieldifferent")) {
    insertColumns.push("zieldifferent");
    placeholders.push("?");
    values.push(normalizeBoolean(data?.zieldifferent));
  }
  if (columns.has("notiz")) {
    insertColumns.push("notiz");
    placeholders.push("?");
    values.push(normalizeText(data?.notiz) || null);
  }
  if (columns.has("quelle")) {
    insertColumns.push("quelle");
    placeholders.push("?");
    values.push("Zuzug");
  }

  const [result] = await pool.query(
    `
    INSERT INTO anm_schueler_pool (${insertColumns.join(", ")})
    VALUES (${placeholders.join(", ")})
    `,
    values,
  );
  return studentId || Number(result.insertId);
}

async function upsertSchuelerForAnmeldungImport(pool, payload) {
  const verfahrenId = Number(payload?.verfahren_id || 0);
  const rundeId = Number(payload?.runde_id || 0);
  const schuelerNr = normalizeText(payload?.schueler_schul_id);
  const anmeldestatus = mapAnmeldestatusToSchuelerStatus(payload?.anmeldestatus_code);
  const existing = await findExistingSchuelerRecord(pool, verfahrenId, rundeId, schuelerNr);
  const abgleichStatus = hasPoolAbgleich(existing) ? "Pool + Anm" : "Nur Anmeldung";
  const schuelerColumns = await loadTableColumns(pool, "anm_schueler");

  if (existing) {
    const assignments = [
      "schueler_id = ?",
      "schueler_nr = ?",
      "schul_nr = ?",
      "abgleich_status = ?",
      "anmeldestatus = ?",
      "vorname = ?",
      "nachname = ?",
      "geburtsdatum = ?",
      "foerderbedarf = ?",
      "zieldifferent = ?",
    ];
    const values = [
      schuelerNr,
      schuelerNr,
      normalizeText(payload?.snr) || null,
      abgleichStatus,
      anmeldestatus,
      normalizeText(payload?.vorname) || null,
      normalizeText(payload?.nachname) || null,
      normalizeDate(payload?.geburtsdatum),
      normalizeText(payload?.foerderbedarf) || null,
      normalizeBoolean(payload?.zieldifferent),
    ];
    if (schuelerColumns.has("herkunft")) {
      assignments.push("herkunft = ?");
      values.push("Anmeldung");
    }
    values.push(Number(existing.id));
    await pool.query(
      `
      UPDATE anm_schueler
      SET ${assignments.join(", ")}, updated_at = NOW()
      WHERE id = ?
      `,
      values,
    );
    return { id: Number(existing.id), created: false, abgleich_status: abgleichStatus };
  }

  const insertColumns = [
    "verfahren_id",
    "runde_id",
    "schueler_id",
    "schueler_nr",
    "schul_nr",
    "abgleich_status",
    "anmeldestatus",
    "vorname",
    "nachname",
    "geburtsdatum",
    "foerderbedarf",
    "zieldifferent",
  ];
  const placeholders = ["?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?"];
  const values = [
    verfahrenId,
    rundeId,
    schuelerNr,
    schuelerNr,
    normalizeText(payload?.snr) || null,
    "Nur Anmeldung",
    anmeldestatus,
    normalizeText(payload?.vorname) || null,
    normalizeText(payload?.nachname) || null,
    normalizeDate(payload?.geburtsdatum),
    normalizeText(payload?.foerderbedarf) || null,
    normalizeBoolean(payload?.zieldifferent),
  ];
  if (schuelerColumns.has("herkunft")) {
    insertColumns.push("herkunft");
    placeholders.push("?");
    values.push("Anmeldung");
  }
  const [result] = await pool.query(
    `
    INSERT INTO anm_schueler (${insertColumns.join(", ")})
    VALUES (${placeholders.join(", ")})
    `,
    values,
  );
  return { id: Number(result.insertId || 0), created: true, abgleich_status: "Nur Anmeldung" };
}

async function rebuildSchuelerAbgleichForRound(connection, { verfahrenId, rundeId }) {
  const abgleichColumns = await loadTableColumns(connection, "anm_schueler_abgleich");
  if (!abgleichColumns.size) return;
  const poolColumns = await loadTableColumns(connection, "anm_schueler_pool");
  const useExtendedPoolMatch = poolColumns.has("verfahren_id") && poolColumns.has("snr") && poolColumns.has("schueler_schul_id");
  const poolJoin = useExtendedPoolMatch
    ? `sp.verfahren_id = sa.verfahren_id AND sp.snr = sa.snr AND sp.schueler_schul_id = sa.schueler_schul_id`
    : `sp.id = CAST(sa.schueler_schul_id AS SIGNED)`;
  const poolOnlyWhere = useExtendedPoolMatch
    ? `sp.verfahren_id = ? AND sa.id IS NULL`
    : `sa.id IS NULL`;

  const insertColumns = ["verfahren_id", "runde_id", "schueler_pool_id", "schueler_anmeldung_id", "abgleich_status", "abgleich_art"];
  const selectTail = [];
  if (abgleichColumns.has("bemerkung")) selectTail.push("NULL AS bemerkung");
  if (abgleichColumns.has("created_at")) selectTail.push("NOW() AS created_at");
  if (abgleichColumns.has("updated_at")) selectTail.push("NOW() AS updated_at");
  if (abgleichColumns.has("bemerkung")) insertColumns.push("bemerkung");
  if (abgleichColumns.has("created_at")) insertColumns.push("created_at");
  if (abgleichColumns.has("updated_at")) insertColumns.push("updated_at");

  await connection.query(
    `
    DELETE FROM anm_schueler_abgleich
    WHERE verfahren_id = ? AND runde_id = ?
    `,
    [verfahrenId, rundeId],
  );

  await connection.query(
    `
    -- 1. Treffer: Schueler existiert im Pool und in der Anmeldung
    INSERT INTO anm_schueler_abgleich
      (${insertColumns.join(", ")})
    SELECT
      sa.verfahren_id,
      sa.runde_id,
      sp.id AS schueler_pool_id,
      sa.id AS schueler_anmeldung_id,
      'GEFUNDEN' AS abgleich_status,
      'AUTOMATISCH' AS abgleich_art
      ${selectTail.length ? `, ${selectTail.join(", ")}` : ""}
    FROM anm_schueler_anmeldung sa
    LEFT JOIN anm_schueler_pool sp
      ON ${poolJoin}
    WHERE sa.verfahren_id = ? AND sa.runde_id = ?
      AND sp.id IS NOT NULL
    `,
    [verfahrenId, rundeId],
  );

  await connection.query(
    `
    -- 2. Nur Anmeldung: Schueler ist nicht im Pool
    INSERT INTO anm_schueler_abgleich
      (${insertColumns.join(", ")})
    SELECT
      sa.verfahren_id,
      sa.runde_id,
      NULL AS schueler_pool_id,
      sa.id AS schueler_anmeldung_id,
      'NUR_ANMELDUNG' AS abgleich_status,
      'AUTOMATISCH' AS abgleich_art
      ${selectTail.length ? `, ${selectTail.join(", ")}` : ""}
    FROM anm_schueler_anmeldung sa
    LEFT JOIN anm_schueler_pool sp
      ON ${poolJoin}
    WHERE sa.verfahren_id = ? AND sa.runde_id = ?
      AND sp.id IS NULL
    `,
    [verfahrenId, rundeId],
  );

  await connection.query(
    `
    -- 3. Nur Pool: Schueler hat keine Anmeldung
    INSERT INTO anm_schueler_abgleich
      (${insertColumns.join(", ")})
    SELECT
      ?,
      ?,
      sp.id AS schueler_pool_id,
      NULL AS schueler_anmeldung_id,
      'NUR_POOL' AS abgleich_status,
      'AUTOMATISCH' AS abgleich_art
      ${selectTail.length ? `, ${selectTail.join(", ")}` : ""}
    FROM anm_schueler_pool sp
    LEFT JOIN anm_schueler_anmeldung sa
      ON sa.verfahren_id = ?
      AND sa.runde_id = ?
      AND ${useExtendedPoolMatch ? "sp.verfahren_id = sa.verfahren_id AND sp.snr = sa.snr AND sp.schueler_schul_id = sa.schueler_schul_id" : "sp.id = CAST(sa.schueler_schul_id AS SIGNED)"}
    WHERE ${poolOnlyWhere}
    `,
    useExtendedPoolMatch
      ? [verfahrenId, rundeId, verfahrenId, rundeId, verfahrenId]
      : [verfahrenId, rundeId, verfahrenId, rundeId],
  );
}

async function ensureOpenCaseForStatus(pool, payload) {
  const anmeldestatusCode = normalizeText(payload?.anmeldestatus_code);
  if (!["WARTELISTE", "ABLEHNUNG"].includes(anmeldestatusCode)) {
    return { created: false };
  }

  const fallgrundByCode = await loadCatalogByCode(pool, "anm_kat_fallgrund");
  const fallgrund = fallgrundByCode.get(normalizeTextLower(anmeldestatusCode));
  if (!fallgrund?.id) {
    return { created: false };
  }

  return ensureOpenCase(pool, {
    verfahren_id: payload.verfahren_id,
    schueler_pool_id: payload.schueler_pool_id,
    fallgrund_id: fallgrund.id,
    empfehlung_id: null,
    notiz: null,
  });
}

async function upsertStudent(pool, payload) {
  const verfahrenId = Number(payload?.verfahren_id || 0);
  const rundeId = Number(payload?.runde_id || 0);
  const row = payload?.row || {};
  const snr = normalizeText(row?.snr);
  const csvId = normalizeText(row?.schueler_id);
  const vorname = normalizeText(row?.vorname);
  const nachname = normalizeText(row?.nachname);
  const geburtsdatum = normalizeDate(row?.geburtsdatum);
  const strasse = normalizeText(row?.strasse);
  const plz = normalizeText(row?.plz);
  const ort = normalizeText(row?.ort);
  const foerderbedarf = normalizeText(row?.foerderbedarf);
  const zieldifferent = normalizeBoolean(row?.zieldifferent);
  const empfehlung = normalizeText(row?.empfehlung) || normalizeText(row?.empfehlung_code) || "KEINE";
  const verfahrenstyp = await loadProcedureType(pool, verfahrenId);
  const schuelerColumns = await loadTableColumns(pool, "anm_schueler");

  const anmeldungsTreffer = await findApplicationBySchuelerNr(pool, verfahrenId, rundeId, csvId);
  const hasAnmeldung = Boolean(anmeldungsTreffer);
  const abgleichStatus = hasAnmeldung ? "Pool + Anm" : "Nur Pool";
  const anmeldestatus = hasAnmeldung
    ? mapAnmeldestatusToSchuelerStatus(anmeldungsTreffer?.anmeldestatus_text)
    : "Ohne";

  const [existingRows] = await pool.query(
    `
    SELECT id, anmeldestatus
    FROM anm_schueler
    WHERE verfahren_id = ?
      AND runde_id = ?
      AND TRIM(schueler_id) = ?
    ORDER BY id DESC
    LIMIT 1
    `,
    [verfahrenId, rundeId, csvId],
  );
  const existing = Array.isArray(existingRows) ? existingRows[0] : null;

  if (existing) {
    const nextAnmeldestatus = hasAnmeldung
      ? normalizeText(existing.anmeldestatus) || anmeldestatus
      : "Ohne";
    const assignments = [
      "schueler_nr = ?",
      "abgleich_status = ?",
      "anmeldestatus = ?",
      "empfehlung = ?",
      "vorname = ?",
      "nachname = ?",
      "geburtsdatum = ?",
      "foerderbedarf = ?",
      "zieldifferent = ?",
      "bemerkung = ?",
    ];
    const values = [
      csvId,
      abgleichStatus,
      nextAnmeldestatus,
      empfehlung,
      vorname,
      nachname,
      geburtsdatum,
      foerderbedarf || null,
      zieldifferent,
      normalizeText(row?.notiz) || null,
    ];
    if (verfahrenstyp !== "SEK1" && schuelerColumns.has("schul_nr")) {
      assignments.push("schul_nr = ?");
      values.push(snr || null);
    }
    if (verfahrenstyp === "SEK1" && schuelerColumns.has("quell_snr")) {
      assignments.push("quell_snr = ?");
      values.push(snr || null);
    }
    if (verfahrenstyp === "SEK1" && schuelerColumns.has("quell_schueler_nr")) {
      assignments.push("quell_schueler_nr = ?");
      values.push(csvId || null);
    }
    if (schuelerColumns.has("strasse")) {
      assignments.push("strasse = ?");
      values.push(strasse || null);
    }
    if (schuelerColumns.has("plz")) {
      assignments.push("plz = ?");
      values.push(plz || null);
    }
    if (schuelerColumns.has("ort")) {
      assignments.push("ort = ?");
      values.push(ort || null);
    }
    if (schuelerColumns.has("herkunft")) {
      assignments.push("herkunft = ?");
      values.push("Pool");
    }
    values.push(Number(existing.id));
    await pool.query(
      `
      UPDATE anm_schueler
      SET ${assignments.join(", ")}, updated_at = NOW()
      WHERE id = ?
      `,
      values,
    );
    return { id: Number(existing.id), updated: true, hasAnmeldung };
  }

  const insertColumns = [
    "verfahren_id",
    "runde_id",
    "schueler_id",
    "schueler_nr",
    "abgleich_status",
    "anmeldestatus",
    "empfehlung",
    "vorname",
    "nachname",
    "geburtsdatum",
    "foerderbedarf",
    "zieldifferent",
    "bemerkung",
  ];
  const placeholders = ["?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?"];
  const values = [
    verfahrenId,
    rundeId,
    csvId,
    csvId,
    "Nur Pool",
    "Ohne",
    empfehlung,
    vorname,
    nachname,
    geburtsdatum,
    foerderbedarf || null,
    zieldifferent,
    normalizeText(row?.notiz) || null,
  ];
  if (verfahrenstyp !== "SEK1" && schuelerColumns.has("schul_nr")) {
    insertColumns.push("schul_nr");
    placeholders.push("?");
    values.push(snr || null);
  }
  if (verfahrenstyp === "SEK1" && schuelerColumns.has("quell_snr")) {
    insertColumns.push("quell_snr");
    placeholders.push("?");
    values.push(snr || null);
  }
  if (verfahrenstyp === "SEK1" && schuelerColumns.has("quell_schueler_nr")) {
    insertColumns.push("quell_schueler_nr");
    placeholders.push("?");
    values.push(csvId || null);
  }
  if (schuelerColumns.has("strasse")) {
    insertColumns.push("strasse");
    placeholders.push("?");
    values.push(strasse || null);
  }
  if (schuelerColumns.has("plz")) {
    insertColumns.push("plz");
    placeholders.push("?");
    values.push(plz || null);
  }
  if (schuelerColumns.has("ort")) {
    insertColumns.push("ort");
    placeholders.push("?");
    values.push(ort || null);
  }
  if (schuelerColumns.has("herkunft")) {
    insertColumns.push("herkunft");
    placeholders.push("?");
    values.push("Pool");
  }
  const [result] = await pool.query(
    `
    INSERT INTO anm_schueler (${insertColumns.join(", ")})
    VALUES (${placeholders.join(", ")})
    `,
    values,
  );
  return { id: Number(result.insertId), updated: false, hasAnmeldung };
}

async function ensureOpenCase(pool, payload) {
  const [existingRows] = await pool.query(
    `
    SELECT id
    FROM anm_offener_fall
    WHERE verfahren_id = ?
      AND schueler_pool_id = ?
      AND fallgrund_id = ?
    LIMIT 1
    `,
    [payload.verfahren_id, payload.schueler_pool_id, payload.fallgrund_id],
  );
  if (Array.isArray(existingRows) && existingRows.length) {
    return { created: false };
  }

  await pool.query(
    `
    INSERT INTO anm_offener_fall (
      verfahren_id, schueler_pool_id, fallgrund_id, empfehlung_id, fallstatus_code, notiz
    ) VALUES (?, ?, ?, ?, 'OFFEN', ?)
    `,
    [
      payload.verfahren_id,
      payload.schueler_pool_id,
      payload.fallgrund_id,
      payload.empfehlung_id || null,
      normalizeText(payload.notiz) || null,
    ],
  );
  return { created: true };
}

function buildPoolPreviewRow(parsedRow, schoolBySnr, empfehlungByCode) {
  const empfehlungText = normalizeText(parsedRow.getValue(["empfehlung", "empfehlung_code"])) || "KEINE";
  const data = {
    snr: normalizeText(parsedRow.getValue(["snr", "schul_nr"])),
    schueler_id: normalizeText(parsedRow.getValue(["schueler_id", "schueler_nr"])),
    vorname: normalizeText(parsedRow.getValue("vorname")),
    nachname: normalizeText(parsedRow.getValue("nachname")),
    geburtsdatum: normalizeDate(parsedRow.getValue("geburtsdatum")),
    strasse: normalizeText(parsedRow.getValue(["strasse", "straße", "street"])),
    plz: normalizeText(parsedRow.getValue(["plz", "postleitzahl"])),
    ort: normalizeText(parsedRow.getValue(["ort", "city"])),
    foerderbedarf: normalizeText(parsedRow.getValue("foerderbedarf")),
    zieldifferent: normalizeText(parsedRow.getValue("zieldifferent")),
    empfehlung: empfehlungText,
  };

  const errors = [];
  const school = schoolBySnr.get(data.snr) || null;
  if (!data.snr) errors.push("snr fehlt.");
  if (!school && data.snr) errors.push("snr gehoert nicht zu einer Schule im Verfahren.");
  if (data.schueler_id && !normalizeInteger(data.schueler_id)) errors.push("schueler_id ist ungueltig.");
  if (!data.schueler_id) errors.push("schueler_id fehlt.");
  if (!data.vorname) errors.push("vorname fehlt.");
  if (!data.nachname) errors.push("nachname fehlt.");
  if (!data.geburtsdatum) errors.push("geburtsdatum fehlt.");
  if (!data.strasse) errors.push("strasse fehlt.");
  if (!data.plz) errors.push("plz fehlt.");
  if (!data.ort) errors.push("ort fehlt.");
  if (!empfehlungByCode.has(normalizeTextLower(data.empfehlung))) {
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

async function buildAnmeldungPreviewRow(parsedRow, schoolBySnr, statusByCode, pool, verfahrenId, rundeId) {
  const data = {
    snr: normalizeText(parsedRow.getValue(["schul_nr", "snr"])),
    schueler_schul_id: normalizeText(parsedRow.getValue(["schueler_id", "schueler_schul_id", "id"])),
    vorname: normalizeText(parsedRow.getValue("vorname")),
    nachname: normalizeText(parsedRow.getValue("nachname")),
    geburtsdatum: normalizeDate(parsedRow.getValue("geburtsdatum")),
    foerderbedarf: normalizeText(parsedRow.getValue("foerderbedarf")),
    zieldifferent: normalizeText(parsedRow.getValue("zieldifferent")),
    anmeldestatus_code: normalizeText(parsedRow.getValue(["anmeldestatus_code", "anmeldestatus"])),
  };

  const errors = [];
  const school = schoolBySnr.get(data.snr) || null;
  if (!data.snr) errors.push("schul_nr fehlt.");
  if (!school && data.snr) errors.push("schul_nr gehoert nicht zu einer Schule im Verfahren.");
  if (!data.schueler_schul_id) errors.push("schueler_schul_id fehlt.");
  if (!data.vorname) errors.push("vorname fehlt.");
  if (!data.nachname) errors.push("nachname fehlt.");
  if (!data.anmeldestatus_code) errors.push("anmeldestatus_code fehlt.");
  if (data.anmeldestatus_code && !statusByCode.has(normalizeTextLower(data.anmeldestatus_code))) {
    errors.push("anmeldestatus_code ist unbekannt.");
  }

  const existingStudent = data.schueler_schul_id
    ? await findExistingSchuelerRecord(pool, verfahrenId, rundeId, data.schueler_schul_id)
    : null;
  const existingApplication = data.snr && data.schueler_schul_id
    ? await findExistingApplication(pool, verfahrenId, rundeId, data.snr, data.schueler_schul_id)
    : null;

  const match_status = hasPoolAbgleich(existingStudent) ? "GEFUNDEN" : "NUR_ANMELDUNG";
  let match_hinweis = hasPoolAbgleich(existingStudent)
    ? "Im Pool (Gefunden)"
    : "Nicht aus";

  if (existingApplication) {
    match_hinweis += " - Update";
  } else {
    match_hinweis += " - Neu";
  }

  const match = { match_status, match_hinweis };

  return {
    row_number: parsedRow.row_number,
    data,
    school_name: school?.name || "",
    valid: errors.length === 0,
    errors,
    selected: errors.length === 0,
    match,
  };
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
      try {
        const status = statusByCode.get(normalizeTextLower(row.data.anmeldestatus_code));
        if (!status?.id) throw new Error("Anmeldestatus konnte nicht aufgeloest werden.");

        const schuelerSchulId = row.data.schueler_schul_id;
        const schuelerResult = await upsertSchuelerForAnmeldungImport(connection, {
          verfahren_id: verfahrenId,
          runde_id: rundeId,
          snr,
          schueler_schul_id: schuelerSchulId,
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

        // 1. Check if student already exists in anm_schueler_anmeldung
        const [existingAnmeldungStudentRows] = await connection.query(
          `SELECT id FROM anm_schueler_anmeldung 
           WHERE verfahren_id = ? AND runde_id = ? AND snr = ? AND schueler_schul_id = ? 
           LIMIT 1`,
          [verfahrenId, rundeId, snr, schuelerSchulId]
        );

        let schuelerAnmeldungId = null;
        if (existingAnmeldungStudentRows && existingAnmeldungStudentRows.length > 0) {
          schuelerAnmeldungId = existingAnmeldungStudentRows[0].id;
          // Update existing registration student
          await connection.query(
            `UPDATE anm_schueler_anmeldung 
             SET vorname = ?, nachname = ?, geburtsdatum = ?, foerderbedarf = ?, zieldifferent = ?, updated_at = NOW() 
             WHERE id = ?`,
            [
              row.data.vorname,
              row.data.nachname,
              normalizeDate(row.data.geburtsdatum),
              normalizeBoolean(row.data.foerderbedarf),
              normalizeBoolean(row.data.zieldifferent),
              schuelerAnmeldungId
            ]
          );
        } else {
          // Insert new registration student
          const [insertStudentResult] = await connection.query(
            `INSERT INTO anm_schueler_anmeldung 
             (verfahren_id, runde_id, snr, schueler_schul_id, vorname, nachname, geburtsdatum, foerderbedarf, zieldifferent, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              verfahrenId,
              rundeId,
              snr,
              schuelerSchulId,
              row.data.vorname,
              row.data.nachname,
              normalizeDate(row.data.geburtsdatum),
              normalizeBoolean(row.data.foerderbedarf),
              normalizeBoolean(row.data.zieldifferent)
            ]
          );
          schuelerAnmeldungId = insertStudentResult.insertId;
        }

        // 2. Match with pool using school student ID
        const poolStudentId = await findExistingStudentByCsvId(connection, schuelerSchulId, {
          verfahrenId,
          snr,
        });
        let finalPoolId = null;

        if (poolStudentId) {
          finalPoolId = poolStudentId;
        }

        // 3. Import/Update anm_anmeldung
        const existingApplication = await findExistingApplication(
          connection,
          verfahrenId,
          rundeId,
          snr,
          schuelerSchulId
        );

        if (existingApplication) {
          await connection.query(
            `UPDATE anm_anmeldung 
             SET schueler_pool_id = ?, schueler_anmeldung_id = ?, anmeldestatus_id = ?, updated_at = NOW() 
             WHERE id = ?`,
            [finalPoolId, schuelerAnmeldungId, status.id, existingApplication.id]
          );
          updatedApplications += 1;
        } else {
          await connection.query(
            `INSERT INTO anm_anmeldung 
             (verfahren_id, runde_id, snr, schueler_schul_id, schueler_pool_id, schueler_anmeldung_id, anmeldestatus_id, importiert_am, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
            [verfahrenId, rundeId, snr, schuelerSchulId, finalPoolId, schuelerAnmeldungId, status.id]
          );
          insertedApplications += 1;
        }

        // 4. Update/create open cases in anm_offener_fall
        if (finalPoolId) {
          const anmeldestatusCode = row.data.anmeldestatus_code;
          const isCaseStatus = ["WARTELISTE", "ABLEHNUNG"].includes(anmeldestatusCode);

          if (isCaseStatus) {
            const fallgrundByCode = await loadCatalogByCode(connection, "anm_kat_fallgrund");
            const fallgrund = fallgrundByCode.get(normalizeTextLower(anmeldestatusCode));
            const fallstatusByCode = await loadCatalogByCode(connection, "anm_kat_fallstatus");
            const fallstatus = fallstatusByCode.get("offen");
            const fallstatusId = fallstatus ? fallstatus.id : 1;

            if (fallgrund?.id) {
              const [existingCaseRows] = await connection.query(
                `SELECT id FROM anm_offener_fall 
                 WHERE verfahren_id = ? AND schueler_pool_id = ? 
                 LIMIT 1`,
                [verfahrenId, finalPoolId]
              );
              
              if (existingCaseRows && existingCaseRows.length > 0) {
                await connection.query(
                  `UPDATE anm_offener_fall 
                   SET fallgrund_id = ?, fallstatus_id = ?, schueler_anmeldung_id = ?, updated_at = NOW() 
                   WHERE id = ?`,
                  [fallgrund.id, fallstatusId, schuelerAnmeldungId, existingCaseRows[0].id]
                );
              } else {
                await connection.query(
                  `INSERT INTO anm_offener_fall 
                   (verfahren_id, schueler_pool_id, schueler_anmeldung_id, fallgrund_id, fallstatus_id, created_at, updated_at) 
                   VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
                  [verfahrenId, finalPoolId, schuelerAnmeldungId, fallgrund.id, fallstatusId]
                );
              }
              createdOpenCases += 1;
            }
          } else {
            // Remove existing open cases for this student in this verfahren if status is not WARTELISTE or ABLEHNUNG anymore
            await connection.query(
              `DELETE FROM anm_offener_fall 
               WHERE verfahren_id = ? AND schueler_pool_id = ?`,
              [verfahrenId, finalPoolId]
            );
          }
        }

        // 5. Rebuild the merged comparison result after each imported registration row
        await rebuildSchuelerAbgleichForRound(connection, {
          verfahrenId,
          rundeId,
        });
      } catch (error) {
        errorRows += 1;
        rowErrors.push({
          row_number: Number(row?.row_number || 0),
          schueler_schul_id: normalizeText(row?.data?.schueler_schul_id),
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
    poolStats: async (req, res) => {
      try {
        const verfahrenId = Number(req.query?.verfahren_id || 0);
        const rundeId = Number(req.query?.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");

        const pool = getPool();
        const schuelerCols = await loadTableColumns(pool, "anm_schueler");
        const filters = [];
        const params = [];

        if (schuelerCols.has("verfahren_id")) {
          filters.push("verfahren_id = ?");
          params.push(verfahrenId);
        }
        if (rundeId && schuelerCols.has("runde_id")) {
          filters.push("runde_id = ?");
          params.push(rundeId);
        }
        if (schuelerCols.has("herkunft")) {
          filters.push("LOWER(TRIM(COALESCE(herkunft, ''))) = 'pool'");
        } else {
          return res.json({ pool_count: 0 });
        }

        const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
        const [rows] = await pool.query(
          `SELECT COUNT(*) AS pool_count FROM anm_schueler ${whereClause}`,
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
        return res.json({ rows });
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
        const parsedRows = parseCsvText(csvText, [
          ["snr", "schul_nr"],
          ["schueler_id", "schueler_nr"],
          "vorname",
          "nachname",
          "geburtsdatum",
          ["strasse", "straße", "street"],
          ["plz", "postleitzahl"],
          ["ort", "city"],
        ]);
        const pool = getPool();
        const verfahrenstyp = await loadProcedureType(pool, verfahrenId);
        const requiredSchoolRole = verfahrenstyp === "SEK1" ? "Quellschulen" : "Zielschulen";
        const schoolBySnr = await loadProcedureSchoolLookupByRole(pool, verfahrenId, requiredSchoolRole);
        const empfehlungByCode = await loadCatalogByCode(pool, "anm_kat_empfehlung");
        const schuelerColumns = await loadTableColumns(pool, "anm_schueler");
        const schoolSnrColumn = verfahrenstyp === "SEK1" && schuelerColumns.has("quell_snr")
          ? "quell_snr"
          : (schuelerColumns.has("schul_nr") ? "schul_nr" : "");

        const ids = parsedRows
          .map((row) => normalizeInteger(row.getValue(["schueler_id", "schueler_nr"])))
          .filter(Boolean);

        let existingStudents = [];
        if (ids.length > 0) {
          const existingSelect = [
            "id",
            "schueler_id",
            "schueler_nr",
            "vorname",
            "nachname",
            "geburtsdatum",
            "foerderbedarf",
            "zieldifferent",
            "bemerkung",
            "anmeldestatus",
            "abgleich_status",
            schuelerColumns.has("empfehlung") ? "empfehlung" : "'' AS empfehlung",
            schoolSnrColumn ? `${schoolSnrColumn} AS source_school_snr` : "'' AS source_school_snr",
            schuelerColumns.has("strasse") ? "strasse" : "'' AS strasse",
            schuelerColumns.has("plz") ? "plz" : "'' AS plz",
            schuelerColumns.has("ort") ? "ort" : "'' AS ort",
          ];
          const [dbRows] = await pool.query(
            `SELECT ${existingSelect.join(", ")}
             FROM anm_schueler
             WHERE verfahren_id = ?
               AND runde_id = ?
               AND schueler_id IN (?)`,
            [verfahrenId, rundeId, ids],
          );
          existingStudents = dbRows || [];
        }
        const studentMap = new Map(existingStudents.map((s) => [normalizeText(s.schueler_id), s]));

        const rows = parsedRows.map((row) => {
          const previewRow = buildPoolPreviewRow(row, schoolBySnr, empfehlungByCode);

          const idVal = normalizeText(previewRow.data.schueler_id);
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

    anmeldungenSchulen: async (req, res) => {
      try {
        const verfahrenId = Number(req.query.verfahren_id || 0);
        const rundeId = Number(req.query.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");

        const pool = getPool();
        const schoolBySnr = await loadProcedureSchoolLookup(pool, verfahrenId);
        const latestBySnr = await loadLatestImportProtocolBySchool(pool, verfahrenId);
        const schuelerCols = await loadTableColumns(pool, "anm_schueler");
        const schuelerSchoolColumn = schuelerCols.has("schul_nr")
          ? "schul_nr"
          : (schuelerCols.has("snr") ? "snr" : "");
        const schuelerFilters = [];
        const schuelerParams = [];

        if (schuelerCols.has("verfahren_id")) {
          schuelerFilters.push("s.verfahren_id = ?");
          schuelerParams.push(verfahrenId);
        }
        if (rundeId && schuelerCols.has("runde_id")) {
          schuelerFilters.push("s.runde_id = ?");
          schuelerParams.push(rundeId);
        }
        const schuelerWhereClause = schuelerFilters.length
          ? `WHERE ${schuelerFilters.join(" AND ")}`
          : "";
        const schuelerStatJoin = schuelerSchoolColumn
          ? `
          LEFT JOIN (
            SELECT
              s.${schuelerSchoolColumn} AS snr,
              SUM(CASE WHEN LOWER(TRIM(COALESCE(s.anmeldestatus, ''))) = 'neuaufnahme' THEN 1 ELSE 0 END) AS neuaufnahme,
              SUM(CASE WHEN LOWER(TRIM(COALESCE(s.anmeldestatus, ''))) = 'warteliste' THEN 1 ELSE 0 END) AS warteliste
            FROM anm_schueler s
            ${schuelerWhereClause}
            GROUP BY s.${schuelerSchoolColumn}
          ) stat
            ON stat.snr = vzs.snr
          `
          : `
          LEFT JOIN (
            SELECT NULL AS snr, 0 AS neuaufnahme, 0 AS warteliste
          ) stat
            ON 1 = 0
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
          ["schul_nr", "snr"],
          ["schueler_id", "schueler_schul_id"],
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

    clearSchuelerDaten: async (req, res) => {
      const pool = getPool();
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const tableDeletionOrder = [
          "anm_schueler_abgleich",
          "anm_offener_fall",
          "anm_anmeldung",
          "anm_schueler_anmeldung",
          "anm_schueler",
          "anm_schueler_pool",
        ];
        const deletedByTable = {};
        let deletedRows = 0;

        for (const tableName of tableDeletionOrder) {
          const tableColumns = await loadTableColumns(connection, tableName);
          if (tableColumns.size === 0) continue;

          const [result] = await connection.query(`DELETE FROM ${tableName}`);
          const affectedRows = Number(result?.affectedRows || 0);
          deletedByTable[tableName] = affectedRows;
          deletedRows += affectedRows;
        }

        await connection.commit();
        poolPreviewSessions.clear();
        anmeldungsPreviewSessions.clear();
        return res.json({
          success: true,
          message: `Alle Schuelerdaten (${deletedRows} Datensaetze) wurden erfolgreich geloescht.`,
          deleted_by_table: deletedByTable,
        });
      } catch (error) {
        await connection.rollback();
        console.error("Error clearing student data:", error);
        return sendError(res, 500, "Die Schuelerdaten konnten nicht geloescht werden.", error.message);
      } finally {
        connection.release();
      }
    },
  };
}

module.exports = createImporteController;
