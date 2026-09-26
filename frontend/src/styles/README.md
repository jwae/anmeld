# Zentrales Designsystem

## Einstieg und Umfang

`main.ts` importiert `styles/index.css` einmal nach Bootstrap. `tokens.css`
enthaelt die Designwerte; `components.css` die wiederverwendbaren UI-Regeln.
Der Login und die nicht tabellarischen Bereiche der App-Verwaltung verwenden
diese Regeln. Bestehende Verwaltungstabellen und ihre Filter/Bedienelemente
behalten ihre Formatierung; die weiteren Fachansichten werden separat migriert. Keine globalen Regeln fuer `button`, `input` oder
Bootstrap-Klassen hinzufuegen; neue Oberflaechen verwenden `anm-*`.

Das System ist bewusst ein helles Theme. Farben, Schriftgroessen, Gewichte,
Zeilenhoehen, Abstaende, Rahmen, Radien, Schatten, Fokus und Bewegungsdauer
werden zentral festgelegt. Responsive Breakpoints bleiben als feste rem-Werte
in Media Queries, da CSS-Variablen dort nicht eingesetzt werden koennen.

## Bausteine

| Zweck | Klassen / Zustand |
| --- | --- |
| Oberflaeche | `anm-theme`, `anm-card`, `anm-heading`, `anm-muted` |
| Aktionen | `anm-actions`, `anm-button`, `anm-button--primary`, `anm-button--danger`, `anm-button--icon` |
| Formulare | `anm-field`, `anm-label`, `anm-input`, `anm-check`, `anm-field-error` |
| Navigation | `anm-nav`, `anm-nav-item`, `aria-current="page"` oder `aria-selected="true"` |
| Tabellen | `anm-table-wrap`, `anm-table`, Zeilenauswahl via `aria-selected` |
| Dialoge | `anm-dialog`, `anm-dialog--md`, `anm-dialog--lg`, `anm-dialog-header`, `anm-dialog-title`, `anm-dialog-actions` |
| Meldungen | `anm-alert`, `anm-alert-title`, `anm-status--success/danger/warning/neutral` |
| Status | `anm-badge` mit denselben Statusvarianten |

Die Standardvariante eines Buttons ist sekundaer; `anm-button--secondary`
kann zur Lesbarkeit angegeben werden. Status ohne Variante ist Information.
Schatten werden sparsam eingesetzt, vor allem bei Dialogen.

## Semantik und Tastaturbedienung

CSS liefert Gestaltung, keine Interaktionslogik. Native HTML-Elemente verwenden:

```html
<label class="anm-field" for="email">
  <span class="anm-label">E-Mail</span>
  <input id="email" class="anm-input" type="email"
    aria-invalid="true" aria-describedby="email-error">
</label>
<p id="email-error" class="anm-field-error">Bitte eine gueltige E-Mail eingeben.</p>
<button class="anm-button anm-button--primary" type="submit">Speichern</button>
<div class="anm-alert anm-status--success" role="status">Gespeichert.</div>
```

- Fehler mit Text erklaeren und per `aria-describedby` dem Feld zuordnen.
- Dringende Fehler mit `role="alert"`, Erfolg mit `role="status"` auszeichnen.
- Icon-Buttons brauchen `aria-label`; dekorative SVGs bleiben `aria-hidden`.
- `disabled` fuer native Buttons verwenden. `aria-disabled` gestaltet nur den
  Zustand; bei anderen Elementen muss die Aktivierung im Code verhindert werden.
- Ladezustand mit `aria-busy` plus sichtbarem Text anzeigen.
- Navigation als `<nav aria-label="...">` mit Links ausfuehren. Echte Tabs
  brauchen zusaetzlich IDs, `aria-controls`, `aria-labelledby`, roving tabindex
  und Pfeiltasten/Home/End-Behandlung durch die Vue-Komponente.
- Tabellen behalten `<table>`, `<caption>`, `<th scope="col">`. Breite Tabellen
  in `anm-table-wrap` einbetten; fuer Tastatur-Scrolling `tabindex="0"`,
  `role="region"` und einen zugaenglichen Namen am Wrapper setzen.
- Auswahl und Status stets zusaetzlich textlich oder durch Steuerelemente zeigen.

## Dialoge und Teleport

`anm-dialog` ist fuer das native `<dialog>` vorgesehen. Mit `showModal()`
oeffnen, mit `close()` schliessen, nicht nur `open` oder `display` setzen.
Dadurch stehen modaler Hintergrund, native Fokusbegrenzung und Escape-Verhalten
zur Verfuegung. Einen Titel mit `aria-labelledby` verbinden und eine sichtbare
Abbrechen-/Schliessen-Aktion anbieten. Anfangsfokus, Rueckgabe des Fokus an den
Ausloeser sowie das Verhalten bei laufenden Speichervorgaengen pruefen.

```html
<dialog class="anm-dialog" aria-labelledby="dialog-title">
  <h2 id="dialog-title" class="anm-dialog-title">Aenderungen verwerfen?</h2>
  <p>Ungespeicherte Aenderungen gehen verloren.</p>
  <form method="dialog" class="anm-dialog-actions">
    <button class="anm-button" value="cancel" autofocus>Abbrechen</button>
    <button class="anm-button anm-button--danger" value="discard">Verwerfen</button>
  </form>
</dialog>
```

Die Dialogklassen sind eigenstaendig und funktionieren auch bei `Teleport`
zu `body`. Das Beispiel liefert den Rueckgabewert; die Fachaktion muss die
Vue-Komponente explizit behandeln. Ein `<div role="dialog">` erhaelt durch
CSS allein keine Fokusbegrenzung oder Escape-Behandlung.

