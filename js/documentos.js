// =====================================================
// Documentos - Portal de Clientes IM Servicios Contables
// =====================================================
// COLUMNAS REALES DE LA TABLA "documentos":
//   id               → PK (bigint)
//   cliente_id       → FK a clientes (bigint)
//   tipo_documento   → tipo de archivo (varchar)
//   nombre_archivo   → nombre visible (varchar)
//   url_archivo      → RUTA dentro del bucket (NO una URL completa)
//   categoria        → id de categoría (ej. 'presupuestos', 'acuses')
//   subcategoria, nombre, fecha, tipo, estatus, observaciones,
//   subido_por, linea_captura, importe, servicio, vigencia,
//   responsable, metodo_pago, referencia, monto, impuesto
//
// BUCKET PRIVADO: url_archivo guarda la RUTA del archivo dentro
// del bucket "documentos" (ej. "1/presupuestos/123-archivo.pdf"),
// NO una URL pública. Se genera una URL firmada (1 hora) en tiempo
// real cada vez que se abre la vista previa o se descarga, para que
// los documentos fiscales nunca queden expuestos con un link público
// permanente.
// =====================================================

const BUCKET_DOCUMENTOS = 'documentos';
const SIGNED_URL_EXPIRY = 3600; // segundos (1 hora)

// ---- DOM: encabezado / sesión ----
const nombreUsuarioEl       = document.getElementById('nombreUsuario');
const rolUsuarioEl          = document.getElementById('rolUsuario');
const avatarUsuarioEl       = document.getElementById('avatarUsuario');
const dashboardShellEl      = document.getElementById('dashboardShell');
const sidebarOverlayEl      = document.getElementById('sidebarOverlay');
const btnMenuMovilEl        = document.getElementById('btnMenuMovil');

// ---- DOM: barra de herramientas ----
const selectorClienteEl     = document.getElementById('selectorCliente');
const buscadorEl            = document.getElementById('buscadorDocumentos');
const filtroAnioEl          = document.getElementById('filtroAnio');
const filtroTipoEl          = document.getElementById('filtroTipo');
const ordenarFechaEl        = document.getElementById('ordenarFecha');
const filtroRecientesEl     = document.getElementById('filtroRecientes');
const contadorResultadosEl  = document.getElementById('contadorResultados');
const btnDescargaMultipleEl = document.getElementById('btnDescargaMultiple');
const contadorSeleccionEl   = document.getElementById('contadorSeleccion');
const vistaTarjetasBtn      = document.getElementById('vistaTarjetas');
const vistaTablaBtn         = document.getElementById('vistaTabla');

// ---- DOM: categorías y panel ----
const categoriasRailEl          = document.getElementById('categoriasRail');
const categoriaTituloEl         = document.getElementById('categoriaTitulo');
const categoriaDescripcionEl    = document.getElementById('categoriaDescripcion');
const estadoCargaDocumentosEl   = document.getElementById('estadoCargaDocumentos');
const contenedorDocumentosEl    = document.getElementById('contenedorDocumentos');

// ---- DOM: historial y modal ----
const historialListaEl  = document.getElementById('historialArchivos');
const modalEl           = document.getElementById('modalVistaPrevia');
const modalTituloEl     = document.getElementById('modalTitulo');
const modalSubtituloEl  = document.getElementById('modalSubtitulo');
const modalIframeEl     = document.getElementById('modalIframe');
const modalDescargarEl  = document.getElementById('modalDescargar');
const modalCerrarEl     = document.getElementById('modalCerrar');

// =====================================================
// Catálogo de categorías
// =====================================================
const CATEGORIAS = [
  { id: 'acuses',              nombre: 'Acuses y líneas de captura',          icono: '🧾', descripcion: 'Organizados por mes de presentación.',         agrupa: 'mes'    },
  { id: 'presupuestos',        nombre: 'Presupuestos',                         icono: '💰', descripcion: 'Cotizaciones enviadas para tu operación.'                       },
  { id: 'opinion',             nombre: 'Opinión de cumplimiento',              icono: '✅', descripcion: 'Constancia de opinión positiva ante el SAT.'                    },
  { id: 'detalle_opinion',     nombre: 'Detalle de opinión de cumplimiento',   icono: '📋', descripcion: 'Soporte y observaciones de cada opinión.'                       },
  { id: 'tramites',            nombre: 'Documentos de trámites',               icono: '🗂️', descripcion: 'Altas, renovaciones y trámites administrativos.'               },
  { id: 'acuerdo',             nombre: 'Acuerdo de servicio',                  icono: '🤝', descripcion: 'Contrato vigente con IM Servicios Contables.'                   },
  { id: 'remisiones',          nombre: 'Remisiones semanales',                 icono: '📦', descripcion: 'Organizadas por semana del mes.',               agrupa: 'semana' },
  { id: 'pagos_im',            nombre: 'Pagos a IM Servicios Contables',       icono: '💳', descripcion: 'Honorarios pagados por el cliente.'                             },
  { id: 'pagos_declaraciones', nombre: 'Pagos con saldo a cargo',              icono: '🧮', descripcion: 'Impuestos pagados derivados de declaraciones.', agrupa: 'mes'   },
];

