INSERT INTO `anm_kat_fallgrund` (`code`, `bezeichnung`)
SELECT 'SCHULE_ABWEICHEND', 'Schule abweichend'
WHERE NOT EXISTS (
  SELECT 1
  FROM `anm_kat_fallgrund`
  WHERE `code` = 'SCHULE_ABWEICHEND'
);
