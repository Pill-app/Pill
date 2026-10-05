const {
  app, BrowserWindow, clipboard, ClipboardItem, nativeImage, ipcMain, screen,
  Tray, Menu, globalShortcut, systemPreferences, Notification, shell, safeStorage
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const { execFile } = require('child_process');

// Raccourci global pour ouvrir / fermer l'historique. Pour le changer, modifie cette ligne.
// (Cmd+Maj+V est déjà pris par « Coller et adapter le style » dans beaucoup d'apps.)
const SHORTCUT = 'Control+Alt+V';
// Raccourci global pour ouvrir le lanceur (apps, fichiers, sites)
const LAUNCH_SHORTCUT = 'Control+Alt+Space';
// Raccourci global pour ouvrir l'assistant IA
const AI_SHORTCUT = 'Control+Alt+A';
// Modèle utilisé par l'assistant
const AI_MODEL = 'claude-sonnet-5-5';

const SMALL = { width: 236, height: 54 };
const BIG = { width: 340, height: 490 };
const MAX_ITEMS = 20;    // éléments non épinglés conservés
const MAX_TEXT = 200000; // on ignore les textes gigantesques

let win;
let tray;
let dragStartPos = [0, 0];
let paused = false;
let expanded = false;
const settings = { pasteOnClick: true, theme: 'violet', opacity: 0.76, scale: 1, aiProvider: 'anthropic', aiModel: '', aiBaseUrl: '' };
const THEME_IDS = ['verre', 'minuit', 'violet', 'ambre', 'foret', 'clair'];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Historique : { id, type: 'text' | 'image', key, pinned, text?, png?, preview?, file? }
const history = [];
let nextId = 1;
let lastKey = null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---------- Réglages et historique sur disque ----------

const historyFile = () => path.join(app.getPath('userData'), 'history.json');
const imagesDir = () => path.join(app.getPath('userData'), 'images');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    Object.assign(settings, JSON.parse(fs.readFileSync(settingsFile(), 'utf8')));
  } catch {
    // premier lancement : réglages par défaut
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings));
  } catch (err) {
    console.error('Réglages non sauvegardés :', err.message);
  }
}

function makePreview(image) {
  return image.resize({ width: 240 }).toDataURL();
}

function loadHistory() {
  try {
    const saved = JSON.parse(fs.readFileSync(historyFile(), 'utf8'));
    for (const s of saved) {
      if (s.type === 'text') {
        history.push({ id: nextId++, type: 'text', key: s.key, text: s.text, pinned: !!s.pinned });
      } else if (s.type === 'image') {
        const png = fs.readFileSync(path.join(imagesDir(), s.file));
        const image = nativeImage.createFromBuffer(png);
        if (image.isEmpty()) continue;
        history.push({
          id: nextId++, type: 'image', key: s.key, pinned: !!s.pinned,
          png, preview: makePreview(image), file: s.file
        });
      }
    }
  } catch {
    // premier lancement ou fichier absent : on part de zéro
  }
  lastKey = history.length ? history[0].key : null;
}

function writeHistory() {
  try {
    fs.mkdirSync(imagesDir(), { recursive: true });
    const keep = new Set();
    const out = history.map(item => {
      if (item.type === 'text') {
        return { type: 'text', key: item.key, text: item.text, pinned: item.pinned };
      }
      if (!item.file) item.file = crypto.createHash('sha1').update(item.key).digest('hex') + '.png';
      keep.add(item.file);
      const target = path.join(imagesDir(), item.file);
      if (!fs.existsSync(target)) fs.writeFileSync(target, item.png);
      return { type: 'image', key: item.key, file: item.file, pinned: item.pinned };
    });
    fs.writeFileSync(historyFile(), JSON.stringify(out), { mode: 0o600 });
    // On supprime les images qui ne sont plus dans l'historique
    for (const f of fs.readdirSync(imagesDir())) {
      if (!keep.has(f)) fs.unlinkSync(path.join(imagesDir(), f));
    }
  } catch (err) {
    console.error('Sauvegarde impossible :', err.message);
  }
}

let saveTimer = null;
function saveHistory() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeHistory, 500);
}

// On garde MAX_ITEMS éléments non épinglés ; les épinglés ne partent jamais
function trimHistory() {
  let unpinned = 0;
  for (let i = 0; i < history.length; i++) {
    if (history[i].pinned) continue;
    if (++unpinned > MAX_ITEMS) {
      history.splice(i, 1);
      i--;
    }
  }
}

