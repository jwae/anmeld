# Skill: Seite "Auswertungen"

## Ziel

Erstelle eine neue Seite **Auswertungen** (Menü Auswertungen), über die alle fachlichen Auswertungen des aktuellen Verfahrens und der aktuellen Runde erstellt werden können.

Die Seite dient als zentrale Ausgabe- und Druckzentrale der Anwendung.

Alle Auswertungen beziehen sich immer auf:

* das aktuell ausgewählte Verfahren
* die aktuell aktive Runde

---

# Seitenlayout

Die Seite besteht aus einer Kachelansicht.

Jede Kachel repräsentiert einen fachlichen Bereich.

Jede Kachel enthält die verfügbaren Ausgabeformate.

Beispiel:

```text
┌──────────────────────────┐
│ Schülerlisten            │
│--------------------------│
│ Verschiedene             │
│ Schülerauswertungen      │
│                          │
│ [PDF]   [Excel]          │
└──────────────────────────┘
```

Die Kacheln sollen responsiv dargestellt werden.

---

# Kachel 1 – Verfahrensübersicht

Beschreibung:

Übersicht über das aktuelle Verfahren.

Auswertungen:

* Verfahrensdaten
* Runden
* Schulgruppen
* Kapazitäten
* Zusammenfassung

Ausgabe:

* PDF
* Excel

---

# Kachel 2 – Schülerlisten

Beschreibung:

Auswertungen der Schülerdaten.

Mögliche Listen:

* Alle Schüler
* Nur Pool
* Nur Anmeldung
* Pool + Anmeldung
* Neuaufnahme
* Warteliste
* Zugeordnet
* Abgelehnt
* Ohne Anmeldung
* Nach Zielschule
* Nach Herkunftsschule
* Förderbedarf
* Zieldifferent

Ausgabe:

* PDF
* Excel

---

# Kachel 3 – Schulen

Beschreibung:

Auswertungen je Schule.

Mögliche Listen:

* Anmeldungen je Schule
* Zugeordnete Schüler
* Freie Plätze
* Kapazitätsübersicht
* Koordinierungsübersicht

Ausgabe:

* PDF
* Excel

---

# Kachel 4 – Offene Fälle

Beschreibung:

Auswertungen aller offenen Fälle.

Mögliche Listen:

* Alle offenen Fälle
* Nach Fallgrund
* Nach Schule
* Nach Bearbeiter
* Erledigte Fälle
* Importfehler

Ausgabe:

* PDF
* Excel

---

# Kachel 5 – Anschreiben

Beschreibung:

Erzeugung von Serienanschreiben.

Mögliche Dokumente:

* Aufnahmebescheid
* Wartelistenbescheid
* Ablehnungsbescheid
* Zuweisungsschreiben
* Anschreiben an Schulen

Ausgabe:

* PDF
* Word

---

# Kachel 6 – Statistiken

Beschreibung:

Statistische Auswertungen.

Mögliche Auswertungen:

* Anzahl Anmeldungen
* Anmeldungen je Schule
* Auslastung der Schulen
* Freie Plätze
* Herkunftsschulen
* Förderbedarf
* Koordinierungen
* Entwicklung über die Runden

Ausgabe:

* PDF
* Excel

---

# Bedienung

Der Benutzer öffnet eine Kachel.

Innerhalb der Kachel kann die gewünschte Auswertung ausgewählt werden.

Anschließend kann das gewünschte Ausgabeformat gewählt werden.

Beispiel:

```text
Schülerlisten

○ Alle Schüler
○ Warteliste
○ Zugeordnet
○ Förderbedarf

[PDF erzeugen]
[Excel exportieren]
```

---

# Technische Anforderungen

* Neue View: `AuswertungenView.vue`
* Vue 3 Composition API
* Axios für Backend-Aufrufe
* Responsive Kachelansicht
* Einheitliches Layout entsprechend der übrigen Anwendung
* Ausgabe immer bezogen auf:

  * aktuelles Verfahren
  * aktive Runde
* Backend-Endpunkte vorbereiten, auch wenn einzelne Auswertungen zunächst noch Platzhalter sind.
* Jede Kachel soll unabhängig erweitert werden können.
* Die Auswertungen sind modular aufzubauen, sodass später problemlos weitere Auswertungen ergänzt werden können, ohne die bestehende Struktur zu ändern.

---

# Ziel

Die Seite **Auswertungen** bildet die zentrale Ausgabeplattform der Anwendung. Alle Listen, Statistiken und Anschreiben werden künftig ausschließlich über diese Seite erzeugt und als PDF, Excel oder Word ausgegeben.
