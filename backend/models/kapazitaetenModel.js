class KapazitaetenModel {
  constructor(pool) {
    this.pool = pool;
  }

  normalizeJahrgangKey(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^\d+$/.test(text)) return String(Number(text));
    return text.toLowerCase();
  }

  async getBeteiligteSchulenLookup(verfahren_id) {
    const [rows] = await this.pool.query(
      `
      SELECT
        s.snr,
        s.name,
        s.sf_id,
        s.is_active,
        sf.name AS schulform_name
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
      `,
      [verfahren_id],
    );

    const lookup = new Map();
    for (const row of rows || []) {
      const snr = String(row?.snr || '').trim();
      if (!snr) continue;
      lookup.set(snr, {
        snr,
        name: String(row?.name || '').trim(),
        sf_id: String(row?.sf_id || '').trim(),
        is_active: Number(row?.is_active || 0) === 1,
        schulform_name: String(row?.schulform_name || '').trim(),
      });
    }
    return lookup;
  }

  async findAll(verfahren_id, filters = {}) {
    let sql = `
      SELECT
        k.id,
        k.verfahren_id,
        k.snr,
        k.jahrgang,
        k.maximale_klassen,
        k.maximale_schueler_pro_klasse,
        k.gesamtkapazitaet,
        k.reservierte_plaetze,
        k.bemerkung,
        k.created_at,
        k.updated_at,
        s.name AS schulname,
        s.is_active,
        sf.name AS schulform_name
      FROM anm_kapazitaet k
      JOIN anm_schulen s ON k.snr = s.snr
      LEFT JOIN anm_kat_sf sf ON s.sf_id = sf.sf_id
      WHERE k.verfahren_id = ?
    `;
    const params = [verfahren_id];

    if (filters.snr) {
      sql += ' AND k.snr = ?';
      params.push(filters.snr);
    }
    if (filters.jahrgang) {
      sql += ' AND k.jahrgang = ?';
      params.push(filters.jahrgang);
    }
    if (filters.sf_id) {
      sql += ' AND s.sf_id = ?';
      params.push(filters.sf_id);
    }

    sql += ' ORDER BY s.name, k.jahrgang';

    const [rows] = await this.pool.query(sql, params);
    return rows;
  }

  async findById(id) {
    const sql = `SELECT * FROM anm_kapazitaet WHERE id = ?`;
    const [rows] = await this.pool.query(sql, [id]);
    return rows[0] || null;
  }

  async create(data) {
    const sql = `
      INSERT INTO anm_kapazitaet
      (verfahren_id, snr, jahrgang, maximale_klassen, maximale_schueler_pro_klasse, gesamtkapazitaet, reservierte_plaetze, bemerkung, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    const params = [
      data.verfahren_id,
      data.snr,
      data.jahrgang,
      data.maximale_klassen || 0,
      data.maximale_schueler_pro_klasse || 0,
      data.gesamtkapazitaet || 0,
      data.reservierte_plaetze || 0,
      data.bemerkung || '',
    ];
    const [result] = await this.pool.query(sql, params);
    return result.insertId;
  }

  async update(id, data) {
    const sql = `
      UPDATE anm_kapazitaet
      SET
        maximale_klassen = ?,
        maximale_schueler_pro_klasse = ?,
        gesamtkapazitaet = ?,
        reservierte_plaetze = ?,
        bemerkung = ?,
        updated_at = NOW()
      WHERE id = ?
    `;
    const params = [
      data.maximale_klassen || 0,
      data.maximale_schueler_pro_klasse || 0,
      data.gesamtkapazitaet || 0,
      data.reservierte_plaetze || 0,
      data.bemerkung || '',
      id,
    ];
    const [result] = await this.pool.query(sql, params);
    return result.affectedRows;
  }

  async delete(id) {
    const sql = `DELETE FROM anm_kapazitaet WHERE id = ?`;
    const [result] = await this.pool.query(sql, [id]);
    return result.affectedRows;
  }

  async checkDuplicate(verfahren_id, snr, jahrgang, exclude_id = null) {
    let sql = `SELECT id FROM anm_kapazitaet WHERE verfahren_id = ? AND snr = ? AND jahrgang = ?`;
    const params = [verfahren_id, snr, jahrgang];
    if (exclude_id) {
      sql += ' AND id != ?';
      params.push(exclude_id);
    }

    const [rows] = await this.pool.query(sql, params);
    return rows.length > 0;
  }

  async getExistingCapacitiesLookup(verfahren_id, snrList = []) {
    const normalizedSnrs = [...new Set((snrList || []).map((value) => String(value || '').trim()).filter(Boolean))];
    if (!normalizedSnrs.length) return new Map();

    const placeholders = normalizedSnrs.map(() => '?').join(', ');
    const [rows] = await this.pool.query(
      `
      SELECT id, verfahren_id, snr, jahrgang, maximale_klassen, maximale_schueler_pro_klasse, gesamtkapazitaet, reservierte_plaetze, bemerkung
      FROM anm_kapazitaet
      WHERE verfahren_id = ?
        AND snr IN (${placeholders})
      `,
      [verfahren_id, ...normalizedSnrs],
    );

    const lookup = new Map();
    for (const row of rows || []) {
      const snr = String(row?.snr || '').trim();
      const jahrgang = String(row?.jahrgang || '').trim();
      const key = `${snr}::${this.normalizeJahrgangKey(jahrgang)}`;
      if (!key) continue;
      lookup.set(key, {
        id: Number(row?.id || 0),
        verfahren_id: Number(row?.verfahren_id || 0),
        snr,
        jahrgang,
        maximale_klassen: Number(row?.maximale_klassen || 0),
        maximale_schueler_pro_klasse: Number(row?.maximale_schueler_pro_klasse || 0),
        gesamtkapazitaet: Number(row?.gesamtkapazitaet || 0),
        reservierte_plaetze: Number(row?.reservierte_plaetze || 0),
        bemerkung: String(row?.bemerkung || '').trim(),
      });
    }
    return lookup;
  }

  async getSchulenByVerfahren(verfahren_id, options = {}) {
    const params = [verfahren_id];
    let sql = `
      SELECT
        s.snr,
        s.name,
        s.sf_id,
        s.is_active,
        sf.name AS schulform_name
      FROM anm_schulen s
      INNER JOIN (
        SELECT DISTINCT sgs.snr
        FROM anm_verfahren_schulgruppe vsg
        JOIN anm_schulgruppe_schule sgs
          ON sgs.schulgruppe_id = vsg.schulgruppe_id
        WHERE vsg.verfahren_id = ?
          AND vsg.rolle = 'Zielschulen'
      ) vzs
        ON vzs.snr = s.snr
      LEFT JOIN anm_kat_sf sf
        ON sf.code = s.sf_id
      WHERE 1 = 1
    `;

    if (options.activeOnly === true) {
      sql += ' AND s.is_active = 1';
    } else if (options.activeOnly === false) {
      sql += ' AND s.is_active = 0';
    }

    sql += ' ORDER BY s.name';

    const [rows] = await this.pool.query(sql, params);
    return rows;
  }
}

module.exports = KapazitaetenModel;
