# Phase 3e – Kontrollbericht vor Phase 4

> Historischer Stand vor der Bereinigung. Phase 4 wurde am 27. August 2026
> abgeschlossen; der aktuelle Stand ist in `PHASE_4_LEGACY_RESTE.md`
> dokumentiert.

Stand: 27. August 2026

## Gesamtbewertung

Die produktive Fachlogik arbeitet mit dem neuen Modell:

- `anm_schueler.id` ist die interne, rundenunabhängige Schüler-ID.
- `anm_schueler_runde.schueler_id` und
  `anm_schueler_externe_id.schueler_id` sind Fremdschlüssel auf diese interne ID.
- Rundenbezogene Werte werden produktiv aus `anm_schueler_runde` gelesen und
  dort geschrieben.
- Die zentralen Importpfade legen Schüler über
  `backend/lib/schuelerIdentityService.js` an bzw. lösen sie dort auf.
- Beim Rundenstart werden nur neue Zeilen in `anm_schueler_runde` erzeugt. Die
  bestehende `anm_schueler.id` bleibt über alle Runden erhalten.

Phase 4 ist trotzdem erforderlich: Es existieren noch ein lesender Fallback auf
`anm_schueler.schueler_id`, parallele Legacy-Importtabellen, unbenutzter alter
Importcode sowie mehrere mehrdeutige Kompatibilitätsnamen in API-Daten.

## 1. Verbleibende Nutzung von `anm_schueler.schueler_id`

Die vollständige produktive Nutzung besteht aus zwei SQL-Ausdrücken in genau
einer Funktion:

| Datei / Funktion | Stelle | Zweck | Einordnung |
| --- | --- | --- | --- |
| `backend/controllers/importeController.js` / `findExistingSchuelerRecord` | Auswahl: `COALESCE(x.externe_id, s.schueler_id)` | Anzeige eines bereits gefundenen Datensatzes in Importvorschau und Fehlerbehandlung | Kompatibilitätscode; in Phase 4 entfernbar |
| dieselbe Funktion | Filter: `x.id IS NOT NULL OR s.schueler_id = ?` | Fallback, wenn eine externe Schul-ID noch nicht in `anm_schueler_externe_id` vorliegt | Noch technisch für Altdaten nützlich; nach Datenprüfung in Phase 4 entfernbar |

Produktive Aufrufer sind:

- `buildAnmeldungPreviewRowFromData`: Statusanzeige in der Vorschau des
  Anmeldungsimports.
- `anmSchuelerAnmeldungenExecute`: Zuordnung fehlerhafter Importzeilen zu einem
  vorhandenen Schüler, damit ein offener Fall angelegt werden kann.

Das Feld wird nicht mehr beschrieben. Abgleich, Koordination und Reportdienste
verwenden es nicht mehr. Die alten Funktionen `upsertAnmSchuelerCsvImport` und
`upsertAnmeldungenWizardImport` enthalten zusätzliche Zugriffe, sind aber von
keinem Handler erreichbar und daher kein produktiver Pfad.

## 2. Verbleibende Nutzung von `schueler_nr`

Es gibt keine produktive Nutzung einer DB-Spalte `anm_schueler.schueler_nr`.
Migration `026_finalize_round_independent_student_schema.sql` entfernt diese
Spalte bereits.

Verbleibende Treffer sind:

- Import- und DTO-Aliase für eine externe Schüler-ID, insbesondere beim
  CSV-Mapping (`schueler_id`, `schueler_nr`, `id`, `import_id`).
- SQL-Aliase wie `x.externe_id AS schueler_nr` zur Bedienung bestehender
  Importstrukturen.
- Alter, nicht aufgerufener Code in `upsertAnmSchuelerCsvImport` und
  `upsertAnmeldungenWizardImport`.

Ersatzlogik: Externe IDs ausschließlich über
`anm_schueler_externe_id(herkunft_art, herkunft_snr, externe_id)` auflösen und
nach außen `externe_schueler_id` nennen.

## 3. Verbleibende Nutzung von `herkunftsschueler_nr`

Es gibt keine produktive Nutzung einer DB-Spalte
`anm_schueler.herkunftsschueler_nr`. Migration 026 entfernt diese Spalte.

