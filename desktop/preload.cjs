const {contextBridge, ipcRenderer} = require('electron');
const call = async (name, ...args) => {
  const result = await ipcRenderer.invoke(name, ...args);
  if (!result.ok) { const error = new Error(result.error); error.status = result.status; error.details = result.details; throw error; }
  return result.value;
};
contextBridge.exposeInMainWorld('loqDesktop', Object.freeze({
  invoke: (action, payload) => call('loq:invoke', action, payload),
  openFile: () => call('loq:open-file'),
  renderPdf: options => call('loq:render-pdf', options),
  exportPdf: options => call('loq:export-pdf', options),
  exportDraft: (scope, document) => call('loq:export-draft', scope, document),
  openDraft: scope => call('loq:open-draft', scope),
  session: Object.freeze({
    get: () => call('loq:session'), login: () => call('loq:login'), logout: () => call('loq:logout'),
    onChanged: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('loq:session-changed', listener); return () => ipcRenderer.removeListener('loq:session-changed', listener); },
  }),
  recovery: Object.freeze({read: scope => call('loq:recovery-read', scope), write: (scope, data) => call('loq:recovery-write', scope, data), archive: scope => call('loq:recovery-archive', scope), remove: scope => call('loq:recovery-remove', scope)}),
}));
