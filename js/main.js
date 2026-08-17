// ── Bootstrap: auth gate + router + wiring de eventos ───────────
import { initAuth, isLoggedIn, getSession, login, logout, onAuthChange } from './auth.js';
import { openModal, closeModal, maybeClose, toast, initDialogs, initSpotlight } from './ui.js';
import * as Orders from './orders.js';
import * as Quotes from './quotes.js';
import * as Products from './products.js';
import * as Caja from './caja.js';

let page = 'orders';
let ordersTab = 'ordenes'; // sub-tab dentro de la página Órdenes: 'ordenes' | 'presupuestos'

function goTo(p) {
  page = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => { x.classList.remove('active'); x.removeAttribute('aria-current'); });
  document.getElementById('page-' + p).classList.add('active');
  const navBtn = document.getElementById('nav-' + p);
  navBtn.classList.add('active'); navBtn.setAttribute('aria-current', 'page');
  updateFabLabel();
  render();
}

function setOrdersTab(tab) {
  ordersTab = tab;
  document.querySelectorAll('#page-orders .subtab').forEach(x => {
    const active = x.dataset.otab === tab;
    x.classList.toggle('active', active);
    x.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.getElementById('ordersView').style.display = tab === 'ordenes' ? 'block' : 'none';
  document.getElementById('quotesView').style.display = tab === 'presupuestos' ? 'block' : 'none';
  updateFabLabel();
  render();
}

function updateFabLabel() {
  let label = 'Nueva orden';
  if (page === 'orders') label = ordersTab === 'presupuestos' ? 'Nuevo presupuesto' : 'Nueva orden';
  else if (page === 'usados') label = 'Nuevo equipo';
  else if (page === 'caja') label = 'Nuevo movimiento';
  document.getElementById('fab').setAttribute('aria-label', label);
}

function render() {
  if (page === 'orders') { ordersTab === 'presupuestos' ? Quotes.renderQuotes() : Orders.renderOrders(); }
  else if (page === 'usados') Products.renderProducts();
  else Caja.renderCaja();
}

function handleFab() {
  if (page === 'orders') { ordersTab === 'presupuestos' ? Quotes.newQuoteModal() : Orders.newOrderModal(); }
  else if (page === 'usados') Products.newProductModal();
  else { Caja.newMovModal(); openModal(); }
}

// ── Login ────────────────────────────────────────────────────
function showApp(show) {
  document.getElementById('login-screen').style.display = show ? 'none' : 'flex';
  document.getElementById('app-shell').style.display = show ? 'block' : 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-submit');
  btn.disabled = true; btn.textContent = 'Ingresando…';
  const ok = await login(email, password);
  btn.disabled = false; btn.textContent = 'Ingresar';
  if (ok) toast('Bienvenido', 'success');
}

// ── Namespace global para los onclick= generados dinámicamente ──
window.TS = {
  goTo, handleFab, maybeClose, closeModal, setOrdersTab,
  viewOrder: Orders.viewOrder, setStatus: Orders.setStatus, addWork: Orders.addWork,
  delWork: Orders.delWork, updateCost: Orders.updateCost, updateDeposit: Orders.updateDeposit,
  addPhotos: Orders.addPhotos, delPhoto: Orders.delPhoto, delOrder: Orders.delOrder, genPDF: Orders.genPDF,
  renderOrders: Orders.renderOrders,
  viewQuote: Quotes.viewQuote, addQuoteItem: Quotes.addQuoteItem, delQuoteItem: Quotes.delQuoteItem,
  markQuoteRejected: Quotes.markQuoteRejected, convertToOrder: Quotes.convertToOrder,
  delQuote: Quotes.delQuote, genQuotePDF: Quotes.genQuotePDF, renderQuotes: Quotes.renderQuotes,
  viewProduct: Products.viewProduct, markSold: Products.markSold,
  addProductPhotos: Products.addProductPhotos, delProductPhoto: Products.delProductPhoto,
  delProduct: Products.delProduct, renderProducts: Products.renderProducts, setKind: Products.setKind,
  addProductCost: Products.addProductCost, delProductCost: Products.delProductCost,
  updateProductDeposit: Products.updateProductDeposit,
  delMov: Caja.delMov, renderCaja: Caja.renderCaja, genMonthlyReport: Caja.genMonthlyReport,
  logout: async () => { await logout(); toast('Sesión cerrada', 'info'); }
};

// ── Init ─────────────────────────────────────────────────────
initDialogs();
initSpotlight();
document.getElementById('login-form').addEventListener('submit', handleLogin);
document.getElementById('searchOrders').addEventListener('input', () => Orders.renderOrders());
document.getElementById('searchQuotes').addEventListener('input', () => Quotes.renderQuotes());
const reportMonthInput = document.getElementById('reportMonth');
if (reportMonthInput) reportMonthInput.value = new Date().toISOString().slice(0, 7);

onAuthChange((session) => {
  showApp(!!session);
  if (session) {
    document.getElementById('admin-email').textContent = session.user.email;
    goTo('orders');
  }
});

initAuth();
