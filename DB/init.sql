-- anmeld.anm_kat_anmeldestatus definition

CREATE TABLE `anm_kat_anmeldestatus` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  `sortierung` int(11) NOT NULL DEFAULT 0,
  `aktiv` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- anmeld.anm_kat_empfehlung definition

CREATE TABLE `anm_kat_empfehlung` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  `sortierung` int(11) NOT NULL DEFAULT 0,
  `aktiv` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- anmeld.anm_kat_fallgrund definition

CREATE TABLE `anm_kat_fallgrund` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  `sortierung` int(11) NOT NULL DEFAULT 0,
  `aktiv` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- anmeld.anm_kat_fallstatus definition

CREATE TABLE `anm_kat_fallstatus` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  `sortierung` int(11) NOT NULL DEFAULT 0,
  `aktiv` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- anmeld.anm_kat_foerderbedarf definition

CREATE TABLE `anm_kat_foerderbedarf` (
  `foerder_id` smallint(6) NOT NULL AUTO_INCREMENT,
  `asd` varchar(64) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  PRIMARY KEY (`foerder_id`),
  UNIQUE KEY `code` (`asd`)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- anmeld.anm_kat_sf definition

CREATE TABLE `anm_kat_sf` (
  `sf_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(255) NOT NULL,
  `sf` varchar(100) DEFAULT NULL,
  `sf_kurz` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`sf_id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- anmeld.anm_verfahren definition

CREATE TABLE `anm_verfahren` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `schuljahr` varchar(20) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'geplant',
  `verfahrenstyp` enum('GS','SEK1') NOT NULL DEFAULT 'SEK1',
  `sichtbar` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_anm_verfahren_schuljahr` (`schuljahr`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- anmeld.app_group definition

CREATE TABLE `app_group` (
  `group_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `group_name` varchar(50) NOT NULL,
  `group_description` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`group_id`),
  UNIQUE KEY `group_name` (`group_name`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- anmeld.app_permission definition

CREATE TABLE `app_permission` (
  `permission_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `permission_key` varchar(100) NOT NULL,
  `permission_name` varchar(150) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`permission_id`),
  UNIQUE KEY `uq_app_permission_key` (`permission_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;



-- anmeld.anm_runde definition

CREATE TABLE `anm_runde` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `verfahren_id` bigint(20) NOT NULL,
  `runden_nummer` int(11) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  `startdatum` date DEFAULT NULL,
  `enddatum` date DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'geplant',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_anm_runde_verfahren_nummer` (`verfahren_id`,`runden_nummer`),
  CONSTRAINT `fk_anm_runde_verfahren` FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- anmeld.anm_schueler_pool definition

-- anmeld.anm_schueler definition

CREATE TABLE `anm_schueler` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `verfahren_id` bigint(20) NOT NULL,
  `runde_id` bigint(20) NOT NULL,
  `schueler_id` varchar(50) NOT NULL,
  `schueler_nr` varchar(50) DEFAULT NULL,
  `quell_snr` varchar(50) DEFAULT NULL COMMENT 'Herkunftsschule / abgebende Grundschule',
  `quell_schueler_nr` varchar(50) DEFAULT NULL COMMENT 'Schueler-Nr an der Quellschule',
  `schul_nr` varchar(50) DEFAULT NULL COMMENT 'Aufnahmende Schule',
  `herkunft` enum('Pool','Anmeldung','Manuell') NOT NULL COMMENT 'Wo ist der Datensatz entstanden? Wird beim ersten Import gesetzt und dann icht mehr verändert.',
  `abgleich_status` enum('Nur Pool','Nur Anmeldung','Pool + Anm') NOT NULL,
  `anmeldestatus` enum('Neuaufnahme','Warteliste','Zugeordnet','Abgelehnt','Ohne') NOT NULL DEFAULT 'Ohne',
  `teilnahmestatus` enum('Aktiv','Wegzug','Abgemeldet','Verstorben') NOT NULL DEFAULT 'Aktiv',
  `empfehlung` varchar(50) DEFAULT NULL,
  `vorname` varchar(100) DEFAULT NULL,
  `nachname` varchar(100) DEFAULT NULL,
  `geburtsdatum` date DEFAULT NULL,
  `ef` tinyint(4) DEFAULT 0 COMMENT 'Ist das Kind in der EF?',
  `foerderbedarf` tinyint(1) NOT NULL DEFAULT 0,
  `foerder_id` smallint(6) DEFAULT NULL,
  `zieldifferent` tinyint(1) NOT NULL DEFAULT 0,
  `bemerkung` text DEFAULT NULL,
  `strasse` varchar(255) DEFAULT NULL,
  `plz` varchar(10) DEFAULT NULL,
  `ort` varchar(100) DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `geocoding_status` enum('Offen','OK','Fehler') NOT NULL DEFAULT 'Offen',
  `geocoding_fehler` text DEFAULT NULL,
  `geocoded_at` datetime DEFAULT NULL,
  `koordiniert_am` datetime DEFAULT NULL,
  `koordiniert_von` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `quell_jahrgang` varchar(10) DEFAULT NULL COMMENT 'Jahrgang an der Herkunftsschule',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_anm_schueler` (`verfahren_id`,`runde_id`,`schueler_id`,`schul_nr`),
  KEY `idx_verfahren_runde` (`verfahren_id`,`runde_id`),
  KEY `idx_schueler_id` (`schueler_id`),
  KEY `idx_schul_nr` (`schul_nr`),
  KEY `idx_abgleich_status` (`abgleich_status`),
  KEY `idx_anmeldestatus` (`anmeldestatus`),
  KEY `idx_empfehlung` (`empfehlung`),
  KEY `idx_anm_schueler_geo` (`latitude`,`longitude`),
  KEY `idx_anm_schueler_foerder_id` (`foerder_id`),
  KEY `idx_anm_schueler_quell_snr` (`quell_snr`),
  CONSTRAINT `fk_anm_schueler_empfehlung` FOREIGN KEY (`empfehlung`) REFERENCES `anm_kat_empfehlung` (`code`),
  CONSTRAINT `fk_anm_schueler_foerder` FOREIGN KEY (`foerder_id`) REFERENCES `anm_kat_foerderbedarf` (`foerder_id`),
  CONSTRAINT `fk_anm_schueler_quell_schule` FOREIGN KEY (`quell_snr`) REFERENCES `anm_schulen` (`snr`),
  CONSTRAINT `fk_anm_schueler_ziel_schule` FOREIGN KEY (`schul_nr`) REFERENCES `anm_schulen` (`snr`)
) ENGINE=InnoDB AUTO_INCREMENT=708 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- anmeld.anm_schulen definition

CREATE TABLE `anm_schulen` (
  `snr` varchar(50) NOT NULL,
  `name` varchar(255) NOT NULL,
  `plz` varchar(20) DEFAULT NULL,
  `ort` varchar(100) DEFAULT NULL,
  `strasse` varchar(255) DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `geocoding_status` enum('Offen','OK','Fehler') NOT NULL DEFAULT 'Offen',
  `geocoding_fehler` text DEFAULT NULL,
  `geocoded_at` datetime DEFAULT NULL,
  `sf_id` varchar(32) DEFAULT NULL,
  `db_host` varchar(500) DEFAULT NULL,
  `db_name` varchar(255) DEFAULT NULL,
  `db_user` varchar(255) DEFAULT NULL,
  `db_password_enc` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `last_test_at` datetime DEFAULT NULL,
  `last_test_status` varchar(50) DEFAULT NULL,
  `last_import_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`snr`),
  KEY `fk_anm_schulen_sf` (`sf_id`),
  CONSTRAINT `fk_anm_schulen_sf` FOREIGN KEY (`sf_id`) REFERENCES `anm_kat_sf` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- anmeld.app_group_permission definition

CREATE TABLE `app_group_permission` (
  `group_id` int(10) unsigned NOT NULL,
  `permission_id` int(10) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`group_id`,`permission_id`),
  KEY `fk_app_group_permission_permission` (`permission_id`),
  CONSTRAINT `fk_app_group_permission_group` FOREIGN KEY (`group_id`) REFERENCES `app_group` (`group_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_app_group_permission_permission` FOREIGN KEY (`permission_id`) REFERENCES `app_permission` (`permission_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- anmeld.app_user definition

CREATE TABLE `app_user` (
  `user_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `group_id` int(10) unsigned NOT NULL,
  `user_fullname` varchar(150) DEFAULT NULL COMMENT 'Name des Benutzers',
  `username` varchar(80) NOT NULL COMMENT 'Login Name',
  `email` varchar(255) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `last_login_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_user_group` (`group_id`),
  CONSTRAINT `fk_user_group` FOREIGN KEY (`group_id`) REFERENCES `app_group` (`group_id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- anmeld.anm_abgleich_protokoll definition

CREATE TABLE `anm_abgleich_protokoll` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `snr` varchar(50) NOT NULL,
  `runde_id` bigint(20) NOT NULL,
  `abrufzeitpunkt` datetime NOT NULL DEFAULT current_timestamp(),
  `status` varchar(50) NOT NULL,
  `anzahl_datensaetze` int(11) NOT NULL DEFAULT 0,
  `fehlermeldung` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_anm_abgleich_protokoll_snr` (`snr`),
  KEY `idx_anm_abgleich_protokoll_runde` (`runde_id`),
  CONSTRAINT `fk_anm_abgleich_protokoll_runde` FOREIGN KEY (`runde_id`) REFERENCES `anm_runde` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_anm_abgleich_protokoll_schule` FOREIGN KEY (`snr`) REFERENCES `anm_schulen` (`snr`)
) ENGINE=InnoDB AUTO_INCREMENT=90 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- anmeld.anm_kapazitaet definition

CREATE TABLE `anm_kapazitaet` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `verfahren_id` bigint(20) NOT NULL,
  `snr` varchar(50) NOT NULL,
  `jahrgang` varchar(20) NOT NULL,
  `maximale_klassen` int(11) DEFAULT NULL,
  `maximale_schueler_pro_klasse` int(11) DEFAULT NULL,
  `gesamtkapazitaet` int(11) NOT NULL DEFAULT 0,
  `reservierte_plaetze` int(11) NOT NULL DEFAULT 0,
  `bemerkung` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_anm_kapazitaet` (`verfahren_id`,`snr`,`jahrgang`),
  KEY `idx_anm_kapazitaet_snr` (`snr`),
  CONSTRAINT `fk_anm_kapazitaet_schule` FOREIGN KEY (`snr`) REFERENCES `anm_schulen` (`snr`),
  CONSTRAINT `fk_anm_kapazitaet_verfahren` FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- anmeld.anm_schueler definition

-- anmeld.anm_schueler definition

CREATE TABLE `anm_schueler` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `verfahren_id` bigint(20) NOT NULL,
  `runde_id` bigint(20) NOT NULL,
  `schueler_id` varchar(50) NOT NULL,
  `schueler_nr` varchar(50) DEFAULT NULL,
  `schul_nr` varchar(50) DEFAULT NULL,
  `herkunft` enum('Pool','Anmeldung','Manuell') NOT NULL COMMENT 'Wo ist der Datensatz entstanden? Wird beim ersten Import gesetzt und dann icht mehr verändert.',
  `abgleich_status` enum('Nur Pool','Nur Anmeldung','Pool + Anm') NOT NULL,
  `anmeldestatus` enum('Neuaufnahme','Warteliste','Zugeordnet','Abgelehnt','Ohne') NOT NULL DEFAULT 'Ohne',
  `teilnahmestatus` enum('Aktiv','Wegzug','Abgemeldet','Verstorben') NOT NULL DEFAULT 'Aktiv',
  `empfehlung` varchar(50) DEFAULT NULL,
  `vorname` varchar(100) DEFAULT NULL,
  `nachname` varchar(100) DEFAULT NULL,
  `geburtsdatum` date DEFAULT NULL,
  `foerderbedarf` tinyint(1) NOT NULL DEFAULT 0,
  `foerder_id` smallint(6) DEFAULT NULL,
  `zieldifferent` tinyint(1) NOT NULL DEFAULT 0,
  `bemerkung` text DEFAULT NULL,
  `strasse` varchar(255) DEFAULT NULL,
  `plz` varchar(10) DEFAULT NULL,
  `ort` varchar(100) DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `geocoding_status` enum('Offen','OK','Fehler') NOT NULL DEFAULT 'Offen',
  `geocoding_fehler` text DEFAULT NULL,
  `geocoded_at` datetime DEFAULT NULL,
  `koordinierte_snr` varchar(50) DEFAULT NULL COMMENT 'Wird nicht mehr verwendet. Wert steht in schul_nr',
  `koordiniert_am` datetime DEFAULT NULL,
  `koordiniert_von` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_anm_schueler` (`verfahren_id`,`runde_id`,`schueler_id`),
  KEY `idx_verfahren_runde` (`verfahren_id`,`runde_id`),
  KEY `idx_schueler_id` (`schueler_id`),
  KEY `idx_schul_nr` (`schul_nr`),
  KEY `idx_abgleich_status` (`abgleich_status`),
  KEY `idx_anmeldestatus` (`anmeldestatus`),
  KEY `idx_empfehlung` (`empfehlung`),
  KEY `idx_anm_schueler_koord_schule` (`koordinierte_snr`),
  KEY `idx_anm_schueler_geo` (`latitude`,`longitude`),
  KEY `idx_anm_schueler_foerder_id` (`foerder_id`),
  CONSTRAINT `fk_anm_schueler_empfehlung` FOREIGN KEY (`empfehlung`) REFERENCES `anm_kat_empfehlung` (`code`),
  CONSTRAINT `fk_anm_schueler_foerder` FOREIGN KEY (`foerder_id`) REFERENCES `anm_kat_foerderbedarf` (`foerder_id`),
  CONSTRAINT `fk_anm_schueler_koord_schule` FOREIGN KEY (`koordinierte_snr`) REFERENCES `anm_schulen` (`snr`)
) ENGINE=InnoDB AUTO_INCREMENT=145 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- anmeld.anm_schueler_anmeldung definition

CREATE TABLE `anm_schueler_anmeldung` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `verfahren_id` bigint(20) NOT NULL,
  `runde_id` bigint(20) NOT NULL,
  `snr` varchar(50) NOT NULL,
  `schueler_schul_id` varchar(100) NOT NULL,
  `vorname` varchar(100) NOT NULL,
  `nachname` varchar(100) NOT NULL,
  `geburtsdatum` date DEFAULT NULL,
  `foerderbedarf` tinyint(1) NOT NULL DEFAULT 0,
  `zieldifferent` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_schueler_anmeldung` (`verfahren_id`,`runde_id`,`snr`,`schueler_schul_id`),
  KEY `runde_id` (`runde_id`),
  KEY `snr` (`snr`),
  CONSTRAINT `1` FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`) ON DELETE CASCADE,
  CONSTRAINT `2` FOREIGN KEY (`runde_id`) REFERENCES `anm_runde` (`id`) ON DELETE CASCADE,
  CONSTRAINT `3` FOREIGN KEY (`snr`) REFERENCES `anm_schulen` (`snr`)
) ENGINE=InnoDB AUTO_INCREMENT=248 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- anmeld.anm_anmeldung definition

