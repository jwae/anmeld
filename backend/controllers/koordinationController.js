const tableColumnCache = new Map();

function sendError(res, statusCode, message, details) {
  const payload = { error: message };
  if (details) payload.details = details;
  return res.status(statusCode).json(payload);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeColumnSet(rows = []) {
  return new Set(
    (rows || [])
      .map((row) => normalizeText(row?.COLUMN_NAME).toLowerCase())
      .filter(Boolean),
  );
}

async function loadTableColumns(pool, tableName) {
  const cacheKey = normalizeText(tableName).toLowerCase();
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

  const columns = normalizeColumnSet(rows);
  tableColumnCache.set(cacheKey, columns);
  return columns;
}

function parseCoordinate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const num = Number(text);
  if (!Number.isFinite(num)) return null;
  if (num === 0) return null;
  return num;
}

function createAddressLabel(row) {
  return [
    normalizeText(row?.strasse),
    [normalizeText(row?.plz), normalizeText(row?.ort)].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
}

function buildOrsSearchParams(row) {
  const params = new URLSearchParams();
  params.set("text", createAddressLabel(row));
  params.set("size", "1");
  return params;
}

function parseOrsCoordinates(payload) {
  const feature = Array.isArray(payload?.features) && payload.features.length ? payload.features[0] : null;
  const coords = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
  const longitude = Number(coords?.[0]);
  const latitude = Number(coords?.[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { latitude: null, longitude: null };
  }
  return { latitude, longitude };
}

async function fetchOrsGeocode(addressRow) {
  const apiKey = normalizeText(process.env.OPENROUTESERVICE_API_KEY || process.env.ORS_API_KEY);
  const fetchImpl = global.fetch;
  if (!apiKey || typeof fetchImpl !== "function") {
    const error = new Error("ORS-Geocoding ist nicht konfiguriert. Bitte OPENROUTESERVICE_API_KEY oder ORS_API_KEY setzen.");
    error.statusCode = 503;
    throw error;
  }

  const addressLabel = createAddressLabel(addressRow);
  if (!addressLabel) {
    return {
      ok: false,
      latitude: null,
      longitude: null,
      message: "Adresse unvollstaendig.",
    };
  }

  const params = buildOrsSearchParams(addressRow);

  try {
    const response = await fetchImpl(`https://api.openrouteservice.org/geocode/search?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: apiKey,
      },
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      return {
        ok: false,
        latitude: null,
        longitude: null,
        message: `ORS-Geocoding fehlgeschlagen (${response.status}).${responseText ? ` ${responseText.slice(0, 180)}` : ""}`.trim(),
      };
    }

    const payload = await response.json();
    const coordinates = parseOrsCoordinates(payload);
    if (coordinates.latitude === null || coordinates.longitude === null) {
      return {
        ok: false,
        latitude: null,
        longitude: null,
        message: "Keine Koordinaten fuer die Adresse gefunden.",
      };
    }

    return {
      ok: true,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      message: "",
    };
  } catch (error) {
    return {
      ok: false,
      latitude: null,
      longitude: null,
      message: error?.message ? `ORS-Geocoding fehlgeschlagen: ${error.message}` : "ORS-Geocoding fehlgeschlagen.",
    };
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const queue = Array.isArray(items) ? [...items] : [];
  if (!queue.length) return [];

  const limit = Math.max(1, Math.min(Number(concurrency) || 1, queue.length));
  const results = new Array(queue.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < queue.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(queue[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}

function truncateName(value, maxLength = 30) {
  const text = normalizeText(value);
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatDistanceKm(valueInKm) {
  const num = Number(valueInKm);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 10) / 10;
}

function calculateHaversineKm(fromLat, fromLon, toLat, toLon) {
  const lat1 = parseCoordinate(fromLat);
  const lon1 = parseCoordinate(fromLon);
  const lat2 = parseCoordinate(toLat);
  const lon2 = parseCoordinate(toLon);
  if ([lat1, lon1, lat2, lon2].some((value) => value === null)) return null;

  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRad(lat2 - lat1);
  const deltaLon = toRad(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

async function loadSchoolMapBySnr(pool) {
  const [rows] = await pool.query(
    `
    SELECT snr, name
    FROM anm_schulen
    `,
  );

  return new Map(
    (rows || []).map((row) => [normalizeText(row?.snr), normalizeText(row?.name)]),
  );
}

async function loadFallstatusOptions(pool) {
  const [rows] = await pool.query(
    `
    SELECT id, code, bezeichnung
    FROM anm_kat_fallstatus
    WHERE COALESCE(aktiv, 1) = 1
    ORDER BY COALESCE(sortierung, 0) ASC, COALESCE(bezeichnung, code) ASC
    `,
  );

  return (rows || []).map((row) => ({
    id: Number(row?.id || 0),
    code: normalizeText(row?.code),
    bezeichnung: normalizeText(row?.bezeichnung) || normalizeText(row?.code),
  })).filter((row) => row.id > 0);
}

async function loadOffeneFaelleRows(pool, verfahrenId) {
  const offeneFallColumns = await loadTableColumns(pool, "anm_offener_fall");
  const schuelerColumns = await loadTableColumns(pool, "anm_schueler");
  if (!offeneFallColumns.size) return [];
  const erwarteteSnrExpr = offeneFallColumns.has("schueler_id") && schuelerColumns.has("erwartete_snr")
    ? "s.erwartete_snr"
    : "''";

  const [rows] = await pool.query(
    `
    SELECT
      COALESCE(f.id, 0) AS fall_id,
      COALESCE(f.verfahren_id, 0) AS verfahren_id,
      COALESCE(f.fallstatus_id, 0) AS fallstatus_id,
      ${offeneFallColumns.has("schueler_id") ? "COALESCE(f.schueler_id, 0)" : "0"} AS schueler_row_id,
      COALESCE(f.schueler_pool_id, 0) AS schueler_pool_id,
      COALESCE(f.schueler_anmeldung_id, 0) AS schueler_anmeldung_id,
      COALESCE(sa.runde_id, s.runde_id, 0) AS runde_id,
      COALESCE(NULLIF(TRIM(s.vorname), ''), NULLIF(TRIM(sp.vorname), ''), NULLIF(TRIM(sa.vorname), ''), '') AS vorname,
      COALESCE(NULLIF(TRIM(s.nachname), ''), NULLIF(TRIM(sp.nachname), ''), NULLIF(TRIM(sa.nachname), ''), '') AS nachname,
      DATE_FORMAT(COALESCE(s.geburtsdatum, sp.geburtsdatum, sa.geburtsdatum), '%Y-%m-%d') AS geburtsdatum,
      COALESCE(NULLIF(TRIM(s.schueler_id), ''), NULLIF(TRIM(sa.schueler_schul_id), ''), NULLIF(TRIM(sp.id), ''), '') AS schueler_ident,
      COALESCE(NULLIF(TRIM(s.schul_nr), ''), NULLIF(TRIM(sa.snr), ''), '') AS aktuelle_snr,
      COALESCE(NULLIF(TRIM(curr.name), ''), '') AS aktuelle_schule,
      COALESCE(NULLIF(TRIM(${erwarteteSnrExpr}), ''), NULLIF(TRIM(f.zugewiesene_snr), ''), '') AS erwartete_snr,
      COALESCE(NULLIF(TRIM(expected.name), ''), '') AS erwartete_schule,
      COALESCE(NULLIF(TRIM(f.zugewiesene_snr), ''), '') AS zugewiesene_snr,
      COALESCE(NULLIF(TRIM(assign.name), ''), '') AS zugewiesene_schule,
      COALESCE(NULLIF(TRIM(fg.code), ''), '') AS fallgrund_code,
      COALESCE(NULLIF(TRIM(fg.bezeichnung), ''), NULLIF(TRIM(fg.code), ''), '') AS fallgrund,
      COALESCE(NULLIF(TRIM(fs.bezeichnung), ''), NULLIF(TRIM(fs.code), ''), '') AS fallstatus,
      COALESCE(NULLIF(TRIM(f.bemerkung), ''), '') AS bemerkung,
      DATE_FORMAT(f.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(f.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
      CASE
        ${offeneFallColumns.has("schueler_id") ? "WHEN f.schueler_id IS NOT NULL THEN 'anm_schueler'" : ""}
        ${offeneFallColumns.has("schueler_id") ? " " : ""}WHEN f.schueler_pool_id IS NOT NULL THEN 'anm_schueler_pool'
        WHEN f.schueler_anmeldung_id IS NOT NULL THEN 'anm_schueler_anmeldung'
        ELSE 'unbekannt'
      END AS quelle
    FROM anm_offener_fall f
    LEFT JOIN anm_schueler s
      ON ${offeneFallColumns.has("schueler_id") ? "s.id = f.schueler_id" : "1 = 0"}
    LEFT JOIN anm_schueler_pool sp
      ON sp.id = f.schueler_pool_id
    LEFT JOIN anm_schueler_anmeldung sa
      ON sa.id = f.schueler_anmeldung_id
    LEFT JOIN anm_kat_fallgrund fg
      ON fg.id = f.fallgrund_id
    LEFT JOIN anm_kat_fallstatus fs
      ON fs.id = f.fallstatus_id
    LEFT JOIN anm_schulen curr
      ON curr.snr = COALESCE(NULLIF(TRIM(s.schul_nr), ''), NULLIF(TRIM(sa.snr), ''))
    LEFT JOIN anm_schulen expected
      ON expected.snr = COALESCE(NULLIF(TRIM(${erwarteteSnrExpr}), ''), NULLIF(TRIM(f.zugewiesene_snr), ''))
    LEFT JOIN anm_schulen assign
      ON assign.snr = f.zugewiesene_snr
    WHERE f.verfahren_id = ?
    ORDER BY COALESCE(f.updated_at, f.created_at) DESC, COALESCE(NULLIF(TRIM(s.nachname), ''), NULLIF(TRIM(sp.nachname), ''), NULLIF(TRIM(sa.nachname), ''), '') ASC
    `,
    [verfahrenId],
  );

  return (rows || []).map((row) => ({
    fall_id: Number(row?.fall_id || 0),
    verfahren_id: Number(row?.verfahren_id || 0),
    fallstatus_id: Number(row?.fallstatus_id || 0),
    schueler_row_id: Number(row?.schueler_row_id || 0),
    schueler_pool_id: Number(row?.schueler_pool_id || 0),
    schueler_anmeldung_id: Number(row?.schueler_anmeldung_id || 0),
    runde_id: Number(row?.runde_id || 0),
    vorname: normalizeText(row?.vorname),
    nachname: normalizeText(row?.nachname),
    geburtsdatum: normalizeText(row?.geburtsdatum),
    schueler_ident: normalizeText(row?.schueler_ident),
    aktuelle_snr: normalizeText(row?.aktuelle_snr),
    aktuelle_schule: normalizeText(row?.aktuelle_schule),
    erwartete_snr: normalizeText(row?.erwartete_snr),
    erwartete_schule: normalizeText(row?.erwartete_schule),
    zugewiesene_snr: normalizeText(row?.zugewiesene_snr),
    zugewiesene_schule: normalizeText(row?.zugewiesene_schule),
    fallgrund_code: normalizeText(row?.fallgrund_code),
    fallgrund: normalizeText(row?.fallgrund),
    fallstatus: normalizeText(row?.fallstatus),
    bemerkung: normalizeText(row?.bemerkung),
    created_at: normalizeText(row?.created_at),
    updated_at: normalizeText(row?.updated_at),
    quelle: normalizeText(row?.quelle),
  }));
}

async function loadSchoolRows(pool, verfahrenId, rundeId) {
  const schoolColumns = await loadTableColumns(pool, "anm_schulen");
  const capacityColumns = await loadTableColumns(pool, "anm_kapazitaet");
  const studentColumns = await loadTableColumns(pool, "anm_schueler");
  if (!schoolColumns.size) return [];

  const activeFilter = schoolColumns.has("is_active")
    ? "AND COALESCE(s.is_active, 0) = 1"
    : schoolColumns.has("aktiv")
      ? "AND COALESCE(s.aktiv, 0) = 1"
      : "";
  const schoolLatitudeColumn = schoolColumns.has("latitude") ? "s.latitude" : "NULL";
  const schoolLongitudeColumn = schoolColumns.has("longitude") ? "s.longitude" : "NULL";
  const studentSchoolColumn = studentColumns.has("schul_nr")
    ? "st.schul_nr"
    : (studentColumns.has("snr") ? "st.snr" : "''");
  const studentStatusExpr = studentColumns.has("anmeldestatus")
    ? "LOWER(TRIM(COALESCE(st.anmeldestatus, '')))"
    : "''";

  const studentFilters = [];
  const studentParams = [];
  if (studentColumns.has("verfahren_id")) {
    studentFilters.push("st.verfahren_id = ?");
    studentParams.push(verfahrenId);
  }
  if (studentColumns.has("runde_id")) {
    studentFilters.push("st.runde_id = ?");
    studentParams.push(rundeId);
  }

  const neuaufnahmeFilters = [...studentFilters, `${studentStatusExpr} = 'neuaufnahme'`];
  const capacityJoin = capacityColumns.has("verfahren_id") && capacityColumns.has("snr")
    ? `
      LEFT JOIN (
        SELECT
          k.snr,
          SUM(COALESCE(k.gesamtkapazitaet, 0)) AS kapazitaet
        FROM anm_kapazitaet k
        WHERE k.verfahren_id = ?
        GROUP BY k.snr
      ) cap
        ON cap.snr = s.snr
    `
    : `
      LEFT JOIN (
        SELECT NULL AS snr, 0 AS kapazitaet
      ) cap
        ON 1 = 0
    `;
  const studentJoin = studentColumns.size
    ? `
      LEFT JOIN (
        SELECT
          NULLIF(TRIM(${studentSchoolColumn}), '') AS snr,
          COUNT(*) AS anmeldungen_gesamt
        FROM anm_schueler st
        ${neuaufnahmeFilters.length ? `WHERE ${neuaufnahmeFilters.join(" AND ")}` : ""}
        GROUP BY NULLIF(TRIM(${studentSchoolColumn}), '')
      ) neu
        ON neu.snr = s.snr
    `
    : `
      LEFT JOIN (
        SELECT NULL AS snr, 0 AS anmeldungen_gesamt
      ) neu
        ON 1 = 0
    `;

  const [rows] = await pool.query(
    `
    SELECT
      s.snr,
      COALESCE(s.name, '') AS name,
      COALESCE(cap.kapazitaet, 0) AS kapazitaet,
      COALESCE(neu.anmeldungen_gesamt, 0) AS anmeldungen_gesamt,
      ${schoolLatitudeColumn} AS latitude,
      ${schoolLongitudeColumn} AS longitude
    FROM (
      SELECT DISTINCT sgs.snr
      FROM anm_verfahren_schulgruppe vsg
      JOIN anm_schulgruppe_schule sgs
        ON sgs.schulgruppe_id = vsg.schulgruppe_id
      WHERE vsg.verfahren_id = ?
        AND vsg.rolle = 'Zielschulen'
    ) vzs
    JOIN anm_schulen s
      ON s.snr = vzs.snr
    ${capacityJoin}
    ${studentJoin}
    WHERE 1 = 1
    ${activeFilter}
    ORDER BY COALESCE(s.name, '') ASC, s.snr ASC
    `,
    [
      verfahrenId,
      ...(capacityColumns.has("verfahren_id") && capacityColumns.has("snr") ? [verfahrenId] : []),
      ...studentParams,
    ],
  );

  return (rows || []).map((row) => {
    const kapazitaet = Number(row?.kapazitaet || 0);
    const anmeldungenGesamt = Number(row?.anmeldungen_gesamt || 0);
    return {
      snr: normalizeText(row?.snr),
      name: normalizeText(row?.name),
      short_name: truncateName(row?.name),
      kapazitaet,
      anmeldungen_gesamt: anmeldungenGesamt,
      freie_plaetze: kapazitaet - anmeldungenGesamt,
      latitude: parseCoordinate(row?.latitude),
      longitude: parseCoordinate(row?.longitude),
    };
  });
}

async function fetchOrsDistancesKm(selectedSchool, students) {
  const apiKey = normalizeText(process.env.OPENROUTESERVICE_API_KEY || process.env.ORS_API_KEY);
  const fetchImpl = global.fetch;
  if (!apiKey || typeof fetchImpl !== "function") {
    return { distances: new Map(), mode: "" };
  }

  const routableStudents = students.filter(
    (student) => student.latitude !== null && student.longitude !== null,
  );
  if (!routableStudents.length || selectedSchool.latitude === null || selectedSchool.longitude === null) {
    return { distances: new Map(), mode: "" };
  }

  const locations = [
    [selectedSchool.longitude, selectedSchool.latitude],
    ...routableStudents.map((student) => [student.longitude, student.latitude]),
  ];
  const destinations = routableStudents.map((_student, index) => index + 1);

  try {
    const response = await fetchImpl("https://api.openrouteservice.org/v2/matrix/driving-car", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        locations,
        sources: [0],
        destinations,
        metrics: ["distance"],
        units: "km",
      }),
    });

    if (!response.ok) {
      return { distances: new Map(), mode: "" };
    }

    const payload = await response.json();
    const matrix = Array.isArray(payload?.distances) ? payload.distances : [];
    const firstRow = Array.isArray(matrix?.[0]) ? matrix[0] : [];
    const distances = new Map();
    routableStudents.forEach((student, index) => {
      distances.set(student.row_id, formatDistanceKm(firstRow[index]));
    });
    return { distances, mode: "ors" };
  } catch (_error) {
    return { distances: new Map(), mode: "" };
  }
}

async function loadStudentsForKoordinationGeocoding(pool, verfahrenId, rundeId, rowIds = []) {
  const columns = await loadTableColumns(pool, "anm_schueler");
  if (!columns.size) return { rows: [], columns };

  const statusExpr = columns.has("anmeldestatus")
    ? "LOWER(TRIM(COALESCE(anmeldestatus, '')))"
    : "''";
  const latitudeExpr = columns.has("latitude")
    ? "latitude"
    : "NULL";
  const longitudeExpr = columns.has("longitude")
    ? "longitude"
    : "NULL";

  const whereParts = [`${statusExpr} <> 'neuaufnahme'`, `(${latitudeExpr} IS NULL OR ${longitudeExpr} IS NULL)`];
  const params = [];

  if (columns.has("verfahren_id")) {
    whereParts.push("verfahren_id = ?");
    params.push(verfahrenId);
  }
  if (columns.has("runde_id")) {
    whereParts.push("runde_id = ?");
    params.push(rundeId);
  }
  const targetRowIds = Array.isArray(rowIds)
    ? Array.from(new Set(rowIds.map((value) => Number(value || 0)).filter((value) => Number.isInteger(value) && value > 0)))
    : [];
  if (targetRowIds.length) {
    whereParts.push(`id IN (${targetRowIds.map(() => "?").join(", ")})`);
    params.push(...targetRowIds);
  }

  const [rows] = await pool.query(
    `
    SELECT
      id,
      COALESCE(vorname, '') AS vorname,
      COALESCE(nachname, '') AS nachname,
      ${columns.has("strasse") ? "COALESCE(strasse, '')" : "''"} AS strasse,
      ${columns.has("plz") ? "COALESCE(plz, '')" : "''"} AS plz,
      ${columns.has("ort") ? "COALESCE(ort, '')" : "''"} AS ort
    FROM anm_schueler
    WHERE ${whereParts.join(" AND ")}
    ORDER BY COALESCE(nachname, '') ASC, COALESCE(vorname, '') ASC, COALESCE(id, 0) ASC
    `,
    params,
  );

  return {
    columns,
    rows: (rows || []).map((row) => ({
      id: Number(row?.id || 0),
      vorname: normalizeText(row?.vorname),
      nachname: normalizeText(row?.nachname),
      strasse: normalizeText(row?.strasse),
      plz: normalizeText(row?.plz),
      ort: normalizeText(row?.ort),
    })),
  };
}

async function updateStudentGeocoding(connection, columns, update) {
  const assignments = [];
  const values = [];

  if (columns.has("latitude")) {
    assignments.push("latitude = ?");
    values.push(update.latitude);
  }
  if (columns.has("longitude")) {
    assignments.push("longitude = ?");
    values.push(update.longitude);
  }
  if (columns.has("geocoding_status")) {
    assignments.push("geocoding_status = ?");
    values.push(update.status);
  }
  if (columns.has("geocoding_fehler")) {
    assignments.push("geocoding_fehler = ?");
    values.push(update.errorMessage);
  }
  if (columns.has("geocoded_at")) {
    assignments.push("geocoded_at = NOW()");
  }

  if (!assignments.length) return;

  values.push(update.id);
  await connection.query(
    `
    UPDATE anm_schueler
    SET ${assignments.join(", ")}
    WHERE id = ?
    `,
    values,
  );
}

async function geocodeKoordinationStudents(connection, verfahrenId, rundeId, rowIds = []) {
  const { columns, rows } = await loadStudentsForKoordinationGeocoding(connection, verfahrenId, rundeId, rowIds);
  if (!rows.length) return;

  const missingColumns = ["latitude", "longitude"].filter((column) => !columns.has(column));
  if (missingColumns.length) {
    const error = new Error(`Die Tabelle anm_schueler enthaelt die erforderlichen Spalten nicht: ${missingColumns.join(", ")}.`);
    error.statusCode = 500;
    throw error;
  }

  const updates = await mapWithConcurrency(rows, 6, async (row) => {
    const addressLabel = createAddressLabel(row);
    if (!addressLabel) {
      return {
        id: row.id,
        latitude: null,
        longitude: null,
        status: columns.has("geocoding_status") ? "Fehler" : "",
        errorMessage: "Adresse unvollstaendig.",
      };
    }

    const result = await fetchOrsGeocode(row);
    return {
      id: row.id,
      latitude: result.latitude,
      longitude: result.longitude,
      status: columns.has("geocoding_status") ? (result.ok ? "OK" : "Fehler") : "",
      errorMessage: result.ok ? null : result.message,
    };
  });

  if (!updates.length) return;

  await connection.beginTransaction();
  try {
    for (const update of updates) {
      await updateStudentGeocoding(connection, columns, update);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  }

  const successCount = updates.filter((update) => update.latitude !== null && update.longitude !== null).length;
  const failedCount = updates.length - successCount;
  return {
    processedCount: updates.length,
    successCount,
    failedCount,
  };
}

async function loadStudentRows(pool, verfahrenId, rundeId, selectedSchool) {
  const columns = await loadTableColumns(pool, "anm_schueler");
  if (!columns.size) return { rows: [], distanceMode: "" };

  const schoolColumn = columns.has("schul_nr")
    ? "s.schul_nr"
    : (columns.has("snr") ? "s.snr" : "''");
  const studentIdColumn = columns.has("schueler_id")
    ? "s.schueler_id"
    : (columns.has("schueler_nr") ? "s.schueler_nr" : "''");
  const latitudeColumn = columns.has("latitude") ? "s.latitude" : "NULL";
  const longitudeColumn = columns.has("longitude") ? "s.longitude" : "NULL";
  const recommendationColumn = columns.has("empfehlung") ? "s.empfehlung" : "''";
  const statusExpr = columns.has("anmeldestatus")
    ? "LOWER(TRIM(COALESCE(s.anmeldestatus, '')))"
    : "''";
  const coordinatedSchoolColumn = columns.has("schul_nr")
    ? "NULLIF(TRIM(s.schul_nr), '')"
    : "NULL";

  const filters = [`${statusExpr} <> 'neuaufnahme'`];
  const params = [];

  if (columns.has("verfahren_id")) {
    filters.push("s.verfahren_id = ?");
    params.push(verfahrenId);
  }
  if (columns.has("runde_id")) {
    filters.push("s.runde_id = ?");
    params.push(rundeId);
  }

  const [rows] = await pool.query(
    `
    SELECT
      COALESCE(s.id, 0) AS row_id,
      COALESCE(${studentIdColumn}, '') AS schueler_id,
      COALESCE(s.vorname, '') AS vorname,
      COALESCE(s.nachname, '') AS nachname,
      COALESCE(${recommendationColumn}, '') AS empfehlung,
      COALESCE(s.foerderbedarf, '') AS foerderbedarf,
      COALESCE(s.zieldifferent, 0) AS zieldifferent,
      COALESCE(s.anmeldestatus, '') AS anmeldestatus,
      COALESCE(s.abgleich_status, '') AS abgleich_status,
      ${columns.has("geocoding_status") ? "COALESCE(s.geocoding_status, '')" : "''"} AS geocoding_status,
      ${columns.has("geocoding_fehler") ? "COALESCE(s.geocoding_fehler, '')" : "''"} AS geocoding_fehler,
      ${coordinatedSchoolColumn} AS koordinierte_snr,
      COALESCE(koord.name, '') AS koordinierte_schule,
      ${latitudeColumn} AS latitude,
      ${longitudeColumn} AS longitude
    FROM anm_schueler s
    LEFT JOIN anm_schulen koord
      ON koord.snr = ${coordinatedSchoolColumn || "NULL"}
    WHERE ${filters.join(" AND ")}
    ORDER BY COALESCE(s.nachname, '') ASC, COALESCE(s.vorname, '') ASC, COALESCE(s.id, 0) ASC
    `,
    params,
  );

  const baseRows = (rows || []).map((row) => ({
    row_id: Number(row?.row_id || 0),
    schueler_id: normalizeText(row?.schueler_id),
    vorname: normalizeText(row?.vorname),
    nachname: normalizeText(row?.nachname),
    empfehlung: normalizeText(row?.empfehlung),
    foerderbedarf: normalizeText(row?.foerderbedarf),
    zieldifferent: normalizeText(row?.zieldifferent),
    anmeldestatus: normalizeText(row?.anmeldestatus),
    abgleich_status: normalizeText(row?.abgleich_status),
    geocoding_status: normalizeText(row?.geocoding_status),
    geocoding_fehler: normalizeText(row?.geocoding_fehler),
    koordinierte_snr: normalizeText(row?.koordinierte_snr),
    koordinierte_schule: normalizeText(row?.koordinierte_schule),
    latitude: parseCoordinate(row?.latitude),
    longitude: parseCoordinate(row?.longitude),
    entfernung_km: null,
  }));

  if (!selectedSchool) {
    return { rows: baseRows, distanceMode: "" };
  }

  const { distances: orsDistances, mode } = await fetchOrsDistancesKm(selectedSchool, baseRows);
  const distanceMode = mode || "luftlinie";

  const rowsWithDistance = baseRows.map((row) => {
    const orsDistance = orsDistances.get(row.row_id);
    const luftlinie = calculateHaversineKm(
      selectedSchool.latitude,
      selectedSchool.longitude,
      row.latitude,
      row.longitude,
    );

    return {
      ...row,
      entfernung_km: orsDistance ?? formatDistanceKm(luftlinie),
    };
  });

  rowsWithDistance.sort((left, right) => {
    const a = left.entfernung_km;
    const b = right.entfernung_km;
    if (a === null && b === null) {
      return `${left.nachname} ${left.vorname}`.localeCompare(`${right.nachname} ${right.vorname}`, "de", {
        sensitivity: "base",
      });
    }
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });

  return { rows: rowsWithDistance, distanceMode };
}

function buildCoordinatorName(req) {
  return normalizeText(req.user?.user_fullname)
    || normalizeText(req.user?.username)
    || normalizeText(req.user?.email)
    || "System";
}

function createKoordinationController({ getPool }) {
  return {
    uebersicht: async (req, res) => {
      const connection = await getPool().getConnection();
      try {
        const verfahrenId = Number(req.query.verfahren_id || 0);
        const rundeId = Number(req.query.runde_id || 0);
        const selectedSnr = normalizeText(req.query.selected_snr);

        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");

        const schools = await loadSchoolRows(connection, verfahrenId, rundeId);
        const selectedSchool = selectedSnr
          ? schools.find((school) => school.snr === selectedSnr) || null
          : null;
        const { rows: students, distanceMode } = await loadStudentRows(connection, verfahrenId, rundeId, selectedSchool);

        return res.json({
          schools,
          students,
          selected_snr: selectedSchool?.snr || "",
          distance_mode: distanceMode,
        });
      } catch (error) {
        console.error("koordination overview failed:", error);
        return sendError(res, error?.statusCode || 500, error?.message || "Die Koordinationsansicht konnte nicht geladen werden.");
      } finally {
        connection.release();
      }
    },

    geocodeVisibleStudents: async (req, res) => {
      const connection = await getPool().getConnection();
      try {
        const verfahrenId = Number(req.body?.verfahren_id || 0);
        const rundeId = Number(req.body?.runde_id || 0);
        const rowIds = Array.from(
          new Set(
            (Array.isArray(req.body?.row_ids) ? req.body.row_ids : [])
              .map((value) => Number(value || 0))
              .filter((value) => Number.isInteger(value) && value > 0),
          ),
        );

        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");
        if (!rowIds.length) {
          return res.json({
            success: true,
            requested_count: 0,
            processed_count: 0,
            success_count: 0,
            failed_count: 0,
          });
        }

        const result = await geocodeKoordinationStudents(connection, verfahrenId, rundeId, rowIds);
        return res.json({
          success: true,
          requested_count: rowIds.length,
          processed_count: Number(result?.processedCount || 0),
          success_count: Number(result?.successCount || 0),
          failed_count: Number(result?.failedCount || 0),
        });
      } catch (error) {
        console.error("koordination visible geocoding failed:", error);
        return sendError(res, error?.statusCode || 500, error?.message || "Die sichtbaren Schuelerdaten konnten nicht geocodiert werden.");
      } finally {
        connection.release();
      }
    },

    offeneFaelle: async (req, res) => {
      try {
        const verfahrenId = Number(req.query.verfahren_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");

        const pool = getPool();
        const rows = await loadOffeneFaelleRows(pool, verfahrenId);
        const fallstatusOptions = await loadFallstatusOptions(pool);
        return res.json({ rows, fallstatusOptions });
      } catch (error) {
        console.error("offene faelle overview failed:", error);
        return sendError(res, error?.statusCode || 500, error?.message || "Die offenen Faelle konnten nicht geladen werden.");
      }
    },

    updateOffenerFall: async (req, res) => {
      try {
        const fallId = Number(req.params.id || 0);
        const verfahrenId = Number(req.body?.verfahren_id || 0);
        const fallstatusId = Number(req.body?.fallstatus_id || 0);
        const bemerkung = normalizeText(req.body?.bemerkung);

        if (!fallId) return sendError(res, 400, "id ist erforderlich.");
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!fallstatusId) return sendError(res, 400, "fallstatus_id ist erforderlich.");

        const pool = getPool();
        const [statusRows] = await pool.query(
          `
          SELECT id, COALESCE(bezeichnung, code) AS bezeichnung
          FROM anm_kat_fallstatus
          WHERE id = ?
          LIMIT 1
          `,
          [fallstatusId],
        );
        if (!Array.isArray(statusRows) || !statusRows.length) {
          return sendError(res, 404, "Der ausgewaehlte Fallstatus wurde nicht gefunden.");
        }

        const [existingRows] = await pool.query(
          `
          SELECT id
          FROM anm_offener_fall
          WHERE id = ?
            AND verfahren_id = ?
          LIMIT 1
          `,
          [fallId, verfahrenId],
        );
        if (!Array.isArray(existingRows) || !existingRows.length) {
          return sendError(res, 404, "Der offene Fall wurde nicht gefunden.");
        }

        await pool.query(
          `
          UPDATE anm_offener_fall
          SET fallstatus_id = ?,
              bemerkung = ?,
              updated_at = NOW()
          WHERE id = ?
          `,
          [fallstatusId, bemerkung || null, fallId],
        );

        return res.json({
          success: true,
          message: `Der offene Fall wurde auf ${normalizeText(statusRows[0]?.bezeichnung)} gesetzt.`,
        });
      } catch (error) {
        console.error("offener fall update failed:", error);
        return sendError(res, 500, "Der offene Fall konnte nicht gespeichert werden.");
      }
    },

    zuordnen: async (req, res) => {
      try {
        const verfahrenId = Number(req.body?.verfahren_id || 0);
        const rundeId = Number(req.body?.runde_id || 0);
        const rowIds = Array.from(
          new Set(
            (Array.isArray(req.body?.row_ids) ? req.body.row_ids : [req.body?.row_id])
              .map((value) => Number(value || 0))
              .filter((value) => Number.isInteger(value) && value > 0),
          ),
        );
        const schulNr = normalizeText(req.body?.schul_nr || req.body?.koordinierte_snr);

        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");
        if (!rowIds.length) return sendError(res, 400, "row_ids ist erforderlich.");
        if (!schulNr) return sendError(res, 400, "schul_nr ist erforderlich.");

        const pool = getPool();
        const studentColumns = await loadTableColumns(pool, "anm_schueler");
        if (!studentColumns.has("schul_nr")) {
          return sendError(res, 400, "Das Feld schul_nr ist in anm_schueler nicht vorhanden.");
        }

        const schoolBySnr = await loadSchoolMapBySnr(pool);
        if (!schoolBySnr.has(schulNr)) {
          return sendError(res, 404, "Die ausgewaehlte Schule wurde nicht gefunden.");
        }

        const rowPlaceholders = rowIds.map(() => "?").join(", ");
        const whereParts = [`id IN (${rowPlaceholders})`];
        const params = [];
        if (studentColumns.has("verfahren_id")) {
          whereParts.push("verfahren_id = ?");
          params.push(verfahrenId);
        }
        if (studentColumns.has("runde_id")) {
          whereParts.push("runde_id = ?");
          params.push(rundeId);
        }

        const [existingRows] = await pool.query(
          `
          SELECT id, COALESCE(vorname, '') AS vorname, COALESCE(nachname, '') AS nachname
          FROM anm_schueler
          WHERE ${whereParts.join(" AND ")}
          ORDER BY COALESCE(nachname, '') ASC, COALESCE(vorname, '') ASC, id ASC
          `,
          [...rowIds, ...params],
        );
        const existing = Array.isArray(existingRows) ? existingRows : [];
        if (!existing.length) {
          return sendError(res, 404, "Die ausgewaehlten Schueler wurden nicht gefunden.");
        }

        const assignments = ["schul_nr = ?"];
        const updateParams = [schulNr];

        if (studentColumns.has("koordiniert_am")) {
          assignments.push("koordiniert_am = NOW()");
        }
        if (studentColumns.has("koordiniert_von")) {
          assignments.push("koordiniert_von = ?");
          updateParams.push(buildCoordinatorName(req));
        }
        if (studentColumns.has("anmeldestatus")) {
          assignments.push("anmeldestatus = 'Zugeordnet'");
        }

        const [updateResult] = await pool.query(
          `
          UPDATE anm_schueler
          SET ${assignments.join(", ")}
          WHERE ${whereParts.join(" AND ")}
          `,
          [...updateParams, ...rowIds, ...params],
        );

        const updatedCount = Number(updateResult?.affectedRows || 0);
        const assignedSchoolName = schoolBySnr.get(schulNr);
        const firstStudent = existing[0];
        const message = updatedCount <= 1
          ? `${normalizeText(firstStudent?.nachname)}, ${normalizeText(firstStudent?.vorname)} wurde ${assignedSchoolName} zugeordnet.`
          : `${updatedCount} Schueler wurden ${assignedSchoolName} zugeordnet, beginnend mit ${normalizeText(firstStudent?.nachname)}, ${normalizeText(firstStudent?.vorname)}.`;

        return res.json({
          success: true,
          updated_count: updatedCount,
          requested_count: rowIds.length,
          message,
        });
      } catch (error) {
        console.error("koordination assignment failed:", error);
        return sendError(res, 500, "Die Zuordnung konnte nicht gespeichert werden.");
      }
    },
  };
}

module.exports = createKoordinationController;
