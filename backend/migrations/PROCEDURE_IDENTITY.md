# Verfahrensgebundene Schueleridentitaet

Ein Kind hat je Verfahren einen eigenen Datensatz in `anm_schueler`. Alle Runden
dieses Verfahrens verwenden dessen interne ID. Externe IDs sind eindeutig innerhalb
von `(verfahren_id, herkunft_art, herkunft_snr_norm, externe_id)`.

## Bestehende Installation umstellen

1. Importzugriffe pausieren und Schema sowie Daten sichern.
2. Migration `029_scope_external_identity_to_procedure.sql` einmal ausfuehren.
   Sie uebernimmt das Verfahren jeder vorhandenen externen ID aus deren Schueler.
3. Den aktualisierten Backendcode bereitstellen. Alle Identitaetssuchen und
   Zuordnungen verlangen jetzt ein Verfahren. Fuer Rundeneintraege wird die
   Zusammengehoerigkeit von Schueler, Runde und Verfahren geprueft.
4. Bestehende Fremdzuordnungen anhand der Originaldatei reparieren. Fuer zentrale
   Pool-/EWO-IDs mit den Spalten `id;vorname;nachname;geburtsdatum;strasse;plz;ort`:

   ```powershell
   node scripts/repair-pool-procedure.js '<Originaldatei>' <Verfahren> <Runde> POOL
   ```

   Standard ist ein Probelauf mit Rollback. Erst nach erfolgreicher Pruefung mit
   `--apply` ausfuehren. Das Skript verwendet den CSV-Parser und Importcontroller,
   erhaelt die vorhandenen Rundeneintraege und verknuepft diese mit eigenen
   Schuelerdatensaetzen. Fremde offene Faelle oder uneindeutige Daten fuehren zum
   Abbruch. Vorherige Stammdaten anderer Verfahren werden nicht rekonstruiert.
5. Migration `030_enforce_round_procedure_identity.sql` einmal ausfuehren.
   Bestehende inkonsistente Rundeneintraege verhindern die Aktivierung der
   zusammengesetzten Fremdschluessel und muessen zuvor bereinigt sein.
6. `npm test` und `npm run verify:procedure-identity` ausfuehren. Die DB-Pruefung
   benoetigt zwei Verfahren mit Runden und rollt alle Testdaten zurueck.
7. Backend neu starten und Importzugriffe wieder aufnehmen.

MariaDB-DDL ist nicht transaktional. Bei einem Migrationsfehler den erreichten
Schemazustand pruefen, bevor einzelne Schritte fortgesetzt werden. Migrationen
nicht blind erneut ausfuehren. `DB/init.sql` enthaelt bereits den neuen Zustand
fuer Neuinstallationen; dort 029/030 nicht nochmals anwenden.
