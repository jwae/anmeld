# Schulanmeldungs-App

Die Schulanmeldungs-App unterstützt die Durchführung und Koordination von Schulanmeldungen. Ein **Verfahren** bildet dabei den gesamten Aufnahmeprozess ab und umfasst beteiligte Schulen, Schülerdaten, Kapazitäten, Importe, Abgleich und Koordination.

Ein Verfahren kann aus mehreren **Runden** bestehen. Rundenbezogene Informationen wie Anmeldungsschule, Anmeldestatus, Abgleichstatus oder koordinierte Schule werden getrennt je Runde gespeichert.

Zu Beginn werden Verfahren, Schulen und Kapazitäten eingerichtet und anschließend die Schülerpooldaten importiert. Externe Schüler-IDs werden – sofern vorhanden – mit ihrer Datenquelle gespeichert.

Anschließend werden die Rückmeldungen der Schulen importiert oder direkt über Schild3-API abgerufen (sofern eingerichtet) und mit dem vorhandenen Pool abgeglichen. Vorhandene Schüler werden über externe IDs oder über **Vorname + Nachname + Geburtsdatum** erkannt. Nicht gefundene Schüler werden neu angelegt, nicht eindeutig zuordenbare Datensätze als Fehler ausgewiesen.

Offene Fälle können anschließend koordiniert werden. Falls erforderlich, wird eine weitere Runde gestartet. Nach Abschluss stehen die Daten für Auswertungen zur Verfügung oder können als csv exportiert werden.

## Technische Basis

* Frontend: Vue 3 mit Axios
* Backend: Node.js mit Express
* Datenbank: MariaDB / MySQL
* Deployment: Docker und Docker Compose
* Webserver für das Frontend: Nginx
* Versionsverwaltung und Distribution: Git / GitHub
* Datenbankänderungen: versionierte SQL-Migrationen
