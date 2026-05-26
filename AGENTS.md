# Projekt: Schulanmeldeverfahren

## Ziel des Projekts

Die Anwendung verwaltet zentral das schulische Anmeldeverfahren eines Schulamts.

Die App:
- verwaltet Anmeldeverfahren und Anmelderunden
- ruft Anmeldedaten der Schulen automatisiert ab
- gleicht Anmeldungen mit offenen Versorgungsfällen ab
- erkennt fehlende oder doppelte Anmeldungen
- verwaltet Wartelisten
- unterstützt die Zuordnung nicht versorgter Kinder
- berücksichtigt Schulkapazitäten
- dokumentiert Sonderfälle und Bearbeitungsnotizen

Die Anwendung ist als Verwaltungs- und Koordinationssystem für mehrstufige Aufnahmeverfahren konzipiert.

---

# Technischer Stack

## Backend

- Node.js
- Express oder NestJS
- MySQL / MariaDB
- REST API

## Frontend

- Vue 3
- Vite
- Axios

## Datenbank

Schema:
- anmeld

Namenskonvention:
- Tabellen beginnen mit `anm_`

---

# Datenquellen

## Schulserver

Die Schulen liefern Anmeldedaten über direkte Datenbankverbindungen.

Verbindungsdaten werden in:

```text
anm_schulen