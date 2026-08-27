CREATE TABLE `anm_kat_quelle` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  `sortierung` int(11) NOT NULL DEFAULT 0,
  `aktiv` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_anm_kat_quelle_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Arten externer Quellen von Schüleridentitäten';

INSERT INTO `anm_kat_quelle` (`code`, `bezeichnung`, `sortierung`, `aktiv`)
VALUES
  ('POOL', 'Pool', 10, 1),
  ('SCHULE', 'Schule', 20, 1),
  ('EWO', 'Einwohnermeldewesen', 30, 1),
  ('SCHILD', 'Schild', 40, 1),
  ('SCHUELER_ONLINE', 'Schüler Online', 50, 1),
  ('KITA', 'Kindertagesstätte', 60, 1),
  ('SONST', 'Sonstige Quelle', 70, 1);

CREATE TABLE `anm_schueler_externe_id` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `schueler_id` bigint(20) NOT NULL,
  `herkunft_art` bigint(20) NOT NULL,
  `herkunft_snr` varchar(50) DEFAULT NULL,
  `externe_id` varchar(255) NOT NULL,
  `herkunft_snr_norm` varchar(50)
    GENERATED ALWAYS AS (IFNULL(NULLIF(TRIM(`herkunft_snr`), ''), '')) STORED,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_anm_schueler_externe_identitaet`
    (`herkunft_art`, `herkunft_snr_norm`, `externe_id`),
  KEY `idx_anm_schueler_externe_id_schueler` (`schueler_id`),
  CONSTRAINT `fk_anm_schueler_externe_id_schueler`
    FOREIGN KEY (`schueler_id`) REFERENCES `anm_schueler` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_anm_schueler_externe_id_quelle`
    FOREIGN KEY (`herkunft_art`) REFERENCES `anm_kat_quelle` (`id`)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Externe Identitäten eines Schülers';

CREATE TABLE `anm_schueler_runde` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `schueler_id` bigint(20) NOT NULL,
  `runde_id` bigint(20) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_anm_schueler_runde` (`schueler_id`, `runde_id`),
  KEY `idx_anm_schueler_runde_runde` (`runde_id`),
  CONSTRAINT `fk_anm_schueler_runde_schueler`
    FOREIGN KEY (`schueler_id`) REFERENCES `anm_schueler` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_anm_schueler_runde_runde`
    FOREIGN KEY (`runde_id`) REFERENCES `anm_runde` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Rundenabhängige Eigenschaften eines Schülers';
