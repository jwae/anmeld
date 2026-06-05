const STATUS_VALUES = ["geplant", "aktiv", "abgeschlossen"];
const VERFAHRENSTYP_VALUES = ["GS", "SEK1"];
const SCHOOL_GROUP_ROLE_VALUES = ["Quellschulen", "Zielschulen"];

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
    verfahrenstyp: String(row.verfahrenstyp || "GS").trim(),
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
      verfahrenstyp,
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
      verfahrenstyp,
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
    `INSERT INTO anm_verfahren (schuljahr, bezeichnung, verfahrenstyp, status)
     VALUES (?, ?, ?, ?)`,
    [payload.schuljahr, payload.bezeichnung, payload.verfahrenstyp, payload.status],
  );
  return findById(pool, result.insertId);
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

async function update(pool, id, payload) {
  const [result] = await pool.query(
    `UPDATE anm_verfahren
     SET schuljahr = ?, bezeichnung = ?, verfahrenstyp = ?, status = ?
     WHERE id = ?`,
    [payload.schuljahr, payload.bezeichnung, payload.verfahrenstyp, payload.status, id],
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
      const missingSchoolGroupIds = normalizedSchoolGroupIds.filter((id) => !existingSchoolGroupIdSet.has(id));
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
  VERFAHRENSTYP_VALUES,
  SCHOOL_GROUP_ROLE_VALUES,
  listAll,
  findById,
  create,
  hasDuplicateSchoolYear,
  update,
  listProcedureSchoolGroups,
  syncProcedureSchoolGroupsByRole,
  countBlockingDependencies,
  removeWithRounds,
};