function clearHistory() {
  for (let i = history.length - 1; i >= 0; i--) {
    if (!history[i].pinned) history.splice(i, 1);
  }
  sendHistory();
  saveHistory();
}

// ---------- Communication vers l'interface ----------

function toView(item) {
  return {
    id: item.id,
    type: item.type,
    pinned: item.pinned,
    text: item.text ? item.text.slice(0, 300) : undefined,
    hay: item.text ? item.text.slice(0, 2000).toLowerCase() : undefined, // pour la recherche
    preview: item.preview
  };
}

// Les épinglés d'abord, puis le reste du plus récent au plus ancien
function viewList() {
  return [...history.filter(i => i.pinned), ...history.filter(i => !i.pinned)].map(toView);
}

function getState() {
  return {
    paused,
    pasteOnClick: settings.pasteOnClick,
    theme: THEME_IDS.includes(settings.theme) ? settings.theme : 'violet',
    opacity: clamp(Number(settings.opacity) || 0.76, 0.25, 1),
    scale: clamp(Number(settings.scale) || 1, 0.8, 1.3),
    canLogin: app.isPackaged, // le démarrage auto n'a de sens que pour l'app installée
    openAtLogin: app.isPackaged ? app.getLoginItemSettings().openAtLogin : false
  };
}

function sendHistory() {
  if (win && !win.isDestroyed()) win.webContents.send('history', viewList());
}

function sendState() {
  if (win && !win.isDestroyed()) win.webContents.send('state', getState());
}

// ---------- Lecture du presse-papiers ----------

// Les gestionnaires de mots de passe marquent leurs copies comme "confidentielles" ou "temporaires"
async function isConcealed() {
  try {
    const formats = await clipboard.availableFormats();
    return formats.some(f => /ConcealedType|TransientType/i.test(f));
  } catch {
    return false;
  }
}

// Dans cette version d'Electron, le presse-papiers est asynchrone : il faut "await"
// Ici on ne lit que le strict nécessaire : l'aperçu d'une image n'est créé que si elle est nouvelle.
async function readClipboardEntry() {
  const text = await clipboard.readText();
  if (typeof text === 'string' && text.trim()) {
    if (text.length > MAX_TEXT) return null;
    return { type: 'text', key: 'txt:' + text, text };
  }

  // Pas de texte : on cherche une image
  const items = await clipboard.read();
  for (const item of items) {
    const mime = (item.types || []).find(t => t.startsWith('image/'));
    if (!mime) continue;
    const blob = await item.getType(mime);
    const png = Buffer.from(await blob.arrayBuffer());
    const key = 'img:' + crypto.createHash('md5').update(png).digest('hex');
    return { type: 'image', key, png };
  }
  return null;
}

async function writeToClipboard(item) {
  if (item.type === 'text') {
    await clipboard.writeText(item.text);
  } else {
    await clipboard.write([
      new ClipboardItem({ 'image/png': new Blob([item.png], { type: 'image/png' }) })
    ]);
  }
}

let polling = false;

async function pollClipboard() {
  if (polling || paused) return;
  polling = true;
  try {
    if (await isConcealed()) return;

    const entry = await readClipboardEntry();
    if (!entry || entry.key === lastKey) return;
    lastKey = entry.key;

    if (entry.type === 'image') {
      const image = nativeImage.createFromBuffer(entry.png);
      if (image.isEmpty()) return;
      entry.preview = makePreview(image);
    }

    // Si l'élément existe déjà, on le remonte en tête (en gardant son épingle)
    let pinned = false;
    const existing = history.findIndex(i => i.key === entry.key);
    if (existing !== -1) {
      pinned = history[existing].pinned;
      history.splice(existing, 1);
    }

    history.unshift({ id: nextId++, pinned, ...entry });
    trimHistory();
    sendHistory();
    saveHistory();
  } catch (err) {
    console.error('Lecture du presse-papiers impossible :', err.message);
  } finally {
    polling = false;
  }
}

// ---------- Coller directement dans l'app active ----------

