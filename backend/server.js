const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const {
  createAuthModule,
} = require("./authModule");
const createAnmeldeverfahrenRouter = require("./routes/anmeldeverfahren");
const createAnmelderundenRouter = require("./routes/anmelderunden");
const createAbgleichRouter = require("./routes/abgleich");
const createKoordinationRouter = require("./routes/koordination");
const createImporteRouter = require("./routes/importe");
const createKapazitaetenRoutes = require("./routes/kapazitaeten");
const createAuswertungenRouter = require("./routes/auswertungen");
require("dotenv").config();

const app = express();
app.use(cors());
const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || "10mb";
app.use(express.json({ limit: requestBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));

// --- Swagger UI Setup ---
const swaggerDocument = YAML.load(path.join(__dirname, "openapi.yaml"));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

function createDbConfig(overrides = {}) {
  const hasUserOverride = Object.prototype.hasOwnProperty.call(overrides, "user");
  const hasPasswordOverride = Object.prototype.hasOwnProperty.call(overrides, "password");
  return {
    host: String(overrides.host || "").trim(),
    port: Number(overrides.port || process.env.DB_PORT || 3306),
    user: String(hasUserOverride ? overrides.user : (process.env.DB_USER || "root")).trim(),
    password: String(hasPasswordOverride ? overrides.password : (process.env.DB_PASSWORD || "")),
    database: String(overrides.database || "").trim(),
    waitForConnections: true,
    connectionLimit: 10,
  };
}

function createPoolFromConfig(config) {
  return mysql.createPool(config);
}

function collectErrorHints(error, seen = new Set()) {
  if (!error || seen.has(error)) return [];
  if (typeof error !== "object") return [String(error)];
  seen.add(error);

  const hints = [];
  const code = String(error?.code || "").trim();
  const errno = error?.errno;
  const message = String(error?.message || "").trim();

  if (code) hints.push(code);
  if (errno !== undefined && errno !== null && String(errno).trim()) hints.push(String(errno));
  if (message) hints.push(message);

  if (error?.cause) {
    hints.push(...collectErrorHints(error.cause, seen));
  }

  if (Array.isArray(error?.errors)) {
    for (const nested of error.errors) {
      hints.push(...collectErrorHints(nested, seen));
    }
  }

  return hints;
}

function classifyConnectionError(error, context = "general", databaseName = "") {
  const code = String(error?.code || "").trim().toUpperCase();
  const errno = Number(error?.errno || 0);
  const message = String(error?.message || "").trim();
  const allHints = collectErrorHints(error)
    .join(" ")
    .toLowerCase();

  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET"
  ) {
    return "Server / Port nicht erreichbar.";
  }

  if (
    allHints.includes("enotfound") ||
    allHints.includes("getaddrinfo") ||
    allHints.includes("eai_again") ||
    allHints.includes("econnrefused") ||
    allHints.includes("etimedout") ||
    allHints.includes("esockettimedout") ||
    allHints.includes("econnreset") ||
    allHints.includes("name or service not known") ||
    allHints.includes("nodename nor servname")
  ) {
    return "Server inkl. Port nicht erreichbar.";
  }

  if (errno === 1045 || code === "ER_ACCESS_DENIED_ERROR") {
    return "Authentifizierung nicht ok. DB-Benutzer oder Passwort ist falsch.";
  }

  if (
    message.toLowerCase().includes("unknown plugin") ||
    message.toLowerCase().includes("auth_gssapi_client")
  ) {
    return "Authentifizierung nicht ok. DB-Benutzer oder Passwort ist falsch.";
  }

  if (errno === 1049 || code === "ER_BAD_DB_ERROR") {
    const fromInput = String(databaseName || "").trim();
    const fromUnknownDbMessage = (message.match(/Unknown database '([^']+)'/i) || [])[1] || "";
    const fromGermanMessage = (message.match(/Die Datenbank '([^']+)'/i) || [])[1] || "";
    const db = fromInput || fromUnknownDbMessage || fromGermanMessage || "angegeben";
    return `Die Datenbank '${db}' existiert auf dem Server nicht. Benutzername und Passwort sind korrekt.`;
  }

  return message || "Verbindungsfehler zur Datenbank.";
}
async function testServerConnection({ host, port, database, user, password }) {
  const hasUser = user !== undefined && user !== null;
  const hasPassword = password !== undefined && password !== null;
  const connection = await mysql.createConnection({
    host,
    port,
    user: String(hasUser ? user : (process.env.DB_USER || "root")).trim(),
    password: String(hasPassword ? password : (process.env.DB_PASSWORD || "")),
    connectTimeout: 5000,
  });

  try {
    const dbName = String(database || "").trim();
    if (!dbName) {
      const error = new Error("Datenbank ist erforderlich.");
      error.code = "ER_BAD_DB_ERROR";
      throw error;
    }
    const [rows] = await connection.query(
      "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ? LIMIT 1",
      [dbName],
    );
    if (!Array.isArray(rows) || !rows.length) {
      const error = new Error(`Die Datenbank '${dbName}' existiert auf dem MariaDB-Server nicht.`);
      error.code = "ER_BAD_DB_ERROR";
      throw error;
    }
  } finally {
    await connection.end();
  }
}

