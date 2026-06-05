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

async function tableExists(pool, tableName) {
  const [rows] = await pool.query("SHOW TABLES LIKE ?", [tableName]);
  return Array.isArray(rows) && rows.length > 0;
}

async function loadProcedureAndRound(pool, verfahrenId, rundeId) {
  const [verfahrenRows] = await pool.query(
    `
    SELECT id, schuljahr, bezeichnung
    FROM anm_verfahren
    WHERE id = ?
    LIMIT 1
    `,
    [verfahrenId],
  );
  const verfahren = Array.isArray(verfahrenRows) && verfahrenRows.length ? verfahrenRows[0] : null;
  if (!verfahren) return null;

  const [rundeRows] = await pool.query(
    `
    SELECT id, verfahren_id, runden_nummer, bezeichnung
    FROM anm_runde
    WHERE id = ?
      AND verfahren_id = ?
    LIMIT 1
    `,
    [rundeId, verfahrenId],
  );
  const runde = Array.isArray(rundeRows) && rundeRows.length ? rundeRows[0] : null;
  if (!runde) return null;

  return {
    verfahren: {
      id: Number(verfahren.id || 0),
      schuljahr: normalizeText(verfahren.schuljahr),
      bezeichnung: normalizeText(verfahren.bezeichnung),
    },
    runde: {
      id: Number(runde.id || 0),
      runden_nummer: Number(runde.runden_nummer || 0),
      bezeichnung: normalizeText(runde.bezeichnung),
    },
  };
}

async function loadSchoolRows(pool, verfahrenId, rundeId) {
  const protocolColumns = await loadTableColumns(pool, "anm_abgleich_protokoll");
  const importTimeColumn = protocolColumns.has("abrufzeitpunkt")
    ? "abrufzeitpunkt"
    : protocolColumns.has("created_at")
      ? "created_at"
      : "";
  const protocolFilter = [];
  if (protocolColumns.has("verfahren_id")) protocolFilter.push("p.verfahren_id = ?");
  if (protocolColumns.has("runde_id")) protocolFilter.push("p.runde_id = ?");
  if (protocolColumns.has("import_typ")) protocolFilter.push("p.import_typ = 'ANMELDUNG'");

  const protocolJoin = importTimeColumn
    ? `
      LEFT JOIN (
        SELECT
          p.snr,
          MAX(p.${importTimeColumn}) AS letzter_import
        FROM anm_abgleich_protokoll p
        ${protocolFilter.length ? `WHERE ${protocolFilter.join(" AND ")}` : ""}
        GROUP BY p.snr
      ) prot
        ON prot.snr = s.snr
    `
    : `
      LEFT JOIN (
        SELECT NULL AS snr, NULL AS letzter_import
      ) prot
        ON 1 = 0
    `;

  const protocolParams = [];
  if (protocolColumns.has("verfahren_id")) protocolParams.push(verfahrenId);
  if (protocolColumns.has("runde_id")) protocolParams.push(rundeId);

  const [rows] = await pool.query(
    `
    SELECT
      s.snr,
      s.name,
      COALESCE(NULLIF(TRIM(sf.sf_kurz), ''), NULLIF(TRIM(s.sf_id), ''), '') AS schulform,
      COALESCE(cap.kapazitaet, 0) AS kapazitaet,
      COALESCE(cap.reservierte_plaetze, 0) AS reservierte_plaetze,
      COALESCE(stat.neuaufnahmen, 0) AS neuaufnahmen,
      COALESCE(stat.warteliste, 0) AS warteliste,
      COALESCE(stat.ablehnungen, 0) AS ablehnungen,
      prot.letzter_import
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
    LEFT JOIN anm_kat_sf sf
      ON sf.code = s.sf_id
    LEFT JOIN (
      SELECT
        k.snr,
        SUM(COALESCE(k.gesamtkapazitaet, 0)) AS kapazitaet,
        SUM(COALESCE(k.reservierte_plaetze, 0)) AS reservierte_plaetze
      FROM anm_kapazitaet k
      WHERE k.verfahren_id = ?
      GROUP BY k.snr
    ) cap
      ON cap.snr = s.snr
    LEFT JOIN (
      SELECT
        a.snr,
        SUM(CASE WHEN st.code = 'NEUAUFNAHME' THEN 1 ELSE 0 END) AS neuaufnahmen,
        SUM(CASE WHEN st.code = 'WARTELISTE' THEN 1 ELSE 0 END) AS warteliste,
        SUM(CASE WHEN st.code = 'ABLEHNUNG' THEN 1 ELSE 0 END) AS ablehnungen
      FROM anm_anmeldung a
      JOIN anm_kat_anmeldestatus st
        ON st.id = a.anmeldestatus_id
      WHERE a.verfahren_id = ?
        AND a.runde_id = ?
      GROUP BY a.snr
    ) stat
      ON stat.snr = s.snr
    ${protocolJoin}
    WHERE 1 = 1
    ORDER BY s.name ASC, s.snr ASC
    `,
    [verfahrenId, verfahrenId, verfahrenId, rundeId, ...protocolParams],
  );

  return (rows || []).map((row) => {
    const kapazitaet = Number(row?.kapazitaet || 0);
    const reserviertePlaetze = Number(row?.reservierte_plaetze || 0);
    const neuaufnahmen = Number(row?.neuaufnahmen || 0);
    const warteliste = Number(row?.warteliste || 0);
    const ablehnungen = Number(row?.ablehnungen || 0);
    const belegtePlaetze = neuaufnahmen;
    const freiePlaetze = kapazitaet - reserviertePlaetze - belegtePlaetze;
    const ueberbelegung = Math.max(0, belegtePlaetze - kapazitaet);

    return {
      snr: normalizeText(row?.snr),
      name: normalizeText(row?.name),
      schulform: normalizeText(row?.schulform),
      kapazitaet,
      reservierte_plaetze: reserviertePlaetze,
      neuaufnahmen,
      warteliste,
      ablehnungen,
      belegte_plaetze: belegtePlaetze,
      freie_plaetze: freiePlaetze,
      ueberbelegung: ueberbelegung,
      letzter_import: row?.letzter_import || null,
    };
  });
}

