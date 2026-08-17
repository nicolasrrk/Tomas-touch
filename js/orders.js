// ── Módulo Órdenes de reparación ────────────────────────────────
import { supabase } from './supabaseClient.js';
import { BUCKET_ORDERS } from './config.js';
import { $M, $D, esc, toast, openModal, closeModal, skeletonCards, errorState, confirmDialog, groupByMonth, animateStats } from './ui.js';
import { uploadPhoto, listPhotos, deletePhoto } from './storage.js';
import { icon } from './icons.js';
import { cajaPush, deleteMovementsBySource } from './caja.js';

const SL = { ingresado: 'Ingresado', en_proceso: 'En proceso', terminado: 'Terminado', entregado: 'Entregado' };
const SO = ['ingresado', 'en_proceso', 'terminado', 'entregado'];

let cache = [];

async function fetchOrders() {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  cache = data || [];
  return cache;
}

export async function renderOrders() {
  const list = document.getElementById('listOrders');
  list.innerHTML = skeletonCards(3);
  let orders;
  try { orders = await fetchOrders(); }
  catch (e) {
    list.innerHTML = errorState('No se pudieron cargar las órdenes.', 'Reintentar', 'onclick="TS.renderOrders()"');
    return;
  }
  const q = (document.getElementById('searchOrders')?.value || '').toLowerCase();
  const filtered = orders.filter(o => !q ||
    o.client?.toLowerCase().includes(q) || o.device?.toLowerCase().includes(q));

  const c = { ingresado: 0, en_proceso: 0, terminado: 0 };
  orders.forEach(o => { if (c[o.status] !== undefined) c[o.status]++; });
  const statsEl = document.getElementById('statsOrders');
  statsEl.innerHTML = `
    <div class="stat"><div class="stat-val" style="color:var(--primary-bright)" data-count="${c.ingresado}">0</div><div class="stat-lbl">Ingresados</div></div>
    <div class="stat"><div class="stat-val" style="color:var(--primary)" data-count="${c.en_proceso}">0</div><div class="stat-lbl">En proceso</div></div>
    <div class="stat"><div class="stat-val t-success" data-count="${c.terminado}">0</div><div class="stat-lbl">Terminados</div></div>`;
  animateStats(statsEl);

  list.innerHTML = filtered.length ? groupByMonth(filtered, 'created_at', o => {
    const owed = Number(o.cost || 0) - Number(o.deposit || 0);
    return `
    <div class="card" onclick="TS.viewOrder('${o.id}')">
      <div class="card-header">
        <div style="min-width:0">
          <div class="fw-700" style="margin-bottom:3px">${esc(o.device) || 'Sin dispositivo'}</div>
          <div class="t-muted">${esc(o.client) || 'Sin nombre'}${o.phone ? ' · ' + esc(o.phone) : ''}</div>
        </div>
        <span class="badge badge-${o.status}">${SL[o.status]}</span>
      </div>
      <div style="font-size:.78rem;color:var(--muted);margin-top:7px">
        ${icon('calendar', { size: 13 })} ${$D(o.created_at)}&nbsp;·&nbsp;${o.problem ? icon('chat', { size: 13 }) + ' ' + esc(o.problem.slice(0, 38)) + (o.problem.length > 38 ? '…' : '') : 'Sin descripción'}
      </div>
      <div class="row" style="margin-top:6px;gap:10px">
        ${o.cost ? `<div class="t-success fw-700">${$M(o.cost)}</div>` : ''}
        ${owed > 0 ? `<div class="t-muted" style="font-size:.75rem">Debe ${$M(owed)}</div>` : (o.cost ? `<div class="t-muted" style="font-size:.75rem">Pagado</div>` : '')}
      </div>
    </div>`;
  })
    : `<div class="empty"><div class="empty-ico">${icon('clipboard', { size: 40 })}</div>No hay órdenes aún<br><span class="t-muted" style="font-size:.8rem">Tocá + para crear una</span></div>`;
}

