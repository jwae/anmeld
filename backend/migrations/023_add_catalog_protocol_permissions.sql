INSERT INTO `app_permission`
  (`permission_key`, `permission_name`, `description`, `is_active`)
VALUES
  ('kataloge.anzeigen', 'Kataloge anzeigen', 'Kataloge in der App-Verwaltung anzeigen', 1),
  ('kataloge.bearbeiten', 'Kataloge bearbeiten', 'Katalogeintraege in der App-Verwaltung bearbeiten', 1),
  ('protokoll.anzeigen', 'Protokoll anzeigen', 'Eintraege des Anwendungsprotokolls anzeigen', 1),
  ('protokoll.bearbeiten', 'Protokoll verwalten', 'Einstellungen des Anwendungsprotokolls verwalten; bestehende Protokolleintraege bleiben unveraenderlich', 1)
ON DUPLICATE KEY UPDATE
  `permission_name` = VALUES(`permission_name`),
  `description` = VALUES(`description`),
  `is_active` = VALUES(`is_active`);

INSERT IGNORE INTO `app_group_permission` (`group_id`, `permission_id`)
SELECT g.`group_id`, p.`permission_id`
FROM `app_group` g
JOIN `app_permission` p
  ON p.`permission_key` IN (
    'kataloge.anzeigen',
    'kataloge.bearbeiten',
    'protokoll.anzeigen',
    'protokoll.bearbeiten'
  )
WHERE LOWER(TRIM(g.`group_name`)) IN ('administrator', 'admin');
