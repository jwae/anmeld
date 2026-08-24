const PROTOKOLL_ERGEBNIS = Object.freeze({
  ERFOLG: "ERFOLG",
  FEHLER: "FEHLER",
});

function toNullableText(value, maxLength) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function toNullablePositiveNumber(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function toJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function getClientIp(req) {
  const address = String(req?.socket?.remoteAddress || req?.ip || "").trim();
  return toNullableText(address.replace(/^::ffff:/i, ""), 45);
}

async function writeProtokoll(pool, payload = {}) {
  const ereignisCode = toNullableText(payload.ereignisCode, 50);
  const ergebnis = String(payload.ergebnis || "").trim().toUpperCase();
  if (!ereignisCode) throw new Error("Ereigniscode fuer das Protokoll fehlt.");
  if (!Object.values(PROTOKOLL_ERGEBNIS).includes(ergebnis)) {
    throw new Error("Ungueltiges Protokollergebnis.");
  }

  const [result] = await pool.query(
    `
    INSERT INTO app_protokoll (
      ereignis_id,
      ergebnis,
      benutzer_id,
      benutzername,
      verfahren_id,
      runde_id,
      objekt_typ,
      objekt_id,
      aenderungen,
      details,
      ip_adresse,
      korrelation_id
    )
    SELECT
      e.id,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    FROM anm_kat_ereignisse e
    WHERE e.code = ?
      AND e.aktiv = 1
    `,
    [
      ergebnis,
      toNullablePositiveNumber(payload.benutzerId),
      toNullableText(payload.benutzername, 255),
      toNullablePositiveNumber(payload.verfahrenId),
      toNullablePositiveNumber(payload.rundeId),
      toNullableText(payload.objektTyp, 50),
      toNullableText(payload.objektId, 100),
      toJson(payload.aenderungen),
      toJson(payload.details),
      toNullableText(payload.ipAdresse, 45),
      toNullableText(payload.korrelationId, 36),
      ereignisCode,
    ],
  );

  if (Number(result?.affectedRows || 0) !== 1) {
    throw new Error(`Aktives Protokollereignis nicht gefunden: ${ereignisCode}`);
  }
  return Number(result.insertId || 0);
}

module.exports = {
  PROTOKOLL_ERGEBNIS,
  getClientIp,
  writeProtokoll,
};
