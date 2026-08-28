const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveStudent,
  updateStudentMaster,
  updateStudentOrigin,
  upsertRoundState,
  normalizeExternalIdentity,
  normalizeGermanMatchText,
  pickNonEmptyAddressFields,
} = require("../lib/schuelerIdentityService");

class IdentityDatabase {
  constructor() {
    this.students = [];
    this.externalIds = [];
    this.rounds = [];
    this.nextStudentId = 1;
    this.nextExternalId = 1;
    this.nextRoundId = 1;
  }

  async query(sql, params = []) {
    const compact = sql.replace(/\s+/g, " ").trim();
    if (compact.startsWith("SELECT s.* FROM anm_schueler_externe_id")) {
      const [art, snr, externalId] = params;
      const match = this.externalIds.find((row) => (
        row.herkunft_art === art
        && (row.herkunft_snr || "") === (snr || "")
        && row.externe_id === externalId
      ));
      return [[this.students.find((row) => row.id === match?.schueler_id)].filter(Boolean), []];
    }
    if (compact.startsWith("SELECT * FROM anm_schueler WHERE verfahren_id")) {
      if (!compact.includes("LOWER(TRIM")) {
        const [verfahrenId, geburtsdatum] = params;
        return [this.students.filter((row) => (
          row.verfahren_id === verfahrenId
          && row.geburtsdatum === geburtsdatum
        )), []];
      }
      const [verfahrenId, vorname, nachname, geburtsdatum] = params;
      return [this.students.filter((row) => (
        row.verfahren_id === verfahrenId
        && String(row.vorname || "").trim().toLowerCase() === String(vorname).trim().toLowerCase()
        && String(row.nachname || "").trim().toLowerCase() === String(nachname).trim().toLowerCase()
        && row.geburtsdatum === geburtsdatum
      )), []];
    }
    if (compact.startsWith("INSERT INTO anm_schueler (")) {
      const columns = compact.match(/INSERT INTO anm_schueler \(([^)]+)\)/)[1].split(", ");
      const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
      row.id = this.nextStudentId++;
      this.students.push(row);
      return [{ insertId: row.id }, []];
    }
    if (compact.startsWith("INSERT INTO anm_schueler_externe_id")) {
      const [studentId, art, snr, externalId] = params;
      if (this.externalIds.some((row) => row.herkunft_art === art && (row.herkunft_snr || "") === (snr || "") && row.externe_id === externalId)) {
        const error = new Error("duplicate");
        error.code = "ER_DUP_ENTRY";
        throw error;
      }
      const row = { id: this.nextExternalId++, schueler_id: studentId, herkunft_art: art, herkunft_snr: snr, externe_id: externalId };
      this.externalIds.push(row);
      return [{ insertId: row.id }, []];
    }
    if (compact.startsWith("SELECT * FROM anm_schueler_runde")) {
      const [verfahrenId, studentId, roundId] = params;
      return [[this.rounds.find((row) => row.verfahren_id === verfahrenId && row.schueler_id === studentId && row.runde_id === roundId)].filter(Boolean), []];
    }
    if (compact.startsWith("INSERT INTO anm_schueler_runde")) {
      const columns = compact.match(/INSERT INTO anm_schueler_runde \(([^)]+)\)/)[1].split(", ");
      const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
      row.id = this.nextRoundId++;
      this.rounds.push(row);
      return [{ insertId: row.id }, []];
    }
    if (compact.startsWith("UPDATE anm_schueler_runde SET")) {
      const row = this.rounds.find((entry) => entry.id === params.at(-1));
      const assignments = compact.match(/SET (.+), updated_at = NOW\(\) WHERE/)[1].split(", ");
      assignments.forEach((assignment, index) => { row[assignment.split(" = ")[0]] = params[index]; });
      return [{ affectedRows: 1 }, []];
    }
    if (compact.startsWith("UPDATE anm_schueler SET")) {
      const row = this.students.find((entry) => entry.id === params.at(-1));
      const assignments = compact.match(/SET (.+), updated_at = NOW\(\) WHERE/)[1].split(", ");
      assignments.forEach((assignment, index) => { row[assignment.split(" = ")[0]] = params[index]; });
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`Nicht unterstuetztes Test-SQL: ${compact}`);
  }
}

function poolStudent(externalId = "POOL-847291") {
  return {
    verfahren_id: 7,
    herkunft: "Pool",
    vorname: "Anna",
    nachname: "Müller",
    geburtsdatum: "2020-05-17",
    external_identity: externalId ? { herkunft_art: "POOL", herkunft_snr: null, externe_id: externalId } : null,
  };
}

test("Fälle 1-5: externe IDs identifizieren genau ein Kind und erlauben schulbezogene lokale IDs", async () => {
  const db = new IdentityDatabase();
  const first = await resolveStudent(db, poolStudent());
  await upsertRoundState(db, { verfahren_id: 7, schueler_id: first.student.id, runde_id: 1, abgleich_status: "Nur Pool" });
  assert.equal(first.created, true);
  assert.equal(db.students.length, 1);
  assert.equal(db.externalIds.length, 1);
  assert.equal(db.rounds.length, 1);

  const knownPool = await resolveStudent(db, poolStudent());
  assert.equal(knownPool.matchedBy, "EXTERNAL_ID");
  assert.equal(db.students.length, 1);

  const school = await resolveStudent(db, {
    ...poolStudent(null),
    herkunft: "Anmeldung",
    external_identity: { herkunft_art: "SCHULE", herkunft_snr: "100223", externe_id: "4711" },
  });
  assert.equal(school.matchedBy, "PERSON_DATA");
  assert.equal(db.students.length, 1);
  assert.equal(db.externalIds.length, 2);

  const knownSchool = await resolveStudent(db, {
    ...poolStudent(null),
    external_identity: { herkunft_art: "SCHULE", herkunft_snr: "100223", externe_id: "4711" },
  });
  assert.equal(knownSchool.matchedBy, "EXTERNAL_ID");

  const otherSchool = await resolveStudent(db, {
    verfahren_id: 7, herkunft: "Anmeldung", vorname: "Berta", nachname: "Beispiel", geburtsdatum: "2020-01-02",
    external_identity: { herkunft_art: "SCHULE", herkunft_snr: "102921", externe_id: "4711" },
  });
  assert.notEqual(otherSchool.student.id, first.student.id);
  assert.equal(db.externalIds.filter((row) => row.externe_id === "4711").length, 2);
});

