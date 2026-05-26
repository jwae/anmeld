ALTER TABLE `anm_schueler_pool`
  ADD COLUMN `verfahren_id` bigint(20) DEFAULT NULL AFTER `id`,
  ADD COLUMN `snr` varchar(50) DEFAULT NULL AFTER `verfahren_id`,
  ADD COLUMN `schueler_schul_id` varchar(100) DEFAULT NULL AFTER `snr`;

ALTER TABLE `anm_schueler_pool`
  ADD KEY `idx_anm_schueler_pool_verfahren` (`verfahren_id`),
  ADD KEY `idx_anm_schueler_pool_snr` (`snr`),
  ADD KEY `idx_anm_schueler_pool_schul_id` (`schueler_schul_id`),
  ADD KEY `idx_anm_schueler_pool_abgleich` (`verfahren_id`, `snr`, `schueler_schul_id`);

ALTER TABLE `anm_schueler_pool`
  ADD CONSTRAINT `fk_anm_schueler_pool_verfahren`
    FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_anm_schueler_pool_schule`
    FOREIGN KEY (`snr`) REFERENCES `anm_schulen` (`snr`) ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE `anm_schueler_pool`
SET `schueler_schul_id` = CAST(`id` AS CHAR)
WHERE `schueler_schul_id` IS NULL;
