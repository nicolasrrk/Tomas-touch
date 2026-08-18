// ── Módulo Presupuestos ──────────────────────────────────────────
import { supabase } from './supabaseClient.js';
import { $M, $D, esc, toast, openModal, closeModal, skeletonCards, errorState, confirmDialog, groupByMonth, animateStats, matchesMonth, refreshMonthFilterOptions, amountFromInput } from './ui.js';
import { icon } from './icons.js';

const QL = { pendiente: 'Pendiente', enviado: 'Enviado', aceptado: 'Aceptado', rechazado: 'Rechazado' };
let cache = [];
let loaded = false; // si ya se trajo al menos una vez de la red
let loading = null; // Promise del fetch en vuelo, o null
let monthFilter = '';

/** Cambia el mes filtrado y vuelve a pintar (sin red: ya está todo en cache). */
export function setMonthFilter(v) { monthFilter = v; paintQuotes(); }

async function fetchQuotes() {
  const { data, error } = await supabase.from('quotes').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  cache = data || [];
  loaded = true;
  return cache;
}

/** Trae de la red y pinta. Se usa en la navegación inicial de página y tras
 *  crear/editar/borrar algo (necesita datos frescos). */
export async function renderQuotes() {
  const list = document.getElementById('listQuotes');
  list.innerHTML = skeletonCards(3);
  try {
    // Reusa el fetch en vuelo si ya hay uno (buscador disparando en cada
    // tecla mientras todavía no cargó nada) en vez de duplicar requests.
    loading = loading || fetchQuotes();
    await loading;
  } catch (e) {
    loading = null;
    list.innerHTML = errorState('No se pudieron cargar los presupuestos.', 'Reintentar', 'onclick="TS.renderQuotes()"');
    return;
  }
  loading = null;
  paintQuotes();
}

/** Re-pinta desde cache (buscador, filtro de mes): cero requests a Supabase.
 *  Si todavía no se cargó nada (primera vez que se abre la página), cae a
 *  renderQuotes() para no dejar la pantalla vacía — salvo que ya haya un
 *  fetch en curso, para no duplicar requests. */
export function paintQuotes() {
  if (!loaded) { if (!loading) renderQuotes(); return; }
  const list = document.getElementById('listQuotes');
  const quotes = cache;
  refreshMonthFilterOptions(document.getElementById('filterMonthQuotes'), quotes, 'created_at', monthFilter);
  const scoped = quotes.filter(x => matchesMonth(x, 'created_at', monthFilter));
  const q = (document.getElementById('searchQuotes')?.value || '').toLowerCase();
  const filtered = scoped.filter(x => !q || x.client?.toLowerCase().includes(q) || x.device?.toLowerCase().includes(q));

  const pend = scoped.filter(x => x.status === 'pendiente' || x.status === 'enviado').length;
  const acep = scoped.filter(x => x.status === 'aceptado').length;
  const statsEl = document.getElementById('statsQuotes');
  statsEl.innerHTML = `
    <div class="stat"><div class="stat-val" style="color:var(--primary-bright)" data-count="${pend}">0</div><div class="stat-lbl">Pendientes</div></div>
    <div class="stat"><div class="stat-val t-success" data-count="${acep}">0</div><div class="stat-lbl">Aceptados</div></div>
    <div class="stat"><div class="stat-val" data-count="${scoped.length}">0</div><div class="stat-lbl">Total</div></div>`;
  animateStats(statsEl);

  list.innerHTML = filtered.length ? groupByMonth(filtered, 'created_at', p => `
    <div class="card" onclick="TS.viewQuote('${p.id}')">
      <div class="card-header">
        <div style="min-width:0">
          <div class="fw-700" style="margin-bottom:3px">${esc(p.device)}</div>
          <div class="t-muted">${esc(p.client) || 'Sin nombre'}${p.phone ? ' · ' + esc(p.phone) : ''}</div>
        </div>
        <span class="badge badge-${p.status}">${QL[p.status]}</span>
      </div>
      <div class="t-success fw-700 num" style="margin-top:6px">${$M(p.total)}</div>
      <div class="t-muted" style="font-size:.75rem;margin-top:4px">${$D(p.created_at)}</div>
    </div>`)
    : `<div class="empty"><div class="empty-ico">${icon('document', { size: 40 })}</div>No hay presupuestos aún<br><span class="t-muted" style="font-size:.8rem">Tocá + para crear uno</span></div>`;
}

