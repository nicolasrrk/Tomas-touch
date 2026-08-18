// ── Módulo Caja (movimientos de dinero) ─────────────────────────
import { supabase } from './supabaseClient.js';
import { $M, $D, esc, toast, closeModal, skeletonCards, errorState, confirmDialog, MONTHS_ES, animateStats, matchesMonth, refreshMonthFilterOptions, amountFromInput } from './ui.js';
import { icon } from './icons.js';

// `source`/`sourceId` son opcionales: identifican qué registro originó el
// movimiento (ej. 'product_cost' + id del repuesto) para poder revertirlo
// automáticamente si ese origen se borra — así Caja nunca queda con
// "plata fantasma" de algo que ya no existe.
export async function cajaPush(type, desc, amount, source = null, sourceId = null) {
  if (!amount) return null;
  const { data, error } = await supabase.from('caja_movimientos')
    .insert({ type, description: desc, amount, source, source_id: sourceId })
    .select('id').single();
  if (error) { console.error('cajaPush', error); return null; }
  return data.id;
}

// Borra los movimientos ligados a un origen (best-effort: si falla, no
// bloquea el borrado del registro original — solo queda un log en consola).
export async function deleteMovementsBySource(source, sourceId) {
  const { error } = await supabase.from('caja_movimientos')
    .delete().eq('source', source).eq('source_id', sourceId);
  if (error) console.error('deleteMovementsBySource', error);
}

// Igual que arriba pero para un equipo completo: borra en 2 consultas (no
// una por repuesto) el movimiento de compra/venta más el de cada repuesto,
// sin importar cuántos haya.
export async function deleteMovementsForProduct(productId, costIds = []) {
  const tasks = [
    supabase.from('caja_movimientos').delete()
      .in('source', ['product_buy', 'product_sale', 'product_deposit']).eq('source_id', productId)
  ];
  if (costIds.length) {
    tasks.push(
      supabase.from('caja_movimientos').delete()
        .eq('source', 'product_cost').in('source_id', costIds)
    );
  }
  const results = await Promise.all(tasks);
  results.forEach(r => { if (r.error) console.error('deleteMovementsForProduct', r.error); });
}

let cache = [];
let loaded = false; // si ya se trajo al menos una vez de la red
let loading = null; // Promise del fetch en vuelo, o null
let monthFilter = '';

/** Cambia el mes filtrado y vuelve a pintar (sin red: ya está todo en cache).
 *  No afecta el saldo disponible (es acumulado histórico, filtrarlo sería engañoso). */
export function setMonthFilter(v) { monthFilter = v; paintCaja(); }

async function fetchCaja() {
  const { data, error } = await supabase.from('caja_movimientos')
    .select('*').order('created_at', { ascending: false });
  if (error) throw error;
  cache = data || [];
  loaded = true;
  return cache;
}

/** Trae de la red y pinta. Se usa en la navegación inicial de página y tras
 *  crear/borrar un movimiento (necesita datos frescos). */
export async function renderCaja() {
  const list = document.getElementById('listCaja');
  list.innerHTML = skeletonCards(3);
  try {
    loading = loading || fetchCaja();
    await loading;
  } catch (e) {
    loading = null;
    list.innerHTML = errorState('No se pudo cargar la caja.', 'Reintentar', 'onclick="TS.renderCaja()"');
    return;
  }
  loading = null;
  paintCaja();
}

/** Re-pinta desde cache (filtro de mes): cero requests a Supabase. Si
 *  todavía no se cargó nada (primera vez que se abre la página), cae a
 *  renderCaja() para no dejar la pantalla vacía — salvo que ya haya un
 *  fetch en curso, para no duplicar requests. */
