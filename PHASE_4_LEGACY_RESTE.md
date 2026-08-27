# Legacy-Reste fuer Phase 4

## `anm_schueler.schueler_id`

Das nullable Feld wird in Phase 3 nicht mehr beschrieben. Es bleibt an folgenden
Stellen als nachrangiger Anzeige-/Lesefallback erhalten:

- `backend/controllers/abgleichController.js`
- `backend/controllers/koordinationController.js`
- `backend/controllers/importeController.js`
- `backend/lib/offeneAnmeldungenReportService.js`
- `backend/lib/poolSchuelerAktuelleRundeReportService.js`
- `backend/lib/schuelerNachHerkunftsschuleReportService.js`
- `backend/lib/schuelerRundenuebersichtService.js`

Nach Migration beziehungsweise Wegfall alter Datensaetze kann Phase 4 diese
Fallbacks entfernen und anschliessend die Spalte loeschen.

## Inaktiver Kompatibilitaetscode

In `backend/controllers/importeController.js` sind die frueheren Funktionen
`upsertAnmSchuelerCsvImport` und `upsertAnmeldungenWizardImport` noch enthalten.
Sie werden von keinem produktiven Handler mehr aufgerufen; die Handler verwenden
die jeweiligen `V3`-Funktionen. Die alten Funktionen referenzieren entfernte
Spalten und koennen in Phase 4 geloescht werden, sobald die Kompatibilitaetsphase
ausdruecklich beendet wird.

## Parallele Legacy-Importtabellen

Die bestehenden Tabellen `anm_schueler_pool`, `anm_schueler_anmeldung`,
`anm_anmeldung` und `anm_schueler_abgleich` werden weiterhin fuer bestehende
Importprotokolle und Zuordnungen bedient. Die fachliche Schueleridentitaet und der
Rundenzustand liegen trotzdem in den neuen drei Tabellen. Ohne echte externe ID
werden keine kuenstlichen Werte fuer diese Legacy-Tabellen erzeugt.

Phase 4 sollte entscheiden, welche dieser Tabellen durch direkte Referenzen auf
`anm_schueler.id` ersetzt oder vollstaendig entfernt werden.

## Offene Faelle

`anm_offener_fall.schueler_id` verweist weiterhin korrekt auf `anm_schueler.id`.
Die Tabelle besitzt derzeit keinen eigenen zwingenden Rundenbezug. Ob offene
Faelle fachlich eine `runde_id` benoetigen, bleibt eine bewusste Modellentscheidung
fuer eine spaetere Phase; Phase 3 erweitert das Schema nicht ungefragt.
