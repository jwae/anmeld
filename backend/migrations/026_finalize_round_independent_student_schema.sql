ALTER TABLE `anm_schueler_externe_id`
  DROP FOREIGN KEY `fk_anm_schueler_externe_id_quelle`,
  DROP INDEX `uq_anm_schueler_externe_identitaet`,
  MODIFY COLUMN `herkunft_art` varchar(50) NOT NULL,
  MODIFY COLUMN `externe_id` varchar(50) NOT NULL;

ALTER TABLE `anm_schueler_externe_id`
  ADD UNIQUE KEY `uq_anm_schueler_externe_identitaet`
    (`herkunft_art`, `herkunft_snr_norm`, `externe_id`),
  ADD CONSTRAINT `fk_anm_schueler_externe_id_quelle`
    FOREIGN KEY (`herkunft_art`) REFERENCES `anm_kat_quelle` (`code`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `anm_schueler`
  DROP FOREIGN KEY `fk_anm_schueler_erwartete_schule`,
  DROP FOREIGN KEY `fk_anm_schueler_ziel_schule`,
  DROP INDEX `uk_anm_schueler`,
  DROP INDEX `idx_verfahren_runde`,
  DROP INDEX `idx_schul_nr`,
  DROP INDEX `idx_abgleich_status`,
  DROP INDEX `idx_anmeldestatus`,
  DROP INDEX `idx_anm_schueler_erwartete_snr`,
  MODIFY COLUMN `schueler_id` varchar(50) DEFAULT NULL,
  CHANGE COLUMN `bemerkung` `notiz` text DEFAULT NULL COMMENT 'Allgemeine Notiz zum Kind',
  DROP COLUMN `runde_id`,
  DROP COLUMN `schueler_nr`,
  DROP COLUMN `herkunftsschueler_nr`,
  DROP COLUMN `anmeldeschule_snr`,
  DROP COLUMN `zugewiesene_schule_snr`,
  DROP COLUMN `zugewiesen_am`,
  DROP COLUMN `zugewiesen_von`,
  DROP COLUMN `zugewiesen_bemerkung`,
  DROP COLUMN `erwartete_snr`,
  DROP COLUMN `abgleich_status`,
  DROP COLUMN `anmeldestatus`,
  DROP COLUMN `teilnahmestatus`,
  DROP COLUMN `koordiniert_am`,
  DROP COLUMN `koordiniert_von`,
  ADD UNIQUE KEY `uq_anm_schueler_verfahren_legacy_id` (`verfahren_id`, `schueler_id`),
  ADD CONSTRAINT `fk_anm_schueler_verfahren`
    FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `anm_schueler_runde`
  ADD COLUMN `verfahren_id` bigint(20) NOT NULL AFTER `id`,
  ADD COLUMN `anmeldestatus`
    enum('Neuaufnahme','Warteliste','Zugeordnet','Abgelehnt','Ohne')
    NOT NULL DEFAULT 'Ohne'
    COMMENT 'Beschreibt den aktuellen Status der Anmeldung an einer Schule.'
    AFTER `runde_id`,
  ADD COLUMN `teilnahmestatus`
    enum('Aktiv','Wegzug','Abgemeldet','Verstorben')
    NOT NULL DEFAULT 'Aktiv'
    AFTER `anmeldestatus`,
  ADD COLUMN `schul_nr` varchar(50) DEFAULT NULL
    COMMENT 'Schule, an der der Schüler in dieser Runde angemeldet ist'
    AFTER `teilnahmestatus`,
  ADD COLUMN `koordinierte_snr` varchar(50) DEFAULT NULL
    COMMENT 'Schule, der der Schüler im Rahmen der Koordination zugewiesen wurde'
    AFTER `schul_nr`,
  ADD COLUMN `koordiniert_am` datetime DEFAULT NULL AFTER `koordinierte_snr`,
  ADD COLUMN `koordiniert_von` varchar(100) DEFAULT NULL AFTER `koordiniert_am`,
  ADD COLUMN `abgleich_status`
    enum('Nur Pool','Nur Anmeldung','Pool + Anm')
    NOT NULL
    COMMENT 'Aus welchen Importquellen der Schüler in der aktuellen Runde bekannt ist.'
    AFTER `koordiniert_von`,
  ADD KEY `idx_anm_schueler_runde_verfahren` (`verfahren_id`),
  ADD KEY `idx_anm_schueler_runde_schueler` (`schueler_id`),
  ADD KEY `idx_anm_schueler_runde_schul_nr` (`schul_nr`),
  ADD KEY `idx_anm_schueler_runde_koordinierte_snr` (`koordinierte_snr`),
  DROP INDEX `uq_anm_schueler_runde`,
  ADD UNIQUE KEY `uq_anm_schueler_runde`
    (`verfahren_id`, `schueler_id`, `runde_id`),
  ADD CONSTRAINT `fk_anm_schueler_runde_verfahren`
    FOREIGN KEY (`verfahren_id`) REFERENCES `anm_verfahren` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_anm_schueler_runde_schul_nr`
    FOREIGN KEY (`schul_nr`) REFERENCES `anm_schulen` (`snr`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_anm_schueler_runde_koordinierte_snr`
    FOREIGN KEY (`koordinierte_snr`) REFERENCES `anm_schulen` (`snr`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
