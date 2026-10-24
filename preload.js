// Fenêtre de réglage : la page MDTV ne reçoit que ces trois fonctions (rien d'autre de Node / Electron).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mdtvOverlay", {
  connecter: () => ipcRenderer.send("connecter"),
  enregistrer: lien => ipcRenderer.send("enregistrer", String(lien)),
  surEtat: rappel => {
    ipcRenderer.on("etat", (e, etat) => rappel(etat));
    ipcRenderer.invoke("etat").then(rappel);
  },
});
