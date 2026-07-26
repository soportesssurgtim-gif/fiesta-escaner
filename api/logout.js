import { requireAuth, deleteSession, jsonResponse, parseBody } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Método no permitido' });
  }

  const auth = requireAuth(req);
  if (auth.error) {
    return jsonResponse(res, auth.status || 401, { error: auth.error });
  }

  try {
    await deleteSession(auth.token);
    return jsonResponse(res, 200, { ok: true });
  } catch (e) {
    console.error('Logout error:', e);
    return jsonResponse(res, 200, { ok: true });
  }
}
