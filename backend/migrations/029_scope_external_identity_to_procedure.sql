-- Run before deploying the procedure-scoped identity service.
ALTER TABLE anm_schueler
  ADD UNIQUE KEY uq_anm_schueler_id_verfahren (id, verfahren_id);

ALTER TABLE anm_schueler_externe_id
  ADD COLUMN verfahren_id bigint(20) NULL AFTER id;

UPDATE anm_schueler_externe_id x
JOIN anm_schueler s ON s.id = x.schueler_id
SET x.verfahren_id = s.verfahren_id;

ALTER TABLE anm_schueler_externe_id
  MODIFY COLUMN verfahren_id bigint(20) NOT NULL,
  DROP INDEX uq_anm_schueler_externe_identitaet,
  ADD KEY idx_anm_externe_id_quelle (herkunft_art),
  ADD UNIQUE KEY uq_anm_schueler_externe_identitaet
    (verfahren_id, herkunft_art, herkunft_snr_norm, externe_id),
  DROP FOREIGN KEY fk_anm_schueler_externe_id_schueler,
  ADD CONSTRAINT fk_anm_externe_id_schueler_verfahren
    FOREIGN KEY (schueler_id, verfahren_id) REFERENCES anm_schueler (id, verfahren_id)
    ON DELETE CASCADE ON UPDATE RESTRICT;
