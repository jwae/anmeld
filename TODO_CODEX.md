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
2. [x] P0: Vergleichsschutz für Fachskripte, Bindungen, Tabellen/Filter und vorhandene Verwaltung sichern.
3. [ ] P1: Seitenrahmen, Kopf, Sitzungskarte und zugängliche Navigation umstellen.
4. [ ] P1: Verfahren/Runden einschließlich Formularen und Dialogen umstellen.
5. [ ] P1: Verfahrensdaten, Schulzuordnung, Kapazitäten und Importassistenten umstellen.
6. [ ] P1: Abgleich, Koordination und offene Fälle umstellen.
7. [x] P1: Bedienoberfläche der Auswertungen umstellen; Druck/Export schützen.
8. [x] P2: Nachweislich ungenutztes CSS bereinigen und Dokumentation vervollständigen.
9. [ ] P2: Browserabnahme mit Testzugang: Desktop, 320px, 200% Zoom, Fokus,
   Dialoge/Escape, reduzierte Bewegung, Auswahl, Rechte und alle UI-Zustände.

Nach jedem Abschnitt: Build inklusive TypeScript und beide Regressionsprüfungen.
Keine produktiven Daten ändern. Der Testzugang wurde angefragt; bis dahin sind
angemeldete Fachansichten nicht als im Browser geprüft zu kennzeichnen.

## Erneute Fortsetzung nach Freigabe

Bestandsaufnahme: Branch `experiment/neues-design`, sauberer Arbeitsbaum bei
`11a3c2c`. Die zuvor uncommitteten Verwaltungsänderungen und die Teilmigration
des Anmeldeverfahrens sind inzwischen in `c4f97b5` enthalten. Punkte 3–6 sind
weitgehend implementiert, bleiben bis zur Prüfung der Restzustände offen.
Auswertungen, CSS-Bereinigung und Browserabnahme fehlen noch.

- Ausgangsprüfung: beide Migrationsprüfungen erfolgreich (32 Fachskripte,
  28 Tabellen-/Filterregionen, 35 geschützte Dateien sowie Verwaltungsprüfung).
- Frontend-Build inklusive TypeScript erfolgreich; 57 Backendtests bestanden.
- Schritt 1: Spezifität der Dialogschattenregel korrigiert; zuvor gewann die
  allgemeine Oberflächenregel mit `box-shadow: none`. Beide Migrationsprüfungen,
  Build inklusive TypeScript und Backendtests anschließend erfolgreich.
- Bestehende Fokus-/Escape-Lücken bei nicht nativen Dialogen sind getrennt von
  der rein visuellen Migration zu bewerten; Fachskripte bleiben geschützt.
- Schritt 2: Auswertungen mit zentralen Buttons, Texten, Karten, Meldungen und
  Vorschau-Dialog migriert. Sichtbare native Radios, ausgewählte Optionen und
  Fokusmarkierung ergänzt; reduzierte Bewegung berücksichtigt. Dialogbreite auf
  den verfügbaren Raum begrenzt und Dialoginhalt scrollbar gemacht.
  Druck-/Exportskript, Bindungen und Tabellenvorschau unverändert.
  Beide Migrationsprüfungen, Build und Backendtests erfolgreich.
- Browserinventar erneut geprüft: keine verbundenen Browser oder Apps.
  Eine angemeldete Testsitzung und freigegebene Testdaten wurden angefragt.
- Schritt 3: Fehlende Warning-Varianten in Abgleich, Kapazitäten und Koordination
  ergänzt. Die Migration hatte die bisherigen Warnfarben ausgeschlossen, ohne
  die zentrale Warning-Variante zu setzen. Vier Meldungen sind korrigiert.
  Unbenutzte lokale `.btn-secondary`-Regel der Auswertungen und doppelten
  Roadmap-Selektor entfernt. Die eng begrenzte Prüfausnahme kontrolliert weiterhin,
  dass die entfernte Klasse im Auswertungstemplate nicht verwendet wird.
  Beide Migrationsprüfungen, Build und 57 Backendtests erfolgreich.
  Designdokumentation einschließlich Grenzen und Schutzbasis ergänzt.

### Verbleibende Abnahme / bekannte Grenzen

- [ ] Punkte 3–6 visuell abnehmen; die Implementierung ist vorhanden, die
  Restzustände und berechneten Styles sind noch nicht vollständig geprüft.
- [ ] Auswertungen mit Testkonto auf Auswahl, Vorschau, Druck/Export und
  leere/fehlerhafte/laufende Zustände prüfen.
- [ ] Desktop, 320px und 200% Zoom sowie Tab-Reihenfolge und reduzierte Bewegung
  in einem verbundenen Browser prüfen. Öffnen von `iab` scheiterte ebenfalls
  mit `Browser is not available: iab`.
- [ ] Die ergänzte Fokusbegrenzung, Fokusrückgabe und Escape-Behandlung der
  21 nicht nativen Fachdialoge im Browser prüfen, einschließlich laufender
  Speichervorgänge, verschachtelter Dialoge und Import-Schrittwechsel.
