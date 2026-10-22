// MDTV Overlay : fenêtre transparente, toujours au-dessus de HotS, qui affiche la page #/en-jeu.
// Verrouillé (par défaut) : les clics traversent le panneau. Ctrl+Maj+D : déverrouiller pour le déplacer / changer de build.
const { app, BrowserWindow, globalShortcut, screen, Tray, Menu, nativeImage } = require("electron");
const fs = require("fs"), path = require("path");

const PAGE = "https://mdtv-hots.pages.dev/";
const fichier = () => path.join(app.getPath("userData"), "reglages.json");
const lire = () => { try { return JSON.parse(fs.readFileSync(fichier(), "utf8")); } catch { return {}; } };
const ecrire = r => fs.writeFileSync(fichier(), JSON.stringify(r));

let fenetre, barre, verrouille, cssVerrou;

function creer() {
  const r = lire(); verrouille = !!r.verrouille; // 1re ouverture : déverrouillé, pour pouvoir se connecter
  const ecranPrincipal = screen.getPrimaryDisplay().workArea;
  fenetre = new BrowserWindow({
    width: r.width || 380, height: r.height || 420,
    x: r.x ?? ecranPrincipal.x + ecranPrincipal.width - 400, y: r.y ?? ecranPrincipal.y + 120,
    transparent: true, frame: false, resizable: true, skipTaskbar: true, hasShadow: false,
    alwaysOnTop: true, focusable: true, show: false,
    webPreferences: { partition: "persist:mdtv" }, // garde la connexion Discord d'une fois sur l'autre
  });
  fenetre.setAlwaysOnTop(true, "screen-saver");
  fenetre.webContents.setUserAgent(fenetre.webContents.getUserAgent() + " MDTVOverlay/" + app.getVersion());
  fenetre.loadURL(PAGE + "#/en-jeu");
  fenetre.once("ready-to-show", () => fenetre.showInactive());
  fenetre.webContents.on("did-finish-load", () => { cssVerrou = null; appliquerVerrou(); }); // la connexion Discord recharge la page
  const memoriser = () => ecrire({ ...lire(), ...fenetre.getBounds() });
  fenetre.on("moved", memoriser); fenetre.on("resized", memoriser);
  // Liens externes (téléchargement, Heroes Profile…) : dans le navigateur, pas dans l'overlay.
  fenetre.webContents.setWindowOpenHandler(({ url }) => { require("electron").shell.openExternal(url); return { action: "deny" }; });
}

function appliquerVerrou() {
  fenetre.setIgnoreMouseEvents(verrouille, { forward: true });
  fenetre.setFocusable(!verrouille);
  // Déverrouillé : un cadre or pour le voir, et la page devient déplaçable par son en-tête.
  const ancien = cssVerrou; cssVerrou = null;
  if (ancien) fenetre.webContents.removeInsertedCSS(ancien);
  if (!verrouille) fenetre.webContents.insertCSS("html.overlay body { outline:2px dashed #f5d78e; outline-offset:-2px; min-height:100vh !important; -webkit-app-region:drag; } html.overlay :is(button, a, input, select, li) { -webkit-app-region:no-drag; }").then(cle => cssVerrou = cle);
  if (!verrouille) fenetre.focus();
  barre?.setContextMenu(menu());
}

const basculer = () => fenetre.isVisible() ? fenetre.hide() : fenetre.showInactive();
const deverrouiller = () => { verrouille = !verrouille; ecrire({ ...lire(), verrouille }); appliquerVerrou(); };

function menu() {
  return Menu.buildFromTemplate([
    { label: "Afficher / cacher (Ctrl+Maj+B)", click: basculer },
    { label: verrouille ? "Déverrouiller (Ctrl+Maj+D)" : "Verrouiller (Ctrl+Maj+D)", click: deverrouiller },
    { label: "Recharger la page", click: () => fenetre.loadURL(PAGE + "#/en-jeu") },
    { type: "separator" },
    { label: "Quitter", role: "quit" },
  ]);
}

if (!app.requestSingleInstanceLock()) app.quit();
app.whenReady().then(() => {
  creer();
  globalShortcut.register("CommandOrControl+Shift+B", basculer);
  globalShortcut.register("CommandOrControl+Shift+D", deverrouiller);
  // Icône à côté de l'horloge : seul moyen de quitter, la fenêtre n'a pas de barre de titre.
  barre = new Tray(nativeImage.createFromPath(path.join(__dirname, "icone.png")));
  barre.setToolTip("MDTV Overlay"); barre.setContextMenu(menu());
});
app.on("will-quit", () => globalShortcut.unregisterAll());
