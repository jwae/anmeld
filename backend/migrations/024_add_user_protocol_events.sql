INSERT INTO `anm_kat_ereignisse` (`code`, `bezeichnung`, `beschreibung`, `aktiv`)
VALUES
  ('BENUTZER_ERSTELLT', 'Benutzer erstellt', 'Ein Benutzerkonto wurde in der App-Verwaltung erstellt.', 1),
  ('BENUTZER_GELOESCHT', 'Benutzer gelöscht', 'Ein Benutzerkonto wurde in der App-Verwaltung gelöscht.', 1)
ON DUPLICATE KEY UPDATE
  `bezeichnung` = VALUES(`bezeichnung`),
  `beschreibung` = VALUES(`beschreibung`),
  `aktiv` = VALUES(`aktiv`);