Produktiv verbleibt der Name nur als Kompatibilitätsfeld:

- `frontend/src/components/PoolImport.vue`: Eingabe-/Antwortalias, der auf
  `externe_schueler_id` abgebildet wird.
- `backend/controllers/importeController.js`: Ausgabealias aus
  `anm_schueler_externe_id.externe_id`.

Zusätzliche Treffer liegen nur in den beiden nicht aufgerufenen alten
Upsert-Funktionen. Der Alias kann in Phase 4 nach Umstellung der letzten
Payloads entfernt werden.

## 4. Alte Zugriffe auf rundenbezogene Felder

Die projektweite Suche nach direkten Zugriffen wie
`anm_schueler.runde_id`, `s.anmeldestatus`, `s.teilnahmestatus`, `s.schul_nr`,
`s.koordinierte_snr`, `s.koordiniert_am`, `s.koordiniert_von` und
`s.abgleich_status` ergab keinen produktiven Treffer.

- Im Abgleich stammen `schul_nr`, `anmeldestatus`, `teilnahmestatus` und
  `abgleich_status` aus `anm_schueler_runde`.
- Die Koordination liest alle genannten Rundendaten aus
  `anm_schueler_runde`. Zuweisungen schreiben
  `koordinierte_snr`, `koordiniert_am`, `koordiniert_von` und Statuswerte in
  dieselbe Tabelle.
- Updates an `anm_schueler` in Abgleich und Koordination betreffen ausschließlich
  rundenunabhängige Geocodierungs- bzw. Stammdaten.
- Reportdienste verbinden `anm_schueler` mit `anm_schueler_runde` und filtern
  explizit nach Verfahren und Runde.

## 5. Mehrdeutige API- und Frontend-Namen

Die produktiven Frontend-Aktionen verwenden bereits die eindeutigen Namen
`interne_schueler_id` bzw. `interne_schueler_ids`. Die folgenden Aliase bleiben
für Antwort-/Payload-Kompatibilität mehrdeutig:

| Bereich | Name | Tatsächliche Bedeutung |
| --- | --- | --- |
| Abgleich-API | `schueler_id` | interne `anm_schueler.id`; Alias neben `interne_schueler_id` |
| Abgleich-API | `schueler_schul_id` | externe ID; Alias neben `externe_schueler_id` |
| Koordinations-API | `row_id` | interne `anm_schueler.id` |
| Koordinations-API | `schueler_id` | externe ID in Antwortdaten |
| Pool-API | `schueler_id` | interne `anm_schueler.id` |
| Pool-API | `herkunftsschueler_nr`, `schueler_schul_id` | externe ID |
| Offene-Fälle-API | `schueler_row_id` | interne `anm_schueler.id` |
| Offene-Fälle-API | `schueler_ident` | Anzeige-ID mit Legacy-Fallback |
| Report-API/Export | `schueler_id` | eindeutige externe ID, sonst interne ID als Text |
| CSV-Importe | `schueler_id` | externe Quell-ID, ausdrücklich so in der Importhilfe beschrieben |

`frontend/src/services/auswertungenService.ts` führt `schueler_id` noch als
Kompatibilitätsfeld. In `PoolImport.vue` bezeichnet `editPoolForm.schueler_id`
eine externe Import-ID. Diese Namen sind Phase-4-Kandidaten; operative
Schüleraktionen hängen nicht mehr davon ab.

## 6. Noch vorhandene Legacy-Fallbacks

### Datenbank

- Nullable Spalte `anm_schueler.schueler_id`.
- Unique Key `uq_anm_schueler_verfahren_legacy_id` auf
  `(verfahren_id, schueler_id)`.
- Parallele Tabellen und Referenzen:
  `anm_schueler_pool`, `anm_schueler_anmeldung`, `anm_anmeldung`,
  `anm_schueler_abgleich`, `anm_offener_fall.schueler_pool_id` und
  `anm_offener_fall.schueler_anmeldung_id`.

### Backend und Import

- `findExistingSchuelerRecord` fällt lesend auf
  `anm_schueler.schueler_id` zurück.
