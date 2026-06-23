/* =====================================================
   Bienvenida — experiencia premium de inicio de sesión
   Dashboard | IM Servicios Contables

   No modifica dashboard.js: solo observa el DOM (ej. el
   span#nombreUsuario que dashboard.js ya llena) y agrega
   una capa visual encima. No toca Supabase ni IDs propios
   de la lógica del dashboard.
   ===================================================== */

(function () {
  'use strict';

  // ===== Configuración =====
  var UMBRAL_HORAS_INACTIVIDAD = 4; // horas sin actividad = se trata como nuevo ingreso
  var CLAVE_SESION = 'bv_sesion_activa';
  var CLAVE_ULTIMA_ACTIVIDAD = 'bv_ultima_actividad';
  var CLAVE_CONFETI = 'bv_confeti_mostrado';
  var DURACION_OVERLAY_MS = 3200;

  var FRASES_TARJETA = [
    'Tu información está actualizada.',
    'Estamos listos para ayudarte.',
    'La tranquilidad financiera comienza aquí.',
    'Gracias por confiar en IM Servicios Contables.'
  ];

  var reducidoMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var esMovil = window.innerWidth < 640;

  // ---------- Decisión: ¿mostrar bienvenida? ----------

  function debeMostrarBienvenida() {
    var sesionActiva = sessionStorage.getItem(CLAVE_SESION);
    var ultima = Number(localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD) || 0);
    var horasInactivo = (Date.now() - ultima) / 3600000;
    return !sesionActiva || horasInactivo > UMBRAL_HORAS_INACTIVIDAD;
  }

  function registrarActividad() {
    sessionStorage.setItem(CLAVE_SESION, '1');
    localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(Date.now()));
  }

  // Refresca el timestamp mientras la pestaña esté visible, para
  // detectar "sesión restaurada después de varias horas" aunque la
  // pestaña nunca se haya cerrado.
  setInterval(function () {
    if (document.visibilityState === 'visible') {
      localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(Date.now()));
    }
  }, 60000);

  // ---------- Saludo dinámico según la hora ----------

  function datosSaludoPorHora() {
    var h = new Date().getHours();
    if (h >= 5 && h < 12) {
      return { icono: '☀️', titulo: 'Buenos días', frase: 'Esperamos que tengas un excelente día.' };
    }
    if (h >= 12 && h < 19) {
      return { icono: '🌤', titulo: 'Buenas tardes', frase: 'Tu información financiera está lista.' };
    }
    return { icono: '🌙', titulo: 'Buenas noches', frase: 'Gracias por confiar en IM Servicios Contables.' };
  }

  // ---------- Animación de letras (fade up por carácter) ----------

  function animarLetras(contenedor, texto, delayBaseMs, pasoMs) {
    if (!contenedor) return;
    contenedor.innerHTML = '';
    if (reducidoMovimiento) {
      contenedor.textContent = texto;
      return;
    }
    Array.prototype.forEach.call(Array.from(texto), function (ch, i) {
      var span = document.createElement('span');
      span.className = 'bv-letra';
      span.textContent = ch === ' ' ? '\u00A0' : ch;
      span.style.animationDelay = (delayBaseMs + i * pasoMs) + 'ms';
      contenedor.appendChild(span);
    });
  }

  // ---------- Partículas (overlay y fondo del dashboard) ----------

  function crearParticulas(contenedor, cantidad) {
    if (!contenedor || reducidoMovimiento) return;
    var total = esMovil ? Math.ceil(cantidad / 2) : cantidad;
    for (var i = 0; i < total; i++) {
      var p = document.createElement('span');
      p.className = 'bv-particula';
      p.style.left = (Math.random() * 100) + '%';
      p.style.setProperty('--bv-drift', (Math.random() * 60 - 30) + 'px');
      p.style.animationDuration = (6 + Math.random() * 6) + 's';
      p.style.animationDelay = (Math.random() * 4) + 's';
      contenedor.appendChild(p);
    }
  }

  function crearLineasFondo(contenedor, cantidad) {
    if (!contenedor || reducidoMovimiento) return;
    for (var i = 0; i < cantidad; i++) {
      var l = document.createElement('span');
      l.className = 'bv-linea';
      l.style.left = (12 + i * (76 / Math.max(cantidad - 1, 1))) + '%';
      contenedor.appendChild(l);
    }
  }

  // ---------- Confeti (solo primer acceso) ----------

  function lanzarConfeti() {
    if (reducidoMovimiento) return;
    var contenedor = document.getElementById('bvConfeti');
    if (!contenedor) return;
    var colores = ['#5CC8F2', '#2C6E85', '#ffffff'];
    var total = esMovil ? 30 : 60;
    for (var i = 0; i < total; i++) {
      var pieza = document.createElement('span');
      pieza.className = 'bv-confeti-pieza';
      pieza.style.left = (Math.random() * 100) + '%';
      pieza.style.background = colores[i % colores.length];
      pieza.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
      pieza.style.animationDelay = (Math.random() * 0.4) + 's';
      contenedor.appendChild(pieza);
    }
    setTimeout(function () { contenedor.innerHTML = ''; }, 2400);
  }

  // ---------- Revelado escalonado del dashboard ----------

  function elementosARevelar() {
    var selectores = [
      '.dashboard-header',
      '.resumen-panel',
      '.pendientes-grid',
      '.seccion-encabezado',
      '.kpi-grid',
      '.filtros-card',
      '.tabla-card',
      '.heatmap-card',
      '.clientes-grid'
    ];
    var vistos = [];
    selectores.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (vistos.indexOf(el) === -1) vistos.push(el);
      });
    });
    return vistos;
  }

  function revelarDashboardEscalonado() {
    elementosARevelar().forEach(function (el, i) {
      el.setAttribute('data-bv-reveal', '');
      setTimeout(function () { el.classList.add('bv-visible'); }, 80 + i * 110);
    });
  }

  function mostrarInstantaneo() {
    // Para navegaciones normales dentro de la misma sesión: sin
    // animación, para no interferir con la productividad del usuario.
    elementosARevelar().forEach(function (el) {
      el.setAttribute('data-bv-reveal', '');
      el.classList.add('bv-visible');
    });
  }

  // ---------- Nombre del cliente (sin tocar dashboard.js) ----------

  function obtenerNombreCliente(callback) {
    var span = document.getElementById('nombreUsuario');
    if (!span) { callback('cliente'); return; }

    var actual = span.textContent.trim();
    if (actual && actual !== 'Cargando...') { callback(actual); return; }

    var observador = new MutationObserver(function () {
      var texto = span.textContent.trim();
      if (texto && texto !== 'Cargando...') {
        observador.disconnect();
        callback(texto);
      }
    });
    observador.observe(span, { childList: true, characterData: true, subtree: true });

    setTimeout(function () {
      observador.disconnect();
      var texto = span.textContent.trim();
      callback(texto && texto !== 'Cargando...' ? texto : 'cliente');
    }, 4000);
  }

  // ---------- Tarjeta de bienvenida ----------

  function pintarTarjetaBienvenida(nombre) {
    var tarjeta = document.getElementById('bvTarjeta');
    if (!tarjeta) return;

    var datos = datosSaludoPorHora();
    var saludoEl = tarjeta.querySelector('.bv-tarjeta-saludo');
    var fechaEl = tarjeta.querySelector('.bv-tarjeta-fecha');
    var fraseEl = tarjeta.querySelector('.bv-tarjeta-frase');

    if (saludoEl) saludoEl.textContent = '👋 ' + datos.titulo + ', ' + nombre;

    if (fechaEl) {
      var ahora = new Date();
      var fecha = ahora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
      var hora = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      fechaEl.textContent = fecha + ' · ' + hora;
    }

    if (fraseEl) {
      var i = 0;
      fraseEl.textContent = FRASES_TARJETA[0];
      setInterval(function () {
        i = (i + 1) % FRASES_TARJETA.length;
        fraseEl.style.opacity = 0;
        setTimeout(function () {
          fraseEl.textContent = FRASES_TARJETA[i];
          fraseEl.style.opacity = 1;
        }, 350);
      }, 6000);
    }
  }

  // ---------- Parallax sutil del fondo (requestAnimationFrame) ----------

  function activarParallaxFondo() {
    var fondo = document.getElementById('bvFondoDashboard');
    if (!fondo || reducidoMovimiento) return;
    if (!window.matchMedia('(pointer: fine)').matches) return; // evita costo en táctil

    var tx = 0, ty = 0, rafId = null;
    function actualizar() {
      fondo.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0)';
      rafId = null;
    }
    window.addEventListener('mousemove', function (e) {
      tx = (e.clientX / window.innerWidth - 0.5) * 10;
      ty = (e.clientY / window.innerHeight - 0.5) * 8;
      if (!rafId) rafId = requestAnimationFrame(actualizar);
    }, { passive: true });
  }

  // ---------- Cierre del overlay ----------

  function ocultarOverlay() {
    var overlay = document.getElementById('bvOverlay');
    if (!overlay) { revelarDashboardEscalonado(); return; }

    overlay.classList.add('bv-oculto');
    setTimeout(function () {
      overlay.remove();
      revelarDashboardEscalonado();
      if (!localStorage.getItem(CLAVE_CONFETI)) {
        lanzarConfeti();
        localStorage.setItem(CLAVE_CONFETI, '1');
      }
    }, reducidoMovimiento ? 0 : 500);
  }

  // ---------- Arranque ----------

  function iniciar() {
    var fondo = document.getElementById('bvFondoDashboard');
    if (fondo) {
      crearParticulas(fondo, 12);
      crearLineasFondo(fondo, 4);
    }
    activarParallaxFondo();

    if (!debeMostrarBienvenida()) {
      var overlay = document.getElementById('bvOverlay');
      if (overlay) overlay.remove();
      mostrarInstantaneo();
      registrarActividad();
      obtenerNombreCliente(pintarTarjetaBienvenida);
      return;
    }

    registrarActividad();

    var particulasOverlay = document.querySelector('#bvOverlay .bv-particulas');
    crearParticulas(particulasOverlay, 22);

    obtenerNombreCliente(function (nombre) {
      var datos = datosSaludoPorHora();
      var iconoEl = document.getElementById('bvIcono');
      var textoEl = document.getElementById('bvSaludoTexto');
      var fraseEl = document.getElementById('bvFraseHora');

      if (iconoEl) iconoEl.textContent = datos.icono;
      animarLetras(textoEl, datos.titulo + ', ' + nombre, 520, 16);
      if (fraseEl) fraseEl.textContent = datos.frase;

      pintarTarjetaBienvenida(nombre);
    });

    setTimeout(ocultarOverlay, reducidoMovimiento ? 0 : DURACION_OVERLAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
