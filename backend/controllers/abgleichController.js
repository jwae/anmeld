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
    FROM anm_verfahren_schule vs
    JOIN anm_schulen s
      ON s.snr = vs.snr
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
    WHERE vs.verfahren_id = ?
    ORDER BY s.name ASC, s.snr ASC
    `,
    [verfahrenId, verfahrenId, rundeId, ...protocolParams, verfahrenId],
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
  const schuelerColumns = await loadTableColumns(pool, "anm_schueler_pool");
  const offenerFallExists = await tableExists(pool, "anm_offener_fall");
  const offenerFallColumns = offenerFallExists ? await loadTableColumns(pool, "anm_offener_fall") : new Set();
  const hasFallstatusTable = await tableExists(pool, "anm_kat_fallstatus");
  const hasEmpfehlungTable = await tableExists(pool, "anm_kat_empfehlung");

  const schuelerQuelleExpr = schuelerColumns.has("quelle")
    ? "COALESCE(NULLIF(TRIM(s.quelle), ''), CASE WHEN ax.schueler_pool_id IS NULL AND ax.schueler_anmeldung_id IS NOT NULL THEN 'ANMELDUNG' ELSE '' END)"
    : "CASE WHEN ax.schueler_pool_id IS NULL AND ax.schueler_anmeldung_id IS NOT NULL THEN 'ANMELDUNG' ELSE '' END";
  const schuelerNotizExpr = schuelerColumns.has("notiz")
    ? "COALESCE(s.notiz, ofall.notiz, '')"
    : "COALESCE(ofall.notiz, '')";

  const ofallStatusSelect = offenerFallColumns.has("fallstatus_id")
    ? "f.fallstatus_id"
    : offenerFallColumns.has("fallstatus_code")
      ? "f.fallstatus_code"
      : "NULL AS fallstatus_code";

  const ofallEmpfehlungSelect = offenerFallColumns.has("empfehlung_id")
    ? "f.empfehlung_id"
    : "NULL AS empfehlung_id";

  const ofallNotizSelect = offenerFallColumns.has("notiz")
    ? "f.notiz"
    : offenerFallColumns.has("bemerkung")
      ? "f.bemerkung AS notiz"
      : "NULL AS notiz";

  const ofallZugewieseneSnrSelect = offenerFallColumns.has("zugewiesene_snr")
    ? "f.zugewiesene_snr"
    : "NULL AS zugewiesene_snr";

  const fallstatusJoinCond = offenerFallColumns.has("fallstatus_id")
    ? "fs.id = ofall.fallstatus_id"
    : "fs.code = ofall.fallstatus_code";

  const empfehlungJoinCond = offenerFallColumns.has("empfehlung_id")
    ? "emp.id = ofall.empfehlung_id"
    : "emp.id = s.empfehlung_id";

  const fallJoin = offenerFallExists
    ? `
      LEFT JOIN (
        SELECT
          f.schueler_pool_id,
          f.fallgrund_id,
          ${ofallStatusSelect},
          ${ofallEmpfehlungSelect},
          ${ofallNotizSelect},
          ${ofallZugewieseneSnrSelect}
        FROM anm_offener_fall f
        WHERE f.verfahren_id = ?
      ) ofall
        ON ofall.schueler_pool_id = s.id
      LEFT JOIN anm_kat_fallgrund fg
        ON fg.id = ofall.fallgrund_id
      ${hasFallstatusTable
        ? `
      LEFT JOIN anm_kat_fallstatus fs
        ON ${fallstatusJoinCond}
      `
        : ""}
    `
    : `
      LEFT JOIN (
        SELECT 
          NULL AS schueler_pool_id, 
          NULL AS fallgrund_id, 
          NULL AS fallstatus_id,
          NULL AS fallstatus_code,
          NULL AS empfehlung_id, 
          NULL AS notiz,
          NULL AS zugewiesene_snr
      ) ofall
        ON 1 = 0
      LEFT JOIN anm_kat_fallgrund fg
        ON 1 = 0
    `;

  const empfehlungJoin = hasEmpfehlungTable
    ? `
      LEFT JOIN anm_kat_empfehlung emp
        ON ${empfehlungJoinCond}
    `
    : `
      LEFT JOIN (
        SELECT NULL AS id, NULL AS code, NULL AS bezeichnung
      ) emp
        ON 1 = 0
    `;

  const offenerFallFilter = offenerFallExists
    ? `
      OR EXISTS (
        SELECT 1
        FROM anm_offener_fall fx
        WHERE fx.verfahren_id = ?
          AND fx.schueler_pool_id = s.id
      )
    `
    : "";

  const [rows] = await pool.query(
    `
    SELECT
      COALESCE(s.id, sa.id) AS schueler_id,
      COALESCE(s.vorname, sa.vorname, '') AS vorname,
      COALESCE(s.nachname, sa.nachname, '') AS nachname,
      DATE_FORMAT(COALESCE(s.geburtsdatum, sa.geburtsdatum), '%Y-%m-%d') AS geburtsdatum,
      COALESCE(s.foerderbedarf, sa.foerderbedarf, '') AS foerderbedarf,
      COALESCE(s.zieldifferent, sa.zieldifferent, 0) AS zieldifferent,
      COALESCE(NULLIF(TRIM(emp.code), ''), NULLIF(TRIM(emp.bezeichnung), ''), '') AS empfehlung,
      ${schuelerQuelleExpr} AS quelle,
      COALESCE(sch.name, sch_ref.name, '') AS schule,
      COALESCE(sch.ort, sch_ref.ort, sch_ref.city, '') AS ort,
      COALESCE(a.snr, sa.snr, '') AS schulnummer,
      COALESCE(a.schueler_schul_id, sa.schueler_schul_id, '') AS schueler_schul_id,
      COALESCE(ax.abgleich_status, '') AS abgleich_status,
      COALESCE(NULLIF(TRIM(ast.code), ''), NULLIF(TRIM(ast.bezeichnung), ''), '') AS anmeldestatus,
      COALESCE(NULLIF(TRIM(fg.code), ''), NULLIF(TRIM(fg.bezeichnung), ''), '') AS fallgrund,
      ${hasFallstatusTable
        ? "COALESCE(NULLIF(TRIM(fs.code), ''), NULLIF(TRIM(fs.bezeichnung), ''), '')"
        : "COALESCE(NULLIF(TRIM(ofall.fallstatus_code), ''), '')"} AS fallstatus,
      COALESCE(zs.name, '') AS zugewiesene_schule,
      ${schuelerNotizExpr} AS notiz
    FROM anm_schueler_abgleich ax
    LEFT JOIN anm_schueler_pool s
      ON s.id = ax.schueler_pool_id
    LEFT JOIN anm_schueler_anmeldung sa
      ON sa.id = ax.schueler_anmeldung_id
    LEFT JOIN anm_anmeldung a
      ON (
        (ax.schueler_pool_id IS NOT NULL AND a.schueler_pool_id = ax.schueler_pool_id)
        OR (
          ax.schueler_pool_id IS NULL
          AND ax.schueler_anmeldung_id IS NOT NULL
          AND a.schueler_anmeldung_id = ax.schueler_anmeldung_id
        )
      )
     AND a.verfahren_id = ?
     AND a.runde_id = ?
    LEFT JOIN anm_schulen sch
      ON sch.snr = COALESCE(a.snr, sa.snr)
    LEFT JOIN school sch_ref
      ON sch_ref.snr = COALESCE(a.snr, sa.snr)
    LEFT JOIN anm_kat_anmeldestatus ast
      ON ast.id = a.anmeldestatus_id
    ${fallJoin}
    ${empfehlungJoin}
    LEFT JOIN anm_schulen zs
      ON zs.snr = ofall.zugewiesene_snr
    WHERE
      ax.verfahren_id = ?
      AND ax.runde_id = ?
    ORDER BY COALESCE(s.nachname, sa.nachname, '') ASC, COALESCE(s.vorname, sa.vorname, '') ASC, COALESCE(s.id, sa.id) ASC
    `,
    [
      verfahrenId,
      rundeId,
      ...(offenerFallExists ? [verfahrenId] : []),
      verfahrenId,
      rundeId,
    ],
  );

  return (rows || []).map((row) => ({
    schueler_id: Number(row?.schueler_id || 0),
    vorname: normalizeText(row?.vorname),
    nachname: normalizeText(row?.nachname),
    geburtsdatum: row?.geburtsdatum || null,
    foerderbedarf: normalizeText(row?.foerderbedarf),
    zieldifferent: Number(row?.zieldifferent || 0) === 1 ? 1 : 0,
    empfehlung: normalizeText(row?.empfehlung),
    quelle: normalizeText(row?.quelle),
    schule: normalizeText(row?.schule),
    ort: normalizeText(row?.ort),
    schulnummer: normalizeText(row?.schulnummer),
    schueler_schul_id: normalizeText(row?.schueler_schul_id),
    abgleich_status: normalizeText(row?.abgleich_status),
    anmeldestatus: normalizeText(row?.anmeldestatus),
    fallgrund: normalizeText(row?.fallgrund),
    fallstatus: normalizeText(row?.fallstatus),
    zugewiesene_schule: normalizeText(row?.zugewiesene_schule),
    notiz: normalizeText(row?.notiz),
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
        return res.json({ rows });
      } catch (error) {
        console.error(error);
        return sendError(res, 500, "Die Schueleruebersicht konnte nicht geladen werden.");
      }
    },
  };
}

module.exports = createAbgleichController;