export function newQuoteModal() {
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-title">Nuevo Presupuesto</div>
    <div class="form-group"><label for="q-cl">Cliente</label><input id="q-cl" placeholder="Nombre del cliente"></div>
    <div class="form-group"><label for="q-ph">Teléfono</label><input id="q-ph" type="tel" placeholder="Número de contacto"></div>
    <div class="form-group"><label for="q-dv">Dispositivo</label><input id="q-dv" placeholder="Ej: Samsung A54 Negro"></div>
    <div class="form-group"><label for="q-pr">Problema reportado</label><textarea id="q-pr" placeholder="Describe el problema que trae el equipo…"></textarea></div>
    <button class="btn btn-primary btn-full mt-12" id="btn-create-quote">Crear Presupuesto</button>`;
  document.getElementById('btn-create-quote').addEventListener('click', createQuote);
  openModal();
}

async function createQuote() {
  const dv = document.getElementById('q-dv').value.trim();
  if (!dv) { toast('Ingresá el dispositivo', 'warn'); return; }
  const { error } = await supabase.from('quotes').insert({
    client: document.getElementById('q-cl').value.trim(),
    phone: document.getElementById('q-ph').value.trim(),
    device: dv,
    problem: document.getElementById('q-pr').value.trim(),
    status: 'pendiente'
  });
  if (error) { toast('No se pudo crear: ' + error.message, 'danger'); return; }
  toast('Presupuesto creado', 'success');
  closeModal(); renderQuotes();
}

export async function viewQuote(id) {
  document.getElementById('modalBody').innerHTML = `<div class="modal-title">Cargando…</div>`;
  openModal();
  const { data: p, error } = await supabase.from('quotes').select('*, quote_items(*)').eq('id', id).single();
  if (error || !p) { document.getElementById('modalBody').innerHTML = `<div class="modal-title">No encontrado</div>`; return; }
  const items = (p.quote_items || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  document.getElementById('modalBody').innerHTML = `
    <div class="modal-title">${icon('device', { size: 19 })} ${esc(p.device)}</div>
    <div class="detail-row"><span class="t-muted">Estado</span><span class="badge badge-${p.status}">${QL[p.status]}</span></div>
    <div class="detail-row"><span class="t-muted">Cliente</span><span>${esc(p.client) || '—'}</span></div>
    <div class="detail-row"><span class="t-muted">Teléfono</span><span>${esc(p.phone) || '—'}</span></div>
    <div class="detail-row"><span class="t-muted">Fecha</span><span>${$D(p.created_at)}</span></div>
    <div class="detail-row"><span class="t-muted">Problema</span><span style="max-width:60%;text-align:right;font-size:.82rem">${esc(p.problem) || '—'}</span></div>
    ${p.converted_order_id ? `<div class="detail-row"><span class="t-muted">Convertido</span><span class="t-success">Orden #${p.converted_order_id.slice(-6).toUpperCase()}</span></div>` : ''}

    <div class="sec-title">Ítems del presupuesto</div>
    <div id="qitems-list">${renderQuoteItems(items)}</div>
    <div class="row mt-8">
      <label class="sr-only" for="qi-d">Descripción</label>
      <input id="qi-d" placeholder="Ej: Repuesto pantalla, mano de obra…" style="flex:2">
      <label class="sr-only" for="qi-c">Costo</label>
      <input id="qi-c" type="number" inputmode="decimal" placeholder="$" style="flex:1">
      <button class="btn btn-primary btn-sm" aria-label="Agregar ítem" onclick="TS.addQuoteItem('${p.id}')">+</button>
    </div>

    <div class="detail-row mt-12" style="border-top:1px solid var(--border);padding-top:12px">
      <span class="fw-700">Total estimado</span>
      <span class="t-success fw-700 num" style="font-size:1.1rem">${$M(p.total)}</span>
    </div>

    <div class="row-wrap mt-16">
      <button class="btn btn-primary" onclick="TS.genQuotePDF('${p.id}')">${icon('document', { size: 15 })} Generar PDF</button>
      ${!p.converted_order_id ? `<button class="btn btn-success" onclick="TS.convertToOrder('${p.id}')">${icon('checkCircle', { size: 15 })} Convertir a Orden</button>` : ''}
      ${p.status !== 'rechazado' && !p.converted_order_id ? `<button class="btn btn-ghost btn-sm" onclick="TS.markQuoteRejected('${p.id}')">Rechazar</button>` : ''}
      <button class="btn btn-danger btn-sm" onclick="TS.delQuote('${p.id}')">Eliminar</button>
    </div>`;
}

function renderQuoteItems(items) {
  if (!items.length) return '<div class="t-muted" style="padding:6px 0;font-size:.82rem">Sin ítems cargados</div>';
  return items.map(i => `<div class="work-item"><span>${esc(i.description)}</span><div class="row"><span class="t-success num">${$M(i.amount)}</span><button class="icon-x" onclick="TS.delQuoteItem('${i.id}','${i.quote_id}')" aria-label="Eliminar ítem: ${esc(i.description)}">${icon('close', { size: 15 })}</button></div></div>`).join('');
}

export async function addQuoteItem(id) {
  const d = document.getElementById('qi-d').value.trim();
  const c = amountFromInput('qi-c');
  if (!d) { toast('Ingresá una descripción', 'warn'); return; }
  const { error } = await supabase.from('quote_items').insert({ quote_id: id, description: d, amount: c });
  if (error) { toast('No se pudo agregar', 'danger'); return; }
  viewQuote(id); renderQuotes();
}

export async function delQuoteItem(itemId, quoteId) {
  const { error } = await supabase.from('quote_items').delete().eq('id', itemId);
  if (error) { toast('No se pudo eliminar', 'danger'); return; }
  viewQuote(quoteId); renderQuotes();
}

export async function markQuoteRejected(id) {
  const { error } = await supabase.from('quotes').update({ status: 'rechazado' }).eq('id', id);
  if (error) { toast('No se pudo actualizar', 'danger'); return; }
  toast('Presupuesto marcado como rechazado', 'info');
  viewQuote(id); renderQuotes();
}

export async function convertToOrder(quoteId) {
  if (!await confirmDialog('¿Convertir este presupuesto en una orden de reparación?', 'Convertir', false)) return;
  const { data: q, error } = await supabase.from('quotes').select('*, quote_items(*)').eq('id', quoteId).single();
  if (error || !q) { toast('No se pudo cargar el presupuesto', 'danger'); return; }
  const { data: order, error: oErr } = await supabase.from('orders')
    .insert({ client: q.client, phone: q.phone, device: q.device, problem: q.problem, status: 'ingresado' })
    .select('id').single();
  if (oErr) { toast('No se pudo crear la orden: ' + oErr.message, 'danger'); return; }
  const items = q.quote_items || [];
  if (items.length) {
    await supabase.from('order_works').insert(items.map(i => ({ order_id: order.id, description: i.description, cost: i.amount })));
  }
  await supabase.from('quotes').update({ status: 'aceptado', converted_order_id: order.id }).eq('id', quoteId);
  toast('Convertido en orden de reparación', 'success');
  viewQuote(quoteId); renderQuotes();
}

export async function delQuote(id) {
  if (!await confirmDialog('¿Eliminar este presupuesto?')) return;
  const { error } = await supabase.from('quotes').delete().eq('id', id);
  if (error) { toast('No se pudo eliminar', 'danger'); return; }
  toast('Eliminado', 'success');
  closeModal(); renderQuotes();
}

// ── PDF ───────────────────────────────────────────────────────
export async function genQuotePDF(id) {
  const { data: q } = await supabase.from('quotes').select('*, quote_items(*)').eq('id', id).single();
  if (!q) return;
  const items = q.quote_items || [];
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
  doc.text('PRESUPUESTO', W - M, 17, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text($D(q.created_at), W - M, 25, { align: 'right' });

  y = 54;
  doc.setFillColor(241, 245, 249); doc.roundedRect(M, y, W - M * 2, 34, 3, 3, 'F');
  doc.setTextColor(100, 116, 139); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE', M + 6, y + 8);
  doc.text('DISPOSITIVO', W / 2 + 4, y + 8);
  doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(q.client || 'Sin nombre', M + 6, y + 18);
  doc.setFontSize(9); doc.text(q.phone || '', M + 6, y + 27);
  doc.setFontSize(11); doc.text(q.device || '—', W / 2 + 4, y + 18);
  y += 44;

  doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text('PROBLEMA REPORTADO', M, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
  const pLines = doc.splitTextToSize(q.problem || 'Sin descripción', W - M * 2);
  doc.text(pLines, M, y); y += pLines.length * 5 + 10;

  if (items.length) {
    doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('DETALLE', M, y); y += 5;
    doc.setFillColor(0, 0, 0); doc.rect(M, y, W - M * 2, 7, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(9);
    doc.text('Descripción', M + 4, y + 5); doc.text('Costo', W - M - 4, y + 5, { align: 'right' }); y += 7;
    items.forEach((it, i) => {
      doc.setFillColor(i % 2 ? 255 : 248, i % 2 ? 255 : 250, i % 2 ? 255 : 252);
      doc.rect(M, y, W - M * 2, 8, 'F');
      doc.setTextColor(15, 23, 42); doc.text(it.description, M + 4, y + 5.5);
      doc.setTextColor(47, 123, 255); doc.text($M(it.amount), W - M - 4, y + 5.5, { align: 'right' }); y += 8;
    }); y += 4;
  }

  doc.setFillColor(47, 123, 255); doc.roundedRect(M, y, W - M * 2, 14, 3, 3, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('TOTAL ESTIMADO', M + 6, y + 9.5); doc.text($M(q.total), W - M - 6, y + 9.5, { align: 'right' }); y += 22;

  doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139);
  doc.text(doc.splitTextToSize('Este presupuesto es estimativo y no genera compromiso de pago. El precio final puede variar según lo que se detecte al revisar el equipo. Válido por 15 días desde la fecha de emisión.', W - M * 2), M, y);

  doc.setFontSize(8); doc.setTextColor(148, 163, 184); doc.setFont('helvetica', 'normal');
  doc.text('Gracias por confiar en Touch Servis.', W / 2, 286, { align: 'center' });
  doc.line(M, 282, W - M, 282);

  doc.save(`TouchServis_Presupuesto_${q.id.slice(-6).toUpperCase()}.pdf`);

  if (q.status === 'pendiente') await supabase.from('quotes').update({ status: 'enviado' }).eq('id', id);
}
