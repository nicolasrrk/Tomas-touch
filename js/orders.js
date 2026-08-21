// ── Módulo Órdenes de reparación ────────────────────────────────
import { supabase } from './supabaseClient.js';
import { BUCKET_ORDERS } from './config.js';
import { $M, $D, esc, toast, openModal, closeModal, skeletonCards, errorState, confirmDialog, groupByMonth, animateStats, matchesMonth, refreshMonthFilterOptions, amountFromInput } from './ui.js';
import { uploadPhoto, listPhotos, deletePhoto } from './storage.js';
import { icon } from './icons.js';
import { cajaPush, deleteMovementsBySource, deleteMovementsForOrder } from './caja.js';
import { getCustomer, saveCustomer } from './customers.js';

const SL = { ingresado: 'Ingresado', en_proceso: 'En proceso', terminado: 'Terminado', entregado: 'Entregado' };
const SO = ['ingresado', 'en_proceso', 'terminado', 'entregado'];

/** Fecha de hoy en horario local como YYYY-MM-DD. OJO: no usar
 *  `new Date().toISOString().slice(0,10)` para esto — toISOString() da la
 *  fecha en UTC, que en Argentina (UTC-3) ya cae en el día siguiente desde
 *  las 21:00 hora local, adelantando "hoy" casi 3hs antes de tiempo. */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Terminado, con fecha límite de retiro cargada, y esa fecha ya pasó (y
 *  nadie lo retiró — si ya está entregado, dejó de importar). */
function isOverdue(o) {
  if (o.status !== 'terminado' || !o.pickup_deadline) return false;
  return o.pickup_deadline < todayISO();
}

/** Formatea una columna `date` (YYYY-MM-DD, sin hora) a DD/MM/AA sin pasar
 *  por Date() — eso interpretaría el string en UTC y podría mostrar un día
 *  antes según la zona horaria del navegador. */
function $Ddate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

let cache = [];
let loaded = false; // si ya se trajo al menos una vez de la red
let loading = null; // Promise del fetch en vuelo, o null
let monthFilter = ''; // '' = todos los meses
let statusFilter = ''; // '' = todos los estados

// Evita re-consultar el dispositivo cada vez que se agrega un repuesto/gasto:
// se guarda al abrir el detalle y se reutiliza (igual que en products.js).
let viewedOrder = { id: null, device: null };

/** Cambia el mes filtrado y vuelve a pintar (sin red: ya está todo en cache). */
export function setMonthFilter(v) { monthFilter = v; paintOrders(); }

/** Click en una tarjeta de estado: filtra por ese estado, o lo quita si ya estaba activo. */
export function setStatusFilter(s) { statusFilter = statusFilter === s ? '' : s; paintOrders(); }

async function fetchOrders() {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  cache = data || [];
  loaded = true;
  return cache;
}

/** Trae de la red y pinta. Se usa en la navegación inicial de página y tras
 *  crear/editar/borrar algo (necesita datos frescos). */
export async function renderOrders() {
  const list = document.getElementById('listOrders');
  list.innerHTML = skeletonCards(3);
  try {
    // Si ya hay un fetch en vuelo (ej. el buscador dispara paintOrders() en
    // cada tecla mientras todavía no cargó nada), lo reusa en vez de abrir
    // uno nuevo por cada evento — evita una ráfaga de requests duplicados.
    loading = loading || fetchOrders();
    await loading;
  } catch (e) {
    loading = null;
    list.innerHTML = errorState('No se pudieron cargar las órdenes.', 'Reintentar', 'onclick="TS.renderOrders()"');
    return;
  }
  loading = null;
  paintOrders();
}

/** Re-pinta desde cache (buscador, filtro de mes): cero requests a Supabase.
 *  Si todavía no se cargó nada (primera vez que se abre la página), cae a
 *  renderOrders() para no dejar la pantalla vacía — pero solo si no hay ya
 *  un fetch en curso, para no duplicar requests. */