- `importAnmeldungenForSchool` führt zuerst das zentrale Upsert aus, pflegt bei
  vorhandener externer ID danach aber zusätzlich `anm_schueler_anmeldung`,
  `anm_anmeldung` und offene Fälle über `schueler_pool_id`.
- `findExistingStudentByCsvId` löst dafür einen Datensatz in
  `anm_schueler_pool` auf und akzeptiert als letzten Fallback dessen numerische
  interne Tabellen-ID.
- `clearSchuelerDaten` berücksichtigt absichtlich noch alle parallelen Tabellen.
- Abgleich und offene Fälle können bestehende Legacy-Referenzen weiterhin lesen.

### API und Frontend

- Die in Abschnitt 5 aufgeführten Aliase bleiben zur Kompatibilität erhalten.

## 7. Abweichende Matching- und Importpfade

### Zentral angebunden

- Pool-/GS-Pool-CSV und EWO-CSV: `upsertAnmSchuelerCsvImportV3` bzw.
  `upsertStudent` → `resolveStudent` → `upsertRoundState`.
- Allgemeiner `anm_schueler`-Import: V3-Upsert mit zentraler Identität.
- Anmeldungs-CSV und Schild3-Anmeldungen:
  `upsertSchuelerForAnmeldungImport` → `resolveStudent` →
  `updateStudentMaster` → `upsertRoundState`.
- Schild-Jahrgang-4-Poolimport: `upsertStudent` mit Quelle `SCHILD`.
- Rückmeldungen MG: zentrale Personensuche; Änderungen über
  `updateStudentMaster` und `upsertRoundState`.

EWO besitzt keinen eigenen Backend-Handler; es ist eine Quellenart des
Pool-CSV-Pfads. Ein produktiver Schüler-Online-Importpfad ist im Projekt nicht
vorhanden. Der Katalogwert `SCHUELER_ONLINE` ist vorbereitet, wird aber derzeit
nicht von einem Handler verwendet.

### Abweichend bzw. entfernbar

- Der aktive Schul-/Anmeldungsimport pflegt nach dem zentralen Upsert noch den
  parallelen Legacy-Zuordnungspfad aus Abschnitt 6. Dieser konkurriert nicht bei
  der Anlage der zentralen Identität, muss vor Entfernung der Legacy-Tabellen
  aber auf direkte `anm_schueler.id`-Referenzen umgestellt werden.
- `matchStudent` implementiert eine alte Namens-/Geburtsdatum-/Adresssuche in
  `anm_schueler_pool`. Es wird nur von
  `resolvePoolStudentIdForSchoolChange` aufgerufen; diese Funktion selbst hat
  keinen produktiven Aufrufer. Beide sind in Phase 4 sicher entfernbar.
- `upsertAnmSchuelerCsvImport` und `upsertAnmeldungenWizardImport` sind
  unbenutzte alte Upsert-Pfade und referenzieren bereits entfernte Spalten. Sie
  dürfen nicht wieder aktiviert werden und können in Phase 4 entfallen.

## 8. Rundenlogik, Koordination, Auswertungen und offene Fälle

### Rundenlogik

`backend/models/anmelderundenModel.js::startRound` erzeugt innerhalb seiner
Transaktion ausschließlich fehlende `anm_schueler_runde`-Zeilen für bereits
vorhandene interne Schüler-IDs. Es existiert dort kein Insert in
`anm_schueler`. Die Eindeutigkeit je Verfahren, Schüler und Runde ist durch
`uq_anm_schueler_runde` auf
`(verfahren_id, schueler_id, runde_id)` abgesichert.

### Koordination

Alle fachlichen Rundendaten stammen aus `anm_schueler_runde`. Der unbenutzte
Helper `buildAssignedSchoolExpr` ist in Abgleich und Koordination noch vorhanden
und enthält Kompatibilitätszweige für alte Spalten; beide Definitionen können in
Phase 4 entfernt werden.

### Auswertungen und Exporte

Die Dienste

- `schuelerRundenuebersichtService`,
- `offeneAnmeldungenReportService`,
- `poolSchuelerAktuelleRundeReportService` und
- `schuelerNachHerkunftsschuleReportService`