let currentPool = null;
let currentDbConfig = null;

function getPool() {
  return currentPool;
}

function getPublicDbDefaults() {
  return {
    host: String(process.env.DB_HOST || "localhost").trim(),
    port: Number(process.env.DB_PORT || 3307),
    database: String(process.env.DB_NAME || "stats").trim(),
    username: String(process.env.DB_USER || "root").trim(),
    password: String(process.env.DB_PASSWORD || ""),
  };
}

function getPublicDbConfig() {
  const defaults = getPublicDbDefaults();
  if (!currentDbConfig) {
    return {
      configured: false,
      host: "",
      port: defaults.port,
      database: "",
      username: "",
      defaults,
    };
  }
  return {
    configured: true,
    host: currentDbConfig.host,
    port: currentDbConfig.port,
    database: currentDbConfig.database,
    username: currentDbConfig.user,
    defaults,
  };
}

async function configurePool(overrides) {
  const nextConfig = createDbConfig(overrides);
  if (!nextConfig.host || !nextConfig.database) {
    throw new Error("Host und Datenbank sind erforderlich.");
  }

  const nextPool = createPoolFromConfig(nextConfig);
  try {
    await nextPool.query("SELECT 1");
  } catch (error) {
    await nextPool.end().catch(() => {});
    throw error;
  }

  const previousPool = currentPool;
  currentPool = nextPool;
  currentDbConfig = nextConfig;

  if (previousPool) {
    previousPool.end().catch(() => {});
  }

  return getPublicDbConfig();
}

function ensureDatabaseConfigured(req, res, next) {
  if (!currentPool) {
    return res.status(503).json({ error: "Bitte zuerst MariaDB-Server und Datenbank verbinden." });
  }
  next();
}

