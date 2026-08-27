const path = require("node:path");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const {
  resolveStudent,
  updateStudentMaster,
  upsertRoundState,
} = require("../lib/schuelerIdentityService");

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  let transactionStarted = false;
  try {
    const [contexts] = await connection.query(
      `SELECT v.id AS verfahren_id, r.id AS runde_id
         FROM anm_verfahren v
         JOIN anm_runde r ON r.verfahren_id = v.id
        ORDER BY v.id DESC, r.runden_nummer DESC
        LIMIT 1`,
    );
    const context = contexts[0];
    if (!context) throw new Error("Fuer den Integrationstest fehlt ein Verfahren mit Runde.");

    await connection.beginTransaction();
    transactionStarted = true;
    const testIdentity = `PHASE3A-${Date.now()}`;
    const person = {
      verfahren_id: Number(context.verfahren_id),
      herkunft: "Pool",
      vorname: "Phase",
      nachname: "Dreia-Test",
      geburtsdatum: "2020-01-02",
      external_identity: { herkunft_art: "EWO", herkunft_snr: null, externe_id: testIdentity },
    };

    const first = await resolveStudent(connection, person);
    assert.equal(first.created, true);
    await upsertRoundState(connection, {
      verfahren_id: context.verfahren_id,
      schueler_id: first.student.id,
      runde_id: context.runde_id,
      anmeldestatus: "Ohne",
      teilnahmestatus: "Aktiv",
      abgleich_status: "Nur Pool",
    });

    const second = await resolveStudent(connection, person);
    assert.equal(second.student.id, first.student.id);
    assert.equal(second.matchedBy, "EXTERNAL_ID");
    await updateStudentMaster(connection, first.student.id, { vorname: "Phase geaendert", herkunft: "Anmeldung" });

    const [rows] = await connection.query(
      `SELECT s.herkunft,
              (SELECT COUNT(*) FROM anm_schueler_externe_id x WHERE x.schueler_id = s.id) AS externe_ids,
              (SELECT COUNT(*) FROM anm_schueler_runde sr WHERE sr.schueler_id = s.id AND sr.runde_id = ?) AS runden
         FROM anm_schueler s
        WHERE s.id = ?`,
      [context.runde_id, first.student.id],
    );
    assert.equal(rows[0].herkunft, "Pool");
    assert.equal(Number(rows[0].externe_ids), 1);
    assert.equal(Number(rows[0].runden), 1);

    await connection.rollback();
    transactionStarted = false;
    console.log(`Phase-3a-Integrationstest erfolgreich (Verfahren ${context.verfahren_id}, Runde ${context.runde_id}); Testdaten zurueckgerollt.`);
  } finally {
    if (transactionStarted) await connection.rollback().catch(() => {});
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