- [ ] Schreibende Abläufe ausschließlich mit ausdrücklich vorgesehenen Testdaten
  prüfen. Es wurden keine produktiven Daten geändert.

Die Größenwarnung des Produktionsbuilds (JavaScript-Chunk über 500 kB) bleibt
bestehen. Quellcodeprüfung und erfolgreiche Tests sind keine Browserabnahme.

### Korrektur: Zuordnungserfolg nur nach vollständiger Speicherung

- [x] `POST /api/koordination/zuordnen` atomar gemacht: Schreibkontext,
  Zielschule, ausgewählte Rundendatensätze und UPDATE laufen auf derselben
  Transaktionsverbindung. Ausgewählte Datensätze werden bis zum Abschluss
  gesperrt.
- [x] Erfolg wird erst nach erfolgreichem Commit und nur dann gemeldet, wenn
  alle angeforderten Schüler gefunden und aktualisiert wurden. Nullupdates,
  Teilupdates, fehlende Rundendatensätze sowie UPDATE-/Commitfehler führen zum
  Rollback und zu einer Fehlerantwort. Die Berechnung freier Plätze wurde nicht
  verändert.
- [x] Acht Backendtests für vollständige, fehlende, doppelte, teilweise und
  fehlgeschlagene Zuordnungen ergänzt. Vollständige Backendtests, beide
  Migrationsprüfungen, sechs Frontendtests und Produktionsbuild inklusive
  TypeScript erfolgreich. Keine produktiven Daten verändert.
- [x] Wiederzuordnung explizit geprüft und per Regressionstest gesichert:
  Ein bereits als `Zugeordnet` geführter Schüler erhält in der aktuellen Runde
  die neue Schulnummer in `anm_schueler_runde.koordinierte_snr`; die vorherige
  Schulnummer wird überschrieben. Der WHERE-Filter enthält keinen Ausschluss für
  bestehende Zuordnungen und begrenzt die Änderung auf Schüler, Verfahren und
  Runde. Andere Runden und die Berechnung freier Plätze bleiben unverändert.
  Vollständige Backendtests, beide Migrationsprüfungen, sechs Frontendtests und
  Produktionsbuild inklusive TypeScript erfolgreich.

### Schritt 4: Dialogbedienung

- [x] Gemeinsame `v-dialog-focus`-Direktive auf 21 vorhandene Fachdialoge angewandt.
  Initialer Fokus liegt auf dem Dialog statt auf einer potenziell destruktiven
  Aktion; Tab bleibt im obersten Dialog; beim Schließen kehrt der Fokus zurück.
  Escape klickt ausschließlich den markierten bestehenden Schließen-Button,
  einschließlich dessen Disabled-Zustand. Keine Fachaktion wurde neu verdrahtet.
- [x] Dem Anmeldungsimport einen zugänglichen Dialognamen hinzugefügt.
- [x] Sechs Verhaltenstests ergänzt: Initial-/Rückgabefokus, Tab-Grenzen,
  deaktiviertes Schließen, gestapelte Dialoge, leere Dialoge/Schrittwechsel und
  Aufräumen der Ereignishandler. Aus `frontend`: `npm test`.
- [x] Vergleichsschutz ausschließlich um den exakten Direktivenimport und die
  wertlose UI-Direktive erweitert. Fachskripte ansonsten identisch; Tabellen,
  Bindungen und geschützte Hashes bleiben geprüft.
- [x] Abschließende Prüfungen nach Schritt 4: beide Migrationsprüfungen,
  sechs Frontend-Verhaltenstests, 57 Backendtests und Produktionsbuild inklusive
  TypeScript erfolgreich; `git diff --check` ohne Fehler. Browserabnahme bleibt
  mangels verbundenem Browser offen. Änderungen liegen uncommittet ausschließlich
  auf `experiment/neues-design`.

### Korrektur: Aufklapp-Icons in Verfahrensdaten

- [x] Fünf Bereichsschalter (abgebende/beteiligte Schulen, Kapazitäten,
  Schülerpool und Anmeldungen) auf SVG-Chevrons umgestellt: geschlossen nach
  unten, geöffnet nach oben. Zustand folgt dem vorhandenen `aria-expanded`.
  Icon-Buttons ohne verdrängendes Innenpadding; reduzierte Bewegung berücksichtigt.
- [x] Beide Migrationsprüfungen, sechs Frontendtests, 57 Backendtests und
  Build inklusive TypeScript erfolgreich. Browserabnahme weiterhin offen.

### Zusammenfassungen: Schülerpool und Abgleich

- [x] Gemeinsames kompaktes Kennzahlenraster auf `auto-fill` umgestellt, damit
  die vier Schülerpool-Karten nicht über die gesamte Breite gestreckt werden.
  Schülerpool-Raster erhält Vorrang vor dem lokalen Altstyle. Schriftgrößen und
  Innenabstände bleiben identisch zum Abgleich. Build, beide Migrationsprüfungen
  und 63 Tests erfolgreich; visuelle Browserabnahme weiterhin offen.

