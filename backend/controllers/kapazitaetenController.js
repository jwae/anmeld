const KapazitaetenModel = require('../models/kapazitaetenModel');
const crypto = require('crypto');

function normalizeNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeJahrgangKey(value) {
  const text = normalizeText(value);
  if (!text) return '';
  if (/^\d+$/.test(text)) return String(Number(text));
  return text.toLowerCase();
}

function normalizeCapacityPayload(body = {}) {
  return {
    verfahren_id: Number(body.verfahren_id ?? 0),
    snr: normalizeText(body.snr),
    jahrgang: normalizeText(body.jahrgang),
    maximale_klassen: normalizeNumber(body.maximale_klassen, 0),
    maximale_schueler_pro_klasse: normalizeNumber(body.maximale_schueler_pro_klasse, 0),
    gesamtkapazitaet: normalizeNumber(body.gesamtkapazitaet, 0),
    reservierte_plaetze: normalizeNumber(body.reservierte_plaetze, 0),
    bemerkung: normalizeText(body.bemerkung),
  };
}

function validateCapacityPayload(payload) {
  if (!payload.verfahren_id) {
    return 'verfahren_id is required';
  }
  if (!payload.snr) {
    return 'school is required';
  }
  if (!payload.jahrgang) {
    return 'jahrgang is required';
  }
  if (payload.maximale_klassen < 0) {
    return 'maximale_klassen must be >= 0';
  }
  if (payload.maximale_schueler_pro_klasse < 0) {
    return 'maximale_schueler_pro_klasse must be >= 0';
  }
  if (payload.gesamtkapazitaet < 0) {
    return 'gesamtkapazitaet must be >= 0';
  }
  if (payload.reservierte_plaetze < 0) {
    return 'reservierte_plaetze must be >= 0';
  }
  if (payload.reservierte_plaetze > payload.gesamtkapazitaet) {
    return 'reservierte_plaetze must be <= gesamtkapazitaet';
  }

  return null;
}

const capacityImportPreviewSessions = new Map();
const CAPACITY_IMPORT_PREVIEW_TTL_MS = 30 * 60 * 1000;

function cleanupExpiredCapacityImportPreviewSessions() {
  const now = Date.now();
  for (const [token, entry] of capacityImportPreviewSessions.entries()) {
    if (!entry || Number(entry.expires_at || 0) <= now) {
      capacityImportPreviewSessions.delete(token);
    }
  }
}

function createCapacityImportPreviewToken() {
  return crypto.randomBytes(24).toString('hex');
}

function storeCapacityImportPreview(preview) {
  cleanupExpiredCapacityImportPreviewSessions();
  const token = createCapacityImportPreviewToken();
  const expiresAt = Date.now() + CAPACITY_IMPORT_PREVIEW_TTL_MS;
  capacityImportPreviewSessions.set(token, {
    ...preview,
    expires_at: expiresAt,
  });
  return { token, expires_at: expiresAt };
}

function getCapacityImportPreview(token) {
  cleanupExpiredCapacityImportPreviewSessions();
  const normalizedToken = String(token || '').trim();
  const preview = capacityImportPreviewSessions.get(normalizedToken);
  if (!preview) return null;
  if (Number(preview.expires_at || 0) <= Date.now()) {
    capacityImportPreviewSessions.delete(normalizedToken);
    return null;
  }
  return preview;
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ';' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => String(cell || '').trim());
}

