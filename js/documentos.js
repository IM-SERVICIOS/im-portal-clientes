// =====================================================
// Documentos - Portal de Clientes IM Servicios Contables
// =====================================================
// COLUMNAS REALES DE LA TABLA "documentos":
//   id               → PK (bigint)
//   cliente_id       → FK a clientes (bigint)
//   tipo_documento   → tipo de archivo (varchar)
//   nombre_archivo   → nombre visible (varchar)
//   url_archivo      → URL pública completa en Supabase Storage
//   fecha_subida     → timestamp de carga
//   categoria        → id de categoría (ej. 'presupuestos', 'acuses')
//   subcategoria, nombre, fecha, tipo, estatus, observaciones,
//   subido_por, linea_captura, importe, servicio, vigencia,
//   responsable, metodo_pago, referencia, monto, impuesto
//
// BUCKET PÚBLICO: url_archivo ya es la URL completa de acceso.
// No se requiere generar URL firmada.
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
  return typeof rol === 'string' && rol.trim().toLowerCase().startsWith('admin');
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
// Adapta los nombres reales de columna de Supabase a los
// nombres que usan todas las funciones de render de este
// archivo. Así el resto del código no necesita cambiar si
// en el futuro renombras columnas en la BD.
// =====================================================
function normalizarFila(fila) {
  return {
    // Campos existentes en la tabla original
    id:           fila.id,
    id_cliente:   fila.cliente_id,
    categoria:    fila.categoria      ?? fila.tipo_documento ?? null,
    nombre:       fila.nombre_archivo ?? fila.nombre         ?? null,
    url_archivo:  fila.url_archivo    ?? null,
    tipo:         fila.tipo_documento ?? fila.tipo           ?? 'PDF',
    // Columnas enriquecidas (agregadas con ALTER TABLE)
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
// URL del archivo — bucket PÚBLICO (url_archivo ya es URL completa)
// =====================================================
async function obtenerUrlFirmada(ruta) {
  if (!ruta || ruta === '#') return null;
  return ruta;
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
// Carga de documentos — usa los nombres reales de columna
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

function tarjetaHtml(d) {
  const extras = [];
  if (d.linea_captura) extras.push(['Línea de captura', d.linea_captura, true]);
  if (d.importe  != null) extras.push(['Importe',        formatearMoneda(d.importe), false]);
  if (d.monto    != null) extras.push(['Monto',          formatearMoneda(d.monto),   false]);
  if (d.servicio)  extras.push(['Servicio',    d.servicio,   false]);
  if (d.responsable) extras.push(['Responsable', d.responsable, false]);
  if (d.vigencia)  extras.push(['Vigencia',    d.vigencia,   false]);
  if (d.metodo_pago) extras.push(['Método pago', d.metodo_pago, false]);
  if (d.referencia) extras.push(['Referencia',  d.referencia, true]);
  if (d.impuesto)  extras.push(['Impuesto',    d.impuesto,   false]);

  return `<div class="documento-card con-check">
    <input type="checkbox" class="documento-check" data-id="${d.id}" ${estado.seleccion.has(String(d.id)) ? 'checked' : ''} aria-label="Seleccionar">
    <div class="documento-card-top">
      <h4>${escaparHtml(d.nombre || 'Documento')}</h4>
      ${esReciente(d.fecha) ? '<span class="doc-reciente">Nuevo</span>' : ''}
    </div>
    <div class="documento-meta-lista">
      <div class="fila"><span class="clave">Fecha</span><span class="valor">${formatearFecha(d.fecha)}</span></div>
      <div class="fila"><span class="clave">Tipo</span><span class="valor">${escaparHtml(d.tipo||'—')}</span></div>
      <div class="fila"><span class="clave">Estatus</span><span class="valor">${badgeEstatus(d.estatus)}</span></div>
      ${extras.map(([k,v,m]) => `<div class="fila"><span class="clave">${k}</span><span class="valor ${m?'mono':''}">${escaparHtml(v)}</span></div>`).join('')}
    </div>
    ${d.observaciones ? `<div class="documento-obs">${escaparHtml(d.observaciones)}</div>` : ''}
    <div class="documento-card-footer">
      <span class="documento-subido-por">${d.subido_por ? `Subido por ${escaparHtml(d.subido_por)}` : ''}</span>
      <div class="documento-acciones">
        <button type="button" class="accion-ver" data-accion="ver" data-id="${d.id}">Ver</button>
        <button type="button" data-accion="descargar" data-id="${d.id}">Descargar</button>
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
// Vista previa PDF — bucket PRIVADO (URL firmada)
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

async function abrirVistaPrevia(doc) {
  if (!doc) return;

  modalTituloEl.textContent    = doc.nombre || 'Documento';
  modalSubtituloEl.textContent = `${formatearFecha(doc.fecha)} · ${doc.tipo || 'PDF'}`;
  modalDescargarEl.href        = '#';
  modalEl.classList.add('abierto');

  // Mostrar spinner mientras se genera la URL firmada
  modalIframeEl.removeAttribute('src');
  modalIframeEl.srcdoc = `<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#647069;background:#EAEFEC;"><p>Cargando documento seguro…</p></body>`;

  if (!doc.url_archivo) {
    // El registro existe en BD pero aún no tiene archivo subido
    modalIframeEl.srcdoc = `<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#647069;background:#EAEFEC;"><p style="text-align:center;max-width:320px;">Este documento aún no tiene archivo adjunto.<br>Sube el archivo desde <strong>Subir documento</strong> para verlo aquí.</p></body>`;
    registrarHistorial(doc);
    return;
  }

  // Generar URL firmada (bucket privado)
  const urlFirmada = await obtenerUrlFirmada(doc.url_archivo);

  if (!urlFirmada) {
    modalIframeEl.srcdoc = `<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#B23A2E;background:#FAE4E1;"><p style="text-align:center;max-width:320px;">No se pudo generar el enlace seguro.<br>Verifica los permisos del bucket en Supabase Storage.</p></body>`;
    return;
  }

  modalIframeEl.removeAttribute('srcdoc');
  modalIframeEl.src         = urlFirmada;
  modalDescargarEl.href     = urlFirmada;
  modalDescargarEl.download = doc.nombre || 'documento.pdf';

  registrarHistorial(doc);
}

function cerrarVistaPrevia() {
  modalEl.classList.remove('abierto');
  modalIframeEl.removeAttribute('src');
  modalIframeEl.srcdoc = '';
}

async function descargarDocumento(doc) {
  if (!doc) return;
  registrarHistorial(doc);

  if (!doc.url_archivo) { mostrarToast(`Descarga de ejemplo: ${doc.nombre}`); return; }

  const url = await obtenerUrlFirmada(doc.url_archivo);
  if (!url) { mostrarToast('No se pudo generar el enlace de descarga.'); return; }

  const a = document.createElement('a');
  a.href = url; a.download = doc.nombre || 'documento.pdf'; a.click();
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
