# Phase 1: Vorbereitung der rundenunabhängigen Schüleridentität

Phase 1 ergänzt das bestehende Modell ausschließlich parallel. Es werden keine
Bestandsdaten migriert und weder Spalten noch bestehende Import- oder
Kompatibilitätslogik verändert.

## Neue Strukturen

- `anm_kat_quelle` katalogisiert die Art eines externen Quellsystems.
- `anm_schueler_externe_id` kann mehrere externe Identitäten je Schüler
  aufnehmen. `herkunft_art` verweist auf `anm_kat_quelle.id`;
  `herkunft_snr` ist bewusst kein Fremdschlüssel auf `anm_schulen`.
- `anm_schueler_runde` bereitet die spätere Ablage rundenabhängiger
  Eigenschaften vor. Die Eindeutigkeit von `(schueler_id, runde_id)` ist
  erzwungen.

Für externe Identitäten wird `herkunft_snr` in der generierten Hilfsspalte
`herkunft_snr_norm` normalisiert. `NULL`, eine leere Zeichenfolge und eine nur
aus Leerzeichen bestehende Herkunftsnummer werden dort zu `''`. Der eindeutige
Index auf `(herkunft_art, herkunft_snr_norm, externe_id)` verhindert deshalb
auch bei zentralen Quellen ohne `herkunft_snr` Dubletten. Ein gewöhnlicher
MariaDB-UNIQUE-Index direkt auf der nullable Spalte könnte dies nicht leisten,
weil er mehrere `NULL`-Werte zulässt.

## Kandidaten für Phase 2/3

Nach Schema- und Codeanalyse sind die folgenden vorhandenen Spalten klar
rundenbezogen und sollten voraussichtlich nach `anm_schueler_runde` wechseln:

- `anmeldestatus`
- `teilnahmestatus`
- `anmeldeschule_snr` (früher `schul_nr`)
- `erwartete_snr`
- `zugewiesene_schule_snr` (Nachfolger der älteren `koordinierte_snr`)
- `zugewiesen_am`
- `zugewiesen_von`
- `zugewiesen_bemerkung`
- `koordiniert_am`
- `koordiniert_von`
- `abgleich_status`
- `bemerkung`, soweit sie die Bearbeitung in einer konkreten Runde beschreibt
- `quell_jahrgang`
- `ef`

Vor der späteren Migration fachlich noch zu entscheiden:

- `herkunftsschule_snr`: kann eine Eigenschaft des Übergangs in einer Runde
  oder eine länger gültige Herkunftsangabe sein.
- `zieldifferent`: wird aktuell zwischen Runden kopiert, kann fachlich aber
  zeitabhängig sein.
- `verfahren_id`: gehört langfristig nicht zur rundenunabhängigen Identität;
  im Rundendatensatz wäre das Verfahren bereits über `runde_id` ableitbar.

Nicht nach `anm_schueler_runde` gehören `foerderbedarf` und `empfehlung`; sie
bleiben gemäß Fachvorgabe kindbezogen. Auch `herkunft` bleibt als write-once
Information über die ursprüngliche Entstehung des Schülerdatensatzes erhalten.
Die vorhandenen Identifikatoren `schueler_id`, `schueler_nr` und
`herkunftsschueler_nr` sind Kandidaten für eine spätere Überführung in externe
Identitäten, nicht für den Rundendatensatz. In Phase 1 bleiben sie unverändert.
