# Phase 4 – Legacy-Bereinigung abgeschlossen

Stand: 27. August 2026

- `anm_schueler.schueler_id`, der Unique-Key
  `uq_anm_schueler_verfahren_legacy_id` und `idx_schueler_id` wurden durch
  Migration 027 entfernt.
- `idx_anm_schueler_verfahren` sichert den weiterhin legitimen Fremdschlüssel
  auf `anm_verfahren` ab.
- Externe Import-IDs werden ausschließlich als `externe_schueler_id` geführt
  und über `anm_schueler_externe_id` aufgelöst.
- Rundenbezogene Daten werden ausschließlich über `anm_schueler_runde`
  verarbeitet.
- Unbenutzte alte Upserts, Matching-Helfer, parallele Import-Schreibpfade und
  mehrdeutige API-/Frontend-Aliase wurden entfernt.
- `anm_offener_fall.schueler_id` bleibt ein legitimer Fremdschlüssel auf
  `anm_schueler.id`.

Die historische Bestandsaufnahme vor der Bereinigung befindet sich in
`PHASE_3E_KONTROLLBERICHT.md`.
