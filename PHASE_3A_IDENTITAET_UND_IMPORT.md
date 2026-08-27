# Phase 3a: Identitaets- und Importlogik

## Abgrenzung

Phase 3a umfasst die Identifikation beziehungsweise Anlage eines Kindes, externe
Identitaeten und den beim Import benoetigten Rundenzustand. Rundenwechsel,
Koordination und Auswertungen gehoeren fachlich zu Phase 3b/3c.

Im bestehenden Arbeitsstand waren diese spaeteren Bereiche bereits teilweise auf
das neue Schema angepasst. Sie wurden im Rahmen von Phase 3a nicht weiter
refaktoriert.

## Erreichbare Importpfade

| Importpfad | Zentrale Schreibfunktion | Externe Herkunftsart | Transaktion |
|---|---|---|---|
| allgemeiner Pool-/CSV-Import | `upsertAnmSchuelerCsvImportV3` / `upsertStudent` | `POOL` oder waehltbar `EWO` | Gesamtimport plus Savepoint je Zeile |
| einfacher Pool-CSV-Endpunkt | `upsertStudent` | `POOL` | Gesamtimport |
| JG4-Pool aus Schild | `upsertStudent` | `SCHILD` | je Schule |
| CSV-Anmeldungsimport | `upsertAnmeldungenWizardImportV3` | `SCHULE` mit Schulnummer | Gesamtimport plus Savepoint je Zeile |
| Schul-/Schild3-Anmeldungen | `upsertSchuelerForAnmeldungImport` | `SCHULE` mit Schulnummer | je Schule plus Savepoint je Zeile |
| Rueckmeldungen MG | `resolveStudent` / `upsertRoundState` | keine ID vorhanden; Personenmatching | Gesamtimport |

Ein eigener produktiver Importhandler fuer Schueler Online oder eine manuelle
Schueleranlage ist im Projekt derzeit nicht vorhanden. Eine manuelle Anlage
offener Faelle ist keine Schueleranlage.

## Zentrale Funktionen

`backend/lib/schuelerIdentityService.js` stellt bereit:

- `normalizeExternalIdentity`
- `findStudentByExternalId`
- `findStudentsByPersonData`
- `createStudent`
- `updateStudentMaster`
- `attachExternalId`
- `resolveStudent`
- `findRoundState`
- `upsertRoundState`

Die Reihenfolge in `resolveStudent` ist:

1. echte externe Identitaet suchen;
2. bei keinem Treffer exakt ueber Verfahren, Vorname, Nachname und Geburtsdatum suchen;
3. null Treffer: Kind anlegen;
4. ein Treffer: vorhandenes Kind verwenden;
5. mehrere Treffer: Konflikt mit Code `AMBIGUOUS_STUDENT_MATCH`;
6. eine neue echte externe ID dem eindeutigen Kind zuordnen.

Es gibt keine Fuzzy-Suche und keine kuenstlichen IDs. `herkunft` wird nur von
`createStudent` gesetzt und von `updateStudentMaster` bewusst nicht aktualisiert.

## Quellenregeln

Die erlaubten Werte sind `POOL`, `SCHULE`, `EWO`, `SCHILD`,
`SCHUELER_ONLINE`, `KITA` und `SONST`. Bei `SCHULE` und `KITA` ist eine Kennung
Pflicht. Bei zentralen Quellen wird `herkunft_snr` auf `NULL` normalisiert.

Der allgemeine CSV-Wizard bietet eine kleine Auswahl zwischen Pool-/CSV-Datei und
EWO-Datei. Weitere API-basierte Importer koennen `source_art` uebergeben.

## Atomaritaet

Alle produktiven Mehrschrittimporte verwenden MariaDB-Transaktionen. Schleifen,
die einzelne fehlerhafte Zeilen protokollieren und mit weiteren Zeilen fortfahren,
verwenden zusaetzlich einen Savepoint je Datensatz. Dadurch werden Schueler,
externe ID und Rundenzustand einer fehlgeschlagenen Zeile gemeinsam
zurueckgerollt.

## Legacy- und Reststellen

Die alten Funktionen `upsertAnmSchuelerCsvImport` und
`upsertAnmeldungenWizardImport` in `importeController.js` sind nicht mehr an einen
Handler angebunden. Sie enthalten noch SQL fuer die alte Tabellenstruktur und
koennen in Phase 4 entfernt werden.

`anm_schueler.schueler_id` wird noch als nachrangiger Lesefallback verwendet in:

- `backend/controllers/importeController.js`
- `backend/controllers/abgleichController.js`
- `backend/controllers/koordinationController.js`
- den vier Schueler-Auswertungsservices in `backend/lib`

Die Importausfuehrung schreibt dieses Legacy-Feld nicht mehr und verwendet es
nicht als primaeres Matchingmodell.

Die getrennten Legacy-Tabellen `anm_schueler_pool`, `anm_schueler_anmeldung`,
`anm_anmeldung` und `anm_schueler_abgleich` werden aus Kompatibilitaetsgruenden
weitergefuehrt. Ohne echte externe ID wird kein Ersatzwert erzeugt; nicht eindeutig
abbildbare Legacy-Nebenzeilen werden ausgelassen.

## Statische Zuordnung spaeterer Phasen

- Phase 3b: Rundenwechsel und Uebernahme in die naechste Runde.
- Phase 3b: Koordinations- und Abgleichansichten sowie rundenbezogene Schreibwege.
- Phase 3c: Statistiken, CSV-/PDF-Berichte und rundenuebergreifende Auswertungen.
- Phase 4: inaktive Alt-Upserts, Legacy-Lesefallbacks und parallele Importtabellen.
