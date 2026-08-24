﻿const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const https = require("https");
const net = require("net");
const path = require("path");
const { pathToFileURL } = require("url");
const { can, requirePermission, requireAnyPermission } = require("./lib/permissions");
const { PROTOKOLL_ERGEBNIS, getClientIp, writeProtokoll } = require("./lib/protokollService");

const ADMINISTRATION_PERMISSION_KEYS = ["benutzer.bearbeiten", "gruppen.bearbeiten"];
const CATALOG_VIEW_PERMISSION_KEYS = ["kataloge.anzeigen", "kataloge.bearbeiten"];
const PROTOCOL_VIEW_PERMISSION_KEYS = ["protokoll.anzeigen", "protokoll.bearbeiten"];
const MANAGEMENT_PERMISSION_KEYS = [
  ...ADMINISTRATION_PERMISSION_KEYS,
  ...CATALOG_VIEW_PERMISSION_KEYS,
  ...PROTOCOL_VIEW_PERMISSION_KEYS,
];

let svwsConnectionModulePromise = null;

async function loadSvwsConnectionModule() {
  if (!svwsConnectionModulePromise) {
    const candidates = [
      path.resolve(__dirname, "..", "lib", "svwsConnection.js"),
      path.resolve(__dirname, "lib", "svwsConnection.mjs"),
    ];
    svwsConnectionModulePromise = (async () => {
      let lastError = null;
      for (const candidate of candidates) {
        try {
          const moduleUrl = pathToFileURL(candidate).href;
          return await import(moduleUrl);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("svwsConnection-Modul konnte nicht geladen werden.");
    })().catch((error) => {
      svwsConnectionModulePromise = null;
      throw error;
    });
  }

  return await svwsConnectionModulePromise;
}

function classifyAuthConnectionError(error) {
  const code = String(error?.code || "").trim().toUpperCase();
  const message = String(error?.message || "").trim();
  const lowered = message.toLowerCase();

  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET"
  ) {
    return "DB-Server nicht erreichbar. Bitte Server und Port pruefen.";
  }

  if (
    lowered.includes("enotfound") ||
    lowered.includes("getaddrinfo") ||
    lowered.includes("eai_again") ||
    lowered.includes("econnrefused") ||
    lowered.includes("etimedout") ||
    lowered.includes("esockettimedout") ||
    lowered.includes("name or service not known") ||
    lowered.includes("nodename nor servname")
  ) {
    return "DB-Server nicht erreichbar. Bitte Server und Port pruefen.";
  }

  return "";
}

function collectConnectionHints(error, seen = new Set()) {
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
    hints.push(...collectConnectionHints(error.cause, seen));
  }

  if (Array.isArray(error?.errors)) {
    for (const nested of error.errors) {
      hints.push(...collectConnectionHints(nested, seen));
    }
  }

  return hints;
}

function normalizeSchoolSourceHost(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) {
    const error = new Error("Server ist erforderlich.");
    error.statusCode = 400;
    throw error;
  }

  let hostname = text;
  if (/^https?:\/\//i.test(text)) {
    let parsed;
    try {
      parsed = new URL(text);
    } catch {
      const error = new Error("Server ist ungueltig.");
      error.statusCode = 400;
      throw error;
    }
    if (parsed.protocol !== "https:") {
      const error = new Error("Es sind nur HTTPS-Adressen erlaubt.");
      error.statusCode = 400;
      throw error;
    }
    if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
      const error = new Error("Bitte nur den Hostnamen ohne Pfad angeben.");
      error.statusCode = 400;
      throw error;
    }
    hostname = String(parsed.hostname || "").trim();
  } else if (/[/?#]/.test(text)) {
    const error = new Error("Bitte nur den Hostnamen ohne Pfad angeben.");
    error.statusCode = 400;
    throw error;
  }

  try {
    const url = buildSchoolSourceRestUrl(hostname, "/config/db/schemata");
    return { hostname, url: url.toString() };
  } catch {
    const error = new Error("Server ist ungueltig.");
    error.statusCode = 400;
    throw error;
  }
}

function normalizeSchoolSourceRestError(error, hostname = "") {
  const code = String(error?.code || error?.cause?.code || "").trim().toUpperCase();
  const message = String(error?.message || error?.cause?.message || "").trim();
  const lowered = message.toLowerCase();
  const requestPath = String(error?.requestPath || error?.cause?.requestPath || "").trim();

  if (
    code === "ERR_TLS_CERT_ALTNAME_INVALID" ||
    lowered.includes("altname") ||
    lowered.includes("hostname/ip does not match certificate")
  ) {
    return `HTTPS-Validierung fehlgeschlagen: Zertifikat passt nicht zu ${hostname || "dem Hostnamen"}.`;
  }

  if (
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    lowered.includes("self-signed certificate") ||
    lowered.includes("unable to verify the first certificate") ||
    lowered.includes("certificate")
  ) {
    return "HTTPS-Validierung fehlgeschlagen: Zertifikat ist ungueltig.";
  }

  if (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    lowered.includes("enotfound") ||
    lowered.includes("getaddrinfo")
  ) {
    return "Host konnte nicht aufgeloest werden.";
  }

  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    lowered.includes("fetch failed") ||
    lowered.includes("timeout") ||
    lowered.includes("econnrefused")
  ) {
    return "HTTPS-Endpunkt auf Port 8443 ist nicht erreichbar.";
  }

  if (Number(error?.responseStatus || 0) === 404) {
    return `REST-Endpunkt ${requestPath || "/config/db/schemata"} wurde nicht gefunden.`;
  }

  if (Number(error?.responseStatus || 0) === 401) {
    return "DB-Login fehlerhaft";
  }

  if (Number(error?.responseStatus || 0) >= 400) {
    return `REST-Endpunkt ${requestPath || "/config/db/schemata"} antwortet mit HTTP ${error.responseStatus}.`;
  }

  return message || "REST-Verbindungstest fehlgeschlagen.";
}

function parseOptionalSchoolSourcePort(value) {
  const text = String(value ?? "").trim();
  if (!text) return 3306;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error("Port ist ungueltig.");
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

function isDevelopmentMode() {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production";
}

function isLocalDevelopmentHost(hostname) {
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function buildSchoolSourceRestUrl(hostname, pathname) {
  const normalizedHost = String(hostname || "").trim();
  const normalizedPath = String(pathname || "").trim();
  const isLocalHost = isLocalDevelopmentHost(normalizedHost);
  const base = isLocalHost && isDevelopmentMode()
    ? `https://${normalizedHost}`
    : `https://${normalizedHost}:8443`;
  return new URL(normalizedPath, `${base}/`);
}

function buildSchoolSourceRestHeaders(username = "", password = "") {
  const user = String(username || "").trim();
  const pass = String(password || "");
  const headers = { Accept: "application/json" };
  if (user) {
    headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
  }
  return headers;
}

async function fetchSchoolSourceRestJson(hostname, pathname, options = {}) {
  const url = buildSchoolSourceRestUrl(hostname, pathname);
  const allowSelfSigned = isDevelopmentMode() && isLocalDevelopmentHost(hostname);
  const headers = buildSchoolSourceRestHeaders(options.username, options.password);

  return await new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: "GET",
      headers,
      timeout: 5000,
      rejectUnauthorized: !allowSelfSigned,
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");

      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        const statusCode = Number(res.statusCode || 0);
        if (statusCode < 200 || statusCode >= 300) {
          const error = new Error(`HTTP ${statusCode}`);
          error.responseStatus = statusCode;
          error.requestPath = String(pathname || "").trim();
          reject(error);
          return;
        }

        try {
          resolve(body ? JSON.parse(body) : []);
        } catch {
          const error = new Error("REST-Endpunkt liefert kein gueltiges JSON.");
          error.requestPath = String(pathname || "").trim();
          reject(error);
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      const error = new Error("Zeitueberschreitung beim REST-Verbindungstest.");
      error.code = "ETIMEDOUT";
      error.requestPath = String(pathname || "").trim();
      reject(error);
    });

    req.on("error", (error) => {
      error.requestPath = String(pathname || "").trim();
      reject(error);
    });

    req.end();
  });
}

function firstDefinedValue(entry, keys = []) {
  for (const key of keys) {
    if (entry && entry[key] !== undefined && entry[key] !== null) {
      return entry[key];
    }
  }
  return null;
}

function extractClassCode(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = extractClassCode(entry);
      if (nested) return nested;
    }
    return "";
  }
  if (typeof value === "object") {
    return String(firstDefinedValue(value, [
      "kuerzel",
      "kuerzelAnzeige",
      "kurzbezeichnung",
      "klasse",
      "class_code",
      "classCode",
      "code",
      "klassenbezeichnung",
      "anzeigename",
      "name",
      "bezeichnung",
      "text",
      "description",
      "label",
      "id",
    ]) || "").trim();
  }
  return "";
}

function extractSchoolSections(payload) {
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const nested = extractSchoolSections(entry);
      if (nested.length) return nested;
    }
    return [];
  }
  if (!payload || typeof payload !== "object") return [];

  const direct = payload.abschnitte || payload.sections || payload.schuljahresabschnitte || payload.items || [];
  return Array.isArray(direct) ? direct : [];
}

// EF-Regel: Nur wenn der uebergebene Wert exakt "DF" ist, wird ef = 1 gesetzt.
// Alle anderen Werte werden als ef = 0 behandelt.
const previewSchoolYearProgress = {
  active: false,
  action: "",
  current_school: "",
  current_snr: "",
  completed_sources: 0,
  total_sources: 0,
  abort_requested: false,
  was_aborted: false,
};

function parseDelimitedLine(line, delimiter = ",") {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => String(value || "").trim());
}

function normalizeCsvHeaderKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/["']/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findCsvHeaderIndex(headerCells, aliases) {
  const normalizedAliases = aliases.map((alias) => normalizeCsvHeaderKey(alias));
  return headerCells.findIndex((cell) => normalizedAliases.includes(cell));
}

function detectCsvDelimiter(line) {
  const text = String(line || "");
  let inQuotes = false;
  let semicolonCount = 0;
  let commaCount = 0;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (inQuotes) continue;
    if (char === ";") semicolonCount += 1;
    if (char === ",") commaCount += 1;
  }

  return semicolonCount > commaCount ? ";" : ",";
}

function parseSchoolSourceCsv(csvText) {
  const normalizedText = String(csvText || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    const error = new Error("Die CSV-Datei ist leer.");
    error.statusCode = 400;
    throw error;
  }

  const delimiter = detectCsvDelimiter(lines[0]);
  const headerCells = parseDelimitedLine(lines[0], delimiter).map((cell) => normalizeCsvHeaderKey(cell));
  const headerDefinitions = [
    { key: "db_host", aliases: ["db_host", "dbhost", "host"] },
    { key: "db_name", aliases: ["db_name", "dbname", "datenbank"] },
    { key: "db_user", aliases: ["db_user", "dbuser", "user", "benutzer"] },
    { key: "db_passwd", aliases: ["db_passwd", "db_password_enc", "db_password", "passwort"] },
    { key: "snr", aliases: ["snr"] },
  ];
  const headerIndex = new Map();
  for (const definition of headerDefinitions) {
    const index = findCsvHeaderIndex(headerCells, definition.aliases);
    if (index < 0) {
      const error = new Error(`Die CSV-Datei enthaelt nicht die erforderliche Spalte ${definition.key}.`);
      error.statusCode = 400;
      throw error;
    }
    headerIndex.set(definition.key, index);
  }

  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseDelimitedLine(line, delimiter);
    return {
      row_no: rowIndex + 2,
      snr: String(cells[headerIndex.get("snr")] || "").trim(),
      db_host: String(cells[headerIndex.get("db_host")] || "").trim(),
      db_name: String(cells[headerIndex.get("db_name")] || "").trim(),
      db_user: String(cells[headerIndex.get("db_user")] || "").trim(),
      db_password_enc: String(cells[headerIndex.get("db_passwd")] || "").trim(),
    };
  }).filter((entry) =>
    entry.snr
    || entry.db_host
    || entry.db_name
    || entry.db_user
    || entry.db_password_enc
  );
}

function parseSchoolCsv(csvText) {
  const normalizedText = String(csvText || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    const error = new Error("Die CSV-Datei ist leer.");
    error.statusCode = 400;
    throw error;
  }

  const delimiter = detectCsvDelimiter(lines[0]);
  const headerCells = parseDelimitedLine(lines[0], delimiter).map((cell) => normalizeCsvHeaderKey(cell));
  const snrIndex = findCsvHeaderIndex(headerCells, ["snr"]);
  const nameIndex = findCsvHeaderIndex(headerCells, ["name"]);
  const cityIndex = findCsvHeaderIndex(headerCells, ["city"]);
  const ortIndex = findCsvHeaderIndex(headerCells, ["ort"]);
  const plzIndex = findCsvHeaderIndex(headerCells, ["plz", "postleitzahl"]);
  const strasseIndex = findCsvHeaderIndex(headerCells, ["strasse", "straße", "street"]);

  if (snrIndex < 0) {
    const error = new Error("Die CSV-Datei enthaelt nicht die erforderliche Spalte snr.");
    error.statusCode = 400;
    throw error;
  }
  if (nameIndex < 0) {
    const error = new Error("Die CSV-Datei enthaelt nicht die erforderliche Spalte name.");
    error.statusCode = 400;
    throw error;
  }
  if (cityIndex < 0 && ortIndex < 0) {
    const error = new Error("Die CSV-Datei enthaelt nicht die erforderliche Spalte city oder ort.");
    error.statusCode = 400;
    throw error;
  }

  const formIndex = findCsvHeaderIndex(headerCells, ["school_form", "schulform"]);

  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseDelimitedLine(line, delimiter);
    const city = String(
      cityIndex >= 0
        ? cells[cityIndex] || ""
        : ortIndex >= 0
          ? cells[ortIndex] || ""
          : "",
    ).trim();
    const ort = String(
      ortIndex >= 0
        ? cells[ortIndex] || ""
        : city,
    ).trim();
    return {
      row_no: rowIndex + 2,
      snr: String(cells[snrIndex] || "").trim(),
      name: String(cells[nameIndex] || "").trim(),
      city,
      plz: plzIndex >= 0 ? String(cells[plzIndex] || "").trim() : "",
      ort,
      strasse: strasseIndex >= 0 ? String(cells[strasseIndex] || "").trim() : "",
      school_form: formIndex >= 0 ? String(cells[formIndex] || "").trim() : "",
    };
  }).filter((entry) => entry.snr || entry.name || entry.city || entry.ort);
}

function parseAnmSchoolCsv(csvText) {
  const normalizedText = String(csvText || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    const error = new Error("Die CSV-Datei ist leer.");
    error.statusCode = 400;
    throw error;
  }

  const delimiter = detectCsvDelimiter(lines[0]);
  const headerCells = parseDelimitedLine(lines[0], delimiter).map((cell) => normalizeCsvHeaderKey(cell));
  const requiredColumns = ["snr", "name", "plz", "ort", "strasse", "db_host", "db_name", "db_user", "db_password_enc", "is_active"];
  const indices = {};

  for (const column of requiredColumns) {
    const index = findCsvHeaderIndex(headerCells, [column]);
    if (index < 0) {
      const error = new Error(`Die CSV-Datei enthaelt nicht die erforderliche Spalte ${column}.`);
      error.statusCode = 400;
      throw error;
    }
    indices[column] = index;
  }

  const sfIndex = findCsvHeaderIndex(headerCells, ["sf", "sf_id"]);
  if (sfIndex < 0) {
    const error = new Error("Die CSV-Datei enthaelt nicht die erforderliche Spalte sf.");
    error.statusCode = 400;
    throw error;
  }
  indices.sf = sfIndex;

  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseDelimitedLine(line, delimiter);
    return {
      row_no: rowIndex + 2,
      snr: String(cells[indices.snr] || "").trim(),
      name: String(cells[indices.name] || "").trim(),
      plz: String(cells[indices.plz] || "").trim(),
      ort: String(cells[indices.ort] || "").trim(),
      strasse: String(cells[indices.strasse] || "").trim(),
      sf_id: String(cells[indices.sf] || "").trim(),
      db_host: String(cells[indices.db_host] || "").trim(),
      db_name: String(cells[indices.db_name] || "").trim(),
      db_user: String(cells[indices.db_user] || "").trim(),
      db_password_enc: String(cells[indices.db_password_enc] || "").trim(),
      is_active: String(cells[indices.is_active] || "").trim(),
    };
  }).filter((entry) =>
    entry.snr
    || entry.name
    || entry.plz
    || entry.ort
    || entry.strasse
    || entry.sf_id
    || entry.db_host
    || entry.db_name
    || entry.db_user
    || entry.db_password_enc
    || entry.is_active
  );
}

function parseCsvBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return { valid: true, value: 1 };
  if (["1", "true", "ja", "j", "yes", "y", "aktiv"].includes(normalized)) return { valid: true, value: 1 };
  if (["0", "false", "nein", "n", "no", "inaktiv"].includes(normalized)) return { valid: true, value: 0 };
  return { valid: false, value: 0 };
}

function maskPassword(value) {
  return String(value || "").trim() ? "******" : "";
}

async function resolveSchoolFormLookup(conn) {
  const [tableRows] = await conn.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN ('anm_kat_sf', 'school_form')
    ORDER BY CASE WHEN table_name = 'anm_kat_sf' THEN 0 ELSE 1 END, table_name
    `,
  );
  const tableName = String(tableRows?.[0]?.table_name || "").trim();
  if (!tableName) {
    return {
      tableName: "",
      ids: new Set(),
      labels: new Map(),
      shortLabels: new Map(),
      codeToId: new Map(),
    };
  }

  const [columnRows] = await conn.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ?
    ORDER BY ordinal_position
    `,
    [tableName],
  );
  const columnNames = (columnRows || []).map((row) => String(row?.column_name || "").trim());
  const preferredCodeColumns = tableName === "anm_kat_sf"
    ? ["sf_kurz", "sf", "code", "label", "name"]
    : ["sf_kurz", "code", "sf", "label", "name"];
  const codeColumn = preferredCodeColumns.find((column) => columnNames.includes(column)) || "";
  const labelColumn = ["name", "label", "bezeichnung", "sf", "code", "sf_kurz"]
    .find((column) => columnNames.includes(column)) || "";
  const shortLabelColumn = ["sf_kurz", "sf", "code", "label", "name"]
    .find((column) => columnNames.includes(column)) || "";

  const selectColumns = ["sf_id"];
  if (codeColumn) selectColumns.push(codeColumn);
  if (labelColumn) selectColumns.push(labelColumn);
  if (shortLabelColumn && shortLabelColumn !== labelColumn) selectColumns.push(shortLabelColumn);
  if (columnNames.includes("sf_kurz") && !selectColumns.includes("sf_kurz")) selectColumns.push("sf_kurz");
  if (columnNames.includes("sf") && !selectColumns.includes("sf")) selectColumns.push("sf");
  if (columnNames.includes("code") && !selectColumns.includes("code")) selectColumns.push("code");
  const [rows] = await conn.query(`SELECT ${selectColumns.join(", ")} FROM ${tableName}`);
  const ids = new Set();
  const labels = new Map();
  const shortLabels = new Map();
  const codeToId = new Map();
  const idToCode = new Map();
  const normalizedCodeToCode = new Map();

  for (const row of rows || []) {
    const sfId = Number(row?.sf_id || 0);
    if (!sfId) continue;
    ids.add(sfId);
    const storageCode = String(row?.code || row?.[codeColumn] || row?.sf_kurz || "").trim();
    const shortCode = String(row?.sf_kurz || "").trim();
    if (storageCode) {
      idToCode.set(sfId, storageCode);
    }
    const acceptedCodes = [
      shortCode,
      String(row?.sf || "").trim(),
      String(row?.code || "").trim(),
      String(row?.[codeColumn] || "").trim(),
    ].filter(Boolean);
    for (const acceptedCode of acceptedCodes) {
      codeToId.set(acceptedCode.toLowerCase(), sfId);
      normalizedCodeToCode.set(acceptedCode.toLowerCase(), storageCode || acceptedCode);
    }
    labels.set(sfId, labelColumn ? String(row?.[labelColumn] || "").trim() : String(sfId));
    shortLabels.set(
      sfId,
      shortLabelColumn
        ? String(row?.[shortLabelColumn] || "").trim()
        : (labelColumn ? String(row?.[labelColumn] || "").trim() : String(sfId)),
    );
  }

  return {
    tableName,
    ids,
    labels,
    shortLabels,
    codeToId,
    idToCode,
    normalizedCodeToCode,
  };
}

async function ensureAnmSchulenTable(conn) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS anm_schulen (
      snr CHAR(6) NOT NULL,
      name VARCHAR(255) DEFAULT NULL,
      plz VARCHAR(20) DEFAULT NULL,
      ort VARCHAR(100) DEFAULT NULL,
      strasse VARCHAR(255) DEFAULT NULL,
      latitude DECIMAL(10,8) DEFAULT NULL,
      longitude DECIMAL(11,8) DEFAULT NULL,
      sf_id VARCHAR(32) DEFAULT NULL,
      db_host VARCHAR(255) DEFAULT NULL,
      db_name VARCHAR(255) DEFAULT NULL,
      db_user VARCHAR(255) DEFAULT NULL,
      db_password_enc TEXT DEFAULT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (snr),
      KEY idx_anm_schulen_is_active (is_active),
      KEY idx_anm_schulen_sf_id (sf_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
  );

  const [columns] = await conn.query("SHOW COLUMNS FROM anm_schulen");
  const columnNames = new Set((columns || []).map((column) => String(column?.Field || "").trim().toLowerCase()));

  if (!columnNames.has("is_active")) {
    await conn.query("ALTER TABLE anm_schulen ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1");
    if (columnNames.has("aktiv")) {
      await conn.query("UPDATE anm_schulen SET is_active = aktiv WHERE aktiv IS NOT NULL");
    }
  }

  if (!columnNames.has("latitude")) {
    await conn.query("ALTER TABLE anm_schulen ADD COLUMN latitude DECIMAL(10,8) DEFAULT NULL AFTER strasse");
  }

  if (!columnNames.has("longitude")) {
    await conn.query("ALTER TABLE anm_schulen ADD COLUMN longitude DECIMAL(11,8) DEFAULT NULL AFTER latitude");
  }

  const [sfColumnRows] = await conn.query("SHOW COLUMNS FROM anm_schulen LIKE 'sf_id'");
  const sfColumnType = String(sfColumnRows?.[0]?.Type || "").trim().toLowerCase();
  if (sfColumnType && !sfColumnType.startsWith("varchar")) {
    await conn.query("ALTER TABLE anm_schulen MODIFY COLUMN sf_id VARCHAR(32) DEFAULT NULL");
  }
}

function normalizeSchoolCoordinateInput(value, { min, max }) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    const error = new Error(`Ungueltiger Koordinatenwert: ${value}`);
    error.statusCode = 400;
    throw error;
  }
  return numeric;
}

