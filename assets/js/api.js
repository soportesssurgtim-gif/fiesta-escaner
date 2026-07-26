const API_BASE = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? 'http://localhost:3000/api'
  : '/api';

function _getToken() {
  try {
    const raw = localStorage.getItem('sssur_sesion');
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data.token || null;
  } catch { return null; }
}

function _headers(token) {
  const t = token || _getToken();
  return {
    'Content-Type': 'application/json',
    ...(t ? { 'Authorization': `Bearer ${t}` } : {})
  };
}

async function _parseResponse(res) {
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const msg = (data && data.error) || `Error HTTP ${res.status}`;
    const err = new Error(msg);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

async function apiLogin(usuario, password) {
  const res = await fetch(`${API_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password })
  });
  return _parseResponse(res);
}

async function apiLogout(token) {
  try {
    const res = await fetch(`${API_BASE}/auth`, {
      method: 'POST',
      headers: _headers(token)
    });
    await _parseResponse(res);
  } catch (_) { /* ignore */ }
  return true;
}

async function apiDatosIniciales(token) {
  const res = await fetch(`${API_BASE}/datos-iniciales`, { headers: _headers(token) });
  return _parseResponse(res);
}

async function apiRegistrarAsistencia(token, dui, dispositivo) {
  const res = await fetch(`${API_BASE}/asistencia?action=registrar`, {
    method: 'POST',
    headers: _headers(token),
    body: JSON.stringify({ dui, dispositivo })
  });
  return _parseResponse(res);
}

async function apiGuardarDepartamento(token, data) {
  const res = await fetch(`${API_BASE}/departamentos`, {
    method: data.id ? 'PUT' : 'POST',
    headers: _headers(token),
    body: JSON.stringify(data)
  });
  return _parseResponse(res);
}

async function apiGuardarEmpleado(token, data) {
  const res = await fetch(`${API_BASE}/empleados`, {
    method: data.id ? 'PUT' : 'POST',
    headers: _headers(token),
    body: JSON.stringify(data)
  });
  return _parseResponse(res);
}

async function apiGuardarPremio(token, data) {
  const res = await fetch(`${API_BASE}/premios`, {
    method: data.id ? 'PUT' : 'POST',
    headers: _headers(token),
    body: JSON.stringify(data)
  });
  return _parseResponse(res);
}

async function apiGuardarUsuario(token, data) {
  const res = await fetch(`${API_BASE}/usuarios`, {
    method: data.id ? 'PUT' : 'POST',
    headers: _headers(token),
    body: JSON.stringify(data)
  });
  return _parseResponse(res);
}

async function apiGuardarRol(token, data) {
  const res = await fetch(`${API_BASE}/roles`, {
    method: data.id ? 'PUT' : 'POST',
    headers: _headers(token),
    body: JSON.stringify(data)
  });
  return _parseResponse(res);
}

async function apiGuardarPermiso(token, data) {
  const res = await fetch(`${API_BASE}/permisos`, {
    method: data.id ? 'PUT' : 'POST',
    headers: _headers(token),
    body: JSON.stringify(data)
  });
  return _parseResponse(res);
}

async function apiGuardarPermisosRol(token, permisosData) {
  const res = await fetch(`${API_BASE}/permisos?action=rol`, {
    method: 'POST',
    headers: _headers(token),
    body: JSON.stringify(permisosData)
  });
  return _parseResponse(res);
}

async function apiGuardarEvento(token, data) {
  const res = await fetch(`${API_BASE}/eventos`, {
    method: data.id ? 'PUT' : 'POST',
    headers: _headers(token),
    body: JSON.stringify(data)
  });
  return _parseResponse(res);
}

async function apiSetEventoActivo(token, eventoId) {
  const res = await fetch(`${API_BASE}/eventos?action=set-activo`, {
    method: 'POST',
    headers: _headers(token),
    body: JSON.stringify({ eventoId })
  });
  return _parseResponse(res);
}

async function apiGuardarSorteo(token, data) {
  const res = await fetch(`${API_BASE}/sorteos`, {
    method: data.id ? 'PUT' : 'POST',
    headers: _headers(token),
    body: JSON.stringify(data)
  });
  return _parseResponse(res);
}

async function apiSortearGanador(token, sorteoId) {
  const res = await fetch(`${API_BASE}/sorteos?action=sortear`, {
    method: 'POST',
    headers: _headers(token),
    body: JSON.stringify({ sorteoId })
  });
  return _parseResponse(res);
}