test("Fall 6: Import ohne externe ID erzeugt keine Ersatz-ID und trifft später über Personendaten", async () => {
  const db = new IdentityDatabase();
  const first = await resolveStudent(db, poolStudent(null));
  const second = await resolveStudent(db, poolStudent(null));
  assert.equal(first.created, true);
  assert.equal(second.matchedBy, "PERSON_DATA");
  assert.equal(first.student.id, second.student.id);
  assert.equal(db.externalIds.length, 0);
});

test("Fall 7: mehrdeutige Personendaten werden als Konflikt abgelehnt", async () => {
  const db = new IdentityDatabase();
  db.students.push(
    { id: 1, verfahren_id: 7, vorname: "Anna", nachname: "Müller", geburtsdatum: "2020-05-17", herkunft: "Pool" },
    { id: 2, verfahren_id: 7, vorname: " anna ", nachname: "MÜLLER", geburtsdatum: "2020-05-17", herkunft: "Manuell" },
  );
  await assert.rejects(() => resolveStudent(db, poolStudent(null)), (error) => error.code === "AMBIGUOUS_STUDENT_MATCH");
  assert.equal(db.students.length, 2);
});

test("Fall 8: mehrere Runden verwenden dieselbe interne Schüler-ID", async () => {
  const db = new IdentityDatabase();
  const resolved = await resolveStudent(db, poolStudent());
  await upsertRoundState(db, { verfahren_id: 7, schueler_id: resolved.student.id, runde_id: 1 });
  await upsertRoundState(db, { verfahren_id: 7, schueler_id: resolved.student.id, runde_id: 2 });
  assert.equal(db.students.length, 1);
  assert.deepEqual(db.rounds.map((row) => row.schueler_id), [resolved.student.id, resolved.student.id]);
});

test("Ein allgemeines Stammdatenupdate verändert die Herkunft nicht implizit", async () => {
  const db = new IdentityDatabase();
  const resolved = await resolveStudent(db, poolStudent());
  await updateStudentMaster(db, resolved.student.id, { vorname: "Anni", herkunft: "Anmeldung" });
  assert.equal(db.students[0].herkunft, "Pool");
  assert.equal(db.students[0].vorname, "Anni");
});

test("Ein Pool-Import kann die Herkunft eines vorhandenen Kindes auf Pool aktualisieren", async () => {
  const db = new IdentityDatabase();
  db.students.push({
    id: 1,
    verfahren_id: 7,
    vorname: "Anna",
    nachname: "Beispiel",
    geburtsdatum: "2020-05-17",
    herkunft: "Anmeldung",
  });

  await updateStudentOrigin(db, 1, "Pool");

  assert.equal(db.students[0].herkunft, "Pool");
});

test("Umlaut-Matching erkennt deutsche Umschreibungen als vorhandene Person", async () => {
  const db = new IdentityDatabase();
  db.students.push({
    id: 1,
    verfahren_id: 7,
    vorname: "Jörg",
    nachname: "Müller-Straße",
    geburtsdatum: "2020-05-17",
    herkunft: "Pool",
  });

  const resolved = await resolveStudent(db, {
    verfahren_id: 7,
    herkunft: "Anmeldung",
    vorname: "Joerg",
    nachname: "Mueller-Strasse",
    geburtsdatum: "2020-05-17",
  });

  assert.equal(resolved.created, false);
  assert.equal(resolved.student.id, 1);
  assert.equal(resolved.matchedBy, "UMLAUT_PERSON_DATA");
  assert.equal(db.students.length, 1);
  assert.equal(normalizeGermanMatchText("Änne Öztürk Weiß"), "aenne oeztuerk weiss");
});

test("Leere Adresswerte werden für Treffer nicht als Update übernommen", () => {
  assert.deepEqual(pickNonEmptyAddressFields({ strasse: "", plz: "  ", ort: null }), {});
  assert.deepEqual(
    pickNonEmptyAddressFields({ strasse: " Hauptstraße 1 ", plz: "12345", ort: "Berlin" }),
    { strasse: "Hauptstraße 1", plz: "12345", ort: "Berlin" },
  );
});

test("Quellenregeln normalisieren zentrale IDs und verlangen Schul-/Kita-Kennungen", () => {
  assert.deepEqual(normalizeExternalIdentity({ herkunft_art: "ewo", herkunft_snr: "ignorieren", externe_id: " E-7 " }), {
    herkunft_art: "EWO", herkunft_snr: null, externe_id: "E-7",
  });
  assert.throws(
    () => normalizeExternalIdentity({ herkunft_art: "SCHULE", externe_id: "4711" }),
    (error) => error.code === "INVALID_EXTERNAL_IDENTITY" && error.statusCode === 400,
  );
  assert.throws(
    () => normalizeExternalIdentity({ herkunft_art: "UNBEKANNT", externe_id: "4711" }),
    (error) => error.code === "INVALID_EXTERNAL_IDENTITY",
  );
});
