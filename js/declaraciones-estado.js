/* =====================================================
   Declaraciones — refuerzo visual de cumplimiento
   Dashboard | IM Servicios Contables

   No modifica declaraciones.js: solo observa el DOM
   (#badgeCumplimiento en modo cliente, #kpiCumplimientoGeneral
   en modo general — ambos ya calculados y pintados por
   declaraciones.js) y agrega una capa visual encima. No toca
   Supabase ni la lógica de carga de datos.

   - Modo cliente específico (?cliente_id=... en la URL):
     % individual de ese cliente -> felicitación personal.
   - Modo general (menú lateral "Declaraciones", sin
     cliente_id): % PROMEDIO de todos los clientes permitidos
     del usuario (admin o cliente con varias cuentas) -> mismo
     tipo de refuerzo, a nivel cartera.

   Se dispara cada vez que se entra a la página, en cualquiera
   de los dos modos (sin sessionStorage), igual que en
   honorarios.
   ===================================================== */

(function () {
  'use strict';

  var DURACION_CELEBRACION_MS = 3400;
  var DURACION_PROGRESO_MS = 3000;

  var reducidoMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var esMovil = window.innerWidth < 640;
  var yaEvaluado = false;

  function estaEnModoCliente() {
    return !!new URLSearchParams(window.location.search).get('cliente_id');
  }

  // ---------- Overlay base ----------

  function crearOverlayBase(id, claseExtra) {
    var existente = document.getElementById(id);
    if (existente) existente.remove();
    var overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'dc-overlay ' + (claseExtra || '');
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    document.body.appendChild(overlay);
    return overlay;
  }

  function cerrarOverlay(overlay, despuesMs) {
    setTimeout(function () {
      overlay.classList.add('dc-oculto');
      setTimeout(function () { overlay.remove(); }, reducidoMovimiento ? 0 : 450);
    }, despuesMs);
  }

  // ---------- Confeti (solo 100%) ----------

  function lanzarConfeti(contenedor) {
    if (reducidoMovimiento) return;
    var colores = ['#1aab6b', '#5fd39a', '#ffffff', '#5CC8F2'];
    var total = esMovil ? 36 : 70;
    for (var i = 0; i < total; i++) {
      var pieza = document.createElement('span');
      pieza.className = 'dc-confeti-pieza';
      pieza.style.left = (Math.random() * 100) + '%';
      pieza.style.background = colores[i % colores.length];
      pieza.style.animationDuration = (1.7 + Math.random() * 1.3) + 's';
      pieza.style.animationDelay = (Math.random() * 0.5) + 's';
      contenedor.appendChild(pieza);
    }
  }

  // ---------- Caso 100% ----------

  function mostrarCelebracion(modoGeneral) {
    var overlay = crearOverlayBase('dcOverlayExito', 'dc-overlay-exito');

    var texto = modoGeneral
      ? 'Todas las declaraciones de tus clientes están presentadas.'
      : 'Todas tus declaraciones están presentadas.';

    overlay.innerHTML =
      '<div class="dc-confeti-capa" id="dcConfetiCapa"></div>' +
      '<div class="dc-tarjeta dc-tarjeta-exito">' +
        '<div class="dc-icono-circulo dc-icono-exito">🎉</div>' +
        '<h3 class="dc-titulo">¡100% de cumplimiento!</h3>' +
        '<p class="dc-texto">' + texto + '</p>' +
        '<p class="dc-subtexto">Excelente manejo de las obligaciones fiscales.</p>' +
      '</div>';

    lanzarConfeti(document.getElementById('dcConfetiCapa'));
    cerrarOverlay(overlay, reducidoMovimiento ? 0 : DURACION_CELEBRACION_MS);
  }

  // ---------- Caso parcial ----------

  function mostrarProgreso(porcentaje, modoGeneral) {
    var overlay = crearOverlayBase('dcOverlayProgreso', 'dc-overlay-progreso');

    var titulo = modoGeneral ? 'Cumplimiento general' : 'Cumplimiento actual';
    var subtexto = modoGeneral
      ? 'Estamos trabajando en las próximas declaraciones pendientes.'
      : 'Estamos trabajando en tu próxima declaración.';

    overlay.innerHTML =
      '<div class="dc-tarjeta dc-tarjeta-progreso">' +
        '<div class="dc-icono-circulo dc-icono-progreso">📋</div>' +
        '<h3 class="dc-titulo">' + titulo + '</h3>' +
        '<p class="dc-porcentaje">' + porcentaje + '%</p>' +
        '<div class="dc-barra-fondo"><div class="dc-barra-relleno" style="width:' + porcentaje + '%"></div></div>' +
        '<p class="dc-subtexto">' + subtexto + '</p>' +
      '</div>';

    cerrarOverlay(overlay, reducidoMovimiento ? 0 : DURACION_PROGRESO_MS);
  }

  // ---------- Lectura del porcentaje según el modo ----------

  function leerPorcentajeModoCliente() {
    var badge = document.getElementById('badgeCumplimiento');
    if (!badge) return null;
    if (badge.style.display === 'none' || badge.style.display === '') return null;

    var texto = badge.textContent.trim();
    if (!texto) return null;

    // "Sin declaraciones registradas" no trae número: caso neutro.
    var match = texto.match(/(\d+)%/);
    if (!match) return -1; // -1 = "ya se sabe el estado, pero es neutro: no animar"
    return parseInt(match[1], 10);
  }

  function leerPorcentajeModoGeneral() {
    var modoGeneralEl = document.getElementById('modoGeneral');
    var kpiEl = document.getElementById('kpiCumplimientoGeneral');
    var kpiTotalEl = document.getElementById('kpiTotalDeclaraciones');
    if (!modoGeneralEl || !kpiEl || !kpiTotalEl) return null;
    if (modoGeneralEl.style.display === 'none' || modoGeneralEl.style.display === '') return null;

    var textoTotal = kpiTotalEl.textContent.trim();
    var textoCumplimiento = kpiEl.textContent.trim();

    // Mientras no haya signo "%" en el KPI de cumplimiento, los datos
    // reales todavía no se pintaron (calcularKpisGenerales no ha
    // corrido todavía, aunque #modoGeneral ya esté visible).
    var match = textoCumplimiento.match(/(\d+)%/);
    if (!match) return null;

    var total = parseInt(textoTotal, 10);
    // Cero clientes asignados o cero declaraciones en toda la cartera:
    // caso neutro real (ya confirmado, porque el "%" ya se pintó).
    if (!Number.isNaN(total) && total === 0) return -1;

    return parseInt(match[1], 10);
  }

  // ---------- Evaluación del estado (con pequeño debounce) ----------

  var temporizadorDebounce = null;
  var observadorActivo = null;

  function evaluarEstado(modoGeneral) {
    if (yaEvaluado) return;

    // Debounce: cada vez que el DOM cambia, esperamos un breve
    // instante de "silencio" antes de leer, para no capturar un
    // estado intermedio a medio pintar.
    if (temporizadorDebounce) clearTimeout(temporizadorDebounce);
    temporizadorDebounce = setTimeout(function () {
      if (yaEvaluado) return;

      var porcentaje = modoGeneral ? leerPorcentajeModoGeneral() : leerPorcentajeModoCliente();
      if (porcentaje === null) return; // todavía no hay datos pintados; seguimos esperando

      yaEvaluado = true;
      if (observadorActivo) observadorActivo.disconnect();

      if (porcentaje < 0) return; // caso neutro: sin declaraciones registradas

      if (porcentaje >= 100) {
        mostrarCelebracion(modoGeneral);
      } else {
        mostrarProgreso(porcentaje, modoGeneral);
      }
    }, 120);
  }

  // ---------- Arranque ----------

  function iniciar() {
    var modoGeneral = !estaEnModoCliente();

    var elementoClave = modoGeneral
      ? document.getElementById('modoGeneral')
      : document.getElementById('badgeCumplimiento');

    if (!elementoClave) return;

    var observador = new MutationObserver(function () {
      evaluarEstado(modoGeneral);
    });
    observadorActivo = observador;

    observador.observe(elementoClave, { attributes: true, attributeFilter: ['style'] });

    // En modo general, el KPI se pinta como texto dentro de un nodo
    // que ya estaba visible desde antes en algunos casos (ej. clientes
    // sin declaraciones): observamos también su propio contenido.
    if (modoGeneral) {
      var kpiEl = document.getElementById('kpiCumplimientoGeneral');
      if (kpiEl) {
        observador.observe(kpiEl, { characterData: true, childList: true, subtree: true });
      }
    }

    // Si el contenido ya estaba visible/pintado al cargar este script
    // (carga muy rápida), evaluamos directo también, por si no llega
    // a dispararse ninguna mutación adicional.
    if (elementoClave.style.display !== 'none' && elementoClave.style.display !== '') {
      evaluarEstado(modoGeneral);
    }

    setTimeout(function () { observador.disconnect(); }, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
