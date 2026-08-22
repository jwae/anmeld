INSERT INTO anm_kat_fallgrund (code, bezeichnung, sortierung, aktiv)
VALUES ('HERKUNFTSFEHLER', 'Ungültige oder nicht zuordenbare Herkunftsschule.', 11, 1)
ON DUPLICATE KEY UPDATE
  bezeichnung = VALUES(bezeichnung),
  sortierung = VALUES(sortierung),
  aktiv = VALUES(aktiv);
