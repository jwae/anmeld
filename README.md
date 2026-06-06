# Projektbeschreibung: Schulanmeldeverfahren & Schul-Stat

Dieses Projekt ist eine integrierte Webanwendung zur Verwaltung des schulischen Anmeldeverfahrens eines Schulamts sowie zur Erfassung und Auswertung statistischer Schuldaten.

Weiterfuehrende technische Dokumentation:

- [ORS im Schulanmeldeverfahren](docs/ORS.md)

---

## 1. Ziel des Projekts

Die Anwendung gliedert sich in zwei wesentliche fachliche Module:

### A. Schulanmeldeverfahren (Namespace `anm_`)
Verwaltung und Koordination mehrstufiger Aufnahmeverfahren für Schulen:
- **Verfahren & Runden**: Strukturierte Steuerung der Anmeldeverfahren und einzelnen Anmelderunden.
- **Automatisierter Abgleich**: Abgleich von eingehenden Schulanmeldungen mit offenen Versorgungsfällen zur Erkennung fehlender oder doppelter Anmeldungen.
- **Kapazitätsprüfung**: Berücksichtigung und Abgleich mit den verfügbaren Schulkapazitäten.
- **Wartelisten- & Fallmanagement**: Dokumentation von Sonderfällen, Notizen und Unterstützung bei der manuellen Zuordnung nicht versorgter Kinder.
