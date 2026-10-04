const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pillAPI', {
  getHistory: () => ipcRenderer.invoke('get-history'),
  onHistory: cb => ipcRenderer.on('history', (_e, items) => cb(items)),
  getState: () => ipcRenderer.invoke('get-state'),
  onState: cb => ipcRenderer.on('state', (_e, state) => cb(state)),
  onSetPanel: cb => ipcRenderer.on('set-panel', (_e, open, view) => cb(open, view)),
  use: id => ipcRenderer.send('use', id),
  pin: id => ipcRenderer.send('pin', id),
  remove: id => ipcRenderer.send('remove', id),
  clear: () => ipcRenderer.send('clear'),
  togglePause: () => ipcRenderer.send('toggle-pause'),
  togglePaste: () => ipcRenderer.send('toggle-paste'),
  toggleLogin: () => ipcRenderer.send('toggle-login'),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: (dx, dy) => ipcRenderer.send('drag-move', dx, dy),
  setExpanded: open => ipcRenderer.send('set-expanded', open),
  snap: () => ipcRenderer.send('snap'),
  setStyle: patch => ipcRenderer.send('set-style', patch),
  notify: (title, body) => ipcRenderer.send('notify', title, body),
  sysinfo: () => ipcRenderer.invoke('get-sysinfo'),
  launchSearch: q => ipcRenderer.invoke('launch-search', q),
  launchOpen: (item, reveal) => ipcRenderer.send('launch-open', item, !!reveal),
  openExternal: url => ipcRenderer.send('open-external', url),
  quit: () => ipcRenderer.send('quit')
});
