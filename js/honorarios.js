/* =====================================================
   Honorarios — refuerzo visual de estado de pago
   Dashboard | IM Servicios Contables

   No modifica honorarios.js: solo observa el DOM (los KPIs
   #kpiPorCobrar y #kpiClientesAdeudo que honorarios.js ya
   calcula y pinta) y agrega una capa visual encima.
   No toca Supabase ni la lógica de carga de datos.

   Se muestra cada vez que se entra a la página (sin
   sessionStorage), tal como fue solicitado.
   ===================================================== */

(function () {
  'use strict';

  var DURACION_CELEBRACION_MS = 3400;
  var DURACION_RECORDATORIO_MS = 2800;

  var reducidoMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var esMovil = window.innerWidth < 640;
  var yaEvaluado = false; // evita disparar dos veces si el observer detecta varios cambios

  // ---------- Utilidades ----------

  function parsearMontoMXN(texto) {
    // "$1,234.56" -> 1234.56 ; soporta también "$0.00"
    if (typeof texto !== 'string') return NaN;
    var limpio = texto.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
    var valor = parseFloat(limpio);
    return Number.isNaN(valor) ? NaN : valor;
  }

  function crearOverlayBase(id, claseExtra) {
    var existente = document.getElementById(id);
    if (existente) existente.remove();
    var overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'hn-overlay ' + (claseExtra || '');
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    document.body.appendChild(overlay);
    return overlay;
  }

  function cerrarOverlay(overlay, despuesMs) {
    setTimeout(function () {
      overlay.classList.add('hn-oculto');
      setTimeout(function () { overlay.remove(); }, reducidoMovimiento ? 0 : 450);
    }, despuesMs);
  }

  // ---------- Confeti de celebración ----------

  function lanzarConfeti(contenedor) {
    if (reducidoMovimiento) return;
    var colores = ['#22C55E', '#15803D', '#ffffff', '#5CC8F2'];
    var total = esMovil ? 36 : 70;
    for (var i = 0; i < total; i++) {
      var pieza = document.createElement('span');
      pieza.className = 'hn-confeti-pieza';
      pieza.style.left = (Math.random() * 100) + '%';
      pieza.style.background = colores[i % colores.length];
      pieza.style.animationDuration = (1.7 + Math.random() * 1.3) + 's';
      pieza.style.animationDelay = (Math.random() * 0.5) + 's';
      contenedor.appendChild(pieza);
    }
  }

  // ---------- Caso positivo: 100% pagado ----------

  function mostrarCelebracion() {
    var overlay = crearOverlayBase('hnOverlayExito', 'hn-overlay-exito');

    overlay.innerHTML =
      '<div class="hn-confeti-capa" id="hnConfetiCapa"></div>' +
      '<div class="hn-tarjeta hn-tarjeta-exito">' +
        '<div class="hn-icono-circulo hn-icono-exito">✅</div>' +
        '<h3 class="hn-titulo">¡Estás al día!</h3>' +
        '<p class="hn-texto">No tienes honorarios pendientes de pago.</p>' +
        '<p class="hn-subtexto">Gracias por tu puntualidad.</p>' +
      '</div>';

    lanzarConfeti(document.getElementById('hnConfetiCapa'));
    cerrarOverlay(overlay, reducidoMovimiento ? 0 : DURACION_CELEBRACION_MS);
  }

  // ---------- Caso con adeudo: recordatorio ----------

  function mostrarRecordatorio(montoPendiente, clientesConAdeudo) {
    var overlay = crearOverlayBase('hnOverlayAviso', 'hn-overlay-aviso');

    var textoClientes = '';
    if (clientesConAdeudo === 1) {
      textoClientes = 'Tienes 1 cliente con adeudo pendiente.';
    } else if (clientesConAdeudo > 1) {
      textoClientes = 'Tienes ' + clientesConAdeudo + ' clientes con adeudo pendiente.';
    }

    overlay.innerHTML =
      '<div class="hn-tarjeta hn-tarjeta-aviso">' +
        '<div class="hn-icono-circulo hn-icono-aviso">⏰</div>' +
        '<h3 class="hn-titulo">Tienes un saldo pendiente</h3>' +
        '<p class="hn-monto">' + montoPendiente + '</p>' +
        (textoClientes ? '<p class="hn-subtexto">' + textoClientes + '</p>' : '') +
      '</div>';

    cerrarOverlay(overlay, reducidoMovimiento ? 0 : DURACION_RECORDATORIO_MS);
  }

  // ---------- Evaluación del estado ----------

  function evaluarEstado() {
    if (yaEvaluado) return;

    var kpiPorCobrarEl = document.getElementById('kpiPorCobrar');
    var kpiClientesAdeudoEl = document.getElementById('kpiClientesAdeudo');
    if (!kpiPorCobrarEl) return;

    var textoMonto = kpiPorCobrarEl.textContent.trim();
    var monto = parsearMontoMXN(textoMonto);

    // Mientras honorarios.js no haya pintado el valor real, el KPI
    // sigue en "0" (su valor inicial en el HTML) o vacío: esperamos
    // a que el contenido visible ya esté desplegado para no disparar
    // la animación antes de tiempo.
    var contenidoEl = document.getElementById('contenidoHonorarios');
    if (!contenidoEl || contenidoEl.style.display === 'none') return;

    if (Number.isNaN(monto)) return;

    yaEvaluado = true;

    var clientesAdeudo = 0;
    if (kpiClientesAdeudoEl) {
      clientesAdeudo = parseInt(kpiClientesAdeudoEl.textContent.trim(), 10) || 0;
    }

    if (monto <= 0) {
      mostrarCelebracion();
    } else {
      mostrarRecordatorio(textoMonto, clientesAdeudo);
    }
  }

  // ---------- Arranque: observar hasta que honorarios.js pinte los KPIs ----------

  function iniciar() {
    var contenidoEl = document.getElementById('contenidoHonorarios');
    var estadoCargaEl = document.getElementById('estadoCarga');
    if (!contenidoEl) return;

    // Si ya está visible al cargar este script (carga muy rápida), evalúa directo.
    if (contenidoEl.style.display !== 'none') {
      evaluarEstado();
      return;
    }

    // Observa el atributo "style" de #contenidoHonorarios (cuando
    // honorarios.js hace contenidoEl.style.display = 'block') y de
    // #estadoCarga (cuando se oculta), ambos ya usados por la lógica
    // existente para indicar "datos listos".
    var observador = new MutationObserver(function () {
      if (contenidoEl.style.display !== 'none') {
        observador.disconnect();
        // pequeño margen para asegurar que calcularKpis() ya corrió
        setTimeout(evaluarEstado, 50);
      }
    });

    observador.observe(contenidoEl, { attributes: true, attributeFilter: ['style'] });
    if (estadoCargaEl) {
      observador.observe(estadoCargaEl, { attributes: true, attributeFilter: ['style'] });
    }

    // Margen de seguridad por si la carga falla silenciosamente o
    // tarda demasiado: dejamos de esperar tras 8s sin disparar nada.
    setTimeout(function () { observador.disconnect(); }, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