// On referme la capsule, on rend la main à l'app précédente, puis on envoie Cmd+V.
// macOS demande l'autorisation « Accessibilité » la première fois.
async function pasteIntoFrontApp() {
  if (process.platform !== 'darwin') return;
  if (!systemPreferences.isTrustedAccessibilityClient(true)) return; // l'élément est quand même copié

  win.webContents.send('set-panel', false);
  await sleep(150);
  app.hide();
  await sleep(200);
  await new Promise(resolve => {
    execFile(
      'osascript',
      ['-e', 'tell application "System Events" to keystroke "v" using command down'],
      err => {
        if (err) console.error('Collage impossible :', err.message);
        resolve();
      }
    );
  });
  await sleep(150);
  app.show();          // réaffiche sans prendre le focus
  win.showInactive();
}

// ---------- Fenêtre, panneau, barre de menus ----------

function createWindow() {
  win = new BrowserWindow({
    width: sizeFor(false).width,
    height: sizeFor(false).height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });

  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(getState().scale));

  // Mode débogage : lancer avec  PILL_DEBUG=1 npm start  pour ouvrir la console
  if (process.env.PILL_DEBUG) win.webContents.openDevTools({ mode: 'detach' });

  win.once('ready-to-show', () => {
    win.center();
    win.show();
  });
}

// Ouvre ou ferme l'historique (c'est l'interface qui applique, puis prévient set-expanded)
function setPanel(open, view) {
  if (!win || win.isDestroyed()) return;
  if (open && !win.isVisible()) win.show();
  win.webContents.send('set-panel', open, view);
  if (open) {
    app.focus({ steal: true });
    win.focus();
  }
}

function togglePanel() {
  const open = !win.isVisible() || !expanded;
  setPanel(open, open ? 'clip' : undefined);
}

function toggleAssistant() {
  const open = !win.isVisible() || !expanded;
  setPanel(open, open ? 'ai' : undefined);
}
function toggleLauncher() {
  const open = !win.isVisible() || !expanded;
  setPanel(open, open ? 'launch' : undefined);
}

function toggleVisible() {
  if (win.isVisible()) win.hide();
  else win.show();
}

function togglePause() {
  paused = !paused;
  sendState();
}

function togglePasteOnClick() {
  settings.pasteOnClick = !settings.pasteOnClick;
  saveSettings();
  sendState();
}

function toggleLogin() {
  if (!app.isPackaged) return;
  const current = app.getLoginItemSettings().openAtLogin;
  app.setLoginItemSettings({ openAtLogin: !current });
  sendState();
}

