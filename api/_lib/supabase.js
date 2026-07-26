import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[supabase] WARNING: Variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configuradas.');
}

export const supabase = createClient(
  SUPABASE_URL || 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY || 'dummy-key',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export const SESSION_TTL_SECONDS = 6 * 60 * 60;

import crypto from 'crypto';

export function sha256(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

export function requireAuth(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return { error: 'Sesión requerida.', status: 401 };
  }
  const token = auth.slice(7);
  if (!token) {
    return { error: 'Sesión requerida.', status: 401 };
  }
  return { token, error: null };
}

export async function getSession(token) {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('sesiones')
      .select('*')
      .eq('token', token)
      .gte('expires_at', now)
      .single();

    if (error || !data) return null;
    return data.data || {};
  } catch (e) {
    console.error('getSession error:', e);
    return null;
  }
}

export async function createSession(sessionData) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  try {
    await supabase.from('sesiones').insert({
      token,
      usuario_id: sessionData.usuarioId || null,
      data: sessionData,
      expires_at: expiresAt
    });
    return token;
  } catch (e) {
    console.error('createSession error:', e);
    return token;
  }
}

export async function deleteSession(token) {
  try {
    await supabase.from('sesiones').delete().eq('token', token);
    return true;
  } catch (e) {
    console.error('deleteSession error:', e);
    return false;
  }
}

export function isAdmin(rol) {
  const r = String(rol || '').toUpperCase();
  return r === 'ADMIN' || r === 'ADMINISTRADOR';
}

export function jsonResponse(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json(body);
}

export function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body !== undefined && req.body !== null) {
      resolve(req.body);
      return;
    }
    let chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}