export function paintCaja() {
  if (!loaded) { if (!loading) renderCaja(); return; }
  const list = document.getElementById('listCaja');
  const movs = cache;
  // Saldo disponible: SIEMPRE sobre el histórico completo, sin filtrar.
  const entTotal = movs.filter(m => m.type === 'entrada').reduce((s, m) => s + Number(m.amount), 0);
  const salTotal = movs.filter(m => m.type === 'salida').reduce((s, m) => s + Number(m.amount), 0);
  const balEl = document.getElementById('cajaBalance');
  balEl.innerHTML = `
    <div class="balance-card">
      <div class="bal-label">Saldo disponible</div>
      <div class="bal-amount" data-count="${entTotal - salTotal}" data-money="1">$0</div>
    </div>`;
  animateStats(balEl);

  refreshMonthFilterOptions(document.getElementById('filterMonthCaja'), movs, 'created_at', monthFilter);
  const scoped = movs.filter(m => matchesMonth(m, 'created_at', monthFilter));
  const ent = scoped.filter(m => m.type === 'entrada').reduce((s, m) => s + Number(m.amount), 0);
  const sal = scoped.filter(m => m.type === 'salida').reduce((s, m) => s + Number(m.amount), 0);
  const statsEl = document.getElementById('statsCaja');
  statsEl.innerHTML = `
    <div class="stat"><div class="stat-val t-success" style="font-size:1rem" data-count="${ent}" data-money="1">$0</div><div class="stat-lbl">Entradas</div></div>
    <div class="stat"><div class="stat-val t-danger" style="font-size:1rem" data-count="${sal}" data-money="1">$0</div><div class="stat-lbl">Salidas</div></div>
    <div class="stat"><div class="stat-val" data-count="${scoped.length}">0</div><div class="stat-lbl">Movimientos</div></div>`;
  animateStats(statsEl);
  list.innerHTML = scoped.length ? scoped.map(m => `
    <div class="mov">
      <div class="mov-ico ${m.type}" aria-hidden="true">${icon(m.type === 'entrada' ? 'arrowUpRight' : 'arrowDownRight', { size: 17 })}</div>
      <div class="mov-info">
        <div class="mov-desc">${esc(m.description)}</div>
        <div class="mov-date">${$D(m.created_at)}</div>
      </div>
      <div class="mov-amt ${m.type === 'entrada' ? 'amt-e' : 'amt-s'}">${m.type === 'entrada' ? '+' : '−'}${$M(m.amount)}</div>
      <button class="icon-x" onclick="TS.delMov('${m.id}')" aria-label="Eliminar movimiento: ${esc(m.description)}" style="flex-shrink:0">${icon('close', { size: 15 })}</button>
    </div>`).join('')
    : `<div class="empty"><div class="empty-ico">${icon('wallet', { size: 40 })}</div>Sin movimientos todavía</div>`;
}

