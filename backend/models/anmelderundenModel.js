const STATUS_VALUES = ["geplant", "aktiv", "abgeschlossen"];

async function tableExists(pool, tableName) {
  const [rows] = await pool.query("SHOW TABLES LIKE ?", [tableName]);
  return Array.isArray(rows) && rows.length > 0;
}

function mapRoundRow(row) {
  return {
    id: Number(row.id),
    verfahren_id: Number(row.verfahren_id),
    runden_nummer: Number(row.runden_nummer),
    bezeichnung: String(row.bezeichnung || "").trim(),
    startdatum: row.startdatum,
    enddatum: row.enddatum,
    status: String(row.status || "").trim(),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listByVerfahrenId(pool, verfahrenId) {
  const [rows] = await pool.query(
    `SELECT
      id,
      verfahren_id,
      runden_nummer,
      bezeichnung,
      DATE_FORMAT(startdatum, '%Y-%m-%d') AS startdatum,
      DATE_FORMAT(enddatum, '%Y-%m-%d') AS enddatum,
      status,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
    FROM anm_runde
    WHERE verfahren_id = ?
    ORDER BY runden_nummer ASC, id ASC`,
    [verfahrenId],
  );
  return (rows || []).map(mapRoundRow);
}

async function findById(pool, id) {
  const [rows] = await pool.query(
    `SELECT
      id,
      verfahren_id,
      runden_nummer,
      bezeichnung,
      DATE_FORMAT(startdatum, '%Y-%m-%d') AS startdatum,
      DATE_FORMAT(enddatum, '%Y-%m-%d') AS enddatum,
      status,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
    FROM anm_runde
    WHERE id = ?
    LIMIT 1`,
    [id],
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  return mapRoundRow(rows[0]);
}

async function existsForVerfahren(pool, verfahrenId) {
  const [rows] = await pool.query(
    "SELECT id FROM anm_verfahren WHERE id = ? LIMIT 1",
    [verfahrenId],
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function hasDuplicateRoundNumber(pool, verfahrenId, rundenNummer, excludeId = null) {
  const params = [verfahrenId, rundenNummer];
  let sql = `
    SELECT id
    FROM anm_runde
    WHERE verfahren_id = ?
      AND runden_nummer = ?
  `;
  if (excludeId !== null && excludeId !== undefined) {
    sql += " AND id <> ?";
    params.push(excludeId);
  }
  sql += " LIMIT 1";
  const [rows] = await pool.query(sql, params);
  return Array.isArray(rows) && rows.length > 0;
}

async function create(pool, verfahrenId, payload) {
  const [result] = await pool.query(
    `INSERT INTO anm_runde (
      verfahren_id,
      runden_nummer,
      bezeichnung,
      startdatum,
      enddatum,
      status
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      verfahrenId,
      payload.runden_nummer,
      payload.bezeichnung,
      payload.startdatum || null,
      payload.enddatum || null,
      payload.status,
    ],
  );
  return findById(pool, result.insertId);
}

async function update(pool, id, payload) {
  const [result] = await pool.query(
    `UPDATE anm_runde
     SET runden_nummer = ?, bezeichnung = ?, startdatum = ?, enddatum = ?, status = ?
     WHERE id = ?`,
    [
      payload.runden_nummer,
      payload.bezeichnung,
      payload.startdatum || null,
      payload.enddatum || null,
      payload.status,
      id,
    ],
  );
  if (!result.affectedRows) return null;
  return findById(pool, id);
}

async function countBlockingDependencies(pool, rundenId) {
  const blockers = [];
  const checks = [
    { table: "anm_anmeldung", label: "importierte Anmeldungen" },
    { table: "anm_abgleich_protokoll", label: "Abrufprotokolle" },
  ];

  for (const check of checks) {
    if (!(await tableExists(pool, check.table))) continue;
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total FROM ${check.table} WHERE runde_id = ?`,
      [rundenId],
    );
    const count = Number(rows?.[0]?.total || 0);
    if (count > 0) blockers.push({ label: check.label, count });
  }

  return blockers;
}

async function remove(pool, id) {
  const [result] = await pool.query("DELETE FROM anm_runde WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

module.exports = {
  STATUS_VALUES,
  listByVerfahrenId,
  findById,
  existsForVerfahren,
  hasDuplicateRoundNumber,
  create,
  update,
  countBlockingDependencies,
  remove,
};
