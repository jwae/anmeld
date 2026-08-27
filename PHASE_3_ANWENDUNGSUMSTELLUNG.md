# Phase 3: Anwendungsumstellung

## Zielzustand

- `anm_schueler.id` ist die interne, verfahrensbezogene Identitaet eines Kindes.
- `anm_schueler_runde` enthaelt den Zustand je Runde.
- `anm_schueler_externe_id` enthaelt echte externe Identitaeten.
- `anm_schueler.herkunft` wird nur bei der erstmaligen Anlage geschrieben.
- `anm_schueler.schueler_id` wird nur noch als Anzeige-/Lesefallback fuer Legacy-Daten verwendet.

## Zentrale Identitaetslogik

`backend/lib/schuelerIdentityService.js` buendelt:

1. Suche nach `herkunft_art + herkunft_snr_norm + externe_id`.
2. Konservatives Fallback ueber normalisierten Vornamen, Nachnamen und Geburtsdatum im Verfahren.
3. Anlage genau eines Stammdatensatzes bei null Treffern.
4. Konflikt mit HTTP 409 bei mehreren Personentreffern.
5. Zuordnung einer neuen echten externen ID zum gefundenen Kind.
6. Anlage oder Aktualisierung des Rundenzustands.

Ohne externe ID wird keine Ersatz-ID erzeugt und kein Datensatz in
`anm_schueler_externe_id` geschrieben.

## Umgestellte Bereiche

- CSV-Pool- und CSV-Anmeldungsimport
- Poolimport und JG4-Schildimport
- Schul-/Schild-Anmeldungsimport
- Rueckmeldungen MG
- Bearbeitung der Pool- und Abgleichlisten
- Rundenwechsel ohne Kopie von Schuelerstammdaten
- Koordination, Kapazitaetszaehlung und Geocoding
- offene Faelle mit Referenz auf `anm_schueler.id`
- offene Anmeldungen, Poolliste, Herkunftsschulbericht und Rundenuebersicht
- Importstatistik je Schule

Importe mit Stammdatensatz, externer ID und Rundenzustand laufen in den vorhandenen
Importtransaktionen. Fehler rollen die gesamte Importeinheit zurueck.

## Quellenarten

- Pooldatei: `POOL`, ohne `herkunft_snr`
- Schild-Poolabruf: `SCHILD`, ohne `herkunft_snr`
- Schulanmeldung mit lokaler ID: `SCHULE` und Schulnummer
- API-Aufrufer koennen beim allgemeinen CSV-Poolimport `source_art` beziehungsweise
  `herkunft_art` setzen, etwa auf `EWO`, `KITA` oder `SCHUELER_ONLINE`.

## Pruefung

- `npm test` im Backend prueft alle vorhandenen Tests und die neun geforderten
  Identitaets-/Rundenszenarien.
- `npm run verify:student-identity-phase3` prueft das Live-Schema und fuehrt die
  zentralen Lesewege gegen eine vorhandene Verfahren-/Rundenkombination aus.
- `npm run build` im Frontend prueft TypeScript und den Produktionsbuild.

Die separate Reststellenliste steht in `PHASE_4_LEGACY_RESTE.md`.
