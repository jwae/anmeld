ALTER TABLE `anm_schueler`
  MODIFY COLUMN `anmeldestatus` ENUM('Neuaufnahme','Warteliste','Zugewiesen','Abgelehnt','Ohne','Zugeordnet') NOT NULL DEFAULT 'Ohne';
