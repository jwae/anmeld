import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const viteBin = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const vite = spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
});

vite.on("error", (error) => {
  console.error("Vite konnte nicht gestartet werden:", error.message);
  process.exitCode = 1;
});

vite.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
