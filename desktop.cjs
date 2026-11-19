const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let server;

const isDev = process.env.JEV_DESKTOP_DEV === "1";
const blockedAccelerators = new Set([
  "F5",
  "F12",
  "CTRL+R",
  "CTRL+W",
  "CTRL+L",
  "CTRL+T",
  "CTRL+N",
  "CTRL+SHIFT+I",
  "CTRL+SHIFT+J",
  "CTRL+TAB",
  "ALT+LEFT",
  "ALT+RIGHT",
]);

function acceleratorFor(input) {
  const parts = [];
  if (input.control || input.meta) parts.push("CTRL");
  if (input.alt) parts.push("ALT");
  if (input.shift) parts.push("SHIFT");
  parts.push(input.key.toUpperCase());
  return parts.join("+");
}

async function createWindow() {
  const { startServer } = await import(pathToFileURL(path.join(__dirname, "server.js")).href);
  server = await startServer({ port: 0 });
  const port = server.address().port;
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#0e1116",
    fullscreen: !isDev,
    kiosk: !isDev,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (blockedAccelerators.has(acceleratorFor(input))) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}/`)) event.preventDefault();
  });
  if (!isDev) window.removeMenu();
  await window.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  server?.close();
});
