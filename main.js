// MDTV Overlay : deux fenêtres sur la page MDTV.
// - Réglage (opaque, ouverte au lancement) : connexion Discord dans le navigateur, choix du héros et du build, « Enregistrer ».
// - Panneau (transparent, clics traversants, au-dessus de HotS) : le build (F5) ou les sorts animés du héros (F6), un à la fois.
// F5/F6 ne sont pris que pendant que HotS tourne (détecté toutes les 3 s) : le reste du temps, ils gardent leur rôle habituel.
const { app, BrowserWindow, globalShortcut, screen, Tray, Menu, nativeImage, shell, ipcMain } = require("electron");
const fs = require("fs"), path = require("path"), crypto = require("crypto"), { execFile } = require("child_process");
const { extraireJoueurs } = require("./detection-partie");

const PAGE = "https://mdtv-hots.pages.dev/";
const PROTOCOLE = "mdtv-overlay";
const APPLI_DISCORD = "1561401958089105588";
const fichier = () => path.join(app.getPath("userData"), "reglages.json");
const lire = () => { try { return JSON.parse(fs.readFileSync(fichier(), "utf8")); } catch { return {}; } };
const ecrire = r => fs.writeFileSync(fichier(), JSON.stringify(r));

let reglage, panneau, barre, verrouille = true, cssVerrou, jeuLance = false, mode = "build"; // mode : "build" | "sorts", ce qu'affiche le panneau

const enHttps = url => { try { return new URL(url).protocol === "https:"; } catch { return false; } };
const surMdtv = url => { try { const u = new URL(url); return u.protocol === "https:" && u.hostname === "mdtv-hots.pages.dev"; } catch { return false; } };

