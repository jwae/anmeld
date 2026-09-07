-- Apply only after repairing existing cross-procedure round assignments.
-- Foreign keys intentionally reject inconsistent historical rows.
ALTER TABLE anm_runde
  ADD UNIQUE KEY uq_anm_runde_id_verfahren (id, verfahren_id);

ALTER TABLE anm_schueler_runde
  DROP FOREIGN KEY fk_anm_schueler_runde_schueler,
  DROP FOREIGN KEY fk_anm_schueler_runde_runde,
  ADD CONSTRAINT fk_anm_sr_schueler_verfahren
    FOREIGN KEY (schueler_id, verfahren_id) REFERENCES anm_schueler (id, verfahren_id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_anm_sr_runde_verfahren
    FOREIGN KEY (runde_id, verfahren_id) REFERENCES anm_runde (id, verfahren_id)
    ON DELETE CASCADE ON UPDATE RESTRICT;
