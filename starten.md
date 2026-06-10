# Schulanmeldeverfahren - Startanleitung

Diese Anleitung beschreibt, wie die Anwendung in verschiedenen Modi gestartet werden kann. Die Anwendung besteht aus drei Teilen:
1. **Datenbank** (MariaDB)
2. **Backend-Server** (Node.js / Express)
3. **Frontend** (Vue 3 / Vite)



### 1. Backend starten
1. Öffne ein neues Terminal und wechsle in das Verzeichnis `backend`:
   ```bash
   cd backend
   ```
2. Starte den Backend-Server:
   ```bash
   npm start
   ```
   *Das Backend läuft nun lokal unter [http://localhost:3000](http://localhost:3000).*

### 2. Frontend starten
1. Öffne ein zweites Terminal und wechsle in das Verzeichnis `frontend`:
   ```bash
   cd frontend
   ```
2. Starte den Vite-Entwicklungsserver:
   ```bash
   npm run dev
   ```
   *Das Frontend ist nun im Browser unter **[http://localhost:5173](http://localhost:5173)** (oder dem im Terminal angezeigten Port) erreichbar. Anfragen an `/api/*` werden automatisch an das Backend auf Port `3000` weitergeleitet.*