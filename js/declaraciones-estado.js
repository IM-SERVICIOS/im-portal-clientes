/* =====================================================
   Declaraciones — refuerzo visual de cumplimiento
   Dashboard | IM Servicios Contables

   No modifica declaraciones.js: solo observa el DOM
   (#badgeCumplimiento, que renderHeatmap() ya calcula y
   pinta) y agrega una capa visual encima. No toca Supabase
   ni la lógica de carga de datos.

   Solo aplica en modo cliente específico (?cliente_id=...
   en la URL), porque es ahí donde existe un % de
   cumplimiento individual con sentido de "felicitación".
   En modo general (lista de todos los clientes) no se
   muestra nada.

   Se dispara cada vez que se entra a ver el detalle de un
   cliente (sin sessionStorage), igual que en honorarios.
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

  function mostrarCelebracion() {
    var overlay = crearOverlayBase('dcOverlayExito', 'dc-overlay-exito');

    overlay.innerHTML =
      '<div class="dc-confeti-capa" id="dcConfetiCapa"></div>' +
      '<div class="dc-tarjeta dc-tarjeta-exito">' +
        '<div class="dc-icono-circulo dc-icono-exito">🎉</div>' +
        '<h3 class="dc-titulo">¡100% de cumplimiento!</h3>' +
        '<p class="dc-texto">Todas tus declaraciones están presentadas.</p>' +
        '<p class="dc-subtexto">Excelente manejo de tus obligaciones fiscales.</p>' +
      '</div>';

    lanzarConfeti(document.getElementById('dcConfetiCapa'));
    cerrarOverlay(overlay, reducidoMovimiento ? 0 : DURACION_CELEBRACION_MS);
  }

  // ---------- Caso parcial ----------

  function mostrarProgreso(porcentaje) {
    var overlay = crearOverlayBase('dcOverlayProgreso', 'dc-overlay-progreso');

    overlay.innerHTML =
      '<div class="dc-tarjeta dc-tarjeta-progreso">' +
        '<div class="dc-icono-circulo dc-icono-progreso">📋</div>' +
        '<h3 class="dc-titulo">Cumplimiento actual</h3>' +
        '<p class="dc-porcentaje">' + porcentaje + '%</p>' +
        '<div class="dc-barra-fondo"><div class="dc-barra-relleno" style="width:' + porcentaje + '%"></div></div>' +
        '<p class="dc-subtexto">Estamos trabajando en tu próxima declaración.</p>' +
      '</div>';

    cerrarOverlay(overlay, reducidoMovimiento ? 0 : DURACION_PROGRESO_MS);
  }

  // ---------- Evaluación del estado ----------

  function evaluarEstado() {
    if (yaEvaluado) return;
    if (!estaEnModoCliente()) return;

    var badge = document.getElementById('badgeCumplimiento');
    if (!badge) return;
    if (badge.style.display === 'none' || badge.style.display === '') return;

    var texto = badge.textContent.trim();
    if (!texto) return;

    // "Sin declaraciones registradas" no trae número: caso neutro,
    // no mostramos animación para no decir "0%, felicidades" ni
    // inventar un progreso que no existe.
    var match = texto.match(/(\d+)%/);
    if (!match) { yaEvaluado = true; return; }

    yaEvaluado = true;
    var porcentaje = parseInt(match[1], 10);

    if (porcentaje >= 100) {
      mostrarCelebracion();
    } else {
      mostrarProgreso(porcentaje);
    }
  }

  // ---------- Arranque ----------

  function iniciar() {
    if (!estaEnModoCliente()) return;

    var badge = document.getElementById('badgeCumplimiento');
    if (!badge) return;

    if (badge.style.display !== 'none' && badge.style.display !== '') {
      evaluarEstado();
      return;
    }

    var observador = new MutationObserver(function () {
      if (badge.style.display !== 'none' && badge.style.display !== '') {
        observador.disconnect();
        setTimeout(evaluarEstado, 50);
      }
    });

    observador.observe(badge, { attributes: true, attributeFilter: ['style'] });

    setTimeout(function () { observador.disconnect(); }, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