function normalizeHeaderName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\u00e4/g, 'ae')
    .replace(/\u00f6/g, 'oe')
    .replace(/\u00fc/g, 'ue')
    .replace(/\u00df/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseCapacityImportCsv(csvText) {
  const normalizedText = String(csvText || '').replace(/^\uFEFF/, '').trim();
  if (!normalizedText) {
    const error = new Error('Die CSV-Datei ist leer.');
    error.statusCode = 400;
    throw error;
  }

  const lines = normalizedText
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .filter(Boolean);

  if (lines.length < 2) {
    const error = new Error('Die CSV-Datei muss eine Kopfzeile und mindestens eine Datenzeile enthalten.');
    error.statusCode = 400;
    throw error;
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeaderName);
  const requiredHeaders = [
    'snr',
    'jahrgang',
    'maximale_klassen',
    'maximale_schueler_pro_klasse',
    'gesamtkapazitaet',
    'reservierte_plaetze',
  ];

  const headerIndexByName = new Map();
  headers.forEach((header, index) => {
    if (!headerIndexByName.has(header)) headerIndexByName.set(header, index);
  });

  const missingHeaders = requiredHeaders.filter((header) => !headerIndexByName.has(header));
  if (missingHeaders.length) {
    const error = new Error(`Die CSV-Datei muss die Spalten ${missingHeaders.join(', ')} enthalten.`);
    error.statusCode = 400;
    throw error;
  }

  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const getValue = (name) => cells[headerIndexByName.get(name)] || '';
    return {
      row_no: index + 2,
      snr: getValue('snr'),
      jahrgang: getValue('jahrgang'),
      maximale_klassen: getValue('maximale_klassen'),
      maximale_schueler_pro_klasse: getValue('maximale_schueler_pro_klasse'),
      gesamtkapazitaet: getValue('gesamtkapazitaet'),
      reservierte_plaetze: getValue('reservierte_plaetze'),
    };
  }).filter((row) => (
    row.snr
    || row.jahrgang
    || row.maximale_klassen
    || row.maximale_schueler_pro_klasse
    || row.gesamtkapazitaet
    || row.reservierte_plaetze
  ));
}