// Commun aux deux fenêtres : on ne navigue que sur la page MDTV, le reste part dans le navigateur ; aucune permission.
function durcir(f, signature) {
  const wc = f.webContents;
  wc.setUserAgent(wc.getUserAgent() + ` ${signature}/` + app.getVersion());
  wc.setWindowOpenHandler(({ url }) => { if (enHttps(url)) shell.openExternal(url); return { action: "deny" }; });
  const garder = (e, url) => { if (!surMdtv(url)) { e.preventDefault(); if (enHttps(url)) shell.openExternal(url); } };
  wc.on("will-navigate", garder); wc.on("will-redirect", garder);
  const ses = wc.session;
  ses.setPermissionRequestHandler((w, perm, rep) => rep(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDisplayMediaRequestHandler((req, rep) => rep({}));
  ses.setDevicePermissionHandler(() => false);
}

function creerReglage() {
  reglage = new BrowserWindow({
    width: 1000, height: 780, minWidth: 560, minHeight: 480, title: "MDTV Overlay — réglages",
    backgroundColor: "#0a0810", autoHideMenuBar: true, icon: path.join(__dirname, "icone.png"), show: false,
    webPreferences: { partition: "persist:mdtv", preload: path.join(__dirname, "preload.js") }, // garde la connexion d'une fois sur l'autre
  });
  durcir(reglage, "MDTVReglage");
  reglage.loadURL(PAGE + "#/en-jeu");
  reglage.once("ready-to-show", () => reglage.show());
  // Fermer la fenêtre ne quitte pas : l'appli reste près de l'horloge pour F5.
  reglage.on("close", e => { if (!app.quitte) { e.preventDefault(); reglage.hide(); } });
}

function ouvrirReglage() { reglage.show(); reglage.focus(); }

function creerPanneau() {
  const r = lire(), ecran = screen.getPrimaryDisplay().workArea;
  panneau = new BrowserWindow({
    width: r.width || 380, height: r.height || 420,
    x: r.x ?? ecran.x + ecran.width - 400, y: r.y ?? ecran.y + 120,
    transparent: true, frame: false, resizable: true, skipTaskbar: true, hasShadow: false,
    alwaysOnTop: true, focusable: false, show: false,
    webPreferences: { partition: "persist:mdtv" },
  });
  panneau.setAlwaysOnTop(true, "screen-saver");
  durcir(panneau, "MDTVOverlay");
  if (r.build) panneau.loadURL(PAGE + r.build);
  panneau.webContents.on("did-finish-load", () => { cssVerrou = null; appliquerVerrou(); });
  const memoriser = () => ecrire({ ...lire(), ...panneau.getBounds() });
  panneau.on("moved", memoriser); panneau.on("resized", memoriser);
}

// Verrouillé (toujours, sauf Ctrl+Maj+D) : les clics traversent le panneau jusqu'au jeu.
function appliquerVerrou() {
  panneau.setIgnoreMouseEvents(verrouille, { forward: true });
  panneau.setFocusable(!verrouille);
  const ancien = cssVerrou; cssVerrou = null;
  if (ancien) panneau.webContents.removeInsertedCSS(ancien);
  if (!verrouille) panneau.webContents.insertCSS("html.overlay body { outline:2px dashed #f5d78e; outline-offset:-2px; min-height:100vh !important; -webkit-app-region:drag; }").then(cle => cssVerrou = cle);
  if (!verrouille) { panneau.showInactive(); panneau.focus(); }
  barre?.setContextMenu(menu());
}
const deplacer = () => { verrouille = !verrouille; appliquerVerrou(); };

// F5 (build) et F6 (sorts) partagent le même panneau : si déjà visible dans ce mode, on cache ;
// sinon on charge la bonne page (seulement si le mode change) et on affiche.
function basculerVue(nouveauMode, suffixe) {
  const r = lire();
  if (!r.build) return ouvrirReglage(); // rien d'enregistré : rien à afficher
  if (panneau.isVisible() && mode === nouveauMode) return panneau.hide();
  if (mode !== nouveauMode) { panneau.loadURL(PAGE + r.build + suffixe); mode = nouveauMode; }
  panneau.showInactive();
}
const basculerBuild = () => basculerVue("build", "");
const basculerSorts = () => basculerVue("sorts", "/sorts");

// --- Détection de HotS ---------------------------------------------------------------------------------
function verifierJeu() {
  if (process.platform !== "win32") return changerEtat(false);
  execFile("tasklist", ["/FO", "CSV", "/NH"], { windowsHide: true }, (err, sortie) => {
    if (!err) changerEtat(/"heroesofthestorm(_x64)?\.exe"/i.test(sortie));
  });
}
function changerEtat(lance) {
  if (lance === jeuLance) return;
  jeuLance = lance;
  journal(lance ? "HotS détecté" : "HotS fermé");
  if (lance) { globalShortcut.register("F5", basculerBuild); globalShortcut.register("F6", basculerSorts); }
  else { globalShortcut.unregister("F5"); globalShortcut.unregister("F6"); panneau.hide(); }
  envoyerEtat();
  barre?.setToolTip(lance ? "MDTV Overlay — jeu détecté, F5 le build / F6 les sorts" : "MDTV Overlay — en attente du jeu");
  barre?.setContextMenu(menu());
}
const etat = () => ({ jeu: jeuLance, build: lire().build || null });
const envoyerEtat = () => reglage?.webContents.send("etat", etat());

// --- Détection auto du héros en cours de partie (lobby HotS) -----------------------------------------
// HotS écrit %TEMP%\Heroes of the Storm\TempWriteReplayPx\replay.server.battlelobby pendant le
// chargement (dossier supprimé à la fermeture). On le décode avec HeroesDecode et on envoie le
// résultat ([{bt, att}]) à la page de réglage, qui fait le lien avec le BattleTag du joueur.
const cheminHeroesDecode = () => app.isPackaged
  ? path.join(process.resourcesPath, "heroesdecode", "HeroesDecode.exe")
  : path.join(__dirname, "heroesdecode", "HeroesDecode.exe");
let dernierTraites = {}; // chemin du battlelobby -> date de modif déjà envoyée avec succès
// Journal de la détection (menu de l'icône → « Journal de détection ») : chaque étape, pour comprendre un échec à distance.
const fichierJournal = () => path.join(app.getPath("userData"), "detection.log");
let derniereLigne = "";
function journal(texte) {
  if (texte === derniereLigne) return; // pas de répétition toutes les 3 s
  derniereLigne = texte;
  const ligne = new Date().toLocaleString("fr-FR") + "  " + texte + "\n";
  try {
    const avant = fs.existsSync(fichierJournal()) ? fs.readFileSync(fichierJournal(), "utf8").split("\n").slice(-300).join("\n") : "";
    fs.writeFileSync(fichierJournal(), avant + ligne);
  } catch {}
}

function dossiersBattlelobby() {
  const base = path.join(process.env.TEMP || "", "Heroes of the Storm");
  let tout;
  try { tout = fs.readdirSync(base); } catch { journal("Dossier absent : " + base); return []; }
  const fichiers = tout.filter(n => /^TempWriteReplayP/i.test(n)).map(n => path.join(base, n, "replay.server.battlelobby")).filter(f => fs.existsSync(f));
  if (!fichiers.length) journal("Pas de fichier de partie. Contenu de " + base + " : " + (tout.join(", ") || "vide"));
  return fichiers;
}

function detecterPartie() {
  const fichiers = dossiersBattlelobby(), presents = new Set(fichiers);
  for (const chemin of Object.keys(dernierTraites)) if (!presents.has(chemin)) delete dernierTraites[chemin]; // jeu fermé : dossier disparu
  for (const fichier of fichiers) {
    let mtime;
    try { mtime = fs.statSync(fichier).mtimeMs; } catch { continue; }
    if (dernierTraites[fichier] === mtime) continue; // déjà envoyé pour cette version du fichier
    journal("Fichier de partie trouvé : " + fichier);
    execFile(cheminHeroesDecode(), ["get-pregame-json", "-p", fichier], { windowsHide: true }, (err, sortie, erreurs) => {
      // fichier verrouillé ou décodage raté : on réessaie au tour suivant (même mtime)
      if (err) return journal("Décodage raté : " + err.message.slice(0, 200) + " " + String(erreurs || "").slice(0, 300));
      try {
        const joueurs = extraireJoueurs(sortie);
        // lobby pas encore assez avancé : on réessaie au tour suivant
        if (!joueurs.length) return journal("Décodé, mais aucun joueur avec BattleTag + héros. Début : " + String(sortie).slice(0, 300).replace(/\s+/g, " "));
        dernierTraites[fichier] = mtime;
        journal("Joueurs : " + joueurs.map(j => j.bt + "=" + j.att).join(", "));
        reglage?.webContents.send("partie", joueurs);
      } catch (e) { journal("Sortie illisible : " + String(sortie).slice(0, 300).replace(/\s+/g, " ")); }
    });
  }
}

// --- Connexion Discord dans le navigateur par défaut -------------------------------------------------
// Le site reçoit le jeton de Discord et le renvoie à l'appli par un lien mdtv-overlay://connexion#access_token=…&state=…
// Le state est tiré au hasard ici et vérifié au retour : un lien qui ne vient pas de notre demande est ignoré.
function connecter() {
  const etatConnexion = "overlay:" + crypto.randomBytes(16).toString("hex");
  ecrire({ ...lire(), etatConnexion });
  shell.openExternal("https://discord.com/oauth2/authorize?" + new URLSearchParams({
    client_id: APPLI_DISCORD, response_type: "token", scope: "identify guilds", redirect_uri: PAGE, state: etatConnexion,
  }));
}
function recevoirLien(lien) {
  let u; try { u = new URL(lien); } catch { return; }
  if (u.protocol !== PROTOCOLE + ":") return;
  const p = new URLSearchParams(u.hash.slice(1)), jeton = p.get("access_token"), r = lire();
  if (!r.etatConnexion || p.get("state") !== r.etatConnexion || !/^[\w.-]{10,200}$/.test(jeton || "")) return ouvrirReglage();
  delete r.etatConnexion; ecrire(r);
  reglage.webContents.executeJavaScript(`localStorage.setItem("jeton", ${JSON.stringify(jeton)}); location.reload();`);
  if (r.build) { panneau.loadURL(PAGE + r.build); mode = "build"; }
  ouvrirReglage();
}

// Seule la page MDTV de la fenêtre de réglage peut parler à l'appli.
const deMdtv = e => e.sender === reglage?.webContents && surMdtv(e.senderFrame?.url || "");
ipcMain.on("connecter", e => deMdtv(e) && connecter());
ipcMain.on("enregistrer", (e, lien, afficherMaintenant) => {
  if (!deMdtv(e) || !/^#\/en-jeu\/[\w-]+\/\d{0,7}$/.test(lien)) return;
  ecrire({ ...lire(), build: lien });
  panneau.loadURL(PAGE + lien); mode = "build";
  envoyerEtat();
  if (afficherMaintenant && jeuLance) panneau.showInactive(); // détection auto : pas besoin d'attendre F5
});
ipcMain.handle("etat", e => deMdtv(e) ? etat() : null);
ipcMain.on("journal", (e, texte) => deMdtv(e) && journal("Page : " + String(texte).slice(0, 300)));

function menu() {
  return Menu.buildFromTemplate([
    { label: "Ouvrir les réglages", click: ouvrirReglage },
    { label: jeuLance ? "Afficher / cacher le build (F5)" : "En attente : jeu non lancé", enabled: jeuLance, click: basculerBuild },
    { label: jeuLance ? "Afficher / cacher les sorts (F6)" : "En attente : jeu non lancé", enabled: jeuLance, click: basculerSorts },
    { label: "Journal de détection", click: () => { journal("Journal ouvert"); shell.openPath(fichierJournal()); } },
    { label: verrouille ? "Déplacer le panneau (Ctrl+Maj+D)" : "Fixer le panneau (Ctrl+Maj+D)", click: deplacer },
    { type: "separator" },
    { label: "Quitter", click: () => { app.quitte = true; app.quit(); } },
  ]);
}

// Lien mdtv-overlay:// : Windows lance l'appli avec le lien en argument (ou le passe à celle déjà ouverte).
if (process.defaultApp) app.setAsDefaultProtocolClient(PROTOCOLE, process.execPath, [path.resolve(process.argv[1] || ".")]);
else app.setAsDefaultProtocolClient(PROTOCOLE);
const lienDans = argv => argv.find(a => a.startsWith(PROTOCOLE + "://"));

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (e, argv) => { const l = lienDans(argv); l ? recevoirLien(l) : ouvrirReglage(); });
  app.whenReady().then(() => {
    creerReglage(); creerPanneau();
    globalShortcut.register("CommandOrControl+Shift+D", deplacer);
    // Icône à côté de l'horloge : seul moyen de quitter.
    barre = new Tray(nativeImage.createFromPath(path.join(__dirname, "icone.png")));
    barre.setToolTip("MDTV Overlay — en attente du jeu"); barre.setContextMenu(menu());
    barre.on("click", ouvrirReglage);
    const tic = () => { verifierJeu(); if (jeuLance) detecterPartie(); };
    tic(); setInterval(tic, 3000);
    const l = lienDans(process.argv); if (l) reglage.webContents.once("did-finish-load", () => recevoirLien(l));
  });
}
app.on("before-quit", () => app.quitte = true);
app.on("will-quit", () => globalShortcut.unregisterAll());
