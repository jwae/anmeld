SET @fk_name := (
  SELECT tc.CONSTRAINT_NAME
  FROM information_schema.TABLE_CONSTRAINTS tc
  JOIN information_schema.KEY_COLUMN_USAGE kcu
    ON tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
   AND tc.TABLE_NAME = kcu.TABLE_NAME
   AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
  WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
    AND tc.TABLE_NAME = 'anm_schulen'
    AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND kcu.COLUMN_NAME = 'sf_id'
  LIMIT 1
);

SET @drop_fk_sql := IF(
  @fk_name IS NOT NULL,
  CONCAT('ALTER TABLE `anm_schulen` DROP FOREIGN KEY `', @fk_name, '`'),
  'SELECT 1'
);
PREPARE stmt FROM @drop_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE `anm_schulen`
  MODIFY COLUMN `sf_id` VARCHAR(32) DEFAULT NULL;

UPDATE `anm_schulen` s
JOIN `anm_kat_sf` k
  ON CAST(s.`sf_id` AS CHAR(32)) = CAST(k.`sf_id` AS CHAR(32))
SET s.`sf_id` = k.`code`
WHERE s.`sf_id` IS NOT NULL
  AND s.`sf_id` <> '';

UPDATE `anm_schulen`
SET `sf_id` = NULL
WHERE `sf_id` IS NOT NULL
  AND `sf_id` <> ''
  AND `sf_id` NOT IN (
    SELECT `code`
    FROM `anm_kat_sf`
  );

SET @has_new_fk := (
  SELECT COUNT(*)
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'anm_schulen'
    AND COLUMN_NAME = 'sf_id'
    AND REFERENCED_TABLE_NAME = 'anm_kat_sf'
    AND REFERENCED_COLUMN_NAME = 'code'
);

SET @add_fk_sql := IF(
  @has_new_fk = 0,
  'ALTER TABLE `anm_schulen` ADD CONSTRAINT `fk_anm_schulen_sf` FOREIGN KEY (`sf_id`) REFERENCES `anm_kat_sf` (`code`)',
  'SELECT 1'
);
PREPARE stmt FROM @add_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