export function newMovModal() {
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-title">Nuevo Movimiento</div>
    <div class="form-group"><label for="m-t">Tipo</label>
      <select id="m-t"><option value="entrada">Entrada ↑ (dinero que entra)</option><option value="salida">Salida ↓ (dinero que sale)</option></select>
    </div>
    <div class="form-group"><label for="m-d">Descripción</label><input id="m-d" placeholder="Ej: Reparación pantalla, Compra repuesto…"></div>
    <div class="form-group"><label for="m-a">Monto ($)</label><input id="m-a" type="number" inputmode="decimal" placeholder="0"></div>
    <button class="btn btn-primary btn-full mt-12" id="btn-create-mov">Guardar</button>`;
  document.getElementById('btn-create-mov').addEventListener('click', createMov);
}

async function createMov() {
  const d = document.getElementById('m-d').value.trim();
  const a = amountFromInput('m-a');
  if (!d || !a) { toast('Completá descripción y monto', 'warn'); return; }
  const { error } = await supabase.from('caja_movimientos').insert({
    type: document.getElementById('m-t').value, description: d, amount: a
  });
  if (error) { toast('No se pudo guardar el movimiento', 'danger'); return; }
  toast('Movimiento guardado', 'success');
  closeModal(); renderCaja();
}

export async function delMov(id) {
  if (!await confirmDialog('¿Eliminar este movimiento?')) return;
  const { error } = await supabase.from('caja_movimientos').delete().eq('id', id);
  if (error) { toast('No se pudo eliminar', 'danger'); return; }
  renderCaja();
}

// ── Reporte mensual (dashboard en PDF) ──────────────────────────
export async function genMonthlyReport() {
  const val = document.getElementById('reportMonth').value; // "YYYY-MM"
  if (!val) { toast('Elegí un mes', 'warn'); return; }
  const [year, monthNum] = val.split('-').map(Number);
  const monthIndex = monthNum - 1;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);
  const startIso = start.toISOString(), endIso = end.toISOString();

  toast('Generando reporte…', 'info');

  const [movsRes, ordersInRes, ordersDeliveredRes, productsSoldRes, allOrdersRes, allProductsRes] = await Promise.all([
    supabase.from('caja_movimientos').select('*').gte('created_at', startIso).lt('created_at', endIso),
    supabase.from('orders').select('id').gte('created_at', startIso).lt('created_at', endIso),
    supabase.from('orders').select('cost').gte('delivered_at', startIso).lt('delivered_at', endIso),
    supabase.from('products').select('*, product_costs(amount)').gte('sold_at', startIso).lt('sold_at', endIso),
    supabase.from('orders').select('cost,deposit'),
    supabase.from('products').select('sell_price,deposit,status')
  ]);

  const movs = movsRes.data || [];
  const ordersIn = ordersInRes.data || [];
  const ordersDelivered = ordersDeliveredRes.data || [];
  const productsSold = productsSoldRes.data || [];
  const allOrders = allOrdersRes.data || [];
  const allProducts = allProductsRes.data || [];

  if (!movs.length && !ordersIn.length && !productsSold.length) {
    toast('No hay actividad registrada en ese mes', 'warn');
  }

  // ── Financiero (real, según lo que efectivamente pasó por Caja) ──
  const entradas = movs.filter(x => x.type === 'entrada').reduce((s, x) => s + Number(x.amount), 0);
  const salidas = movs.filter(x => x.type === 'salida').reduce((s, x) => s + Number(x.amount), 0);
  const neto = entradas - salidas;
  const bySrc = (type, sources) => movs.filter(x => x.type === type && sources.includes(x.source)).reduce((s, x) => s + Number(x.amount), 0);
  const ingReparaciones = bySrc('entrada', ['order_deposit']);
  const ingVentas = bySrc('entrada', ['product_sale', 'product_deposit']);
  const ingOtros = Math.max(0, entradas - ingReparaciones - ingVentas);
  const egCompras = bySrc('salida', ['product_buy']);
  const egRepuestos = bySrc('salida', ['product_cost']);
  const egOtros = Math.max(0, salidas - egCompras - egRepuestos);

  // ── Operativo ─────────────────────────────────────────────────
  const ticketProm = ordersDelivered.length ? ordersDelivered.reduce((s, o) => s + Number(o.cost || 0), 0) / ordersDelivered.length : 0;
  const nuevosVendidos = productsSold.filter(p => p.kind === 'nuevo').length;
  const usadosVendidos = productsSold.filter(p => p.kind === 'usado').length;
  const gananciaVentas = productsSold.reduce((s, p) => {
    const extra = (p.product_costs || []).reduce((a, c) => a + Number(c.amount || 0), 0);
    return s + (Number(p.sell_price || 0) - (Number(p.buy_price || 0) + extra));
  }, 0);

  // ── Por cobrar (foto actual, no acotada al mes) ─────────────────
  const porCobrarOrdenes = allOrders.reduce((s, o) => s + Math.max(0, Number(o.cost || 0) - Number(o.deposit || 0)), 0);
  const porCobrarProductos = allProducts.filter(p => p.status !== 'vendido')
    .reduce((s, p) => s + Math.max(0, Number(p.sell_price || 0) - Number(p.deposit || 0)), 0);

  const topGastos = movs.filter(x => x.type === 'salida').sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5);

  buildReportPDF({
    year, monthIndex, entradas, salidas, neto,
    ingReparaciones, ingVentas, ingOtros, egCompras, egRepuestos, egOtros,
    ordenesIngresadas: ordersIn.length, ordenesEntregadas: ordersDelivered.length, ticketProm,
    nuevosVendidos, usadosVendidos, equiposVendidos: productsSold.length, gananciaVentas,
    porCobrarOrdenes, porCobrarProductos, topGastos
  });
}

function buildReportPDF(r) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 20; let y = M;

  // Header
  doc.setFillColor(0, 0, 0); doc.rect(0, 0, W, 42, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('TOUCH SERVIS', M, 17);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Reporte mensual de gestión', M, 25);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(`${MONTHS_ES[r.monthIndex]} ${r.year}`, W - M, 17, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text('Generado ' + new Date().toLocaleDateString('es-AR'), W - M, 25, { align: 'right' });

  y = 54;
  // Resumen financiero: 3 tarjetas
  const cardW = (W - M * 2 - 10) / 3;
  const cards = [
    ['INGRESOS', $M(r.entradas), [47, 123, 255]],
    ['EGRESOS', $M(r.salidas), [15, 23, 42]],
    [r.neto >= 0 ? 'RESULTADO NETO' : 'RESULTADO NETO (PÉRDIDA)', $M(r.neto), r.neto >= 0 ? [47, 123, 255] : [15, 23, 42]]
  ];
  cards.forEach((c, i) => {
    const x = M + i * (cardW + 5);
    doc.setFillColor(241, 245, 249); doc.roundedRect(x, y, cardW, 26, 3, 3, 'F');
    doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.text(c[0], x + 5, y + 9);
    doc.setTextColor(...c[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(c[1], x + 5, y + 19);
  });
  y += 36;

  // Ingresos / Egresos por origen (2 columnas)
  const colW = (W - M * 2 - 8) / 2;
  const sectionHeader = (label, x, yy) => {
    doc.setFillColor(0, 0, 0); doc.rect(x, yy, colW, 7, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(label, x + 4, yy + 5);
  };
  const kv = (label, val, x, yy) => {
    doc.setTextColor(71, 85, 105); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(label, x + 4, yy);
    doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold');
    doc.text(val, x + colW - 4, yy, { align: 'right' });
  };
  sectionHeader('INGRESOS POR ORIGEN', M, y);
  sectionHeader('EGRESOS POR ORIGEN', M + colW + 8, y);
  y += 13;
  kv('Reparaciones (abonos)', $M(r.ingReparaciones), M, y);
  kv('Compra de equipos', $M(r.egCompras), M + colW + 8, y); y += 8;
  kv('Venta de equipos', $M(r.ingVentas), M, y);
  kv('Repuestos y gastos', $M(r.egRepuestos), M + colW + 8, y); y += 8;
  kv('Otros ingresos', $M(r.ingOtros), M, y);
  kv('Otros egresos', $M(r.egOtros), M + colW + 8, y);
  y += 18;

  // Actividad operativa
  doc.setFillColor(0, 0, 0); doc.rect(M, y, W - M * 2, 7, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('ACTIVIDAD DEL MES', M + 4, y + 5);
  y += 13;
  const stats = [
    ['Órdenes ingresadas', String(r.ordenesIngresadas)],
    ['Órdenes entregadas', String(r.ordenesEntregadas)],
    ['Ticket promedio reparación', $M(r.ticketProm)],
    ['Equipos vendidos', `${r.equiposVendidos} (${r.nuevosVendidos} nuevos, ${r.usadosVendidos} usados)`],
    ['Ganancia por venta de equipos', $M(r.gananciaVentas)]
  ];
  stats.forEach(([label, val]) => { kv(label, val, M - 4, y); y += 8; });
  y += 6;

  // Por cobrar (snapshot actual)
  doc.setFillColor(241, 245, 249); doc.roundedRect(M, y, W - M * 2, 24, 3, 3, 'F');
  doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text('CUENTAS POR COBRAR (al día de hoy)', M + 6, y + 8);
  doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`Órdenes: ${$M(r.porCobrarOrdenes)}   ·   Equipos: ${$M(r.porCobrarProductos)}`, M + 6, y + 17);
  doc.setFont('helvetica', 'bold'); doc.setTextColor(47, 123, 255);
  doc.text(`Total: ${$M(r.porCobrarOrdenes + r.porCobrarProductos)}`, W - M - 6, y + 17, { align: 'right' });
  y += 32;

  // Top 5 egresos
  if (r.topGastos.length) {
    doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('MAYORES EGRESOS DEL MES', M, y); y += 5;
    doc.setFillColor(0, 0, 0); doc.rect(M, y, W - M * 2, 7, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(9);
    doc.text('Descripción', M + 4, y + 5); doc.text('Monto', W - M - 4, y + 5, { align: 'right' }); y += 7;
    r.topGastos.forEach((g, i) => {
      doc.setFillColor(i % 2 ? 255 : 248, i % 2 ? 255 : 250, i % 2 ? 255 : 252);
      doc.rect(M, y, W - M * 2, 8, 'F');
      doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'normal');
      doc.text(g.description, M + 4, y + 5.5);
      doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold');
      doc.text($M(g.amount), W - M - 4, y + 5.5, { align: 'right' }); y += 8;
    });
  }

  doc.setFontSize(8); doc.setTextColor(148, 163, 184); doc.setFont('helvetica', 'normal');
  doc.text('Touch Servis · Reporte generado automáticamente desde el panel de gestión.', W / 2, 286, { align: 'center' });
  doc.line(M, 282, W - M, 282);

  doc.save(`TouchServis_Reporte_${r.year}-${String(r.monthIndex + 1).padStart(2, '0')}.pdf`);
  toast('Reporte generado', 'success');
}