const ORDEN_MESES   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const ORDEN_SEMANAS = ['Semana 1','Semana 2','Semana 3','Semana 4'];

// =====================================================
// Estado de la página
// =====================================================
const estado = {
  clientes: [],
  clienteId: null,
  documentos: [],
  categoriaActiva: 'acuses',
  vista: localStorage.getItem('imc_vista_documentos') === 'tabla' ? 'tabla' : 'tarjetas',
  seleccion: new Set(),
};

// =====================================================
// Utilidades
// =====================================================
function formatearMoneda(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
}
function formatearFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}
function esReciente(iso) {
  if (!iso) return false;
  const diff = (Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000;
  return diff >= 0 && diff <= 7;
}
function esAdmin(rol) {
  if (typeof rol !== 'string') return false;
  const r = rol.trim().toLowerCase();
  return r.startsWith('admin') || r === 'supervisor' || r === 'staff' || r === 'contador';
}
function generarIniciales(correo) {
  if (!correo || !correo.includes('@')) return '··';
  const partes = correo.split('@')[0].split(/[.\-_]+/).filter(Boolean);
  return partes.length >= 2 ? (partes[0][0] + partes[1][0]).toUpperCase() : correo.slice(0, 2).toUpperCase();
}
function badgeEstatus(texto) {
  if (!texto) return '<span class="badge badge-gris">Sin estatus</span>';
  const n = texto.toLowerCase();
  let c = 'badge-gris';
  if (n.includes('vigente') || n.includes('pagad') || n.includes('activ') || n.includes('present') || n.includes('positiv') || n.includes('concluido') || n.includes('entregad') || n.includes('aprobad')) c = 'badge-verde';
  else if (n.includes('pend') || n.includes('proceso')) c = 'badge-ambar';
  else if (n.includes('venc') || n.includes('cancel') || n.includes('rechaz')) c = 'badge-rojo';
  return `<span class="badge ${c}">${texto}</span>`;
}
function escaparHtml(t) {
  const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML;
}
function mostrarToast(texto) {
  const t = document.createElement('div');
  t.textContent = texto;
  t.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#0D3327;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 8px 22px rgba(0,0,0,.22);z-index:200;';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// =====================================================
// NORMALIZACIÓN DE FILAS
// =====================================================
function normalizarFila(fila) {
  return {
    id:           fila.id,
    cliente_id:   fila.cliente_id,
    categoria:    fila.categoria      ?? fila.tipo_documento ?? null,
    nombre:       fila.nombre_archivo ?? fila.nombre         ?? null,
    url_archivo:  fila.url_archivo    ?? null,
    tipo:         fila.tipo_documento ?? fila.tipo           ?? 'PDF',
    subcategoria:  fila.subcategoria  ?? null,
    fecha:         fila.fecha         ?? null,
    estatus:       fila.estatus       ?? null,
    observaciones: fila.observaciones ?? null,
    subido_por:    fila.subido_por    ?? null,
    linea_captura: fila.linea_captura ?? null,
    importe:       fila.importe       ?? null,
    servicio:      fila.servicio      ?? null,
    vigencia:      fila.vigencia      ?? null,
    responsable:   fila.responsable   ?? null,
    metodo_pago:   fila.metodo_pago   ?? null,
    referencia:    fila.referencia    ?? null,
    monto:         fila.monto         ?? null,
    impuesto:      fila.impuesto      ?? null,
  };
}

// =====================================================
// URL firmada — bucket PRIVADO
// "ruta" debe ser la ruta relativa dentro del bucket
// (ej. "1/presupuestos/123-archivo.pdf"), no una URL completa.
// =====================================================
async function obtenerUrlFirmada(ruta) {
  if (!ruta || ruta === '#') return null;

  // Por si alguna fila vieja todavía tiene la URL pública completa
  // guardada en vez de solo la ruta, se extrae la parte útil.
  const marcador = `/object/public/${BUCKET_DOCUMENTOS}/`;
  if (ruta.includes(marcador)) {
    ruta = ruta.split(marcador)[1];
  }

  const { data, error } = await supabaseClient
    .storage
    .from(BUCKET_DOCUMENTOS)
    .createSignedUrl(ruta, SIGNED_URL_EXPIRY);

  if (error) { console.error('Error generando URL firmada:', error); return null; }
  return data.signedUrl;
}

// =====================================================
// Autenticación + clientes
// =====================================================
async function inicializar() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }

  const { data: usuario, error } = await supabaseClient
    .from('usuarios').select('id, email, rol')
    .eq('auth_user_id', session.user.id).single();

  if (error || !usuario) {
    estadoCargaDocumentosEl.style.display = 'none';
    contenedorDocumentosEl.innerHTML = '<p class="estado-vacio-docs">No se encontró tu cuenta. Contacta al administrador.</p>';
    return;
  }

  nombreUsuarioEl.textContent = usuario.email;
  rolUsuarioEl.textContent    = usuario.rol;
  if (avatarUsuarioEl) avatarUsuarioEl.textContent = generarIniciales(usuario.email);
  if (dashboardShellEl && esAdmin(usuario.rol)) dashboardShellEl.classList.add('es-admin');

  let clientes = [];

  if (esAdmin(usuario.rol)) {
    const { data } = await supabaseClient.from('clientes').select('id, nombre').eq('activo', true).order('nombre');
    clientes = data || [];
  } else {
    const { data } = await supabaseClient.from('vw_usuarios_clientes').select('cliente_id, cliente_nombre').eq('usuario_id', usuario.id);
    clientes = (data || []).filter(c => c.cliente_id).map(c => ({ id: c.cliente_id, nombre: c.cliente_nombre }));
  }

  estado.clientes = clientes;

  if (!clientes.length) {
    estadoCargaDocumentosEl.style.display = 'none';
    contenedorDocumentosEl.innerHTML = '<p class="estado-vacio-docs">No tienes clientes asignados todavía.</p>';
    return;
  }

  selectorClienteEl.innerHTML = clientes.map(c => `<option value="${c.id}">${escaparHtml(c.nombre)}</option>`).join('');

  const params = new URLSearchParams(window.location.search);
  const cidParam = params.get('cliente_id');
  const clienteInicial = clientes.some(c => String(c.id) === cidParam) ? cidParam : String(clientes[0].id);
  selectorClienteEl.value = clienteInicial;

  const catParam = params.get('categoria');
  if (CATEGORIAS.some(c => c.id === catParam)) estado.categoriaActiva = catParam;

  await cargarDocumentosDeCliente(clienteInicial);
}