function normalizeImportNumber(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function buildCapacityImportPreviewRows(parsedRows, beteiligteSchulenBySnr, existingCapacitiesByKey) {
  const seenKeys = new Set();
  return parsedRows.map((row) => {
    const snr = normalizeText(row?.snr);
    const jahrgang = normalizeText(row?.jahrgang);
    const schulInfo = beteiligteSchulenBySnr.get(snr) || null;
    const key = `${snr}::${normalizeJahrgangKey(jahrgang)}`;
    const errors = [];

    const maximaleKlassen = normalizeImportNumber(row?.maximale_klassen);
    const maximaleSchuelerProKlasse = normalizeImportNumber(row?.maximale_schueler_pro_klasse);
    const gesamtkapazitaet = normalizeImportNumber(row?.gesamtkapazitaet);
    const reserviertePlaetze = normalizeImportNumber(row?.reservierte_plaetze);

    if (!snr) errors.push('SNR fehlt.');
    if (!jahrgang) errors.push('Jahrgang fehlt.');
    if (!schulInfo && snr) errors.push('Schule ist in diesem Verfahren nicht beteiligt.');
    if (Number.isNaN(maximaleKlassen)) errors.push('maximale_klassen ist ungueltig.');
    if (Number.isNaN(maximaleSchuelerProKlasse)) errors.push('maximale_schueler_pro_klasse ist ungueltig.');
    if (Number.isNaN(gesamtkapazitaet)) errors.push('gesamtkapazitaet ist ungueltig.');
    if (Number.isNaN(reserviertePlaetze)) errors.push('reservierte_plaetze ist ungueltig.');

    if (maximaleKlassen !== null && maximaleKlassen < 0) errors.push('maximale_klassen muss >= 0 sein.');
    if (maximaleSchuelerProKlasse !== null && maximaleSchuelerProKlasse < 0) errors.push('maximale_schueler_pro_klasse muss >= 0 sein.');
    if (gesamtkapazitaet !== null && gesamtkapazitaet < 0) errors.push('gesamtkapazitaet muss >= 0 sein.');
    if (reserviertePlaetze !== null && reserviertePlaetze < 0) errors.push('reservierte_plaetze muss >= 0 sein.');
    if (
      gesamtkapazitaet !== null
      && reserviertePlaetze !== null
      && !Number.isNaN(gesamtkapazitaet)
      && !Number.isNaN(reserviertePlaetze)
      && reserviertePlaetze > gesamtkapazitaet
    ) {
      errors.push('reservierte_plaetze darf nicht groesser als gesamtkapazitaet sein.');
    }

    if (snr && jahrgang) {
      if (seenKeys.has(key)) {
        errors.push('Doppelte Kombination aus SNR und Jahrgang in der CSV-Datei.');
      } else {
        seenKeys.add(key);
      }
    }

    const existing = existingCapacitiesByKey.get(key) || null;
    const normalizedRow = {
      row_no: Number(row?.row_no || 0),
      snr,
      jahrgang,
      maximale_klassen: maximaleKlassen === null || Number.isNaN(maximaleKlassen) ? null : maximaleKlassen,
      maximale_schueler_pro_klasse: maximaleSchuelerProKlasse === null || Number.isNaN(maximaleSchuelerProKlasse) ? null : maximaleSchuelerProKlasse,
      gesamtkapazitaet: gesamtkapazitaet === null || Number.isNaN(gesamtkapazitaet) ? null : gesamtkapazitaet,
      reservierte_plaetze: reserviertePlaetze === null || Number.isNaN(reserviertePlaetze) ? null : reserviertePlaetze,
      schulname: schulInfo?.name || '',
      schulform_name: schulInfo?.schulform_name || '',
      exists: Boolean(existing),
      existing_id: Number(existing?.id || 0) || null,
      selected: errors.length === 0,
      status: 'Fehler',
      errors,
    };

    if (!errors.length) {
      const changed = !existing
        || Number(existing.maximale_klassen || 0) !== Number(normalizedRow.maximale_klassen || 0)
        || Number(existing.maximale_schueler_pro_klasse || 0) !== Number(normalizedRow.maximale_schueler_pro_klasse || 0)
        || Number(existing.gesamtkapazitaet || 0) !== Number(normalizedRow.gesamtkapazitaet || 0)
        || Number(existing.reservierte_plaetze || 0) !== Number(normalizedRow.reservierte_plaetze || 0);
      normalizedRow.status = existing ? (changed ? 'Aenderung' : 'Unveraendert') : 'Neu';
    }

    return normalizedRow;
  });
}

class KapazitaetenController {
  constructor(pool) {
    this.model = new KapazitaetenModel(pool);
  }

  async getKapazitaeten(req, res) {
    try {
      const { verfahren_id, snr, jahrgang, sf_id } = req.query;
      if (!verfahren_id) {
        return res.status(400).json({ error: 'verfahren_id is required' });
      }

      const rows = await this.model.findAll(Number(verfahren_id), {
        snr: snr ? String(snr).trim() : '',
        jahrgang: jahrgang ? String(jahrgang).trim() : '',
        sf_id: sf_id ? Number(sf_id) : null,
      });

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch capacities' });
    }
  }

  async getKapazitaet(req, res) {
    try {
      const row = await this.model.findById(Number(req.params.id));
      if (!row) return res.status(404).json({ error: 'Capacity not found' });
      res.json(row);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch capacity' });
    }
  }

  async createKapazitaet(req, res) {
    try {
      const payload = normalizeCapacityPayload(req.body);
      const validationError = validateCapacityPayload(payload);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const isDuplicate = await this.model.checkDuplicate(payload.verfahren_id, payload.snr, payload.jahrgang);
      if (isDuplicate) {
        return res.status(409).json({ error: 'A capacity already exists for this school and grade' });
      }

      const id = await this.model.create(payload);
      const newRecord = await this.model.findById(id);
      res.status(201).json(newRecord);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create capacity' });
    }
  }

  async updateKapazitaet(req, res) {
    try {
      const payload = normalizeCapacityPayload(req.body);
      const validationError = validateCapacityPayload({
        ...payload,
        verfahren_id: payload.verfahren_id || Number(req.body.verfahren_id || 0),
      });
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const affected = await this.model.update(Number(req.params.id), payload);
      if (affected === 0) return res.status(404).json({ error: 'Capacity not found' });

      const updatedRecord = await this.model.findById(Number(req.params.id));
      res.json(updatedRecord);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update capacity' });
    }
  }

  async deleteKapazitaet(req, res) {
    try {
      const affected = await this.model.delete(Number(req.params.id));
      if (affected === 0) return res.status(404).json({ error: 'Capacity not found' });
      res.json({ success: true, message: 'Capacity deleted' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete capacity' });
    }
  }

  async getVerfahrenSchulen(req, res) {
    try {
      const rows = await this.model.getSchulenByVerfahren(Number(req.params.id), {
        activeOnly: req.query.active === undefined ? null : String(req.query.active).toLowerCase() === 'true',
      });
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch schools for procedure' });
    }
  }

  async previewImport(req, res) {
    try {
      const verfahrenId = Number(req.params.id || 0);
      if (!verfahrenId) return res.status(400).json({ error: 'Ungueltige Verfahrens-ID.' });

      const csvText = String(req.body?.csv_text || '');
      const parsedRows = parseCapacityImportCsv(csvText);
      const beteiligteSchulenBySnr = await this.model.getBeteiligteSchulenLookup(verfahrenId);
      const existingCapacitiesByKey = await this.model.getExistingCapacitiesLookup(
        verfahrenId,
        parsedRows.map((row) => row.snr),
      );
      const previewRows = buildCapacityImportPreviewRows(parsedRows, beteiligteSchulenBySnr, existingCapacitiesByKey);
      const session = storeCapacityImportPreview({
        verfahren_id: verfahrenId,
        rows: previewRows,
      });
      const validRows = previewRows.filter((row) => row.status !== 'Fehler');
      const invalidRows = previewRows.filter((row) => row.status === 'Fehler');

      res.json({
        preview_token: session.token,
        expires_at: new Date(session.expires_at).toISOString(),
        summary: {
          total_rows: previewRows.length,
          valid_rows: validRows.length,
          invalid_rows: invalidRows.length,
          selected_rows: validRows.filter((row) => row.selected).length,
        },
        rows: previewRows,
      });
    } catch (err) {
      console.error(err);
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Die CSV-Vorschau fuer Kapazitaeten ist fehlgeschlagen.' });
    }
  }

  async importCsv(req, res) {
    const connection = await this.model.pool.getConnection();
    try {
      const verfahrenId = Number(req.params.id || 0);
      if (!verfahrenId) return res.status(400).json({ error: 'Ungueltige Verfahrens-ID.' });

      const previewToken = String(req.body?.preview_token || '').trim();
      const preview = getCapacityImportPreview(previewToken);
      if (!preview || Number(preview.verfahren_id || 0) !== verfahrenId) {
        return res.status(409).json({ error: 'Die Vorschau ist abgelaufen oder ungueltig. Bitte die CSV-Datei erneut laden.' });
      }

      const selectedRowNos = Array.isArray(req.body?.selected_row_nos)
        ? req.body.selected_row_nos.map((value) => Number(value || 0)).filter((value) => value > 0)
        : [];
      if (!selectedRowNos.length) {
        return res.status(400).json({ error: 'Bitte mindestens eine gueltige Zeile fuer den Import auswaehlen.' });
      }

      const selectedRowSet = new Set(selectedRowNos);
      const previewRows = Array.isArray(preview.rows) ? preview.rows : [];
      const importRows = previewRows.filter((row) => selectedRowSet.has(Number(row?.row_no || 0)) && row?.status !== 'Fehler');
      if (!importRows.length) {
        return res.status(400).json({ error: 'Es wurden keine gueltigen Vorschau-Zeilen fuer den Import ausgewaehlt.' });
      }

      await connection.beginTransaction();

      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const row of importRows) {
        const existingId = Number(row?.existing_id || 0);

        if (existingId > 0) {
          if (row.status === 'Unveraendert') {
            skippedCount += 1;
            continue;
          }
          await connection.query(
            `
            UPDATE anm_kapazitaet
            SET maximale_klassen = ?, maximale_schueler_pro_klasse = ?, gesamtkapazitaet = ?, reservierte_plaetze = ?, updated_at = NOW()
            WHERE id = ?
            `,
            [
              Number(row.maximale_klassen || 0),
              Number(row.maximale_schueler_pro_klasse || 0),
              Number(row.gesamtkapazitaet || 0),
              Number(row.reservierte_plaetze || 0),
              existingId,
            ],
          );
          updatedCount += 1;
          continue;
        }

        await connection.query(
          `
          INSERT INTO anm_kapazitaet (
            verfahren_id, snr, jahrgang, maximale_klassen, maximale_schueler_pro_klasse, gesamtkapazitaet, reservierte_plaetze, bemerkung, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, '', NOW(), NOW())
          `,
          [
            verfahrenId,
            row.snr,
            row.jahrgang,
            Number(row.maximale_klassen || 0),
            Number(row.maximale_schueler_pro_klasse || 0),
            Number(row.gesamtkapazitaet || 0),
            Number(row.reservierte_plaetze || 0),
          ],
        );
        createdCount += 1;
      }

      await connection.commit();
      capacityImportPreviewSessions.delete(previewToken);

      return res.status(201).json({
        summary: {
          total_rows: previewRows.length,
          created_count: createdCount,
          updated_count: updatedCount,
          imported_count: createdCount + updatedCount,
          skipped_count: skippedCount + previewRows.filter((row) => row.status === 'Fehler').length,
          error_count: previewRows.filter((row) => row.status === 'Fehler').length,
        },
      });
    } catch (err) {
      await connection.rollback().catch(() => {});
      console.error(err);
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Der CSV-Import der Kapazitaeten ist fehlgeschlagen.' });
    } finally {
      connection.release();
    }
  }
}

module.exports = KapazitaetenController;
