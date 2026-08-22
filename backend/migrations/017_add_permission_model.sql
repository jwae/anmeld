-- Fuehrt das zentrale Berechtigungsmodell ein.

CREATE TABLE IF NOT EXISTS `app_permission` (
  `permission_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permission_key` VARCHAR(100) NOT NULL,
  `permission_name` VARCHAR(150) NOT NULL,
  `description` VARCHAR(255) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`permission_id`),
  UNIQUE KEY `uq_app_permission_key` (`permission_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `app_group_permission` (
  `group_id` INT UNSIGNED NOT NULL,
  `permission_id` INT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`group_id`, `permission_id`),
  KEY `fk_app_group_permission_permission` (`permission_id`),
  CONSTRAINT `fk_app_group_permission_group`
    FOREIGN KEY (`group_id`) REFERENCES `app_group` (`group_id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_app_group_permission_permission`
    FOREIGN KEY (`permission_id`) REFERENCES `app_permission` (`permission_id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Die bestehende Gruppe "admin" gilt als kompatibler Alias fuer
-- "Administrator" und wird nicht dupliziert oder umbenannt.
INSERT INTO `app_group` (`group_name`, `group_description`, `is_active`)
SELECT 'Administrator', 'Systemadministrator', 1
WHERE NOT EXISTS (
  SELECT 1 FROM `app_group`
  WHERE LOWER(TRIM(`group_name`)) IN ('administrator', 'admin')
);

INSERT INTO `app_group` (`group_name`, `group_description`, `is_active`)
SELECT 'Sachbearbeitung', 'Fachliche Bearbeitung von Anmeldeverfahren', 1
WHERE NOT EXISTS (
  SELECT 1 FROM `app_group`
  WHERE LOWER(TRIM(`group_name`)) = 'sachbearbeitung'
);

INSERT INTO `app_group` (`group_name`, `group_description`, `is_active`)
SELECT 'Gast', 'Lesender Zugriff auf Anmeldeverfahren', 1
WHERE NOT EXISTS (
  SELECT 1 FROM `app_group`
  WHERE LOWER(TRIM(`group_name`)) = 'gast'
);

INSERT INTO `app_permission`
  (`permission_key`, `permission_name`, `description`, `is_active`)
VALUES
  ('verfahren.anzeigen', 'Verfahren anzeigen', 'Verfahren und zugehoerige Daten anzeigen', 1),
  ('verfahren.bearbeiten', 'Verfahren bearbeiten', 'Fachliche Daten innerhalb eines Verfahrens bearbeiten; umfasst Verfahren, Runden, Schueler, Import, Abgleich, Kapazitaeten und Koordination', 1),
  ('benutzer.bearbeiten', 'Benutzer bearbeiten', 'Benutzer verwalten', 1),
  ('gruppen.bearbeiten', 'Gruppen bearbeiten', 'Gruppen und deren Berechtigungen verwalten', 1)
ON DUPLICATE KEY UPDATE
  `permission_name` = VALUES(`permission_name`),
  `description` = VALUES(`description`),
  `is_active` = VALUES(`is_active`);

-- Gast: nur lesender Verfahrenszugriff.
INSERT IGNORE INTO `app_group_permission` (`group_id`, `permission_id`)
SELECT g.`group_id`, p.`permission_id`
FROM `app_group` g
JOIN `app_permission` p ON p.`permission_key` = 'verfahren.anzeigen'
WHERE LOWER(TRIM(g.`group_name`)) = 'gast';

-- Sachbearbeitung: lesender und schreibender Verfahrenszugriff.
INSERT IGNORE INTO `app_group_permission` (`group_id`, `permission_id`)
SELECT g.`group_id`, p.`permission_id`
FROM `app_group` g
JOIN `app_permission` p
  ON p.`permission_key` IN ('verfahren.anzeigen', 'verfahren.bearbeiten')
WHERE LOWER(TRIM(g.`group_name`)) = 'sachbearbeitung';

-- Administrator: alle vier initialen Berechtigungen. "admin" wird fuer
-- bestehende Installationen als Administratorgruppe weiterverwendet.
INSERT IGNORE INTO `app_group_permission` (`group_id`, `permission_id`)
SELECT g.`group_id`, p.`permission_id`
FROM `app_group` g
JOIN `app_permission` p
  ON p.`permission_key` IN (
    'verfahren.anzeigen',
    'verfahren.bearbeiten',
    'benutzer.bearbeiten',
    'gruppen.bearbeiten'
  )
WHERE LOWER(TRIM(g.`group_name`)) IN ('administrator', 'admin');
