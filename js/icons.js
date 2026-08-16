// ── Librería de íconos SVG (reemplaza todo uso de emojis) ───────
// Set de outline consistente: 24x24 viewBox, stroke=currentColor,
// puntas redondeadas — mismo lenguaje visual que los íconos de nav.
const PATHS = {
  wrench: 'M14.7 6.3a4 4 0 10-5.66 5.66l-6.36 6.36a1 1 0 001.42 1.42l6.36-6.36a4 4 0 005.66-5.66l-2.12 2.12-2.12-.7-.7-2.12 2.12-2.12z',
  search: 'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z',
  calendar: 'M8 2v3M16 2v3M3.5 9h17M4 5h16a1 1 0 011 1v13a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z',
  chat: 'M21 12a8 8 0 01-11.5 7.2L3 21l1.8-6.5A8 8 0 1121 12z',
  camera: 'M4 8a2 2 0 012-2h1.2a1 1 0 00.86-.5l.9-1.5a1 1 0 01.86-.5h4.36a1 1 0 01.86.5l.9 1.5a1 1 0 00.86.5H18a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V8z M12 17a4 4 0 100-8 4 4 0 000 8z',
  checkCircle: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  document: 'M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z M14 3v5h5 M9 13h6M9 17h6M9 9h1',
  clipboard: 'M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1z M6 6h12a1 1 0 011 1v13a1 1 0 01-1 1H6a1 1 0 01-1-1V7a1 1 0 011-1z M9 12h6M9 16h6',
  device: 'M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z M12 18h.01',
  wallet: 'M3 7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z M16 12h2M3 9h18',
  arrowUpRight: 'M7 17L17 7M9 7h8v8',
  arrowDownRight: 'M7 7l10 10M17 9v8H9',
  alert: 'M12 9v4m0 4h.01M10.3 3.86L1.8 18a1 1 0 00.86 1.5h18.68a1 1 0 00.86-1.5L13.7 3.86a1 1 0 00-1.72 0z',
  info: 'M12 16v-4m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  xCircle: 'M15 9l-6 6m0-6l6 6m6-6a9 9 0 11-18 0 9 9 0 0118 0z',
  close: 'M6 6l12 12M18 6L6 18',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1'
};

export function icon(name, { size = 18, cls = '' } = {}) {
  const d = PATHS[name] || '';
  return `<svg aria-hidden="true" class="icon${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}
