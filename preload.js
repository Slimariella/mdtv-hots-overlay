// Fenêtre de réglage : la page MDTV ne reçoit que ces trois fonctions (rien d'autre de Node / Electron).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mdtvOverlay", {
  connecter: () => ipcRenderer.send("connecter"),
  // afficherMaintenant : true quand l'enregistrement vient d'une détection auto (montre le panneau direct).
  enregistrer: (lien, afficherMaintenant) => ipcRenderer.send("enregistrer", String(lien), !!afficherMaintenant),
  surEtat: rappel => {
    ipcRenderer.on("etat", (e, etat) => rappel(etat));
    ipcRenderer.invoke("etat").then(rappel);
  },
  // Appelé avec [{bt, att}] quand l'appli détecte une nouvelle partie (lobby HotS décodé).
  surPartie: rappel => ipcRenderer.on("partie", (e, joueurs) => rappel(joueurs)),
});