## Herkunft und Lizenz

Vorbild: SVWS-Server, Commit `b4265c8724`, UI-Version `1.5.0-SNAPSHOT`.
Verwendete Referenzen: `config/palette.css`, `config/fonts.css`,
`config/dimensions.css`, Button-, TabBar-, Tabellen- und Modal-Styles.
Die Palette und Typografieskala wurden teilweise uebernommen; die Regeln
wurden als eigenes CSS ohne Tailwind und ohne SVWS-Core-Abhaengigkeit umgesetzt.
Kontrastreichere Eingaberahmen und app-eigene Statusfarben sind bewusste
Anpassungen. Keine Logos, Wappen oder SVWS-Bilder werden uebernommen.

Der vollstaendige BSD-3-Clause-Hinweis liegt unter
`public/licenses/svws-ui.txt` und wird beim Build nach `dist/licenses/` kopiert.
Die Hinweise muessen mit der Anwendung ausgeliefert werden. Die Komponenten
verwenden kein installiertes SVWS-Paket; die in Phase 1 festgestellten
Build-/Core-Abhaengigkeiten werden dadurch vermieden.

## Pruefung bei jeder Migration

Build/Typecheck; Tastaturfokus; 320px Breite und 200% Zoom; lange Texte;
Laden/Fehler/Readonly/Disabled; reduzierte Bewegung und hohe Kontraste;
Dialogfokus und Escape. CSS und erfolgreiche Builds ersetzen keine
Browserpruefung der jeweiligen Komponente.

## App-Verwaltung: geschützte Tabellen

`management.css` wird durch `APPManagement.vue` geladen. Es enthält ausschließlich
Verwaltungsvarianten und explizit markierte Elemente (`anm-migrated`). Es setzt
keine globale Schrift oder Farbe auf Eltern der bestehenden Tabellen. Die
Sitzungskarte verwendet einen eigenen Wrapper; die gemeinsame Komponente bleibt
für andere Ansichten unverändert. Hilfefenster erhalten nur in der Verwaltung
die Klasse `anm-management-help`.

Lokale Layoutregeln bleiben bestehen. Gemeinsam von Formularen und Tabellen
benutzte Altregeln schließen migrierte Elemente mit
`:where(:not(.anm-migrated))` aus. `:where` verändert die Spezifität der alten
Tabellenregeln nicht. Diese Regeln nicht pauschal löschen. Vor weiteren Änderungen
`node scripts/check-management-migration.mjs` ausführen; Details und Grenzen der
Prüfung stehen in `TODO_CODEX.md` im Projektverzeichnis.

## Anmeldeverfahren: Fortsetzung

`procedure.css` wird durch `LoginCredentialsPage.vue` geladen (trotz des Namens
ist dies der angemeldete Fachbereich). `anm-procedure-ui` aktiviert zentrale
Steuerelemente; `anm-procedure-surface` ersetzt nur die Dekoration vorhandener
Flächen. Keine globale Typografie auf Tabelleneltern setzen. Die neue Darstellung
der Sitzungskarte ist auf `anm-procedure-session` begrenzt.

Die Auswertungsansicht verwendet dieselben Bausteine. Ergänzende Regeln sind auf
`.auswertungen-view` beschränkt. Native Radios bleiben sichtbar, Auswahl und
Tastaturfokus werden kenntlich gemacht. Tabellen-/Filterregionen sowie das
Fachskript einschließlich Druck-HTML und Export bleiben gegen `93a98dc` geschützt.

Prüfung aus `frontend`: `node scripts/check-management-migration.mjs` führt beide
Migrationsprüfungen aus; anschließend `npm test` und `npm run build`. Backendtests aus `backend`:
`npm test`. Die feste Vergleichsbasis und die geschützten Hashes nicht erneuern,
um fehlgeschlagene Prüfungen zu umgehen.

Eine eng begrenzte CSS-Ausnahme erlaubt das Entfernen von `.btn-secondary` nur
in `AuswertungenView.vue`; die Prüfung verlangt dort gleichzeitig, dass die Klasse
im aktuellen Template nicht vorkommt. Andere Altregeln bleiben erhalten, solange
ihre Nichtverwendung nicht belegt ist. Der redundante Roadmap-Selektor wurde
ebenfalls entfernt. `.migrate-procedure.mjs` ist ein einmaliges Hilfsskript, das
Dateien aus der ursprünglichen Git-Basis rekonstruiert: nicht auf bereits manuell
verfeinerte Bereiche erneut anwenden, da sonst diese Änderungen verloren gehen.

`v-dialog-focus` ergänzt die 21 vorhandenen nicht nativen Fachdialoge um initialen
Fokus auf den Dialog, Tab-Begrenzung, Fokusrückgabe und Escape. Escape klickt den
mit `data-dialog-close` markierten bestehenden Button und respektiert dessen
Deaktivierung. Vorhandene Fachaktionen bleiben unverändert. Die einzige erlaubte
Skriptergänzung ist der exakte Direktivenimport; die wertlose Direktive wird beim
Vergleich der Fachbindungen ausgenommen. Keine Hash-Basis wurde verändert.
Sechs Verhaltenstests mit kleinem DOM-Adapter laufen über `npm test` (Node 22.20
oder neuer mit TypeScript-Type-Stripping); sie ersetzen keinen echten Browser.

Browserabnahme bleibt offen: Das UI-Werkzeug meldete bei der Fortsetzung keine
Browser; auch das Öffnen des integrierten Browsers war nicht verfügbar. Fokus,
Screenreader-Verhalten und Dialoggeometrie nicht als visuell abgenommen markieren.
