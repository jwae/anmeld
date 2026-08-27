ALTER TABLE `anm_schueler`
  ADD KEY `idx_anm_schueler_verfahren` (`verfahren_id`),
  DROP INDEX `uq_anm_schueler_verfahren_legacy_id`,
  DROP INDEX `idx_schueler_id`,
  DROP COLUMN `schueler_id`;