export function paintOrders() {
  if (!loaded) { if (!loading) renderOrders(); return; }
  const list = document.getElementById('listOrders');
  const orders = cache;
  refreshMonthFilterOptions(document.getElementById('filterMonthOrders'), orders, 'created_at', monthFilter);
  const scoped = orders.filter(o => matchesMonth(o, 'created_at', monthFilter));
  const q = (document.getElementById('searchOrders')?.value || '').toLowerCase();
  const filtered = scoped.filter(o => (!q ||
    o.client?.toLowerCase().includes(q) || o.device?.toLowerCase().includes(q)) &&
    (!statusFilter || o.status === statusFilter));

  const c = { ingresado: 0, en_proceso: 0, terminado: 0, entregado: 0 };
  scoped.forEach(o => { if (c[o.status] !== undefined) c[o.status]++; });
  const statsEl = document.getElementById('statsOrders');
  statsEl.classList.add('stats-4');
  const stat = (s, label, color, count) => `
    <div class="stat clickable${statusFilter === s ? ' active' : ''}" onclick="TS.setOrdersStatusFilter('${s}')" role="button" tabindex="0" aria-pressed="${statusFilter === s}">
      <div class="stat-val"${color ? ` style="color:${color}"` : ''} data-count="${count}">0</div>
      <div class="stat-lbl">${label}</div>
    </div>`;
  statsEl.innerHTML =
    stat('ingresado', 'Ingresados', 'var(--primary-bright)', c.ingresado) +
    stat('en_proceso', 'En proceso', 'var(--primary)', c.en_proceso) +
    stat('terminado', 'Terminados', 'var(--primary-bright)', c.terminado) +
    stat('entregado', 'Entregados', 'var(--muted)', c.entregado);
  animateStats(statsEl);

  list.innerHTML = filtered.length ? groupByMonth(filtered, 'created_at', o => {
    const owed = Number(o.cost || 0) - Number(o.deposit || 0);
    const overdue = isOverdue(o);
    return `
    <div class="card${overdue ? ' card-overdue' : ''}" onclick="TS.viewOrder('${o.id}')">
      <div class="card-header">
        <div style="min-width:0">
          <div class="fw-700" style="margin-bottom:3px">${esc(o.device) || 'Sin dispositivo'}</div>
          <div class="t-muted">${esc(o.client) || 'Sin nombre'}${o.phone ? ' · ' + esc(o.phone) : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <span class="badge badge-${o.status}">${SL[o.status]}</span>
          ${overdue ? `<span class="badge badge-overdue">${icon('alert', { size: 11 })} Vencido</span>` : ''}
        </div>
      </div>
      <div style="font-size:.78rem;color:var(--muted);margin-top:7px">
        ${icon('calendar', { size: 13 })} ${$D(o.created_at)}&nbsp;·&nbsp;${o.problem ? icon('chat', { size: 13 }) + ' ' + esc(o.problem.slice(0, 38)) + (o.problem.length > 38 ? '…' : '') : 'Sin descripción'}
      </div>
      <div class="row" style="margin-top:6px;gap:10px">
        ${o.cost ? `<div class="t-success fw-700 num">${$M(o.cost)}</div>` : ''}
        ${owed > 0 ? `<div class="t-muted" style="font-size:.75rem">Debe <span class="num">${$M(owed)}</span></div>` : (o.cost ? `<div class="t-muted" style="font-size:.75rem">Pagado</div>` : '')}
      </div>
    </div>`;
  })
    : `<div class="empty"><div class="empty-ico">${icon('clipboard', { size: 40 })}</div>No hay órdenes aún<br><span class="t-muted" style="font-size:.8rem">Tocá + para crear una</span></div>`;
}