async function loadSummary(pool, verfahrenId, rundeId, schoolRows) {
  const [statusRows] = await pool.query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN st.code = 'NEUAUFNAHME' THEN 1 ELSE 0 END), 0) AS neuaufnahmen,
      COALESCE(SUM(CASE WHEN st.code = 'WARTELISTE' THEN 1 ELSE 0 END), 0) AS warteliste,
      COALESCE(SUM(CASE WHEN st.code = 'ABLEHNUNG' THEN 1 ELSE 0 END), 0) AS ablehnungen,
      COUNT(DISTINCT CASE WHEN a.schueler_pool_id IS NOT NULL THEN a.schueler_pool_id END) AS mit_anmeldung
    FROM anm_anmeldung a
    JOIN anm_kat_anmeldestatus st
      ON st.id = a.anmeldestatus_id
    WHERE a.verfahren_id = ?
      AND a.runde_id = ?
    `,
    [verfahrenId, rundeId],
  );

  let schuelerGesamt = Number(statusRows?.[0]?.mit_anmeldung || 0);
  let ohneAnmeldung = 0;

  if (await tableExists(pool, "anm_offener_fall")) {
    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM (
        SELECT DISTINCT schueler_pool_id
        FROM anm_offener_fall
        WHERE verfahren_id = ?
          AND schueler_pool_id IS NOT NULL
        UNION
        SELECT DISTINCT schueler_pool_id
        FROM anm_anmeldung
        WHERE verfahren_id = ?
          AND runde_id = ?
          AND schueler_pool_id IS NOT NULL
      ) considered
      `,
      [verfahrenId, verfahrenId, rundeId],
    );
    schuelerGesamt = Number(countRows?.[0]?.total || 0);
    ohneAnmeldung = Math.max(0, schuelerGesamt - Number(statusRows?.[0]?.mit_anmeldung || 0));
  }

  const freiePlaetzeGesamt = schoolRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row?.freie_plaetze || 0)),
    0,
  );

  return {
    schueler_gesamt: schuelerGesamt,
    neuaufnahmen: Number(statusRows?.[0]?.neuaufnahmen || 0),
    warteliste: Number(statusRows?.[0]?.warteliste || 0),
    ablehnungen: Number(statusRows?.[0]?.ablehnungen || 0),
    ohne_anmeldung: ohneAnmeldung,
    freie_plaetze: freiePlaetzeGesamt,
  };
}

