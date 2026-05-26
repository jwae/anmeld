ALTER TABLE `anm_schueler_pool`
  ADD COLUMN IF NOT EXISTS `notiz` text NULL AFTER `zieldifferent`,
  ADD COLUMN IF NOT EXISTS `quelle` varchar(50) NULL AFTER `notiz`;
