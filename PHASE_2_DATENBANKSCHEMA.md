# Phase 2: Rundenunabhängiges Schülerschema

Phase 2 ändert ausschließlich das Datenbankschema. Bestehende Backend-,
Frontend-, Import-, Abgleich-, Koordinations- und Auswertungslogik wurde nicht
angepasst. Die Datenbank enthält laut Fachvorgabe keine zu erhaltenden
Schülerdaten; die Migration enthält daher keine Übernahme vorhandener
Schülerdatensätze.

## Zielstruktur

`anm_schueler` enthält genau einen kindbezogenen Stammdatensatz je Verfahren.
Die nullable Legacy-ID `schueler_id` bleibt vorübergehend erhalten und ist über
`(verfahren_id, schueler_id)` eindeutig. MariaDB erlaubt dabei weiterhin
mehrere Datensätze mit `schueler_id = NULL`.

`anm_schueler_runde` enthält den Zustand eines Kindes in einer Runde:

- `verfahren_id`, `schueler_id`, `runde_id`
- `anmeldestatus`, `teilnahmestatus`, `abgleich_status`
- `schul_nr`, `koordinierte_snr`
- `koordiniert_am`, `koordiniert_von`
- eigene Erstellungs- und Änderungszeitstempel

`anm_schueler_externe_id` verweist über den fachlichen Katalogcode in
`herkunft_art` auf `anm_kat_quelle.code`. `externe_id` ist `VARCHAR(50)`.
Die generierte Spalte `herkunft_snr_norm` normalisiert fehlende
Herkunftskennungen für die DB-seitig erzwungene Eindeutigkeit.

## In Phase 3 anzupassende Backend-Stellen

- `backend/controllers/importeController.js`: Alle Pool-, Anmeldungs-,
  Rückmeldungs- und manuellen Importpfade müssen Stammdaten,
  Rundeneigenschaften und externe IDs getrennt lesen und schreiben. Der
  Abgleich bestehender Schüler muss auf `anm_schueler_externe_id` umgestellt
  und `bemerkung` für den Kindstamm als `notiz` behandelt werden.
- `backend/controllers/abgleichController.js`: Rundenselektion, Status- und
  Schulfelder müssen über `anm_schueler_runde` gelesen und aktualisiert werden;
  Stammdaten bleiben in `anm_schueler`.
- `backend/controllers/koordinationController.js`: Listen, Fallauflösung und
  Zuweisungen müssen `anm_schueler_runde` joinen und `koordinierte_snr`,
  `koordiniert_am` und `koordiniert_von` dort aktualisieren.
- `backend/models/anmelderundenModel.js`: Beim Rundenwechsel darf kein neuer
  Schülerstammdatensatz mehr kopiert werden. Stattdessen ist ein neuer
  `anm_schueler_runde`-Datensatz anzulegen.
- `backend/lib/anmeldeWriteGuard.js`: Die Rundenprüfung muss über
  `anm_schueler_runde` erfolgen, da `anm_schueler.runde_id` entfällt.
- `backend/lib/offeneAnmeldungenReportService.js`,
  `backend/lib/poolSchuelerAktuelleRundeReportService.js`,
  `backend/lib/schuelerNachHerkunftsschuleReportService.js` und
  `backend/lib/schuelerRundenuebersichtService.js`: Berichtsabfragen müssen den
  Kindstamm mit Rundendaten joinen und die neuen Schulspalten verwenden.
- `backend/models/anmeldeverfahrenModel.js`: Lösch- und Bereinigungsreihenfolge
  für die beiden neuen abhängigen Tabellen überprüfen; die definierten
  Cascades können genutzt werden.
- `backend/tests/mgMatching.test.js` und
  `backend/tests/clearProcedureStudents.test.js`: SQL-Mocks und Erwartungen an
  das getrennte Stamm-/Runden-/Identitätsmodell anpassen und ergänzen.

## In Phase 3 anzupassende Frontend-Stellen

Das Frontend greift nicht direkt auf Tabellen zu. Die folgenden Stellen bilden
jedoch die derzeitige API-Struktur mit den alten Schülerfeldern ab und müssen
mit den in Phase 3 festgelegten DTOs abgeglichen werden:

- Importoberflächen:
  `frontend/src/components/PoolImport.vue`,
  `CsvImportOverlay.vue`, `CsvImportStepUpload.vue`,
  `AnmeldungImport.vue`, `AnmeldungenImportOverlay.vue`,
  `AnmeldungenImportStepMapping.vue`, `AnmeldungenImportStepUpload.vue`,
  `AnmeldungenImportStepValidation.vue` und
  `RueckmeldungenMgImportOverlay.vue`.
- Fachansichten: `frontend/src/views/AbgleichView.vue`,
  `KoordinationView.vue` und `AuswertungenView.vue`.
- API-Typen und Payloads: `frontend/src/services/abgleichService.ts`,
  `koordinationService.ts` und `auswertungenService.ts`.

Nicht betroffen sind gleichnamige `bemerkung`-Felder anderer Fachobjekte wie
Kapazitäten oder offene Fälle; diese sind keine Schülernotizen.