async function loadSchuelerRows(pool, verfahrenId, rundeId) {
  const columns = await loadTableColumns(pool, "anm_schueler");
  if (!columns.size) return [];
  const hasFoerderbedarfTable = await tableExists(pool, "anm_kat_foerderbedarf");
  const foerderbedarfColumns = hasFoerderbedarfTable
    ? await loadTableColumns(pool, "anm_kat_foerderbedarf")
    : new Set();

  const schoolColumn = columns.has("schul_nr")
    ? "s.schul_nr"
    : (columns.has("snr") ? "s.snr" : "''");
  const studentIdColumn = columns.has("schueler_id")
    ? "s.schueler_id"
    : (columns.has("schueler_nr") ? "s.schueler_nr" : "''");
  const foerderCatalogKey = foerderbedarfColumns.has("foerder_id")
    ? "foerder_id"
    : (foerderbedarfColumns.has("id") ? "id" : "");
  const foerderJoin = columns.has("foerder_id") && hasFoerderbedarfTable && foerderCatalogKey
    ? `LEFT JOIN anm_kat_foerderbedarf fbd ON fbd.${foerderCatalogKey} = s.foerder_id`
    : "";
  const foerderLabelExpr = foerderJoin && foerderbedarfColumns.has("bezeichnung")
    ? "COALESCE(fbd.bezeichnung, '')"
    : (foerderJoin && foerderbedarfColumns.has("name")
      ? "COALESCE(fbd.name, '')"
      : (foerderJoin && foerderbedarfColumns.has("code") ? "COALESCE(fbd.code, '')" : "''"));
  const whereParts = [];
  const params = [];

  if (columns.has("verfahren_id")) {
    whereParts.push("s.verfahren_id = ?");
    params.push(verfahrenId);
  }
  if (columns.has("runde_id")) {
    whereParts.push("s.runde_id = ?");
    params.push(rundeId);
  }

  const [rows] = await pool.query(
    `
    SELECT
      COALESCE(s.id, 0) AS schueler_id,
      COALESCE(s.vorname, '') AS vorname,
      COALESCE(s.nachname, '') AS nachname,
      DATE_FORMAT(s.geburtsdatum, '%Y-%m-%d') AS geburtsdatum,
      COALESCE(s.foerderbedarf, '') AS foerderbedarf,
      ${columns.has("foerder_id") ? "COALESCE(s.foerder_id, '')" : "''"} AS foerder_id,
      ${foerderLabelExpr} AS foerder_label,
      COALESCE(s.zieldifferent, 0) AS zieldifferent,
      COALESCE(s.herkunft, '') AS herkunft,
      COALESCE(sch.name, sref.name, '') AS schule,
      COALESCE(sch.ort, sref.ort, sref.city, '') AS ort,
      NULLIF(TRIM(${schoolColumn}), '') AS schulnummer,
      NULLIF(TRIM(${studentIdColumn}), '') AS schueler_schul_id,
      COALESCE(s.abgleich_status, '') AS abgleich_status,
      COALESCE(s.anmeldestatus, '') AS anmeldestatus
    FROM anm_schueler s
    LEFT JOIN anm_schulen sch
      ON sch.snr = ${schoolColumn}
    LEFT JOIN school sref
      ON sref.snr = ${schoolColumn}
    ${foerderJoin}
    ${whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : ""}
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
    schule: normalizeText(row?.schule),
    ort: normalizeText(row?.ort),
    schulnummer: normalizeText(row?.schulnummer),
    schueler_schul_id: normalizeText(row?.schueler_schul_id),
    abgleich_status: normalizeText(row?.abgleich_status),
    anmeldestatus: normalizeText(row?.anmeldestatus),
  }));
}

async function loadSchuelerCardSummary(pool, verfahrenId, rundeId) {
  const columns = await loadTableColumns(pool, "anm_schueler");
  if (!columns.size) {
    return {
      gesamt: 0,
      schulen: 0,
      neuaufnahme: 0,
      warteliste: 0,
      abgelehnt: 0,
      ohne: 0,
      foerderbedarf: 0,
      zieldifferent: 0,
    };
  }

  const filters = [];
  const params = [];

  if (columns.has("verfahren_id")) {
    filters.push("verfahren_id = ?");
    params.push(verfahrenId);
  }
  if (columns.has("runde_id")) {
    filters.push("runde_id = ?");
    params.push(rundeId);
  }

  const schoolColumn = columns.has("schul_nr")
    ? "schul_nr"
    : (columns.has("snr") ? "snr" : "");
  const anmeldestatusExpr = columns.has("anmeldestatus")
    ? "LOWER(TRIM(COALESCE(anmeldestatus, '')))"
    : "''";
  const foerderbedarfExpr = columns.has("foerderbedarf")
    ? `
      CASE
        WHEN TRIM(COALESCE(foerderbedarf, '')) = '' THEN 0
        WHEN LOWER(TRIM(COALESCE(foerderbedarf, ''))) IN ('0', 'false', 'nein', 'no') THEN 0
        ELSE 1
      END
    `
    : "0";
  const zieldifferentExpr = columns.has("zieldifferent")
    ? `
      CASE
        WHEN LOWER(TRIM(COALESCE(zieldifferent, '0'))) IN ('1', 'true', 'ja', 'yes') THEN 1
        ELSE 0
      END
    `
    : "0";
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `
    SELECT
      COUNT(*) AS gesamt,
      ${schoolColumn
        ? `COUNT(DISTINCT NULLIF(TRIM(${schoolColumn}), ''))`
        : "0"} AS schulen,
      COALESCE(SUM(CASE WHEN ${anmeldestatusExpr} = 'neuaufnahme' THEN 1 ELSE 0 END), 0) AS neuaufnahme,
      COALESCE(SUM(CASE WHEN ${anmeldestatusExpr} = 'warteliste' THEN 1 ELSE 0 END), 0) AS warteliste,
      COALESCE(SUM(CASE WHEN ${anmeldestatusExpr} IN ('abgelehnt', 'ablehnung') THEN 1 ELSE 0 END), 0) AS abgelehnt,
      COALESCE(SUM(CASE WHEN ${anmeldestatusExpr} IN ('', 'ohne') THEN 1 ELSE 0 END), 0) AS ohne,
      COALESCE(SUM(${foerderbedarfExpr}), 0) AS foerderbedarf,
      COALESCE(SUM(${zieldifferentExpr}), 0) AS zieldifferent
    FROM anm_schueler
    ${whereClause}
    `,
    params,
  );

  return {
    gesamt: Number(rows?.[0]?.gesamt || 0),
    schulen: Number(rows?.[0]?.schulen || 0),
    neuaufnahme: Number(rows?.[0]?.neuaufnahme || 0),
    warteliste: Number(rows?.[0]?.warteliste || 0),
    abgelehnt: Number(rows?.[0]?.abgelehnt || 0),
    ohne: Number(rows?.[0]?.ohne || 0),
    foerderbedarf: Number(rows?.[0]?.foerderbedarf || 0),
    zieldifferent: Number(rows?.[0]?.zieldifferent || 0),
  };
}

async function loadSchoolOverviewFromSchueler(pool, verfahrenId, rundeId) {
  const columns = await loadTableColumns(pool, "anm_schueler");
  if (!columns.size) return [];
  const kapazitaetColumns = await loadTableColumns(pool, "anm_kapazitaet");

  const filters = [];
  const params = [];

  if (columns.has("verfahren_id")) {
    filters.push("s.verfahren_id = ?");
    params.push(verfahrenId);
  }
  if (columns.has("runde_id")) {
    filters.push("s.runde_id = ?");
    params.push(rundeId);
  }

  const schoolColumn = columns.has("schul_nr")
    ? "s.schul_nr"
    : (columns.has("snr") ? "s.snr" : "''");
  const statusExpr = columns.has("anmeldestatus")
    ? "LOWER(TRIM(COALESCE(s.anmeldestatus, '')))"
    : "''";
  const foerderbedarfExpr = columns.has("foerderbedarf")
    ? `
      CASE
        WHEN TRIM(COALESCE(s.foerderbedarf, '')) = '' THEN 0
        WHEN LOWER(TRIM(COALESCE(s.foerderbedarf, ''))) IN ('0', 'false', 'nein', 'no') THEN 0
        ELSE 1
      END
    `
    : "0";
  const zieldifferentExpr = columns.has("zieldifferent")
    ? `
      CASE
        WHEN LOWER(TRIM(COALESCE(s.zieldifferent, '0'))) IN ('1', 'true', 'ja', 'yes') THEN 1
        ELSE 0
      END
    `
    : "0";
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const capacityJoin = kapazitaetColumns.has("verfahren_id") && kapazitaetColumns.has("snr")
    ? `
      LEFT JOIN (
        SELECT
          k.snr,
          SUM(COALESCE(k.gesamtkapazitaet, 0)) AS kapazitaet
        FROM anm_kapazitaet k
        WHERE k.verfahren_id = ?
        GROUP BY k.snr
      ) cap
        ON cap.snr = ${schoolColumn}
    `
    : `
      LEFT JOIN (
        SELECT NULL AS snr, 0 AS kapazitaet
      ) cap
        ON 1 = 0
    `;

  const [rows] = await pool.query(
    `
    SELECT
      NULLIF(TRIM(${schoolColumn}), '') AS schulnummer,
      COALESCE(NULLIF(TRIM(sch.name), ''), NULLIF(TRIM(sref.name), ''), 'Ohne Schule') AS schule,
      COALESCE(cap.kapazitaet, 0) AS kapazitaet,
      COUNT(*) AS gesamt,
      COALESCE(SUM(CASE WHEN ${statusExpr} = 'neuaufnahme' THEN 1 ELSE 0 END), 0) AS neuaufnahme,
      COALESCE(SUM(CASE WHEN ${statusExpr} = 'warteliste' THEN 1 ELSE 0 END), 0) AS warteliste,
      COALESCE(SUM(CASE WHEN ${statusExpr} IN ('', 'ohne') THEN 1 ELSE 0 END), 0) AS ohne,
      COALESCE(SUM(${foerderbedarfExpr}), 0) AS foerderbedarf,
      COALESCE(SUM(${zieldifferentExpr}), 0) AS zieldifferent
    FROM anm_schueler s
    LEFT JOIN anm_schulen sch
      ON sch.snr = ${schoolColumn}
    LEFT JOIN school sref
      ON sref.snr = ${schoolColumn}
    ${capacityJoin}
    ${whereClause}
    GROUP BY NULLIF(TRIM(${schoolColumn}), ''), COALESCE(NULLIF(TRIM(sch.name), ''), NULLIF(TRIM(sref.name), ''), 'Ohne Schule'), COALESCE(cap.kapazitaet, 0)
    ORDER BY COALESCE(NULLIF(TRIM(sch.name), ''), NULLIF(TRIM(sref.name), ''), 'Ohne Schule') ASC
    `,
    [...(kapazitaetColumns.has("verfahren_id") && kapazitaetColumns.has("snr") ? [verfahrenId] : []), ...params],
  );

  return (rows || []).map((row) => ({
    schulnummer: normalizeText(row?.schulnummer),
    schule: normalizeText(row?.schule) || "Ohne Schule",
    kapazitaet: Number(row?.kapazitaet || 0),
    gesamt: Number(row?.gesamt || 0),
    neuaufnahme: Number(row?.neuaufnahme || 0),
    warteliste: Number(row?.warteliste || 0),
    ohne: Number(row?.ohne || 0),
    foerderbedarf: Number(row?.foerderbedarf || 0),
    zieldifferent: Number(row?.zieldifferent || 0),
  }));
}

function createAbgleichController({ getPool }) {
  return {
    verfahrenUebersicht: async (req, res) => {
      try {
        const verfahrenId = Number(req.query.verfahren_id || 0);
        const rundeId = Number(req.query.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");

        const pool = getPool();
        const context = await loadProcedureAndRound(pool, verfahrenId, rundeId);
        if (!context) return sendError(res, 404, "Verfahren oder Runde nicht gefunden.");

        const schulen = await loadSchoolRows(pool, verfahrenId, rundeId);
        const summary = await loadSummary(pool, verfahrenId, rundeId, schulen);

        return res.json({
          zusammenfassung: {
            schuljahr: context.verfahren.schuljahr || context.verfahren.bezeichnung,
            runde: context.runde.bezeichnung || `Runde ${context.runde.runden_nummer}`,
            schueler_gesamt: summary.schueler_gesamt,
            neuaufnahmen: summary.neuaufnahmen,
            warteliste: summary.warteliste,
            ablehnungen: summary.ablehnungen,
            ohne_anmeldung: summary.ohne_anmeldung,
            freie_plaetze: summary.freie_plaetze,
          },
          schulen,
        });
      } catch (error) {
        console.error(error);
        return sendError(res, 500, "Die Verfahrensuebersicht konnte nicht geladen werden.");
      }
    },

    schuelerUebersicht: async (req, res) => {
      try {
        const verfahrenId = Number(req.query.verfahren_id || 0);
        const rundeId = Number(req.query.runde_id || 0);
        if (!verfahrenId) return sendError(res, 400, "verfahren_id ist erforderlich.");
        if (!rundeId) return sendError(res, 400, "runde_id ist erforderlich.");

        const pool = getPool();
        const context = await loadProcedureAndRound(pool, verfahrenId, rundeId);
        if (!context) return sendError(res, 404, "Verfahren oder Runde nicht gefunden.");

        const rows = await loadSchuelerRows(pool, verfahrenId, rundeId);
        const summary = await loadSchuelerCardSummary(pool, verfahrenId, rundeId);
        const schoolOverview = await loadSchoolOverviewFromSchueler(pool, verfahrenId, rundeId);
        return res.json({ rows, summary, schoolOverview });
      } catch (error) {
        console.error(error);
        return sendError(res, 500, "Die Schueleruebersicht konnte nicht geladen werden.");
      }
    },
  };
}

module.exports = createAbgleichController;
