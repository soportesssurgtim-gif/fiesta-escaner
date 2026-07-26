document.addEventListener('DOMContentLoaded', async function() {

    const skeleton = document.getElementById('app-skeleton');
    function setSkeleton(html) {
      if (skeleton) skeleton.innerHTML = html;
    }

    if (typeof Vue === 'undefined') {
      console.error('Vue no se carg√≥ de la CDN.');
      setSkeleton('<div class="text-sm text-red-700 font-bold flex items-center gap-2"><i class="fas fa-exclamation-triangle text-red-500"></i> Vue no carg√≥ (revisa conexi√≥n o CDN).</div>');
      return;
    }

    if (typeof Vue.compile !== 'function') {
      console.error('Vue Runtime-only sin compilador.');
      setSkeleton('<div class="text-sm text-red-700 font-bold flex items-center gap-2"><i class="fas fa-exclamation-triangle text-red-500"></i> Versi√≥n Vue sin compilador (recarga con Ctrl + F5).</div>');
      return;
    }

    let BASE = '';
    try {
      if (document.currentScript && document.currentScript.src) {
        BASE = new URL('../../', document.currentScript.src).pathname;
      }
    } catch (_) {}
    if (!BASE || BASE === '/') BASE = location.pathname.replace(/[^/]*$/, '');

    const PLANTILLAS_VISTAS = [
      'assets/views/overlay-cargando.html',
      'assets/views/login.html',
      'assets/views/layout-logueado-inicio.html',
      'assets/views/navbar.html',
      'assets/views/sidebar.html',
      'assets/views/notificaciones-toast.html',
      'assets/views/main-inicio.html',
      'assets/views/vista-escaner-qr.html',
      'assets/views/vista-asistencias.html',
      'assets/views/vista-sorteos-rifas.html',
      'assets/views/vista-departamentos.html',
      'assets/views/vista-empleados.html',
      'assets/views/vista-eventos.html',
      'assets/views/vista-sorteos-admin.html',
      'assets/views/vista-premios.html',
      'assets/views/vista-configuracion.html',
      'assets/views/vista-usuarios-roles.html',
      'assets/views/vista-permisos.html',
      'assets/views/vista-tarjetas.html',
      'assets/views/layout-logueado-fin.html',
      'assets/views/modal-logout.html'
    ];

    setSkeleton('<div class="animate-pulse text-sm font-medium flex items-center gap-2"><i class="fas fa-spinner fa-spin text-lg"></i> Cargando ' + PLANTILLAS_VISTAS.length + ' m√≥dulos de vista‚Ä¶</div>');

    try {
      const respuestas = await Promise.all(PLANTILLAS_VISTAS.map(function(ruta) {
        const url = (BASE || '') + ruta;
        return fetch(url, { cache: 'no-store' }).then(function(res) {
          if (!res.ok) throw new Error('HTTP ' + res.status + ' en ' + ruta);
          return res.text();
        }).then(function(txt) {
          if (!txt || txt.trim().length === 0) throw new Error('Archivo vac√≠o: ' + ruta);
          return txt;
        });
      }));
      const htmlFinal = respuestas.join('\n');
      const appContenedor = document.getElementById('app');
      if (!appContenedor) throw new Error('#app no existe en DOM');
      appContenedor.innerHTML = htmlFinal;
      if (skeleton) skeleton.style.display = 'none';
      appContenedor.classList.remove('hidden');
    } catch (errCarga) {
      console.error('Error al cargar plantillas de vistas:', errCarga);
      setSkeleton(
        '<div class="text-sm text-red-700 font-bold flex flex-col gap-2"><div class="flex items-center gap-2"><i class="fas fa-exclamation-triangle text-red-500"></i> ' +
        'Error al cargar m√≥dulos: ' + (errCarga.message || String(errCarga)) +
        '</div><div><button style="background:#001ba0;color:#fff;padding:8px 14px;border-radius:12px;font-weight:700;cursor:pointer" onclick="location.reload()">Recargar p√°gina</button>' +
        ' <button id="debugFetchBtn" style="background:#dc2626;color:#fff;padding:8px 14px;border-radius:12px;font-weight:700;cursor:pointer;margin-left:6px">Reintentar Cargas</button></div></div>'
      );
      const retryBtn = document.getElementById('debugFetchBtn');
      if (retryBtn) retryBtn.addEventListener('click', function() { location.reload(); });
      return;
    }

    const { createApp, ref, reactive, onMounted, onBeforeUnmount, computed, watch } = Vue;

    const app = createApp({
      setup() {
        const cargando = ref(true);
        const vista = ref('scanner');
        const sidebarAbierto = ref(false);
        const mostrarModalLogout = ref(false);
        const subtabUsuario = ref('usuarios');
        const sesion = reactive({ token: null, usuario: null, correo: null, nombreMostrar: null, rol: null });

        const loginForm = reactive({ usuario: '', password: '' });
        const loginError = ref('');
        const loginCargando = ref(false);
        const mostrarPassword = ref(false);

        const escaneando = ref(false);
        const ultimoResultado = ref(null);
        const duiManual = ref('');
        const procesandoAsistencia = ref(false);
        const colaAsistencia = ref([]);
        let html5QrCodeScanner = null;
        const QR_CONTAINER_ID = 'lector-qr';

        const sorteando = ref(false);
        const ganadorSorteo = ref(null);
        const errorRifa = ref('');
        const generalError = ref('');
        const notificacion = reactive({ visible: false, mensaje: '', tipo: 'exito' });

        const resumenData = reactive({ total: 0, eventoActivo: true });
        const asistenciasDetalladas = ref([]);
        const busquedaAsistencia = ref('');

        const listaDistritos = ref(['Panchimalco', 'Rosario de Mora', 'San Marcos', 'Santiago Texacuangos', 'Santo Tom√°s']);

        const listaDias = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
        const listaMeses = [
          { val: '01', nombre: 'Enero' }, { val: '02', nombre: 'Febrero' }, { val: '03', nombre: 'Marzo' },
          { val: '04', nombre: 'Abril' }, { val: '05', nombre: 'Mayo' }, { val: '06', nombre: 'Junio' },
          { val: '07', nombre: 'Julio' }, { val: '08', nombre: 'Agosto' }, { val: '09', nombre: 'Septiembre' },
          { val: '10', nombre: 'Octubre' }, { val: '11', nombre: 'Noviembre' }, { val: '12', nombre: 'Diciembre' }
        ];
        const anioActual = new Date().getFullYear();
        const listaAnios = Array.from({ length: anioActual - 1920 + 1 }, (_, i) => String(anioActual - i));

        const fechaNacObj = reactive({ dia: '', mes: '', anio: '' });

        const busquedaEmpleadoModal = ref('');
        const mostrarMenuEmpleadoModal = ref(false);

        const guardandoEmpleado = ref(false);
        const guardandoDpto = ref(false);
        const guardandoPremio = ref(false);
        const guardandoUsuario = ref(false);
        const guardandoRol = ref(false);
        const guardandoSorteo = ref(false);
        const guardandoEvento = ref(false);
        const guardandoPermiso = ref(false);

        const cargarAsistenciasDetalladas = ref(null);
        const cargarResumen = ref(null);
        const cargandoResumen = ref(false);

        const busquedaDpto = ref('');
        const paginaDpto = ref(1);
        const itemsPorPaginaDpto = ref(10);
        const listaDepartamentos = ref([]);
        const modalDpto = ref(false);
        const formDpto = reactive({ id: null, codDpto: '', nombreDpto: '', activo: 'TRUE' });

        const listaEmpleados = ref([]);
        const busquedaEmpleado = ref('');
        const modalEmpleado = ref(false);
        const errorEmpleado = ref('');
        const formEmpleado = reactive({ id: null, distrito: '', dpto: '', cargo: '', nombres: '', apellidos: '', fechaNacimiento: '', telefono: '', correo: '', dui: '', codigo: '', activo: 'TRUE' });

        const listaPremios = ref([]);
        const modalPremio = ref(false);
        const formPremio = reactive({ id: null, nombre: '', descripcion: '', cantidad: 1, activo: 'TRUE' });

        const listaUsuarios = ref([]);
        const modalUsuario = ref(false);
        const formUsuario = reactive({ id: null, empleado: '', telefono: '', correo: '', usuario: '', passwordPlano: '', rol: '', activo: 'TRUE' });

        const listaRoles = ref([]);
        const modalRol = ref(false);
        const formRol = reactive({ id: null, nombreRol: '', activo: 'TRUE' });

        const rolSeleccionado = ref(null);
        const busquedaPermiso = ref('');
        const guardandoPermisos = ref(false);
        const exitoPermisos = ref('');
        const permisosMatriz = ref([]);

        const importandoArchivo = ref(false);
        const procesandoArchivo = ref(false);
        const progresoImportacion = ref(0);
        const detalleImportacion = ref([]);
        const resumenImportacion = ref(null);
        const tipoImportacion = ref('');

        const listaPlantillas = ref([]);
        const plantillaSeleccionada = ref('');
        const modalGenerar = ref(false);
        const empleadosSeleccionados = ref([]);
        const busquedaEmpleadoTarjeta = ref('');
        const generandoTarjetas = ref(false);
        const progresoTarjetas = ref(0);
        const tarjetasProcesadas = ref(0);

        const estaOnline = ref(navigator.onLine);
        const pendientesOffline = ref(0);
        const sincronizandoOffline = ref(false);

        function _construirMatriz() {
          const rolId = rolSeleccionado.value;
          if (!rolId) { permisosMatriz.value = []; return; }
          const delRol = listaPermisos.value.filter(function(p) { return p.rol === rolId; });
          const modulosSet = {};
          delRol.forEach(function(p) {
            if (String(p.puedeVer).toUpperCase() === 'TRUE' || String(p.puedeAgregar).toUpperCase() === 'TRUE' || String(p.puedeEditar).toUpperCase() === 'TRUE' || String(p.puedeEliminar).toUpperCase() === 'TRUE') {
              modulosSet[p.modulo] = true;
            }
          });
          permisosMatriz.value = Object.keys(modulosSet).map(function(mod) {
            const ex = delRol.find(function(p) { return p.modulo === mod; });
            return {
              modulo: mod,
              id: ex ? ex.id : null,
              rol: rolId,
              puedeVer: ex ? String(ex.puedeVer).toUpperCase() === 'TRUE' : false,
              puedeAgregar: ex ? String(ex.puedeAgregar).toUpperCase() === 'TRUE' : false,
              puedeEditar: ex ? String(ex.puedeEditar).toUpperCase() === 'TRUE' : false,
              puedeEliminar: ex ? String(ex.puedeEliminar).toUpperCase() === 'TRUE' : false,
              seleccionado: false
            };
          });
        }

        const permisosFiltrados = computed(function() {
          var q = busquedaPermiso.value.toLowerCase().trim();
          return permisosMatriz.value.filter(function(p) {
            return p.modulo.toLowerCase().includes(q);
          });
        });

        function cambiarRol(rolId) {
          rolSeleccionado.value = rolId;
          exitoPermisos.value = '';
          _construirMatriz();
        }

        function alternarPermiso(perm, campo) {
          perm[campo] = !perm[campo];
          if (campo === 'puedeVer' && !perm.puedeVer) {
            perm.puedeAgregar = false;
            perm.puedeEditar = false;
            perm.puedeEliminar = false;
          }
          if (campo !== 'puedeVer' && (perm.puedeAgregar || perm.puedeEditar || perm.puedeEliminar)) {
            perm.puedeVer = true;
          }
          perm.seleccionado = perm.puedeVer && perm.puedeAgregar && perm.puedeEditar && perm.puedeEliminar;
        }

        function alternarTodo(perm) {
          var val = !perm.seleccionado;
          perm.puedeVer = val;
          perm.puedeAgregar = val;
          perm.puedeEditar = val;
          perm.puedeEliminar = val;
          perm.seleccionado = val;
        }

        async function guardarPermisosRol() {
          guardandoPermisos.value = true;
          exitoPermisos.value = '';
          var datos = permisosMatriz.value.map(function(p) {
            return {
              id: p.id,
              rol: p.rol,
              modulo: p.modulo,
              puedeVer: p.puedeVer ? 'TRUE' : 'FALSE',
              puedeAgregar: p.puedeAgregar ? 'TRUE' : 'FALSE',
              puedeEditar: p.puedeEditar ? 'TRUE' : 'FALSE',
              puedeEliminar: p.puedeEliminar ? 'TRUE' : 'FALSE'
            };
          });
          try {
            const res = await apiGuardarPermisosRol(sesion.token, datos);
            guardandoPermisos.value = false;
            exitoPermisos.value = (res.saved || 0) + ' permisos guardados correctamente.';
            setTimeout(function() { exitoPermisos.value = ''; }, 4000);
            await cargarDatosInicialesBatch();
          } catch (err) {
            guardandoPermisos.value = false;
            mostrarNotificacion(err.message || 'Error al guardar permisos.', 'error');
          }
        }

        const listaPermisos = ref([]);
        const modalPermiso = ref(false);
        const formPermiso = reactive({ id: null, rol: '', modulo: '', puedeVer: 'TRUE', puedeAgregar: 'FALSE', puedeEditar: 'FALSE', puedeEliminar: 'FALSE' });

        const listaEventos = ref([]);
        const modalEvento = ref(false);
        const formEvento = reactive({ id: null, nombre: '', fechaEvento: '', ubicacion: '', activo: 'FALSE' });
        const eventoActivo = ref(null);

        const listaSorteos = ref([]);
        const modalSorteo = ref(false);
        const formSorteo = reactive({ id: null, nombre: '', premio: '' });
        const ganadorActual = ref(null);
        const errorGanador = ref('');

        function formatearDui(val) {
          if (!val) return '';
          let nums = String(val).replace(/[^0-9]/g, '');
          if (!nums) return '';
          if (nums.length === 8) nums = '0' + nums;
          nums = nums.slice(0, 9);
          if (nums.length === 9) return nums.slice(0, 8) + '-' + nums.slice(8);
          return nums;
        }


        function limpiarTildes(val) {
          if (!val) return '';
          return String(val)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[·‡‚„‰]/g, 'a')
            .replace(/[ÈËÍÎ]/g, 'e')
            .replace(/[ÌÏÓÔ]/g, 'i')
            .replace(/[ÛÚÙıˆ]/g, 'o')
            .replace(/[˙˘˚¸]/g, 'u');
        }

        function emitirSonido(tipo) {
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(tipo === 'exito' ? 880 : 220, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start(); osc.stop(ctx.currentTime + 0.2);
          } catch (e) {}
        }

        let _notifTimer = null;
        function mostrarNotificacion(mensaje, tipo = 'exito') {
          if (_notifTimer) clearTimeout(_notifTimer);
          notificacion.mensaje = mensaje;
          notificacion.tipo = tipo;
          notificacion.visible = true;
          _notifTimer = setTimeout(() => {
            notificacion.visible = false;
          }, 3000);
        }

        function guardarSesionLocal(data) {
          if (!data || !data.token) return;
          localStorage.setItem('sssur_sesion', JSON.stringify({
            token: data.token,
            usuario: data.usuario || '',
            correo: data.correo || '',
            nombreMostrar: data.nombreMostrar || '',
            rol: data.rol || ''
          }));
        }

        function cargarSesionLocal() {
          const raw = localStorage.getItem('sssur_sesion');
          if (raw) {
            try {
              const data = JSON.parse(raw);
              Object.assign(sesion, data);
              cargarDatosInicialesBatch();
            } catch (e) { localStorage.removeItem('sssur_sesion'); }
          }
        }

        async function login() {
          loginError.value = ''; loginCargando.value = true;
          try {
            const res = await apiLogin(loginForm.usuario.trim(), loginForm.password);
            if (!res || !res.token) {
              loginError.value = 'Respuesta vac√≠a del servidor. Intenta nuevamente.';
              loginCargando.value = false;
              return;
            }

            Object.assign(sesion, res);
            guardarSesionLocal(res);

            if (res.datosIniciales) {
              poblarCatalogos(res.datosIniciales);
            }

            vista.value = 'scanner';
            loginCargando.value = false;
            mostrarNotificacion('Bienvenido ' + (res.nombreMostrar || res.usuario) + '.', 'exito');
          } catch (err) {
            loginError.value = err.message || 'Error al iniciar sesi√≥n.';
            loginCargando.value = false;
          }
        }

        function poblarCatalogos(payload) {
          if (!payload) return;
          listaEmpleados.value = Array.isArray(payload.empleados) ? payload.empleados : [];
          listaDepartamentos.value = Array.isArray(payload.departamentos) ? payload.departamentos : [];
          listaPremios.value = Array.isArray(payload.premios) ? payload.premios : [];
          listaRoles.value = Array.isArray(payload.roles) ? payload.roles : [];
          listaUsuarios.value = Array.isArray(payload.usuarios) ? payload.usuarios : [];
          asistenciasDetalladas.value = Array.isArray(payload.asistencias) ? payload.asistencias : [];
          listaEventos.value = Array.isArray(payload.eventos) ? payload.eventos : [];
          listaSorteos.value = Array.isArray(payload.sorteos) ? payload.sorteos : [];
          listaPermisos.value = Array.isArray(payload.permisos) ? payload.permisos : [];
          eventoActivo.value = (payload.eventos || []).find(function(e) { return String(e.activo).toUpperCase() === 'TRUE'; }) || null;
          var primerRol = (payload.roles || [])[0];
          rolSeleccionado.value = primerRol ? primerRol.id : null;
          if (primerRol) _construirMatriz();
          resumenData.total = (payload.resumen && payload.resumen.total) || asistenciasDetalladas.value.length || 0;
        }

        function tienePermiso(modulo, tipo) {
          if (!sesion.token) return false;
          if (String(sesion.rol || '').toUpperCase() === 'ADMIN' || String(sesion.rol || '').toUpperCase() === 'ADMINISTRADOR') return true;
          var perm = listaPermisos.value.find(function(p) { return p.modulo === modulo; });
          if (!perm) return false;
          var campo = 'puede' + tipo.charAt(0).toUpperCase() + tipo.slice(1);
          return String(perm[campo]).toUpperCase() === 'TRUE';
        }

        async function cargarDatosInicialesBatch() {
          if (!sesion.token) return;
          try {
            const data = await apiDatosIniciales(sesion.token);
            poblarCatalogos(data);
          } catch (err) {
            console.error('Error al recargar batch:', err);
            if (err && err.message && (err.message.includes('Sesi√≥n') || err.message.includes('expirada') || err.status === 401)) {
              confirmarLogout();
            }
          }
        }

        async function cargarPlantillas() {
          if (!sesion.token) return;
          try {
            const data = await apiListarPlantillas(sesion.token);
            listaPlantillas.value = Array.isArray(data) ? data : [];
          } catch (e) { /* ignore */ }
        }

        async function onSeleccionarPlantilla(e) {
          const file = e.target && e.target.files && e.target.files[0];
          if (!file) return;
          try {
            await window.TarjetasApp.cargarPlantilla(file);
            mostrarNotificacion('Plantilla cargada. Ajust· la posiciÛn del QR.', 'exito');
          } catch (err) {
            mostrarNotificacion(err.message || 'Error al cargar plantilla.', 'error');
          } finally {
            e.target.value = '';
          }
        }

        function onCambiarZona(e) {
          const nombre = e.target.value;
          if (!nombre) return;
          window.TarjetasApp.aplicarZona(nombre);
        }

        async function guardarPlantillaAction() {
          const img = window.TarjetasApp.plantillaActual;
          if (!img) {
            mostrarNotificacion('Primero subÌ una plantilla.', 'error');
            return;
          }
          try {
            const blob = await (await fetch(img.src)).blob();
            const file = new File([blob], 'plantilla.png', { type: 'image/png' });
            const { data: upload, error: errUpload } = await supabase.storage.from('plantillas').upload('plantillas/' + Date.now() + '_plantilla.png', file, { contentType: 'image/png', upsert: true });
            if (errUpload) throw errUpload;

            const qr = window.TarjetasApp.qrConfig;
            await apiGuardarPlantilla(sesion.token, {
              nombre: 'Plantilla ' + new Date().toLocaleDateString('es-SV'),
              imagen_url: upload.path,
              qr_x: Math.round(qr.x),
              qr_y: Math.round(qr.y),
              qr_w: Math.round(qr.w),
              qr_h: Math.round(qr.h),
              campo_qr: document.getElementById('campoQrSelect')?.value || 'dui',
              activo: 'TRUE'
            });
            await cargarPlantillas();
            mostrarNotificacion('Plantilla guardada.', 'exito');
          } catch (err) {
            mostrarNotificacion(err.message || 'Error al guardar plantilla.', 'error');
          }
        }

        function abrirModalGenerar() {
          if (listaPlantillas.value.length === 0) {
            mostrarNotificacion('Primero cre· y guard· una plantilla.', 'error');
            return;
          }
          modalGenerar.value = true;
          empleadosSeleccionados.value = [];
          busquedaEmpleadoTarjeta.value = '';
          progresoTarjetas.value = 0;
          tarjetasProcesadas.value = 0;
        }

        async function generarIndividualAction(emp) {
          if (!plantillaSeleccionada.value) {
            mostrarNotificacion('Selecciona una plantilla primero.', 'error');
            return;
          }
          const plantilla = listaPlantillas.value.find(p => p.id === plantillaSeleccionada.value);
          if (!plantilla) return;

          try {
            const { data: urlData } = supabase.storage.from('plantillas').getPublicUrl(plantilla.imagen_url);
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = urlData.publicUrl; });
            plantillaImg = img;
            window.TarjetasApp.plantillaActual = img;
            window.TarjetasApp.qrConfig = { x: plantilla.qr_x, y: plantilla.qr_y, w: plantilla.qr_w, h: plantilla.qr_h };
            const campo = plantilla.campo_qr || 'dui';
            await window.TarjetasApp.descargarIndividual({ ...emp, _campo: campo }, campo);
            mostrarNotificacion('Tarjeta generada.', 'exito');
          } catch (err) {
            mostrarNotificacion(err.message || 'Error al generar tarjeta.', 'error');
          }
        }

        async function generarLoteAction() {
          if (!plantillaSeleccionada.value) {
            mostrarNotificacion('Selecciona una plantilla.', 'error');
            return;
          }
          if (empleadosSeleccionados.value.length === 0) {
            mostrarNotificacion('Selecciona al menos un empleado.', 'error');
            return;
          }
          const plantilla = listaPlantillas.value.find(p => p.id === plantillaSeleccionada.value);
          if (!plantilla) return;

          try {
            generandoTarjetas.value = true;
            progresoTarjetas.value = 0;
            tarjetasProcesadas.value = 0;

            const { data: urlData } = supabase.storage.from('plantillas').getPublicUrl(plantilla.imagen_url);
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = urlData.publicUrl; });
            plantillaImg = img;
            window.TarjetasApp.plantillaActual = img;
            window.TarjetasApp.qrConfig = { x: plantilla.qr_x, y: plantilla.qr_y, w: plantilla.qr_w, h: plantilla.qr_h };
            const campo = plantilla.campo_qr || 'dui';
            const empleados = (listaEmpleados.value || []).filter(e => empleadosSeleccionados.value.includes(e.id));

            const zip = new JSZip();
            const folder = zip.folder('tarjetas-invitacion');
            const max = Math.min(empleados.length, 50);

            for (let i = 0; i < max; i++) {
              try {
                const dataUrl = await window.TarjetasApp.generarTarjetaDataURL(empleados[i], campo);
                folder.file(`tarjeta-${empleados[i].codigo || empleados[i].dui}.png`, dataUrl.split(',')[1], { base64: true });
              } catch (e) {
                console.error('Error en tarjeta', empleados[i], e);
              }
              tarjetasProcesadas.value = i + 1;
              progresoTarjetas.value = Math.round(((i + 1) / max) * 100);
            }

            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tarjetas-invitacion-${Date.now()}.zip`;
            a.click();
            URL.revokeObjectURL(url);

            modalGenerar.value = false;
            mostrarNotificacion('Descarga iniciada.', 'exito');
          } catch (err) {
            mostrarNotificacion(err.message || 'Error al generar ZIP.', 'error');
          } finally {
            generandoTarjetas.value = false;
            progresoTarjetas.value = 0;
            tarjetasProcesadas.value = 0;
          }
        }

        function solicitarLogout() { mostrarModalLogout.value = true; }

        function _setupOfflineListeners() {
          window.addEventListener('online', async () => {
            estaOnline.value = true;
            mostrarNotificacion('ConexiÛn recuperada. Sincronizando pendientes...', 'exito');
            await cargarPendientesOffline();
            if (pendientesOffline.value > 0) {
              await forzarSincronizacion();
            }
          });
          window.addEventListener('offline', () => {
            estaOnline.value = false;
            mostrarNotificacion('Sin conexiÛn. Los registros se guardar·n localmente.', 'error');
          });
          cargarPendientesOffline();
        }

        async function confirmarLogout() {
          mostrarModalLogout.value = false;
          cargando.value = true;
          await detenerEscaneo();

          if (sesion.token) {
            try { await apiLogout(sesion.token); } catch (_) { /* ignore */ }
          }

          loginForm.password = ''; loginForm.usuario = ''; loginError.value = ''; mostrarPassword.value = false;
          localStorage.removeItem('sssur_sesion');
          sesion.token = null; sesion.usuario = null; sesion.correo = null; sesion.nombreMostrar = null; sesion.rol = null;
          sidebarAbierto.value = false; vista.value = 'scanner';

          setTimeout(() => { cargando.value = false; }, 450);
        }

        function cambiarVista(nuevaVista) {
          generalError.value = '';
          vista.value = nuevaVista;
          sidebarAbierto.value = false;
        }

        function abrirModalDpto(dptoObj = null) {
          if (dptoObj) {
            Object.assign(formDpto, {
              id: dptoObj.id,
              codDpto: dptoObj.cod_dpto || dptoObj.codDpto || '',
              nombreDpto: dptoObj.nombre_dpto || dptoObj.nombreDpto || '',
              activo: String(dptoObj.activo || 'TRUE').toUpperCase()
            });
          } else {
            Object.assign(formDpto, { id: null, codDpto: '', nombreDpto: '', activo: 'TRUE' });
          }
          modalDpto.value = true;
        }

        async function guardarDptoAction() {
          guardandoDpto.value = true;
          try {
            await apiGuardarDepartamento(sesion.token, { ...formDpto });
            guardandoDpto.value = false;
            modalDpto.value = false;
            mostrarNotificacion('Departamento guardado.', 'exito');
            await cargarDatosInicialesBatch();
          } catch (err) {
            guardandoDpto.value = false;
            mostrarNotificacion(err.message || 'Error al guardar.', 'error');
          }
        }

        async function exportarCsvDptoAction() {
          try {
            await apiExportarDepartamentos(sesion.token);
            mostrarNotificacion('Exportaci√≥n iniciada.', 'exito');
          } catch (err) {
            mostrarNotificacion(err.message || 'Error al exportar.', 'error');
          }
        }

        async function importarCsvDptoAction(e) {
          const file = e.target && e.target.files && e.target.files[0];
          if (!file) return;
          try {
            const texto = await file.text();
            tipoImportacion.value = 'departamentos';
            importandoArchivo.value = true;
            procesandoArchivo.value = true;
            progresoImportacion.value = 0;
            detalleImportacion.value = [];
            resumenImportacion.value = null;

            const res = await apiImportarDepartamentos(sesion.token, texto);
            procesandoArchivo.value = false;
            const detalle = (res && Array.isArray(res.detalle)) ? res.detalle : [];
            for (let i = 0; i < detalle.length; i++) {
              detalleImportacion.value.push(detalle[i]);
              progresoImportacion.value = Math.round(((i + 1) / Math.max(detalle.length, 1)) * 100);
              if (i < detalle.length - 1) await new Promise(r => setTimeout(r, 80));
            }
            resumenImportacion.value = res;
            await cargarDatosInicialesBatch();
            await new Promise(r => setTimeout(r, 600));
            mostrarNotificacion('Importaci√≥n completada.', 'exito');
          } catch (err) {
            mostrarNotificacion(err.message || 'Error al importar.', 'error');
          } finally {
            e.target.value = '';
            importandoArchivo.value = false;
          }
        }

        function abrirModalEmpleado(emp = null) {
          errorEmpleado.value = '';
          if (emp) {
            Object.assign(formEmpleado, {
              id: emp.id,
              distrito: emp.distrito || '',
              dpto: emp.dpto || '',
              cargo: emp.cargo || '',
              nombres: emp.nombres || '',
              apellidos: emp.apellidos || '',
              fechaNacimiento: emp.fecha_nacimiento || emp.fechaNacimiento || '',
              telefono: emp.telefono || '',
              correo: emp.correo || '',
              dui: emp.dui || '',
              codigo: emp.codigo || '',
              activo: String(emp.activo || 'TRUE').toUpperCase()
            });
            formEmpleado.dui = formatearDui(formEmpleado.dui);
            const fn = formEmpleado.fechaNacimiento;
            if (fn) {
              const partes = String(fn).split(/[-T/]/);
              if (partes.length >= 3) {
                if (partes[0].length === 4) {
                  fechaNacObj.anio = partes[0];
                  fechaNacObj.mes = String(partes[1]).padStart(2, '0');
                  fechaNacObj.dia = String(partes[2]).padStart(2, '0');
                } else if (partes[2].length === 4) {
                  fechaNacObj.dia = String(partes[0]).padStart(2, '0');
                  fechaNacObj.mes = String(partes[1]).padStart(2, '0');
                  fechaNacObj.anio = partes[2];
                }
              }
            } else { fechaNacObj.dia = ''; fechaNacObj.mes = ''; fechaNacObj.anio = ''; }
          } else {
            Object.assign(formEmpleado, { id: null, distrito: '', dpto: '', cargo: '', nombres: '', apellidos: '', fechaNacimiento: '', telefono: '', correo: '', dui: '', codigo: '', activo: 'TRUE' });
            fechaNacObj.dia = ''; fechaNacObj.mes = ''; fechaNacObj.anio = '';
          }
          modalEmpleado.value = true;
        }

        async function guardarEmpleadoAction() {
          errorEmpleado.value = '';
          formEmpleado.dui = formatearDui(formEmpleado.dui);
          if (formEmpleado.telefono && !/^\d{8}$/.test(formEmpleado.telefono)) {
            errorEmpleado.value = 'El tel√©fono debe contener exactamente 8 d√≠gitos num√©ricos sin guiones.';
            return;
          }
          if (fechaNacObj.anio && fechaNacObj.mes && fechaNacObj.dia) {
            formEmpleado.fechaNacimiento = `${fechaNacObj.anio}-${fechaNacObj.mes}-${fechaNacObj.dia}`;
          }
          guardandoEmpleado.value = true;
          try {
            await apiGuardarEmpleado(sesion.token, { ...formEmpleado });
            guardandoEmpleado.value = false;
            modalEmpleado.value = false;
            mostrarNotificacion('Empleado guardado.', 'exito');
            await cargarDatosInicialesBatch();
          } catch (err) {
            guardandoEmpleado.value = false;
            errorEmpleado.value = err.message || 'Error al guardar el empleado.';
            mostrarNotificacion(err.message || 'Error al guardar.', 'error');
          }
        }

        async function exportarCsvEmpleadoAction() {
          try {
            await apiExportarEmpleados(sesion.token);
            mostrarNotificacion('Exportaci√≥n iniciada.', 'exito');
          } catch (err) {
            mostrarNotificacion(err.message || 'Error al exportar.', 'error');
          }
        }

        async function importarCsvEmpleadoAction(e) {
          const file = e.target && e.target.files && e.target.files[0];
          if (!file) return;
          try {
            const texto = await file.text();
            tipoImportacion.value = 'empleados';
            importandoArchivo.value = true;
            procesandoArchivo.value = true;
            progresoImportacion.value = 0;
            detalleImportacion.value = [];
            resumenImportacion.value = null;

            const res = await apiImportarEmpleados(sesion.token, texto);
            procesandoArchivo.value = false;
            const detalle = (res && Array.isArray(res.detalle)) ? res.detalle : [];
            for (let i = 0; i < detalle.length; i++) {
              detalleImportacion.value.push(detalle[i]);
              progresoImportacion.value = Math.round(((i + 1) / Math.max(detalle.length, 1)) * 100);
              if (i < detalle.length - 1) await new Promise(r => setTimeout(r, 80));
            }
            resumenImportacion.value = res;
            await cargarDatosInicialesBatch();
            await new Promise(r => setTimeout(r, 600));
            mostrarNotificacion('Importaci√≥n completada.', 'exito');
          } catch (err) {
            mostrarNotificacion(err.message || 'Error al importar.', 'error');
          } finally {
            e.target.value = '';
            importandoArchivo.value = false;
          }
        }

        function abrirModalPremio(prm = null) {
          if (prm) {
            Object.assign(formPremio, {
              id: prm.id,
              nombre: prm.nombre || '',
              descripcion: prm.descripcion || '',
              cantidad: Number(prm.cantidad) || 1,
              activo: String(prm.activo || 'TRUE').toUpperCase()
            });
          } else {
            Object.assign(formPremio, { id: null, nombre: '', descripcion: '', cantidad: 1, activo: 'TRUE' });
          }
          modalPremio.value = true;
        }

        async function guardarPremioAction() {
          guardandoPremio.value = true;
          try {
            await apiGuardarPremio(sesion.token, { ...formPremio });
            guardandoPremio.value = false;
            modalPremio.value = false;
            mostrarNotificacion('Premio guardado.', 'exito');
            await cargarDatosInicialesBatch();
          } catch (err) {
            guardandoPremio.value = false;
            mostrarNotificacion(err.message || 'Error al guardar.', 'error');
          }
        }

        function abrirModalUsuario(usr = null) {
          busquedaEmpleadoModal.value = '';
          mostrarMenuEmpleadoModal.value = false;
          if (usr) {
            Object.assign(formUsuario, {
              id: usr.id,
              empleado: usr.empleadoId || usr.empleado || '',
              telefono: usr.telefono || '',
              correo: usr.correo || '',
              usuario: usr.usuario || '',
              passwordPlano: '',
              rol: usr.rolId || usr.rol || '',
              activo: String(usr.activo || 'TRUE').toUpperCase()
            });
          } else {
            Object.assign(formUsuario, { id: null, empleado: '', telefono: '', correo: '', usuario: '', passwordPlano: '', rol: '', activo: 'TRUE' });
          }
          modalUsuario.value = true;
        }

        function seleccionarEmpleadoModal(empId) {
          formUsuario.empleado = empId;
          mostrarMenuEmpleadoModal.value = false;
          busquedaEmpleadoModal.value = '';
        }

        async function guardarUsuarioAction() {
          guardandoUsuario.value = true;
          try {
            await apiGuardarUsuario(sesion.token, { ...formUsuario });
            guardandoUsuario.value = false;
            modalUsuario.value = false;
            mostrarNotificacion('Usuario guardado.', 'exito');
            await cargarDatosInicialesBatch();
          } catch (err) {
            guardandoUsuario.value = false;
            mostrarNotificacion(err.message || 'Error al guardar.', 'error');
          }
        }

        function abrirModalRol(r = null) {
          if (r) {
            Object.assign(formRol, {
              id: r.id,
              nombreRol: r.nombre_rol || r.nombreRol || '',
              activo: String(r.activo || 'TRUE').toUpperCase()
            });
          } else {
            Object.assign(formRol, { id: null, nombreRol: '', activo: 'TRUE' });
          }
          modalRol.value = true;
        }

        async function guardarRolAction() {
          guardandoRol.value = true;
          try {
            await apiGuardarRol(sesion.token, { ...formRol });
            guardandoRol.value = false;
            modalRol.value = false;
            mostrarNotificacion('Rol guardado.', 'exito');
            await cargarDatosInicialesBatch();
          } catch (err) {
            guardandoRol.value = false;
            mostrarNotificacion(err.message || 'Error al guardar.', 'error');
          }
        }

        function abrirModalEvento(evt = null) {
          if (evt) {
            Object.assign(formEvento, {
              id: evt.id,
              nombre: evt.nombre || '',
              fechaEvento: evt.fecha_evento || evt.fechaEvento || '',
              ubicacion: evt.ubicacion || '',
              activo: String(evt.activo || 'FALSE').toUpperCase()
            });
          } else {
            Object.assign(formEvento, { id: null, nombre: '', fechaEvento: '', ubicacion: '', activo: 'FALSE' });
          }
          modalEvento.value = true;
        }

        async function guardarEventoAction() {
          guardandoEvento.value = true;
          generalError.value = '';
          try {
            await apiGuardarEvento(sesion.token, { ...formEvento });
            guardandoEvento.value = false;
            modalEvento.value = false;
            mostrarNotificacion('Evento guardado.', 'exito');
            await cargarDatosInicialesBatch();
          } catch (err) {
            guardandoEvento.value = false;
            generalError.value = err.message || 'Error al guardar el evento.';
            mostrarNotificacion(err.message || 'Error al guardar.', 'error');
          }
        }

        async function setEventoActivoAction(eventoId) {
          generalError.value = '';
          try {
            await apiSetEventoActivo(sesion.token, eventoId);
            await cargarDatosInicialesBatch();
          } catch (err) {
            generalError.value = err.message || 'Error al cambiar el evento activo.';
          }
        }

        function abrirModalPermiso(perm = null) {
          if (perm) {
            Object.assign(formPermiso, {
              id: perm.id,
              rol: perm.rol || '',
              modulo: perm.modulo || '',
              puedeVer: String(perm.puedeVer || perm.puede_ver || 'TRUE').toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE',
              puedeAgregar: String(perm.puedeAgregar || perm.puede_agregar || 'FALSE').toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE',
              puedeEditar: String(perm.puedeEditar || perm.puede_editar || 'FALSE').toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE',
              puedeEliminar: String(perm.puedeEliminar || perm.puede_eliminar || 'FALSE').toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE'
            });
          } else {
            Object.assign(formPermiso, { id: null, rol: '', modulo: '', puedeVer: 'TRUE', puedeAgregar: 'FALSE', puedeEditar: 'FALSE', puedeEliminar: 'FALSE' });
          }
          modalPermiso.value = true;
        }

        async function guardarPermisoAction() {
          guardandoPermiso.value = true;
          generalError.value = '';
          try {
            await apiGuardarPermiso(sesion.token, { ...formPermiso });
            guardandoPermiso.value = false;
            modalPermiso.value = false;
            await cargarDatosInicialesBatch();
          } catch (err) {
            guardandoPermiso.value = false;
            generalError.value = err.message || 'Error al guardar el permiso.';
          }
        }

        function editarPermiso(perm) {
          abrirModalPermiso(perm);
        }

        function abrirModalSorteo(srt = null) {
          if (srt) {
            Object.assign(formSorteo, {
              id: srt.id,
              nombre: srt.nombre || '',
              premio: srt.premio || ''
            });
          } else {
            Object.assign(formSorteo, { id: null, nombre: '', premio: '' });
          }
          modalSorteo.value = true;
        }

        async function guardarSorteoAction() {
          guardandoSorteo.value = true;
          errorGanador.value = '';
          try {
            await apiGuardarSorteo(sesion.token, { nombre: formSorteo.nombre, premio: formSorteo.premio, id: formSorteo.id });
            guardandoSorteo.value = false;
            modalSorteo.value = false;
            await cargarDatosInicialesBatch();
          } catch (err) {
            guardandoSorteo.value = false;
            errorGanador.value = err.message || 'Error al guardar el sorteo.';
          }
        }

        async function sortearGanadorAction() {
          if (!formSorteo.id) {
            errorGanador.value = 'Debes guardar el sorteo antes de extraer un ganador.';
            return;
          }
          errorGanador.value = '';
          ganadorActual.value = null;
          sorteando.value = true;
          try {
            const res = await apiSortearGanador(sesion.token, formSorteo.id);
            ganadorActual.value = res;
            errorGanador.value = '';
            emitirSonido('exito');
          } catch (err) {
            errorGanador.value = err.message || 'Error al sortear.';
          } finally {
            sorteando.value = false;
          }
        }

        async function iniciarEscaneo() {
          escaneando.value = true;
          ultimoResultado.value = null;
          await _iniciarCamaraQr();
        }

        async function detenerEscaneo() {
          escaneando.value = false;
          await _detenerCamaraQr();
        }

        async function _iniciarCamaraQr() {
          if (typeof Html5QrcodeScanner === 'undefined' && typeof Html5Qrcode === 'undefined') {
            ultimoResultado.value = { error: true, mensaje: 'Librer√≠a QR no cargada. Recarga la p√°gina.' };
            escaneando.value = false;
            return;
          }
          try {
            const container = document.getElementById(QR_CONTAINER_ID);
            if (!container) {
              setTimeout(() => _iniciarCamaraQr(), 200);
              return;
            }
            container.innerHTML = '';
            const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };

            if (typeof Html5Qrcode !== 'undefined') {
              if (!html5QrCodeScanner) {
                html5QrCodeScanner = new Html5Qrcode(QR_CONTAINER_ID);
              }
              await html5QrCodeScanner.start(
                { facingMode: 'environment' },
                config,
                (decodedText) => {
                  if (decodedText) {
                    try { html5QrCodeScanner.pause(); } catch (_) {}
                    registrarAsistencia(decodedText);
                    setTimeout(() => {
                      if (html5QrCodeScanner && escaneando.value) {
                        try { html5QrCodeScanner.resume(); } catch (_) {}
                      }
                    }, 1500);
                  }
                },
                () => {}
              );
            } else if (typeof Html5QrcodeScanner !== 'undefined') {
              html5QrCodeScanner = new Html5QrcodeScanner(QR_CONTAINER_ID, config, false);
              html5QrCodeScanner.render((decodedText) => {
                registrarAsistencia(decodedText);
              }, () => {});
            }
          } catch (err) {
            console.error('QR camera error:', err);
            ultimoResultado.value = { error: true, mensaje: 'No se pudo acceder a la c√°mara: ' + (err.message || String(err)) };
            escaneando.value = false;
          }
        }

        async function _detenerCamaraQr() {
          if (html5QrCodeScanner) {
            try {
              if (typeof html5QrCodeScanner.stop === 'function') {
                await html5QrCodeScanner.stop();
              }
              if (typeof html5QrCodeScanner.clear === 'function') {
                try { html5QrCodeScanner.clear(); } catch (_) {}
              }
            } catch (_) { /* ignore */ }
            html5QrCodeScanner = null;
          }
          const container = document.getElementById(QR_CONTAINER_ID);
          if (container) container.innerHTML = '';
        }

        function abrirSelectorFoto() { document.getElementById('input-foto-qr').click(); }

        function procesarFotoQr(event) {
          const files = event.target.files; if (!files || files.length === 0) return;
          if (typeof Html5Qrcode === 'undefined') {
            ultimoResultado.value = { error: true, mensaje: 'Librer√≠a QR no disponible.' };
            return;
          }
          const html5QrCode = new Html5Qrcode("lector-qr-temp");
          html5QrCode.scanFile(files[0], true)
            .then(dui => registrarAsistencia(dui))
            .catch(() => { ultimoResultado.value = { error: true, mensaje: 'No se detect√≥ un c√≥digo QR v√°lido en la foto.' }; });
          event.target.value = '';
        }

        function registrarAsistencia(dui) {
          if (procesandoAsistencia.value) {
            colaAsistencia.value.push(dui);
            return;
          }
          _enviarAsistencia(dui, 0);
        }

        async function _enviarAsistencia(dui, intento) {
          procesandoAsistencia.value = true;
          try {
            if (!estaOnline.value) {
              await _guardarAsistenciaOffline(dui);
              return;
            }
            const res = await apiRegistrarAsistencia(sesion.token, dui, 'app-web');
            procesandoAsistencia.value = false;
            ultimoResultado.value = res; emitirSonido(res.duplicado ? 'error' : 'exito');
            if (!res.duplicado) resumenData.total++;
            if (!res.duplicado && res.empleado) {
              asistenciasDetalladas.value.unshift({
                id: Date.now().toString(),
                fechaHora: new Date().toISOString(),
                empleadoNombre: (res.empleado.nombres || '') + ' ' + (res.empleado.apellidos || ''),
                dui: dui,
                fuente: 'qr'
              });
            }
            _procesarSiguienteEnCola();
          } catch (err) {
            procesandoAsistencia.value = false;
            var msg = (err && err.message) ? err.message : String(err);
            if (intento < 2 && estaOnline.value) {
              setTimeout(() => _enviarAsistencia(dui, intento + 1), 800 * (intento + 1));
            } else {
              await _guardarAsistenciaOffline(dui);
              _procesarSiguienteEnCola();
            }
          }
        }

        async function _guardarAsistenciaOffline(dui) {
          try {
            const empleado = (listaEmpleados.value || []).find(function(e) {
              const d = String(e.dui || '').replace(/[^0-9]/g, '');
              return d === String(dui || '').replace(/[^0-9]/g, '');
            });
            const registro = await window.OfflineApp.guardarAsistenciaOffline(
              empleado ? empleado.id : null,
              dui,
              empleado ? empleado.nombres : 'Desconocido',
              empleado ? empleado.apellidos : '',
              'qr'
            );
            pendientesOffline.value = await window.OfflineApp.contarPendientes();
            ultimoResultado.value = {
              error: false,
              offline: true,
              mensaje: '?? Sin conexiÛn. Asistencia guardada localmente. Pendientes: ' + pendientesOffline.value
            };
            emitirSonido('exito');
          } catch (e) {
            ultimoResultado.value = { error: true, mensaje: 'Error al guardar offline: ' + (e.message || String(e)) };
            emitirSonido('error');
          }
        }

        async function cargarPendientesOffline() {
          if (!sesion.token) return;
          try {
            const count = await window.OfflineApp.contarPendientes();
            pendientesOffline.value = count;
          } catch (e) { /* ignore */ }
        }

        async function forzarSincronizacion() {
          if (!sesion.token || !window.OfflineApp) return;
          sincronizandoOffline.value = true;
          try {
            const resultado = await window.OfflineApp.sincronizarPendientes(sesion.token);
            pendientesOffline.value = await window.OfflineApp.contarPendientes();
            const msg = 'SincronizaciÛn: ' + resultado.sincronizados + ' OK, ' + resultado.duplicados + ' duplicados, ' + resultado.errores + ' errores';
            mostrarNotificacion(msg, resultado.errores > 0 ? 'error' : 'exito');
          } catch (e) {
            mostrarNotificacion('Error en sincronizaciÛn: ' + (e.message || String(e)), 'error');
          } finally {
            sincronizandoOffline.value = false;
          }
        }

        function _procesarSiguienteEnCola() {
          if (colaAsistencia.value.length > 0) {
            const siguiente = colaAsistencia.value.shift();
            _enviarAsistencia(siguiente, 0);
          }
        }

        function registrarManual() {
          if (!duiManual.value.trim()) return;
          registrarAsistencia(duiManual.value.trim()); duiManual.value = '';
        }

        function ejecutarSorteo() {
          if (!formSorteo.id) {
            errorRifa.value = 'Debes seleccionar un sorteo primero.';
            return;
          }
          errorRifa.value = '';
          sortearGanadorAction();
        }

        const departamentosFiltrados = computed(() => {
          const q = busquedaDpto.value.toLowerCase().trim();
          const lista = Array.isArray(listaDepartamentos.value) ? listaDepartamentos.value : [];
          return lista.filter(d => String(d.nombreDpto || d.nombre_dpto || '').toLowerCase().includes(q) || String(d.codDpto || d.cod_dpto || '').toLowerCase().includes(q));
        });

        const totalPaginasDpto = computed(() => {
          if (itemsPorPaginaDpto.value === 'Todos') return 1;
          const limite = Number(itemsPorPaginaDpto.value) || 10;
          return Math.ceil(departamentosFiltrados.value.length / limite) || 1;
        });

        const departamentosPaginados = computed(() => {
          const filtrados = departamentosFiltrados.value;
          if (itemsPorPaginaDpto.value === 'Todos') return filtrados;
          const limite = Number(itemsPorPaginaDpto.value) || 10;
          const inicio = (paginaDpto.value - 1) * limite;
          return filtrados.slice(inicio, inicio + limite);
        });

        const departamentoRangoTexto = computed(() => {
          const total = departamentosFiltrados.value.length;
          if (total === 0) return '0';
          if (itemsPorPaginaDpto.value === 'Todos') return `1 a ${total}`;
          const limite = Number(itemsPorPaginaDpto.value) || 10;
          const inicio = (paginaDpto.value - 1) * limite + 1;
          const fin = Math.min(paginaDpto.value * limite, total);
          return `${inicio} a ${fin}`;
        });

        watch(busquedaDpto, () => { paginaDpto.value = 1; });
        watch(itemsPorPaginaDpto, () => { paginaDpto.value = 1; });

        watch(vista, (nv) => {
          if (nv === 'tarjetas') {
            cargarPlantillas();
            nextTick(() => {
              if (window.TarjetasApp && typeof window.TarjetasApp.init === 'function') {
                window.TarjetasApp.init();
              }
            });
          }
        });

        const empleadosParaModalUsuario = computed(() => {
          const q = busquedaEmpleadoModal.value.toLowerCase().trim();
          const lista = Array.isArray(listaEmpleados.value) ? listaEmpleados.value : [];
          if (!q) return lista.slice(0, 50);
          return lista.filter(e => {
            const nom = String(e.nombres || '').toLowerCase();
            const ape = String(e.apellidos || '').toLowerCase();
            const dui = String(e.dui || '').toLowerCase();
            const tel = String(e.telefono || '').toLowerCase();
            const email = String(e.correo || '').toLowerCase();
            return nom.includes(q) || ape.includes(q) || dui.includes(q) || tel.includes(q) || email.includes(q);
          });
        });

        const empleadoSeleccionadoNombre = computed(() => {
          if (!formUsuario.empleado) return '-- Sin Empleado Vinculado --';
          const emp = (listaEmpleados.value || []).find(e => String(e.id) === String(formUsuario.empleado));
          if (!emp) return '-- Sin Empleado Vinculado --';
          return `${emp.nombres} ${emp.apellidos} (DUI: ${formatearDui(emp.dui)})`;
        });

        const empleadosFiltrados = computed(() => {
          const q = busquedaEmpleado.value.toLowerCase().trim();
          const lista = Array.isArray(listaEmpleados.value) ? listaEmpleados.value : [];
          return lista.filter(e => String(e.nombres || '').toLowerCase().includes(q) || String(e.apellidos || '').toLowerCase().includes(q) || String(e.dui || '').includes(q));
        });

        const asistenciasFiltradas = computed(() => {
          const q = busquedaAsistencia.value.toLowerCase().trim();
          const lista = Array.isArray(asistenciasDetalladas.value) ? asistenciasDetalladas.value : [];
          return lista.filter(a => String(a.empleadoNombre || '').toLowerCase().includes(q) || String(a.dui || '').includes(q));
        });

        const esAdmin = computed(() => {
          return String(sesion.rol).toUpperCase() === 'ADMIN' || String(sesion.rol).toUpperCase() === 'ADMINISTRADOR';
        });

        onMounted(() => {
          cargarSesionLocal();
          cargando.value = false;
          _setupOfflineListeners();
        });

        onBeforeUnmount(() => {
          detenerEscaneo();
        });

        return {
          cargando, vista, sidebarAbierto, mostrarModalLogout, subtabUsuario, sesion, loginForm, loginError, loginCargando, mostrarPassword,
          escaneando, ultimoResultado, duiManual, procesandoAsistencia, sorteando, ganadorSorteo, ganadorActual, errorRifa, generalError, notificacion,
          resumenData, esAdmin, listaDistritos, listaDias, listaMeses, listaAnios, fechaNacObj,
          guardandoEmpleado, guardandoDpto, guardandoPremio, guardandoUsuario, guardandoRol, guardandoSorteo, guardandoEvento, guardandoPermiso,
          cargarAsistenciasDetalladas, cargarResumen, cargandoResumen,
          busquedaEmpleadoModal, mostrarMenuEmpleadoModal, empleadosParaModalUsuario, empleadoSeleccionadoNombre, seleccionarEmpleadoModal,
          listaDepartamentos, busquedaDpto, modalDpto, formDpto, departamentosFiltrados, paginaDpto, itemsPorPaginaDpto, totalPaginasDpto, departamentosPaginados, departamentoRangoTexto,
          listaEmpleados, busquedaEmpleado, modalEmpleado, formEmpleado, errorEmpleado, empleadosFiltrados,
          asistenciasDetalladas, busquedaAsistencia, asistenciasFiltradas, listaPremios, modalPremio, formPremio,
          listaUsuarios, modalUsuario, formUsuario, listaRoles, modalRol, formRol,
          listaPermisos, modalPermiso, formPermiso, tienePermiso, abrirModalPermiso,
          guardarPermisoAction, editarPermiso,
          rolSeleccionado, busquedaPermiso, guardandoPermisos, exitoPermisos,
          permisosMatriz, permisosFiltrados, cambiarRol, alternarPermiso, alternarTodo, guardarPermisosRol,
          importandoArchivo, progresoImportacion, detalleImportacion, resumenImportacion, tipoImportacion, procesandoArchivo,
          listaEventos, modalEvento, formEvento, eventoActivo, guardarEventoAction, setEventoActivoAction, abrirModalEvento,
          listaSorteos, modalSorteo, formSorteo, errorGanador, guardarSorteoAction, sortearGanadorAction, abrirModalSorteo,
          formatearDui, limpiarTildes, login, solicitarLogout, confirmarLogout, cambiarVista, iniciarEscaneo, detenerEscaneo, abrirSelectorFoto,
          procesarFotoQr, registrarManual, ejecutarSorteo, abrirModalDpto, guardarDptoAction, exportarCsvDptoAction, importarCsvDptoAction,
          abrirModalEmpleado, guardarEmpleadoAction, exportarCsvEmpleadoAction, importarCsvEmpleadoAction, abrirModalPremio, guardarPremioAction,
          abrirModalUsuario, guardarUsuarioAction, abrirModalRol, guardarRolAction, cargarDatosInicialesBatch,
          cargarPlantillas, onSeleccionarPlantilla, onCambiarZona, guardarPlantillaAction, abrirModalGenerar, generarIndividualAction, generarLoteAction,
          generandoTarjetas, progresoTarjetas, tarjetasProcesadas,
          estaOnline, pendientesOffline, sincronizandoOffline, cargarPendientesOffline, forzarSincronizacion
        };
      }
    });

    app.config.errorHandler = function(err, vm, info) {
      console.error('[Vue Error] Info:', info, err);
      const msj = (err && err.message) ? err.message : String(err);
      setSkeleton(
        '<div class="text-sm text-red-700 font-bold flex flex-col gap-2 p-4 rounded-2xl bg-red-50 border border-red-200 max-w-2xl"><div class="flex items-center gap-2"><i class="fas fa-exclamation-triangle text-red-500"></i> ' +
        'Error Vue: ' + msj +
        '</div><div class="text-xs font-medium text-red-600">' + (info || '') + '</div>' +
        '<div><button style="background:#001ba0;color:#fff;padding:8px 14px;border-radius:12px;font-weight:700;cursor:pointer" onclick="location.reload()">Recargar</button></div></div>'
      );
    };

    try {
      app.mount('#app');
      console.log('[OK] Vue app montada exitosamente en #app');
    } catch (errMount) {
      console.error('Error al montar Vue app:', errMount);
      setSkeleton(
        '<div class="text-sm text-red-700 font-bold flex flex-col gap-2 p-4 rounded-2xl bg-red-50 border border-red-200 max-w-2xl"><div class="flex items-center gap-2"><i class="fas fa-exclamation-triangle text-red-500"></i> ' +
        'No se pudo inicializar la app: ' + ((errMount && errMount.message) || String(errMount)) +
        '</div><div><button style="background:#001ba0;color:#fff;padding:8px 14px;border-radius:12px;font-weight:700;cursor:pointer" onclick="location.reload()">Recargar</button></div></div>'
      );
    }

    // Service Worker update listener
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available, show toast and reload
                if (confirm('Hay una nueva versiÛn disponible. øRecargar ahora?')) {
                  window.location.reload();
                }
              }
            });
          }
        });
      });
    }
  });
