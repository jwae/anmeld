const STATUS_VALUES = ["geplant", "aktiv", "abgeschlossen"];

async function querySingleValue(pool, sql, params = []) {
  const [rows] = await pool.query(sql, params);
  if (!Array.isArray(rows) || !rows.length) return 0;
  const firstRow = rows[0] || {};
  const firstKey = Object.keys(firstRow)[0];
  return Number(firstRow[firstKey] || 0);
}

async function tableExists(pool, tableName) {
  const [rows] = await pool.query("SHOW TABLES LIKE ?", [tableName]);
  return Array.isArray(rows) && rows.length > 0;
}

async function mapProcedureRow(row) {
  return {
    id: Number(row.id),
    schuljahr: String(row.schuljahr || "").trim(),
    bezeichnung: String(row.bezeichnung || "").trim(),
    status: String(row.status || "").trim(),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listAll(pool) {
  const [rows] = await pool.query(
    `SELECT
      id,
      schuljahr,
      bezeichnung,
      status,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
    FROM anm_verfahren
    ORDER BY schuljahr DESC, id DESC`,
  );
  return Promise.all((rows || []).map(mapProcedureRow));
}

async function findById(pool, id) {
  const [rows] = await pool.query(
    `SELECT
      id,
      schuljahr,
      bezeichnung,
      status,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
    FROM anm_verfahren
    WHERE id = ?
    LIMIT 1`,
    [id],
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  return mapProcedureRow(rows[0]);
}

async function create(pool, payload) {
  const [result] = await pool.query(
    `INSERT INTO anm_verfahren (schuljahr, bezeichnung, status)
     VALUES (?, ?, ?)`,
    [payload.schuljahr, payload.bezeichnung, payload.status],
  );
  return findById(pool, result.insertId);
}

function mapParticipatingSchoolRow(row) {
  return {
    snr: String(row.snr || "").trim(),
    name: String(row.name || "").trim(),
    ort: String(row.ort || "").trim(),
    schulform: String(row.schulform || "").trim(),
    selected: Number(row.selected || 0) === 1,
  };
}

async function update(pool, id, payload) {
  const [result] = await pool.query(
    `UPDATE anm_verfahren
     SET schuljahr = ?, bezeichnung = ?, status = ?
     WHERE id = ?`,
    [payload.schuljahr, payload.bezeichnung, payload.status, id],
  );
  if (!result.affectedRows) return null;
  return findById(pool, id);
}

async function listParticipatingSchools(pool, verfahrenId) {
  const [rows] = await pool.query(
    `SELECT
      s.snr,
      s.name,
      COALESCE(NULLIF(TRIM(s.ort), ''), NULLIF(TRIM(s.plz), ''), '') AS ort,
      COALESCE(NULLIF(TRIM(sf.sf_kurz), ''), NULLIF(TRIM(s.sf_id), ''), '') AS schulform,
      CASE WHEN vs.snr IS NULL THEN 0 ELSE 1 END AS selected
    FROM anm_schulen s
    LEFT JOIN anm_kat_sf sf
      ON sf.code = s.sf_id
    LEFT JOIN anm_verfahren_schule vs
      ON vs.verfahren_id = ?
     AND vs.snr = s.snr
    ORDER BY s.name ASC, s.snr ASC`,
    [verfahrenId],
  );
  return (rows || []).map(mapParticipatingSchoolRow);
}

async function syncParticipatingSchools(pool, verfahrenId, snrList = []) {
  const normalizedSnrList = Array.from(new Set(
    (snrList || [])
      .map((value) => String(value || "").trim())
      .filter((value) => value.length > 0),
  ));

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingVerfahren] = await connection.query(
      "SELECT id FROM anm_verfahren WHERE id = ? LIMIT 1",
      [verfahrenId],
    );
    if (!Array.isArray(existingVerfahren) || !existingVerfahren.length) {
      await connection.rollback();
      return { exists: false, rows: [] };
    }

    if (normalizedSnrList.length) {
      const placeholders = normalizedSnrList.map(() => "?").join(", ");
      const [existingSchools] = await connection.query(
        `SELECT snr FROM anm_schulen WHERE snr IN (${placeholders})`,
        normalizedSnrList,
      );
      const existingSnrSet = new Set((existingSchools || []).map((row) => String(row.snr || "").trim()));
      const missingSnrList = normalizedSnrList.filter((snr) => !existingSnrSet.has(snr));
      if (missingSnrList.length) {
        const error = new Error(`Unbekannte Schulen: ${missingSnrList.join(", ")}`);
        error.statusCode = 400;
        throw error;
      }
    }

    await connection.query("DELETE FROM anm_verfahren_schule WHERE verfahren_id = ?", [verfahrenId]);

    if (normalizedSnrList.length) {
      const values = normalizedSnrList.map((snr) => [verfahrenId, snr]);
      await connection.query(
        "INSERT INTO anm_verfahren_schule (verfahren_id, snr) VALUES ?",
        [values],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return {
    exists: true,
    rows: await listParticipatingSchools(pool, verfahrenId),
  };
}

async function countBlockingDependencies(pool, verfahrenId) {
  const checks = [
    { table: "anm_kapazitaet", label: "Kapazitaeten", column: "verfahren_id" },
    { table: "anm_anmeldung", label: "importierte Anmeldungen", column: "verfahren_id" },
    { table: "anm_offener_fall", label: "offene Faelle", column: "verfahren_id" },
    { table: "anm_merkzettel", label: "Merkzettel", column: "verfahren_id" },
  ];

  const blockers = [];
  for (const check of checks) {
    // The schema is still evolving, so we skip missing future tables gracefully.
    // Existing tables still block deletion as intended.
    if (!(await tableExists(pool, check.table))) continue;
    const count = await querySingleValue(
      pool,
      `SELECT COUNT(*) AS total FROM ${check.table} WHERE ${check.column} = ?`,
      [verfahrenId],
    );
    if (count > 0) {
      blockers.push({ label: check.label, count });
    }
  }
  return blockers;
}

async function removeWithRounds(pool, verfahrenId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM anm_runde WHERE verfahren_id = ?", [verfahrenId]);
    const [result] = await connection.query("DELETE FROM anm_verfahren WHERE id = ?", [verfahrenId]);
    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  STATUS_VALUES,
  listAll,
  findById,
  create,
  update,
  listParticipatingSchools,
  syncParticipatingSchools,
  countBlockingDependencies,
  removeWithRounds,
};
