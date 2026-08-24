INSERT INTO `anm_kat_ereignisse` (`code`, `bezeichnung`, `beschreibung`, `aktiv`)
VALUES
  ('VERFAHREN_ERSTELLT', 'Verfahren erstellt', 'Ein Anmeldeverfahren wurde erstellt.', 1),
  ('VERFAHREN_GEAENDERT', 'Verfahren geaendert', 'Ein Anmeldeverfahren wurde geaendert.', 1),
  ('VERFAHREN_GESTARTET', 'Verfahren gestartet', 'Ein Anmeldeverfahren wurde gestartet.', 1),
  ('VERFAHREN_BEENDET', 'Verfahren beendet', 'Ein Anmeldeverfahren wurde beendet.', 1),
  ('RUNDE_ERSTELLT', 'Runde erstellt', 'Eine Anmelderunde wurde erstellt.', 1),
  ('RUNDE_GEAENDERT', 'Runde geaendert', 'Eine Anmelderunde wurde geaendert.', 1),
  ('RUNDE_GESTARTET', 'Runde gestartet', 'Eine Anmelderunde wurde gestartet.', 1),
  ('IMPORT_GESTARTET', 'Import gestartet', 'Ein Import wurde gestartet.', 1),
  ('IMPORT_BEENDET', 'Import beendet', 'Ein Import wurde erfolgreich beendet.', 1),
  ('IMPORT_FEHLGESCHLAGEN', 'Import fehlgeschlagen', 'Ein Import wurde mit einem Fehler beendet.', 1),
  ('LOGIN_VERWALTUNGSBEREICH', 'Login Verwaltungsbereich', 'Anmeldung am geschuetzten Verwaltungsbereich.', 1),
  ('LOGOUT_VERWALTUNGSBEREICH', 'Logout Verwaltungsbereich', 'Abmeldung vom geschuetzten Verwaltungsbereich.', 1)
ON DUPLICATE KEY UPDATE
  `bezeichnung` = VALUES(`bezeichnung`),
  `beschreibung` = VALUES(`beschreibung`),
  `aktiv` = VALUES(`aktiv`);