function buildTrayMenu() {
  const state = getState();
  return Menu.buildFromTemplate([
    {
      label: expanded && win.isVisible() ? 'Fermer l\u2019historique' : 'Ouvrir l\u2019historique',
      accelerator: SHORTCUT,
      registerAccelerator: false, // affiché seulement : le raccourci est déjà enregistré
      click: togglePanel
    },
    {
      label: win.isVisible() ? 'Masquer la capsule' : 'Afficher la capsule',
      click: toggleVisible
    },
    { type: 'separator' },
    {
      label: 'Ouvrir le lanceur',
      accelerator: LAUNCH_SHORTCUT,
      registerAccelerator: false,
      click: toggleLauncher
    },
    {
      label: 'Ouvrir l\u2019assistant',
      accelerator: AI_SHORTCUT,
      registerAccelerator: false,
      click: toggleAssistant
    },
    { label: 'Mettre en pause l\u2019enregistrement', type: 'checkbox', checked: state.paused, click: togglePause },
    { label: 'Coller directement au clic', type: 'checkbox', checked: state.pasteOnClick, click: togglePasteOnClick },
    { label: 'Lancer au démarrage', type: 'checkbox', checked: state.openAtLogin, enabled: state.canLogin, click: toggleLogin },
    { label: 'Vider l\u2019historique (garde les épinglés)', click: clearHistory },
    { type: 'separator' },
    { label: 'Quitter Pill', click: () => app.quit() }
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Pill');
  // Le menu est reconstruit à chaque ouverture pour refléter l'état du moment
  tray.on('click', () => tray.popUpContextMenu(buildTrayMenu()));
  tray.on('right-click', () => tray.popUpContextMenu(buildTrayMenu()));
}

// --- Communication avec l'interface ---

ipcMain.handle('get-history', () => viewList());
ipcMain.handle('get-state', () => getState());

// Clic sur un élément : on le recopie, puis on le colle dans l'app active si l'option est activée
ipcMain.on('use', async (_e, id) => {
  const item = history.find(i => i.id === id);
  if (!item) return;
  try {
    await writeToClipboard(item);
    // On note l'empreinte du presse-papiers tel qu'il est maintenant, pour ne pas
    // rajouter l'élément en double (une image recopiée n'a pas exactement le même hash)
    const now = await readClipboardEntry();
    lastKey = now ? now.key : item.key;
  } catch (err) {
    console.error('Copie impossible :', err.message);
    return;
  }
  if (settings.pasteOnClick) await pasteIntoFrontApp();
});

ipcMain.on('pin', (_e, id) => {
  const item = history.find(i => i.id === id);
  if (!item) return;
  item.pinned = !item.pinned;
  trimHistory();
  sendHistory();
  saveHistory();
});

ipcMain.on('remove', (_e, id) => {
  const index = history.findIndex(i => i.id === id);
  if (index === -1) return;
  history.splice(index, 1);
  sendHistory();
  saveHistory();
});

ipcMain.on('clear', clearHistory);
ipcMain.on('toggle-pause', togglePause);
ipcMain.on('toggle-paste', togglePasteOnClick);
ipcMain.on('toggle-login', toggleLogin);

// Déplacement de la capsule (géré à la main pour que le clic fonctionne aussi)
ipcMain.on('drag-start', () => { dragStartPos = win.getPosition(); });
ipcMain.on('drag-move', (_e, dx, dy) => {
  win.setPosition(Math.round(dragStartPos[0] + dx), Math.round(dragStartPos[1] + dy));
});

// Dimensions de la capsule (réduite ou ouverte), selon la taille choisie dans Style
function sizeFor(open) {
  const base = open ? BIG : SMALL;
  const scale = getState().scale;
  return { width: Math.round(base.width * scale), height: Math.round(base.height * scale) };
}

// Ajuste la fenêtre à la bonne taille, en restant dans l'écran
function fitWindow() {
  const size = sizeFor(expanded);
  const b = win.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  let x = Math.round(b.x + (b.width - size.width) / 2);
  let y = b.y;
  x = Math.max(area.x, Math.min(x, area.x + area.width - size.width));
  y = Math.max(area.y, Math.min(y, area.y + area.height - size.height));
  win.setBounds({ x, y, width: size.width, height: size.height }, true);
}

// Agrandir / réduire la capsule
ipcMain.on('set-expanded', (_e, open) => {
  expanded = open;
  fitWindow();
});

// Style : thème, opacité, taille
ipcMain.on('set-style', (_e, patch) => {
  if (!patch || typeof patch !== 'object') return;
  if (THEME_IDS.includes(patch.theme)) settings.theme = patch.theme;
  if (Number.isFinite(patch.opacity)) settings.opacity = clamp(patch.opacity, 0.25, 1);
  if (Number.isFinite(patch.scale)) {
    settings.scale = clamp(patch.scale, 0.8, 1.3);
    win.webContents.setZoomFactor(settings.scale);
    fitWindow();
  }
  saveSettings();
  sendState();
});

// Double-clic : la capsule s'aimante au bord d'écran le plus proche
ipcMain.on('snap', () => {
  const b = win.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  const margin = 12;
  const distances = [
    ['left', b.x - area.x],
    ['right', area.x + area.width - (b.x + b.width)],
    ['top', b.y - area.y],
    ['bottom', area.y + area.height - (b.y + b.height)]
  ];
  const edge = distances.sort((p, q) => p[1] - q[1])[0][0];
  let { x, y } = b;
  if (edge === 'left') x = area.x + margin;
  if (edge === 'right') x = area.x + area.width - b.width - margin;
  if (edge === 'top') y = area.y + margin;
  if (edge === 'bottom') y = area.y + area.height - b.height - margin;
  win.setBounds({ x, y, width: b.width, height: b.height }, true);
});

// ---------- Minuteurs : notification et son ----------

ipcMain.on('notify', (_e, title, body) => {
  if (win && !win.isDestroyed() && !win.isVisible()) win.showInactive();
  try {
    new Notification({ title: String(title).slice(0, 80), body: String(body || '').slice(0, 200) }).show();
  } catch (err) {
    console.error('Notification impossible :', err.message);
  }
  [0, 600, 1200].forEach(delay => setTimeout(() => shell.beep(), delay));
});

// ---------- Système : processeur, mémoire, batterie ----------

let prevCpu = null;
function cpuPercent() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    for (const k in c.times) total += c.times[k];
    idle += c.times.idle;
  }
  let pct = 0;
  if (prevCpu && total > prevCpu.total) pct = (1 - (idle - prevCpu.idle) / (total - prevCpu.total)) * 100;
  prevCpu = { idle, total };
  return Math.round(clamp(pct, 0, 100));
}