- [x] Hinweis „Datenquelle: anm_schueler“ einschließlich Trennzeichen aus
  Schülerpool und Abgleich-Zusammenfassung entfernt. Trefferzahl und Kontext
  bleiben sichtbar. Build, beide Migrationsprüfungen und 63 Tests erfolgreich.

- [x] Schülerpool-Kennzahlen und Importzusammenfassung auf zentrale Farben,
  Typografie, Abstände und Radien umgestellt; alte Verläufe entfernt.
- [x] Abgleich-Zusammenfassung einschließlich Rahmen, Kontexttext und acht
  Kennzahlenkarten umgestellt. „Ohne Anmeldung“ behält seine Hervorhebung mit
  zentralen Danger-Farben. Gemeinsame Styles gelten nur in markierten
  Zusammenfassungen; schmale Ansichten erhalten umbrechende Karten.
- [x] Tabellen, Filter, Berechnungen und Datenbindungen unverändert. Beide
  Migrationsprüfungen, sechs Frontendtests, 57 Backendtests und Build inklusive
  TypeScript erfolgreich. Visuelle Browserabnahme weiterhin offen.

- [x] Darstellung anschließend kompakter gemacht: kleinere Kennzahlen
  (1,125 statt 1,618 rem), Kartenpadding 8 statt 12 px und Abstände 4 statt
  8 px; Abgleich-Rahmen und Kontexttext ebenfalls verkleinert. Ausschließlich
  Zusammenfassungsstyles angepasst. Build, beide Migrationsprüfungen und alle
  63 Tests erfolgreich; Browserabnahme weiterhin offen.

### Korrektur: Protokollwarnung vor der Datenbankanmeldung

- [x] Auth-Protokollierung überspringt Einträge, solange bewusst noch keine
  Datenbankverbindung konfiguriert ist. Dadurch erzeugt die lokale Bereinigung
  einer alten Sitzung auf der Startseite keine irreführende Protokollwarnung.
- [x] Tatsächliche Protokollfehler bei vorhandener Datenbankverbindung bleiben
  sichtbar. Regressionstest für beide Fälle ergänzt; 67 Backendtests, sechs
  Frontendtests, beide Migrationsprüfungen und Produktionsbuild erfolgreich.

### Korrektur: Koordinierte Schule im Abgleich

- [x] Schülerliste, Kennzahlen und Schulübersicht im Abgleich verwenden jetzt
  einheitlich die wirksame aufnehmende Schule: `koordinierte_snr` hat Vorrang,
  `schul_nr` bleibt der Rückfallwert. Zuordnungen aus dem Menü Koordination
  erscheinen dadurch unter der ausgewählten Zielschule und im Schulfilter.
- [x] Vorhandene Rundendaten bleiben unverändert. Regressionstest ergänzt;
  68 Backendtests, sechs Frontendtests, beide Migrationsprüfungen und
  Produktionsbuild inklusive TypeScript erfolgreich.

### Offene Fälle einer Runde zuordnen

- [x] `anm_offener_fall.runde_id` als verpflichtendes Feld ergänzt und über
  einen zusammengesetzten Fremdschlüssel an die Runde desselben Verfahrens
  gebunden. Migration `034_add_round_to_open_cases.sql` ausgeführt; alle fünf
  vorhandenen Fälle wurden einer gültigen Runde zugeordnet.
- [x] Manuell und durch Importe erzeugte Fälle speichern die aktuelle Runde.
  Suche, Anzeige, Bearbeitung, Berichte und Fallzähler sind auf Verfahren und
  Runde begrenzt; Runden mit offenen Fällen werden beim Löschen berücksichtigt.
- [x] Regressionstest ergänzt; 69 Backendtests, sechs Frontendtests, beide
  Migrationsprüfungen und Produktionsbuild inklusive TypeScript erfolgreich.

### Verfahren und Runde in der Liste offener Fälle

- [x] Tabelle im Menü „Offene Fälle“ um die Spalte „Verfahren“ ergänzt. Jede
  Zeile zeigt die Bezeichnung des ausgewählten Verfahrens und darunter die
  zugehörige Runde; die gespeicherten IDs dienen als Rückfallanzeige.
- [x] Tabellen- und Detailzeilen auf elf Spalten angepasst und Regressionstest
  ergänzt. 69 Backendtests, sieben Frontendtests, beide Migrationsprüfungen und
  Produktionsbuild inklusive TypeScript erfolgreich.
- [x] Spalte `Quelle` aus der Übersichtstabelle entfernt und die Tabelle wieder
  auf zehn Spalten angepasst. Die Quellenangabe bleibt in den Falldetails sichtbar.
- [x] Statusbadge für offene Fälle auf die roten Gefahrenfarben des Designs
  umgestellt; die Statusfarben für Bearbeitung und erledigte Fälle bleiben erhalten.
