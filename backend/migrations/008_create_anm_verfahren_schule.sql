CREATE TABLE IF NOT EXISTS `anm_verfahren_schule` (
  `verfahren_id` int(11) NOT NULL,
  `snr` char(6) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`verfahren_id`, `snr`),
  KEY `idx_anm_verfahren_schule_snr` (`snr`),
  CONSTRAINT `fk_anm_verfahren_schule_verfahren`
    FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_anm_verfahren_schule_schule`
    FOREIGN KEY (`snr`) REFERENCES `anm_schulen` (`snr`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
