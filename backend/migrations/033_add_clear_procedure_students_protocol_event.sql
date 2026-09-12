INSERT INTO anm_kat_ereignisse (code, bezeichnung, beschreibung, aktiv)
VALUES (
  'Alle_SuS_im_Verfahren_geloescht',
  'Alle SuS im Verfahren geloescht',
  'Alle Schuelerdaten eines Anmeldeverfahrens wurden geloescht.',
  1
)
ON DUPLICATE KEY UPDATE
  bezeichnung = VALUES(bezeichnung),
  beschreibung = VALUES(beschreibung),
  aktiv = VALUES(aktiv);
