# Schulanmeldungs-App

Die Schulanmeldungs-App unterstützt die Durchführung und Koordination von Schulaufnahmeverfahren. Ein **Verfahren** bildet dabei den gesamten Aufnahmeprozess eines Schuljahres ab und umfasst beteiligte Schulen, Schülerdaten, Kapazitäten, Importe, Abgleich und Koordination.

Ein Verfahren kann aus mehreren **Runden** bestehen. Ein Schüler wird innerhalb eines Verfahrens nur einmal geführt; rundenbezogene Informationen wie Anmeldungsschule, Anmeldestatus, Abgleichstatus oder koordinierte Schule werden getrennt je Runde gespeichert.

Zu Beginn werden Verfahren, Schulen und Kapazitäten eingerichtet und anschließend die Schülerpooldaten importiert. Externe Schüler-IDs werden – sofern vorhanden – mit ihrer Datenquelle gespeichert.

Nach den Anmeldungen werden die Schulmeldungen importiert und mit dem vorhandenen Pool abgeglichen. Vorhandene Schüler werden über externe IDs oder ersatzweise über **Vorname + Nachname + Geburtsdatum** erkannt. Nicht gefundene Schüler werden neu angelegt, nicht eindeutig zuordenbare Datensätze als Fehler ausgewiesen.

Offene Fälle können anschließend koordiniert werden. Falls erforderlich, wird eine weitere Runde gestartet; dabei bleibt der Schülerdatensatz erhalten und nur ein neuer Rundenzustand wird angelegt. Nach Abschluss stehen die Daten weiterhin für Auswertungen zur Verfügung.

## Technische Basis

* Frontend: Vue 3 mit Axios
* Backend: Node.js mit Express
* Datenbank: MariaDB / MySQL
* Deployment: Docker und Docker Compose
* Webserver für das Frontend: Nginx
* Versionsverwaltung und Distribution: Git / GitHub
* Datenbankänderungen: versionierte SQL-Migrationen
