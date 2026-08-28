function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeGermanMatchText(value) {
  return normalizeText(value)
    .toLocaleLowerCase("de-DE")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ");
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = normalizeText(value);
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const germanMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return germanMatch ? `${germanMatch[3]}-${germanMatch[2]}-${germanMatch[1]}` : null;
}

function normalizeBoolean(value) {
  if (value === true || value === 1) return 1;
  const text = normalizeText(value).toLowerCase();
  return ["1", "true", "ja", "j", "yes", "y"].includes(text) ? 1 : 0;
}

const EXTERNAL_SOURCE_TYPES = new Set([
  "POOL", "SCHULE", "EWO", "SCHILD", "SCHUELER_ONLINE", "KITA", "SONST",
]);

function normalizeExternalIdentity(identity) {
  const externeId = normalizeText(identity?.externe_id);
  if (!externeId) return null;
  const art = normalizeText(identity?.herkunft_art).toUpperCase();
  if (!EXTERNAL_SOURCE_TYPES.has(art)) {
    const error = new Error("Die Herkunftsart der externen Identitaet ist ungueltig.");
    error.code = "INVALID_EXTERNAL_IDENTITY";
    error.statusCode = 400;
    throw error;
  }
  const providedSnr = normalizeText(identity?.herkunft_snr);
  if (["SCHULE", "KITA"].includes(art) && !providedSnr) {
    const error = new Error(`${art === "SCHULE" ? "Schulnummer" : "Kita-Kennung"} der externen Identitaet fehlt.`);
    error.code = "INVALID_EXTERNAL_IDENTITY";
    error.statusCode = 400;
    throw error;
  }
  const snr = ["SCHULE", "KITA", "SONST"].includes(art) ? (providedSnr || null) : null;
  return { herkunft_art: art, herkunft_snr: snr, externe_id: externeId };
}

function createAmbiguousMatchError(count) {
  const error = new Error(`Personendaten sind nicht eindeutig (${count} Treffer).`);
  error.code = "AMBIGUOUS_STUDENT_MATCH";
  error.statusCode = 409;
  error.matchCount = count;
  return error;
}

async function findStudentByExternalId(connection, identity) {
  const normalized = normalizeExternalIdentity(identity);
  if (!normalized) return null;
  const { herkunft_art: art, herkunft_snr: snr, externe_id: externeId } = normalized;
  const [rows] = await connection.query(
    `SELECT s.*
       FROM anm_schueler_externe_id x
       JOIN anm_schueler s ON s.id = x.schueler_id
      WHERE x.herkunft_art = ?
        AND x.herkunft_snr_norm = ?
        AND x.externe_id = ?
      LIMIT 1`,
    [art, snr || "", externeId],
  );
  return rows?.[0] || null;
}

async function findStudentsByPersonData(connection, data) {
  const verfahrenId = Number(data?.verfahren_id || 0);
  const vorname = normalizeText(data?.vorname);
  const nachname = normalizeText(data?.nachname);
  const geburtsdatum = normalizeDate(data?.geburtsdatum);
  if (!verfahrenId || !vorname || !nachname || !geburtsdatum) return [];
  const [rows] = await connection.query(
    `SELECT *
       FROM anm_schueler
      WHERE verfahren_id = ?
        AND LOWER(TRIM(COALESCE(vorname, ''))) = LOWER(?)
        AND LOWER(TRIM(COALESCE(nachname, ''))) = LOWER(?)
        AND geburtsdatum = ?
      ORDER BY id`,
    [verfahrenId, vorname, nachname, geburtsdatum],
  );
  return rows || [];
}

async function findStudentsByUmlautPersonData(connection, data) {
  const verfahrenId = Number(data?.verfahren_id || 0);
  const vorname = normalizeText(data?.vorname);
  const nachname = normalizeText(data?.nachname);
  const geburtsdatum = normalizeDate(data?.geburtsdatum);
  if (!verfahrenId || !vorname || !nachname || !geburtsdatum) return [];

  const [rows] = await connection.query(
    `SELECT *
       FROM anm_schueler
      WHERE verfahren_id = ?
        AND geburtsdatum = ?
      ORDER BY id`,
    [verfahrenId, geburtsdatum],
  );
  const exactVorname = vorname.toLocaleLowerCase("de-DE");
  const exactNachname = nachname.toLocaleLowerCase("de-DE");
  const matchVorname = normalizeGermanMatchText(vorname);
  const matchNachname = normalizeGermanMatchText(nachname);

  return (rows || []).filter((row) => {
    const rowVorname = normalizeText(row?.vorname).toLocaleLowerCase("de-DE");
    const rowNachname = normalizeText(row?.nachname).toLocaleLowerCase("de-DE");
    const isExact = rowVorname === exactVorname && rowNachname === exactNachname;
    return !isExact
      && normalizeGermanMatchText(row?.vorname) === matchVorname
      && normalizeGermanMatchText(row?.nachname) === matchNachname;
  });
}