// Mémoire « utilisée » comme dans le Moniteur d'activité : app + système + compressée
function memInfo() {
  return new Promise(resolve => {
    const total = os.totalmem();
    execFile('vm_stat', (err, out) => {
      if (err || !out) return resolve({ total, used: total - os.freemem() });
      const pageSize = Number((/page size of (\d+)/.exec(out) || [])[1]) || 16384;
      const pages = name => Number((new RegExp(name + ':\\s+(\\d+)').exec(out) || [])[1]) || 0;
      const used = (pages('Anonymous pages') - pages('Pages purgeable')
        + pages('Pages wired down') + pages('Pages occupied by compressor')) * pageSize;
      resolve({ total, used: clamp(used, 0, total) });
    });
  });
}

let battCache = { t: 0, v: null };
function battInfo() {
  return new Promise(resolve => {
    if (battCache.v && Date.now() - battCache.t < 15000) return resolve(battCache.v);
    execFile('pmset', ['-g', 'batt'], (err, out) => {
      let v = { has: false };
      if (!err && out && /InternalBattery/.test(out)) {
        const pct = /(\d+)%/.exec(out);
        const state = /\d+%;\s*([^;]+);/.exec(out);
        const rem = /(\d+:\d+) remaining/.exec(out);
        v = {
          has: true,
          pct: pct ? Number(pct[1]) : 0,
          state: state ? state[1].trim() : '',
          ac: /AC Power/.test(out),
          remaining: rem && rem[1] !== '0:00' ? rem[1] : null
        };
      }
      battCache = { t: Date.now(), v };
      resolve(v);
    });
  });
}

ipcMain.handle('get-sysinfo', async () => {
  const [mem, battery] = await Promise.all([memInfo(), battInfo()]);
  return { cpu: cpuPercent(), mem, battery };
});

// ---------- Lanceur : apps, fichiers, sites ----------

const APP_DIRS = [
  '/Applications', '/Applications/Utilities', '/System/Applications',
  '/System/Applications/Utilities', path.join(os.homedir(), 'Applications')
];
let appCache = { t: 0, list: [] };
function listApps() {
  if (appCache.list.length && Date.now() - appCache.t < 60000) return appCache.list;
  const list = [{ name: 'Finder', path: '/System/Library/CoreServices/Finder.app' }];
  for (const dir of APP_DIRS) {
    try {
      for (const name of fs.readdirSync(dir)) {
        if (name.endsWith('.app')) list.push({ name: name.slice(0, -4), path: path.join(dir, name) });
      }
    } catch {
      // dossier absent : on passe
    }
  }
  appCache = { t: Date.now(), list };
  return list;
}

// Plus le score est bas, mieux c'est : début du nom, début d'un mot, puis simple inclusion
function matchScore(name, q) {
  const n = name.toLowerCase();
  if (n.startsWith(q)) return 0;
  if (n.includes(' ' + q)) return 1;
  return n.includes(q) ? 2 : -1;
}

