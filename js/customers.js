// ── Módulo Clientes: directorio simple por ID (código) asignado a mano ──
// No tiene pantalla propia: lo usa el formulario de Nueva Orden para
// autocompletar Cliente/Teléfono/Dirección a partir de un código, y para
// guardar esos datos y que la próxima orden con el mismo código ya venga
// completa.
import { supabase } from './supabaseClient.js';

/** Busca un cliente por su código. null si no existe, está vacío o falla. */
export async function getCustomer(code) {
  const c = (code || '').trim();
  if (!c) return null;
  const { data, error } = await supabase.from('customers').select('*').eq('code', c).maybeSingle();
  if (error) return null;
  return data;
}

/** Crea o actualiza el cliente con los datos cargados en la orden. Se llama
 *  al crear una orden que tenga ID Cliente cargado — así el directorio
 *  queda siempre al día con el último dato ingresado para ese código. */
export async function saveCustomer({ code, name, phone, address }) {
  const c = (code || '').trim();
  if (!c) return;
  await supabase.from('customers').upsert({ code: c, name: name || null, phone: phone || null, address: address || null });
}
