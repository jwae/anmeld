function createGuardError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function loadContext(pool, verfahrenId, rundeId = null) {
  const [verfahrenRows] = await pool.query(
    "SELECT id, status FROM anm_verfahren WHERE id = ? LIMIT 1",
    [verfahrenId],
  );
  if (!Array.isArray(verfahrenRows) || !verfahrenRows.length) {
    throw createGuardError(404, "Das Verfahren wurde nicht gefunden.");
  }

  let runde = null;
  if (rundeId !== null && rundeId !== undefined && Number(rundeId) > 0) {
    const [rundeRows] = await pool.query(
      "SELECT id, verfahren_id, status FROM anm_runde WHERE id = ? AND verfahren_id = ? LIMIT 1",
      [rundeId, verfahrenId],
    );
    if (!Array.isArray(rundeRows) || !rundeRows.length) {
      throw createGuardError(409, "Die ausgewaehlte Runde gehoert nicht zu diesem Verfahren.");
    }
    runde = rundeRows[0];
  }

  return { verfahren: verfahrenRows[0], runde };
}

async function assertWritableContext(pool, verfahrenId, rundeId = null) {
  const context = await loadContext(pool, verfahrenId, rundeId);
  if (String(context.verfahren.status || "").trim() === "Beendet") {
    throw createGuardError(409, "Das Verfahren ist beendet. Aenderungen sind nicht moeglich.");
  }
  if (context.runde && String(context.runde.status || "").trim() !== "In Bearbeitung") {
    throw createGuardError(409, "Die ausgewaehlte Runde ist schreibgeschuetzt.");
  }
  return context;
}

async function assertStudentWritable(pool, rowId) {
  const [rows] = await pool.query(
    `SELECT s.id, s.verfahren_id, sr.runde_id
       FROM anm_schueler s
       LEFT JOIN anm_schueler_runde sr ON sr.schueler_id = s.id
       LEFT JOIN anm_runde r ON r.id = sr.runde_id AND r.status = 'In Bearbeitung'
      WHERE s.id = ?
      ORDER BY r.id IS NOT NULL DESC, sr.runde_id DESC
      LIMIT 1`,
    [rowId],
  );
  if (!Array.isArray(rows) || !rows.length) {
    throw createGuardError(404, "Der ausgewaehlte Schuelerdatensatz wurde nicht gefunden.");
  }
  const row = rows[0];
  await assertWritableContext(pool, Number(row.verfahren_id), row.runde_id ? Number(row.runde_id) : null);
  return row;
}

module.exports = {
  assertWritableContext,
  assertStudentWritable,
  loadContext,
};