function findFiles(q) {
  return new Promise(resolve => {
    const home = os.homedir();
    execFile('mdfind', ['-onlyin', home, '-name', q], { timeout: 2500, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      if (!out) return resolve([]);
      const files = out.split('\n')
        .filter(p => p && !/\/Library\/|\/\.|\/node_modules\/|\.app\//.test(p.slice(home.length)) && !p.endsWith('.app'))
        .map(p => ({ p, base: path.basename(p) }))
        .sort((a, b) => (matchScore(a.base, q.toLowerCase()) - matchScore(b.base, q.toLowerCase())) || a.base.length - b.base.length)
        .slice(0, 6);
      resolve(files.map(f => ({ name: f.base, path: f.p })));
    });
  });
}

const iconCache = new Map();
// Icône lue directement dans le paquet de l'app (Info.plist -> fichier .icns)
function bundleIcon(appPath) {
  return new Promise(resolve => {
    const plist = path.join(appPath, 'Contents', 'Info.plist');
    execFile('plutil', ['-convert', 'json', '-o', '-', plist], { timeout: 1500 }, (err, out) => {
      if (err || !out) return resolve(null);
      try {
        let name = JSON.parse(out).CFBundleIconFile;
        if (!name) return resolve(null);
        if (!path.extname(name)) name += '.icns';
        const file = path.join(appPath, 'Contents', 'Resources', name);
        if (!fs.existsSync(file)) return resolve(null);
        const img = nativeImage.createFromPath(file);
        resolve(img.isEmpty() ? null : img.resize({ width: 64, height: 64 }).toDataURL());
      } catch {
        resolve(null);
      }
    });
  });
}

async function iconFor(p) {
  if (iconCache.has(p)) return iconCache.get(p);
  let url = null;
  // 1) apps : l'icône du paquet. 2) miniature macOS. 3) icône système (parfois générique)
  if (p.endsWith('.app')) url = await bundleIcon(p);
  if (!url) {
    try {
      const thumb = await nativeImage.createThumbnailFromPath(p, { width: 64, height: 64 });
      if (!thumb.isEmpty()) url = thumb.toDataURL();
    } catch (err) {
      console.error('createThumbnailFromPath :', err.message);
    }
  }
  if (!url) {
    try {
      const icon = await app.getFileIcon(p, { size: 'normal' });
      if (!icon.isEmpty()) url = icon.toDataURL();
    } catch (err) {
      console.error('getFileIcon :', err.message);
    }
  }
  if (url) {
    if (iconCache.size > 300) iconCache.clear();
    iconCache.set(p, url);
  }
  return url;
}

const shortPath = p => path.dirname(p).replace(os.homedir(), '~');

// Évite de prendre « rapport.pdf » pour une adresse web
const FILE_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt|md|rtf|csv|json|html?|css|js|ts|py|swift|png|jpe?g|gif|heic|svg|zip|dmg|pkg|app|mp3|mp4|mov|key|pages|numbers)$/i;

