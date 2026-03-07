const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  getRuntimeMeta: () => ipcRenderer.invoke("inaccord:runtime-meta-get"),
  getUpdaterStatus: () => ipcRenderer.invoke("inaccord:updater-status-get"),
  checkForUpdatesNow: () => ipcRenderer.invoke("inaccord:updater-check-now"),
  upgradeNow: () => ipcRenderer.invoke("inaccord:updater-upgrade-now"),
  restartNow: () => ipcRenderer.invoke("inaccord:updater-restart-now"),
  onUpdaterState: (callback) => {
    if (typeof callback !== "function") {
      return () => undefined;
    }

    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("inaccord:updater-state", handler);
    return () => ipcRenderer.removeListener("inaccord:updater-state", handler);
  },
});
