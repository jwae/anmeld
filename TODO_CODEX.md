# App-Verwaltung: Fortsetzung der Designmigration

Stand: 26.09.2026. Umfang: App-Verwaltung inklusive sechs Unterbereichen.
Tabellen, eingebettete Tabellenaktionen, Filter und Formate bleiben erhalten.
Login, Anmeldeverfahren, API-Aufrufe und fachliche Logik bleiben unverändert.

## Bestandsaufnahme

- [x] Gesprächsverlauf und Projektstand geprüft. Arbeitsbaum zu Beginn sauber;
  die Teilmigration ist bereits in Commit `93a98dc` enthalten.
- [x] Login und zentrales Designsystem sind vorhanden und werden nicht neu implementiert.
- [x] Teilmigration mit `anm-*`-Klassen in der Verwaltung vorhanden.
- [x] Unvollständige Zustände identifiziert: falsche Danger-Klassen auf Abbrechen,
  fehlende Dialoggestaltung, alte dynamische Katalog-Buttonklassen,
  uneinheitliche Reststyles, nicht umgestellter Verwaltungsrahmen/Sitzungskarte.

## Priorisierte Arbeiten

1. [x] P0: Teilmigration reparieren; Tabellen und Fachskripte gegen Ausgangsstand prüfen.
2. [x] P1: Rahmen, Sitzungskarte und Navigation ausschließlich für die Verwaltung umstellen.
3. [x] P1: Formulare, Karten, Status und Overlays vervollständigen; Tabellenstyles schützen.
4. [x] P2: Veraltete Regeln nur mit Verwendungsnachweis bereinigen; Migrationsprüfung dokumentieren.
5. [x] P2: Build inklusive TypeScript nach jedem Teilschritt erfolgreich; statische Regressionen erfolgreich. Browserprüfung versucht, kein Browser verfügbar.

## Prüfgrenzen

Keine produktiven Daten zum Testen verändern. Erfolgreicher Build ersetzt keine
visuelle Prüfung der berechtigten Verwaltungsansichten. Noch nicht ausführbare
Prüfungen werden hier abschließend ausdrücklich benannt.

## Ergebnis der Fortsetzung

- Falsche Danger-Varianten für Abbrechen/Schließen korrigiert.
- Katalogauswahl auf zentrale aktive Buttonvariante umgestellt.
- Dialogflächen einschließlich Teleport-Dialog und Inaktiv-Status vervollständigt.
- Verwaltungskopf und eigene `ManagementSessionCard` umgesetzt. Die bestehende
  `UserSessionCard` und ihr Einsatz im Anmeldeverfahren bleiben unverändert;
  Props und Ereignisse werden durch die neue Darstellung weitergereicht.
- Navigation an zentrale Styles angebunden; Register und Panels per ARIA verknüpft.
- Nicht tabellarische Formulare, Checkboxen, Karten, Texte und Hilfefenster angepasst.
- 70 nachweislich nicht mehr benötigte lokale Regeln entfernt. Altregeln, die
  Tabellen mitbenutzen, bleiben bestehen; `:where(:not(.anm-migrated))` grenzt
  sie ohne zusätzliche Spezifität von migrierten Elementen ab.
- Keine Änderungen am Login, an zentralen Tokens oder anderen Fachansichten.

## Wiederholbare Prüfungen

Aus `frontend`:

```text
node scripts/check-management-migration.mjs
npm run build
```

Die Prüfung verwendet den Git-Stand `dbe48f8` vor der Designmigration sowie
`93a98dc` als Schutzbasis des fertigen Logins. Beide Commits müssen lokal
verfügbar bleiben. Geprüft werden sechs fachliche Komponentenskripte,
Datenbindungen/Events/Interpolationen, neun unveränderte Tabellen-/Filterregionen,
für diese Regionen relevante CSS-Deklarationen, geschützte Dateien und reparierte
UI-Zustände. Die einzige SkriptÄnderung ist der Import der Verwaltungsvariante
der Sitzungskarte; die Geschäftslogik bleibt identisch.

Der Build meldet weiterhin einen JavaScript-Chunk über 500 kB; das verhindert
den Build nicht und ist kein Grund, in dieser Designmigration die Lade- oder
Routinglogik umzubauen.

## Noch offen: visuelle und interaktive Abnahme (P2)

Kein Browser ist mit dem verfügbaren UI-Werkzeug verbunden. Daher keine
behauptete visuelle oder vollständige Laufzeit-Abnahme.

- [ ] Alle sechs Register mit berechtigten Testkonten im Browser prüfen.
- [ ] Bestehende Tabellen gegen Vorher-Ansicht vergleichen: Spalten, Zeilen,
  Formatierungen, Hervorhebungen, eingebettete Aktionen und Scrollverhalten.
- [ ] Desktop, 320px Breite und 200% Zoom prüfen; Fokus, Tastatur, reduzierte Bewegung.
- [ ] Sitzungskarte/Abmelden, Katalogwechsel mit ungespeicherten Änderungen,
  Nur-Lese-Rechte und Dialoge einschließlich Teleport prüfen.
- [ ] Schreibende Abläufe nur mit ausdrücklich vorgesehenen Testdaten prüfen;
  bei dieser Fortsetzung wurden keine produktiven Daten verändert.

Statische Prüfungen belegen unveränderte Quellen und Bindungen, ersetzen aber
keine Browserprüfung der berechneten Geometrie, CSS-Vererbung und Fokusabläufe.

# Anmeldeverfahren: Designmigration ab 26.09.2026

## Ausgangsstand und priorisierter Plan

Die obigen Verwaltungseinträge bleiben als Historie erhalten. Der neue Auftrag
autorisiert ausschließlich den Fachbereich Anmeldeverfahren. Ausgangscommit:
`93a98dcf74b6aab8c68aef486c06b12ab1402cab`. Die bereits vorhandenen, uncommitteten
Verwaltungsänderungen bleiben geschützt. Ausgangs-Build und Verwaltungsprüfung
sind erfolgreich. Frontend (5173) und Backend (3000, HTTP-Antwort) erreichbar.
SVWS-Referenz und vorhandene zentrale Tokens wurden geprüft.

1. [x] P0: Umfang, Git-Diff, Vorgaben und zentralen CSS-Einstieg prüfen.
2. [ ] P0: Vergleichsschutz für Fachskripte, Bindungen, Tabellen/Filter und vorhandene Verwaltung sichern.
3. [ ] P1: Seitenrahmen, Kopf, Sitzungskarte und zugängliche Navigation umstellen.
4. [ ] P1: Verfahren/Runden einschließlich Formularen und Dialogen umstellen.
5. [ ] P1: Verfahrensdaten, Schulzuordnung, Kapazitäten und Importassistenten umstellen.
6. [ ] P1: Abgleich, Koordination und offene Fälle umstellen.
7. [ ] P1: Bedienoberfläche der Auswertungen umstellen; Druck/Export schützen.
8. [ ] P2: Nachweislich ungenutztes CSS bereinigen und Dokumentation vervollständigen.
9. [ ] P2: Browserabnahme mit Testzugang: Desktop, 320px, 200% Zoom, Fokus,
   Dialoge/Escape, reduzierte Bewegung, Auswahl, Rechte und alle UI-Zustände.

Nach jedem Abschnitt: Build inklusive TypeScript und beide Regressionsprüfungen.
Keine produktiven Daten ändern. Der Testzugang wurde angefragt; bis dahin sind
angemeldete Fachansichten nicht als im Browser geprüft zu kennzeichnen.
