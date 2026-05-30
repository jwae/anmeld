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
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function truncateName(value, maxLength = 15) {
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
    FROM anm_verfahren_schule vs
    JOIN anm_schulen s
      ON s.snr = vs.snr
    ${capacityJoin}
    ${studentJoin}
    WHERE vs.verfahren_id = ?
    ${activeFilter}
    ORDER BY COALESCE(s.name, '') ASC, s.snr ASC
    `,
    [
      ...(capacityColumns.has("verfahren_id") && capacityColumns.has("snr") ? [verfahrenId] : []),
      ...studentParams,
      verfahrenId,
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
      COALESCE(s.anmeldestatus, '') AS anmeldestatus,
      COALESCE(s.abgleich_status, '') AS abgleich_status,
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
    anmeldestatus: normalizeText(row?.anmeldestatus),
    abgleich_status: normalizeText(row?.abgleich_status),
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
      try {
        const verfahrenId = Number(req.query.verfahren_id || 0);
        const rundeId = Number(req.query.runde_id || 0);
        const selectedSnr = normalizeText(req.query.selected_snr);

        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");

        const pool = getPool();
        const schools = await loadSchoolRows(pool, verfahrenId, rundeId);
        const selectedSchool = selectedSnr
          ? schools.find((school) => school.snr === selectedSnr) || null
          : null;
        const { rows: students, distanceMode } = await loadStudentRows(pool, verfahrenId, rundeId, selectedSchool);

        return res.json({
          schools,
          students,
          selected_snr: selectedSchool?.snr || "",
          distance_mode: distanceMode,
        });
      } catch (error) {
        console.error("koordination overview failed:", error);
        return sendError(res, 500, "Die Koordinationsansicht konnte nicht geladen werden.");
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
