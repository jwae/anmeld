-- Entfernt die nicht mehr verwendeten Tabellen des alten Statistik-Dashboards
-- und der aufgegebenen Import-Protokollierung. anm_* und app_* bleiben erhalten.
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `school_source_import_log`;
DROP TABLE IF EXISTS `school_source_import_run`;
DROP TABLE IF EXISTS `snapshot`;
DROP TABLE IF EXISTS `snaps`;
DROP TABLE IF EXISTS `school_source_db`;
DROP TABLE IF EXISTS `school`;
DROP TABLE IF EXISTS `school_form`;
DROP TABLE IF EXISTS `class`;
DROP TABLE IF EXISTS `education_track`;
DROP TABLE IF EXISTS `nation`;
DROP TABLE IF EXISTS `religion`;
DROP TABLE IF EXISTS `sex`;
DROP TABLE IF EXISTS `term`;

SET FOREIGN_KEY_CHECKS = 1;
