ALTER TABLE `anm_verfahren`
ADD COLUMN `verfahrenstyp` ENUM('GS', 'SEK1') NOT NULL DEFAULT 'GS'
AFTER `bezeichnung`;
