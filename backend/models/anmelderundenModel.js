const verfahrenModel = require("./anmeldeverfahrenModel");

const STATUS_VALUES = ["Vorbereitet", "In Bearbeitung", "Beendet"];

async function tableExists(pool, tableName) {
  const [rows] = await pool.query("SHOW TABLES LIKE ?", [tableName]);
  return Array.isArray(rows) && rows.length > 0;
}

async function loadTableColumns(pool, tableName) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${tableName}`);
  return new Set((rows || []).map((row) => String(row?.Field || "").trim()).filter(Boolean));
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
    ist_arbeitsrunde: Number(row.ist_arbeitsrunde || 0) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findById(pool, id) {
  const [rows] = await pool.query(
    `SELECT
      r.id,
      r.verfahren_id,
      r.runden_nummer,
      r.bezeichnung,
      DATE_FORMAT(r.startdatum, '%Y-%m-%d') AS startdatum,
      DATE_FORMAT(r.enddatum, '%Y-%m-%d') AS enddatum,
      r.status,
      CASE WHEN r.status = 'In Bearbeitung' THEN 1 ELSE 0 END AS ist_arbeitsrunde,
      DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(r.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
    FROM anm_runde r
    WHERE r.id = ?
    LIMIT 1`,
    [id],
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  return mapRoundRow(rows[0]);
}

async function listByVerfahrenId(pool, verfahrenId) {
  const [rows] = await pool.query(
    `SELECT
      r.id,
      r.verfahren_id,
      r.runden_nummer,
      r.bezeichnung,
      DATE_FORMAT(r.startdatum, '%Y-%m-%d') AS startdatum,
      DATE_FORMAT(r.enddatum, '%Y-%m-%d') AS enddatum,
      r.status,
      CASE WHEN r.status = 'In Bearbeitung' THEN 1 ELSE 0 END AS ist_arbeitsrunde,
      DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(r.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
    FROM anm_runde r
    WHERE r.verfahren_id = ?
    ORDER BY r.runden_nummer ASC, r.id ASC`,
    [verfahrenId],
  );
  return (rows || []).map(mapRoundRow);
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
  const fields = ["verfahren_id", "runden_nummer", "bezeichnung", "startdatum", "enddatum", "status"];
  const values = [
    verfahrenId,
    payload.runden_nummer,
    payload.bezeichnung,
    payload.startdatum || null,
    payload.enddatum || null,
    payload.status,
  ];
  const [result] = await pool.query(
    `INSERT INTO anm_runde (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`,
    values,
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

async function countRoundWorkingData(pool, rundenId) {
  const checks = [
    { table: "anm_anmeldung", column: "runde_id" },
    { table: "anm_schueler_anmeldung", column: "runde_id" },
    { table: "anm_abgleich_protokoll", column: "runde_id" },
    { table: "anm_schueler_abgleich", column: "runde_id" },
    { table: "anm_schueler_runde", column: "runde_id" },
  ];

  let total = 0;
  for (const check of checks) {
    if (!(await tableExists(pool, check.table))) continue;
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total FROM ${check.table} WHERE ${check.column} = ?`,
      [rundenId],
    );
    total += Number(rows?.[0]?.total || 0);
  }
  return total;
}

