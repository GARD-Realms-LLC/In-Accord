const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openMeetingPopout: (meetingPath) => ipcRenderer.invoke("inaccord:open-meeting-popout", meetingPath),
  minimizeCurrentWindow: () => ipcRenderer.invoke("inaccord:minimize-current-window"),
  closeCurrentWindow: () => ipcRenderer.invoke("inaccord:close-current-window"),
  getDesktopUpdaterState: () => ipcRenderer.invoke("inaccord:get-desktop-updater-state"),
  checkForUpdatesNow: () => ipcRenderer.invoke("inaccord:check-for-updates-now"),
  relaunchToApplyUpdate: () => ipcRenderer.invoke("inaccord:relaunch-to-apply-update"),
  onDesktopUpdaterState: (listener) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    const wrappedListener = (_event, nextState) => {
      listener(nextState);
    };

    ipcRenderer.on("inaccord:desktop-updater-state", wrappedListener);

    return () => {
      ipcRenderer.removeListener("inaccord:desktop-updater-state", wrappedListener);
    };
  },
});