// =====================================================
// Carga de documentos
// =====================================================
async function cargarDocumentosDeCliente(clienteId) {
  estado.clienteId = clienteId;
  estado.seleccion.clear();
  estadoCargaDocumentosEl.style.display = 'flex';
  contenedorDocumentosEl.innerHTML = '';

  const { data, error } = await supabaseClient
    .from('documentos')
    .select('*')
    .eq('cliente_id', clienteId);

  estadoCargaDocumentosEl.style.display = 'none';

  if (error) {
    console.error('Error cargando documentos:', error);
    contenedorDocumentosEl.innerHTML = `<p class="estado-vacio-docs">No se pudieron cargar los documentos: ${escaparHtml(error.message)}</p>`;
    estado.documentos = [];
    poblarFiltros();
    renderRail();
    return;
  }

  estado.documentos = (data || []).map(normalizarFila);

  poblarFiltros();
  renderRail();
  renderPanel();
}

// =====================================================
// Filtros dinámicos
// =====================================================
function poblarFiltros() {
  const anios = [...new Set(estado.documentos.map(d => (d.fecha || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  filtroAnioEl.innerHTML = '<option value="todos">Todos los años</option>' + anios.map(a => `<option value="${a}">${a}</option>`).join('');

  const tipos = [...new Set(estado.documentos.map(d => d.tipo).filter(Boolean))];
  filtroTipoEl.innerHTML = '<option value="todos">Todos los tipos</option>' + tipos.map(t => `<option value="${escaparHtml(t)}">${escaparHtml(t)}</option>`).join('');
}

// =====================================================
// Rail de categorías
// =====================================================
function renderRail() {
  categoriasRailEl.innerHTML = CATEGORIAS.map(cat => {
    const n = estado.documentos.filter(d => d.categoria === cat.id).length;
    return `<button type="button" class="categoria-tab ${cat.id === estado.categoriaActiva ? 'activa' : ''}" data-categoria="${cat.id}">
      <span class="cat-icono">${cat.icono}</span>
      <span class="cat-nombre">${cat.nombre}</span>
      <span class="cat-contador">${n}</span>
    </button>`;
  }).join('');

  categoriasRailEl.querySelectorAll('.categoria-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      estado.categoriaActiva = btn.dataset.categoria;
      renderRail(); renderPanel();
    });
  });
}

// =====================================================
// Filtrado y orden
// =====================================================
function documentosFiltrados() {
  const texto       = buscadorEl.value.trim().toLowerCase();
  const anio        = filtroAnioEl.value;
  const tipo        = filtroTipoEl.value;
  const soloRecient = filtroRecientesEl.checked;
  const orden       = ordenarFechaEl.value;

  let lista = estado.documentos.filter(d => d.categoria === estado.categoriaActiva);

  if (texto) lista = lista.filter(d => [d.nombre, d.subcategoria, d.responsable, d.subido_por, d.observaciones, d.impuesto, d.servicio].filter(Boolean).join(' ').toLowerCase().includes(texto));
  if (anio !== 'todos') lista = lista.filter(d => (d.fecha || '').startsWith(anio));
  if (tipo !== 'todos') lista = lista.filter(d => d.tipo === tipo);
  if (soloRecient) lista = lista.filter(d => esReciente(d.fecha));

  return [...lista].sort((a, b) => orden === 'asc' ? (a.fecha||'').localeCompare(b.fecha||'') : (b.fecha||'').localeCompare(a.fecha||''));
}

// =====================================================
// Render del panel
// =====================================================
function renderPanel() {
  const cat = CATEGORIAS.find(c => c.id === estado.categoriaActiva);
  categoriaTituloEl.textContent     = cat.nombre;
  categoriaDescripcionEl.textContent = cat.descripcion;

  const lista = documentosFiltrados();
  contadorResultadosEl.textContent = `${lista.length} documento${lista.length === 1 ? '' : 's'}`;
  contenedorDocumentosEl.className = `contenedor-documentos vista-${estado.vista}`;

  if (!lista.length) {
    contenedorDocumentosEl.innerHTML = '<p class="estado-vacio-docs">No hay documentos que coincidan con los filtros en esta categoría.</p>';
    actualizarBarraSeleccion(); return;
  }

  estado.vista === 'tabla' ? renderTabla(lista) : renderTarjetas(lista, cat);
  actualizarBarraSeleccion();
}

function agruparSiAplica(lista, cat) {
  if (!cat.agrupa) return [{ titulo: null, items: lista }];
  const orden = cat.agrupa === 'mes' ? ORDEN_MESES : ORDEN_SEMANAS;
  const grupos = {};
  lista.forEach(d => { const k = d.subcategoria || 'Sin clasificar'; (grupos[k] = grupos[k] || []).push(d); });
  return Object.keys(grupos)
    .sort((a, b) => { const ia = orden.indexOf(a), ib = orden.indexOf(b); if (ia<0&&ib<0) return a.localeCompare(b); if (ia<0) return 1; if (ib<0) return -1; return ia-ib; })
    .map(k => ({ titulo: k, items: grupos[k] }));
}

function renderTarjetas(lista, cat) {
  const grupos = agruparSiAplica(lista, cat);
  contenedorDocumentosEl.innerHTML = grupos.map(g => `
    ${g.titulo ? `<div class="subgrupo-titulo">${g.titulo}</div>` : ''}
    <div class="contenedor-documentos vista-tarjetas">${g.items.map(tarjetaHtml).join('')}</div>
  `).join('');
  adjuntarEventos();
}

// =====================================================
// Rediseño de tarjeta (UI/UX únicamente)
// =====================================================
// Mapa categoría → color de la franja superior. Las categorías reales
// del sistema (CATEGORIAS, arriba) no coinciden 1 a 1 con los ejemplos
// del brief (Declaraciones/Honorarios/Estados financieros/Opinión
// SAT/Constancias/Acuses), así que se mapean por significado:
//   acuses / remisiones        → turquesa (acuses y entregas)
//   pagos_declaraciones        → verde    (pagos derivados de declaraciones)
//   pagos_im / presupuestos    → azul     (honorarios / cotizaciones)
//   opinion / detalle_opinion  → amarillo (Opinión SAT)
//   tramites                   → gris     (constancias y trámites)
//   acuerdo                    → morado   (documento contractual)
// =====================================================
const COLOR_POR_CATEGORIA = {
  acuses:              'turquesa',
  remisiones:           'turquesa',
  pagos_declaraciones: 'verde',
  pagos_im:            'azul',
  presupuestos:        'azul',
  opinion:             'amarillo',
  detalle_opinion:     'amarillo',
  tramites:            'gris',
  acuerdo:             'morado',
};
function colorCategoria(catId) { return COLOR_POR_CATEGORIA[catId] || 'gris'; }

// Ícono grande de respaldo cuando no es posible generar una miniatura
// real del archivo (ver nota junto a doc-card__archivo más abajo).
function iconoArchivo(tipo) {
  const t = (tipo || '').toLowerCase();
  if (t.includes('pdf'))  return { emoji: '📕', etiqueta: 'PDF' };
  if (t.includes('png') || t.includes('jpg') || t.includes('jpeg') || t.includes('imagen') || t.includes('image')) {
    return { emoji: '🖼️', etiqueta: 'Imagen' };
  }
  return { emoji: '📁', etiqueta: tipo || 'Archivo' };
}

// Badge automático de la esquina superior derecha. Prioriza "Nuevo" si
// el documento es reciente (igual que el badge anterior); si no, deriva
// el color/emoji del texto libre de "estatus" hacia una de las 5
// variantes del brief (Nuevo/Pendiente/Pagado/Vencido/Archivado).
// No sustituye a badgeEstatus() (se sigue usando igual que antes en la
// vista de tabla, sin cambios).
function obtenerBadgeCard(d) {
  if (esReciente(d.fecha)) return { emoji: '🟢', texto: 'Nuevo', clase: 'nuevo' };

  const texto = (d.estatus || '').trim();
  const n = texto.toLowerCase();
  if (!texto) return { emoji: '⚪', texto: 'Sin estatus', clase: 'archivado' };
  if (n.includes('pagad'))                                   return { emoji: '🔵', texto, clase: 'pagado' };
  if (n.includes('pend') || n.includes('proceso'))           return { emoji: '🟡', texto, clase: 'pendiente' };
  if (n.includes('venc') || n.includes('cancel') || n.includes('rechaz')) return { emoji: '🔴', texto, clase: 'vencido' };
  if (n.includes('archiv'))                                  return { emoji: '⚪', texto, clase: 'archivado' };
  return { emoji: '🟢', texto, clase: 'nuevo' }; // vigente/presentado/aprobado/concluido…
}

// "Periodo + Año" bajo el nombre del documento (ej. "Marzo 2026").
function periodoAnioTexto(d) {
  const anio = (d.fecha || '').slice(0, 4);
  if (d.subcategoria && anio) return `${d.subcategoria} ${anio}`;
  if (d.subcategoria) return d.subcategoria;
  return anio || '';
}

function tarjetaHtml(d) {
  const cat      = CATEGORIAS.find(c => c.id === d.categoria);
  const badge    = obtenerBadgeCard(d);
  const anio     = (d.fecha || '').slice(0, 4);
  const periodo  = periodoAnioTexto(d);
  const archivo  = iconoArchivo(d.tipo);

  // Información principal solicitada: Fecha, Tipo, Estado, Periodo,
  // Año, Responsable. Los campos vacíos simplemente no se agregan.
  const filas = [];
  if (d.fecha)        filas.push(['Fecha', formatearFecha(d.fecha)]);
  if (d.tipo)          filas.push(['Tipo', escaparHtml(d.tipo)]);
  if (d.estatus)       filas.push(['Estado', escaparHtml(d.estatus)]);
  if (d.subcategoria)  filas.push(['Periodo', escaparHtml(d.subcategoria)]);
  if (anio)            filas.push(['Año', anio]);
  if (d.responsable)   filas.push(['Responsable', escaparHtml(d.responsable)]);

  // Campos financieros/administrativos propios de cada categoría (se
  // conservan del diseño anterior; siguen ocultos si están vacíos).
  if (d.importe  != null) filas.push(['Importe', formatearMoneda(d.importe)]);
  if (d.monto    != null) filas.push(['Monto', formatearMoneda(d.monto)]);
  if (d.servicio)          filas.push(['Servicio', escaparHtml(d.servicio)]);
  if (d.vigencia)          filas.push(['Vigencia', escaparHtml(d.vigencia)]);
  if (d.metodo_pago)       filas.push(['Método de pago', escaparHtml(d.metodo_pago)]);
  if (d.referencia)        filas.push(['Referencia', escaparHtml(d.referencia)]);
  if (d.impuesto)          filas.push(['Impuesto', escaparHtml(d.impuesto)]);

  return `<div class="documento-card con-check doc-card doc-card--${colorCategoria(d.categoria)}">
    <input type="checkbox" class="documento-check doc-card__check" data-id="${d.id}" ${estado.seleccion.has(String(d.id)) ? 'checked' : ''} aria-label="Seleccionar">

    <span class="doc-card__badge doc-card__badge--${badge.clase}">${badge.emoji} ${escaparHtml(badge.texto)}</span>

    <div class="doc-card__header">
      <span class="doc-card__header-icono" aria-hidden="true">${cat?.icono || '📄'}</span>
      <div class="doc-card__header-texto">
        <h4 class="doc-card__nombre">${escaparHtml(d.nombre || 'Documento')}</h4>
        ${periodo ? `<p class="doc-card__periodo">${escaparHtml(periodo)}</p>` : ''}
      </div>
    </div>

    <div class="doc-card__info">
      ${filas.map(([k, v]) => `<div class="doc-card__info-fila"><span class="doc-card__info-clave">${k}</span><span class="doc-card__info-valor">${v}</span></div>`).join('')}
    </div>

    ${d.linea_captura ? `
    <div class="doc-card__linea">
      <span class="doc-card__linea-label">Línea de captura</span>
      <div class="doc-card__linea-caja">
        <code class="doc-card__linea-valor">${escaparHtml(d.linea_captura)}</code>
        <button type="button" class="doc-card__linea-copiar" data-accion="copiar-linea" data-valor="${escaparHtml(d.linea_captura)}" title="Copiar línea de captura" aria-label="Copiar línea de captura">📋</button>
      </div>
    </div>` : ''}

    ${d.observaciones ? `
    <div class="doc-card__obs">
      <span class="doc-card__obs-icono" aria-hidden="true">💬</span>
      <p class="doc-card__obs-texto">${escaparHtml(d.observaciones)}</p>
    </div>` : ''}

    <!-- Miniatura real: requeriría pedir una URL firmada por archivo al
         renderizar la lista (llamada extra a Storage por documento), lo
         cual no se hizo aquí a propósito para no tocar Storage/las
         consultas. Se muestra un ícono grande según el tipo de archivo. -->
    <div class="doc-card__archivo">
      <span class="doc-card__archivo-icono" aria-hidden="true">${archivo.emoji}</span>
      <span class="doc-card__archivo-etiqueta">${escaparHtml(archivo.etiqueta)}</span>
    </div>

    <div class="doc-card__footer">
      <span class="doc-card__subido-por">${d.subido_por ? `Subido por ${escaparHtml(d.subido_por)}` : ''}</span>
      <div class="doc-card__acciones">
        <button type="button" class="doc-card__accion doc-card__accion--ver" data-accion="ver" data-id="${d.id}">
          <span aria-hidden="true">👁</span> Ver
        </button>
        <button type="button" class="doc-card__accion doc-card__accion--descargar" data-accion="descargar" data-id="${d.id}">
          <span aria-hidden="true">⬇</span> Descargar
        </button>
        <button type="button" class="doc-card__accion doc-card__accion--compartir" title="Próximamente" disabled>
          <span aria-hidden="true">📤</span> Compartir
        </button>
      </div>
    </div>
  </div>`;
}

function renderTabla(lista) {
  contenedorDocumentosEl.innerHTML = `
    <div class="documentos-tabla-wrap">
      <table class="documentos-tabla">
        <thead><tr>
          <th></th><th>Nombre</th><th>Periodo</th><th>Fecha</th><th>Tipo</th><th>Estatus</th><th>Subido por</th><th>Acciones</th>
        </tr></thead>
        <tbody>${lista.map(d => `
          <tr>
            <td><input type="checkbox" class="documento-check" data-id="${d.id}" ${estado.seleccion.has(String(d.id)) ? 'checked' : ''}></td>
            <td class="col-nombre">${escaparHtml(d.nombre||'Documento')}</td>
            <td>${escaparHtml(d.subcategoria||'—')}</td>
            <td>${formatearFecha(d.fecha)}</td>
            <td>${escaparHtml(d.tipo||'—')}</td>
            <td>${badgeEstatus(d.estatus)}</td>
            <td>${escaparHtml(d.subido_por||'—')}</td>
            <td><div class="col-acciones">
              <button type="button" data-accion="ver" data-id="${d.id}">Ver</button>
              <button type="button" data-accion="descargar" data-id="${d.id}">Descargar</button>
            </div></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  adjuntarEventos();
}

function adjuntarEventos() {
  contenedorDocumentosEl.querySelectorAll('[data-accion="ver"]').forEach(b => {
    b.addEventListener('click', () => abrirVistaPrevia(buscarDoc(b.dataset.id)));
  });
  contenedorDocumentosEl.querySelectorAll('[data-accion="descargar"]').forEach(b => {
    b.addEventListener('click', () => descargarDocumento(buscarDoc(b.dataset.id)));
  });
  // Copiar línea de captura (parte del rediseño de la tarjeta). Solo
  // copia texto al portapapeles; no toca lógica de Storage/Supabase.
  contenedorDocumentosEl.querySelectorAll('[data-accion="copiar-linea"]').forEach(b => {
    b.addEventListener('click', async () => {
      const valor = b.dataset.valor || '';
      try {
        await navigator.clipboard.writeText(valor);
        mostrarToast('Línea copiada');
      } catch (e) {
        mostrarToast('No se pudo copiar. Selecciona el texto manualmente.');
      }
    });
  });
  contenedorDocumentosEl.querySelectorAll('.documento-check').forEach(chk => {
    chk.addEventListener('change', () => {
      if (chk.checked) estado.seleccion.add(String(chk.dataset.id));
      else estado.seleccion.delete(String(chk.dataset.id));
      actualizarBarraSeleccion();
    });
  });
}

function buscarDoc(id) { return estado.documentos.find(d => String(d.id) === String(id)); }
function actualizarBarraSeleccion() {
  contadorSeleccionEl.textContent    = estado.seleccion.size;
  btnDescargaMultipleEl.disabled     = estado.seleccion.size === 0;
}

// =====================================================
// Historial
// =====================================================
function registrarHistorial(doc) {
  const h = JSON.parse(localStorage.getItem('imc_historial_documentos') || '[]');
  h.unshift({ id: doc.id, nombre: doc.nombre, categoria: doc.categoria, fecha_consulta: new Date().toISOString() });
  localStorage.setItem('imc_historial_documentos', JSON.stringify([...new Map(h.map(x => [x.id, x])).values()].slice(0, 8)));
  renderHistorial();
}

function renderHistorial() {
  const h = JSON.parse(localStorage.getItem('imc_historial_documentos') || '[]');
  if (!h.length) { historialListaEl.innerHTML = '<li class="historial-vacio">Aún no has abierto documentos.</li>'; return; }
  historialListaEl.innerHTML = h.map(x => {
    const cat  = CATEGORIAS.find(c => c.id === x.categoria);
    const hora = new Date(x.fecha_consulta).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<li class="historial-item"><span class="h-nombre">${escaparHtml(x.nombre||'Documento')}</span><span class="h-meta">${cat?cat.nombre:''} · ${hora}</span></li>`;
  }).join('');
}

// =====================================================
// Vista previa — genera URL firmada antes de mostrar el link
// =====================================================
async function abrirVistaPrevia(doc) {
  if (!doc) return;

  modalTituloEl.textContent    = doc.nombre || 'Documento';
  modalSubtituloEl.textContent = `${formatearFecha(doc.fecha)} · ${doc.tipo || 'PDF'}`;
  modalEl.classList.add('abierto');

  modalIframeEl.style.display = 'none';
  modalIframeEl.removeAttribute('src');
  modalIframeEl.removeAttribute('srcdoc');

  const cuerpo = modalIframeEl.parentElement;
  cuerpo.querySelectorAll('.modal-doc-acciones').forEach(el => el.remove());
  modalDescargarEl.style.display = 'none';

  if (!doc.url_archivo) {
    const aviso = document.createElement('div');
    aviso.className = 'modal-doc-acciones';
    aviso.innerHTML = `<p style="color:#647069;text-align:center;">Este documento aún no tiene archivo adjunto.<br>Sube el archivo desde <strong>Subir documento</strong> para verlo aquí.</p>`;
    cuerpo.appendChild(aviso);
    registrarHistorial(doc);
    return;
  }

  // Aviso de "generando enlace seguro..." mientras se pide la URL firmada
  const cargando = document.createElement('div');
  cargando.className = 'modal-doc-acciones';
  cargando.innerHTML = `<p style="color:#647069;text-align:center;">Generando enlace seguro…</p>`;
  cuerpo.appendChild(cargando);

  const url = await obtenerUrlFirmada(doc.url_archivo);
  cargando.remove();

  if (!url) {
    const error = document.createElement('div');
    error.className = 'modal-doc-acciones';
    error.innerHTML = `<p style="color:#B23A2E;text-align:center;">No se pudo generar el enlace seguro.<br>Verifica que el archivo exista en esa ruta dentro del bucket "documentos".</p>`;
    cuerpo.appendChild(error);
    return;
  }

  const acciones = document.createElement('div');
  acciones.className = 'modal-doc-acciones';
  acciones.innerHTML = `
    <p style="color:#647069;font-size:14px;text-align:center;margin-bottom:20px;">
      Los PDFs se abren en una nueva pestaña para mayor compatibilidad.<br>
      Este enlace caduca en 1 hora por seguridad.
    </p>
    <a href="${escaparHtml(url)}" target="_blank" rel="noopener"
       style="display:inline-block;background:#0D3327;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;margin-bottom:12px;">
      📄 Abrir PDF ↗
    </a>`;
  cuerpo.appendChild(acciones);

  modalDescargarEl.style.display = '';
  modalDescargarEl.href          = url;
  modalDescargarEl.download      = doc.nombre || 'documento.pdf';
  modalDescargarEl.target        = '_blank';
  modalDescargarEl.rel           = 'noopener';

  registrarHistorial(doc);
}

function cerrarVistaPrevia() {
  modalEl.classList.remove('abierto');
  modalIframeEl.style.display = 'none';
  modalIframeEl.removeAttribute('src');
  modalIframeEl.removeAttribute('srcdoc');
  const cuerpo = modalIframeEl.parentElement;
  cuerpo.querySelectorAll('.modal-doc-acciones').forEach(el => el.remove());
  modalDescargarEl.style.display = '';
  modalDescargarEl.href = '#';
}

async function descargarDocumento(doc) {
  if (!doc) return;
  registrarHistorial(doc);

  if (!doc.url_archivo) { mostrarToast('Este documento aún no tiene archivo adjunto.'); return; }

  const url = await obtenerUrlFirmada(doc.url_archivo);
  if (!url) { mostrarToast('No se pudo generar el enlace de descarga.'); return; }

  const a = document.createElement('a');
  a.href     = url;
  a.download = doc.nombre || 'documento.pdf';
  a.target   = '_blank';
  a.click();
}

// =====================================================
// Eventos de barra de herramientas
// =====================================================
selectorClienteEl.addEventListener('change', () => cargarDocumentosDeCliente(selectorClienteEl.value));
buscadorEl.addEventListener('input', renderPanel);
filtroAnioEl.addEventListener('change', renderPanel);
filtroTipoEl.addEventListener('change', renderPanel);
ordenarFechaEl.addEventListener('change', renderPanel);
filtroRecientesEl.addEventListener('change', renderPanel);

function cambiarVista(v) {
  estado.vista = v;
  localStorage.setItem('imc_vista_documentos', v);
  vistaTarjetasBtn.classList.toggle('activo', v === 'tarjetas');
  vistaTablaBtn.classList.toggle('activo', v === 'tabla');
  renderPanel();
}
vistaTarjetasBtn.addEventListener('click', () => cambiarVista('tarjetas'));
vistaTablaBtn.addEventListener('click', () => cambiarVista('tabla'));
cambiarVista(estado.vista);

btnDescargaMultipleEl.addEventListener('click', async () => {
  const docs = [...estado.seleccion].map(buscarDoc).filter(Boolean);
  for (const d of docs) await descargarDocumento(d);
  mostrarToast(`${docs.length} documento(s) descargado(s)`);
  estado.seleccion.clear(); renderPanel();
});

modalCerrarEl.addEventListener('click', cerrarVistaPrevia);
modalEl.addEventListener('click', e => { if (e.target === modalEl) cerrarVistaPrevia(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarVistaPrevia(); });

document.getElementById('btnCerrarSesion').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

if (btnMenuMovilEl) btnMenuMovilEl.addEventListener('click', () => dashboardShellEl.classList.toggle('menu-abierto'));
if (sidebarOverlayEl) sidebarOverlayEl.addEventListener('click', () => dashboardShellEl.classList.remove('menu-abierto'));

renderHistorial();
inicializar();
