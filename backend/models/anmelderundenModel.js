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
  const schema = await verfahrenModel.loadSchemaConfig(pool);
  const workingRoundCondition = schema.workingRoundIdColumn
    ? `CASE WHEN v.${schema.workingRoundIdColumn} = r.id THEN 1 ELSE 0 END`
    : schema.roundWorkingFlagColumn
      ? `COALESCE(r.${schema.roundWorkingFlagColumn}, 0)`
      : "0";

  const [rows] = await pool.query(
    `SELECT
      r.id,
      r.verfahren_id,
      r.runden_nummer,
      r.bezeichnung,
      DATE_FORMAT(r.startdatum, '%Y-%m-%d') AS startdatum,
      DATE_FORMAT(r.enddatum, '%Y-%m-%d') AS enddatum,
      r.status,
      ${workingRoundCondition} AS ist_arbeitsrunde,
      DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(r.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
    FROM anm_runde r
    LEFT JOIN anm_verfahren v
      ON v.id = r.verfahren_id
    WHERE r.id = ?
    LIMIT 1`,
    [id],
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  return mapRoundRow(rows[0]);
}

async function listByVerfahrenId(pool, verfahrenId) {
  const schema = await verfahrenModel.loadSchemaConfig(pool);
  const workingRoundCondition = schema.workingRoundIdColumn
    ? `CASE WHEN v.${schema.workingRoundIdColumn} = r.id THEN 1 ELSE 0 END`
    : schema.roundWorkingFlagColumn
      ? `COALESCE(r.${schema.roundWorkingFlagColumn}, 0)`
      : "0";

  const [rows] = await pool.query(
    `SELECT
      r.id,
      r.verfahren_id,
      r.runden_nummer,
      r.bezeichnung,
      DATE_FORMAT(r.startdatum, '%Y-%m-%d') AS startdatum,
      DATE_FORMAT(r.enddatum, '%Y-%m-%d') AS enddatum,
      r.status,
      ${workingRoundCondition} AS ist_arbeitsrunde,
      DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(r.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
    FROM anm_runde r
    LEFT JOIN anm_verfahren v
      ON v.id = r.verfahren_id
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
  const schema = await verfahrenModel.loadSchemaConfig(pool);
  const fields = ["verfahren_id", "runden_nummer", "bezeichnung", "startdatum", "enddatum", "status"];
  const values = [
    verfahrenId,
    payload.runden_nummer,
    payload.bezeichnung,
    payload.startdatum || null,
    payload.enddatum || null,
    payload.status,
  ];
  if (schema.roundWorkingFlagColumn) {
    fields.push(schema.roundWorkingFlagColumn);
    values.push(0);
  }

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

async function setWorkingRound(pool, roundId) {
  const connection = await pool.getConnection();
  try {
    const schema = await verfahrenModel.loadSchemaConfig(connection);
    await connection.beginTransaction();

    const round = await findProcedureForRound(connection, roundId);
    if (!round) {
      const error = new Error("Anmelderunde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    if (String(round.verfahren_status || "").trim() === "Beendet") {
      const error = new Error("Bei beendeten Verfahren kann die Arbeitsrunde nicht mehr geaendert werden.");
      error.statusCode = 409;
      throw error;
    }
    if (!["In Bearbeitung", "Beendet"].includes(String(round.status || "").trim())) {
      const error = new Error("Nur Runden im Status 'In Bearbeitung' oder 'Beendet' koennen als Arbeitsrunde gesetzt werden.");
      error.statusCode = 409;
      throw error;
    }

    await verfahrenModel.setWorkingRound(connection, Number(round.verfahren_id), Number(round.id), schema);
    await connection.commit();
    return findById(pool, roundId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function startRound(pool, targetRoundId) {
  const connection = await pool.getConnection();
  try {
    const schema = await verfahrenModel.loadSchemaConfig(connection);
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
    const currentRound = (roundRows || []).find((row) => String(row.status || "").trim() === "In Bearbeitung");
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

    await verfahrenModel.setWorkingRound(connection, Number(targetRound.verfahren_id), Number(targetRound.id), schema);

    const schuelerColumns = await loadTableColumns(connection, "anm_schueler");
    const excludedColumns = new Set(["id", "verfahren_id", "runde_id", "created_at", "updated_at"]);
    const copyColumns = [
      "schueler_id",
      "schueler_nr",
      "herkunftsschule_snr",
      "herkunftsschueler_nr",
      "anmeldeschule_snr",
      "zugewiesene_schule_snr",
      "zugewiesen_am",
      "zugewiesen_von",
      "zugewiesen_bemerkung",
      "herkunft",
      "abgleich_status",
      "anmeldestatus",
      "teilnahmestatus",
      "empfehlung",
      "vorname",
      "nachname",
      "geburtsdatum",
      "ef",
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

    let copiedStudents = 0;
    if (copyColumns.length) {
      const insertColumns = ["verfahren_id", "runde_id", ...copyColumns];
      const selectColumns = ["?", "?", ...copyColumns.map((column) => `s.${column}`)];
      if (schuelerColumns.has("erwartete_snr") && schuelerColumns.has("anmeldeschule_snr")) {
        insertColumns.push("erwartete_snr");
        selectColumns.push("s.anmeldeschule_snr");
      }
      insertColumns.push("created_at", "updated_at");
      selectColumns.push("NOW()", "NOW()");

      const [insertResult] = await connection.query(
        `INSERT INTO anm_schueler (${insertColumns.join(", ")})
         SELECT ${selectColumns.join(", ")}
         FROM anm_schueler s
         WHERE s.verfahren_id = ?
           AND s.runde_id = ?
           AND s.teilnahmestatus = 'Aktiv'`,
        [targetRound.verfahren_id, targetRound.id, targetRound.verfahren_id, currentRound.id],
      );
      copiedStudents = Number(insertResult?.affectedRows || 0);
    }

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
  setWorkingRound,
  startRound,
  remove,
};

