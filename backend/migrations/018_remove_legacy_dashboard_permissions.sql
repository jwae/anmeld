-- Entfernt das vollstaendig durch app_permission/app_group_permission
-- ersetzte Dashboard-Rechtekonzept.

DROP TABLE IF EXISTS `app_group_dashboard`;
DROP TABLE IF EXISTS `app_dashboard`;

-- Bestehende Installationen koennen noch den historischen Namen "admin"
-- verwenden. Die Umbenennung ist nur eine Datenbereinigung; Autorisierung
-- erfolgt ausschliesslich ueber Berechtigungen.
UPDATE `app_group` legacy_group
LEFT JOIN `app_group` canonical_group
  ON LOWER(TRIM(canonical_group.`group_name`)) = 'administrator'
  AND canonical_group.`group_id` <> legacy_group.`group_id`
SET legacy_group.`group_name` = 'Administrator'
WHERE LOWER(TRIM(legacy_group.`group_name`)) = 'admin'
  AND canonical_group.`group_id` IS NULL;
