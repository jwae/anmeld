CREATE TABLE IF NOT EXISTS `anm_kat_empfehlung` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_anm_kat_empfehlung_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `anm_kat_fallgrund` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_anm_kat_fallgrund_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `anm_kat_anmeldestatus` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_anm_kat_anmeldestatus_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `anm_schueler_pool` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `vorname` varchar(120) NOT NULL,
  `nachname` varchar(120) NOT NULL,
  `geburtsdatum` date DEFAULT NULL,
  `adresse` varchar(255) DEFAULT NULL,
  `erzieher` varchar(255) DEFAULT NULL,
  `foerderbedarf` varchar(255) DEFAULT NULL,
  `zieldifferent` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_anm_schueler_pool_name` (`nachname`,`vorname`),
  KEY `idx_anm_schueler_pool_geburtsdatum` (`geburtsdatum`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `anm_offener_fall` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `verfahren_id` int(11) NOT NULL,
  `schueler_pool_id` int(11) NOT NULL,
  `fallgrund_id` int(11) NOT NULL,
  `empfehlung_id` int(11) DEFAULT NULL,
  `fallstatus_code` varchar(32) NOT NULL DEFAULT 'OFFEN',
  `notiz` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_anm_offener_fall_once` (`verfahren_id`,`schueler_pool_id`,`fallgrund_id`),
  KEY `idx_anm_offener_fall_status` (`fallstatus_code`),
  KEY `idx_anm_offener_fall_empfehlung` (`empfehlung_id`),
  CONSTRAINT `fk_anm_offener_fall_verfahren` FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_anm_offener_fall_schueler` FOREIGN KEY (`schueler_pool_id`) REFERENCES `anm_schueler_pool` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_anm_offener_fall_fallgrund` FOREIGN KEY (`fallgrund_id`) REFERENCES `anm_kat_fallgrund` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_anm_offener_fall_empfehlung` FOREIGN KEY (`empfehlung_id`) REFERENCES `anm_kat_empfehlung` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `anm_anmeldung` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `verfahren_id` int(11) NOT NULL,
  `runde_id` int(11) NOT NULL,
  `snr` char(6) NOT NULL,
  `schueler_schul_id` varchar(64) NOT NULL,
  `vorname` varchar(120) NOT NULL,
  `nachname` varchar(120) NOT NULL,
  `adresse` varchar(255) DEFAULT NULL,
  `erzieher` varchar(255) DEFAULT NULL,
  `anmeldestatus_id` int(11) NOT NULL,
  `anmeldedatum` date DEFAULT NULL,
  `schueler_pool_id` int(11) DEFAULT NULL,
  `match_status` varchar(32) NOT NULL DEFAULT 'OFFEN',
  `match_hinweis` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_anm_anmeldung_once` (`runde_id`,`snr`,`schueler_schul_id`),
  KEY `idx_anm_anmeldung_verfahren` (`verfahren_id`),
  KEY `idx_anm_anmeldung_pool` (`schueler_pool_id`),
  CONSTRAINT `fk_anm_anmeldung_verfahren` FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_anm_anmeldung_runde` FOREIGN KEY (`runde_id`) REFERENCES `anm_runde` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_anm_anmeldung_schule` FOREIGN KEY (`snr`) REFERENCES `anm_schulen` (`snr`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_anm_anmeldung_status` FOREIGN KEY (`anmeldestatus_id`) REFERENCES `anm_kat_anmeldestatus` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_anm_anmeldung_schueler` FOREIGN KEY (`schueler_pool_id`) REFERENCES `anm_schueler_pool` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `anm_abgleich_protokoll` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `verfahren_id` int(11) NOT NULL,
  `runde_id` int(11) NOT NULL,
  `snr` char(6) NOT NULL,
  `import_typ` varchar(32) NOT NULL DEFAULT 'ANMELDUNG',
  `status_code` varchar(32) NOT NULL,
  `message` text DEFAULT NULL,
  `rows_read` int(11) NOT NULL DEFAULT 0,
  `imported_rows` int(11) NOT NULL DEFAULT 0,
  `error_rows` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_anm_abgleich_protokoll_schule` (`verfahren_id`,`runde_id`,`snr`,`created_at`),
  CONSTRAINT `fk_anm_abgleich_protokoll_verfahren` FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_anm_abgleich_protokoll_runde` FOREIGN KEY (`runde_id`) REFERENCES `anm_runde` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_anm_abgleich_protokoll_schule` FOREIGN KEY (`snr`) REFERENCES `anm_schulen` (`snr`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
