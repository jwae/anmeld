const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { createAuthModule } = require("../authModule");

async function postLogin(poolProvider) {
  const auth = createAuthModule(poolProvider);
  const app = express();
  app.use(express.json());
  app.use("/api/auth", auth.router);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "", password: "" }),
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("Auth-Protokoll ueberspringt nur die noch nicht konfigurierte Datenbank", async () => {
  const originalConsoleError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.map(String).join(" "));

  try {
    const responseWithoutDatabase = await postLogin(() => null);
    assert.equal(responseWithoutDatabase.status, 400);
    assert.deepEqual(errors, []);

    const responseWithWriteError = await postLogin({
      async query() {
        throw new Error("Protokollspeicherung fehlgeschlagen");
      },
    });
    assert.equal(responseWithWriteError.status, 400);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^\[PROTOKOLL\] Eintrag konnte nicht gespeichert werden:/);
    assert.match(errors[0], /Protokollspeicherung fehlgeschlagen/);
  } finally {
    console.error = originalConsoleError;
  }
});