verwenden `anm_schueler_runde` mit explizitem Verfahrens-/Rundenfilter. Die
Exporte werden aus diesen Ergebnissen aufgebaut. Es gibt keine Zusammenführung
mehr über mehrere `anm_schueler`-Zeilen desselben Kindes.

### `anm_offener_fall`

Migration `013_allow_offener_fall_for_anm_schueler.sql` definiert
`anm_offener_fall.schueler_id` als Fremdschlüssel auf `anm_schueler.id`.
Backend-Abfragen und Schreibzugriffe behandeln das Feld als numerische interne
ID. Es wurde kein Kommentar und kein produktiver Code gefunden, der es als
externe Schüler-ID interpretiert. Die parallelen Felder `schueler_pool_id` und
`schueler_anmeldung_id` bleiben dagegen Legacy-Referenzen.

## 9. Build-, Lint- und Testergebnis

Ausgeführt am 27. August 2026:

| Prüfung | Ergebnis |
| --- | --- |
| Backend-Syntax (`node --check`) | erfolgreich für 41 JavaScriptdateien |
| Backend-Tests (`npm test`) | 24 von 24 Tests erfolgreich |
| Phase-3-Schemaprüfer | erfolgreich; Schema korrekt |
| Phase-3a-Integrationsprüfer | nicht ausführbar: In der leeren Datenbank fehlt ein Verfahren mit Runde |
| Frontend-Typecheck | erfolgreich |
| Frontend-Produktionsbuild | erfolgreich |
| Lint | nicht vorhanden; weder Backend noch Frontend definiert ein Lint-Skript |

Der Phase-3-Schemaprüfer konnte mangels Verfahren/Runden ebenfalls keine
datenabhängigen Abfragen ausführen, hat aber die Struktur vollständig bestätigt.
Der Frontend-Build meldet nur eine Vite-Warnung für ein JavaScript-Chunk über
500 kB; dies ist kein Fehler der Schemaumstellung.

## 10. In Phase 4 sicher entfernbar

In sinnvoller Reihenfolge:

1. **Dokumentation:** Alte Aussagen korrigieren, nach denen Abgleich,
   Koordination und Reports noch auf `anm_schueler.schueler_id` zurückfallen.
2. **Backend:** Unbenutzte Funktionen `upsertAnmSchuelerCsvImport`,
   `upsertAnmeldungenWizardImport`, `resolvePoolStudentIdForSchoolChange`,
   `matchStudent` sowie die beiden unbenutzten `buildAssignedSchoolExpr`-Helper
   löschen.
3. **Import/API:** Kompatibilitätsaliase schrittweise durch
   `interne_schueler_id` und `externe_schueler_id` ersetzen; CSV-Quellspalten
   dürfen beim Parsen weiterhin ausdrücklich als externe IDs akzeptiert werden.
4. **Import:** `findExistingSchuelerRecord` vollständig auf
   `anm_schueler_externe_id`/zentrale Personenauflösung umstellen und danach den
   Legacy-Fallback entfernen.
5. **Import und offene Fälle:** Den aktiven parallelen Schreibpfad in
   `anm_schueler_anmeldung`, `anm_anmeldung` und über `schueler_pool_id` durch
   direkte Referenzen auf `anm_schueler.id` ersetzen. Vor Tabellenlöschung die
   verbleibenden fachlichen Zwecke von Anmeldung, Protokoll und Abgleich
   ausdrücklich modellieren.
6. **DB:** Nach Datenprüfung und erfolgreicher Umstellung aller Leser den Unique
   Key `uq_anm_schueler_verfahren_legacy_id` und anschließend
   `anm_schueler.schueler_id` entfernen.
7. **DB:** Erst nach Schritt 5 über Entfernung oder Umbau von
   `anm_schueler_pool`, `anm_schueler_anmeldung`, `anm_anmeldung` und
   `anm_schueler_abgleich` sowie der Legacy-FKs in `anm_offener_fall`
   entscheiden. Diese Tabellen sind noch nicht sofort löschbar.

Damit ist fachlich bestätigt, dass das neue Schüler-/Rundenmodell der führende
Pfad ist. Phase 4 ist eine kontrollierte Bereinigung der oben abgegrenzten
Kompatibilitätsschicht und kein erneuter Modellumbau.
