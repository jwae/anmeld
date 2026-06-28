ALTER TABLE `anm_offener_fall`
  MODIFY COLUMN `schueler_pool_id` bigint(20) DEFAULT NULL,
  ADD COLUMN `schueler_id` bigint(20) DEFAULT NULL AFTER `schueler_pool_id`,
  ADD KEY `idx_anm_offener_fall_anm_schueler` (`schueler_id`),
  ADD CONSTRAINT `fk_anm_offener_fall_anm_schueler`
    FOREIGN KEY (`schueler_id`) REFERENCES `anm_schueler` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
