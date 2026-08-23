INSERT INTO anm_kat_fallgrund (code, bezeichnung, sortierung, aktiv)
VALUES ('EMPFEHLUNG_ABWEICHUNG', 'Importierte Empfehlung weicht vom hinterlegten Wert ab.', 12, 1)
ON DUPLICATE KEY UPDATE
  bezeichnung = VALUES(bezeichnung),
  sortierung = VALUES(sortierung),
  aktiv = VALUES(aktiv);
