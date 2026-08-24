const { after, before, describe, test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");
const { createAuthModule } = require("../authModule");

describe("Verwaltungsbereich-Protokollierung", () => {
  let server;
  let baseUrl;
  let protocolWrites;

  before(async () => {
    protocolWrites = [];
    const pool = {
      async query(sql, values) {
        if (String(sql).includes("INSERT INTO app_protokoll")) {
          protocolWrites.push(values);
          return [{ affectedRows: 1, insertId: protocolWrites.length }];
        }
        if (String(sql).includes("SELECT COUNT(*) AS total FROM app_protokoll")) {
          return [[{ total: 1 }]];
        }
        if (String(sql).includes("FROM app_protokoll p")) {
          return [[{
            id: 1,
            zeitpunkt: "2026-08-24 12:30:00",
            ergebnis: "FEHLER",
            benutzer_id: 10,
            benutzername: "admin",
            user_fullname: "Administrator",
            verfahren_id: null,
            verfahren_bezeichnung: null,
            runde_id: null,
            runde_bezeichnung: null,
            objekt_typ: null,
            objekt_id: null,
            aenderungen: null,
            details: '{"grund":"UNGUELTIGE_ZUGANGSDATEN"}',
            ip_adresse: "127.0.0.1",
            korrelation_id: null,
            ereignis_code: "LOGIN",
            ereignis_bezeichnung: "Login",
          }]];
        }
        throw new Error(`Unerwartete Testabfrage: ${sql}`);
      },
    };
    const auth = createAuthModule(pool);
    const app = express();
    app.use(express.json());
    app.use("/api/auth", auth.router);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  function token(permissions, nonce) {
    return jwt.sign(
      { sub: "10", username: "admin", permissions, nonce },
      process.env.JWT_SECRET || "change-me-in-production",
      { expiresIn: "1h" },
    );
  }

  async function post(path, bearerToken) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
  }

  async function get(path, bearerToken) {
    return fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
  }

  test("Oeffnen und Schliessen schreiben die speziellen Ereignisse und widerrufen das Token", async () => {
    const bearerToken = token(["kataloge.anzeigen"], "success");

    assert.equal((await post("/api/auth/verwaltungsbereich/login", bearerToken)).status, 200);
    assert.equal(protocolWrites.at(-1)[11], "LOGIN_VERWALTUNGSBEREICH");
    assert.equal(protocolWrites.at(-1)[0], "ERFOLG");

    assert.equal((await post("/api/auth/verwaltungsbereich/logout", bearerToken)).status, 200);
    assert.equal(protocolWrites.at(-1)[11], "LOGOUT_VERWALTUNGSBEREICH");
    assert.equal(protocolWrites.at(-1)[0], "ERFOLG");

    assert.equal((await post("/api/auth/verwaltungsbereich/login", bearerToken)).status, 401);
  });

  test("Fehlende Verwaltungsrechte werden als fehlgeschlagener Zugriff protokolliert", async () => {
    const bearerToken = token(["verfahren.anzeigen"], "denied");

    assert.equal((await post("/api/auth/verwaltungsbereich/login", bearerToken)).status, 403);
    assert.equal(protocolWrites.at(-1)[11], "LOGIN_VERWALTUNGSBEREICH");
    assert.equal(protocolWrites.at(-1)[0], "FEHLER");
    assert.deepEqual(JSON.parse(protocolWrites.at(-1)[8]), { grund: "KEINE_VERWALTUNGSBERECHTIGUNG" });
  });

  test("App-Protokoll ist nur mit Protokollrecht lesbar und liefert aufbereitete JSON-Felder", async () => {
    const allowedToken = token(["protokoll.anzeigen"], "protocol-allowed");
    const deniedToken = token(["verfahren.anzeigen"], "protocol-denied");

    const response = await get("/api/auth/admin/protokoll", allowedToken);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.total, 1);
    assert.equal(payload.rows[0].ereignis_bezeichnung, "Login");
    assert.deepEqual(payload.rows[0].details, { grund: "UNGUELTIGE_ZUGANGSDATEN" });

    assert.equal((await get("/api/auth/admin/protokoll", deniedToken)).status, 403);
  });
});
