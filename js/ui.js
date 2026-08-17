// ── Helpers de UI compartidos: formato, toasts, modal ───────────
import { icon } from './icons.js';

const TOAST_ICON = { success: 'checkCircle', danger: 'xCircle', warn: 'alert', info: 'info' };

export function $M(n) { return '$' + Number(n || 0).toLocaleString('es-AR'); }

export function $D(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ── Spotlight: la luz sigue al cursor (elemento de firma visual) ──
// Un único listener delegado, no depende de qué tarjetas existan en
// cada momento (se re-renderizan todo el tiempo vía innerHTML).
export function initSpotlight() {
  const SEL = '.card,.stat,.cost-breakdown,.login-card,.balance-card';
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest(SEL);
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
    el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
  }, { passive: true });
}

// ── Números que suben en vez de aparecer de golpe ────────────────
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Anima todos los [data-count] dentro de container desde 0 hasta su valor. */
export function animateStats(container) {
  if (!container) return;
  container.querySelectorAll('[data-count]').forEach(el => {
    const target = Number(el.dataset.count) || 0;
    const money = el.dataset.money === '1';
    if (reduceMotion()) { el.textContent = money ? $M(target) : String(Math.round(target)); return; }
    const t0 = performance.now(), dur = 700;
    function tick(now) {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = target * eased;
      el.textContent = money ? $M(val) : String(Math.round(val));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// ── Toasts accesibles (reemplaza alert()) ───────────────────────
let toastHost;
function ensureToastHost() {
  if (toastHost) return toastHost;
  toastHost = document.createElement('div');
  toastHost.className = 'toast-host';
  toastHost.setAttribute('role', 'status');
  toastHost.setAttribute('aria-live', 'polite');
  toastHost.setAttribute('aria-atomic', 'true');
  document.body.appendChild(toastHost);
  return toastHost;
}

export function toast(message, type = 'info', ms = 3500) {
  const host = ensureToastHost();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icon(TOAST_ICON[type] || 'info', { size: 17 })}<span>${esc(message)}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, ms);
}

// ── Modal ────────────────────────────────────────────────────────
let lastFocused = null;
export function openModal() {
  lastFocused = document.activeElement;
  const overlay = document.getElementById('overlay');
  overlay.classList.add('open');
  const modal = document.getElementById('modal');
  // Buscar el primer elemento enfocable dentro del contenido (no el botón
  // de cerrar, que siempre es el primero en el DOM pero no debe robar foco).
  const focusable = document.getElementById('modalBody').querySelector('input,select,textarea,button');
  (focusable || modal).focus?.();
  document.addEventListener('keydown', onModalKeydown);
}
export function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  document.removeEventListener('keydown', onModalKeydown);
  lastFocused?.focus?.();
}
export function maybeClose(e) {
  if (e.target === document.getElementById('overlay')) closeModal();
}
function onModalKeydown(e) {
  if (e.key === 'Escape') closeModal();
}

// ── Diálogo de confirmación / prompt propio ─────────────────────
// Reemplaza confirm()/prompt() nativos: en navegadores embebidos, PWA
// instaladas y vistas previas en iframe, los diálogos nativos suelen
// bloquearse o devolver un valor vacío sin mostrarse — lo que hacía
// que "Eliminar" pareciera no hacer nada. Este es 100% propio y confiable.
let dialogResolve = null;
function dialogEls() {
  return {
    overlay: document.getElementById('confirmOverlay'),
    msg: document.getElementById('confirmMsg'),
    inputWrap: document.getElementById('confirmInputWrap'),
    input: document.getElementById('confirmInput'),
    cancelBtn: document.getElementById('confirmCancel'),
    okBtn: document.getElementById('confirmOk')
  };
}
function openDialog({ message, danger, okLabel, withInput, inputValue }) {
  const els = dialogEls();
  els.msg.textContent = message;
  els.okBtn.textContent = okLabel;
  els.okBtn.className = 'btn btn-sm ' + (danger ? 'btn-danger' : 'btn-primary');
  if (withInput) {
    els.inputWrap.style.display = 'block';
    els.input.value = inputValue ?? '';
  } else {
    els.inputWrap.style.display = 'none';
  }
  els.overlay.classList.add('open');
  (withInput ? els.input : els.okBtn).focus();
  return new Promise(resolve => { dialogResolve = resolve; });
}
function settleDialog(value) {
  dialogEls().overlay.classList.remove('open');
  const r = dialogResolve; dialogResolve = null;
  r?.(value);
}
export function initDialogs() {
  const els = dialogEls();
  els.cancelBtn.addEventListener('click', () => settleDialog(els.inputWrap.style.display !== 'none' ? null : false));
  els.okBtn.addEventListener('click', () => settleDialog(els.inputWrap.style.display !== 'none' ? els.input.value : true));
  els.overlay.addEventListener('click', e => { if (e.target === els.overlay) settleDialog(els.inputWrap.style.display !== 'none' ? null : false); });
  els.input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); els.okBtn.click(); } });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && els.overlay.classList.contains('open')) settleDialog(els.inputWrap.style.display !== 'none' ? null : false);
  });
}
/** Reemplaza confirm(). Devuelve una Promise<boolean>. `danger` colorea el botón OK. */
export function confirmDialog(message, okLabel = 'Eliminar', danger = true) {
  return openDialog({ message, danger, okLabel, withInput: false });
}
/** Reemplaza prompt(). Devuelve una Promise<string|null>. */
export function promptDialog(message, inputValue = '') {
  return openDialog({ message, danger: false, okLabel: 'Guardar', withInput: true, inputValue });
}