export function newOrderModal() {
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-title">Nueva Orden</div>
    <div class="form-group"><label for="f-cl">Cliente</label><input id="f-cl" placeholder="Nombre del cliente"></div>
    <div class="form-group"><label for="f-ph">Teléfono</label><input id="f-ph" type="tel" placeholder="Número de contacto"></div>
    <div class="form-group"><label for="f-dv">Dispositivo</label><input id="f-dv" placeholder="Ej: Samsung A54 Negro"></div>
    <div class="form-group"><label for="f-pr">Problema reportado</label><textarea id="f-pr" placeholder="Describe el problema que trae el equipo…"></textarea></div>
    <div class="form-group"><label for="f-co">Costo estimado ($)</label><input id="f-co" type="number" inputmode="decimal" placeholder="0"></div>
    <button class="btn btn-primary btn-full mt-12" id="btn-create-order">Crear Orden</button>`;
  document.getElementById('btn-create-order').addEventListener('click', createOrder);
  openModal();
}

async function createOrder() {
  const dv = document.getElementById('f-dv').value.trim();
  if (!dv) { toast('Ingresá el dispositivo', 'warn'); return; }
  const btn = document.getElementById('btn-create-order');
  btn.disabled = true; btn.textContent = 'Creando…';
  const payload = {
    client: document.getElementById('f-cl').value.trim(),
    phone: document.getElementById('f-ph').value.trim(),
    device: dv,
    problem: document.getElementById('f-pr').value.trim(),
    cost: parseFloat(document.getElementById('f-co').value) || 0,
    status: 'ingresado'
  };
  const { error } = await supabase.from('orders').insert(payload);
  if (error) { toast('No se pudo crear la orden: ' + error.message, 'danger'); btn.disabled = false; btn.textContent = 'Crear Orden'; return; }
  toast('Orden creada', 'success');
  closeModal(); renderOrders();
}

export async function viewOrder(id) {
  document.getElementById('modalBody').innerHTML = `<div class="modal-title">Cargando…</div>`;
  openModal();
  // Un solo request trae la orden + sus trabajos (relación embebida vía
  // PostgREST) en paralelo con las fotos, en vez de 3 idas y vueltas.
  const [{ data: o, error }, photos] = await Promise.all([
    supabase.from('orders').select('*, order_works(*)').eq('id', id)
      .order('created_at', { foreignTable: 'order_works' }).single(),
    listPhotos(BUCKET_ORDERS, id).catch(() => [])
  ]);
  if (error || !o) { document.getElementById('modalBody').innerHTML = `<div class="modal-title">Orden no encontrada</div>`; return; }
  const works = o.order_works || [];
  const owed = Number(o.cost || 0) - Number(o.deposit || 0);

  document.getElementById('modalBody').innerHTML = `
    <div class="modal-title">${icon('device', { size: 19 })} ${esc(o.device)}</div>
    <div class="pipeline">${SO.map(s => `<button type="button" class="pip-step${o.status === s ? ' active' : ''}" data-s="${s}" onclick="TS.setStatus('${o.id}','${s}')">${SL[s]}</button>`).join('')}</div>
    <div class="detail-row"><span class="t-muted">Cliente</span><span>${esc(o.client) || '—'}</span></div>
    <div class="detail-row"><span class="t-muted">Teléfono</span><span>${esc(o.phone) || '—'}</span></div>
    <div class="detail-row"><span class="t-muted">Ingreso</span><span>${$D(o.created_at)}</span></div>
    <div class="detail-row"><span class="t-muted">Problema</span><span style="max-width:60%;text-align:right;font-size:.82rem">${esc(o.problem) || '—'}</span></div>

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
      <span class="t-success fw-700" style="font-size:1.1rem">${$M(o.cost)}</span>
    </div>
    <div class="row mt-4">
      <label class="sr-only" for="new-cost">Actualizar costo total</label>
      <input id="new-cost" type="number" inputmode="decimal" placeholder="Actualizar costo total" style="flex:1">
      <button class="btn btn-ghost btn-sm" onclick="TS.updateCost('${o.id}')">Actualizar</button>
    </div>

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
  return works.map(w => `<div class="work-item"><span>${esc(w.description)}</span><div class="row"><span class="t-success">${$M(w.cost)}</span><button class="icon-x" onclick="TS.delWork('${w.id}','${w.order_id}')" aria-label="Eliminar trabajo: ${esc(w.description)}">${icon('close', { size: 15 })}</button></div></div>`).join('');
}

export async function setStatus(id, s) {
  const payload = { status: s };
  if (s === 'entregado') payload.delivered_at = new Date().toISOString();
  const { error } = await supabase.from('orders').update(payload).eq('id', id);
  if (error) { toast('No se pudo actualizar el estado', 'danger'); return; }
  toast(`Estado: ${SL[s]}`, 'success');
  viewOrder(id); renderOrders();
}

export async function addWork(id) {
  const d = document.getElementById('w-d').value.trim();
  const c = parseFloat(document.getElementById('w-c').value) || 0;
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

export async function updateCost(id) {
  const v = parseFloat(document.getElementById('new-cost').value);
  if (isNaN(v)) return;
  const { error } = await supabase.from('orders').update({ cost: v }).eq('id', id);
  if (error) { toast('No se pudo actualizar el costo', 'danger'); return; }
  viewOrder(id); renderOrders();
}

// El abono queda enlazado a Caja: cada aumento genera una entrada, cada
// reducción (ajuste o devolución) genera una salida — igual que repuestos.
export async function updateDeposit(id) {
  const v = parseFloat(document.getElementById('new-deposit').value);
  if (isNaN(v) || v < 0) return;
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
  try { await deleteMovementsBySource('order_deposit', id); } catch (e) { /* continuar */ }
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) { toast('No se pudo eliminar la orden', 'danger'); return; }
  toast('Orden eliminada', 'success');
  closeModal(); renderOrders();
}

// ── PDF ───────────────────────────────────────────────────────
export async function genPDF(id) {
  const { data: o } = await supabase.from('orders').select('*, order_works(*)').eq('id', id)
    .order('created_at', { foreignTable: 'order_works' }).single();
  if (!o) return;
  const works = o.order_works || [];
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 20; let y = M;

  doc.setFillColor(0, 0, 0); doc.rect(0, 0, W, 42, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('TOUCH SERVIS', M, 17);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Servicio Técnico de Celulares', M, 25);
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

  y = 54;
  doc.setFillColor(241, 245, 249); doc.roundedRect(M, y, W - M * 2, 34, 3, 3, 'F');
  doc.setTextColor(100, 116, 139); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE', M + 6, y + 8);
  doc.text('DISPOSITIVO', W / 2 + 4, y + 8);
  doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(o.client || 'Sin nombre', M + 6, y + 18);
  doc.setFontSize(9); doc.text(o.phone || '', M + 6, y + 27);
  doc.setFontSize(11); doc.text(o.device || '—', W / 2 + 4, y + 18);
  y += 44;

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