export function newOrderModal() {
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-title">Nueva Orden</div>
    <div class="form-group"><label for="f-id">ID Cliente</label><input id="f-id" placeholder="Opcional — ej: 0001"></div>
    <div class="form-group"><label for="f-cl">Cliente</label><input id="f-cl" placeholder="Nombre del cliente"></div>
    <div class="form-group"><label for="f-ph">Teléfono</label><input id="f-ph" type="tel" placeholder="Número de contacto"></div>
    <div class="form-group"><label for="f-dir">Dirección</label><input id="f-dir" placeholder="Dirección del cliente"></div>
    <div class="form-group"><label for="f-dv">Dispositivo</label><input id="f-dv" placeholder="Ej: Samsung A54 Negro"></div>
    <div class="form-group"><label for="f-pr">Problema reportado</label><textarea id="f-pr" placeholder="Describe el problema que trae el equipo…"></textarea></div>
    <div class="form-group"><label for="f-co">Costo estimado ($)</label><input id="f-co" type="number" inputmode="decimal" placeholder="0"></div>
    <button class="btn btn-primary btn-full mt-12" id="btn-create-order">Crear Orden</button>`;
  document.getElementById('f-id').addEventListener('blur', fillFromCustomer);
  document.getElementById('btn-create-order').addEventListener('click', createOrder);
  openModal();
}

/** Al salir del campo ID Cliente: si el código ya existe en el directorio,
 *  rellena Cliente/Teléfono/Dirección con lo último guardado para ese ID. */
async function fillFromCustomer() {
  const code = document.getElementById('f-id').value.trim();
  if (!code) return;
  const c = await getCustomer(code);
  if (!c) return;
  document.getElementById('f-cl').value = c.name || '';
  document.getElementById('f-ph').value = c.phone || '';
  document.getElementById('f-dir').value = c.address || '';
  toast('Cliente encontrado, datos completados', 'info');
}

async function createOrder() {
  const dv = document.getElementById('f-dv').value.trim();
  if (!dv) { toast('Ingresá el dispositivo', 'warn'); return; }
  const btn = document.getElementById('btn-create-order');
  btn.disabled = true; btn.textContent = 'Creando…';
  const code = document.getElementById('f-id').value.trim();
  const client = document.getElementById('f-cl').value.trim();
  const phone = document.getElementById('f-ph').value.trim();
  const address = document.getElementById('f-dir').value.trim();
  const payload = {
    client, phone, address,
    customer_code: code || null,
    device: dv,
    problem: document.getElementById('f-pr').value.trim(),
    cost: amountFromInput('f-co'),
    status: 'ingresado'
  };
  const { error } = await supabase.from('orders').insert(payload);
  if (error) { toast('No se pudo crear la orden: ' + error.message, 'danger'); btn.disabled = false; btn.textContent = 'Crear Orden'; return; }
  // Guarda/actualiza el directorio con lo último cargado, para que la
  // próxima orden con este mismo ID ya venga completa. No bloquea el flujo
  // si falla: la orden ya quedó creada.
  if (code) saveCustomer({ code, name: client, phone, address }).catch(() => {});
  toast('Orden creada', 'success');
  closeModal(); renderOrders();
}

export async function viewOrder(id) {
  document.getElementById('modalBody').innerHTML = `<div class="modal-title">Cargando…</div>`;
  openModal();
  // Un solo request trae la orden + sus trabajos (relación embebida vía
  // PostgREST) en paralelo con las fotos, en vez de 3 idas y vueltas.
  const [{ data: o, error }, photos] = await Promise.all([
    supabase.from('orders').select('*, order_works(*), order_costs(*)').eq('id', id)
      .order('created_at', { foreignTable: 'order_works' }).single(),
    listPhotos(BUCKET_ORDERS, id).catch(() => [])
  ]);
  if (error || !o) { document.getElementById('modalBody').innerHTML = `<div class="modal-title">Orden no encontrada</div>`; return; }
  viewedOrder = { id: o.id, device: o.device };
  const works = o.order_works || [];
  const costs = (o.order_costs || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const owed = Number(o.cost || 0) - Number(o.deposit || 0);

  document.getElementById('modalBody').innerHTML = `
    <div class="modal-title">${icon('device', { size: 19 })} ${esc(o.device)}</div>
    <div class="pipeline">${SO.map(s => `<button type="button" class="pip-step${o.status === s ? ' active' : ''}" data-s="${s}" onclick="TS.setStatus('${o.id}','${s}')">${SL[s]}</button>`).join('')}</div>
    <div class="detail-row"><span class="t-muted">Ingreso</span><span>${$D(o.created_at)}</span></div>
    <div class="detail-row"><span class="t-muted">Problema</span><span style="max-width:60%;text-align:right;font-size:.82rem">${esc(o.problem) || '—'}</span></div>

    <div class="sec-title">Cliente</div>
    <div class="form-group"><label for="e-id">ID Cliente</label><input id="e-id" value="${esc(o.customer_code) || ''}" placeholder="Opcional — ej: 0001"></div>
    <div class="form-group"><label for="e-cl">Cliente</label><input id="e-cl" value="${esc(o.client) || ''}" placeholder="Nombre del cliente"></div>
    <div class="form-group"><label for="e-ph">Teléfono</label><input id="e-ph" type="tel" value="${esc(o.phone) || ''}" placeholder="Número de contacto"></div>
    <div class="form-group"><label for="e-dir">Dirección</label><input id="e-dir" value="${esc(o.address) || ''}" placeholder="Dirección del cliente"></div>
    <button class="btn btn-ghost btn-sm" onclick="TS.updateClientInfo('${o.id}')">Actualizar datos</button>

    ${o.status === 'terminado' || o.status === 'entregado' ? `
    <div class="sec-title">Retiro del equipo</div>
    <div class="detail-row"><span class="t-muted">Terminado el</span><span>${$D(o.terminado_at)}</span></div>
    ${isOverdue(o) ? `<div class="detail-row"><span class="t-muted">Estado</span><span style="color:var(--white);font-weight:800;display:inline-flex;align-items:center;gap:5px">${icon('alert', { size: 15 })} Plazo de retiro vencido</span></div>` : ''}
    <div class="form-group"><label for="e-pickup">Fecha límite de retiro</label><input id="e-pickup" type="date" value="${o.pickup_deadline || ''}"></div>
    <button class="btn btn-ghost btn-sm" onclick="TS.updatePickupDeadline('${o.id}')">Actualizar</button>` : ''}

    ${o.status === 'entregado' ? `
    <div class="sec-title">Entrega y garantía</div>
    <div class="detail-row"><span class="t-muted">Entregado el</span><span>${$D(o.delivered_at)}</span></div>
    <div class="form-group"><label for="e-warranty">Vencimiento de garantía</label><input id="e-warranty" type="date" value="${o.warranty_until || ''}"></div>
    <button class="btn btn-ghost btn-sm" onclick="TS.updateWarranty('${o.id}')">Actualizar</button>` : ''}

    <div class="sec-title">Trabajos realizados</div>
    <div id="works-list">${renderWorks(works)}</div>
    <div class="row mt-8">
      <label class="sr-only" for="w-d">Descripción del trabajo</label>
      <input id="w-d" placeholder="Descripción del trabajo" style="flex:2">
      <label class="sr-only" for="w-c">Costo</label>
      <input id="w-c" type="number" inputmode="decimal" placeholder="$" style="flex:1">
      <button class="btn btn-primary btn-sm" aria-label="Agregar trabajo" onclick="TS.addWork('${o.id}')">+</button>
    </div>

    <div class="detail-row mt-12" style="border-top:1px solid var(--border);padding-top:12px">
      <span class="fw-700">Total</span>
      <span class="t-success fw-700 num" style="font-size:1.1rem">${$M(o.cost)}</span>
    </div>
    <div class="row mt-4">
      <label class="sr-only" for="new-cost">Actualizar costo total</label>
      <input id="new-cost" type="number" inputmode="decimal" placeholder="Actualizar costo total" style="flex:1">
      <button class="btn btn-ghost btn-sm" onclick="TS.updateCost('${o.id}')">Actualizar</button>
    </div>

    <div class="sec-title">Repuestos y gastos</div>
    <div id="order-costs-list">${renderOrderCosts(costs)}</div>
    <div class="row mt-8">
      <label class="sr-only" for="oc-d">Descripción del repuesto o gasto</label>
      <input id="oc-d" placeholder="Ej: Módulo, pantalla, flete…" style="flex:2">
      <label class="sr-only" for="oc-a">Costo</label>
      <input id="oc-a" type="number" inputmode="decimal" placeholder="$" style="flex:1">
      <button class="btn btn-primary btn-sm" aria-label="Agregar repuesto o gasto" onclick="TS.addOrderCost('${o.id}')">+</button>
    </div>
    ${renderOrderBreakdown(o, costs)}

    <div class="sec-title">Cobro</div>
    <div class="cost-breakdown">
      <div class="cb-row"><span>Abono / seña recibida</span><span>${$M(o.deposit)}</span></div>
      <div class="cb-row cb-profit ${owed > 0 ? 'cb-neg' : 'cb-pos'}">
        <span>${owed > 0 ? 'Saldo pendiente' : 'Pagado completo'}</span>
        <span>${owed > 0 ? $M(owed) : icon('checkCircle', { size: 18 })}</span>
      </div>
    </div>
    <div class="row mt-8">
      <label class="sr-only" for="new-deposit">Actualizar abono</label>
      <input id="new-deposit" type="number" inputmode="decimal" placeholder="Actualizar abono / entrega ($)" style="flex:1">
      <button class="btn btn-ghost btn-sm" onclick="TS.updateDeposit('${o.id}')">Actualizar</button>
    </div>

    <div class="sec-title">Fotos del equipo</div>
    <div class="photo-grid" id="pgrid">${photos.map((p, i) => `<div class="photo-wrap"><img src="${p.url}" alt="Foto del equipo ${i + 1}" loading="lazy"><button class="photo-del" onclick="TS.delPhoto('${o.id}','${p.path}')" aria-label="Eliminar foto ${i + 1}">${icon('close', { size: 13 })}</button></div>`).join('')}</div>
    <input type="file" id="pi" accept="image/*" multiple style="display:none" onchange="TS.addPhotos('${o.id}')">
    <button class="btn btn-ghost btn-sm mt-8" onclick="document.getElementById('pi').click()">${icon('camera', { size: 15 })} Agregar fotos</button>

    <div class="row-wrap mt-16">
      <button class="btn btn-primary" onclick="TS.genPDF('${o.id}')">${icon('document', { size: 15 })} Generar PDF</button>
      <button class="btn btn-danger btn-sm" onclick="TS.delOrder('${o.id}')">Eliminar</button>
    </div>`;
}

function renderWorks(works) {
  if (!works || !works.length) return '<div class="t-muted" style="padding:6px 0;font-size:.82rem">Sin trabajos registrados</div>';
  return works.map(w => `<div class="work-item"><span>${esc(w.description)}</span><div class="row"><span class="t-success num">${$M(w.cost)}</span><button class="icon-x" onclick="TS.delWork('${w.id}','${w.order_id}')" aria-label="Eliminar trabajo: ${esc(w.description)}">${icon('close', { size: 15 })}</button></div></div>`).join('');
}

function renderOrderCosts(costs) {
  if (!costs.length) return '<div class="t-muted" style="padding:6px 0;font-size:.82rem">Sin repuestos ni gastos cargados</div>';
  return costs.map(c => `<div class="work-item"><span>${esc(c.description)}</span><div class="row"><span class="t-danger num">${$M(c.amount)}</span><button class="icon-x" onclick="TS.delOrderCost('${c.id}','${c.order_id}')" aria-label="Eliminar: ${esc(c.description)}">${icon('close', { size: 15 })}</button></div></div>`).join('');
}

// El desglose no cambia lo que el cliente ve como Total (eso sigue siendo
// solo la suma de Trabajos realizados) — es una cuenta aparte, solo para el
// taller, de cuánto queda realmente después de descontar lo gastado en
// repuestos. Mismo criterio que ya usa el "desglose de rentabilidad" de
// Nuevos/Usados.
function renderOrderBreakdown(o, costs) {
  const extra = costs.reduce((s, c) => s + Number(c.amount || 0), 0);
  const total = Number(o.cost || 0);
  const profit = total - extra;
  const posCls = profit >= 0 ? 'cb-pos' : 'cb-neg';
  return `
    <div class="cost-breakdown mt-8">
      <div class="cb-row"><span>Total cobrado</span><span>${$M(total)}</span></div>
      ${extra ? `<div class="cb-row"><span>Repuestos y gastos</span><span>${$M(extra)}</span></div>` : ''}
      <div class="cb-row cb-profit ${posCls}">
        <span>Ganancia real</span>
        <span>${profit >= 0 ? '+' : ''}${$M(profit)}</span>
      </div>
    </div>`;
}

export async function updateClientInfo(id) {
  const code = document.getElementById('e-id').value.trim();
  const client = document.getElementById('e-cl').value.trim();
  const phone = document.getElementById('e-ph').value.trim();
  const address = document.getElementById('e-dir').value.trim();
  const { error } = await supabase.from('orders').update({
    client, phone, address, customer_code: code || null
  }).eq('id', id);
  if (error) { toast('No se pudieron actualizar los datos', 'danger'); return; }
  // Igual que al crear: si tiene ID, sincroniza el directorio con lo último.
  if (code) saveCustomer({ code, name: client, phone, address }).catch(() => {});
  toast('Datos del cliente actualizados', 'success');
  viewOrder(id); renderOrders();
}

export async function updatePickupDeadline(id) {
  const v = document.getElementById('e-pickup').value;
  const { error } = await supabase.from('orders').update({ pickup_deadline: v || null }).eq('id', id);
  if (error) { toast('No se pudo actualizar la fecha', 'danger'); return; }
  toast('Fecha límite de retiro actualizada', 'success');
  // La lista también depende de esta fecha (badge "Vencido"), a diferencia
  // de la garantía que solo se ve en el detalle.
  viewOrder(id); renderOrders();
}

export async function updateWarranty(id) {
  const v = document.getElementById('e-warranty').value;
  const { error } = await supabase.from('orders').update({ warranty_until: v || null }).eq('id', id);
  if (error) { toast('No se pudo actualizar la garantía', 'danger'); return; }
  toast('Vencimiento de garantía actualizado', 'success');
  viewOrder(id);
}

export async function setStatus(id, s) {
  const payload = { status: s };
  if (s === 'entregado') payload.delivered_at = new Date().toISOString();
  if (s === 'terminado') payload.terminado_at = new Date().toISOString();
  const { error } = await supabase.from('orders').update(payload).eq('id', id);
  if (error) { toast('No se pudo actualizar el estado', 'danger'); return; }
  toast(`Estado: ${SL[s]}`, 'success');
  viewOrder(id); renderOrders();
}

export async function addWork(id) {
  const d = document.getElementById('w-d').value.trim();
  const c = amountFromInput('w-c');
  if (!d) { toast('Ingresá una descripción', 'warn'); return; }
  const { error } = await supabase.from('order_works').insert({ order_id: id, description: d, cost: c });
  if (error) { toast('No se pudo agregar el trabajo', 'danger'); return; }
  // El costo total de la orden lo recalcula un trigger en la base al vuelo.
  viewOrder(id); renderOrders();
}

export async function delWork(workId, orderId) {
  const { error } = await supabase.from('order_works').delete().eq('id', workId);
  if (error) { toast('No se pudo eliminar', 'danger'); return; }
  viewOrder(orderId); renderOrders();
}

export async function addOrderCost(id) {
  const d = document.getElementById('oc-d').value.trim();
  const a = amountFromInput('oc-a');
  if (!d) { toast('Ingresá una descripción', 'warn'); return; }
  const { data: created, error } = await supabase.from('order_costs')
    .insert({ order_id: id, description: d, amount: a }).select('id').single();
  if (error) { toast('No se pudo agregar', 'danger'); return; }
  if (a) {
    const device = viewedOrder.id === id ? viewedOrder.device : 'equipo';
    await cajaPush('salida', `Repuesto/gasto (${device}): ${d}`, a, 'order_cost', created.id);
  }
  toast('Repuesto/gasto agregado', 'success');
  viewOrder(id);
}

export async function delOrderCost(costId, orderId) {
  const { error } = await supabase.from('order_costs').delete().eq('id', costId);
  if (error) { toast('No se pudo eliminar', 'danger'); return; }
  await deleteMovementsBySource('order_cost', costId);
  viewOrder(orderId);
}

export async function updateCost(id) {
  const v = parseFloat(document.getElementById('new-cost').value);
  if (isNaN(v) || v < 0) { toast('Ingresá un costo válido', 'warn'); return; }
  const { error } = await supabase.from('orders').update({ cost: v }).eq('id', id);
  if (error) { toast('No se pudo actualizar el costo', 'danger'); return; }
  viewOrder(id); renderOrders();
}

// El abono queda enlazado a Caja: cada aumento genera una entrada, cada
// reducción (ajuste o devolución) genera una salida — igual que repuestos.
export async function updateDeposit(id) {
  const v = parseFloat(document.getElementById('new-deposit').value);
  if (isNaN(v) || v < 0) { toast('Ingresá un abono válido', 'warn'); return; }
  const { data: cur } = await supabase.from('orders').select('deposit, device').eq('id', id).single();
  const diff = v - Number(cur?.deposit || 0);
  const { error } = await supabase.from('orders').update({ deposit: v }).eq('id', id);
  if (error) { toast('No se pudo actualizar el abono', 'danger'); return; }
  if (diff > 0) await cajaPush('entrada', `Abono orden: ${cur.device}`, diff, 'order_deposit', id);
  else if (diff < 0) await cajaPush('salida', `Ajuste de abono: ${cur.device}`, -diff, 'order_deposit', id);
  toast('Abono actualizado', 'success');
  viewOrder(id); renderOrders();
}

export async function addPhotos(id) {
  const files = document.getElementById('pi').files;
  if (!files.length) return;
  toast(`Subiendo ${files.length} foto(s)…`, 'info');
  try {
    for (const f of Array.from(files)) await uploadPhoto(BUCKET_ORDERS, id, f);
    toast('Fotos subidas', 'success');
  } catch (e) { toast('Error subiendo fotos: ' + e.message, 'danger'); }
  viewOrder(id);
}

export async function delPhoto(id, path) {
  try { await deletePhoto(BUCKET_ORDERS, path); } catch (e) { toast('No se pudo eliminar la foto', 'danger'); return; }
  viewOrder(id);
}

export async function delOrder(id) {
  if (!await confirmDialog('¿Eliminar esta orden? Esta acción no se puede deshacer.')) return;
  try {
    const photos = await listPhotos(BUCKET_ORDERS, id);
    await Promise.all(photos.map(p => deletePhoto(BUCKET_ORDERS, p.path)));
  } catch (e) { /* continuar igual con el borrado del registro */ }
  // Limpiar en Caja lo que esta orden generó (abono + cada repuesto/gasto)
  // para que no quede plata fantasma de algo que ya no existe.
  try {
    const { data: costs } = await supabase.from('order_costs').select('id').eq('order_id', id);
    await deleteMovementsForOrder(id, (costs || []).map(c => c.id));
  } catch (e) { /* continuar */ }
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) { toast('No se pudo eliminar la orden', 'danger'); return; }
  toast('Orden eliminada', 'success');
  closeModal(); renderOrders();
}

// El ícono del logo (fondo transparente, ver icons/logo-mark.png) se carga
// una sola vez y se reusa en cada PDF — evita re-pedirlo por cada reporte.
let logoDataUrl; // undefined = todavía no se intentó, null = se intentó y falló
async function loadLogo() {
  if (logoDataUrl !== undefined) return logoDataUrl;
  try {
    const blob = await (await fetch('./icons/logo-mark.png')).blob();
    logoDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) { logoDataUrl = null; } // sin logo, el PDF sigue funcionando igual
  return logoDataUrl;
}

// ── PDF ───────────────────────────────────────────────────────
export async function genPDF(id) {
  const [{ data: o }, logo] = await Promise.all([
    supabase.from('orders').select('*, order_works(*)').eq('id', id)
      .order('created_at', { foreignTable: 'order_works' }).single(),
    loadLogo()
  ]);
  if (!o) return;
  const works = o.order_works || [];
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 20; let y = M;

  doc.setFillColor(0, 0, 0); doc.rect(0, 0, W, 42, 'F');
  // Proporción real de icons/logo-mark.png (270×281) para no deformarlo.
  let textX = M;
  if (logo) {
    const logoW = 22, logoH = logoW * (281 / 270);
    doc.addImage(logo, 'PNG', M, (42 - logoH) / 2, logoW, logoH);
    textX = M + logoW + 8;
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('TOUCH SERVIS', textX, 17);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Servicio Técnico de Celulares', textX, 25);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('N° ' + o.id.slice(-6).toUpperCase(), W - M, 17, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text($D(o.created_at), W - M, 25, { align: 'right' });
  const sc = { ingresado: [110, 180, 255], en_proceso: [47, 123, 255], terminado: [21, 80, 201], entregado: [40, 46, 61] };
  const [sr, sg, sb] = sc[o.status] || sc.ingresado;
  doc.setFillColor(sr, sg, sb); doc.roundedRect(W - M - 36, 30, 36, 8, 2, 2, 'F');
  doc.setTextColor(...(o.status === 'ingresado' ? [10, 15, 25] : [255, 255, 255]));
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text(SL[o.status], W - M - 18, 35.5, { align: 'center' });

  // Detalles del cliente: teléfono, dirección e ID solo se listan si están
  // cargados — la caja crece según haga falta en vez de dejar líneas vacías.
  const clientLines = [];
  if (o.phone) clientLines.push('Tel: ' + o.phone);
  if (o.address) clientLines.push('Dir: ' + o.address);
  if (o.customer_code) clientLines.push('ID cliente: ' + o.customer_code);

  y = 54;
  const boxH = 26 + clientLines.length * 6;
  doc.setFillColor(241, 245, 249); doc.roundedRect(M, y, W - M * 2, boxH, 3, 3, 'F');
  doc.setTextColor(100, 116, 139); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE', M + 6, y + 8);
  doc.text('DISPOSITIVO', W / 2 + 4, y + 8);
  doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(o.client || 'Sin nombre', M + 6, y + 18);
  doc.setFontSize(9); doc.setTextColor(71, 85, 105);
  clientLines.forEach((line, i) => doc.text(line, M + 6, y + 27 + i * 6));
  doc.setFontSize(11); doc.setTextColor(15, 23, 42);
  doc.text(o.device || '—', W / 2 + 4, y + 18);
  y += boxH + 10;

  // Entrega y garantía: solo aparecen si están cargadas (ninguna es
  // obligatoria — muchas reparaciones no llevan garantía, ej. módulo genérico).
  if (o.delivered_at || o.warranty_until) {
    doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    if (o.delivered_at) doc.text('FECHA DE ENTREGA', M, y);
    if (o.warranty_until) doc.text('GARANTÍA HASTA', W / 2 + 4, y);
    y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
    if (o.delivered_at) doc.text($D(o.delivered_at), M, y);
    if (o.warranty_until) doc.text($Ddate(o.warranty_until), W / 2 + 4, y);
    y += 10;
  }

  doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text('PROBLEMA REPORTADO', M, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
  const pLines = doc.splitTextToSize(o.problem || 'Sin descripción', W - M * 2);
  doc.text(pLines, M, y); y += pLines.length * 5 + 10;

  if (works && works.length) {
    doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('TRABAJOS REALIZADOS', M, y); y += 5;
    doc.setFillColor(0, 0, 0); doc.rect(M, y, W - M * 2, 7, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(9);
    doc.text('Descripción', M + 4, y + 5); doc.text('Costo', W - M - 4, y + 5, { align: 'right' }); y += 7;
    works.forEach((w, i) => {
      doc.setFillColor(i % 2 ? 255 : 248, i % 2 ? 255 : 250, i % 2 ? 255 : 252);
      doc.rect(M, y, W - M * 2, 8, 'F');
      doc.setTextColor(15, 23, 42); doc.text(w.description, M + 4, y + 5.5);
      doc.setTextColor(47, 123, 255); doc.text($M(w.cost), W - M - 4, y + 5.5, { align: 'right' }); y += 8;
    }); y += 4;
  }

  doc.setFillColor(47, 123, 255); doc.roundedRect(M, y, W - M * 2, 14, 3, 3, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('TOTAL', M + 6, y + 9.5); doc.text($M(o.cost), W - M - 6, y + 9.5, { align: 'right' }); y += 22;

  if (o.notes) {
    doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('NOTAS', M, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
    doc.text(doc.splitTextToSize(o.notes, W - M * 2), M, y);
  }

  doc.setFontSize(8); doc.setTextColor(148, 163, 184); doc.setFont('helvetica', 'normal');
  doc.text('Gracias por confiar en Touch Servis · Este documento es el comprobante oficial de su equipo.', W / 2, 286, { align: 'center' });
  doc.line(M, 282, W - M, 282);

  doc.save(`TouchServis_Orden_${o.id.slice(-6).toUpperCase()}.pdf`);
}
