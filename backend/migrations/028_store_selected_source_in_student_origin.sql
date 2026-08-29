ALTER TABLE `anm_schueler`
  MODIFY COLUMN `herkunft` varchar(50) NOT NULL
  COMMENT 'Aktuelle fachliche Herkunft des Datensatzes; Importe speichern den ausgewaehlten Quellen-Code.';
