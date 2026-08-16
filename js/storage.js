// ── Helpers de Supabase Storage (buckets privados) ──────────────
// Los buckets son privados: se listan objetos por carpeta (id del
// registro) y se generan URLs firmadas de corta duración para mostrarlas.
import { supabase } from './supabaseClient.js';

export async function uploadPhoto(bucket, entityId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${entityId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type || 'image/jpeg'
  });
  if (error) throw error;
  return path;
}

export async function listPhotos(bucket, entityId) {
  const { data, error } = await supabase.storage.from(bucket).list(entityId, {
    sortBy: { column: 'created_at', order: 'asc' }
  });
  if (error) throw error;
  const paths = (data || []).map(f => `${entityId}/${f.name}`);
  if (!paths.length) return [];
  const { data: signed, error: signErr } = await supabase.storage
    .from(bucket).createSignedUrls(paths, 3600);
  if (signErr) throw signErr;
  return signed.map(s => ({ path: s.path, url: s.signedUrl }));
}

export async function deletePhoto(bucket, path) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
