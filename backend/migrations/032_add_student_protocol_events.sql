INSERT INTO anm_kat_ereignisse (code, bezeichnung, beschreibung, aktiv) VALUES
  ('SCHUELER_ERSTELLT', 'Schueler erstellt', 'Ein Schuelerdatensatz wurde erstellt.', 1),
  ('SCHUELER_GEAENDERT', 'Schueler geaendert', 'Fachliche Daten eines Schuelerdatensatzes wurden geaendert.', 1),
  ('SCHUELER_GELOESCHT', 'Schueler geloescht', 'Ein Schuelerdatensatz wurde geloescht.', 1),
  ('RUNDENWECHSEL', 'Rundenwechsel', 'Eine Anmelderunde wurde in die naechste Runde ueberfuehrt.', 1)
ON DUPLICATE KEY UPDATE bezeichnung = VALUES(bezeichnung), beschreibung = VALUES(beschreibung), aktiv = VALUES(aktiv);