function isEnabledEnvFlag(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

async function autoConfigurePoolFromEnv() {
  if (!isEnabledEnvFlag(process.env.DB_AUTO_CONNECT)) {
    return;
  }

  const host = String(process.env.DB_HOST || "").trim();
  const database = String(process.env.DB_NAME || "").trim();
  const user = String(process.env.DB_USER || "").trim();
  const password = String(process.env.DB_PASSWORD || "");
  const port = Number(process.env.DB_PORT || 3306);

  if (!host || !database || !user) {
    throw new Error("DB_AUTO_CONNECT ist aktiv, aber DB_HOST, DB_NAME oder DB_USER fehlen.");
  }

  await configurePool({ host, port, database, user, password });
}

const {
  router: authRouter,
  authenticateToken,
  requireAdmin,
} = createAuthModule(getPool);

app.get("/api/connection/status", (req, res) => {
  res.json(getPublicDbConfig());
});

app.post("/api/connection/connect", async (req, res) => {
  const host = String(req.body?.host || "").trim();
  const database = String(req.body?.database || "").trim();
  const port = Number(req.body?.port || process.env.DB_PORT || 3306);
  const user = String(req.body?.username || req.body?.user || "").trim();
  const password = String(req.body?.password || "");

  try {
    if (!password) {
      return res.status(400).json({ error: "DB-Passwort ist erforderlich." });
    }

    const config = await configurePool({ host, port, database, user, password });
    res.json(config);
  } catch (e) {
    console.error("db connection failed:", e?.message || e);
    res.status(400).json({
      error: classifyConnectionError(e, "connect", database),
      details: e?.message || "",
      code: e?.code || "",
    });
  }
});

app.post("/api/connection/test", async (req, res) => {
  const host = String(req.body?.host || "").trim();
  const port = Number(req.body?.port || process.env.DB_PORT || 3306);
  const database = String(req.body?.database || "").trim();
  const user = String(req.body?.username || req.body?.user || "").trim();
  const password = String(req.body?.password || "");

  try {
    if (!host) {
      return res.status(400).json({ error: "Server-Adresse ist erforderlich." });
    }

    if (!user) {
      return res.status(400).json({ error: "DB-Benutzer ist erforderlich." });
    }

    if (!password) {
      return res.status(400).json({ error: "DB-Passwort ist erforderlich." });
    }

    await testServerConnection({ host, port, database, user, password });
    res.json({ connected: true, host, port, database });
  } catch (e) {
    console.error("db server test failed:", e?.message || e);
    res.status(400).json({
      error: classifyConnectionError(e, "test", database),
      details: e?.message || "",
      code: e?.code || "",
    });
  }
});

app.use("/api/auth", authRouter);
app.use("/api", ensureDatabaseConfigured, authenticateToken);
app.use("/api/anmeldeverfahren", createAnmeldeverfahrenRouter({ authenticateToken, requireAdmin, getPool }));
app.use("/api/verfahren", createAnmeldeverfahrenRouter({ authenticateToken, requireAdmin, getPool }));
app.use("/api", createAnmelderundenRouter({ authenticateToken, requireAdmin, getPool }));
app.use("/api/abgleich", createAbgleichRouter({ authenticateToken, requireAdmin, getPool }));
app.use("/api/koordination", createKoordinationRouter({ authenticateToken, requireAdmin, getPool }));
app.use("/api/importe", createImporteRouter({ authenticateToken, requireAdmin, getPool }));
app.use("/api/auswertungen", createAuswertungenRouter({ authenticateToken, requireAdmin, getPool }));

// Dynamischer Pool-Proxy fuer die Kapazitaeten-Routen
const poolProxy = {
  query: (...args) => currentPool.query(...args),
  execute: (...args) => currentPool.execute(...args),
  getConnection: (...args) => currentPool.getConnection(...args),
};
app.use("/api", createKapazitaetenRoutes(poolProxy));

const port = Number(process.env.PORT || 3000);

async function startServer() {
  try {
    await autoConfigurePoolFromEnv();
    if (currentDbConfig) {
      console.log(
        `DB automatisch verbunden: host=${currentDbConfig.host} port=${currentDbConfig.port} db=${currentDbConfig.database}`
      );
    }
  } catch (error) {
    console.error("Automatische DB-Verbindung beim Start fehlgeschlagen:", error?.message || error);
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`API laeuft auf Port ${port}`);
    console.log(
      `DB Standardwerte: host=${process.env.DB_HOST || "127.0.0.1"} port=${Number(process.env.DB_PORT || 3306)} db=${process.env.DB_NAME || "stats"}`
    );
    if (!currentPool) {
      console.log("Warte auf DB-Verbindung ueber /api/connection/connect");
    }
  });
}

startServer();
