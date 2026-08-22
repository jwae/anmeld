const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

async function main() {
  const migrationName = String(process.argv[2] || "").trim();
  if (!/^\d{3}_[a-z0-9_-]+\.sql$/i.test(migrationName)) {
    throw new Error("Migration als Dateiname angeben, z. B. 017_add_permission_model.sql");
  }

  const migrationPath = path.resolve(__dirname, "..", "migrations", migrationName);
  const migrationsDirectory = `${path.resolve(__dirname, "..", "migrations")}${path.sep}`;
  if (!migrationPath.startsWith(migrationsDirectory) || !fs.existsSync(migrationPath)) {
    throw new Error(`Migration nicht gefunden: ${migrationName}`);
  }

  const connection = await mysql.createConnection({
    host: String(process.env.DB_HOST || "localhost"),
    port: Number(process.env.DB_PORT || 3306),
    user: String(process.env.DB_USER || ""),
    password: String(process.env.DB_PASSWORD || ""),
    database: String(process.env.DB_NAME || ""),
    multipleStatements: true,
  });

  try {
    await connection.query(fs.readFileSync(migrationPath, "utf8"));
    console.log(`Migration ausgefuehrt: ${migrationName}`);
    const [rows] = await connection.query(
      `
      SELECT g.group_name, GROUP_CONCAT(p.permission_key ORDER BY p.permission_key) AS permissions
      FROM app_group g
      LEFT JOIN app_group_permission gp ON gp.group_id = g.group_id
      LEFT JOIN app_permission p ON p.permission_id = gp.permission_id
      WHERE p.permission_key IN (
        'verfahren.anzeigen',
        'verfahren.bearbeiten',
        'benutzer.bearbeiten',
        'gruppen.bearbeiten'
      )
      GROUP BY g.group_id, g.group_name
      ORDER BY g.group_name
      `,
    );
    for (const row of rows || []) {
      console.log(`${row.group_name}: ${row.permissions || "keine Berechtigungen"}`);
    }
    if (migrationName === "018_remove_legacy_dashboard_permissions.sql") {
      const [legacyTables] = await connection.query(
        `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN ('app_dashboard', 'app_group_dashboard')
        `,
      );
      if (legacyTables.length) {
        throw new Error("Legacy-Rechtetabellen konnten nicht vollstaendig entfernt werden.");
      }
      console.log("Legacy-Rechtetabellen entfernt: app_dashboard, app_group_dashboard");
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error?.sqlMessage || error?.message || error);
  process.exit(1);
});