// ── Agrupar listas por mes (Órdenes, Presupuestos) ──────────────
export const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** items ya ordenados desc por fecha. dateKey: nombre del campo de fecha. */
export function groupByMonth(items, dateKey, renderItem) {
  let html = '', currentKey = null;
  for (const item of items) {
    const d = new Date(item[dateKey]);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key !== currentKey) {
      currentKey = key;
      html += `<div class="month-header">${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}</div>`;
    }
    html += renderItem(item);
  }
  return html;
}

// ── Filtro por mes (Órdenes, Presupuestos, Nuevos/Usados, Caja) ──
// Valor canónico "YYYY-MM" (con cero adelante) para usar en <select>.
export function monthValueOf(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** true si el item cae dentro del mes elegido, o si no hay filtro activo ('' = Todos). */
export function matchesMonth(item, dateKey, monthFilter) {
  return !monthFilter || monthValueOf(item[dateKey]) === monthFilter;
}

/**
 * Reconstruye las <option> de un <select> de filtro por mes a partir del
 * dataset ya cargado (sin pedir nada nuevo al servidor) y conserva la
 * selección activa para que no se resetee en cada re-render.
 */
export function refreshMonthFilterOptions(selectEl, items, dateKey, currentValue) {
  if (!selectEl) return;
  const months = [...new Set(items.map(x => monthValueOf(x[dateKey])))].sort().reverse();
  selectEl.innerHTML = '<option value="">Todos los meses</option>' +
    months.map(m => {
      const [y, mm] = m.split('-').map(Number);
      return `<option value="${m}">${MONTHS_ES[mm - 1]} ${y}</option>`;
    }).join('');
  selectEl.value = months.includes(currentValue) ? currentValue : '';
}

// ── Loading skeletons ────────────────────────────────────────────
export function skeletonCards(n = 3) {
  return Array.from({ length: n }).map(() => `
    <div class="card skeleton" aria-hidden="true">
      <div class="sk-line sk-w60"></div>
      <div class="sk-line sk-w40 mt-8"></div>
    </div>`).join('');
}

// ── Estado de error de red ───────────────────────────────────────
export function errorState(message, retryLabel, onRetryAttr) {
  return `<div class="empty">
    <div class="empty-ico">${icon('alert', { size: 40 })}</div>
    ${esc(message)}
    <div class="mt-12"><button class="btn btn-ghost btn-sm" ${onRetryAttr}>${esc(retryLabel || 'Reintentar')}</button></div>
  </div>`;
}