function asUrl(q) {
  if (/\s/.test(q)) return null;
  let candidate = null;
  if (/^https?:\/\//i.test(q)) candidate = q;
  else if (/^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(q) && !FILE_EXT.test(q)) candidate = 'https://' + q;
  if (!candidate) return null;
  try { return new URL(candidate).href; } catch { return null; }
}

ipcMain.handle('launch-search', async (_e, raw) => {
  const q = String(raw || '').trim().slice(0, 100);
  if (!q) return [];
  const ql = q.toLowerCase();
  const results = [];

  const url = asUrl(q);
  if (url) results.push({ kind: 'url', name: 'Ouvrir ' + q, sub: url, target: url });

  const apps = listApps()
    .map(a => ({ a, s: matchScore(a.name, ql) }))
    .filter(x => x.s >= 0)
    .sort((x, y) => x.s - y.s || x.a.name.length - y.a.name.length)
    .slice(0, 5)
    .map(x => x.a);
  const files = q.length >= 2 ? await findFiles(q) : [];

  for (const a of apps) results.push({ kind: 'app', name: a.name, sub: 'Application', target: a.path, icon: await iconFor(a.path) });
  for (const f of files) results.push({ kind: 'file', name: f.name, sub: shortPath(f.path), target: f.path, icon: await iconFor(f.path) });

  results.push({
    kind: 'web', name: 'Rechercher « ' + q + ' » sur le web', sub: 'google.com',
    target: 'https://www.google.com/search?q=' + encodeURIComponent(q)
  });
  return results;
});

ipcMain.on('launch-open', (_e, item, reveal) => {
  if (!item || typeof item.target !== 'string') return;
  if (item.kind === 'url' || item.kind === 'web') {
    try {
      const u = new URL(item.target);
      if (u.protocol === 'http:' || u.protocol === 'https:') shell.openExternal(u.href);
    } catch {
      return;
    }
  } else if (item.kind === 'app' || item.kind === 'file') {
    if (!path.isAbsolute(item.target) || !fs.existsSync(item.target)) return;
    if (reveal) shell.showItemInFolder(item.target);
    else shell.openPath(item.target);
  } else {
    return;
  }
  setPanel(false);
});

// ---------- Assistant IA ----------

const AI_SYSTEM =
  "Tu es Pill, un assistant discret qui vit dans une capsule flottante sur le Mac de l'utilisateur. " +
  "Réponds dans la langue de l'utilisateur, de façon concise et directe, sans préambule ni formules de politesse. " +
  "N'utilise pas de Markdown (pas de **, pas de titres) : ta réponse est souvent collée telle quelle dans une autre app. " +
  "Si un extrait du presse-papiers est fourni, c'est le texte sur lequel porte la demande.";

// Fournisseurs : « anthropic » (API Messages) ou « openai » (API Chat Completions, utilisée aussi
// par Mistral, Ollama, OpenRouter, LM Studio…). Pour en ajouter un, ajoute une ligne ici.
const AI_PRESETS = {
  anthropic: { label: 'Anthropic', format: 'anthropic', url: 'https://api.anthropic.com/v1/messages', model: AI_MODEL, needsKey: true },
  openai:    { label: 'OpenAI', format: 'openai', url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', needsKey: true },
  mistral:   { label: 'Mistral', format: 'openai', url: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest', needsKey: true },
  ollama:    { label: 'Ollama (local, sans clé)', format: 'openai', url: 'http://localhost:11434/v1/chat/completions', model: 'llama3.2', needsKey: false },
  custom:    { label: 'Autre (compatible OpenAI)', format: 'openai', url: '', model: '', needsKey: false }
};

const aiKeyFile = id => path.join(app.getPath('userData'), id === 'anthropic' ? 'ai-key.bin' : 'ai-key-' + id + '.bin');
let aiAbort = null;

function readAiKey(id) {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(fs.readFileSync(aiKeyFile(id)));
  } catch {
    return null;
  }
}

function aiConfig() {
  const id = AI_PRESETS[settings.aiProvider] ? settings.aiProvider : 'anthropic';
  const p = AI_PRESETS[id];
  return { id, ...p, url: id === 'custom' ? settings.aiBaseUrl : p.url, model: settings.aiModel || p.model };
}

function aiStatus() {
  const c = aiConfig();
  const providers = Object.entries(AI_PRESETS).map(([id, p]) => ({
    id, label: p.label, model: p.model, needsKey: p.needsKey, hasKey: !!readAiKey(id)
  }));
  const hasKey = !!readAiKey(c.id);
  const ready = (!c.needsKey || hasKey) && !!c.url && !!c.model;
  return { provider: c.id, model: c.model, baseUrl: settings.aiBaseUrl, providers, ready };
}

ipcMain.handle('ai-has-key', () => aiStatus().ready);
ipcMain.handle('ai-get-config', () => aiStatus());

ipcMain.handle('ai-set-config', (_e, cfg) => {
  try {
    if (!cfg || !AI_PRESETS[cfg.provider]) return false;
    settings.aiProvider = cfg.provider;
    settings.aiModel = String(cfg.model || '').trim().slice(0, 100);
    settings.aiBaseUrl = '';
    if (cfg.provider === 'custom') {
      const u = new URL(String(cfg.baseUrl || '').trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      settings.aiBaseUrl = u.href;
    }
    saveSettings();
    const key = String(cfg.key || '').trim().slice(0, 300);
    if (key) {
      if (!safeStorage.isEncryptionAvailable()) return false;
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(aiKeyFile(cfg.provider), safeStorage.encryptString(key), { mode: 0o600 });
    }
    return aiStatus().ready;
  } catch (err) {
    console.error('Réglages IA non sauvegardés :', err.message);
    return false;
  }
});

// Efface la clé du fournisseur actuel (utilisé quand elle est refusée)
ipcMain.handle('ai-set-key', (_e, key) => {
  try {
    if (!String(key || '').trim()) fs.rmSync(aiKeyFile(aiConfig().id), { force: true });
  } catch {}
  return aiStatus().ready;
});

// Aperçu du texte actuellement dans le presse-papiers (pour la pastille de l'onglet)
ipcMain.handle('ai-clip', () => clipboard.readText().slice(0, 300));

ipcMain.on('ai-cancel', () => { if (aiAbort) aiAbort.abort(); });

ipcMain.on('ai-run', async (_e, req) => {
  if (aiAbort) aiAbort.abort();
  const ctrl = new AbortController();
  aiAbort = ctrl;
  const id = req && req.id;
  const send = msg => { if (win && !win.isDestroyed()) win.webContents.send('ai', { id, ...msg }); };

  const prompt = String((req && req.prompt) || '').trim().slice(0, 8000);
  if (!prompt) { send({ type: 'error', error: 'Demande vide.' }); return; }
  const cfg = aiConfig();
  const key = readAiKey(cfg.id);
  if ((cfg.needsKey && !key) || !cfg.url || !cfg.model) { send({ type: 'error', error: 'Assistant non configuré.' }); return; }

  let content = prompt;
  if (req.useClip) {
    const clip = clipboard.readText().slice(0, 30000);
    if (clip.trim()) content = '<presse_papiers>\n' + clip + '\n</presse_papiers>\n\n' + prompt;
  }

  const headers = { 'content-type': 'application/json' };
  let body;
  if (cfg.format === 'anthropic') {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
    body = { model: cfg.model, max_tokens: 1500, stream: true, system: AI_SYSTEM, messages: [{ role: 'user', content }] };
  } else {
    if (key) headers.authorization = 'Bearer ' + key;
    body = { model: cfg.model, stream: true, messages: [{ role: 'system', content: AI_SYSTEM }, { role: 'user', content }] };
  }

  try {
    const res = await fetch(cfg.url, { method: 'POST', signal: ctrl.signal, headers, body: JSON.stringify(body) });
    if (!res.ok) {
      let detail = '';
      try {
        const j = await res.json();
        detail = (j.error && (j.error.message || j.error)) || j.message || '';
      } catch {}
      const error = res.status === 401 ? 'Clé API refusée.' : (typeof detail === 'string' && detail) || 'Erreur ' + res.status;
      send({ type: 'error', error, badKey: res.status === 401 });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const evt = JSON.parse(data);
          let text = '';
          if (cfg.format === 'anthropic') {
            if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') text = evt.delta.text;
          } else {
            const d = evt.choices && evt.choices[0] && evt.choices[0].delta;
            if (d && typeof d.content === 'string') text = d.content;
          }
          if (text) send({ type: 'delta', text });
          if (evt.error) {
            send({ type: 'error', error: (evt.error.message || String(evt.error)) });
            return;
          }
        } catch {}
      }
    }
    send({ type: 'done' });
  } catch (err) {
    if (err.name !== 'AbortError') {
      send({ type: 'error', error: cfg.id === 'ollama' ? 'Ollama ne répond pas (est-il lancé ?).' : 'Connexion impossible.' });
    }
  } finally {
    if (aiAbort === ctrl) aiAbort = null;
  }
});

// Copie la réponse de l'assistant, et la colle dans l'app active si demandé
ipcMain.on('ai-use', async (_e, text, paste) => {
  const t = String(text || '').slice(0, MAX_TEXT);
  if (!t) return;
  clipboard.writeText(t);
  try {
    const now = await readClipboardEntry();
    if (now) lastKey = now.key;
  } catch {}
  if (paste && settings.pasteOnClick) await pasteIntoFrontApp();
});

ipcMain.on('quit', () => app.quit());

// Une seule instance de Pill à la fois : si on relance, on rouvre l'historique de la première
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => setPanel(true, 'clip'));

  app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock.hide(); // pas d'icône dans le Dock
    loadSettings();
    loadHistory();
    createWindow();
    createTray();
    if (!globalShortcut.register(SHORTCUT, togglePanel)) {
      console.error('Raccourci indisponible (déjà utilisé ?) :', SHORTCUT);
    }
    if (!globalShortcut.register(LAUNCH_SHORTCUT, toggleLauncher)) {
      console.error('Raccourci indisponible (déjà utilisé ?) :', LAUNCH_SHORTCUT);
    }
    if (!globalShortcut.register(AI_SHORTCUT, toggleAssistant)) {
      console.error('Raccourci indisponible (déjà utilisé ?) :', AI_SHORTCUT);
    }
    cpuPercent(); // premier relevé, pour que les suivants soient des différences
    setInterval(pollClipboard, 700);
  });
}

// On écrit l'historique tout de suite avant de quitter
app.on('before-quit', () => {
  clearTimeout(saveTimer);
  writeHistory();
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('window-all-closed', () => app.quit());

// Ouvre un lien, une adresse e-mail ou un numéro depuis l'historique (protocoles autorisés uniquement)
ipcMain.on('open-external', (_e, url) => {
  if (typeof url !== 'string' || url.length > 2048) return;
  try {
    const u = new URL(url);
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol)) {
      shell.openExternal(u.href);
      setPanel(false);
    }
  } catch {}
});