CREATE TABLE `anm_anmeldung` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `verfahren_id` bigint(20) NOT NULL,
  `runde_id` bigint(20) NOT NULL,
  `schueler_pool_id` bigint(20) DEFAULT NULL,
  `schueler_anmeldung_id` bigint(20) DEFAULT NULL,
  `snr` varchar(50) NOT NULL,
  `schueler_schul_id` varchar(100) DEFAULT NULL,
  `anmeldestatus_id` bigint(20) NOT NULL,
  `anmeldedatum` date DEFAULT NULL,
  `importiert_am` datetime NOT NULL DEFAULT current_timestamp(),
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_anm_anmeldung_runde` (`runde_id`),
  KEY `fk_anm_anmeldung_status` (`anmeldestatus_id`),
  KEY `idx_anm_anmeldung_snr` (`snr`),
  KEY `idx_anm_anmeldung_schueler_schul_id` (`schueler_schul_id`),
  KEY `idx_anm_anmeldung_schueler_pool_id` (`schueler_pool_id`),
  KEY `idx_anm_anmeldung_verfahren_runde` (`verfahren_id`,`runde_id`),
  KEY `fk_anm_anmeldung_schueler_anmeldung` (`schueler_anmeldung_id`),
  CONSTRAINT `fk_anm_anmeldung_runde` FOREIGN KEY (`runde_id`) REFERENCES `anm_runde` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_anm_anmeldung_schueler` FOREIGN KEY (`schueler_pool_id`) REFERENCES `anm_schueler_pool` (`id`),
  CONSTRAINT `fk_anm_anmeldung_schueler_anmeldung` FOREIGN KEY (`schueler_anmeldung_id`) REFERENCES `anm_schueler_anmeldung` (`id`),
  CONSTRAINT `fk_anm_anmeldung_schule` FOREIGN KEY (`snr`) REFERENCES `anm_schulen` (`snr`),
  CONSTRAINT `fk_anm_anmeldung_status` FOREIGN KEY (`anmeldestatus_id`) REFERENCES `anm_kat_anmeldestatus` (`id`),
  CONSTRAINT `fk_anm_anmeldung_verfahren` FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=126 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- anmeld.anm_merkzettel definition

