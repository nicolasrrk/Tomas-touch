// ── Módulo Nuevos / Usados (catálogo de equipos) ────────────────
import { supabase } from './supabaseClient.js';
import { BUCKET_PRODUCTS } from './config.js';
import { $M, $D, esc, toast, openModal, closeModal, skeletonCards, errorState, confirmDialog, promptDialog, animateStats } from './ui.js';
import { uploadPhoto, listPhotos, deletePhoto } from './storage.js';
import { cajaPush, deleteMovementsBySource, deleteMovementsForProduct } from './caja.js';
import { icon } from './icons.js';

export let currentKind = 'usado'; // sub-tab activo dentro de la página

export function setKind(kind) {
  currentKind = kind;
  document.querySelectorAll('.subtab').forEach(x => {
    const active = x.dataset.kind === kind;
    x.classList.toggle('active', active);
    x.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  renderProducts();
}

async function fetchProducts(kind) {
  const { data, error } = await supabase.from('products').select('*, product_costs(amount)')
    .eq('kind', kind).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Costo real de un equipo = lo que costó comprarlo + repuestos/gastos aplicados.
function extraCosts(p) { return (p.product_costs || []).reduce((s, c) => s + Number(c.amount || 0), 0); }
function totalCost(p) { return Number(p.buy_price || 0) + extraCosts(p); }

// Evita re-consultar el nombre del equipo cada vez que se agrega un repuesto:
// se guarda al abrir el detalle y se reutiliza (se limpia si se cambia de equipo).
let viewedProduct = { id: null, device: null };

export async function renderProducts() {
  const list = document.getElementById('listUsados');
  list.innerHTML = skeletonCards(3);
  let items;
  try { items = await fetchProducts(currentKind); }
  catch (e) {
    list.innerHTML = errorState('No se pudo cargar el catálogo.', 'Reintentar', 'onclick="TS.renderProducts()"');
    return;
  }
  const disp = items.filter(x => x.status === 'disponible').length;
  const vend = items.filter(x => x.status === 'vendido').length;
  const ganancia = items.filter(x => x.status === 'vendido').reduce((s, x) => s + (Number(x.sell_price) - totalCost(x)), 0);
  const statsEl = document.getElementById('statsUsados');
  statsEl.innerHTML = `
    <div class="stat"><div class="stat-val" data-count="${disp}">0</div><div class="stat-lbl">Disponibles</div></div>
    <div class="stat"><div class="stat-val" data-count="${vend}">0</div><div class="stat-lbl">Vendidos</div></div>
    <div class="stat"><div class="stat-val t-success" style="font-size:.95rem" data-count="${ganancia}" data-money="1">$0</div><div class="stat-lbl">Ganancia</div></div>`;
  animateStats(statsEl);
  const label = { disponible: 'Disponible', reservado: 'Reservado', vendido: 'Vendido' };
  list.innerHTML = items.length ? items.map(p => {
    const extra = extraCosts(p);
    return `
    <div class="card" onclick="TS.viewProduct('${p.id}')">
      <div class="card-header">
        <div style="min-width:0">
          <div class="fw-700" style="margin-bottom:3px">${esc(p.device)}</div>
          <div class="t-muted">Compra: ${$M(p.buy_price)}${extra ? ' + ' + $M(extra) + ' repuestos' : ''} · Venta: ${$M(p.sell_price)}</div>
        </div>
        <span class="badge badge-${p.status}">${label[p.status]}</span>
      </div>
      ${p.status === 'vendido' ? `<div class="t-success" style="font-size:.82rem;margin-top:6px">Ganancia: <span class="num">${$M(Number(p.sell_price) - totalCost(p))}</span></div>` : ''}
      ${(() => { const owed = Number(p.sell_price || 0) - Number(p.deposit || 0); return owed > 0 && Number(p.sell_price) > 0 ? `<div class="t-muted" style="font-size:.75rem;margin-top:2px">Debe <span class="num">${$M(owed)}</span></div>` : ''; })()}
      <div class="t-muted" style="font-size:.75rem;margin-top:4px">${$D(p.created_at)}</div>
    </div>`;
  }).join('')
    : `<div class="empty"><div class="empty-ico">${icon('device', { size: 40 })}</div>No hay ${currentKind === 'nuevo' ? 'equipos nuevos' : 'usados'} registrados<br><span class="t-muted" style="font-size:.8rem">Tocá + para agregar uno</span></div>`;
}

export function newProductModal() {
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-title">Nuevo ${currentKind === 'nuevo' ? 'Equipo Nuevo' : 'Usado'}</div>
    <div class="form-group"><label for="p-kind">Tipo</label>
      <select id="p-kind"><option value="usado">Usado</option><option value="nuevo">Nuevo</option></select>
    </div>
    <div class="form-group"><label for="p-dv">Dispositivo</label><input id="p-dv" placeholder="Ej: iPhone 13 128GB Azul"></div>
    <div class="grid-2">
      <div class="form-group"><label for="p-buy">Precio de compra ($)</label><input id="p-buy" type="number" inputmode="decimal" placeholder="0"></div>
      <div class="form-group"><label for="p-sel">Precio de venta ($)</label><input id="p-sel" type="number" inputmode="decimal" placeholder="0"></div>
    </div>
    <div class="form-group"><label for="p-st">Estado</label>
      <select id="p-st"><option value="disponible">Disponible</option><option value="reservado">Reservado</option><option value="vendido">Vendido</option></select>
    </div>
    <div class="form-group"><label for="p-nt">Notas (accesorios, condición, etc.)</label><textarea id="p-nt" placeholder="Ej: Caja original, batería 89%, sin rayones"></textarea></div>
    <button class="btn btn-primary btn-full mt-12" id="btn-create-product">Guardar</button>`;
  document.getElementById('p-kind').value = currentKind;
  document.getElementById('btn-create-product').addEventListener('click', createProduct);
  openModal();
}

async function createProduct() {
  const dv = document.getElementById('p-dv').value.trim();
  if (!dv) { toast('Ingresá el dispositivo', 'warn'); return; }
  const kind = document.getElementById('p-kind').value;
  const buy = parseFloat(document.getElementById('p-buy').value) || 0;
  const sell = parseFloat(document.getElementById('p-sel').value) || 0;
  const status = document.getElementById('p-st').value;
  const notes = document.getElementById('p-nt').value.trim();
  const { data: created, error } = await supabase.from('products')
    .insert({ kind, device: dv, buy_price: buy, sell_price: sell, status, notes })
    .select('id').single();
  if (error) { toast('No se pudo guardar: ' + error.message, 'danger'); return; }
  if (buy) await cajaPush('salida', `Compra ${kind}: ${dv}`, buy, 'product_buy', created.id);
  if (status === 'vendido' && sell) await cajaPush('entrada', `Venta ${kind}: ${dv}`, sell, 'product_sale', created.id);
  toast('Guardado', 'success');
  closeModal();
  if (kind !== currentKind) setKind(kind); else renderProducts();
}

export async function viewProduct(id) {
  document.getElementById('modalBody').innerHTML = `<div class="modal-title">Cargando…</div>`;
  openModal();
  const [{ data: p, error }, photos] = await Promise.all([
    supabase.from('products').select('*, product_costs(*)').eq('id', id).single(),
    listPhotos(BUCKET_PRODUCTS, id).catch(() => [])
  ]);
  if (error || !p) { document.getElementById('modalBody').innerHTML = `<div class="modal-title">No encontrado</div>`; return; }
  viewedProduct = { id: p.id, device: p.device };
  const label = { disponible: 'Disponible', reservado: 'Reservado', vendido: 'Vendido' };
  const costs = (p.product_costs || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  document.getElementById('modalBody').innerHTML = `
    <div class="modal-title">${icon('device', { size: 19 })} ${esc(p.device)}</div>
    <div class="detail-row"><span class="t-muted">Tipo</span><span>${p.kind === 'nuevo' ? 'Nuevo' : 'Usado'}</span></div>
    <div class="detail-row"><span class="t-muted">Estado</span><span class="badge badge-${p.status}">${label[p.status]}</span></div>
    <div class="detail-row"><span class="t-muted">Fecha</span><span>${$D(p.created_at)}</span></div>
    ${p.notes ? `<div class="detail-row"><span class="t-muted">Notas</span><span style="max-width:60%;text-align:right;font-size:.82rem">${esc(p.notes)}</span></div>` : ''}

    <div class="sec-title">Repuestos y gastos</div>
    <div id="costs-list">${renderCosts(costs)}</div>
    <div class="row mt-8">
      <label class="sr-only" for="c-d">Descripción del repuesto o gasto</label>
      <input id="c-d" placeholder="Ej: Pantalla, batería, flete…" style="flex:2">
      <label class="sr-only" for="c-a">Costo</label>
      <input id="c-a" type="number" inputmode="decimal" placeholder="$" style="flex:1">
      <button class="btn btn-primary btn-sm" aria-label="Agregar repuesto o gasto" onclick="TS.addProductCost('${p.id}')">+</button>
    </div>

    ${renderBreakdown(p, costs)}

    <div class="sec-title">Cobro al cliente</div>
    ${renderDepositBlock(p)}
    <div class="row mt-8">
      <label class="sr-only" for="new-deposit">Actualizar abono / entrega</label>
      <input id="new-deposit" type="number" inputmode="decimal" placeholder="Actualizar abono / entrega ($)" style="flex:1">
      <button class="btn btn-ghost btn-sm" onclick="TS.updateProductDeposit('${p.id}')">Actualizar</button>
    </div>

    <div class="sec-title">Fotos</div>
    <div class="photo-grid" id="upgrid">${photos.map((ph, i) => `<div class="photo-wrap"><img src="${ph.url}" alt="Foto ${i + 1}" loading="lazy"><button class="photo-del" onclick="TS.delProductPhoto('${p.id}','${ph.path}')" aria-label="Eliminar foto ${i + 1}">${icon('close', { size: 13 })}</button></div>`).join('')}</div>
    <input type="file" id="upi" accept="image/*" multiple style="display:none" onchange="TS.addProductPhotos('${p.id}')">
    <button class="btn btn-ghost btn-sm mt-8" onclick="document.getElementById('upi').click()">${icon('camera', { size: 15 })} Agregar fotos</button>

    <div class="row-wrap mt-16">
      ${p.status !== 'vendido' ? `<button class="btn btn-success" onclick="TS.markSold('${p.id}')">${icon('checkCircle', { size: 15 })} Marcar vendido</button>` : ''}
      <button class="btn btn-danger btn-sm" onclick="TS.delProduct('${p.id}')">Eliminar</button>
    </div>`;
}

function renderCosts(costs) {
  if (!costs.length) return '<div class="t-muted" style="padding:6px 0;font-size:.82rem">Sin repuestos ni gastos cargados</div>';
  return costs.map(c => `<div class="work-item"><span>${esc(c.description)}</span><div class="row"><span class="t-danger num">${$M(c.amount)}</span><button class="icon-x" onclick="TS.delProductCost('${c.id}','${c.product_id}')" aria-label="Eliminar: ${esc(c.description)}">${icon('close', { size: 15 })}</button></div></div>`).join('');
}

// El "desglose" es el toque especial: muestra de un vistazo si el equipo
// deja ganancia real una vez sumados los repuestos, no solo compra vs. venta.
function renderBreakdown(p, costs) {
  const extra = costs.reduce((s, c) => s + Number(c.amount || 0), 0);
  const cost = Number(p.buy_price || 0) + extra;
  const sell = Number(p.sell_price || 0);
  const profit = sell - cost;
  const m = cost ? Math.round((profit / cost) * 100) : 0;
  const posCls = profit >= 0 ? 'cb-pos' : 'cb-neg';
  return `
    <div class="cost-breakdown">
      <div class="cb-row"><span>Compra</span><span>${$M(p.buy_price)}</span></div>
      ${extra ? `<div class="cb-row"><span>Repuestos y gastos</span><span>${$M(extra)}</span></div>` : ''}
      <div class="cb-row cb-sub"><span>Costo total</span><span>${$M(cost)}</span></div>
      <div class="cb-row"><span>Precio de venta</span><span>${$M(sell)}</span></div>
      <div class="cb-row cb-profit ${posCls}">
        <span>${p.status === 'vendido' ? 'Ganancia' : 'Ganancia proyectada'}</span>
        <span>${profit >= 0 ? '+' : ''}${$M(profit)}<span class="cb-margin">${cost ? m + '%' : ''}</span></span>
      </div>
    </div>`;
}

function renderDepositBlock(p) {
  const owed = Number(p.sell_price || 0) - Number(p.deposit || 0);
  return `
    <div class="cost-breakdown">
      <div class="cb-row"><span>Abono / entrega recibida</span><span>${$M(p.deposit)}</span></div>
      <div class="cb-row cb-profit ${owed > 0 ? 'cb-neg' : 'cb-pos'}">
        <span>${owed > 0 ? 'Saldo pendiente' : 'Pagado completo'}</span>
        <span>${owed > 0 ? $M(owed) : icon('checkCircle', { size: 18 })}</span>
      </div>
    </div>`;
}

// Enlazado a Caja igual que los repuestos: cada cambio en el abono mueve
// la diferencia (entrada si aumenta, salida si se ajusta/devuelve).
export async function updateProductDeposit(id) {
  const v = parseFloat(document.getElementById('new-deposit').value);
  if (isNaN(v) || v < 0) return;
  const { data: cur } = await supabase.from('products').select('deposit, device').eq('id', id).single();
  const diff = v - Number(cur?.deposit || 0);
  const { error } = await supabase.from('products').update({ deposit: v }).eq('id', id);
  if (error) { toast('No se pudo actualizar el abono', 'danger'); return; }
  if (diff > 0) await cajaPush('entrada', `Abono equipo: ${cur.device}`, diff, 'product_deposit', id);
  else if (diff < 0) await cajaPush('salida', `Ajuste de abono: ${cur.device}`, -diff, 'product_deposit', id);
  toast('Abono actualizado', 'success');
  viewProduct(id); renderProducts();
}

export async function addProductCost(id) {
  const d = document.getElementById('c-d').value.trim();
  const a = parseFloat(document.getElementById('c-a').value) || 0;
  if (!d) { toast('Ingresá una descripción', 'warn'); return; }
  const { data: created, error } = await supabase.from('product_costs')
    .insert({ product_id: id, description: d, amount: a }).select('id').single();
  if (error) { toast('No se pudo agregar', 'danger'); return; }
  if (a) {
    const device = viewedProduct.id === id ? viewedProduct.device : 'equipo';
    await cajaPush('salida', `Repuesto/gasto (${device}): ${d}`, a, 'product_cost', created.id);
  }
  toast('Repuesto/gasto agregado', 'success');
  viewProduct(id); renderProducts();
}

export async function delProductCost(costId, productId) {
  const { error } = await supabase.from('product_costs').delete().eq('id', costId);
  if (error) { toast('No se pudo eliminar', 'danger'); return; }
  await deleteMovementsBySource('product_cost', costId);
  viewProduct(productId); renderProducts();
}

export async function markSold(id) {
  const { data: p } = await supabase.from('products').select('*').eq('id', id).single();
  if (!p) return;
  const priceStr = await promptDialog('Precio de venta final ($):', p.sell_price || '');
  if (priceStr === null) return;
  const sell = parseFloat(priceStr) || p.sell_price;
  // Si ya hubo abonos cargados, solo se cobra el saldo restante — el abono
  // ya se había registrado en Caja al momento de recibirlo, no se duplica.
  const remaining = sell - Number(p.deposit || 0);
  const { error } = await supabase.from('products')
    .update({ status: 'vendido', sell_price: sell, deposit: sell, sold_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast('No se pudo actualizar', 'danger'); return; }
  if (remaining > 0) await cajaPush('entrada', `Venta ${p.kind}: ${p.device}`, remaining, 'product_sale', id);
  toast('Marcado como vendido', 'success');
  viewProduct(id); renderProducts();
}

export async function addProductPhotos(id) {
  const files = document.getElementById('upi').files;
  if (!files.length) return;
  toast(`Subiendo ${files.length} foto(s)…`, 'info');
  try {
    for (const f of Array.from(files)) await uploadPhoto(BUCKET_PRODUCTS, id, f);
    toast('Fotos subidas', 'success');
  } catch (e) { toast('Error subiendo fotos: ' + e.message, 'danger'); }
  viewProduct(id);
}

export async function delProductPhoto(id, path) {
  try { await deletePhoto(BUCKET_PRODUCTS, path); } catch (e) { toast('No se pudo eliminar la foto', 'danger'); return; }
  viewProduct(id);
}

export async function delProduct(id) {
  if (!await confirmDialog('¿Eliminar este registro? También se borran sus movimientos en Caja.')) return;
  try {
    const photos = await listPhotos(BUCKET_PRODUCTS, id);
    await Promise.all(photos.map(p => deletePhoto(BUCKET_PRODUCTS, p.path)));
  } catch (e) { /* continuar */ }
  // Limpiar en Caja lo que este equipo generó (compra, venta, y cada
  // repuesto/gasto) para que no quede plata fantasma de algo que ya no existe.
  try {
    const { data: costs } = await supabase.from('product_costs').select('id').eq('product_id', id);
    await deleteMovementsForProduct(id, (costs || []).map(c => c.id));
  } catch (e) { /* continuar igual con el borrado del registro */ }
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) { toast('No se pudo eliminar', 'danger'); return; }
  toast('Eliminado', 'success');
  closeModal(); renderProducts();
}
