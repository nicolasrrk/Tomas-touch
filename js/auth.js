// ── Autenticación (login de admin único vía Supabase Auth) ─────
import { supabase } from './supabaseClient.js';
import { toast } from './ui.js';

let currentSession = null;
const listeners = [];

export function onAuthChange(fn) { listeners.push(fn); }
function notify() { listeners.forEach(fn => fn(currentSession)); }

export function getSession() { return currentSession; }
export function isLoggedIn() { return !!currentSession; }

export async function initAuth() {
  const { data } = await supabase.auth.getSession();
  currentSession = data.session;
  supabase.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    notify();
  });
  notify();
}

export async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    toast(error.message === 'Invalid login credentials'
      ? 'Email o contraseña incorrectos' : error.message, 'danger');
    return false;
  }
  return true;
}

export async function logout() {
  await supabase.auth.signOut();
}