CREATE TABLE `anm_merkzettel` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `verfahren_id` bigint(20) NOT NULL,
  `schueler_pool_id` bigint(20) DEFAULT NULL,
  `schueler_anmeldung_id` bigint(20) DEFAULT NULL,
  `titel` varchar(255) NOT NULL,
  `notiz` text NOT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'offen',
  `erstellt_von` varchar(100) DEFAULT NULL,
  `erledigt_am` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_anm_merkzettel_verfahren` (`verfahren_id`),
  KEY `idx_anm_merkzettel_schueler` (`schueler_pool_id`),
  KEY `fk_anm_merkzettel_schueler_anmeldung` (`schueler_anmeldung_id`),
  CONSTRAINT `fk_anm_merkzettel_schueler` FOREIGN KEY (`schueler_pool_id`) REFERENCES `anm_schueler_pool` (`id`),
  CONSTRAINT `fk_anm_merkzettel_schueler_anmeldung` FOREIGN KEY (`schueler_anmeldung_id`) REFERENCES `anm_schueler_anmeldung` (`id`),
  CONSTRAINT `fk_anm_merkzettel_verfahren` FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- anmeld.anm_offener_fall definition

CREATE TABLE `anm_offener_fall` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `verfahren_id` bigint(20) NOT NULL,
  `schueler_pool_id` bigint(20) DEFAULT NULL,
  `schueler_id` bigint(20) DEFAULT NULL,
  `schueler_anmeldung_id` bigint(20) DEFAULT NULL,
  `fallgrund_id` bigint(20) DEFAULT NULL,
  `fallstatus_id` bigint(20) NOT NULL,
  `zugewiesene_snr` varchar(50) DEFAULT NULL,
  `bemerkung` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_anm_offener_fall_grund` (`fallgrund_id`),
  KEY `fk_anm_offener_fall_status` (`fallstatus_id`),
  KEY `idx_anm_offener_fall_verfahren` (`verfahren_id`),
  KEY `idx_anm_offener_fall_schueler` (`schueler_pool_id`),
  KEY `idx_anm_offener_fall_anm_schueler` (`schueler_id`),
  KEY `idx_anm_offener_fall_zugewiesene_snr` (`zugewiesene_snr`),
  KEY `fk_anm_offener_fall_schueler_anmeldung` (`schueler_anmeldung_id`),
  CONSTRAINT `fk_anm_offener_fall_grund` FOREIGN KEY (`fallgrund_id`) REFERENCES `anm_kat_fallgrund` (`id`),
  CONSTRAINT `fk_anm_offener_fall_anm_schueler` FOREIGN KEY (`schueler_id`) REFERENCES `anm_schueler` (`id`),
  CONSTRAINT `fk_anm_offener_fall_schueler` FOREIGN KEY (`schueler_pool_id`) REFERENCES `anm_schueler_pool` (`id`),
  CONSTRAINT `fk_anm_offener_fall_schueler_anmeldung` FOREIGN KEY (`schueler_anmeldung_id`) REFERENCES `anm_schueler_anmeldung` (`id`),
  CONSTRAINT `fk_anm_offener_fall_schule` FOREIGN KEY (`zugewiesene_snr`) REFERENCES `anm_schulen` (`snr`),
  CONSTRAINT `fk_anm_offener_fall_status` FOREIGN KEY (`fallstatus_id`) REFERENCES `anm_kat_fallstatus` (`id`),
  CONSTRAINT `fk_anm_offener_fall_verfahren` FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- anmeld.anm_schueler_abgleich definition

