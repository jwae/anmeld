const path = require("node:path");
const mysql = require("mysql2/promise");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const createAbgleichController = require("../controllers/abgleichController");
const createKoordinationController = require("../controllers/koordinationController");
const createImporteController = require("../controllers/importeController");
const { buildOffeneAnmeldungenReport } = require("../lib/offeneAnmeldungenReportService");
const { buildPoolSchuelerAktuelleRundeReport } = require("../lib/poolSchuelerAktuelleRundeReportService");
const { buildSchuelerNachHerkunftsschuleReport } = require("../lib/schuelerNachHerkunftsschuleReportService");
const { buildSchuelerRundenuebersichtReport } = require("../lib/schuelerRundenuebersichtService");

const removedStudentColumns = [
  "schueler_id", "schueler_nr", "herkunftsschueler_nr", "runde_id", "anmeldestatus", "teilnahmestatus",
  "schul_nr", "anmeldeschule_snr", "koordinierte_snr", "koordiniert_am", "koordiniert_von", "abgleich_status",
];

function responseCollector(label) {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    assertOk() {
      if (this.statusCode >= 400) throw new Error(`${label}: HTTP ${this.statusCode} ${this.payload?.message || ""}`);
    },
  };
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 2,
  });
  try {
    const [columns] = await pool.query("SHOW COLUMNS FROM anm_schueler");
    const actualColumns = new Set(columns.map((row) => row.Field));
    const unexpected = removedStudentColumns.filter((column) => actualColumns.has(column));
    if (unexpected.length) throw new Error(`Entfernte Spalten noch vorhanden: ${unexpected.join(", ")}`);

    const [indexes] = await pool.query("SHOW INDEX FROM anm_schueler");
    const actualIndexes = new Set(indexes.map((row) => row.Key_name));
    const unexpectedIndexes = ["uq_anm_schueler_verfahren_legacy_id", "idx_schueler_id"]
      .filter((indexName) => actualIndexes.has(indexName));
    if (unexpectedIndexes.length) throw new Error(`Legacy-Indizes noch vorhanden: ${unexpectedIndexes.join(", ")}`);
    if (!actualIndexes.has("idx_anm_schueler_verfahren")) {
      throw new Error("Index idx_anm_schueler_verfahren fehlt.");
    }

    const [contexts] = await pool.query(
      `SELECT v.id AS verfahren_id, r.id AS runde_id
         FROM anm_verfahren v
         JOIN anm_runde r ON r.verfahren_id = v.id
        ORDER BY v.id DESC, r.runden_nummer DESC
        LIMIT 1`,
    );
    const context = contexts[0];
    if (!context) {
      console.log("Phase-3-Schema ist korrekt; keine Verfahren/Runden für Abfrageprüfungen vorhanden.");
      return;
    }

    const params = { verfahren_id: context.verfahren_id, runde_id: context.runde_id };
    const abgleich = createAbgleichController({ getPool: () => pool });
    const koordination = createKoordinationController({ getPool: () => pool });
    const importe = createImporteController({ getPool: () => pool });
    for (const [label, handler] of [
      ["Abgleich", abgleich.schuelerUebersicht],
      ["Koordination", koordination.uebersicht],
      ["Importstatistik", importe.anmeldungenSchulen],
    ]) {
      const response = responseCollector(label);
      await handler({ query: params }, response);
      response.assertOk();
    }

    await buildOffeneAnmeldungenReport(pool, context.verfahren_id, context.runde_id);
    await buildPoolSchuelerAktuelleRundeReport(pool, context.verfahren_id, context.runde_id);
    await buildSchuelerNachHerkunftsschuleReport(pool, context.verfahren_id, context.runde_id);
    await buildSchuelerRundenuebersichtReport(pool, context.verfahren_id);
    console.log(`Phase-3-Prüfung erfolgreich (Verfahren ${context.verfahren_id}, Runde ${context.runde_id}).`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
