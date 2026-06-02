const STATUS_VALUES = ["geplant", "aktiv", "abgeschlossen"];

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

async function countRoundWorkingData(pool, rundenId) {
  const checks = [
    { table: "anm_anmeldung", column: "runde_id" },
    { table: "anm_schueler_anmeldung", column: "runde_id" },
    { table: "anm_abgleich_protokoll", column: "runde_id" },
    { table: "anm_schueler_abgleich", column: "runde_id" },
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

async function startNextRound(pool, currentRoundId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const currentRound = await findById(connection, currentRoundId);
    if (!currentRound) {
      const error = new Error("Anmelderunde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    if (currentRound.status !== "aktiv") {
      const error = new Error("Nur aktive Runden koennen abgeschlossen und fortgesetzt werden.");
      error.statusCode = 409;
      throw error;
    }

    const nextRoundNumber = Number(currentRound.runden_nummer || 0) + 1;
    const [nextRoundRows] = await connection.query(
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
         AND runden_nummer = ?
       LIMIT 1`,
      [currentRound.verfahren_id, nextRoundNumber],
    );

    let nextRound = Array.isArray(nextRoundRows) && nextRoundRows.length
      ? mapRoundRow(nextRoundRows[0])
      : null;
    const created = !nextRound;

    if (nextRound) {
      if (nextRound.status === "abgeschlossen") {
        const error = new Error(
          `Die vorhandene Runde ${nextRoundNumber} ist bereits abgeschlossen und kann nicht erneut aktiviert werden.`,
        );
        error.statusCode = 409;
        throw error;
      }
      const hasWorkingData = await countRoundWorkingData(connection, nextRound.id);
      if (hasWorkingData > 0) {
        const error = new Error(
          `Die vorhandene Runde ${nextRoundNumber} enthaelt bereits Arbeitsdaten und kann nicht automatisch vorbereitet werden.`,
        );
        error.statusCode = 409;
        throw error;
      }
    } else {
      const [insertResult] = await connection.query(
        `INSERT INTO anm_runde (
          verfahren_id,
          runden_nummer,
          bezeichnung,
          startdatum,
          enddatum,
          status
        ) VALUES (?, ?, ?, CURDATE(), NULL, 'aktiv')`,
        [currentRound.verfahren_id, nextRoundNumber, currentRound.bezeichnung],
      );
      nextRound = await findById(connection, insertResult.insertId);
    }

    await connection.query(
      `UPDATE anm_runde
       SET status = 'abgeschlossen', updated_at = NOW()
       WHERE id = ?`,
      [currentRound.id],
    );

    await connection.query(
      `UPDATE anm_runde
       SET status = 'aktiv', updated_at = NOW()
       WHERE id = ?`,
      [nextRound.id],
    );

    const schuelerColumns = await loadTableColumns(connection, "anm_schueler");
    const excludedColumns = new Set(["id", "verfahren_id", "runde_id", "created_at", "updated_at"]);
    const copyColumns = [
      "schueler_id",
      "schueler_nr",
      "schul_nr",
      "herkunft",
      "abgleich_status",
      "anmeldestatus",
      "teilnahmestatus",
      "empfehlung",
      "vorname",
      "nachname",
      "geburtsdatum",
      "foerderbedarf",
      "foerder_id",
      "zieldifferent",
      "bemerkung",
      "strasse",
      "plz",
      "ort",
      "latitude",
      "longitude",
      "geocoding_status",
      "geocoding_fehler",
      "geocoded_at",
      "koordinierte_snr",
      "koordiniert_am",
      "koordiniert_von",
      "quelle",
    ].filter((column) => schuelerColumns.has(column) && !excludedColumns.has(column));

    await connection.query(
      `DELETE FROM anm_schueler
       WHERE verfahren_id = ?
         AND runde_id = ?
         AND schueler_id NOT IN (
           SELECT source.schueler_id
           FROM (
             SELECT schueler_id
             FROM anm_schueler
             WHERE verfahren_id = ?
               AND runde_id = ?
               AND teilnahmestatus = 'Aktiv'
           ) AS source
         )`,
      [currentRound.verfahren_id, nextRound.id, currentRound.verfahren_id, currentRound.id],
    );

    let copiedStudents = 0;
    if (copyColumns.length) {
      const insertColumns = ["verfahren_id", "runde_id", ...copyColumns, "created_at", "updated_at"];
      const selectColumns = ["?", "?", ...copyColumns.map((column) => `s.${column}`), "NOW()", "NOW()"];
      const updateAssignments = copyColumns.map((column) => `${column} = VALUES(${column})`);
      updateAssignments.push("updated_at = VALUES(updated_at)");

      const [insertResult] = await connection.query(
        `INSERT INTO anm_schueler (${insertColumns.join(", ")})
         SELECT ${selectColumns.join(", ")}
         FROM anm_schueler s
         WHERE s.verfahren_id = ?
           AND s.runde_id = ?
           AND s.teilnahmestatus = 'Aktiv'
         ON DUPLICATE KEY UPDATE ${updateAssignments.join(", ")}`,
        [currentRound.verfahren_id, nextRound.id, currentRound.verfahren_id, currentRound.id],
      );
      copiedStudents = Number(insertResult?.affectedRows || 0);
    }

    await connection.commit();
    return {
      created,
      copied_students: copiedStudents,
      current_round: {
        ...currentRound,
        status: "abgeschlossen",
      },
      next_round: await findById(pool, nextRound.id),
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
  startNextRound,
  remove,
};
