// ── Módulo Caja (movimientos de dinero) ─────────────────────────
import { supabase } from './supabaseClient.js';
import { $M, $D, esc, toast, closeModal, skeletonCards, errorState, confirmDialog } from './ui.js';
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
      .in('source', ['product_buy', 'product_sale']).eq('source_id', productId)
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

export async function renderCaja() {
  const list = document.getElementById('listCaja');
  list.innerHTML = skeletonCards(3);
  const { data: movs, error } = await supabase.from('caja_movimientos')
    .select('*').order('created_at', { ascending: false });
  if (error) {
    list.innerHTML = errorState('No se pudo cargar la caja.', 'Reintentar', 'onclick="TS.renderCaja()"');
    return;
  }
  const ent = movs.filter(m => m.type === 'entrada').reduce((s, m) => s + Number(m.amount), 0);
  const sal = movs.filter(m => m.type === 'salida').reduce((s, m) => s + Number(m.amount), 0);
  document.getElementById('cajaBalance').innerHTML = `
    <div class="balance-card">
      <div class="bal-label">Saldo disponible</div>
      <div class="bal-amount">${$M(ent - sal)}</div>
    </div>`;
  document.getElementById('statsCaja').innerHTML = `
    <div class="stat"><div class="stat-val t-success" style="font-size:1rem">${$M(ent)}</div><div class="stat-lbl">Entradas</div></div>
    <div class="stat"><div class="stat-val t-danger" style="font-size:1rem">${$M(sal)}</div><div class="stat-lbl">Salidas</div></div>
    <div class="stat"><div class="stat-val">${movs.length}</div><div class="stat-lbl">Movimientos</div></div>`;
  list.innerHTML = movs.length ? movs.map(m => `
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
  const a = parseFloat(document.getElementById('m-a').value) || 0;
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
