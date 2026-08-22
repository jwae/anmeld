const { after, before, describe, test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { can, requirePermission } = require("../lib/permissions");

const roles = {
  gast: ["verfahren.anzeigen"],
  sachbearbeitung: ["verfahren.anzeigen", "verfahren.bearbeiten"],
  administrator: [
    "verfahren.anzeigen",
    "verfahren.bearbeiten",
    "benutzer.bearbeiten",
    "gruppen.bearbeiten",
  ],
};

describe("Permission-System", () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.user = { permissions: roles[String(req.headers["x-test-role"] || "")] || [] };
      next();
    });
    app.get("/verfahren", requirePermission("verfahren.anzeigen"), (_req, res) => res.sendStatus(200));
    app.post("/verfahren", requirePermission("verfahren.bearbeiten"), (_req, res) => res.sendStatus(200));
    app.delete("/verfahren", requirePermission("verfahren.bearbeiten"), (_req, res) => res.sendStatus(200));
    app.patch("/benutzer", requirePermission("benutzer.bearbeiten"), (_req, res) => res.sendStatus(200));
    app.patch("/gruppen", requirePermission("gruppen.bearbeiten"), (_req, res) => res.sendStatus(200));

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  async function status(role, path, method = "GET") {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "x-test-role": role },
    });
    return response.status;
  }

  test("can prueft ausschliesslich Permission-Keys", () => {
    assert.equal(can({ permissions: roles.gast }, "verfahren.anzeigen"), true);
    assert.equal(can({ permissions: roles.gast }, "verfahren.bearbeiten"), false);
    assert.equal(can({ groupName: "Administrator", permissions: [] }, "gruppen.bearbeiten"), false);
  });

  test("Gast darf ansehen, aber keine Aenderungen senden", async () => {
    assert.equal(await status("gast", "/verfahren"), 200);
    assert.equal(await status("gast", "/verfahren", "POST"), 403);
    assert.equal(await status("gast", "/verfahren", "DELETE"), 403);
    assert.equal(await status("gast", "/benutzer", "PATCH"), 403);
    assert.equal(await status("gast", "/gruppen", "PATCH"), 403);
  });

  test("Sachbearbeitung darf fachlich bearbeiten, aber keine Verwaltung", async () => {
    assert.equal(await status("sachbearbeitung", "/verfahren"), 200);
    assert.equal(await status("sachbearbeitung", "/verfahren", "POST"), 200);
    assert.equal(await status("sachbearbeitung", "/verfahren", "DELETE"), 200);
    assert.equal(await status("sachbearbeitung", "/benutzer", "PATCH"), 403);
    assert.equal(await status("sachbearbeitung", "/gruppen", "PATCH"), 403);
  });

  test("Administrator hat Vollzugriff", async () => {
    assert.equal(await status("administrator", "/verfahren"), 200);
    assert.equal(await status("administrator", "/verfahren", "POST"), 200);
    assert.equal(await status("administrator", "/verfahren", "DELETE"), 200);
    assert.equal(await status("administrator", "/benutzer", "PATCH"), 200);
    assert.equal(await status("administrator", "/gruppen", "PATCH"), 200);
  });
});