CREATE TABLE `anm_schueler_abgleich` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `verfahren_id` bigint(20) NOT NULL,
  `runde_id` bigint(20) DEFAULT NULL,
  `schueler_pool_id` bigint(20) DEFAULT NULL,
  `schueler_anmeldung_id` bigint(20) DEFAULT NULL,
  `abgleich_status` varchar(50) NOT NULL,
  `abgleich_art` varchar(50) NOT NULL DEFAULT 'AUTOMATISCH',
  `bemerkung` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `verfahren_id` (`verfahren_id`),
  KEY `runde_id` (`runde_id`),
  KEY `schueler_pool_id` (`schueler_pool_id`),
  KEY `schueler_anmeldung_id` (`schueler_anmeldung_id`),
  CONSTRAINT `1` FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`) ON DELETE CASCADE,
  CONSTRAINT `2` FOREIGN KEY (`runde_id`) REFERENCES `anm_runde` (`id`) ON DELETE SET NULL,
  CONSTRAINT `3` FOREIGN KEY (`schueler_pool_id`) REFERENCES `anm_schueler_pool` (`id`),
  CONSTRAINT `4` FOREIGN KEY (`schueler_anmeldung_id`) REFERENCES `anm_schueler_anmeldung` (`id`),
  CONSTRAINT `CONSTRAINT_1` CHECK (`schueler_pool_id` is not null or `schueler_anmeldung_id` is not null)
) ENGINE=InnoDB AUTO_INCREMENT=31238 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE anm_schulgruppe (
    id BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    beschreibung TEXT NULL,
    aktiv TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE anm_schulgruppe_schule (
    id BIGINT NOT NULL AUTO_INCREMENT,
    schulgruppe_id BIGINT NOT NULL,
    snr VARCHAR(50) NOT NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_schulgruppe_schule (schulgruppe_id, snr),

    CONSTRAINT fk_schulgruppe_schule_gruppe
        FOREIGN KEY (schulgruppe_id)
        REFERENCES anm_schulgruppe(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_schulgruppe_schule_schule
        FOREIGN KEY (snr)
        REFERENCES anm_schulen(snr)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;


CREATE TABLE anm_verfahren_schulgruppe (
    id BIGINT NOT NULL AUTO_INCREMENT,
    verfahren_id BIGINT NOT NULL,
    schulgruppe_id BIGINT NOT NULL,
    rolle ENUM('Quellschulen', 'Zielschulen') NOT NULL,

    PRIMARY KEY (id),

    UNIQUE KEY uq_verfahren_schulgruppe_rolle (
        verfahren_id,
        rolle
    ),

    CONSTRAINT fk_verfahren_schulgruppe_verfahren
        FOREIGN KEY (verfahren_id)
        REFERENCES anm_verfahren(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_verfahren_schulgruppe_gruppe
        FOREIGN KEY (schulgruppe_id)
        REFERENCES anm_schulgruppe(id)
        ON DELETE CASCADE
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;



-- -----------------------------------------------------
-- Stammdaten / Kataloge
-- -----------------------------------------------------
SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO `app_group` VALUES
(1,'Administrator','Systemadministrator',1,'2026-03-06 17:45:14'),
(2,'Sachbearbeitung','Fachliche Bearbeitung von Anmeldeverfahren',1,'2026-03-06 17:45:14'),
(3,'Gast','Lesender Zugriff auf Anmeldeverfahren',1,'2026-03-06 17:45:14');

INSERT INTO `app_permission`
  (`permission_key`, `permission_name`, `description`, `is_active`)
VALUES
  ('verfahren.anzeigen', 'Verfahren anzeigen', 'Verfahren und zugehoerige Daten anzeigen', 1),
  ('verfahren.bearbeiten', 'Verfahren bearbeiten', 'Fachliche Daten innerhalb eines Verfahrens bearbeiten; umfasst Verfahren, Runden, Schueler, Import, Abgleich, Kapazitaeten und Koordination', 1),
  ('benutzer.bearbeiten', 'Benutzer bearbeiten', 'Benutzer verwalten', 1),
  ('gruppen.bearbeiten', 'Gruppen bearbeiten', 'Gruppen und deren Berechtigungen verwalten', 1);

INSERT INTO `app_group_permission` (`group_id`, `permission_id`)
SELECT g.`group_id`, p.`permission_id`
FROM `app_group` g
JOIN `app_permission` p ON p.`permission_key` = 'verfahren.anzeigen'
WHERE LOWER(TRIM(g.`group_name`)) = 'gast';

INSERT INTO `app_group_permission` (`group_id`, `permission_id`)
SELECT g.`group_id`, p.`permission_id`
FROM `app_group` g
JOIN `app_permission` p ON p.`permission_key` IN ('verfahren.anzeigen', 'verfahren.bearbeiten')
WHERE LOWER(TRIM(g.`group_name`)) = 'sachbearbeitung';

INSERT INTO `app_group_permission` (`group_id`, `permission_id`)
SELECT g.`group_id`, p.`permission_id`
FROM `app_group` g
JOIN `app_permission` p ON p.`permission_key` IN (
  'verfahren.anzeigen',
  'verfahren.bearbeiten',
  'benutzer.bearbeiten',
  'gruppen.bearbeiten'
)
WHERE LOWER(TRIM(g.`group_name`)) = 'administrator';

INSERT INTO `app_user` VALUES
(10,1,'Administrator','admin',NULL,'$2a$10$f96qA8oo/03zn1LKVIPtOuIGUxhhOebwsLp/jGEemF7QQLUGsRbm.',1,'2026-03-07 20:48:28','2026-05-14 12:09:41','2026-05-14 12:09:41');
