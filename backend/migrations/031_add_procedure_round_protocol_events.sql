INSERT INTO `anm_kat_ereignisse` (`code`, `bezeichnung`, `beschreibung`, `aktiv`)
VALUES
  ('VERFAHREN_GELOESCHT', 'Verfahren geloescht', 'Ein Anmeldeverfahren wurde geloescht.', 1),
  ('RUNDE_BEENDET', 'Runde beendet', 'Eine Anmelderunde wurde beendet.', 1),
  ('RUNDE_GELOESCHT', 'Runde geloescht', 'Eine Anmelderunde wurde geloescht.', 1)
ON DUPLICATE KEY UPDATE
  `bezeichnung` = VALUES(`bezeichnung`),
  `beschreibung` = VALUES(`beschreibung`),
  `aktiv` = VALUES(`aktiv`);
