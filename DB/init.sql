-- Schulanmeldungs-App: Neuinitialisierung aus dem aktuellen Sollzustand
-- Quelle: laufende MariaDB-Datenbank anmeld
-- Enthaltene Daten: anm_kat_*, anm_schulen, Berechtigungskatalog und ausschliesslich Admin aus app_user
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `anm_kat_anmeldestatus` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  `sortierung` int(11) NOT NULL DEFAULT 0,
  `aktiv` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Anmeldestatus';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `anm_kat_empfehlung` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  `sortierung` int(11) NOT NULL DEFAULT 0,
  `aktiv` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Schulformempfehlungen';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `anm_kat_fallgrund` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  `sortierung` int(11) NOT NULL DEFAULT 0,
  `aktiv` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Fallgründe';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `anm_kat_fallstatus` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  `sortierung` int(11) NOT NULL DEFAULT 0,
  `aktiv` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Fallstatus';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `anm_kat_foerderbedarf` (
  `foerder_id` smallint(6) NOT NULL AUTO_INCREMENT,
  `asd` varchar(64) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  PRIMARY KEY (`foerder_id`),
  UNIQUE KEY `code` (`asd`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Förderbedarfe';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `anm_kat_sf` (
  `sf_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(255) NOT NULL,
  `sf` varchar(100) DEFAULT NULL,
  `sf_kurz` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`sf_id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Schulformen';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `anm_schulgruppe` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `beschreibung` text DEFAULT NULL,
  `aktiv` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `anm_verfahren` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `schuljahr` varchar(20) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  `status` enum('Vorbereitet','In Bearbeitung','Beendet') NOT NULL DEFAULT 'Vorbereitet',
  `sichtbar` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1 = Verfahren in Standardlisten anzeigen',
  `gestartet_am` datetime DEFAULT NULL COMMENT 'Zeitpunkt des Starts des Verfahrens',
  `beendet_am` datetime DEFAULT NULL COMMENT 'Zeitpunkt der Beendigung des Verfahrens',
  `verfahrenstyp` enum('GS','SEK1') NOT NULL DEFAULT 'SEK1',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_anm_verfahren_status` (`status`),
  KEY `idx_anm_verfahren_sichtbar` (`sichtbar`),
  KEY `idx_anm_verfahren_schuljahr_typ` (`schuljahr`,`verfahrenstyp`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `app_group` (
  `group_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `group_name` varchar(50) NOT NULL,
  `group_description` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`group_id`),
  UNIQUE KEY `group_name` (`group_name`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `app_permission` (
  `permission_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `permission_key` varchar(100) NOT NULL,
  `permission_name` varchar(150) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`permission_id`),
  UNIQUE KEY `uq_app_permission_key` (`permission_key`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `anm_runde` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `verfahren_id` bigint(20) NOT NULL,
  `runden_nummer` int(11) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  `startdatum` date DEFAULT NULL,
  `enddatum` date DEFAULT NULL,
  `status` enum('Vorbereitet','In Bearbeitung','Beendet') NOT NULL DEFAULT 'Vorbereitet',
  `gestartet_am` datetime DEFAULT NULL COMMENT 'Zeitpunkt des Starts der Runde',
  `beendet_am` datetime DEFAULT NULL COMMENT 'Zeitpunkt der Beendigung der Runde',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_anm_runde_verfahren_nummer` (`verfahren_id`,`runden_nummer`),
  KEY `idx_anm_runde_status` (`status`),
  CONSTRAINT `fk_anm_runde_verfahren` FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=54 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `anm_schueler_pool` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `vorname` varchar(100) NOT NULL,
  `nachname` varchar(100) NOT NULL,
  `geburtsdatum` date DEFAULT NULL,
  `adresse` varchar(255) DEFAULT NULL,
  `erzieher` varchar(255) DEFAULT NULL,
  `foerderbedarf` tinyint(1) NOT NULL DEFAULT 0,
  `zieldifferent` tinyint(1) NOT NULL DEFAULT 0,
  `empfehlung_id` bigint(20) DEFAULT NULL,
  `notiz` text DEFAULT NULL,
  `quelle` varchar(50) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_anm_schueler_empfehlung` (`empfehlung_id`),
  KEY `idx_anm_schueler_name` (`nachname`,`vorname`),
  KEY `idx_anm_schueler_geburtsdatum` (`geburtsdatum`),
  CONSTRAINT `fk_anm_schueler_empfehlung` FOREIGN KEY (`empfehlung_id`) REFERENCES `anm_kat_empfehlung` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=900023 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `anm_verfahren_schulgruppe` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `verfahren_id` bigint(20) NOT NULL,
  `schulgruppe_id` bigint(20) NOT NULL,
  `rolle` enum('Quellschulen','Zielschulen') NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_verfahren_schulgruppe` (`verfahren_id`,`schulgruppe_id`,`rolle`),
  KEY `fk_verfahren_schulgruppe_gruppe` (`schulgruppe_id`),
  CONSTRAINT `fk_verfahren_schulgruppe_gruppe` FOREIGN KEY (`schulgruppe_id`) REFERENCES `anm_schulgruppe` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_verfahren_schulgruppe_verfahren` FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `app_group_permission` (
  `group_id` int(10) unsigned NOT NULL,
  `permission_id` int(10) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`group_id`,`permission_id`),
  KEY `fk_app_group_permission_permission` (`permission_id`),
  CONSTRAINT `fk_app_group_permission_group` FOREIGN KEY (`group_id`) REFERENCES `app_group` (`group_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_app_group_permission_permission` FOREIGN KEY (`permission_id`) REFERENCES `app_permission` (`permission_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=181 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `anm_schueler` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `verfahren_id` bigint(20) NOT NULL,
  `runde_id` bigint(20) NOT NULL,
  `schueler_id` varchar(50) NOT NULL,
  `schueler_nr` varchar(50) DEFAULT NULL,
  `herkunftsschule_snr` varchar(50) DEFAULT NULL COMMENT 'SNR der Herkunftsschule / abgebende Grundschule',
  `herkunftsschueler_nr` varchar(50) DEFAULT NULL COMMENT 'Schueler-Nr',
  `anmeldeschule_snr` varchar(50) DEFAULT NULL COMMENT 'SNR an der das Kind sich angemeldet hat',
  `zugewiesene_schule_snr` varchar(50) DEFAULT NULL COMMENT 'SNR der zugewiesenen Schule',
  `zugewiesen_am` datetime DEFAULT NULL COMMENT 'Datum der Zuweisung',
  `zugewiesen_von` varchar(255) DEFAULT NULL COMMENT 'Wer hat zugewiesen',
  `zugewiesen_bemerkung` text DEFAULT NULL COMMENT 'Bemerkung zu der Zuweisung',
  `herkunft` enum('Pool','Anmeldung','Manuell') NOT NULL COMMENT 'Wo ist der Datensatz entstanden? Wird beim ersten Import gesetzt und dann icht mehr verändert.',
  `erwartete_snr` varchar(50) DEFAULT NULL COMMENT 'Erwartete Schule aus vorheriger Runde / Zuweisung',
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
  UNIQUE KEY `uk_anm_schueler` (`verfahren_id`,`runde_id`,`schueler_id`),
  KEY `idx_verfahren_runde` (`verfahren_id`,`runde_id`),
  KEY `idx_schueler_id` (`schueler_id`),
  KEY `idx_schul_nr` (`anmeldeschule_snr`),
  KEY `idx_abgleich_status` (`abgleich_status`),
  KEY `idx_anmeldestatus` (`anmeldestatus`),
  KEY `idx_empfehlung` (`empfehlung`),
  KEY `idx_anm_schueler_geo` (`latitude`,`longitude`),
  KEY `idx_anm_schueler_foerder_id` (`foerder_id`),
  KEY `idx_anm_schueler_quell_snr` (`herkunftsschule_snr`),
  KEY `idx_anm_schueler_erwartete_snr` (`erwartete_snr`),
  CONSTRAINT `fk_anm_schueler_empfehlung` FOREIGN KEY (`empfehlung`) REFERENCES `anm_kat_empfehlung` (`code`),
  CONSTRAINT `fk_anm_schueler_erwartete_schule` FOREIGN KEY (`erwartete_snr`) REFERENCES `anm_schulen` (`snr`),
  CONSTRAINT `fk_anm_schueler_foerder` FOREIGN KEY (`foerder_id`) REFERENCES `anm_kat_foerderbedarf` (`foerder_id`),
  CONSTRAINT `fk_anm_schueler_quell_schule` FOREIGN KEY (`herkunftsschule_snr`) REFERENCES `anm_schulen` (`snr`),
  CONSTRAINT `fk_anm_schueler_ziel_schule` FOREIGN KEY (`anmeldeschule_snr`) REFERENCES `anm_schulen` (`snr`)
) ENGINE=InnoDB AUTO_INCREMENT=6008 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=773 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `anm_schulgruppe_schule` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `schulgruppe_id` bigint(20) NOT NULL,
  `snr` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_schulgruppe_schule` (`schulgruppe_id`,`snr`),
  KEY `fk_schulgruppe_schule_schule` (`snr`),
  CONSTRAINT `fk_schulgruppe_schule_gruppe` FOREIGN KEY (`schulgruppe_id`) REFERENCES `anm_schulgruppe` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_schulgruppe_schule_schule` FOREIGN KEY (`snr`) REFERENCES `anm_schulen` (`snr`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `anm_verfahren_schule` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `verfahren_id` bigint(20) NOT NULL,
  `snr` varchar(50) NOT NULL,
  `aktiv` tinyint(1) NOT NULL DEFAULT 1,
  `bemerkung` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_anm_verfahren_schule` (`verfahren_id`,`snr`),
  KEY `fk_anm_verfahren_schule_schule` (`snr`),
  CONSTRAINT `fk_anm_verfahren_schule_schule` FOREIGN KEY (`snr`) REFERENCES `anm_schulen` (`snr`),
  CONSTRAINT `fk_anm_verfahren_schule_verfahren` FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=651 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
  KEY `idx_anm_offener_fall_zugewiesene_snr` (`zugewiesene_snr`),
  KEY `fk_anm_offener_fall_schueler_anmeldung` (`schueler_anmeldung_id`),
  KEY `idx_anm_offener_fall_anm_schueler` (`schueler_id`),
  CONSTRAINT `fk_anm_offener_fall_anm_schueler` FOREIGN KEY (`schueler_id`) REFERENCES `anm_schueler` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_anm_offener_fall_grund` FOREIGN KEY (`fallgrund_id`) REFERENCES `anm_kat_fallgrund` (`id`),
  CONSTRAINT `fk_anm_offener_fall_schueler` FOREIGN KEY (`schueler_pool_id`) REFERENCES `anm_schueler_pool` (`id`),
  CONSTRAINT `fk_anm_offener_fall_schueler_anmeldung` FOREIGN KEY (`schueler_anmeldung_id`) REFERENCES `anm_schueler_anmeldung` (`id`),
  CONSTRAINT `fk_anm_offener_fall_schule` FOREIGN KEY (`zugewiesene_snr`) REFERENCES `anm_schulen` (`snr`),
  CONSTRAINT `fk_anm_offener_fall_status` FOREIGN KEY (`fallstatus_id`) REFERENCES `anm_kat_fallstatus` (`id`),
  CONSTRAINT `fk_anm_offener_fall_verfahren` FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=58 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=72445 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

-- Stamm- und Katalogdaten
SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
INSERT INTO `app_group` (`group_id`, `group_name`, `group_description`, `is_active`, `created_at`) VALUES (1,'Administrator','Systemadministrator',1,'2026-03-06 17:45:14'),
(17,'Sachbearbeitung','Fachliche Bearbeitung von Anmeldeverfahren',1,'2026-08-22 12:16:21'),
(18,'Gast','Lesender Zugriff auf Anmeldeverfahren',1,'2026-08-22 12:16:21');
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;
SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
INSERT INTO `app_permission` (`permission_id`, `permission_key`, `permission_name`, `description`, `is_active`, `created_at`) VALUES (1,'verfahren.anzeigen','Verfahren anzeigen','Verfahren und zugehoerige Daten anzeigen',1,'2026-08-22 12:16:21'),
(2,'verfahren.bearbeiten','Verfahren bearbeiten','Fachliche Daten innerhalb eines Verfahrens bearbeiten; umfasst Verfahren, Runden, Schueler, Import, Abgleich, Kapazitaeten und Koordination',1,'2026-08-22 12:16:21'),
(3,'benutzer.bearbeiten','Benutzer bearbeiten','Benutzer verwalten',1,'2026-08-22 12:16:21'),
(4,'gruppen.bearbeiten','Gruppen bearbeiten','Gruppen und deren Berechtigungen verwalten',1,'2026-08-22 12:16:21');
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;
SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
INSERT INTO `anm_kat_anmeldestatus` (`id`, `code`, `bezeichnung`, `sortierung`, `aktiv`) VALUES (1,'NEUAUFNAHME','Neuaufnahme',1,1),
(2,'WARTELISTE','Warteliste',2,1),
(3,'ABGELEHNT','Abgelehnt',3,1),
(7,'OHNE','Ohne',4,1),
(12,'ZUGEORDNET','Zugeordnet',5,1);
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;
SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
INSERT INTO `anm_kat_empfehlung` (`id`, `code`, `bezeichnung`, `sortierung`, `aktiv`) VALUES (1,'HS','Hauptschule',1,1),
(2,'RS','Realschule',2,1),
(3,'GY','Gymnasium',3,1),
(4,'KEINE','Keine Empfehlung',4,1),
(5,'HS_RS','Hauptschule / Realschule',5,1),
(6,'RS_GY','Realschule / Gymnasium',6,1);
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;
SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
INSERT INTO `anm_kat_fallgrund` (`id`, `code`, `bezeichnung`, `sortierung`, `aktiv`) VALUES (1,'KEINE_ANMELDUNG','Keine Anmeldung',1,1),
(2,'WARTELISTE','Warteliste',2,1),
(3,'ABLEHNUNG','Ablehnung',3,1),
(4,'ZUZUG','Zuzug',4,1),
(5,'DUBLETTE','Dublette',5,1),
(6,'UNKLAR','Unklar',6,1),
(13,'NEUAUFNAHME','Neuaufnahme',7,1),
(17,'ANMELDEFEHLER','Kind wurde nicht an zugewiesener Schule angemeldet!',8,1),
(18,'STAMMDATEN_ABWEICHUNG','Stammdaten weichen von den vorhandenen Eingaben ab.',9,1),
(19,'SCHULE_ABWEICHEND','Anmeldung abweichend von zugeordneter Schule aus vorheriger Runde.',10,1),
(20,'HERKUNFTSFEHLER','Ungültige oder nicht zuordenbare Herkunftsschule.',11,1);
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;
SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
INSERT INTO `anm_kat_fallstatus` (`id`, `code`, `bezeichnung`, `sortierung`, `aktiv`) VALUES (1,'OFFEN','Offen',1,1),
(2,'IN_BEARBEITUNG','In Bearbeitung',2,1),
(3,'ZUGEORDNET','Zugeordnet',3,1),
(4,'ERLEDIGT','Erledigt',4,1);
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;
SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
INSERT INTO `anm_kat_foerderbedarf` (`foerder_id`, `asd`, `bezeichnung`) VALUES (12,'GH','Hören und Kommunikation (Gehörlose)'),
(13,'KB','Körperliche und motorische Entwicklung'),
(14,'LB','Lernen'),
(15,'SH','Sehen (Sehbehinderte)'),
(16,'EZ','Emotionale und soziale Entwicklung'),
(17,'SB','Sprache'),
(18,'NEIN','kein Förderschwerpunkt'),
(19,'BL','Sehen (Blinde)'),
(20,'GB','Geistige Entwicklung'),
(21,'SG','Hören und Kommunikation (schwerhörige)');
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;
SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
INSERT INTO `anm_kat_sf` (`sf_id`, `code`, `name`, `sf`, `sf_kurz`) VALUES (1,'02','Grundschule','G','GS'),
(2,'04','Hauptschule','H','HS'),
(3,'06','Volksschule','V','VS'),
(4,'08','Förderschule','S','FÖ'),
(5,'10','Realschule','R','RS'),
(6,'13','Primusschule','PS','PS'),
(7,'14','Sekundarschule','SK','SK'),
(8,'15','Gesamtschule','GE','GE'),
(9,'16','Gemeinschaftsschule','GM','GM'),
(10,'17','Freie Waldorfschule','FW','FW'),
(11,'18','Hiberniaschule','FW','FW'),
(12,'19','Freie Waldorfförderschule','FW','FW'),
(13,'20','Gymnasium','GY','GY'),
(14,'25','Weiterbildungskolleg','WB','WB'),
(15,'30','Berufskolleg','BK','BK'),
(16,'83','Schule für Kranke','S','S'),
(17,'85','Förderschule im Bereich Realschule','SR','SR'),
(18,'87','Förderschule im Bereich Gymnasium','SG','SG'),
(19,'88','Förderschule im Bereich Berufskolleg','SB','SB');
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;
SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
INSERT INTO `anm_schulen` (`snr`, `name`, `plz`, `ort`, `strasse`, `latitude`, `longitude`, `geocoding_status`, `geocoding_fehler`, `geocoded_at`, `sf_id`, `db_host`, `db_name`, `db_user`, `db_password_enc`, `is_active`, `last_test_at`, `last_test_status`, `last_import_at`, `created_at`, `updated_at`) VALUES ('100052','Comenius-Gesamtschule','41464','Neuss','Weberstr. 90a',51.18335950,6.69103190,'OK',NULL,NULL,'15','https://localhorst','GS3_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-06-06 12:12:12'),
('100128','Grundschule Vulkanstraße','47807','Krefeld','Vulkanstr. 264',51.30828340,6.55666080,'OK',NULL,NULL,'02','https://localhost','GS2_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:25:46','2026-06-06 12:12:12'),
('100137','Kompass-Grundschule','47799','Krefeld','Felbelstr. 24-28',51.33609540,6.56821870,'OK',NULL,NULL,'02','https://localhost','GS_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-06-06 12:12:12'),
('100157','Grundschule Westparkstraße','47798','Krefeld','Hofstr. 45',51.33886110,6.55380050,'OK',NULL,NULL,'02','https://localhost','GS3_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-06-06 12:12:12'),
('100223','Grundschule Am Ringerberg','41068','Mönchengladbach','Am Ringerberg 11',51.19841330,6.41359370,'OK',NULL,NULL,'02','https://localhost','GS_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-06-12 08:05:27'),
('100226','Grundschule Wilhelm-Strauß-Straße','41236','Mönchengladbach','Wilhelm-Strauß-Str. 94',51.16804180,6.45319580,'OK',NULL,NULL,'02','https://localhost','GS3_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-07-06 12:36:22'),
('102880','Schule an Haus Rath','47829','Krefeld','Neukirchener Str. 1-3',51.37035850,6.61705180,'OK',NULL,NULL,'02','https://localhost','GS_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-06-06 12:12:12'),
('102891','Edith-Stein-Schule','47829','Krefeld','Traarer Str. 105',51.35741310,6.63424580,'OK',NULL,NULL,'02','https://localhost','GS2_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-06-06 12:12:12'),
('102908','Sollbrüggenschule','47800','Krefeld','Sollbrüggenstr. 81',51.34666740,6.61266070,'OK',NULL,NULL,'02','https://localhost','GS_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-06-06 12:12:12'),
('102921','Grundschule Königshof','47807','Krefeld','Oberbruchstr. 87',51.31596210,6.59069230,'OK',NULL,NULL,'02','https://localhost','GS2_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-06-12 08:04:57'),
('102945','Josefschule','47798','Krefeld','An der Josefkirche 1-2',51.32750510,6.55705980,'OK',NULL,NULL,'02','https://localhost','durs','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-05-29 19:11:01'),
('102957','St. Michael Schule','47804','Krefeld','Gießerpfad 2-10',51.31987760,6.53601590,'OK',NULL,NULL,'02','https://localhost','RS_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-06-06 12:12:12'),
('102970','Schönwasserschule','47809','Krefeld','Thielenstr. 40',51.33194460,6.61078330,'OK',NULL,NULL,'02','https://localhost','RS_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-06-06 12:12:12'),
('102982','Johansenschule','47809','Krefeld','Kohlplatzweg 25',51.33801860,6.64674840,'OK',NULL,NULL,'02','https://localhost','RS3_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-05-29 19:11:01'),
('102994','Jahnschule','47803','Krefeld','Girmesdyk 17-19',51.34521220,6.55262960,'OK',NULL,NULL,'02','https://localhost','RS2_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-05-29 19:11:01'),
('103020','Mosaikschule','47798','Krefeld','Prinz-Ferdinand-Str. 155',51.33327570,6.55134930,'OK',NULL,NULL,'02','https://localhost','RS_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-05-29 19:11:01'),
('103068','Grundschule am Stadtpark Fischeln','47807','Krefeld','Wimmersweg 21',51.30453030,6.58171260,'OK',NULL,NULL,'02','https://localhost','RS3_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-06-06 12:12:12'),
('103070','Mariannenschule','47799','Krefeld','Mariannenstr. 97-107',51.33228320,6.56972250,'OK',NULL,NULL,'02','https://localhost','RS2_2025_26','Admin','',1,NULL,NULL,NULL,'2026-05-24 22:24:58','2026-05-29 19:11:01'),
('159529','Diedrich-Uhlhorn','41516','Grevenbroich','Heyerweg 12',51.10100000,6.62229200,'Offen',NULL,NULL,'10','https://localhost','durs','Admin','',1,NULL,NULL,NULL,'2026-06-11 23:21:51','2026-06-28 13:03:57'),
('184688','Franz-Meyers-Gymnasium','41238','Mönchengladbach','Asternweg 1',51.15723600,6.48620600,'Offen',NULL,NULL,'20','https://localhost','durs','Admin','',1,NULL,NULL,NULL,'2026-06-04 16:59:11','2026-06-06 20:37:31'),
('189145','Städtische Gesamtschule Espenstraße','41239','Mönchengladbach','Espenstr. 21',51.15399800,6.42798400,'Offen',NULL,NULL,'15','https://localhost','durs','Admin','',1,NULL,NULL,NULL,'2026-06-04 16:59:11','2026-06-06 20:37:35'),
('189832','Gesamtschule Volksgarten','41065','Mönchengladbach','Volksgartenstr. 71-75',51.19126900,6.45444100,'Offen',NULL,NULL,'15','https://localhost','durs','Admin','',1,NULL,NULL,NULL,'2026-06-04 16:59:11','2026-06-06 20:37:35'),
('190998','Gesamtschule Hardt','41169','Mönchengladbach','Vossenbäumchen 50',51.19934400,6.34845100,'Offen',NULL,NULL,'15','https://localhost','durs','Admin','',1,NULL,NULL,NULL,'2026-06-04 16:59:11','2026-06-06 20:37:31'),
('193355','Gesamtschule Rheydt-Mülfort','41238','Mönchengladbach','Realschulstr. 14',51.15269600,6.45670200,'Offen',NULL,NULL,'15','https://localhost','durs','Admin','',1,NULL,NULL,NULL,'2026-06-04 16:59:11','2026-06-06 20:37:31'),
('194864','Hans-Jonas-Gesamtschule Neuwerk','41066','Mönchengladbach','Nespelerstr. 75',51.22073700,6.46665800,'Offen',NULL,NULL,'15','https://localhost','RS3_2025_26','Admin','',1,NULL,NULL,NULL,'2026-06-04 16:59:11','2026-07-06 14:28:57'),
('196186','Theo-Hespers-Gesamtschule','41068','Mönchengladbach','Karl-Fegers-Str. 85',51.20130400,6.40824100,'Offen',NULL,NULL,'15','https://localhost','durs','Admin','',1,NULL,NULL,NULL,'2026-06-04 16:59:11','2026-06-06 20:37:35');
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;
SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
INSERT INTO `app_group_permission` (`group_id`, `permission_id`, `created_at`) VALUES (1,1,'2026-08-22 12:16:21'),
(1,2,'2026-08-22 12:16:21'),
(1,3,'2026-08-22 12:16:21'),
(1,4,'2026-08-22 12:16:21'),
(17,1,'2026-08-22 12:16:21'),
(17,2,'2026-08-22 12:16:21'),
(18,1,'2026-08-22 12:16:21');
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

-- Ausschliesslich der Administrator
SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
INSERT INTO `app_user` (`user_id`, `group_id`, `user_fullname`, `username`, `email`, `password_hash`, `is_active`, `created_at`, `updated_at`, `last_login_at`) VALUES (10,1,'Administrator','admin',NULL,'$2a$10$ggfgty5dK9nFDjbOxDljsuyUXeKhthXo3Pw93DvsQkSWjyjDTEZua',1,'2026-03-07 20:48:28','2026-08-22 13:08:45','2026-08-22 13:08:45');
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;
