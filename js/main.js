// ── Bootstrap: auth gate + router + wiring de eventos ───────────
import { initAuth, isLoggedIn, getSession, login, logout, onAuthChange } from './auth.js';
import { openModal, closeModal, maybeClose, toast, initDialogs } from './ui.js';
import * as Orders from './orders.js';
import * as Products from './products.js';
import * as Caja from './caja.js';

let page = 'orders';
const FAB_LABEL = { orders: 'Nueva orden', usados: 'Nuevo equipo', caja: 'Nuevo movimiento' };

function goTo(p) {
  page = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => { x.classList.remove('active'); x.removeAttribute('aria-current'); });
  document.getElementById('page-' + p).classList.add('active');
  const navBtn = document.getElementById('nav-' + p);
  navBtn.classList.add('active'); navBtn.setAttribute('aria-current', 'page');
  document.getElementById('fab').setAttribute('aria-label', FAB_LABEL[p]);
  render();
}

function render() {
  if (page === 'orders') Orders.renderOrders();
  else if (page === 'usados') Products.renderProducts();
  else Caja.renderCaja();
}

function handleFab() {
  if (page === 'orders') Orders.newOrderModal();
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
  goTo, handleFab, maybeClose, closeModal,
  viewOrder: Orders.viewOrder, setStatus: Orders.setStatus, addWork: Orders.addWork,
  delWork: Orders.delWork, updateCost: Orders.updateCost, addPhotos: Orders.addPhotos,
  delPhoto: Orders.delPhoto, delOrder: Orders.delOrder, genPDF: Orders.genPDF,
  renderOrders: Orders.renderOrders,
  viewProduct: Products.viewProduct, markSold: Products.markSold,
  addProductPhotos: Products.addProductPhotos, delProductPhoto: Products.delProductPhoto,
  delProduct: Products.delProduct, renderProducts: Products.renderProducts, setKind: Products.setKind,
  addProductCost: Products.addProductCost, delProductCost: Products.delProductCost,
  delMov: Caja.delMov, renderCaja: Caja.renderCaja,
  logout: async () => { await logout(); toast('Sesión cerrada', 'info'); }
};

// ── Init ─────────────────────────────────────────────────────
initDialogs();
document.getElementById('login-form').addEventListener('submit', handleLogin);
document.getElementById('searchOrders').addEventListener('input', () => Orders.renderOrders());

onAuthChange((session) => {
  showApp(!!session);
  if (session) {
    document.getElementById('admin-email').textContent = session.user.email;
    goTo('orders');
  }
});

initAuth();
