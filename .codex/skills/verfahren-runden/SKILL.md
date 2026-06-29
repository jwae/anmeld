---

name: Verfahrens- und Rundenkonzept
description: Unterstützt bei Änderungen am Verfahrens- und Rundenmodell im School Admission Management System mit Vue 3, Express und MariaDB.
---------------------------------------------------------------------------------------------------------------------------------------------

# Skill: Verfahrens- und Rundenkonzept

## Ziel

Dieser Skill wird verwendet, wenn Funktionen rund um Aufnahmeverfahren, Schuljahre, Verfahrensarten, Runden, Rundenwechsel, sichtbare Verfahren oder den aktuellen Arbeitskontext umgesetzt werden.

Das System verwaltet Schulaufnahmeverfahren. Ein Verfahren gehört zu einem Schuljahr und einem Verfahrenstyp, z. B. `GS` oder `SEK1`. Innerhalb eines Verfahrens gibt es mehrere Runden.

Der aktuelle Arbeitskontext besteht immer aus:

* `verfahren_id`
* `runde_id`

## Bestehende Tabelle: anm_verfahren

Die Tabelle `anm_verfahren` existiert bereits und darf nicht neu erstellt oder blind überschrieben werden.

```sql
CREATE TABLE `anm_verfahren` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `schuljahr` varchar(20) NOT NULL,
  `bezeichnung` varchar(255) NOT NULL,
  `status` enum('Vorbereitet','In Bearbeitung','Beendet') NOT NULL DEFAULT 'Vorbereitet',
  `sichtbar` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1 = Verfahren in Standardlisten anzeigen',
  `gestartet_am` datetime DEFAULT NULL COMMENT 'Zeitpunkt des Starts des Verfahrens',
  `beendet_am` datetime DEFAULT NULL COMMENT 'Zeitpunkt der Beendigung des Verfahrens',
  `verfahrenstyp` enum('GS','SEK1') NOT NULL DEFAULT 'SEK1',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_anm_verfahren_status` (`status`),
  KEY `idx_anm_verfahren_sichtbar` (`sichtbar`),
  KEY `idx_anm_verfahren_schuljahr_typ` (`schuljahr`,`verfahrenstyp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## Felder von anm_verfahren

* `id`: Primärschlüssel
* `schuljahr`: Schuljahr, z. B. `2026_27`
* `bezeichnung`: Anzeigename des Verfahrens
* `status`: Bearbeitungszustand
* `sichtbar`: Sichtbarkeit in Standardlisten
* `gestartet_am`: Zeitpunkt des Starts
* `beendet_am`: Zeitpunkt der Beendigung
* `verfahrenstyp`: Art des Verfahrens
* `created_at`: Erstellzeitpunkt
* `updated_at`: Änderungszeitpunkt

## Statuswerte

Erlaubte Werte für `anm_verfahren.status`:

* `Vorbereitet`
* `In Bearbeitung`
* `Beendet`

Bedeutung:

* `Vorbereitet`: Verfahren ist angelegt, aber noch nicht gestartet.
* `In Bearbeitung`: Verfahren läuft aktiv.
* `Beendet`: Verfahren ist abgeschlossen.

Beim Start eines Verfahrens:

* `status = 'In Bearbeitung'`
* `gestartet_am = NOW()`, falls noch nicht gesetzt

Beim Beenden eines Verfahrens:

* `status = 'Beendet'`
* `beendet_am = NOW()`

## Verfahrenstypen

Erlaubte Werte für `anm_verfahren.verfahrenstyp`:

* `GS`
* `SEK1`

## Sichtbarkeit

* `sichtbar = 1`: Verfahren wird in Standardlisten angezeigt.
* `sichtbar = 0`: Verfahren ist ausgeblendet, aber nicht gelöscht.

Verfahren sollen nicht gelöscht werden, solange abhängige Daten existieren.

## Wichtige Regeln für Verfahren

* Ein Verfahren gehört zu genau einem Schuljahr.
* Ein Verfahren hat genau einen Verfahrenstyp.
* Es darf mehrere Verfahren pro Schuljahr und Verfahrenstyp geben.
* Kein `UNIQUE(schuljahr, verfahrenstyp)` verwenden.
* Für Anzeigezwecke immer `bezeichnung` verwenden.
* Es gibt kein Feld `name`.
* Es gibt kein Feld `aktiv`.

## Rundenkonzept

Eine Runde gehört immer zu genau einem Verfahren.

Typische Runden:

* Runde 1: Erstes Anmeldeverfahren
* Runde 2: Nachrück- oder Koordinierungsrunde
* Runde 3: Abschlussrunde

Die Rundenanzahl liegt typischerweise zwischen 1 und 3.

## Erwartete Tabelle: anm_runde

Falls die Tabelle bereits existiert, zuerst die tatsächliche Struktur prüfen.

Fachlich erwartete Felder:

* `id`
* `verfahren_id`
* `runde_nr`
* `bezeichnung` oder `name`
* `datum`
* `status` oder `aktiv`
* `created_at`
* `updated_at`

Empfohlene Regel:

```sql
UNIQUE (verfahren_id, runde_nr)
```

Jede `runde_nr` darf innerhalb eines Verfahrens nur einmal vorkommen.

## Fachliche Regeln für Runden

* Eine Runde gehört immer zu einem Verfahren.
* Eine Runde wird über `verfahren_id` mit `anm_verfahren.id` verbunden.
* Schülerdaten werden pro Verfahren und Runde geführt.
* Kapazitäten gelten pro Verfahren, nicht pro Runde.
* Der aktuelle Arbeitskontext besteht aus `verfahren_id` und `runde_id`.
* API-Abfragen zu Schülern, Importen, Abgleichen und Koordination sollen immer den Arbeitskontext berücksichtigen.

## Rundenwechsel

Beim Wechsel in die nächste Runde gilt:

1. Prüfen, ob eine nächste Runde vorhanden ist.
2. Alte Runde optional abschließen oder deaktivieren.
3. Neue Runde aktiv setzen.
4. Offene Schüler in die neue Runde übernehmen.
5. Abgeschlossene oder eindeutig aufgenommene Schüler nicht erneut übernehmen.
6. Den Wechsel über einen Dialog mit Bestätigung ausführen.
7. Nach dem Wechsel den Arbeitskontext auf neue `runde_id` setzen.

## Schülerübernahme in die nächste Runde

In die nächste Runde sollen Schüler übernommen werden, die noch koordiniert werden müssen.

Typische Kriterien:

* `anmeldestatus = 'Zuweisung'`
* `anmeldestatus = 'Warteliste'`
* offene Fälle in `anm_offener_fall`

Beim Kopieren:

* `verfahren_id` bleibt gleich.
* `runde_id` wird auf die neue Runde gesetzt.
* Stammdaten werden übernommen.
* `herkunft` bleibt erhalten.
* `abgleich_status` bleibt erhalten.
* `koordinierte_snr`, `koordiniert_am`, `koordiniert_von` können zurückgesetzt werden, wenn der Schüler erneut koordiniert werden muss.

## UI-Anforderungen

### Verfahren verwalten

Umsetzen oder berücksichtigen:

* Verfahren anlegen
* Verfahren bearbeiten
* Verfahren ausblenden über `sichtbar = 0`
* Verfahren starten
* Verfahren beenden
* Verfahren nach Schuljahr filtern
* Verfahren nach Verfahrenstyp filtern
* Verfahren nach Status filtern
* Verfahren als aktuellen Arbeitskontext auswählen

### Runden verwalten

Umsetzen oder berücksichtigen:

* Runden zu einem Verfahren anzeigen
* Runde 1 bis 3 anlegen
* aktuelle Runde auswählen
* Rundenwechsel starten
* aktuelle Runde im Frontend sichtbar anzeigen

### Arbeitskontext anzeigen

Im Frontend soll immer erkennbar sein:

* aktuelles Verfahren
* aktuelle Runde
* Schuljahr
* Verfahrenstyp
* Status des Verfahrens

## Backend-Regeln

Beim Erstellen oder Ändern von Funktionen:

* Express-Routen sauber trennen
* Controller, Service und SQL möglichst trennen
* Parameter validieren
* keine hart codierten IDs verwenden
* bei Schülerdaten immer `verfahren_id` und `runde_id` verwenden
* bestehende Verfahren und Runden nicht unkontrolliert löschen
* Statuswerte exakt so schreiben, wie sie im ENUM stehen
* keine alternativen Statuswerte erfinden

## Datenbank-Regeln

* Änderungen nur über SQL-Migrationen.
* Bestehende Tabellen immer zuerst prüfen.
* Keine vorhandene Tabelle per `CREATE TABLE` ersetzen.
* Keine Felder `name` oder `aktiv` für `anm_verfahren` verwenden.
* Stattdessen:

  * Anzeige: `bezeichnung`
  * Sichtbarkeit: `sichtbar`
  * Zustand: `status`
* Bei Änderungen an ENUM-Feldern besonders vorsichtig sein.
* MariaDB ENUM-Werte exakt übernehmen.

## Typische API-Endpunkte

Mögliche Endpunkte:

```text
GET    /api/verfahren
GET    /api/verfahren/:id
POST   /api/verfahren
PUT    /api/verfahren/:id
PATCH  /api/verfahren/:id/status
PATCH  /api/verfahren/:id/sichtbar
GET    /api/verfahren/:id/runden
POST   /api/verfahren/:id/runden
POST   /api/runden/:id/wechsel
```

## Typische Aufgaben für diesen Skill

Dieser Skill soll verwendet werden bei Aufgaben wie:

* Verfahren-Verwaltung erstellen
* Verfahrenliste bauen
* Verfahren starten
* Verfahren beenden
* Verfahren ausblenden
* Runden-Verwaltung erstellen
* aktive Runde wechseln
* Arbeitskontext speichern
* API-Endpunkte für Verfahren und Runden erstellen
* Schüler in nächste Runde übernehmen
* Rundenwechsel-Dialog bauen
* Kapazitätslogik an Verfahren koppeln
* Importfunktionen an `verfahren_id` und `runde_id` binden

## Vorgehen für Codex

Wenn dieser Skill verwendet wird:

1. Bestehende Projektstruktur prüfen.
2. Vorhandene Tabellenstruktur prüfen.
3. `AGENTS.md` beachten.
4. Keine Tabellen blind neu erstellen.
5. Keine nicht vorhandenen Felder verwenden.
6. Notwendige SQL-Migrationen separat erstellen.
7. Backend, Frontend und Datenbank konsistent anpassen.
8. Deutsche UI-Bezeichnungen verwenden.
9. Geänderte Dateien kurz auflisten.
10. Tests oder manuelle Prüfschritte angeben.