function pickNonEmptyAddressFields(data) {
  const result = {};
  for (const field of ["strasse", "plz", "ort"]) {
    const value = normalizeText(data?.[field]);
    if (value) result[field] = value;
  }
  return result;
}

async function createStudent(connection, data) {
  const columns = ["verfahren_id", "herkunft", "vorname", "nachname", "geburtsdatum"];
  const values = [
    Number(data.verfahren_id),
    normalizeText(data.herkunft) || "Manuell",
    normalizeText(data.vorname) || null,
    normalizeText(data.nachname) || null,
    normalizeDate(data.geburtsdatum),
  ];
  const optional = [
    ["herkunftsschule_snr", data.herkunftsschule_snr],
    ["empfehlung", data.empfehlung],
    ["foerder_id", data.foerder_id],
    ["strasse", data.strasse],
    ["plz", data.plz],
    ["ort", data.ort],
    ["notiz", data.notiz ?? data.bemerkung],
    ["quell_jahrgang", data.quell_jahrgang],
    ["latitude", data.latitude],
    ["longitude", data.longitude],
  ];
  for (const [column, raw] of optional) {
    if (raw === undefined) continue;
    columns.push(column);
    values.push(normalizeText(raw) || null);
  }
  for (const column of ["foerderbedarf", "zieldifferent", "ef"]) {
    if (data[column] === undefined) continue;
    columns.push(column);
    values.push(normalizeBoolean(data[column]));
  }
  const [result] = await connection.query(
    `INSERT INTO anm_schueler (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    values,
  );
  return { id: Number(result.insertId), verfahren_id: Number(data.verfahren_id), herkunft: values[1] };
}

async function updateStudentMaster(connection, studentId, data) {
  const assignments = [];
  const values = [];
  const textFields = ["vorname", "nachname", "strasse", "plz", "ort", "empfehlung", "foerder_id", "herkunftsschule_snr", "quell_jahrgang"];
  for (const field of textFields) {
    if (data[field] === undefined) continue;
    assignments.push(`${field} = ?`);
    values.push(normalizeText(data[field]) || null);
  }
  if (data.geburtsdatum !== undefined) {
    assignments.push("geburtsdatum = ?");
    values.push(normalizeDate(data.geburtsdatum));
  }
  for (const field of ["latitude", "longitude"]) {
    if (data[field] === undefined) continue;
    assignments.push(`${field} = ?`);
    values.push(data[field] === null || data[field] === "" ? null : Number(data[field]));
  }
  if (data.notiz !== undefined || data.bemerkung !== undefined) {
    assignments.push("notiz = ?");
    values.push(normalizeText(data.notiz ?? data.bemerkung) || null);
  }
  for (const field of ["foerderbedarf", "zieldifferent", "ef"]) {
    if (data[field] === undefined) continue;
    assignments.push(`${field} = ?`);
    values.push(normalizeBoolean(data[field]));
  }
  if (!assignments.length) return;
  values.push(Number(studentId));
  await connection.query(
    `UPDATE anm_schueler SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = ?`,
    values,
  );
}

async function updateStudentOrigin(connection, studentId, origin) {
  const normalizedOrigin = normalizeText(origin);
  if (!["Pool", "Anmeldung", "Manuell"].includes(normalizedOrigin)) {
    const error = new Error("Die Herkunft des Schülers ist ungültig.");
    error.code = "INVALID_STUDENT_ORIGIN";
    error.statusCode = 400;
    throw error;
  }
  await connection.query(
    "UPDATE anm_schueler SET herkunft = ?, updated_at = NOW() WHERE id = ?",
    [normalizedOrigin, Number(studentId)],
  );
}

async function attachExternalId(connection, studentId, identity) {
  const normalized = normalizeExternalIdentity(identity);
  if (!normalized) return null;
  const { herkunft_art: art, herkunft_snr: snr, externe_id: externeId } = normalized;
  try {
    const [result] = await connection.query(
      `INSERT INTO anm_schueler_externe_id
         (schueler_id, herkunft_art, herkunft_snr, externe_id)
       VALUES (?, ?, ?, ?)`,
      [Number(studentId), art, snr, externeId],
    );
    return Number(result.insertId);
  } catch (error) {
    if (error?.code !== "ER_DUP_ENTRY") throw error;
    const existing = await findStudentByExternalId(connection, identity);
    if (Number(existing?.id) === Number(studentId)) return null;
    const conflict = new Error("Die externe Identität ist bereits einem anderen Schüler zugeordnet.");
    conflict.code = "EXTERNAL_ID_CONFLICT";
    conflict.statusCode = 409;
    throw conflict;
  }
}

async function resolveStudent(connection, data) {
  const identity = normalizeExternalIdentity(data?.external_identity);
  let student = identity ? await findStudentByExternalId(connection, identity) : null;
  if (student) return { student, created: false, matchedBy: "EXTERNAL_ID", externalIdAdded: false };

  const candidates = await findStudentsByPersonData(connection, data);
  if (candidates.length > 1) throw createAmbiguousMatchError(candidates.length);
  const umlautCandidates = candidates.length === 0
    ? await findStudentsByUmlautPersonData(connection, data)
    : [];
  if (umlautCandidates.length > 1) throw createAmbiguousMatchError(umlautCandidates.length);
  let created = false;
  if (candidates.length === 1) {
    [student] = candidates;
  } else if (umlautCandidates.length === 1) {
    [student] = umlautCandidates;
  } else {
    student = await createStudent(connection, data);
    created = true;
  }
  let externalIdAdded = false;
  if (identity?.externe_id) {
    externalIdAdded = (await attachExternalId(connection, student.id, identity)) !== null;
  }
  return {
    student,
    created,
    matchedBy: created ? "NEW" : umlautCandidates.length === 1 ? "UMLAUT_PERSON_DATA" : "PERSON_DATA",
    externalIdAdded,
  };
}

async function findRoundState(connection, { verfahren_id, schueler_id, runde_id }) {
  const [rows] = await connection.query(
    `SELECT * FROM anm_schueler_runde
      WHERE verfahren_id = ? AND schueler_id = ? AND runde_id = ? LIMIT 1`,
    [Number(verfahren_id), Number(schueler_id), Number(runde_id)],
  );
  return rows?.[0] || null;
}

async function upsertRoundState(connection, data) {
  const key = {
    verfahren_id: Number(data.verfahren_id),
    schueler_id: Number(data.schueler_id),
    runde_id: Number(data.runde_id),
  };
  const existing = await findRoundState(connection, key);
  const fields = ["anmeldestatus", "teilnahmestatus", "schul_nr", "koordinierte_snr", "koordiniert_am", "koordiniert_von", "abgleich_status"];
  if (existing) {
    const assignments = [];
    const values = [];
    for (const field of fields) {
      if (data[field] === undefined) continue;
      assignments.push(`${field} = ?`);
      values.push(data[field] === "" ? null : data[field]);
    }
    if (assignments.length) {
      values.push(existing.id);
      await connection.query(`UPDATE anm_schueler_runde SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = ?`, values);
    }
    return { id: Number(existing.id), created: false, previous: existing };
  }
  const columns = ["verfahren_id", "schueler_id", "runde_id", "abgleich_status"];
  const values = [key.verfahren_id, key.schueler_id, key.runde_id, data.abgleich_status || "Nur Pool"];
  for (const field of fields.filter((entry) => entry !== "abgleich_status")) {
    if (data[field] === undefined) continue;
    columns.push(field);
    values.push(data[field] === "" ? null : data[field]);
  }
  const [result] = await connection.query(
    `INSERT INTO anm_schueler_runde (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    values,
  );
  return { id: Number(result.insertId), created: true, previous: null };
}

module.exports = {
  attachExternalId,
  createAmbiguousMatchError,
  createStudent,
  findRoundState,
  findStudentByExternalId,
  findStudentsByPersonData,
  findStudentsByUmlautPersonData,
  normalizeDate,
  normalizeBoolean,
  normalizeExternalIdentity,
  normalizeGermanMatchText,
  normalizeText,
  pickNonEmptyAddressFields,
  resolveStudent,
  updateStudentMaster,
  updateStudentOrigin,
  upsertRoundState,
};
