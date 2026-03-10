const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  getRuntimeMeta: () => ipcRenderer.invoke("inaccord:runtime-meta-get"),
  getUpdaterStatus: () => ipcRenderer.invoke("inaccord:updater-status-get"),
  checkForUpdatesNow: () => ipcRenderer.invoke("inaccord:updater-check-now"),
  upgradeNow: () => ipcRenderer.invoke("inaccord:updater-upgrade-now"),
  restartNow: () => ipcRenderer.invoke("inaccord:updater-restart-now"),
  minimizeCurrentWindow: () => ipcRenderer.invoke("inaccord:window-minimize"),
  closeCurrentWindow: () => ipcRenderer.invoke("inaccord:window-close"),
  openMeetingPopout: (meetingPath) =>
    ipcRenderer.invoke("inaccord:meeting-popout-open", { meetingPath }),
  onMeetingPopoutClosed: (callback) => {
    if (typeof callback !== "function") {
      return () => undefined;
    }

    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("inaccord:meeting-popout-closed", handler);
    return () => ipcRenderer.removeListener("inaccord:meeting-popout-closed", handler);
  },
  onUpdaterState: (callback) => {
    if (typeof callback !== "function") {
      return () => undefined;
    }

    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("inaccord:updater-state", handler);
    return () => ipcRenderer.removeListener("inaccord:updater-state", handler);
  },
});
