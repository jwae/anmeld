ALTER TABLE `anm_offener_fall`
  ADD COLUMN `runde_id` bigint(20) DEFAULT NULL AFTER `verfahren_id`;

UPDATE `anm_offener_fall` f
SET f.runde_id = COALESCE(
  (
    SELECT sr.runde_id
    FROM anm_schueler_runde sr
    JOIN anm_runde r
      ON r.id = sr.runde_id
     AND r.verfahren_id = sr.verfahren_id
    WHERE sr.verfahren_id = f.verfahren_id
      AND sr.schueler_id = f.schueler_id
    ORDER BY
      CASE r.status
        WHEN 'In Bearbeitung' THEN 0
        WHEN 'Beendet' THEN 1
        ELSE 2
      END,
      r.runden_nummer DESC,
      r.id DESC
    LIMIT 1
  ),
  (
    SELECT r.id
    FROM anm_runde r
    WHERE r.verfahren_id = f.verfahren_id
    ORDER BY
      CASE r.status
        WHEN 'In Bearbeitung' THEN 0
        WHEN 'Beendet' THEN 1
        ELSE 2
      END,
      r.runden_nummer DESC,
      r.id DESC
    LIMIT 1
  )
)
WHERE f.runde_id IS NULL;

ALTER TABLE `anm_offener_fall`
  MODIFY COLUMN `runde_id` bigint(20) NOT NULL,
  ADD KEY `idx_anm_offener_fall_runde_verfahren` (`runde_id`, `verfahren_id`),
  ADD CONSTRAINT `fk_anm_offener_fall_runde_verfahren`
    FOREIGN KEY (`runde_id`, `verfahren_id`)
    REFERENCES `anm_runde` (`id`, `verfahren_id`)
    ON DELETE CASCADE
    ON UPDATE RESTRICT;
