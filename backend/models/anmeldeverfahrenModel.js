const STATUS_VALUES = ["Vorbereitet", "In Bearbeitung", "Beendet"];
const VERFAHRENSTYP_VALUES = ["GS", "SEK1"];
const SCHOOL_GROUP_ROLE_VALUES = ["Quellschulen", "Zielschulen"];
const ROUND_STATUS_IN_PROGRESS = "In Bearbeitung";

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

async function loadTableColumns(pool, tableName) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${tableName}`);
  return new Set((rows || []).map((row) => String(row?.Field || "").trim()).filter(Boolean));
}

function findFirstColumn(columns, candidates) {
  for (const candidate of candidates) {
    if (columns.has(candidate)) return candidate;
  }
  return "";
}

async function loadSchemaConfig(pool) {
  const procedureColumns = await loadTableColumns(pool, "anm_verfahren");
  const roundColumns = await loadTableColumns(pool, "anm_runde");

  return {
    procedureColumns,
    roundColumns,
    visibleColumn: findFirstColumn(procedureColumns, ["sichtbar"]),
    workingRoundIdColumn: findFirstColumn(procedureColumns, ["arbeitsrunde_id", "arbeits_runde_id", "working_round_id"]),
    roundWorkingFlagColumn: findFirstColumn(roundColumns, ["ist_arbeitsrunde", "arbeitsrunde", "is_arbeitsrunde"]),
  };
}

function mapProcedureRow(row) {
  return {
    id: Number(row.id),
    schuljahr: String(row.schuljahr || "").trim(),
    bezeichnung: String(row.bezeichnung || "").trim(),
    verfahrenstyp: String(row.verfahrenstyp || "GS").trim(),
    status: String(row.status || "").trim(),
    sichtbar: Number(row.sichtbar ?? 1) === 1,
    arbeitsrunde_id: row.arbeitsrunde_id === null || row.arbeitsrunde_id === undefined
      ? null
      : Number(row.arbeitsrunde_id),
    arbeitsrunde_nummer: row.arbeitsrunde_nummer === null || row.arbeitsrunde_nummer === undefined
      ? null
      : Number(row.arbeitsrunde_nummer),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapSchoolGroupRoleKey(role) {
  return String(role || "").trim() === "Quellschulen" ? "quellschulen" : "zielschulen";
}

function mapProcedureSchoolGroupRow(row) {
  const schoolSnrs = String(row.school_snrs || "")
    .split(",")
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);

  return {
    id: Number(row.id || 0),
    name: String(row.name || "").trim(),
    beschreibung: String(row.beschreibung || "").trim(),
    aktiv: Number(row.aktiv || 0) === 1,
    rolle: String(row.rolle || "").trim(),
    schoolSnrs,
  };
}

async function buildProcedureSelect(pool, options = {}) {
  const schema = await loadSchemaConfig(pool);
  const procedureAlias = options.alias || "v";
  const selectParts = [
    `${procedureAlias}.id`,
    `${procedureAlias}.schuljahr`,
    `${procedureAlias}.bezeichnung`,
    `${procedureAlias}.verfahrenstyp`,
    `${procedureAlias}.status`,
    schema.visibleColumn
      ? `COALESCE(${procedureAlias}.${schema.visibleColumn}, 1) AS sichtbar`
      : "1 AS sichtbar",
    schema.workingRoundIdColumn
      ? `${procedureAlias}.${schema.workingRoundIdColumn} AS arbeitsrunde_id`
      : schema.roundWorkingFlagColumn
        ? `(SELECT r.id FROM anm_runde r WHERE r.verfahren_id = ${procedureAlias}.id AND COALESCE(r.${schema.roundWorkingFlagColumn}, 0) = 1 ORDER BY r.runden_nummer ASC, r.id ASC LIMIT 1) AS arbeitsrunde_id`
        : "NULL AS arbeitsrunde_id",
    schema.workingRoundIdColumn
      ? `(SELECT r.runden_nummer FROM anm_runde r WHERE r.id = ${procedureAlias}.${schema.workingRoundIdColumn} LIMIT 1) AS arbeitsrunde_nummer`
      : schema.roundWorkingFlagColumn
        ? `(SELECT r.runden_nummer FROM anm_runde r WHERE r.verfahren_id = ${procedureAlias}.id AND COALESCE(r.${schema.roundWorkingFlagColumn}, 0) = 1 ORDER BY r.runden_nummer ASC, r.id ASC LIMIT 1) AS arbeitsrunde_nummer`
        : "NULL AS arbeitsrunde_nummer",
    `DATE_FORMAT(${procedureAlias}.created_at, '%Y-%m-%d %H:%i:%s') AS created_at`,
    `DATE_FORMAT(${procedureAlias}.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at`,
  ];

  return { schema, selectSql: selectParts.join(",\n      ") };
}

async function listAll(pool, options = {}) {
  const { schema, selectSql } = await buildProcedureSelect(pool);
  const params = [];
  const whereClauses = [];

  if (!options.includeHidden && schema.visibleColumn) {
    whereClauses.push(`COALESCE(v.${schema.visibleColumn}, 1) = 1`);
  }

  const [rows] = await pool.query(
    `SELECT
      ${selectSql}
    FROM anm_verfahren v
    ${whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : ""}
    ORDER BY v.schuljahr DESC, v.id DESC`,
    params,
  );
  return Promise.all((rows || []).map(mapProcedureRow));
}

async function findById(pool, id) {
  const { selectSql } = await buildProcedureSelect(pool);
  const [rows] = await pool.query(
    `SELECT
      ${selectSql}
    FROM anm_verfahren v
    WHERE v.id = ?
    LIMIT 1`,
    [id],
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  return mapProcedureRow(rows[0]);
}

async function findWorkingRoundId(connection, verfahrenId, schema) {
  if (schema.workingRoundIdColumn) {
    const [rows] = await connection.query(
      `SELECT ${schema.workingRoundIdColumn} AS arbeitsrunde_id FROM anm_verfahren WHERE id = ? LIMIT 1`,
      [verfahrenId],
    );
    const value = rows?.[0]?.arbeitsrunde_id;
    return value === null || value === undefined ? null : Number(value);
  }

  if (schema.roundWorkingFlagColumn) {
    const [rows] = await connection.query(
      `SELECT id FROM anm_runde WHERE verfahren_id = ? AND COALESCE(${schema.roundWorkingFlagColumn}, 0) = 1 ORDER BY runden_nummer ASC, id ASC LIMIT 1`,
      [verfahrenId],
    );
    return rows?.length ? Number(rows[0].id) : null;
  }

  return null;
}

async function setWorkingRound(connection, verfahrenId, rundenId, schema) {
  if (schema.workingRoundIdColumn) {
    await connection.query(
      `UPDATE anm_verfahren SET ${schema.workingRoundIdColumn} = ?, updated_at = NOW() WHERE id = ?`,
      [rundenId, verfahrenId],
    );
  }

  if (schema.roundWorkingFlagColumn) {
    await connection.query(
      `UPDATE anm_runde
       SET ${schema.roundWorkingFlagColumn} = CASE WHEN id = ? THEN 1 ELSE 0 END,
           updated_at = NOW()
       WHERE verfahren_id = ?`,
      [rundenId, verfahrenId],
    );
  }
}

async function clearWorkingRound(connection, verfahrenId, schema) {
  if (schema.workingRoundIdColumn) {
    await connection.query(
      `UPDATE anm_verfahren SET ${schema.workingRoundIdColumn} = NULL, updated_at = NOW() WHERE id = ?`,
      [verfahrenId],
    );
  }

  if (schema.roundWorkingFlagColumn) {
    await connection.query(
      `UPDATE anm_runde SET ${schema.roundWorkingFlagColumn} = 0, updated_at = NOW() WHERE verfahren_id = ?`,
      [verfahrenId],
    );
  }
}

async function create(pool, payload) {
  const connection = await pool.getConnection();
  try {
    const schema = await loadSchemaConfig(connection);
    await connection.beginTransaction();

    const initialProcedureStatus = "Vorbereitet";

    const fields = ["schuljahr", "bezeichnung", "verfahrenstyp", "status"];
    const values = [payload.schuljahr, payload.bezeichnung, payload.verfahrenstyp, initialProcedureStatus];

    if (schema.visibleColumn) {
      fields.push(schema.visibleColumn);
      values.push(payload.sichtbar ? 1 : 0);
    }
    if (schema.workingRoundIdColumn) {
      fields.push(schema.workingRoundIdColumn);
      values.push(null);
    }

    const placeholders = fields.map(() => "?").join(", ");
    const [result] = await connection.query(
      `INSERT INTO anm_verfahren (${fields.join(", ")}) VALUES (${placeholders})`,
      values,
    );

    const roundFields = ["verfahren_id", "runden_nummer", "bezeichnung", "startdatum", "enddatum", "status"];
    if (schema.roundWorkingFlagColumn) roundFields.push(schema.roundWorkingFlagColumn);

    for (let roundNumber = 1; roundNumber <= 3; roundNumber += 1) {
      const roundValues = [
        result.insertId,
        roundNumber,
        `Runde ${roundNumber}`,
        null,
        null,
        "Vorbereitet",
      ];
      if (schema.roundWorkingFlagColumn) roundValues.push(0);
      const roundPlaceholders = roundFields.map(() => "?").join(", ");
      await connection.query(
        `INSERT INTO anm_runde (${roundFields.join(", ")}) VALUES (${roundPlaceholders})`,
        roundValues,
      );
    }

    await connection.commit();
    return findById(pool, result.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function hasDuplicateSchoolYear(pool, schuljahr, excludeId = null) {
  const normalizedSchuljahr = String(schuljahr || "").trim();
  if (!normalizedSchuljahr) return false;
  const [rows] = excludeId
    ? await pool.query(
      `SELECT id
       FROM anm_verfahren
       WHERE schuljahr = ?
         AND id <> ?
       LIMIT 1`,
      [normalizedSchuljahr, excludeId],
    )
    : await pool.query(
      `SELECT id
       FROM anm_verfahren
       WHERE schuljahr = ?
       LIMIT 1`,
      [normalizedSchuljahr],
    );
  return Array.isArray(rows) && rows.length > 0;
}

async function update(pool, id, payload) {
  const schema = await loadSchemaConfig(pool);
  const assignments = [
    "schuljahr = ?",
    "bezeichnung = ?",
    "verfahrenstyp = ?",
    "status = ?",
  ];
  const values = [payload.schuljahr, payload.bezeichnung, payload.verfahrenstyp, payload.status];

  if (schema.visibleColumn) {
    assignments.push(`${schema.visibleColumn} = ?`);
    values.push(payload.sichtbar ? 1 : 0);
  }

  values.push(id);
  const [result] = await pool.query(
    `UPDATE anm_verfahren
     SET ${assignments.join(", ")}
     WHERE id = ?`,
    values,
  );
  if (!result.affectedRows) return null;
  return findById(pool, id);
}

async function updateVisibility(pool, id, sichtbar) {
  const schema = await loadSchemaConfig(pool);
  if (!schema.visibleColumn) {
    const error = new Error("Die Sichtbarkeit wird vom aktuellen Datenbankschema nicht unterstuetzt.");
    error.statusCode = 409;
    throw error;
  }
  const [result] = await pool.query(
    `UPDATE anm_verfahren SET ${schema.visibleColumn} = ?, updated_at = NOW() WHERE id = ?`,
    [sichtbar ? 1 : 0, id],
  );
  if (!result.affectedRows) return null;
  return findById(pool, id);
}

async function listProcedureSchoolGroups(pool, verfahrenId) {
  const [rows] = await pool.query(
    `SELECT
      vsg.rolle,
      sg.id,
      sg.name,
      sg.beschreibung,
      sg.aktiv,
      GROUP_CONCAT(DISTINCT sgs.snr ORDER BY sgs.snr SEPARATOR ',') AS school_snrs
    FROM anm_verfahren_schulgruppe vsg
    JOIN anm_schulgruppe sg
      ON sg.id = vsg.schulgruppe_id
    LEFT JOIN anm_schulgruppe_schule sgs
      ON sgs.schulgruppe_id = sg.id
    WHERE vsg.verfahren_id = ?
    GROUP BY
      vsg.rolle,
      sg.id,
      sg.name,
      sg.beschreibung,
      sg.aktiv
    ORDER BY
      CASE vsg.rolle
        WHEN 'Quellschulen' THEN 1
        WHEN 'Zielschulen' THEN 2
        ELSE 9
      END,
      sg.name ASC,
      sg.id ASC`,
    [verfahrenId],
  );

  return (rows || []).reduce((result, row) => {
    const mappedRow = mapProcedureSchoolGroupRow(row);
    const targetKey = mapSchoolGroupRoleKey(mappedRow.rolle);
    result[targetKey].push(mappedRow);
    return result;
  }, {
    quellschulen: [],
    zielschulen: [],
  });
}

async function syncProcedureSchoolGroupsByRole(pool, verfahrenId, role, schoolGroupIds = []) {
  const normalizedRole = String(role || "").trim();
  if (!SCHOOL_GROUP_ROLE_VALUES.includes(normalizedRole)) {
    const error = new Error(`Ungueltige Rolle. Erlaubt: ${SCHOOL_GROUP_ROLE_VALUES.join(", ")}.`);
    error.statusCode = 400;
    throw error;
  }

  const normalizedSchoolGroupIds = Array.from(new Set(
    (schoolGroupIds || [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
  ));

  if (normalizedSchoolGroupIds.length > 1) {
    const error = new Error("Pro Rolle ist je Verfahren nur eine Schulgruppe erlaubt.");
    error.statusCode = 400;
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingVerfahren] = await connection.query(
      "SELECT id FROM anm_verfahren WHERE id = ? LIMIT 1",
      [verfahrenId],
    );
    if (!Array.isArray(existingVerfahren) || !existingVerfahren.length) {
      await connection.rollback();
      return { exists: false, schoolGroups: { quellschulen: [], zielschulen: [] } };
    }

    if (normalizedSchoolGroupIds.length) {
      const placeholders = normalizedSchoolGroupIds.map(() => "?").join(", ");
      const [existingSchoolGroups] = await connection.query(
        `SELECT id FROM anm_schulgruppe WHERE id IN (${placeholders})`,
        normalizedSchoolGroupIds,
      );
      const existingSchoolGroupIdSet = new Set(
        (existingSchoolGroups || []).map((row) => Number(row.id || 0)),
      );
      const missingSchoolGroupIds = normalizedSchoolGroupIds.filter((entry) => !existingSchoolGroupIdSet.has(entry));
      if (missingSchoolGroupIds.length) {
        const error = new Error(`Unbekannte Schulgruppen: ${missingSchoolGroupIds.join(", ")}`);
        error.statusCode = 400;
        throw error;
      }
    }

    await connection.query(
      "DELETE FROM anm_verfahren_schulgruppe WHERE verfahren_id = ? AND rolle = ?",
      [verfahrenId, normalizedRole],
    );

    if (normalizedSchoolGroupIds.length) {
      const values = normalizedSchoolGroupIds.map((schoolGroupId) => [verfahrenId, schoolGroupId, normalizedRole]);
      await connection.query(
        "INSERT INTO anm_verfahren_schulgruppe (verfahren_id, schulgruppe_id, rolle) VALUES ?",
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
    schoolGroups: await listProcedureSchoolGroups(pool, verfahrenId),
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
    if (!(await tableExists(pool, check.table))) continue;
    const count = await querySingleValue(
      pool,
      `SELECT COUNT(*) AS total FROM ${check.table} WHERE ${check.column} = ?`,
      [verfahrenId],
    );
    if (count > 0) blockers.push({ label: check.label, count });
  }
  return blockers;
}

async function deleteRowsByProcedureIfPossible(connection, tableName, verfahrenId) {
  if (!(await tableExists(connection, tableName))) return;
  const columns = await loadTableColumns(connection, tableName);
  if (!columns.has("verfahren_id")) return;
  await connection.query(`DELETE FROM ${tableName} WHERE verfahren_id = ?`, [verfahrenId]);
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

async function removeProcedureCompletely(pool, verfahrenId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [procedureRows] = await connection.query(
      "SELECT id, status FROM anm_verfahren WHERE id = ? LIMIT 1 FOR UPDATE",
      [verfahrenId],
    );
    if (!Array.isArray(procedureRows) || !procedureRows.length) {
      const error = new Error("Anmeldeverfahren nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }

    const currentStatus = String(procedureRows[0].status || "").trim();
    if (currentStatus !== "Beendet") {
      const error = new Error("Nur beendete Verfahren koennen geloescht werden.");
      error.statusCode = 409;
      throw error;
    }

    const deletePlan = [
      "anm_offener_fall",
      "anm_zuweisung",
      "anm_schueler_abgleich",
      "anm_anmeldung",
      "anm_schueler_anmeldung",
      "anm_schueler_pool",
      "anm_schueler",
      "anm_kapazitaet",
      "anm_abgleich_protokoll",
      "anm_merkzettel",
      "anm_verfahren_schulgruppe",
      "anm_verfahren_schule",
      "anm_runde",
    ];

    for (const tableName of deletePlan) {
      await deleteRowsByProcedureIfPossible(connection, tableName, verfahrenId);
    }

    const [result] = await connection.query("DELETE FROM anm_verfahren WHERE id = ?", [verfahrenId]);
    if (!result.affectedRows) {
      const error = new Error("Anmeldeverfahren nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function startProcedure(pool, verfahrenId) {
  const connection = await pool.getConnection();
  try {
    const schema = await loadSchemaConfig(connection);
    await connection.beginTransaction();

    const [procedureRows] = await connection.query(
      "SELECT id, status FROM anm_verfahren WHERE id = ? LIMIT 1 FOR UPDATE",
      [verfahrenId],
    );
    if (!Array.isArray(procedureRows) || !procedureRows.length) {
      const error = new Error("Anmeldeverfahren nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }

    const procedure = procedureRows[0];
    if (String(procedure.status || "").trim() === "Beendet") {
      const error = new Error("Beendete Verfahren koennen nicht erneut gestartet werden.");
      error.statusCode = 409;
      throw error;
    }
    if (String(procedure.status || "").trim() === ROUND_STATUS_IN_PROGRESS) {
      const error = new Error("Das Verfahren ist bereits in Bearbeitung.");
      error.statusCode = 409;
      throw error;
    }

    const [roundRows] = await connection.query(
      `SELECT id, runden_nummer, status
       FROM anm_runde
       WHERE verfahren_id = ?
       ORDER BY runden_nummer ASC, id ASC
       FOR UPDATE`,
      [verfahrenId],
    );
    const roundOne = (roundRows || []).find((row) => Number(row.runden_nummer) === 1);
    if (!roundOne) {
      const error = new Error("Runde 1 existiert nicht. Das Verfahren kann nicht gestartet werden.");
      error.statusCode = 409;
      throw error;
    }

    const activeRound = (roundRows || []).find((row) => String(row.status || "").trim() === ROUND_STATUS_IN_PROGRESS);
    if (activeRound && Number(activeRound.id) !== Number(roundOne.id)) {
      const error = new Error("Es existiert bereits eine andere Runde in Bearbeitung.");
      error.statusCode = 409;
      throw error;
    }

    await connection.query(
      "UPDATE anm_verfahren SET status = ?, updated_at = NOW() WHERE id = ?",
      [ROUND_STATUS_IN_PROGRESS, verfahrenId],
    );
    await connection.query(
      "UPDATE anm_runde SET status = ?, updated_at = NOW() WHERE id = ?",
      [ROUND_STATUS_IN_PROGRESS, roundOne.id],
    );
    await setWorkingRound(connection, verfahrenId, Number(roundOne.id), schema);

    await connection.commit();
    return findById(pool, verfahrenId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function finishProcedure(pool, verfahrenId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [procedureRows] = await connection.query(
      "SELECT id, status FROM anm_verfahren WHERE id = ? LIMIT 1 FOR UPDATE",
      [verfahrenId],
    );
    if (!Array.isArray(procedureRows) || !procedureRows.length) {
      const error = new Error("Anmeldeverfahren nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }

    const currentStatus = String(procedureRows[0].status || "").trim();
    if (currentStatus === "Beendet") {
      const error = new Error("Das Verfahren ist bereits beendet.");
      error.statusCode = 409;
      throw error;
    }
    if (currentStatus !== ROUND_STATUS_IN_PROGRESS) {
      const error = new Error("Nur ein Verfahren in Bearbeitung kann beendet werden.");
      error.statusCode = 409;
      throw error;
    }

    await connection.query(
      "UPDATE anm_verfahren SET status = 'Beendet', updated_at = NOW() WHERE id = ?",
      [verfahrenId],
    );
    await connection.query(
      "UPDATE anm_runde SET status = 'Beendet', updated_at = NOW() WHERE verfahren_id = ? AND status = 'In Bearbeitung'",
      [verfahrenId],
    );

    await connection.commit();
    return findById(pool, verfahrenId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  STATUS_VALUES,
  VERFAHRENSTYP_VALUES,
  SCHOOL_GROUP_ROLE_VALUES,
  loadSchemaConfig,
  findWorkingRoundId,
  setWorkingRound,
  clearWorkingRound,
  listAll,
  findById,
  create,
  hasDuplicateSchoolYear,
  update,
  updateVisibility,
  listProcedureSchoolGroups,
  syncProcedureSchoolGroupsByRole,
  countBlockingDependencies,
  removeWithRounds,
  removeProcedureCompletely,
  startProcedure,
  finishProcedure,
};
