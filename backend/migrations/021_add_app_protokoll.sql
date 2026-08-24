CREATE TABLE IF NOT EXISTS `anm_kat_ereignisse` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  `beschreibung` varchar(500) DEFAULT NULL,
  `aktiv` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_anm_kat_ereignisse_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Katalog der protokollierbaren Ereignisse';

INSERT INTO `anm_kat_ereignisse` (`code`, `bezeichnung`, `beschreibung`, `aktiv`)
VALUES
  ('LOGIN', 'Login', 'Anmeldung an der Anwendung', 1),
  ('LOGOUT', 'Logout', 'Abmeldung von der Anwendung', 1)
ON DUPLICATE KEY UPDATE
  `bezeichnung` = VALUES(`bezeichnung`),
  `beschreibung` = VALUES(`beschreibung`),
  `aktiv` = VALUES(`aktiv`);

CREATE TABLE IF NOT EXISTS `app_protokoll` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `ereignis_id` bigint(20) NOT NULL,
  `zeitpunkt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `ergebnis` enum('ERFOLG','FEHLER') NOT NULL,
  `benutzer_id` int(10) unsigned DEFAULT NULL,
  `benutzername` varchar(255) DEFAULT NULL,
  `verfahren_id` bigint(20) DEFAULT NULL,
  `runde_id` bigint(20) DEFAULT NULL,
  `objekt_typ` varchar(50) DEFAULT NULL,
  `objekt_id` varchar(100) DEFAULT NULL,
  `aenderungen` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`aenderungen`)),
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`)),
  `ip_adresse` varchar(45) DEFAULT NULL,
  `korrelation_id` char(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_app_protokoll_zeitpunkt` (`zeitpunkt`),
  KEY `idx_app_protokoll_ereignis_zeitpunkt` (`ereignis_id`,`zeitpunkt`),
  KEY `idx_app_protokoll_benutzer_zeitpunkt` (`benutzer_id`,`zeitpunkt`),
  KEY `idx_app_protokoll_verfahren_zeitpunkt` (`verfahren_id`,`zeitpunkt`),
  CONSTRAINT `fk_app_protokoll_ereignis` FOREIGN KEY (`ereignis_id`) REFERENCES `anm_kat_ereignisse` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_app_protokoll_benutzer` FOREIGN KEY (`benutzer_id`) REFERENCES `app_user` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Unveraenderliches Anwendungsprotokoll';
