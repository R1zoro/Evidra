const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs/promises");
const http = require("http");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const runtimeScript = path.join(projectRoot, "runtime", "server.py");
let runtimeProcess = null;
let rendererProcess = null;

function localServiceHealthy(port) {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${port}/`, (response) => { response.resume(); resolve(response.statusCode >= 200 && response.statusCode < 500); });
    request.on("error", () => resolve(false));
    request.setTimeout(350, () => { request.destroy(); resolve(false); });
  });
}

async function waitForService(port) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (await localServiceHealthy(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  return false;
}

async function startRuntime() {
  if (await localServiceHealthy(8765) || process.env.EVIDRA_RUNTIME_EXTERNAL === "1") return;
  if (app.isPackaged) return;
  const python = process.env.EVIDRA_PYTHON || "python";
  runtimeProcess = spawn(python, [runtimeScript], { cwd: projectRoot, windowsHide: true, stdio: "ignore" });
  runtimeProcess.on("error", () => { runtimeProcess = null; });
  runtimeProcess.on("exit", () => { runtimeProcess = null; });
  await waitForService(8765);
}

async function startRenderer() {
  if (await localServiceHealthy(5173) || app.isPackaged) return;
  const command = process.platform === "win32" ? (process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe") : "npm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm run dev -- --host 127.0.0.1"] : ["run", "dev", "--", "--host", "127.0.0.1"];
  rendererProcess = spawn(command, args, { cwd: projectRoot, windowsHide: true, stdio: "ignore" });
  rendererProcess.on("error", () => { rendererProcess = null; });
  rendererProcess.on("exit", () => { rendererProcess = null; });
  await waitForService(5173);
}

function createWindow() {
  const window = new BrowserWindow({
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    backgroundColor: "#20303d",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  if (app.isPackaged) window.loadFile(path.join(projectRoot, "dist", "index.html"));
  else window.loadURL(process.env.EVIDRA_DEV_URL || "http://127.0.0.1:5173");
}

app.whenReady().then(async () => {
  ipcMain.on("evidra:window-control", (event, action) => { const window = BrowserWindow.fromWebContents(event.sender); if (!window) return; if (action === "minimize") window.minimize(); if (action === "maximize") window.isMaximized() ? window.unmaximize() : window.maximize(); if (action === "close") window.close(); });
  ipcMain.handle("evidra:choose-directory", async () => { const result = await dialog.showOpenDialog({ title: "Choose Evidra case folder", properties: ["openDirectory", "createDirectory"] }); return result.canceled ? null : result.filePaths[0]; });
  ipcMain.handle("evidra:choose-source", async () => { const result = await dialog.showOpenDialog({ title: "Add source reference", properties: ["openFile", "openDirectory"] }); return result.canceled ? null : result.filePaths[0]; });
  const inside = (root, target) => { const resolvedRoot = path.resolve(root); const resolvedTarget = path.resolve(target); if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) throw new Error("Path escapes case workspace"); return resolvedTarget; };
  const tree = async (root, relative = "") => { const target = inside(root, path.join(root, relative)); const entries = await fs.readdir(target, { withFileTypes: true }); return Promise.all(entries.filter((entry) => entry.name !== ".evidra").sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name)).map(async (entry) => ({ name: entry.name, path: path.join(relative, entry.name).replace(/\\/g, "/"), kind: entry.isDirectory() ? "directory" : "file", children: entry.isDirectory() ? await tree(root, path.join(relative, entry.name)) : undefined }))); };
  ipcMain.handle("evidra:tree", (_, root) => tree(root));
  ipcMain.handle("evidra:read-file", async (_, root, relative) => fs.readFile(inside(root, path.join(root, relative)), "utf8"));
  ipcMain.handle("evidra:write-file", async (_, root, relative, content) => { const target = inside(root, path.join(root, relative)); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, content, "utf8"); return relative; });
  ipcMain.handle("evidra:create-folder", async (_, root, relative) => { await fs.mkdir(inside(root, path.join(root, relative)), { recursive: true }); return relative; });
  ipcMain.handle("evidra:rename", async (_, root, from, to) => { const source = inside(root, path.join(root, from)); const destination = inside(root, path.join(root, to)); await fs.rename(source, destination); return to; });
  ipcMain.handle("evidra:delete", async (_, root, relative) => { await fs.rm(inside(root, path.join(root, relative)), { recursive: true, force: false }); return true; });
  await startRenderer();
  await startRuntime();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch((error) => { dialog.showErrorBox("Evidra could not start", error instanceof Error ? error.message : String(error)); app.quit(); });

app.on("before-quit", () => { if (runtimeProcess) runtimeProcess.kill(); if (rendererProcess) rendererProcess.kill(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
