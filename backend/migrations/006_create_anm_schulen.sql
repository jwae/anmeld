CREATE TABLE IF NOT EXISTS `anm_schulen` (
  `snr` char(6) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `plz` varchar(20) DEFAULT NULL,
  `ort` varchar(100) DEFAULT NULL,
  `strasse` varchar(255) DEFAULT NULL,
  `sf_id` varchar(32) DEFAULT NULL,
  `db_host` varchar(255) DEFAULT NULL,
  `db_name` varchar(255) DEFAULT NULL,
  `db_user` varchar(255) DEFAULT NULL,
  `db_password_enc` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`snr`),
  KEY `idx_anm_schulen_is_active` (`is_active`),
  KEY `idx_anm_schulen_sf_id` (`sf_id`),
  CONSTRAINT `fk_anm_schulen_sf` FOREIGN KEY (`sf_id`) REFERENCES `anm_kat_sf` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