async function findProcedureForRound(connection, roundId) {
  const [rows] = await connection.query(
    `SELECT
      r.id,
      r.verfahren_id,
      r.runden_nummer,
      r.status,
      v.status AS verfahren_status
    FROM anm_runde r
    JOIN anm_verfahren v
      ON v.id = r.verfahren_id
    WHERE r.id = ?
    LIMIT 1
    FOR UPDATE`,
    [roundId],
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows[0];
}

async function startRound(pool, targetRoundId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const targetRound = await findProcedureForRound(connection, targetRoundId);
    if (!targetRound) {
      const error = new Error("Anmelderunde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    if (String(targetRound.verfahren_status || "").trim() === "Beendet") {
      const error = new Error("Beendete Verfahren koennen keine neue Runde starten.");
      error.statusCode = 409;
      throw error;
    }
    if (String(targetRound.verfahren_status || "").trim() !== "In Bearbeitung") {
      const error = new Error("Eine neue Runde kann erst gestartet werden, wenn das Verfahren in Bearbeitung ist.");
      error.statusCode = 409;
      throw error;
    }
    if (String(targetRound.status || "").trim() !== "Vorbereitet") {
      const error = new Error("Nur vorbereitete Runden koennen gestartet werden.");
      error.statusCode = 409;
      throw error;
    }

    const [roundRows] = await connection.query(
      `SELECT id, verfahren_id, runden_nummer, status
       FROM anm_runde
       WHERE verfahren_id = ?
       ORDER BY runden_nummer ASC, id ASC
       FOR UPDATE`,
      [targetRound.verfahren_id],
    );
    const currentWorkingRoundId = await verfahrenModel.findWorkingRoundId(
      connection,
      Number(targetRound.verfahren_id),
    );
    const currentRound = (roundRows || []).find((row) => Number(row.id) === Number(currentWorkingRoundId));
    if (!currentRound) {
      const error = new Error("Es gibt keine aktuelle Runde in Bearbeitung.");
      error.statusCode = 409;
      throw error;
    }
    if (Number(targetRound.runden_nummer) !== Number(currentRound.runden_nummer) + 1) {
      const error = new Error("Es kann nur die naechste vorbereitete Runde gestartet werden.");
      error.statusCode = 409;
      throw error;
    }

    const targetHasWorkingData = await countRoundWorkingData(connection, Number(targetRound.id));
    if (targetHasWorkingData > 0) {
      const error = new Error(
        `Die Runde ${targetRound.runden_nummer} enthaelt bereits Arbeitsdaten und kann nicht gestartet werden.`,
      );
      error.statusCode = 409;
      throw error;
    }

    await connection.query(
      `UPDATE anm_runde
       SET status = 'Beendet', updated_at = NOW()
       WHERE id = ?`,
      [currentRound.id],
    );

    await connection.query(
      `UPDATE anm_runde
       SET status = 'In Bearbeitung', updated_at = NOW()
       WHERE id = ?`,
      [targetRound.id],
    );

    const [insertResult] = await connection.query(
      `INSERT INTO anm_schueler_runde
         (verfahren_id, schueler_id, runde_id, anmeldestatus, teilnahmestatus,
          schul_nr, koordinierte_snr, koordiniert_am, koordiniert_von,
          abgleich_status, created_at, updated_at)
       SELECT sr.verfahren_id, sr.schueler_id, ?, sr.anmeldestatus, sr.teilnahmestatus,
              sr.schul_nr, sr.koordinierte_snr, sr.koordiniert_am, sr.koordiniert_von,
              sr.abgleich_status, NOW(), NOW()
       FROM anm_schueler_runde sr
       WHERE sr.verfahren_id = ?
         AND sr.runde_id = ?
         AND sr.teilnahmestatus = 'Aktiv'
         AND NOT EXISTS (
           SELECT 1
           FROM anm_schueler_runde target_sr
           WHERE target_sr.verfahren_id = sr.verfahren_id
             AND target_sr.schueler_id = sr.schueler_id
             AND target_sr.runde_id = ?
         )`,
      [targetRound.id, targetRound.verfahren_id, currentRound.id, targetRound.id],
    );
    const copiedStudents = Number(insertResult?.affectedRows || 0);

    await connection.commit();
    return {
      created: false,
      copied_students: copiedStudents,
      current_round: {
        ...(await findById(pool, Number(currentRound.id))),
        status: "Beendet",
      },
      next_round: await findById(pool, Number(targetRound.id)),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
  countRoundWorkingData,
  startRound,
  remove,
};

