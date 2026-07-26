(function() {
  'use strict';

  const qrConfig = { x: 800, y: 1400, w: 300, h: 300 };
  const zonasPredefinidas = {
    'Inferior Derecha': { x: 800, y: 1400, w: 300, h: 300 },
    'Centro Inferior': { x: 450, y: 1500, w: 300, h: 300 },
    'Superior Izquierda': { x: 100, y: 100, w: 300, h: 300 },
    'Centro': { x: 450, y: 700, w: 300, h: 300 }
  };

  let plantillaImg = null;
  let canvas = null;
  let ctx = null;
  let scale = 1;
  let arrastrando = false;
  let inicioX = 0, inicioY = 0, inicioQrX = 0, inicioQrY = 0;

  // Expose early so Vue/template can read it even before init()
  window.TarjetasApp = {
    qrConfig,
    zonasPredefinidas,
    plantillaActual: null,
    init() {},
    cargarPlantilla() {},
    aplicarZona() {},
    renderizarPreview() {},
    descargarIndividual() {},
    descargarZIP() {},
    getQrUrl() {},
    generarTarjetaDataURL() {}
  };

  function init() {
    canvas = document.getElementById('canvasTarjeta');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    bindEvents();
  }

  function bindEvents() {
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchend', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function onMouseDown(e) { startDrag(getPos(e)); }
  function onTouchStart(e) { e.preventDefault(); startDrag(getPos(e)); }

  function startDrag(pos) {
    const sx = qrConfig.x * scale;
    const sy = qrConfig.y * scale;
    const sw = qrConfig.w * scale;
    const sh = qrConfig.h * scale;
    if (pos.x >= sx && pos.x <= sx + sw && pos.y >= sy && pos.y <= sy + sh) {
      arrastrando = true;
      inicioX = pos.x; inicioY = pos.y;
      inicioQrX = qrConfig.x; inicioQrY = qrConfig.y;
    }
  }

  function onMouseMove(e) { if (arrastrando) moveDrag(getPos(e)); }
  function onTouchMove(e) { e.preventDefault(); if (arrastrando) moveDrag(getPos(e)); }

  function moveDrag(pos) {
    const dx = (pos.x - inicioX) / scale;
    const dy = (pos.y - inicioY) / scale;
    qrConfig.x = Math.max(0, Math.min(inicioQrX + dx, canvas.width / scale - qrConfig.w));
    qrConfig.y = Math.max(0, Math.min(inicioQrY + dy, canvas.height / scale - qrConfig.h));
    renderizarPreview();
  }

  function onMouseUp() { arrastrando = false; }

  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -10 : 10;
    const newW = Math.max(80, Math.min(400, qrConfig.w + delta));
    qrConfig.w = newW;
    qrConfig.h = newW;
    renderizarPreview();
  }

  function cargarPlantilla(file) {
    return new Promise((resolve, reject) => {
      if (file.type !== 'image/png') return reject('Solo se permiten archivos PNG.');
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = 1; tempCanvas.height = 1;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.drawImage(img, 0, 0);
          const data = tempCtx.getImageData(0, 0, 1, 1).data;
          if (data[3] === 255) return reject('La imagen debe tener fondo transparente (canal alpha).');
          if (img.width < 800 || img.height < 600) return reject('Dimensiones mínimas: 800x600px.');
          plantillaImg = img;
          centrarQr();
          renderizarPreview();
          resolve(img);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function centrarQr() {
    if (!plantillaImg) return;
    qrConfig.x = Math.round(plantillaImg.width * 0.75);
    qrConfig.y = Math.round(plantillaImg.height * 0.85);
    qrConfig.w = Math.round(plantillaImg.width * 0.15);
    qrConfig.h = qrConfig.w;
  }

  function aplicarZona(nombre) {
    if (!plantillaImg) return;
    const z = zonasPredefinidas[nombre];
    if (!z) return;
    qrConfig.x = Math.round(z.x * (plantillaImg.width / 1200));
    qrConfig.y = Math.round(z.y * (plantillaImg.height / 1800));
    qrConfig.w = Math.round(z.w * (plantillaImg.width / 1200));
    qrConfig.h = qrConfig.w;
    renderizarPreview();
  }

  function getQrUrl(empleado, campo) {
    const valor = campo === 'dui' ? empleado.dui :
                  campo === 'codigo' ? empleado.codigo :
                  `${window.location.origin}/invitacion/${empleado.id}`;
    const logo = encodeURIComponent('https://sansalvadorsur.gob.sv/images/logo-circulo-blanco.png');
    return `https://quickchart.io/qr?text=${encodeURIComponent(valor)}&light=f3f3f3&margin=2&size=200&centerImageUrl=${logo}`;
  }

  function renderizarPreview() {
    if (!plantillaImg || !ctx) return;
    scale = Math.min(800 / plantillaImg.width, 600 / plantillaImg.height);
    canvas.width = plantillaImg.width * scale;
    canvas.height = plantillaImg.height * scale;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(plantillaImg, 0, 0, canvas.width, canvas.height);

    // Overlay QR
    ctx.strokeStyle = '#001ba0';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(qrConfig.x * scale, qrConfig.y * scale, qrConfig.w * scale, qrConfig.h * scale);
    ctx.setLineDash([]);

    // QR QuickChart
    const qrImg = new Image();
    qrImg.crossOrigin = 'anonymous';
    qrImg.onload = () => {
      ctx.drawImage(qrImg, qrConfig.x * scale, qrConfig.y * scale, qrConfig.w * scale, qrConfig.h * scale);
    };
    qrImg.onerror = () => {
      ctx.fillStyle = '#f3f3f3';
      ctx.fillRect(qrConfig.x * scale, qrConfig.y * scale, qrConfig.w * scale, qrConfig.h * scale);
      ctx.fillStyle = '#000';
      ctx.font = '12px Poppins';
      ctx.fillText('QR', qrConfig.x * scale + 10, qrConfig.y * scale + 20);
    };
    qrImg.src = getQrUrl({ dui: '01234567-8', codigo: 'EMP-001' }, document.getElementById('campoQrSelect')?.value || 'dui');
  }

  function generarTarjetaDataURL(empleado, campo) {
    return new Promise((resolve, reject) => {
      if (!plantillaImg) return reject('No hay plantilla cargada.');
      const c = document.createElement('canvas');
      const cx = c.getContext('2d');
      c.width = 1200; c.height = 1800;

      cx.drawImage(plantillaImg, 0, 0, 1200, 1800);

      const qrUrl = getQrUrl(empleado, campo);
      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';
      qrImg.onload = () => {
        const sx = 1200 / plantillaImg.width;
        const sy = 1800 / plantillaImg.height;
        cx.shadowColor = 'rgba(0,0,0,0.3)';
        cx.shadowBlur = 15;
        cx.drawImage(qrImg, qrConfig.x * sx, qrConfig.y * sy, qrConfig.w * sx, qrConfig.h * sy);
        resolve(c.toDataURL('image/png'));
      };
      qrImg.onerror = reject;
      qrImg.src = qrUrl;
    });
  }

  async function descargarIndividual(empleado) {
    const campo = document.getElementById('campoQrSelect')?.value || 'dui';
    try {
      const dataUrl = await generarTarjetaDataURL(empleado, campo);
      const a = document.createElement('a');
      a.download = `tarjeta-${empleado.codigo || empleado.dui}.png`;
      a.href = dataUrl;
      a.click();
    } catch (e) {
      alert('Error al generar tarjeta: ' + e.message);
    }
  }

  async function descargarZIP(empleados) {
    if (typeof JSZip === 'undefined') {
      alert('JSZip no está cargado.');
      return;
    }
    const zip = new JSZip();
    const folder = zip.folder('tarjetas-invitacion');
    const campo = document.getElementById('campoQrSelect')?.value || 'dui';
    const max = Math.min(empleados.length, 50);
    for (let i = 0; i < max; i++) {
      try {
        const dataUrl = await generarTarjetaDataURL(empleados[i], campo);
        folder.file(`tarjeta-${empleados[i].codigo || empleados[i].dui}.png`, dataUrl.split(',')[1], { base64: true });
      } catch (e) {
        console.error('Error en tarjeta', empleados[i], e);
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tarjetas-invitacion-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function descargarIndividual(empleado, campo) {
    try {
      const dataUrl = await generarTarjetaDataURL(empleado, campo);
      const a = document.createElement('a');
      a.download = `tarjeta-${empleado.codigo || empleado.dui}.png`;
      a.href = dataUrl;
      a.click();
      return true;
    } catch (e) {
      alert('Error al generar tarjeta: ' + e.message);
      return false;
    }
  }

  // Assign real implementations to the early-exposed object
  Object.assign(window.TarjetasApp, {
    init, cargarPlantilla, aplicarZona, renderizarPreview,
    descargarIndividual, descargarZIP, getQrUrl, generarTarjetaDataURL
  });
})();