function buildAnmSchoolAddressLabel(row) {
  return [
    String(row?.strasse || "").trim(),
    [String(row?.plz || "").trim(), String(row?.ort || "").trim()].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
}

function parseAnmSchoolOrsCoordinates(payload) {
  const feature = Array.isArray(payload?.features) && payload.features.length ? payload.features[0] : null;
  const coords = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
  const longitude = Number(coords?.[0]);
  const latitude = Number(coords?.[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { latitude: null, longitude: null };
  }
  return { latitude, longitude };
}

async function fetchAnmSchoolGeocode(row) {
  const apiKey = String(process.env.OPENROUTESERVICE_API_KEY || process.env.ORS_API_KEY || "").trim();
  const fetchImpl = global.fetch;
  if (!apiKey || typeof fetchImpl !== "function") {
    const error = new Error("ORS-Geocoding ist nicht konfiguriert. Bitte OPENROUTESERVICE_API_KEY oder ORS_API_KEY setzen.");
    error.statusCode = 503;
    throw error;
  }

  const addressLabel = buildAnmSchoolAddressLabel(row);
  if (!addressLabel) {
    return {
      ok: false,
      latitude: null,
      longitude: null,
      message: "Adresse unvollstaendig.",
    };
  }

  const params = new URLSearchParams();
  params.set("text", addressLabel);
  params.set("size", "1");

  try {
    const response = await fetchImpl(`https://api.openrouteservice.org/geocode/search?${params.toString()}`, {
      method: "GET",
      headers: { Authorization: apiKey },
    });
    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      return {
        ok: false,
        latitude: null,
        longitude: null,
        message: `ORS-Geocoding fehlgeschlagen (${response.status}).${responseText ? ` ${responseText.slice(0, 180)}` : ""}`.trim(),
      };
    }
    const payload = await response.json();
    const coordinates = parseAnmSchoolOrsCoordinates(payload);
    if (coordinates.latitude === null || coordinates.longitude === null) {
      return {
        ok: false,
        latitude: null,
        longitude: null,
        message: "Keine Koordinaten fuer die Adresse gefunden.",
      };
    }
    return {
      ok: true,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      message: "",
    };
  } catch (error) {
    return {
      ok: false,
      latitude: null,
      longitude: null,
      message: error?.message ? `ORS-Geocoding fehlgeschlagen: ${error.message}` : "ORS-Geocoding fehlgeschlagen.",
    };
  }
}

function normalizeComparableImportValue(value) {
  return String(value ?? "").trim();
}

function createSchoolImportPreviewRows(rows, existingRowsBySnr, schoolFormLookup = { ids: new Set(), labels: new Map(), codeToId: new Map() }) {
  const seenSnrs = new Map();
  for (const row of rows) {
    const snr = String(row?.snr || "").trim();
    if (!snr) continue;
    seenSnrs.set(snr, (seenSnrs.get(snr) || 0) + 1);
  }

  return rows.map((row) => {
    const snr = String(row?.snr || "").trim();
    const name = String(row?.name || "").trim();
    const sfIdText = String(row?.sf_id || "").trim();
    const normalizedSfCode = sfIdText ? String(schoolFormLookup.normalizedCodeToCode?.get(sfIdText.toLowerCase()) || "") : "";
    const resolvedSfId = normalizedSfCode ? Number(schoolFormLookup.codeToId?.get(normalizedSfCode.toLowerCase()) || 0) : 0;
    const aktivInfo = parseCsvBoolean(row?.is_active);
    const errors = [];

    if (!snr) errors.push("SNR fehlt");
    if (!name) errors.push("Name fehlt");
    if (snr && Number(seenSnrs.get(snr) || 0) > 1) errors.push("SNR doppelt in CSV");
    if (sfIdText && !resolvedSfId) {
      errors.push("sf_id unbekannt");
    }
    if (!aktivInfo.valid) errors.push("is_active ungueltig");

    const existingRow = snr ? (existingRowsBySnr.get(snr) || null) : null;
    const exists = Boolean(existingRow);
    const isValid = errors.length === 0;
    const normalizedTargetSfCode = normalizedSfCode || "";
    const hasChanges = existingRow ? (
      normalizeComparableImportValue(existingRow.name) !== name
      || normalizeComparableImportValue(existingRow.plz) !== normalizeComparableImportValue(row?.plz)
      || normalizeComparableImportValue(existingRow.ort) !== normalizeComparableImportValue(row?.ort)
      || normalizeComparableImportValue(existingRow.strasse) !== normalizeComparableImportValue(row?.strasse)
      || normalizeComparableImportValue(existingRow.sf_id) !== normalizedTargetSfCode
      || normalizeComparableImportValue(existingRow.db_host) !== normalizeComparableImportValue(row?.db_host)
      || normalizeComparableImportValue(existingRow.db_name) !== normalizeComparableImportValue(row?.db_name)
      || normalizeComparableImportValue(existingRow.db_user) !== normalizeComparableImportValue(row?.db_user)
      || normalizeComparableImportValue(existingRow.db_password_enc) !== normalizeComparableImportValue(row?.db_password_enc)
      || Number(existingRow.is_active ? 1 : 0) !== Number(aktivInfo.valid ? aktivInfo.value : 0)
    ) : false;
    const status = !isValid
      ? "Fehler"
      : !exists
        ? "Neu"
        : hasChanges
          ? "Aenderung"
          : "Unveraendert";
    return {
      row_no: Number(row?.row_no || 0),
      snr,
      name,
      plz: String(row?.plz || "").trim(),
      ort: String(row?.ort || "").trim(),
      strasse: String(row?.strasse || "").trim(),
      sf_id: normalizedSfCode || null,
      sf_code: sfIdText,
      school_form_name: resolvedSfId && schoolFormLookup.labels.has(resolvedSfId) ? String(schoolFormLookup.labels.get(resolvedSfId) || "").trim() : "",
      db_host: String(row?.db_host || "").trim(),
      db_name: String(row?.db_name || "").trim(),
      db_user: String(row?.db_user || "").trim(),
      db_password_masked: maskPassword(row?.db_password_enc),
      is_active: aktivInfo.valid ? aktivInfo.value : String(row?.is_active || "").trim(),
      exists,
      selected: status === "Neu" || status === "Aenderung",
      status,
      errors,
      raw: {
        db_password_enc: String(row?.db_password_enc || "").trim(),
      },
    };
  });
}

async function testSchoolSourceDraftWithSvwsConnection(source) {
  const { pruefeSvwsVerbindung } = await loadSvwsConnectionModule();
  const result = await pruefeSvwsVerbindung({
    host: source?.db_host,
    schule: source?.db_name,
    user: source?.db_user,
    passwort: source?.db_password_enc,
    timeoutMs: 5000,
  });

  return {
    status_code: "server_ok_db_ok",
    server_status: "online",
    db_status: "online",
    message: result?.meldung || "SVWS-Verbindung erfolgreich geprueft.",
    basis_url: String(result?.basisUrl || ""),
    url: String(result?.url || ""),
  };
}

function classifySvwsConnectionFailure(error) {
  const statusCode = Number(error?.statusCode || 0);
  const message = String(error?.message || "").trim();
  const isReachableButRejected =
    statusCode === 401 ||
    statusCode === 403 ||
    message.startsWith("SVWS-Server erreichbar.") ||
    message.startsWith("SVWS-Endpunkt nicht erreichbar (HTTP ");

  if (isReachableButRejected) {
    return {
      status_code: "server_ok_db_fail",
      server_status: "online",
      db_status: "offline",
      message: message || "SVWS-Server erreichbar, aber Zugriff auf die Datenbank fehlgeschlagen.",
    };
  }

  return {
    status_code: "server_fail",
    server_status: "offline",
    db_status: "unknown",
    message: message || "Verbindungstest fehlgeschlagen.",
  };
}

async function testStoredSchoolSourceWithSvwsConnection(source) {
  return await testSchoolSourceDraftWithSvwsConnection(source);
}

function extractToken(req) {
  const header = String(req.headers.authorization || "").trim();
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

function createAuthModule(poolProvider) {
  const router = express.Router();
  const revokedTokens = new Map();
  const schoolImportPreviewSessions = new Map();

  function getPool() {
    const pool = typeof poolProvider === "function" ? poolProvider() : poolProvider;
    if (!pool) {
      throw new Error("Keine Datenbankverbindung konfiguriert.");
    }
    return pool;
  }

  async function writeAuthProtokoll(req, payload) {
    try {
      await writeProtokoll(getPool(), {
        ...payload,
        ipAdresse: getClientIp(req),
      });
    } catch (error) {
      console.error("[PROTOKOLL] Eintrag konnte nicht gespeichert werden:", error?.message || error);
    }
  }

  const jwtSecret = process.env.JWT_SECRET || "change-me-in-production";
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || "8h";

  const revokedCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [token, expiresAt] of revokedTokens.entries()) {
      if (expiresAt <= now) revokedTokens.delete(token);
    }
  }, 5 * 60 * 1000);
  revokedCleanupTimer.unref?.();

  const previewCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [token, preview] of schoolImportPreviewSessions.entries()) {
      if (Number(preview?.expires_at || 0) <= now) {
        schoolImportPreviewSessions.delete(token);
      }
    }
  }, 5 * 60 * 1000);
  previewCleanupTimer.unref?.();

  function isRevoked(token) {
    const expiresAt = revokedTokens.get(token);
    if (!expiresAt) return false;
    if (expiresAt <= Date.now()) {
      revokedTokens.delete(token);
      return false;
    }
    return true;
  }

  function revokeToken(token) {
    try {
      const decoded = jwt.decode(token);
      const exp = decoded?.exp ? Number(decoded.exp) * 1000 : Date.now() + 60 * 60 * 1000;
      revokedTokens.set(token, exp);
    } catch {
      revokedTokens.set(token, Date.now() + 60 * 60 * 1000);
    }
  }

  function createSchoolImportPreviewToken() {
    return crypto.randomUUID();
  }

  function storeSchoolImportPreview(rows) {
    const token = createSchoolImportPreviewToken();
    const expiresAt = Date.now() + (15 * 60 * 1000);
    schoolImportPreviewSessions.set(token, {
      rows,
      expires_at: expiresAt,
    });
    return {
      token,
      expires_at: expiresAt,
    };
  }

  function getSchoolImportPreview(token) {
    const preview = schoolImportPreviewSessions.get(String(token || "").trim());
    if (!preview) return null;
    if (Number(preview.expires_at || 0) <= Date.now()) {
      schoolImportPreviewSessions.delete(String(token || "").trim());
      return null;
    }
    return preview;
  }

  async function loadUser(username) {
    const [rows] = await getPool().query(
      `
      SELECT
        u.user_id,
        u.username,
        u.user_fullname,
        u.email,
        u.password_hash,
        u.is_active,
        u.group_id,
        g.group_name,
        g.is_active AS group_is_active
      FROM app_user u
      LEFT JOIN app_group g ON g.group_id = u.group_id
      WHERE u.username = ? OR u.email = ?
      LIMIT 1
      `,
      [username, username],
    );

    return rows && rows[0] ? rows[0] : null;
  }

  async function loadPermissionsForUser(userId) {
    const [rows] = await getPool().query(
      `
      SELECT p.permission_key
      FROM app_user u
      JOIN app_group g ON g.group_id = u.group_id
      JOIN app_group_permission gp ON gp.group_id = g.group_id
      JOIN app_permission p ON p.permission_id = gp.permission_id
      WHERE u.user_id = ?
        AND p.is_active = 1
      ORDER BY p.permission_key
      `,
      [userId],
    );

    return (rows || [])
      .map((row) => String(row.permission_key || "").trim())
      .filter(Boolean);
  }

  function toNullableText(value, maxLength = 255) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    return text.slice(0, maxLength);
  }

  function toRequiredText(value, fieldName, maxLength = 255) {
    const text = String(value ?? "").trim().slice(0, maxLength);
    if (!text) {
      const error = new Error(`${fieldName} ist erforderlich.`);
      error.statusCode = 400;
      throw error;
    }
    return text;
  }

  function toFlag(value, fallback = 1) {
    if (value === undefined || value === null || value === "") return Number(fallback ? 1 : 0);
    if (typeof value === "boolean") return value ? 1 : 0;
    const lowered = String(value).trim().toLowerCase();
    if (["1", "true", "ja", "yes", "on"].includes(lowered)) return 1;
    if (["0", "false", "nein", "no", "off"].includes(lowered)) return 0;
    return Number(fallback ? 1 : 0);
  }

  function toPositiveInt(value, fieldName) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
      const error = new Error(`${fieldName} ist ungueltig.`);
      error.statusCode = 400;
      throw error;
    }
    return n;
  }

  function validateEmailAddress(email) {
    if (!email) return;
    const normalized = String(email).trim();
    const looksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    if (!looksValid) {
      const error = new Error("Die E-Mail-Adresse ist ungueltig.");
      error.statusCode = 400;
      throw error;
    }
  }

  function uniqueSortedInts(values) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0))]
      .sort((a, b) => a - b);
  }

  async function fetchAdminPermissions(conn) {
    const [rows] = await conn.query(
      `
      SELECT permission_id, permission_key, permission_name, description, is_active, created_at
      FROM app_permission
      ORDER BY permission_name, permission_key
      `,
    );
    return (rows || []).map((row) => ({
      permission_id: Number(row.permission_id),
      permission_key: String(row.permission_key || "").trim(),
      permission_name: String(row.permission_name || "").trim(),
      description: toNullableText(row.description),
      is_active: Number(row.is_active) === 1,
      created_at: row.created_at,
    }));
  }

  async function fetchAdminGroups(conn) {
    const [rows] = await conn.query(
      `
      SELECT
        g.group_id,
        g.group_name,
        g.group_description,
        g.is_active,
        g.created_at
      FROM app_group g
      ORDER BY g.group_name
      `,
    );

    const groups = new Map();
    for (const row of rows || []) {
      const groupId = Number(row.group_id);
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          group_id: groupId,
          group_name: String(row.group_name || "").trim(),
          group_description: toNullableText(row.group_description),
          is_active: Number(row.is_active) === 1,
          created_at: row.created_at,
        });
      }
    }

    const [permissionRows] = await conn.query(
      `
      SELECT gp.group_id, p.permission_id, p.permission_key, p.permission_name
      FROM app_group_permission gp
      JOIN app_permission p ON p.permission_id = gp.permission_id
      ORDER BY p.permission_name, p.permission_key
      `,
    );
    for (const row of permissionRows || []) {
      const group = groups.get(Number(row.group_id));
      if (!group) continue;
      if (!group.permission_ids) group.permission_ids = [];
      if (!group.permissions) group.permissions = [];
      group.permission_ids.push(Number(row.permission_id));
      group.permissions.push({
        permission_id: Number(row.permission_id),
        permission_key: String(row.permission_key || "").trim(),
        permission_name: String(row.permission_name || "").trim(),
      });
    }

    return [...groups.values()].map((group) => ({
      ...group,
      permission_ids: uniqueSortedInts(group.permission_ids || []),
      permissions: group.permissions || [],
    }));
  }

  async function fetchAdminUsers(conn) {
    const [rows] = await conn.query(
      `
      SELECT
        u.user_id,
        u.group_id,
        u.user_fullname,
        u.username,
        u.email,
        u.is_active,
        u.created_at,
        u.updated_at,
        u.last_login_at,
        g.group_name,
        g.group_description,
        g.is_active AS group_is_active
      FROM app_user u
      JOIN app_group g ON g.group_id = u.group_id
      ORDER BY u.username, u.email
      `,
    );

    return (rows || []).map((row) => ({
      user_id: Number(row.user_id),
      group_id: Number(row.group_id),
      user_fullname: toNullableText(row.user_fullname, 150),
      username: String(row.username || "").trim(),
      email: toNullableText(row.email),
      is_active: Number(row.is_active) === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_login_at: row.last_login_at,
      group_name: String(row.group_name || "").trim(),
      group_description: toNullableText(row.group_description),
      group_is_active: Number(row.group_is_active) === 1,
    }));
  }

  async function fetchAdminBootstrap() {
    const conn = getPool();

    const [permissions, groups, users, schools, schoolGroups] = await Promise.all([
      fetchAdminPermissions(conn),
      fetchAdminGroups(conn),
      fetchAdminUsers(conn),
      fetchAdminAnmSchools(conn),
      fetchAdminSchoolGroups(conn),
    ]);

    return {
      permissions,
      groups,
      users,
      schools,
      school_sources: schools,
      school_groups: schoolGroups,
      snapshots: [],
      terms: [],
      stats: {
        total_users: users.length,
        active_users: users.filter((user) => user.is_active).length,
        total_groups: groups.length,
        active_groups: groups.filter((group) => group.is_active).length,
        total_schools: schools.length,
        total_school_sources: schools.length,
        active_school_sources: schools.filter((school) => school.is_active).length,
        total_school_groups: schoolGroups.length,
        active_school_groups: schoolGroups.filter((group) => group.aktiv).length,
        total_snapshots: 0,
        total_snapshot_schools: 0,
      },
    };
  }

  async function fetchProcedureBootstrap() {
    const conn = getPool();
    const [adminSchools, schoolGroups] = await Promise.all([
      fetchAdminAnmSchools(conn),
      fetchAdminSchoolGroups(conn),
    ]);
    const schools = adminSchools.map((school) => ({
      snr: school.snr,
      name: school.name,
      school_name: school.school_name,
      plz: school.plz,
      ort: school.ort,
      strasse: school.strasse,
      latitude: school.latitude,
      longitude: school.longitude,
      sf_id: school.sf_id,
      school_form_code: school.school_form_code,
      school_form_name: school.school_form_name,
      school_form_sf: school.school_form_sf,
      is_active: school.is_active,
    }));
    return {
      schools,
      school_sources: schools,
      school_groups: schoolGroups,
    };
  }

  async function ensurePermissionIdsExist(conn, permissionIds) {
    const ids = uniqueSortedInts(permissionIds);
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const [rows] = await conn.query(
      `SELECT permission_id FROM app_permission WHERE is_active = 1 AND permission_id IN (${placeholders})`,
      ids,
    );
    const existingIds = uniqueSortedInts((rows || []).map((row) => row.permission_id));
    if (existingIds.length !== ids.length) {
      const error = new Error("Mindestens eine Berechtigung ist ungueltig oder inaktiv.");
      error.statusCode = 400;
      throw error;
    }
    return existingIds;
  }

  async function ensureGroupExists(conn, groupId) {
    const [rows] = await conn.query(
      `
      SELECT group_id, group_name
      FROM app_group
      WHERE group_id = ?
      LIMIT 1
      `,
      [groupId],
    );
    if (!rows || !rows[0]) {
      const error = new Error("Die Gruppe wurde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    return rows[0];
  }

  async function ensureSchoolGroupTables(conn) {
    await ensureAnmSchulenTable(conn);
    await conn.query(
      `
      CREATE TABLE IF NOT EXISTS anm_schulgruppe (
        id BIGINT NOT NULL AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        beschreibung TEXT NULL,
        aktiv TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_anm_schulgruppe_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
    );
    await conn.query(
      `
      CREATE TABLE IF NOT EXISTS anm_schulgruppe_schule (
        id BIGINT NOT NULL AUTO_INCREMENT,
        schulgruppe_id BIGINT NOT NULL,
        snr CHAR(6) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_schulgruppe_schule (schulgruppe_id, snr),
        KEY idx_schulgruppe_schule_snr (snr),
        CONSTRAINT fk_schulgruppe_schule_gruppe
          FOREIGN KEY (schulgruppe_id) REFERENCES anm_schulgruppe(id) ON DELETE CASCADE,
        CONSTRAINT fk_schulgruppe_schule_schule
          FOREIGN KEY (snr) REFERENCES anm_schulen(snr)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
    );
  }

  async function fetchAdminSchoolGroups(conn) {
    await ensureSchoolGroupTables(conn);
    const [rows] = await conn.query(
      `
      SELECT
        g.id,
        g.name,
        g.beschreibung,
        g.aktiv,
        g.created_at,
        g.updated_at,
        sgs.snr
      FROM anm_schulgruppe g
      LEFT JOIN anm_schulgruppe_schule sgs
        ON sgs.schulgruppe_id = g.id
      ORDER BY g.name, sgs.snr
      `,
    );

    const groups = new Map();
    for (const row of rows || []) {
      const groupId = Number(row.id || 0);
      if (!groupId) continue;
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          id: groupId,
          name: String(row.name || "").trim(),
          beschreibung: toNullableText(row.beschreibung),
          aktiv: Number(row.aktiv) === 1,
          created_at: row.created_at,
          updated_at: row.updated_at,
          schoolSnrs: [],
        });
      }
      const snr = String(row.snr || "").trim();
      if (snr) groups.get(groupId).schoolSnrs.push(snr);
    }
    return [...groups.values()];
  }

  async function ensureSchoolGroupExists(conn, groupId) {
    await ensureSchoolGroupTables(conn);
    const [rows] = await conn.query(
      `
      SELECT id, name, beschreibung, aktiv
      FROM anm_schulgruppe
      WHERE id = ?
      LIMIT 1
      `,
      [groupId],
    );
    if (!rows || !rows[0]) {
      const error = new Error("Die Schulgruppe wurde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    return rows[0];
  }

  async function ensureUniqueSchoolGroupName(conn, name, excludeId = 0) {
    const params = [String(name || "").trim()];
    let query = `
      SELECT id
      FROM anm_schulgruppe
      WHERE LOWER(name) = LOWER(?)
    `;
    if (excludeId) {
      query += " AND id <> ?";
      params.push(excludeId);
    }
    query += " LIMIT 1";
    const [rows] = await conn.query(query, params);
    if (Array.isArray(rows) && rows.length) {
      const error = new Error("Eine Schulgruppe mit diesem Namen ist bereits vorhanden.");
      error.statusCode = 409;
      throw error;
    }
  }

  async function ensureAnmSchoolExists(conn, schoolSnr) {
    await ensureAnmSchulenTable(conn);
    const [rows] = await conn.query(
      `
      SELECT snr, name
      FROM anm_schulen
      WHERE snr = ?
      LIMIT 1
      `,
      [schoolSnr],
    );
    if (!rows || !rows[0]) {
      const error = new Error("Die Schule wurde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    return rows[0];
  }

  async function ensureSchoolExists(conn, schoolSnr) {
    const [rows] = await conn.query(
      `
      SELECT snr, name
      FROM school
      WHERE snr = ?
      LIMIT 1
      `,
      [schoolSnr],
    );
    if (!rows || !rows[0]) {
      const error = new Error("Die Schule wurde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    return rows[0];
  }

  async function ensureSchoolSourceExists(conn, sourceId) {
    const [rows] = await conn.query(
      `
      SELECT source_id, snr, db_host, db_port, db_name, db_user, db_password_enc, is_active
      FROM school_source_db
      WHERE source_id = ?
      LIMIT 1
      `,
      [sourceId],
    );
    if (!rows || !rows[0]) {
      const error = new Error("Die Schulserver-Quelle wurde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    return rows[0];
  }

  async function ensureUniqueSchoolSourceBySchool(conn, schoolSnr, excludeSourceId = 0) {
    const params = [schoolSnr];
    let query = `
      SELECT source_id
      FROM school_source_db
      WHERE snr = ?
    `;
    if (excludeSourceId) {
      query += " AND source_id <> ?";
      params.push(excludeSourceId);
    }
    query += " LIMIT 1";

    const [rows] = await conn.query(query, params);
    if (rows && rows[0]) {
      const error = new Error("Fuer diese Schule existiert bereits eine Schulserver-Quelle.");
      error.statusCode = 409;
      throw error;
    }
  }

  async function loadUserById(conn, userId) {
    const [rows] = await conn.query(
      `
      SELECT
        u.user_id,
        u.group_id,
        u.username,
        u.is_active
      FROM app_user u
      WHERE u.user_id = ?
      LIMIT 1
      `,
      [userId],
    );
    if (!rows || !rows[0]) {
      const error = new Error("Der Benutzer wurde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    return rows[0];
  }

  async function groupHasAdministrationPermissions(conn, groupId) {
    const [rows] = await conn.query(
      `
      SELECT COUNT(DISTINCT p.permission_key) AS total
      FROM app_group_permission gp
      JOIN app_permission p ON p.permission_id = gp.permission_id
      WHERE gp.group_id = ?
        AND p.is_active = 1
        AND p.permission_key IN (?, ?)
      `,
      [groupId, ...ADMINISTRATION_PERMISSION_KEYS],
    );
    return Number(rows?.[0]?.total || 0) === ADMINISTRATION_PERMISSION_KEYS.length;
  }

  async function permissionIdsContainAdministration(conn, permissionIds) {
    const ids = uniqueSortedInts(permissionIds);
    if (!ids.length) return false;
    const placeholders = ids.map(() => "?").join(", ");
    const [rows] = await conn.query(
      `
      SELECT COUNT(DISTINCT permission_key) AS total
      FROM app_permission
      WHERE permission_id IN (${placeholders})
        AND is_active = 1
        AND permission_key IN (?, ?)
      `,
      [...ids, ...ADMINISTRATION_PERMISSION_KEYS],
    );
    return Number(rows?.[0]?.total || 0) === ADMINISTRATION_PERMISSION_KEYS.length;
  }

  async function countActiveAdministrationUsers(conn, { excludeUserId = 0, excludeGroupId = 0 } = {}) {
    const params = [];
    let query = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT u.user_id
        FROM app_user u
        JOIN app_group g ON g.group_id = u.group_id
        JOIN app_group_permission gp ON gp.group_id = g.group_id
        JOIN app_permission p ON p.permission_id = gp.permission_id
        WHERE u.is_active = 1
          AND g.is_active = 1
          AND p.is_active = 1
          AND p.permission_key IN ('benutzer.bearbeiten', 'gruppen.bearbeiten')
    `;
    if (excludeUserId) {
      query += " AND u.user_id <> ?";
      params.push(excludeUserId);
    }
    if (excludeGroupId) {
      query += " AND g.group_id <> ?";
      params.push(excludeGroupId);
    }
    query += `
        GROUP BY u.user_id
        HAVING COUNT(DISTINCT p.permission_key) = 2
      ) administration_users
    `;
    const [rows] = await conn.query(query, params);
    return Number(rows?.[0]?.total || 0);
  }

  async function ensureAdministrationGroupMutationAllowed(conn, currentGroup, nextIsActive, nextPermissionIds) {
    const currentlyProvidesAdministration = await groupHasAdministrationPermissions(conn, currentGroup?.group_id);
    if (!currentlyProvidesAdministration) return;
    const continuesProvidingAdministration = Number(nextIsActive) === 1
      && await permissionIdsContainAdministration(conn, nextPermissionIds);
    if (continuesProvidingAdministration) return;

    const remainingAdministrators = await countActiveAdministrationUsers(conn, {
      excludeGroupId: currentGroup.group_id,
    });
    if (remainingAdministrators <= 0) {
      const error = new Error("Die Berechtigungen des letzten aktiven Administrators duerfen nicht entzogen werden.");
      error.statusCode = 409;
      throw error;
    }
  }

  async function ensureAdministrationUserMutationAllowed(conn, userId, nextGroupId, nextIsActive) {
    const currentUser = await loadUserById(conn, userId);
    if (!await groupHasAdministrationPermissions(conn, currentUser.group_id)) return;

    await ensureGroupExists(conn, nextGroupId);
    const retainsAdministration = Number(nextIsActive) === 1
      && await groupHasAdministrationPermissions(conn, nextGroupId);
    if (retainsAdministration) return;

    const remainingAdministrators = await countActiveAdministrationUsers(conn, { excludeUserId: userId });
    if (remainingAdministrators <= 0) {
      const error = new Error("Der letzte aktive Administrator darf nicht deaktiviert, verschoben oder geloescht werden.");
      error.statusCode = 409;
      throw error;
    }
  }

  function ensureCurrentUserNotDeactivated(currentUserId, targetUserId, nextIsActive) {
    if (Number(currentUserId) > 0 && Number(targetUserId) === Number(currentUserId) && Number(nextIsActive) !== 1) {
      const error = new Error("Der aktuell eingeloggte Benutzer darf sich nicht selbst deaktivieren.");
      error.statusCode = 409;
      throw error;
    }
  }

  async function ensureUniqueGroupName(conn, groupName, excludeGroupId = 0) {
    const params = [groupName];
    let query = `
      SELECT group_id
      FROM app_group
      WHERE group_name = ?
    `;
    if (excludeGroupId) {
      query += " AND group_id <> ?";
      params.push(excludeGroupId);
    }
    query += " LIMIT 1";

    const [rows] = await conn.query(query, params);
    if (rows && rows[0]) {
      const error = new Error("Der Gruppenname ist bereits vergeben.");
      error.statusCode = 409;
      throw error;
    }
  }

  async function ensureUniqueUserData(conn, { username, email, excludeUserId = 0 }) {
    const checks = [{ field: "username", value: username, message: "Der Loginname ist bereits vergeben." }];
    if (email) {
      checks.push({ field: "email", value: email, message: "Die E-Mail-Adresse ist bereits vergeben." });
    }

    for (const check of checks) {
      const params = [check.value];
      let query = `
        SELECT user_id
        FROM app_user
        WHERE ${check.field} = ?
      `;
      if (excludeUserId) {
        query += " AND user_id <> ?";
        params.push(excludeUserId);
      }
      query += " LIMIT 1";
      const [rows] = await conn.query(query, params);
      if (rows && rows[0]) {
        const error = new Error(check.message);
        error.statusCode = 409;
        throw error;
      }
    }
  }

  function adminErrorResponse(res, error, fallbackMessage) {
    const statusCode = Number(error?.statusCode || 0);
    if (statusCode >= 400 && statusCode < 600) {
      return res.status(statusCode).json({ error: error.message || fallbackMessage });
    }
    if (Number(error?.errno) === 1062 || String(error?.code || "").toUpperCase() === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Ein Eintrag mit diesen Schluesseldaten existiert bereits." });
    }
    if (Number(error?.errno) === 1451 || String(error?.code || "").toUpperCase() === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        error: "Der Eintrag wird noch verwendet und kann deshalb nicht geloescht werden.",
      });
    }
    console.error(error);
    const technicalMessage =
      String(error?.sqlMessage || "").trim()
      || String(error?.message || "").trim()
      || fallbackMessage;
    return res.status(500).json({ error: technicalMessage });
  }

  async function syncGroupPermissions(conn, groupId, permissionIds) {
    await conn.query("DELETE FROM app_group_permission WHERE group_id = ?", [groupId]);
    if (!permissionIds.length) return;
    const values = permissionIds.map((permissionId) => [groupId, permissionId]);
    await conn.query(
      "INSERT INTO app_group_permission (group_id, permission_id) VALUES ?",
      [values],
    );
  }

  function quoteCatalogIdentifier(identifier) {
    return `\`${String(identifier || "").replace(/`/g, "``")}\``;
  }

  async function fetchCatalogTables(conn) {
    const [rows] = await conn.query(
      `
      SELECT
        table_name,
        COALESCE(table_comment, '') AS table_comment
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND LEFT(table_name, 8) = 'anm_kat_'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
      `,
    );
    return rows || [];
  }

  async function requireCatalogTable(conn, requestedTableName) {
    const tableName = String(requestedTableName || "").trim();
    if (!/^anm_kat_[a-zA-Z0-9_]+$/.test(tableName)) {
      const error = new Error("Der angeforderte Katalog ist ungueltig.");
      error.statusCode = 400;
      throw error;
    }

    const [rows] = await conn.query(
      `
      SELECT table_name, COALESCE(table_comment, '') AS table_comment
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND LEFT(table_name, 8) = 'anm_kat_'
        AND table_type = 'BASE TABLE'
      LIMIT 1
      `,
      [tableName],
    );
    if (!rows?.[0]) {
      const error = new Error("Der angeforderte Katalog wurde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    return rows[0];
  }

  function catalogInputKind(column) {
    const dataType = String(column?.data_type || "").toLowerCase();
    const columnType = String(column?.column_type || "").toLowerCase();
    if (dataType === "tinyint" && columnType === "tinyint(1)") return "boolean";
    if (["int", "bigint", "smallint", "mediumint", "tinyint", "decimal", "numeric", "float", "double", "real"].includes(dataType)) {
      return "number";
    }
    if (dataType === "date") return "date";
    if (["datetime", "timestamp"].includes(dataType)) return "datetime-local";
    if (dataType === "time") return "time";
    if (dataType === "enum") return "select";
    return "text";
  }

  function catalogEnumValues(columnType) {
    const type = String(columnType || "");
    if (!/^enum\(/i.test(type)) return [];
    const body = type.slice(type.indexOf("(") + 1, -1);
    const values = [];
    const pattern = /'((?:[^'\\]|\\.)*)'/g;
    let match;
    while ((match = pattern.exec(body))) {
      values.push(match[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\"));
    }
    return values;
  }

  async function fetchCatalogDefinition(conn, tableName) {
    const table = await requireCatalogTable(conn, tableName);
    const isEventCatalog = String(table.table_name || "") === "anm_kat_ereignisse";
    const protectedEventColumns = new Set(["id", "code", "created_at", "updated_at"]);
    const [columnRows] = await conn.query(
      `
      SELECT
        column_name,
        ordinal_position,
        column_default,
        is_nullable,
        data_type,
        column_type,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        column_key,
        extra,
        column_comment,
        generation_expression
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
      ORDER BY ordinal_position
      `,
      [table.table_name],
    );
    const columns = (columnRows || []).map((column) => {
      const extra = String(column.extra || "").toLowerCase();
      const generated = !!String(column.generation_expression || "").trim() || extra.includes("generated");
      const autoIncrement = extra.includes("auto_increment");
      const columnName = String(column.column_name);
      return {
        name: columnName,
        comment: String(column.column_comment || ""),
        data_type: String(column.data_type || ""),
        column_type: String(column.column_type || ""),
        nullable: String(column.is_nullable || "").toUpperCase() === "YES",
        default: column.column_default,
        max_length: column.character_maximum_length === null ? null : Number(column.character_maximum_length),
        precision: column.numeric_precision === null ? null : Number(column.numeric_precision),
        scale: column.numeric_scale === null ? null : Number(column.numeric_scale),
        primary: String(column.column_key || "").toUpperCase() === "PRI",
        auto_increment: autoIncrement,
        generated,
        readonly: autoIncrement
          || generated
          || String(column.column_key || "").toUpperCase() === "PRI"
          || (isEventCatalog && protectedEventColumns.has(columnName)),
        input_kind: catalogInputKind(column),
        enum_values: catalogEnumValues(column.column_type),
      };
    });
    const primaryKey = columns.filter((column) => column.primary).map((column) => column.name);
    if (!primaryKey.length) {
      const error = new Error("Der Katalog besitzt keinen Primaerschluessel und kann nicht bearbeitet werden.");
      error.statusCode = 409;
      throw error;
    }
    return {
      table: {
        name: String(table.table_name),
        comment: String(table.table_comment || ""),
        allow_insert: !isEventCatalog,
        allow_delete: !isEventCatalog,
        notice: isEventCatalog
          ? "Systemkatalog: Technische Ereigniscodes koennen nicht angelegt, umbenannt oder geloescht werden. Beim Deaktivieren wird fuer dieses Ereignis nicht mehr protokolliert."
          : "",
      },
      columns,
      primary_key: primaryKey,
    };
  }

  function catalogWhereByKey(definition, rawKey) {
    const key = rawKey && typeof rawKey === "object" ? rawKey : {};
    const params = [];
    const clauses = definition.primary_key.map((columnName) => {
      if (!Object.prototype.hasOwnProperty.call(key, columnName)) {
        const error = new Error(`Primaerschluessel ${columnName} fehlt.`);
        error.statusCode = 400;
        throw error;
      }
      params.push(key[columnName]);
      return `${quoteCatalogIdentifier(columnName)} <=> ?`;
    });
    return { sql: clauses.join(" AND "), params };
  }

  function catalogWritableValues(definition, rawValues, { insert = false } = {}) {
    const values = rawValues && typeof rawValues === "object" ? rawValues : {};
    const columnsByName = new Map(definition.columns.map((column) => [column.name, column]));
    const result = {};
    for (const [name, value] of Object.entries(values)) {
      const column = columnsByName.get(name);
      if (!column || column.readonly || (!insert && column.primary)) continue;
      result[name] = value === "" && column.nullable ? null : value;
    }
    return result;
  }

  async function fetchCatalogContents(conn, requestedTableName) {
    const definition = await fetchCatalogDefinition(conn, requestedTableName);
    const columnNames = new Set(definition.columns.map((column) => column.name));
    const orderColumns = [];
    if (columnNames.has("sortierung")) orderColumns.push("sortierung");
    for (const primaryColumn of definition.primary_key) {
      if (!orderColumns.includes(primaryColumn)) orderColumns.push(primaryColumn);
    }
    const orderSql = orderColumns.length
      ? ` ORDER BY ${orderColumns.map(quoteCatalogIdentifier).join(", ")}`
      : "";
    const [rows] = await conn.query(
      `SELECT * FROM ${quoteCatalogIdentifier(definition.table.name)}${orderSql}`,
    );
    return { ...definition, rows: rows || [] };
  }

  async function fetchAdminAnmSchools(conn) {
    await ensureAnmSchulenTable(conn);
    const schoolFormLookup = await resolveSchoolFormLookup(conn);
    const [rows] = await conn.query(
      `
      SELECT
        a.snr,
        a.name,
        a.plz,
        a.ort,
        a.strasse,
        a.latitude,
        a.longitude,
        a.sf_id,
        a.db_host,
        a.db_name,
        a.db_user,
        a.db_password_enc,
        a.is_active,
        a.created_at,
        a.updated_at
      FROM anm_schulen a
      ORDER BY a.ort, a.name, a.snr
      `,
    );

    return (rows || []).map((row) => ({
      source_id: String(row.snr || "").trim(),
      snr: String(row.snr || "").trim(),
      school_name: toNullableText(row.name, 255),
      name: toNullableText(row.name, 255),
      plz: toNullableText(row.plz, 20),
      ort: toNullableText(row.ort, 100),
      strasse: toNullableText(row.strasse, 255),
      latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
      longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
      sf_id: toNullableText(row.sf_id, 32),
      db_host: toNullableText(row.db_host, 255),
      db_name: toNullableText(row.db_name, 255),
      db_user: toNullableText(row.db_user, 255),
      db_password_enc: String(row.db_password_enc || ""),
      is_active: Number(row.is_active) === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
      school_form_code: null,
      school_form_name: row.sf_id ? toNullableText(schoolFormLookup.labels.get(Number(schoolFormLookup.codeToId.get(String(row.sf_id || "").trim().toLowerCase()) || 0)) || "", 255) : null,
      school_form_sf: row.sf_id ? toNullableText(schoolFormLookup.shortLabels.get(Number(schoolFormLookup.codeToId.get(String(row.sf_id || "").trim().toLowerCase()) || 0)) || "", 50) : null,
    }));
  }

  async function updateLastLogin(userId) {
    try {
      await getPool().query(
        "UPDATE app_user SET last_login_at = NOW() WHERE user_id = ?",
        [userId],
      );
    } catch (e) {
      console.error("updateLastLogin failed:", e?.message || e);
    }
  }

  function signToken(user) {
    const payload = {
      sub: String(user.user_id),
      username: user.username,
      user_fullname: user.user_fullname,
      email: user.email,
      groupId: user.group_id,
      groupName: user.group_name,
      permissions: user.permissions || [],
    };

    return jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn });
  }

  function authenticateToken(req, res, next) {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: "Nicht eingeloggt." });
    }
    if (isRevoked(token)) {
      return res.status(401).json({ error: "Session beendet. Bitte erneut anmelden." });
    }

    try {
      const payload = jwt.verify(token, jwtSecret);
      req.user = payload;
      req.token = token;
      next();
    } catch (e) {
      return res.status(401).json({ error: "Session abgelaufen oder ungültig." });
    }
  }

  router.post("/login", async (req, res) => {
    const username = String(req.body?.username || "").trim();
    let user = null;
    try {
      const password = String(req.body?.password || "");

      if (!username || !password) {
        await writeAuthProtokoll(req, {
          ereignisCode: "LOGIN",
          ergebnis: PROTOKOLL_ERGEBNIS.FEHLER,
          benutzername: username,
          details: { grund: "UNVOLLSTAENDIGE_ZUGANGSDATEN" },
        });
        return res.status(400).json({ error: "Username und Passwort sind erforderlich." });
      }

      user = await loadUser(username);
      if (
        !user ||
        Number(user.is_active) !== 1 ||
        Number(user.group_is_active) !== 1
      ) {
        console.warn(`[AUTH] login denied: user not found or inactive for "${username}"`);
        await writeAuthProtokoll(req, {
          ereignisCode: "LOGIN",
          ergebnis: PROTOKOLL_ERGEBNIS.FEHLER,
          benutzerId: user?.user_id,
          benutzername: user?.username || username,
          details: { grund: "UNGUELTIGE_ZUGANGSDATEN" },
        });
        return res.status(401).json({ error: "Ungültige Zugangsdaten." });
      }

      const ok = await bcrypt.compare(password, String(user.password_hash || ""));
      if (!ok) {
        console.warn(`[AUTH] login denied: invalid password for "${username}"`);
        await writeAuthProtokoll(req, {
          ereignisCode: "LOGIN",
          ergebnis: PROTOKOLL_ERGEBNIS.FEHLER,
          benutzerId: user.user_id,
          benutzername: user.username,
          details: { grund: "UNGUELTIGE_ZUGANGSDATEN" },
        });
        return res.status(401).json({ error: "Ungültige Zugangsdaten." });
      }

      const permissions = await loadPermissionsForUser(user.user_id);
      if (!permissions.length) {
        await writeAuthProtokoll(req, {
          ereignisCode: "LOGIN",
          ergebnis: PROTOKOLL_ERGEBNIS.FEHLER,
          benutzerId: user.user_id,
          benutzername: user.username,
          details: { grund: "KEINE_AKTIVEN_BERECHTIGUNGEN" },
        });
        return res.status(403).json({
          error: "Keine aktiven Berechtigungen fuer diese Gruppe.",
        });
      }
      user.permissions = permissions;

      await updateLastLogin(user.user_id);

      const token = signToken(user);
      await writeAuthProtokoll(req, {
        ereignisCode: "LOGIN",
        ergebnis: PROTOKOLL_ERGEBNIS.ERFOLG,
        benutzerId: user.user_id,
        benutzername: user.username,
      });
      return res.json({
        token,
        user: {
          user_id: user.user_id,
          username: user.username,
          user_fullname: user.user_fullname,
          email: user.email,
          group_id: user.group_id,
          group_name: user.group_name,
          permissions: user.permissions,
        },
      });
    } catch (e) {
      console.error(e);
      await writeAuthProtokoll(req, {
        ereignisCode: "LOGIN",
        ergebnis: PROTOKOLL_ERGEBNIS.FEHLER,
        benutzerId: user?.user_id,
        benutzername: user?.username || username,
        details: { grund: "TECHNISCHER_FEHLER" },
      });
      if (String(e?.message || "").includes("Keine Datenbankverbindung konfiguriert")) {
        return res.status(503).json({ error: e.message });
      }
      const connectionError = classifyAuthConnectionError(e);
      if (connectionError) {
        return res.status(503).json({ error: connectionError });
      }
      return res.status(500).json({ error: e?.message || "Login fehlgeschlagen." });
    }
  });

  router.get("/me", authenticateToken, (req, res) => {
    res.json({ user: req.user });
  });

  router.post("/verwaltungsbereich/login", authenticateToken, async (req, res) => {
    const hasManagementPermission = MANAGEMENT_PERMISSION_KEYS.some((permissionKey) => can(req.user, permissionKey));
    if (!hasManagementPermission) {
      await writeAuthProtokoll(req, {
        ereignisCode: "LOGIN_VERWALTUNGSBEREICH",
        ergebnis: PROTOKOLL_ERGEBNIS.FEHLER,
        benutzerId: req.user?.sub,
        benutzername: req.user?.username,
        details: { grund: "KEINE_VERWALTUNGSBERECHTIGUNG" },
      });
      return res.status(403).json({ error: "Fuer den Verwaltungsbereich fehlt die erforderliche Berechtigung." });
    }

    await writeAuthProtokoll(req, {
      ereignisCode: "LOGIN_VERWALTUNGSBEREICH",
      ergebnis: PROTOKOLL_ERGEBNIS.ERFOLG,
      benutzerId: req.user?.sub,
      benutzername: req.user?.username,
    });
    return res.json({ success: true });
  });

  router.post("/verwaltungsbereich/logout", authenticateToken, async (req, res) => {
    try {
      await writeAuthProtokoll(req, {
        ereignisCode: "LOGOUT_VERWALTUNGSBEREICH",
        ergebnis: PROTOKOLL_ERGEBNIS.ERFOLG,
        benutzerId: req.user?.sub,
        benutzername: req.user?.username,
      });
      revokeToken(req.token || "");
      return res.json({ success: true });
    } catch (error) {
      await writeAuthProtokoll(req, {
        ereignisCode: "LOGOUT_VERWALTUNGSBEREICH",
        ergebnis: PROTOKOLL_ERGEBNIS.FEHLER,
        benutzerId: req.user?.sub,
        benutzername: req.user?.username,
        details: { grund: "TECHNISCHER_FEHLER" },
      });
      return res.status(500).json({ error: "Der Verwaltungsbereich konnte nicht abgemeldet werden." });
    }
  });

  router.get("/fachdaten/bootstrap", authenticateToken, requirePermission("verfahren.anzeigen"), async (_req, res) => {
    try {
      res.json(await fetchProcedureBootstrap());
    } catch (error) {
      return adminErrorResponse(res, error, "Schulen und Schulgruppen konnten nicht geladen werden.");
    }
  });

  router.get("/admin/bootstrap", authenticateToken, requireAnyPermission(["benutzer.bearbeiten", "gruppen.bearbeiten"]), async (req, res) => {
    try {
      res.json(await fetchAdminBootstrap());
    } catch (error) {
      return adminErrorResponse(res, error, "Verwaltungsdaten konnten nicht geladen werden.");
    }
  });

  router.get("/admin/protokoll", authenticateToken, requireAnyPermission(PROTOCOL_VIEW_PERMISSION_KEYS), async (req, res) => {
    try {
      const requestedLimit = Number(req.query?.limit || 200);
      const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 200;
      const pool = getPool();
      const [[countRows], [rows]] = await Promise.all([
        pool.query("SELECT COUNT(*) AS total FROM app_protokoll"),
        pool.query(
          `
          SELECT
            p.id,
            DATE_FORMAT(p.zeitpunkt, '%Y-%m-%d %H:%i:%s') AS zeitpunkt,
            p.ergebnis,
            p.benutzer_id,
            p.benutzername,
            u.user_fullname,
            p.verfahren_id,
            v.bezeichnung AS verfahren_bezeichnung,
            p.runde_id,
            r.bezeichnung AS runde_bezeichnung,
            p.objekt_typ,
            p.objekt_id,
            p.aenderungen,
            p.details,
            p.ip_adresse,
            p.korrelation_id,
            e.code AS ereignis_code,
            e.bezeichnung AS ereignis_bezeichnung
          FROM app_protokoll p
          JOIN anm_kat_ereignisse e ON e.id = p.ereignis_id
          LEFT JOIN app_user u ON u.user_id = p.benutzer_id
          LEFT JOIN anm_verfahren v ON v.id = p.verfahren_id
          LEFT JOIN anm_runde r ON r.id = p.runde_id
          ORDER BY p.zeitpunkt DESC, p.id DESC
          LIMIT ?
          `,
          [limit],
        ),
      ]);

      const parseJson = (value) => {
        if (value === null || value === undefined || value === "") return null;
        if (typeof value === "object") return value;
        try {
          return JSON.parse(String(value));
        } catch {
          return String(value);
        }
      };

      return res.json({
        total: Number(countRows?.[0]?.total || 0),
        limit,
        rows: (rows || []).map((row) => ({
          ...row,
          id: Number(row.id),
          benutzer_id: row.benutzer_id === null ? null : Number(row.benutzer_id),
          verfahren_id: row.verfahren_id === null ? null : Number(row.verfahren_id),
          runde_id: row.runde_id === null ? null : Number(row.runde_id),
          aenderungen: parseJson(row.aenderungen),
          details: parseJson(row.details),
        })),
      });
    } catch (error) {
      return adminErrorResponse(res, error, "Das App-Protokoll konnte nicht geladen werden.");
    }
  });

  router.get("/admin/catalogs", authenticateToken, requireAnyPermission(CATALOG_VIEW_PERMISSION_KEYS), async (req, res) => {
    try {
      const tables = await fetchCatalogTables(getPool());
      return res.json({
        catalogs: tables.map((table) => ({
          name: String(table.table_name || ""),
          comment: String(table.table_comment || ""),
        })),
      });
    } catch (error) {
      return adminErrorResponse(res, error, "Die Kataloge konnten nicht geladen werden.");
    }
  });

  router.get("/admin/catalogs/:tableName", authenticateToken, requireAnyPermission(CATALOG_VIEW_PERMISSION_KEYS), async (req, res) => {
    try {
      return res.json(await fetchCatalogContents(getPool(), req.params.tableName));
    } catch (error) {
      return adminErrorResponse(res, error, "Der Katalog konnte nicht geladen werden.");
    }
  });

  router.post("/admin/catalogs/:tableName/changes", authenticateToken, requirePermission("kataloge.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const definition = await fetchCatalogDefinition(conn, req.params.tableName);
      const inserts = Array.isArray(req.body?.inserts) ? req.body.inserts : [];
      const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
      const deletes = Array.isArray(req.body?.deletes) ? req.body.deletes : [];
      const isEventCatalog = definition.table.name === "anm_kat_ereignisse";
      if (inserts.length + updates.length + deletes.length > 1000) {
        const error = new Error("Ein Speichervorgang darf hoechstens 1000 Aenderungen enthalten.");
        error.statusCode = 400;
        throw error;
      }
      if (isEventCatalog && (inserts.length || deletes.length)) {
        const error = new Error("Technische Ereignisse koennen in der Katalogverwaltung weder angelegt noch geloescht werden.");
        error.statusCode = 409;
        throw error;
      }
      const deactivatesEvent = isEventCatalog && updates.some((entry) => Number(entry?.values?.aktiv) === 0);
      if (deactivatesEvent && req.body?.confirm_deactivation !== true) {
        const error = new Error("Die Deaktivierung eines Protokollereignisses muss ausdruecklich bestaetigt werden.");
        error.statusCode = 409;
        throw error;
      }

      await conn.beginTransaction();

      for (const entry of deletes) {
        const where = catalogWhereByKey(definition, entry?.key);
        await conn.query(
          `DELETE FROM ${quoteCatalogIdentifier(definition.table.name)} WHERE ${where.sql}`,
          where.params,
        );
      }

      for (const entry of updates) {
        const values = catalogWritableValues(definition, entry?.values, { insert: false });
        const names = Object.keys(values);
        if (!names.length) continue;
        const where = catalogWhereByKey(definition, entry?.key);
        await conn.query(
          `UPDATE ${quoteCatalogIdentifier(definition.table.name)} SET ${names.map((name) => `${quoteCatalogIdentifier(name)} = ?`).join(", ")} WHERE ${where.sql}`,
          [...names.map((name) => values[name]), ...where.params],
        );
      }

      for (const entry of inserts) {
        const values = catalogWritableValues(definition, entry?.values, { insert: true });
        const names = Object.keys(values);
        if (!names.length) {
          await conn.query(`INSERT INTO ${quoteCatalogIdentifier(definition.table.name)} () VALUES ()`);
          continue;
        }
        await conn.query(
          `INSERT INTO ${quoteCatalogIdentifier(definition.table.name)} (${names.map(quoteCatalogIdentifier).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
          names.map((name) => values[name]),
        );
      }

      await conn.commit();
      return res.json(await fetchCatalogContents(conn, definition.table.name));
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Die Katalogaenderungen konnten nicht gespeichert werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/groups", authenticateToken, requirePermission("gruppen.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const groupName = toRequiredText(req.body?.group_name, "Gruppenname", 50);
      const groupDescription = toNullableText(req.body?.group_description, 255);
      const isActive = toFlag(req.body?.is_active, 1);
      const permissionIds = await ensurePermissionIdsExist(conn, req.body?.permission_ids);
      await ensureUniqueGroupName(conn, groupName);

      await conn.beginTransaction();
      const [result] = await conn.query(
        `
        INSERT INTO app_group (group_name, group_description, is_active)
        VALUES (?, ?, ?)
        `,
        [groupName, groupDescription, isActive],
      );
      const groupId = Number(result.insertId);
      await syncGroupPermissions(conn, groupId, permissionIds);
      await conn.commit();

      res.status(201).json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Die Gruppe konnte nicht gespeichert werden.");
    } finally {
      conn.release();
    }
  });

  router.patch("/admin/groups/:groupId", authenticateToken, requirePermission("gruppen.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const groupId = toPositiveInt(req.params.groupId, "Gruppe");
      const currentGroup = await ensureGroupExists(conn, groupId);
      const groupName = toRequiredText(req.body?.group_name, "Gruppenname", 50);
      const groupDescription = toNullableText(req.body?.group_description, 255);
      const isActive = toFlag(req.body?.is_active, 1);
      const permissionIds = await ensurePermissionIdsExist(conn, req.body?.permission_ids);
      await ensureAdministrationGroupMutationAllowed(conn, currentGroup, isActive, permissionIds);
      await ensureUniqueGroupName(conn, groupName, groupId);

      await conn.beginTransaction();
      await conn.query(
        `
        UPDATE app_group
        SET group_name = ?, group_description = ?, is_active = ?
        WHERE group_id = ?
        `,
        [groupName, groupDescription, isActive, groupId],
      );
      await syncGroupPermissions(conn, groupId, permissionIds);
      await conn.commit();

      res.json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Die Gruppe konnte nicht aktualisiert werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/users", authenticateToken, requirePermission("benutzer.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const groupId = toPositiveInt(req.body?.group_id, "Gruppe");
      const username = toRequiredText(req.body?.username, "Benutzername", 80);
      const userFullname = toNullableText(req.body?.user_fullname, 150);
      const email = toNullableText(req.body?.email, 255);
      const password = toRequiredText(req.body?.password, "Passwort", 255);
      const isActive = toFlag(req.body?.is_active, 1);

      await ensureGroupExists(conn, groupId);
      validateEmailAddress(email);
      await ensureUniqueUserData(conn, { username, email });
      const passwordHash = await bcrypt.hash(password, 10);
      await conn.beginTransaction();
      const [result] = await conn.query(
        `
        INSERT INTO app_user (
          group_id,
          user_fullname,
          username,
          email,
          password_hash,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [groupId, userFullname, username, email, passwordHash, isActive],
      );
      const userId = Number(result.insertId);
      await writeProtokoll(conn, {
        ereignisCode: "BENUTZER_ERSTELLT",
        ergebnis: PROTOKOLL_ERGEBNIS.ERFOLG,
        benutzerId: req.user?.sub,
        benutzername: req.user?.username,
        objektTyp: "BENUTZER",
        objektId: userId,
        details: {
          benutzername: username,
          voller_name: userFullname,
          gruppen_id: groupId,
          aktiv: isActive === 1,
        },
        ipAdresse: getClientIp(req),
      });
      await conn.commit();

      res.status(201).json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Der Benutzer konnte nicht angelegt werden.");
    } finally {
      conn.release();
    }
  });

  router.patch("/admin/users/:userId", authenticateToken, requirePermission("benutzer.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const userId = toPositiveInt(req.params.userId, "Benutzer");
      const currentUserId = Number(req.user?.sub || 0);
      const groupId = toPositiveInt(req.body?.group_id, "Gruppe");
      const username = toRequiredText(req.body?.username, "Benutzername", 80);
      const userFullname = toNullableText(req.body?.user_fullname, 150);
      const email = toNullableText(req.body?.email, 255);
      const isActive = toFlag(req.body?.is_active, 1);
      const password = String(req.body?.password || "").trim();

      ensureCurrentUserNotDeactivated(currentUserId, userId, isActive);
      await ensureAdministrationUserMutationAllowed(conn, userId, groupId, isActive);
      await ensureGroupExists(conn, groupId);
      validateEmailAddress(email);
      await ensureUniqueUserData(conn, { username, email, excludeUserId: userId });

      const [existingRows] = await conn.query(
        `
        SELECT user_id
        FROM app_user
        WHERE user_id = ?
        LIMIT 1
        `,
        [userId],
      );
      if (!existingRows || !existingRows[0]) {
        const error = new Error("Der Benutzer wurde nicht gefunden.");
        error.statusCode = 404;
        throw error;
      }

      await conn.query(
        `
        UPDATE app_user
        SET group_id = ?, user_fullname = ?, username = ?, email = ?, is_active = ?
        WHERE user_id = ?
        `,
        [groupId, userFullname, username, email, isActive, userId],
      );

      if (password) {
        const passwordHash = await bcrypt.hash(password, 10);
        await conn.query(
          "UPDATE app_user SET password_hash = ? WHERE user_id = ?",
          [passwordHash, userId],
        );
      }

      res.json(await fetchAdminBootstrap());
    } catch (error) {
      return adminErrorResponse(res, error, "Der Benutzer konnte nicht aktualisiert werden.");
    } finally {
      conn.release();
    }
  });

  router.delete("/admin/users/:userId", authenticateToken, requirePermission("benutzer.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const userId = toPositiveInt(req.params.userId, "Benutzer");
      const currentUserId = Number(req.user?.sub || 0);
      if (currentUserId > 0 && userId === currentUserId) {
        const error = new Error("Der aktuell eingeloggte Admin-Benutzer darf sich nicht selbst loeschen.");
        error.statusCode = 409;
        throw error;
      }
      const targetUser = await loadUserById(conn, userId);
      await ensureAdministrationUserMutationAllowed(conn, userId, targetUser.group_id, 0);

      await conn.beginTransaction();
      await conn.query("DELETE FROM app_user WHERE user_id = ?", [userId]);
      await writeProtokoll(conn, {
        ereignisCode: "BENUTZER_GELOESCHT",
        ergebnis: PROTOKOLL_ERGEBNIS.ERFOLG,
        benutzerId: req.user?.sub,
        benutzername: req.user?.username,
        objektTyp: "BENUTZER",
        objektId: userId,
        details: {
          benutzername: targetUser.username,
          gruppen_id: Number(targetUser.group_id),
          war_aktiv: Number(targetUser.is_active) === 1,
        },
        ipAdresse: getClientIp(req),
      });
      await conn.commit();
      res.json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Der Benutzer konnte nicht geloescht werden.");
    } finally {
      conn.release();
    }
  });

  router.delete("/admin/groups/:groupId", authenticateToken, requirePermission("gruppen.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const groupId = toPositiveInt(req.params.groupId, "Gruppe");
      await ensureGroupExists(conn, groupId);
      const [userRows] = await conn.query(
        `
        SELECT COUNT(*) AS total
        FROM app_user
        WHERE group_id = ?
        `,
        [groupId],
      );
      if (Number(userRows?.[0]?.total || 0) > 0) {
        const error = new Error("Die Gruppe kann nicht geloescht werden, solange Benutzer zugeordnet sind.");
        error.statusCode = 409;
        throw error;
      }

      await conn.beginTransaction();
      await conn.query("DELETE FROM app_group WHERE group_id = ?", [groupId]);
      await conn.commit();
      res.json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Die Gruppe konnte nicht geloescht werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/school-groups", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      await ensureSchoolGroupTables(conn);
      const name = toRequiredText(req.body?.name, "Name", 255);
      const beschreibung = toNullableText(req.body?.beschreibung, 4000);
      const aktiv = toFlag(req.body?.aktiv, 1);
      await ensureUniqueSchoolGroupName(conn, name);

      await conn.beginTransaction();
      await conn.query(
        `
        INSERT INTO anm_schulgruppe (name, beschreibung, aktiv)
        VALUES (?, ?, ?)
        `,
        [name, beschreibung, aktiv],
      );
      await conn.commit();
      res.status(201).json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Die Schulgruppe konnte nicht gespeichert werden.");
    } finally {
      conn.release();
    }
  });

  router.delete("/admin/school-groups/:groupId", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const groupId = toPositiveInt(req.params.groupId, "Schulgruppe");
      await ensureSchoolGroupExists(conn, groupId);
      await conn.query("DELETE FROM anm_schulgruppe WHERE id = ?", [groupId]);
      res.json(await fetchAdminBootstrap());
    } catch (error) {
      return adminErrorResponse(res, error, "Die Schulgruppe konnte nicht geloescht werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/school-groups/:groupId/schools/:snr", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const groupId = toPositiveInt(req.params.groupId, "Schulgruppe");
      const snr = toRequiredText(req.params.snr, "SNR", 6);
      await ensureSchoolGroupExists(conn, groupId);
      await ensureAnmSchoolExists(conn, snr);
      await conn.query(
        `
        INSERT INTO anm_schulgruppe_schule (schulgruppe_id, snr)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE snr = VALUES(snr)
        `,
        [groupId, snr],
      );
      res.json(await fetchAdminBootstrap());
    } catch (error) {
      return adminErrorResponse(res, error, "Die Schulzuordnung konnte nicht gespeichert werden.");
    } finally {
      conn.release();
    }
  });

  router.delete("/admin/school-groups/:groupId/schools/:snr", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const groupId = toPositiveInt(req.params.groupId, "Schulgruppe");
      const snr = toRequiredText(req.params.snr, "SNR", 6);
      await ensureSchoolGroupExists(conn, groupId);
      await conn.query(
        `
        DELETE FROM anm_schulgruppe_schule
        WHERE schulgruppe_id = ? AND snr = ?
        `,
        [groupId, snr],
      );
      res.json(await fetchAdminBootstrap());
    } catch (error) {
      return adminErrorResponse(res, error, "Die Schulzuordnung konnte nicht entfernt werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/school-sources", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      const schoolId = toRequiredText(req.body?.snr, "Schule", 6);
      const dbHost = toRequiredText(req.body?.db_host, "Server", 255);
      const dbPort = parseOptionalSchoolSourcePort(req.body?.db_port);
      const dbName = toRequiredText(req.body?.db_name, "Datenbank", 255);
      const dbUser = toRequiredText(req.body?.db_user, "DB-Benutzer", 255);
      const dbPasswordEnc = String(req.body?.db_password_enc || "").slice(0, 4000);
      const isActive = toFlag(req.body?.is_active, 1);

      await ensureSchoolExists(conn, schoolId);
      await ensureUniqueSchoolSourceBySchool(conn, schoolId);

      const [insertResult] = await conn.query(
        `
        INSERT INTO school_source_db (
          snr,
          db_host,
          db_port,
          db_name,
          db_user,
          db_password_enc,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [schoolId, dbHost, dbPort, dbName, dbUser, dbPasswordEnc, isActive],
      );

      const sourceId = Number(insertResult?.insertId || 0);
      if (!sourceId) {
        const error = new Error("Die Schulserver-Quelle konnte nicht angelegt werden.");
        error.statusCode = 500;
        throw error;
      }

      const createdSource = await ensureSchoolSourceExists(conn, sourceId);
      const insertVerified =
        String(createdSource.snr || "").trim() === schoolId &&
        String(createdSource.db_host || "").trim() === dbHost &&
        Number(createdSource.db_port || 0) === dbPort &&
        String(createdSource.db_name || "").trim() === dbName &&
        String(createdSource.db_user || "").trim() === dbUser &&
        Number(createdSource.is_active || 0) === isActive;

      if (!insertVerified) {
        const error = new Error("Die Schulserver-Quelle wurde nach dem Speichern nicht korrekt in der DB angelegt.");
        error.statusCode = 500;
        throw error;
      }

      await conn.commit();

      const bootstrap = await fetchAdminBootstrap();
      const bootstrapSource = Array.isArray(bootstrap?.school_sources)
        ? bootstrap.school_sources.find((entry) => Number(entry?.source_id || 0) === sourceId) || null
        : null;

      res.status(201).json({
        ...bootstrap,
        created_source: bootstrapSource,
      });
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Die Schulserver-Quelle konnte nicht angelegt werden.");
    } finally {
      conn.release();
    }
  });

  async function handleSchoolImportPreview(req, res) {
    const conn = await getPool().getConnection();
    try {
      await ensureAnmSchulenTable(conn);

      const csvText = String(req.body?.csv_text || "");
      const parsedRows = parseAnmSchoolCsv(csvText);
      const snrs = [...new Set(parsedRows.map((row) => String(row?.snr || "").trim()).filter(Boolean))];
      const existingRowsBySnr = new Map();
      const schoolFormLookup = await resolveSchoolFormLookup(conn);

      if (snrs.length) {
        const placeholders = snrs.map(() => "?").join(", ");
        const [existingRows] = await conn.query(
          `SELECT snr, name, plz, ort, strasse, sf_id, db_host, db_name, db_user, db_password_enc, is_active FROM anm_schulen WHERE snr IN (${placeholders})`,
          snrs,
        );
        for (const row of existingRows || []) {
          const snr = String(row?.snr || "").trim();
          if (!snr) continue;
          existingRowsBySnr.set(snr, {
            snr,
            name: String(row?.name || "").trim(),
            plz: String(row?.plz || "").trim(),
            ort: String(row?.ort || "").trim(),
            strasse: String(row?.strasse || "").trim(),
            sf_id: String(row?.sf_id || "").trim(),
            db_host: String(row?.db_host || "").trim(),
            db_name: String(row?.db_name || "").trim(),
            db_user: String(row?.db_user || "").trim(),
            db_password_enc: String(row?.db_password_enc || "").trim(),
            is_active: Number(row?.is_active || 0) === 1,
          });
        }
      }

      const previewRows = createSchoolImportPreviewRows(parsedRows, existingRowsBySnr, schoolFormLookup);
      const session = storeSchoolImportPreview(previewRows);
      const validRows = previewRows.filter((row) => row.status !== "Fehler");
      const invalidRows = previewRows.filter((row) => row.status === "Fehler");

      return res.json({
        preview_token: session.token,
        expires_at: new Date(session.expires_at).toISOString(),
        summary: {
          total_rows: previewRows.length,
          valid_rows: validRows.length,
          invalid_rows: invalidRows.length,
          selected_rows: validRows.filter((row) => row.selected).length,
        },
        rows: previewRows.map((row) => ({
          row_no: row.row_no,
          snr: row.snr,
          name: row.name,
          plz: row.plz,
          ort: row.ort,
          strasse: row.strasse,
          sf_id: row.sf_id,
          sf_code: row.sf_code,
          school_form_name: row.school_form_name,
          db_host: row.db_host,
          db_name: row.db_name,
          db_user: row.db_user,
          db_password_masked: row.db_password_masked,
          is_active: row.is_active,
          exists: row.exists,
          selected: row.selected,
          status: row.status,
          errors: row.errors,
        })),
      });
    } catch (error) {
      return adminErrorResponse(res, error, "Die CSV-Vorschau fuer Schulen ist fehlgeschlagen.");
    } finally {
      conn.release();
    }
  }

  async function handleSchoolImport(req, res) {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      await ensureAnmSchulenTable(conn);

      const previewToken = String(req.body?.preview_token || "").trim();
      const preview = getSchoolImportPreview(previewToken);
      if (!preview) {
        const error = new Error("Die Vorschau ist abgelaufen oder nicht mehr vorhanden. Bitte die CSV-Datei erneut laden.");
        error.statusCode = 409;
        throw error;
      }

      const selectedRowNos = Array.isArray(req.body?.selected_row_nos)
        ? req.body.selected_row_nos.map((value) => Number(value || 0)).filter((value) => value > 0)
        : [];
      const selectedRowSet = new Set(selectedRowNos);
      const previewRows = Array.isArray(preview.rows) ? preview.rows : [];
      const importRows = previewRows.filter((row) => selectedRowSet.has(Number(row?.row_no || 0)) && row?.status !== "Fehler");

      if (!selectedRowSet.size) {
        const error = new Error("Bitte mindestens eine gueltige Zeile fuer den Import auswaehlen.");
        error.statusCode = 400;
        throw error;
      }
      if (!importRows.length) {
        const error = new Error("Es wurden keine gueltigen Vorschau-Zeilen fuer den Import ausgewaehlt.");
        error.statusCode = 400;
        throw error;
      }

      const schoolFormLookup = await resolveSchoolFormLookup(conn);
      let createdCount = 0;
      let updatedCount = 0;
      let runtimeErrorCount = 0;
      let skippedCount = 0;

      for (const row of importRows) {
        const requestedSfCode = String(row?.sf_id || row?.sf_code || "").trim();
        const sfCode = requestedSfCode
          ? String(schoolFormLookup.normalizedCodeToCode.get(requestedSfCode.toLowerCase()) || "")
          : "";
        if (requestedSfCode && !sfCode) {
          runtimeErrorCount += 1;
          skippedCount += 1;
          continue;
        }
        const aktiv = Number(row?.is_active || 0) === 1 ? 1 : 0;
        const password = String(row?.raw?.db_password_enc || "").trim();
        const [existingRows] = await conn.query(
          "SELECT snr FROM anm_schulen WHERE snr = ? LIMIT 1",
          [row.snr],
        );
        const exists = Array.isArray(existingRows) && existingRows.length > 0;

        if (exists) {
          await conn.query(
            `
            UPDATE anm_schulen
            SET name = ?, plz = ?, ort = ?, strasse = ?, sf_id = ?, db_host = ?, db_name = ?, db_user = ?, db_password_enc = ?, is_active = ?
            WHERE snr = ?
            `,
            [row.name, row.plz, row.ort, row.strasse, sfCode || null, row.db_host, row.db_name, row.db_user, password, aktiv, row.snr],
          );
          updatedCount += 1;
        } else {
          await conn.query(
            `
            INSERT INTO anm_schulen (snr, name, plz, ort, strasse, sf_id, db_host, db_name, db_user, db_password_enc, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [row.snr, row.name, row.plz, row.ort, row.strasse, sfCode || null, row.db_host, row.db_name, row.db_user, password, aktiv],
          );
          createdCount += 1;
        }
      }

      await conn.commit();
      schoolImportPreviewSessions.delete(previewToken);

      const totalRows = previewRows.length;
      const invalidCount = previewRows.filter((row) => row.status === "Fehler").length + runtimeErrorCount;
      skippedCount += totalRows - previewRows.filter((row) => row.status !== "Fehler").length;
      const bootstrap = await fetchAdminBootstrap();

      return res.status(201).json({
        ...bootstrap,
        summary: {
          total_rows: totalRows,
          created_count: createdCount,
          updated_count: updatedCount,
          imported_count: createdCount + updatedCount,
          skipped_count: skippedCount,
          error_count: invalidCount,
        },
      });
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Der Import der Schulen ist fehlgeschlagen.");
    } finally {
      conn.release();
    }
  }

  router.post("/schulen/import/vorschau", authenticateToken, requirePermission("verfahren.bearbeiten"), handleSchoolImportPreview);
  router.post("/schulen/import", authenticateToken, requirePermission("verfahren.bearbeiten"), handleSchoolImport);

  router.post("/admin/anm-schools", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      await ensureAnmSchulenTable(conn);

      const snr = toRequiredText(req.body?.snr, "SNR", 6);
      const name = toRequiredText(req.body?.name, "Name", 255);
      const plz = toNullableText(req.body?.plz, 20);
      const ort = toNullableText(req.body?.ort, 100);
      const strasse = toNullableText(req.body?.strasse, 255);
      const latitude = normalizeSchoolCoordinateInput(req.body?.latitude, { min: -90, max: 90 });
      const longitude = normalizeSchoolCoordinateInput(req.body?.longitude, { min: -180, max: 180 });
      const requestedSfId = toNullableText(req.body?.sf_id, 32);
      let sfId = requestedSfId;
      if (requestedSfId) {
        const schoolFormLookup = await resolveSchoolFormLookup(conn);
        sfId = String(schoolFormLookup.normalizedCodeToCode.get(String(requestedSfId).toLowerCase()) || "");
        if (!sfId) {
          const error = new Error(`Schulform-Code '${requestedSfId}' wurde nicht gefunden.`);
          error.statusCode = 400;
          throw error;
        }
      }
      const dbHost = toNullableText(req.body?.db_host, 255);
      const dbName = toNullableText(req.body?.db_name, 255);
      const dbUser = toNullableText(req.body?.db_user, 255);
      const dbPasswordEnc = String(req.body?.db_password_enc || "").slice(0, 4000);
      const isActive = toFlag(req.body?.is_active, 1);

      const [existingRows] = await conn.query("SELECT snr FROM anm_schulen WHERE snr = ? LIMIT 1", [snr]);
      if (Array.isArray(existingRows) && existingRows.length) {
        const error = new Error("Fuer diese SNR existiert bereits ein Eintrag.");
        error.statusCode = 409;
        throw error;
      }

      await conn.query(
        `
        INSERT INTO anm_schulen (snr, name, plz, ort, strasse, latitude, longitude, sf_id, db_host, db_name, db_user, db_password_enc, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [snr, name, plz, ort, strasse, latitude, longitude, sfId, dbHost, dbName, dbUser, dbPasswordEnc, isActive],
      );

      await conn.commit();
      return res.status(201).json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Die Schule konnte nicht angelegt werden.");
    } finally {
      conn.release();
    }
  });

  router.patch("/admin/anm-schools/:snr", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      await ensureAnmSchulenTable(conn);

      const targetSnr = toRequiredText(req.params.snr, "SNR", 6);
      const snr = toRequiredText(req.body?.snr, "SNR", 6);
      const name = toRequiredText(req.body?.name, "Name", 255);
      const plz = toNullableText(req.body?.plz, 20);
      const ort = toNullableText(req.body?.ort, 100);
      const strasse = toNullableText(req.body?.strasse, 255);
      const latitude = normalizeSchoolCoordinateInput(req.body?.latitude, { min: -90, max: 90 });
      const longitude = normalizeSchoolCoordinateInput(req.body?.longitude, { min: -180, max: 180 });
      const requestedSfId = toNullableText(req.body?.sf_id, 32);
      let sfId = requestedSfId;
      if (requestedSfId) {
        const schoolFormLookup = await resolveSchoolFormLookup(conn);
        sfId = String(schoolFormLookup.normalizedCodeToCode.get(String(requestedSfId).toLowerCase()) || "");
        if (!sfId) {
          const error = new Error(`Schulform-Code '${requestedSfId}' wurde nicht gefunden.`);
          error.statusCode = 400;
          throw error;
        }
      }
      const dbHost = toNullableText(req.body?.db_host, 255);
      const dbName = toNullableText(req.body?.db_name, 255);
      const dbUser = toNullableText(req.body?.db_user, 255);
      const dbPasswordEnc = String(req.body?.db_password_enc || "");
      const isActive = toFlag(req.body?.is_active, 1);

      const [currentRows] = await conn.query("SELECT snr, db_password_enc FROM anm_schulen WHERE snr = ? LIMIT 1", [targetSnr]);
      const current = Array.isArray(currentRows) ? currentRows[0] : null;
      if (!current) {
        const error = new Error("Die Schule wurde nicht gefunden.");
        error.statusCode = 404;
        throw error;
      }

      await ensureSchoolGroupTables(conn);

      if (snr !== targetSnr) {
        const [groupAssignmentRows] = await conn.query(
          `
          SELECT COUNT(*) AS total
          FROM anm_schulgruppe_schule
          WHERE snr = ?
          `,
          [targetSnr],
        );
        if (Number(groupAssignmentRows?.[0]?.total || 0) > 0) {
          const error = new Error("Die SNR kann nicht geaendert werden, solange die Schule Schulgruppen zugeordnet ist.");
          error.statusCode = 409;
          throw error;
        }
        const [duplicateRows] = await conn.query("SELECT snr FROM anm_schulen WHERE snr = ? LIMIT 1", [snr]);
        if (Array.isArray(duplicateRows) && duplicateRows.length) {
          const error = new Error("Fuer diese SNR existiert bereits ein Eintrag.");
          error.statusCode = 409;
          throw error;
        }
      }

      await conn.query(
        `
        UPDATE anm_schulen
        SET snr = ?, name = ?, plz = ?, ort = ?, strasse = ?, latitude = ?, longitude = ?, sf_id = ?, db_host = ?, db_name = ?, db_user = ?, db_password_enc = ?, is_active = ?
        WHERE snr = ?
        `,
        [snr, name, plz, ort, strasse, latitude, longitude, sfId, dbHost, dbName, dbUser, dbPasswordEnc.trim() ? dbPasswordEnc.slice(0, 4000) : String(current.db_password_enc || ""), isActive, targetSnr],
      );

      await conn.commit();
      return res.json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Die Schule konnte nicht aktualisiert werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/anm-schools/geocode-missing", authenticateToken, requirePermission("verfahren.bearbeiten"), async (_req, res) => {
    const conn = await getPool().getConnection();
    try {
      await ensureAnmSchulenTable(conn);

      const [rows] = await conn.query(
        `
        SELECT snr, name, plz, ort, strasse, latitude, longitude
        FROM anm_schulen
        WHERE latitude IS NULL OR longitude IS NULL
        ORDER BY ort, name, snr
        `,
      );

      if (!Array.isArray(rows) || !rows.length) {
        return res.json({
          ...await fetchAdminBootstrap(),
          updated_count: 0,
          skipped_count: 0,
          message: "Es wurden keine Schulen mit fehlenden Koordinaten gefunden.",
          results: [],
        });
      }

      let updatedCount = 0;
      let skippedCount = 0;
      const results = [];

      for (const row of rows) {
        const result = await fetchAnmSchoolGeocode(row);
        if (!result.ok || result.latitude === null || result.longitude === null) {
          skippedCount += 1;
          results.push({
            snr: String(row?.snr || "").trim(),
            name: toNullableText(row?.name, 255),
            updated: false,
            message: result.message || "Koordinaten konnten nicht berechnet werden.",
          });
          continue;
        }

        await conn.query(
          `
          UPDATE anm_schulen
          SET latitude = ?, longitude = ?
          WHERE snr = ?
          `,
          [result.latitude, result.longitude, String(row?.snr || "").trim()],
        );

        updatedCount += 1;
        results.push({
          snr: String(row?.snr || "").trim(),
          name: toNullableText(row?.name, 255),
          updated: true,
          latitude: result.latitude,
          longitude: result.longitude,
          message: "Koordinaten aktualisiert.",
        });
      }

      return res.json({
        ...await fetchAdminBootstrap(),
        updated_count: updatedCount,
        skipped_count: skippedCount,
        results,
        message: updatedCount
          ? `${updatedCount} Schule(n) mit fehlenden Koordinaten aktualisiert.${skippedCount ? ` ${skippedCount} Schule(n) konnten nicht geocodiert werden.` : ""}`
          : "Es konnten keine fehlenden Koordinaten berechnet werden.",
      });
    } catch (error) {
      return adminErrorResponse(res, error, "Die fehlenden Koordinaten konnten nicht berechnet werden.");
    } finally {
      conn.release();
    }
  });

  router.delete("/admin/anm-schools/:snr", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      await ensureAnmSchulenTable(conn);
      await ensureSchoolGroupTables(conn);
      const snr = toRequiredText(req.params.snr, "SNR", 6);
      const [existingRows] = await conn.query("SELECT snr FROM anm_schulen WHERE snr = ? LIMIT 1", [snr]);
      if (!Array.isArray(existingRows) || !existingRows.length) {
        const error = new Error("Die Schule wurde nicht gefunden.");
        error.statusCode = 404;
        throw error;
      }
      await conn.query("DELETE FROM anm_schulgruppe_schule WHERE snr = ?", [snr]);
      await conn.query("DELETE FROM anm_schulen WHERE snr = ?", [snr]);
      return res.json(await fetchAdminBootstrap());
    } catch (error) {
      return adminErrorResponse(res, error, "Die Schule konnte nicht geloescht werden.");
    } finally {
      conn.release();
    }
  });

  router.delete("/admin/anm-schools", authenticateToken, requirePermission("verfahren.bearbeiten"), async (_req, res) => {
    const conn = await getPool().getConnection();
    try {
      await ensureAnmSchulenTable(conn);
      await ensureSchoolGroupTables(conn);
      await conn.query("DELETE FROM anm_schulgruppe_schule");
      await conn.query("DELETE FROM anm_schulen");
      return res.json(await fetchAdminBootstrap());
    } catch (error) {
      return adminErrorResponse(res, error, "Die Schulen konnten nicht geloescht werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/schools/import-csv", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      const csvText = String(req.body?.csv_text || "");
      const overwriteExisting = toFlag(req.body?.overwrite_existing, 0) === 1;
      const selectedRowNos = Array.isArray(req.body?.selected_row_nos)
        ? req.body.selected_row_nos.map((value) => Number(value || 0)).filter((value) => value > 0)
        : [];
      const selectedRowSet = selectedRowNos.length ? new Set(selectedRowNos) : null;
      const rows = parseSchoolCsv(csvText).filter((row) => !selectedRowSet || selectedRowSet.has(Number(row.row_no || 0)));
      if (!rows.length) {
        const error = new Error("Die CSV-Datei enthaelt keine importierbaren Zeilen.");
        error.statusCode = 400;
        throw error;
      }

      const invalidRows = [];
      const duplicateSnrs = new Set();
      const seenSnrs = new Set();
      const preparedRows = [];
      const skippedEntries = [];

      for (const row of rows) {
        const schoolId = String(row.snr || "").trim();
        if (!schoolId) {
          invalidRows.push(`Zeile ${row.row_no}: Schulnummer fehlt.`);
          continue;
        }
        if (seenSnrs.has(schoolId)) {
          duplicateSnrs.add(schoolId);
        }
        seenSnrs.add(schoolId);

        const name = String(row.name || "").trim();
        const city = String(row.city || "").trim();
        const plz = String(row.plz || "").trim();
        const ort = String(row.ort || "").trim();
        const strasse = String(row.strasse || "").trim();
        const schoolForm = String(row.school_form || "").trim();

        if (!name || !city) {
          invalidRows.push(`Zeile ${row.row_no}: Unvollstaendige Daten fuer ${schoolId}.`);
          continue;
        }

        let schoolFormId = null;
        if (schoolForm) {
          const [formRows] = await conn.query(
            `
            SELECT school_form_id
            FROM school_form
            WHERE code = ? OR name = ? OR sf_kurz = ? OR sf = ?
            LIMIT 1
            `,
            [schoolForm, schoolForm, schoolForm, schoolForm]
          );
          if (formRows && formRows.length > 0) {
            schoolFormId = formRows[0].school_form_id;
          }
        }

        preparedRows.push({
          row_no: row.row_no,
          snr: schoolId,
          name,
          city,
          plz,
          ort,
          strasse,
          school_form_id: schoolFormId,
          school_form_supplied: Boolean(schoolFormId),
        });
      }

      if (duplicateSnrs.size) {
        invalidRows.push(`Doppelte Schulnummern in CSV: ${[...duplicateSnrs].sort((a, b) => a.localeCompare(b, "de", { numeric: true })).join(", ")}`);
      }

      if (invalidRows.length) {
        const error = new Error(invalidRows.join("\n"));
        error.statusCode = 400;
        throw error;
      }

      const existingEntries = [];
      for (const row of preparedRows) {
        const [existingRows] = await conn.query(
          "SELECT snr, name, city, plz, ort, strasse, school_form_id FROM school WHERE snr = ? LIMIT 1",
          [row.snr]
        );
        const existing = existingRows?.[0] || null;
        if (existing) {
          existingEntries.push({
            snr: String(existing.snr || "").trim(),
            name: row.name,
            city: row.city,
            plz: row.plz,
            ort: row.ort,
            strasse: row.strasse,
            school_form_id: existing.school_form_id,
          });
        }
      }

      if (existingEntries.length && !overwriteExisting) {
        await conn.rollback().catch(() => {});
        return res.status(409).json({
          needs_confirmation: true,
          message: `${existingEntries.length} Schule(n) sind bereits vorhanden.`,
          existing_entries: existingEntries,
          import_rows: preparedRows.length,
        });
      }

      let createdCount = 0;
      let updatedCount = 0;
      const createdEntries = [];
      const updatedEntries = [];

      for (const row of preparedRows) {
        const [existingRows] = await conn.query(
          "SELECT snr FROM school WHERE snr = ? LIMIT 1",
          [row.snr]
        );
        const existing = existingRows?.[0] || null;
        if (existing) {
          const targetSchoolFormId = row.school_form_supplied ? row.school_form_id : existing.school_form_id;
          await conn.query(
            `
            UPDATE school
            SET name = ?, city = ?, plz = ?, ort = ?, strasse = ?, school_form_id = ?
            WHERE snr = ?
            `,
            [row.name, row.city, row.plz, row.ort, row.strasse, targetSchoolFormId, row.snr]
          );
          updatedCount += 1;
          updatedEntries.push({
            snr: row.snr,
            name: row.name,
            city: row.city,
            plz: row.plz,
            ort: row.ort,
            strasse: row.strasse,
          });
          continue;
        }

        await conn.query(
          `
          INSERT INTO school (snr, name, city, plz, ort, strasse, school_form_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [row.snr, row.name, row.city, row.plz, row.ort, row.strasse, row.school_form_id]
        );
        createdCount += 1;
        createdEntries.push({
          snr: row.snr,
          name: row.name,
          city: row.city,
          plz: row.plz,
          ort: row.ort,
          strasse: row.strasse,
        });
      }

      await conn.commit();
      const bootstrap = await fetchAdminBootstrap();
      return res.status(201).json({
        ...bootstrap,
        created_count: createdCount,
        updated_count: updatedCount,
        imported_count: createdCount + updatedCount,
        created_entries: createdEntries,
        updated_entries: updatedEntries,
      });
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Der CSV-Import der Schulen ist fehlgeschlagen.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/school-sources/import-csv", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      const csvText = String(req.body?.csv_text || "");
      const overwriteExisting = toFlag(req.body?.overwrite_existing, 0) === 1;
      const selectedRowNos = Array.isArray(req.body?.selected_row_nos)
        ? req.body.selected_row_nos.map((value) => Number(value || 0)).filter((value) => value > 0)
        : [];
      const selectedRowSet = selectedRowNos.length ? new Set(selectedRowNos) : null;
      const rows = parseSchoolSourceCsv(csvText).filter((row) => !selectedRowSet || selectedRowSet.has(Number(row.row_no || 0)));
      if (!rows.length) {
        const error = new Error("Die CSV-Datei enthaelt keine importierbaren Zeilen.");
        error.statusCode = 400;
        throw error;
      }

      const invalidRows = [];
      const duplicateSnrs = new Set();
      const seenSnrs = new Set();
      const preparedRows = [];

      for (const row of rows) {
        const schoolId = String(row.snr || "").trim();
        if (!schoolId) {
          invalidRows.push(`Zeile ${row.row_no}: Schulnummer fehlt.`);
          continue;
        }
        if (seenSnrs.has(schoolId)) {
          duplicateSnrs.add(schoolId);
        }
        seenSnrs.add(schoolId);

        const dbHost = String(row.db_host || "").trim();
        const dbName = String(row.db_name || "").trim();
        const dbUser = String(row.db_user || "").trim();
        const dbPasswordEnc = String(row.db_password_enc || "").trim();

        if (!dbHost || !dbName || !dbUser || !dbPasswordEnc) {
          invalidRows.push(`Zeile ${row.row_no}: Unvollstaendige Daten fuer ${schoolId}.`);
          continue;
        }

        const [schoolRows] = await conn.query(
          "SELECT snr, name FROM school WHERE snr = ? LIMIT 1",
          [schoolId],
        );
        const school = schoolRows?.[0] || null;
        if (!school) {
          skippedEntries.push({
            row_no: Number(row.row_no || 0),
            snr: schoolId,
            reason: "SNR nicht in school gefunden",
          });
          continue;
        }

        preparedRows.push({
          row_no: row.row_no,
          snr: schoolId,
          school_name: String(school.name || "").trim(),
          db_host: dbHost,
          db_name: dbName,
          db_user: dbUser,
          db_password_enc: dbPasswordEnc,
        });
      }

      if (duplicateSnrs.size) {
        invalidRows.push(`Doppelte Schulnummern in CSV: ${[...duplicateSnrs].sort((a, b) => a.localeCompare(b, "de", { numeric: true })).join(", ")}`);
      }

      if (invalidRows.length) {
        const error = new Error(invalidRows.join("\n"));
        error.statusCode = 400;
        throw error;
      }

      const existingEntries = [];
      for (const row of preparedRows) {
        const [existingRows] = await conn.query(
          "SELECT source_id, snr, db_host, db_port, db_name, db_user, is_active FROM school_source_db WHERE snr = ? LIMIT 1",
          [row.snr],
        );
        const existing = existingRows?.[0] || null;
        if (existing) {
          const targetPort = Number(existing.db_port || 0) > 0 ? Number(existing.db_port) : 3306;
          existingEntries.push({
            source_id: Number(existing.source_id || 0),
            snr: String(existing.snr || "").trim(),
            school_name: row.school_name,
            db_host: String(existing.db_host || "").trim(),
            db_port: targetPort,
            db_name: String(existing.db_name || "").trim(),
            db_user: String(existing.db_user || "").trim(),
            is_active: Number(existing.is_active || 0),
          });
        }
      }

      if (existingEntries.length && !overwriteExisting) {
        await conn.rollback().catch(() => {});
        return res.status(409).json({
          needs_confirmation: true,
          message: `${existingEntries.length} Schule(n) sind bereits in school_source_db vorhanden.`,
          existing_entries: existingEntries,
          import_rows: preparedRows.length,
        });
      }

      let createdCount = 0;
      let updatedCount = 0;
      const createdEntries = [];
      const updatedEntries = [];

      for (const row of preparedRows) {
        const [existingRows] = await conn.query(
          "SELECT source_id FROM school_source_db WHERE snr = ? LIMIT 1",
          [row.snr],
        );
        const existing = existingRows?.[0] || null;
        if (existing) {
          const targetPort = Number(existing.db_port || 0) > 0 ? Number(existing.db_port) : 3306;
          await conn.query(
            `
            UPDATE school_source_db
            SET db_host = ?, db_port = ?, db_name = ?, db_user = ?, db_password_enc = ?, is_active = 1
            WHERE source_id = ?
            `,
            [row.db_host, targetPort, row.db_name, row.db_user, row.db_password_enc, Number(existing.source_id || 0)],
          );
          updatedCount += 1;
          updatedEntries.push({
            snr: row.snr,
            school_name: row.school_name,
            db_host: row.db_host,
            db_port: targetPort,
            db_name: row.db_name,
            db_user: row.db_user,
          });
          continue;
        }

        await conn.query(
          `
          INSERT INTO school_source_db (
            snr,
            db_host,
            db_port,
            db_name,
            db_user,
            db_password_enc,
            is_active
          )
          VALUES (?, ?, ?, ?, ?, ?, 1)
          `,
          [row.snr, row.db_host, 3306, row.db_name, row.db_user, row.db_password_enc],
        );
        createdCount += 1;
        createdEntries.push({
          snr: row.snr,
          school_name: row.school_name,
          db_host: row.db_host,
          db_port: 3306,
          db_name: row.db_name,
          db_user: row.db_user,
        });
      }

      await conn.commit();
      const bootstrap = await fetchAdminBootstrap();
        return res.status(201).json({
          ...bootstrap,
          created_count: createdCount,
          updated_count: updatedCount,
          imported_count: createdCount + updatedCount,
          skipped_count: skippedEntries.length,
          created_entries: createdEntries,
          updated_entries: updatedEntries,
          skipped_entries: skippedEntries,
        });
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Der CSV-Import der Schulserver-Quellen ist fehlgeschlagen.");
    } finally {
      conn.release();
    }
  });

  router.patch("/admin/school-sources/:sourceId", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      const sourceId = toPositiveInt(req.params.sourceId, "Schulserver-Quelle");
      const schoolId = toRequiredText(req.body?.snr, "Schule", 6);
      const dbHost = toRequiredText(req.body?.db_host, "Server", 255);
      const dbPort = parseOptionalSchoolSourcePort(req.body?.db_port);
      const dbName = toRequiredText(req.body?.db_name, "Datenbank", 255);
      const dbUser = toRequiredText(req.body?.db_user, "DB-Benutzer", 255);
      const incomingPassword = String(req.body?.db_password_enc || "");
      const isActive = toFlag(req.body?.is_active, 1);

      const currentSource = await ensureSchoolSourceExists(conn, sourceId);
      await ensureSchoolExists(conn, schoolId);
      await ensureUniqueSchoolSourceBySchool(conn, schoolId, sourceId);

      const dbPasswordEnc = incomingPassword.trim()
        ? incomingPassword
        : String(currentSource.db_password_enc || "");

      const [updateResult] = await conn.query(
        `
        UPDATE school_source_db
        SET snr = ?, db_host = ?, db_port = ?, db_name = ?, db_user = ?, db_password_enc = ?, is_active = ?
        WHERE source_id = ?
        `,
        [schoolId, dbHost, dbPort, dbName, dbUser, dbPasswordEnc, isActive, sourceId],
      );

      if (Number(updateResult?.affectedRows || 0) !== 1) {
        const error = new Error("Die Schulserver-Quelle konnte nicht aktualisiert werden.");
        error.statusCode = 404;
        throw error;
      }

      const updatedSource = await ensureSchoolSourceExists(conn, sourceId);
      const updateVerified =
        String(updatedSource.snr || "").trim() === schoolId &&
        String(updatedSource.db_host || "").trim() === dbHost &&
        Number(updatedSource.db_port || 0) === dbPort &&
        String(updatedSource.db_name || "").trim() === dbName &&
        String(updatedSource.db_user || "").trim() === dbUser &&
        Number(updatedSource.is_active || 0) === isActive;

      if (!updateVerified) {
        const error = new Error("Die Schulserver-Quelle wurde nach dem Speichern nicht korrekt in der DB aktualisiert.");
        error.statusCode = 500;
        throw error;
      }

      await conn.commit();

      res.json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Die Schulserver-Quelle konnte nicht aktualisiert werden.");
    } finally {
      conn.release();
    }
  });

  router.delete("/admin/school-sources/:sourceId", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const sourceId = toPositiveInt(req.params.sourceId, "Schulserver-Quelle");
      await ensureSchoolSourceExists(conn, sourceId);
      await conn.query("DELETE FROM school_source_db WHERE source_id = ?", [sourceId]);
      res.json(await fetchAdminBootstrap());
    } catch (error) {
      return adminErrorResponse(res, error, "Die Schulserver-Quelle konnte nicht geloescht werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/school-sources/:sourceId/test", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    let sourceHost = "";
    try {
      const sourceId = toPositiveInt(req.params.sourceId, "Schulserver-Quelle");
      const source = await ensureSchoolSourceExists(conn, sourceId);
      sourceHost = String(source?.db_host || "").trim();
      const result = await testStoredSchoolSourceWithSvwsConnection(source);

      await conn.query(
        `
        UPDATE school_source_db
        SET last_test_at = NOW(), last_test_status = ?
        WHERE source_id = ?
        `,
        [result.status_code, sourceId],
      );

      res.json({
        success: true,
        source_id: sourceId,
        status: result.status_code,
        server_status: result.server_status,
        db_status: result.db_status,
        message: result.message,
        bootstrap: await fetchAdminBootstrap(),
      });
    } catch (error) {
      const sourceId = Number(req.params.sourceId || 0);
      const classifiedResult = classifySvwsConnectionFailure(error);
      if (sourceId > 0) {
        await conn.query(
          `
          UPDATE school_source_db
          SET last_test_at = NOW(), last_test_status = ?
          WHERE source_id = ?
          `,
          [classifiedResult.status_code, sourceId],
        ).catch(() => {});
      }
      return res.status(400).json({
        error: classifiedResult.message || normalizeSchoolSourceRestError(error, sourceHost),
      });
    } finally {
      conn.release();
    }
  });

  router.post("/admin/school-sources/test-draft", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    try {
      const draftSource = {
        db_host: toRequiredText(req.body?.db_host, "Server", 255),
        db_port: parseOptionalSchoolSourcePort(req.body?.db_port),
        db_name: toRequiredText(req.body?.db_name, "Datenbank", 255),
        db_user: toRequiredText(req.body?.db_user, "DB-Benutzer", 255),
        db_password_enc: String(req.body?.db_password_enc || ""),
      };
      const result = await testSchoolSourceDraftWithSvwsConnection(draftSource);
      return res.json({
        success: true,
        status: result.status_code,
        server_status: result.server_status,
        db_status: result.db_status,
        message: result.message,
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode >= 400 && statusCode < 600) {
        return res.status(statusCode).json({ error: error.message || "Verbindungstest fehlgeschlagen." });
      }
      return res.status(400).json({
        error: normalizeSchoolSourceRestError(error, String(req.body?.db_host || "").trim()),
      });
    }
  });

  router.post("/admin/school-sources/test-all", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const sourceIds = Array.isArray(req.body?.source_ids)
        ? req.body.source_ids.map((value) => toPositiveInt(value, "Schulserver-Quelle"))
        : [];
      const uniqueSourceIds = [...new Set(sourceIds)];

      let rows;
      if (uniqueSourceIds.length) {
        const placeholders = uniqueSourceIds.map(() => "?").join(", ");
        [rows] = await conn.query(
          `
          SELECT source_id, snr, db_host, db_port, db_name, db_user, db_password_enc, is_active
          FROM school_source_db
          WHERE source_id IN (${placeholders})
          ORDER BY source_id
          `,
          uniqueSourceIds,
        );

        if ((rows || []).length !== uniqueSourceIds.length) {
          const error = new Error("Mindestens eine Schulserver-Quelle wurde nicht gefunden.");
          error.statusCode = 404;
          throw error;
        }
      } else {
        [rows] = await conn.query(
          `
          SELECT source_id, snr, db_host, db_port, db_name, db_user, db_password_enc, is_active
          FROM school_source_db
          ORDER BY source_id
          `,
        );
      }

      let successCount = 0;
      let failureCount = 0;
      const results = [];

      for (const source of rows || []) {
        const sourceId = Number(source?.source_id || 0);
        if (!sourceId) continue;

        try {
          const result = await testStoredSchoolSourceWithSvwsConnection(source);
          await conn.query(
            `
            UPDATE school_source_db
            SET last_test_at = NOW(), last_test_status = ?
            WHERE source_id = ?
            `,
            [result.status_code, sourceId],
          );
          successCount += 1;
          results.push({
            source_id: sourceId,
            server_status: result.server_status,
            db_status: result.db_status,
            status: result.status_code,
          });
        } catch (error) {
          const classifiedResult = classifySvwsConnectionFailure(error);
          await conn.query(
            `
            UPDATE school_source_db
            SET last_test_at = NOW(), last_test_status = ?
            WHERE source_id = ?
            `,
            [classifiedResult.status_code, sourceId],
          ).catch(() => {});
          failureCount += 1;
          results.push({
            source_id: sourceId,
            server_status: classifiedResult.server_status,
            db_status: classifiedResult.db_status,
            status: classifiedResult.status_code,
          });
        }
      }

      res.json({
        success: failureCount === 0,
        message: `Verbindungstest abgeschlossen: ${successCount} erfolgreich, ${failureCount} fehlgeschlagen.`,
        results,
        bootstrap: await fetchAdminBootstrap(),
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode >= 400 && statusCode < 600) {
        return res.status(statusCode).json({ error: error.message });
      }
      return adminErrorResponse(res, error, "Die Verbindungstests konnten nicht ausgefuehrt werden.");
    } finally {
      conn.release();
    }
  });

  router.get("/admin/school-sources/:sourceId/classes-preview", authenticateToken, requirePermission("verfahren.bearbeiten"), async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const sourceId = toPositiveInt(req.params.sourceId, "Schulserver-Quelle");
      const source = await ensureSchoolSourceExists(conn, sourceId);
      const hostname = normalizeSchoolSourceHost(source?.db_host).hostname;
      const databaseName = toRequiredText(source?.db_name, "Datenbank", 255);
      const username = String(source?.db_user || "").trim();
      const password = String(source?.db_password_enc || "");
      const encodedDbName = encodeURIComponent(databaseName);
      const payload = await fetchSchoolSourceRestJson(
        hostname,
        `/db/${encodedDbName}/schueler/aktuell`,
        { username, password },
      );

      res.json({
        success: true,
        source_id: sourceId,
        host: hostname,
        db_name: databaseName,
        payload,
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode >= 400 && statusCode < 600) {
        return res.status(statusCode).json({ error: error.message || "Klassenvorschau fehlgeschlagen." });
      }
      return res.status(400).json({
        error: normalizeSchoolSourceRestError(error),
      });
    } finally {
      conn.release();
    }
  });

  router.post("/logout", authenticateToken, async (req, res) => {
    try {
      revokeToken(req.token || "");
      await writeAuthProtokoll(req, {
        ereignisCode: "LOGOUT",
        ergebnis: PROTOKOLL_ERGEBNIS.ERFOLG,
        benutzerId: req.user?.sub,
        benutzername: req.user?.username,
      });
      res.json({ success: true });
    } catch (e) {
      await writeAuthProtokoll(req, {
        ereignisCode: "LOGOUT",
        ergebnis: PROTOKOLL_ERGEBNIS.FEHLER,
        benutzerId: req.user?.sub,
        benutzername: req.user?.username,
        details: { grund: "TECHNISCHER_FEHLER" },
      });
      return res.status(500).json({ error: "Logout fehlgeschlagen." });
    }
  });

  return { router, authenticateToken, requirePermission, can };
}

module.exports = { createAuthModule, requirePermission, can };
