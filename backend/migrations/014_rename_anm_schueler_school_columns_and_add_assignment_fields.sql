ALTER TABLE `anm_schueler`
  CHANGE COLUMN `quell_snr` `herkunftsschule_snr` varchar(50) DEFAULT NULL COMMENT 'SNR der Herkunftsschule / abgebende Grundschule',
  CHANGE COLUMN `quell_schueler_nr` `herkunftsschueler_nr` varchar(50) DEFAULT NULL COMMENT 'Schueler-Nr',
  CHANGE COLUMN `schul_nr` `anmeldeschule_snr` varchar(50) DEFAULT NULL COMMENT 'SNR an der das Kind sich angemeldet hat',
  ADD COLUMN `zugewiesene_schule_snr` varchar(50) DEFAULT NULL COMMENT 'SNR der zugewiesenen Schule' AFTER `anmeldeschule_snr`,
  ADD COLUMN `zugewiesen_am` datetime DEFAULT NULL COMMENT 'Datum der Zuweisung' AFTER `zugewiesene_schule_snr`,
  ADD COLUMN `zugewiesen_von` varchar(255) DEFAULT NULL COMMENT 'Wer hat zugewiesen' AFTER `zugewiesen_am`,
  ADD COLUMN `zugewiesen_bemerkung` text DEFAULT NULL COMMENT 'Bemerkung zu der Zuweisung' AFTER `zugewiesen_von`;
