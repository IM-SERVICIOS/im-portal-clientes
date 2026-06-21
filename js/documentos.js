// =====================================================
// Documentos - Portal de Clientes IM Servicios Contables
// =====================================================
// CÓMO FUNCIONA ESTE ARCHIVO
// ---------------------------------------------------
// 1) Autenticación y carga de clientes: usa la misma lógica
//    que dashboard.js (sesión de Supabase, tabla "usuarios",
//    admin vs. clientes asignados).
//
// 2) Documentos por categoría: intenta leer la tabla real
//    "documentos" de Supabase con columnas enriquecidas:
//      categoria, subcategoria, nombre, fecha, tipo, estatus,
//      observaciones, subido_por, url_archivo, linea_captura,
//      importe, servicio, vigencia, responsable, metodo_pago,
//      referencia, monto, impuesto
//    Los IDs de categoría esperados son los mismos que en el
//    arreglo CATEGORIAS más abajo (p. ej. "acuses",
//    "presupuestos", "tramites").
//
//    Si esas columnas todavía no existen en tu base de datos
//    (es decir, "documentos" hoy solo tiene id/cliente_id),
//    esta página usa datos de ejemplo (generarDocumentosDemo)
//    para que puedas ver y probar la interfaz completa mientras
//    se amplía el esquema real. En cuanto agregues esas columnas
//    en Supabase, los datos reales se mostrarán automáticamente
//    sin tocar este archivo.
// =====================================================

// ---- DOM: encabezado / sesión (igual que dashboard.js) ----
const nombreUsuarioEl = document.getElementById('nombreUsuario');
const rolUsuarioEl = document.getElementById('rolUsuario');
const avatarUsuarioEl = document.getElementById('avatarUsuario');
const dashboardShellEl = document.getElementById('dashboardShell');
const sidebarOverlayEl = document.getElementById('sidebarOverlay');
const btnMenuMovilEl = document.getElementById('btnMenuMovil');

// ---- DOM: barra de herramientas ----
const selectorClienteEl = document.getElementById('selectorCliente');
const buscadorEl = document.getElementById('buscadorDocumentos');
const filtroAnioEl = document.getElementById('filtroAnio');
const filtroTipoEl = document.getElementById('filtroTipo');
const ordenarFechaEl = document.getElementById('ordenarFecha');
const filtroRecientesEl = document.getElementById('filtroRecientes');
const contadorResultadosEl = document.getElementById('contadorResultados');
const btnDescargaMultipleEl = document.getElementById('btnDescargaMultiple');
const contadorSeleccionEl = document.getElementById('contadorSeleccion');
const vistaTarjetasBtn = document.getElementById('vistaTarjetas');
const vistaTablaBtn = document.getElementById('vistaTabla');

// ---- DOM: categorías y panel ----
const categoriasRailEl = document.getElementById('categoriasRail');
const categoriaTituloEl = document.getElementById('categoriaTitulo');
const categoriaDescripcionEl = document.getElementById('categoriaDescripcion');
const estadoCargaDocumentosEl = document.getElementById('estadoCargaDocumentos');
const contenedorDocumentosEl = document.getElementById('contenedorDocumentos');

// ---- DOM: historial y modal ----
const historialListaEl = document.getElementById('historialArchivos');
const modalEl = document.getElementById('modalVistaPrevia');
const modalTituloEl = document.getElementById('modalTitulo');
const modalSubtituloEl = document.getElementById('modalSubtitulo');
const modalIframeEl = document.getElementById('modalIframe');
const modalDescargarEl = document.getElementById('modalDescargar');
const modalCerrarEl = document.getElementById('modalCerrar');

// =====================================================
// Catálogo de categorías
// =====================================================
const CATEGORIAS = [
  { id: 'acuses', nombre: 'Acuses y líneas de captura', icono: '🧾', descripcion: 'Organizados por mes de presentación.', agrupa: 'mes' },
  { id: 'presupuestos', nombre: 'Presupuestos', icono: '💰', descripcion: 'Cotizaciones enviadas para tu operación.' },
  { id: 'opinion', nombre: 'Opinión de cumplimiento', icono: '✅', descripcion: 'Constancia de opinión positiva ante el SAT.' },
  { id: 'detalle_opinion', nombre: 'Detalle de opinión de cumplimiento', icono: '📋', descripcion: 'Soporte y observaciones de cada opinión.' },
  { id: 'tramites', nombre: 'Documentos de trámites', icono: '🗂️', descripcion: 'Altas, renovaciones y trámites administrativos.' },
  { id: 'acuerdo', nombre: 'Acuerdo de servicio', icono: '🤝', descripcion: 'Contrato vigente con IM Servicios Contables.' },
  { id: 'remisiones', nombre: 'Remisiones semanales', icono: '📦', descripcion: 'Organizadas por semana del mes.', agrupa: 'semana' },
  { id: 'pagos_im', nombre: 'Pagos a IM Servicios Contables', icono: '💳', descripcion: 'Honorarios pagados por el cliente.' },
  { id: 'pagos_declaraciones', nombre: 'Pagos con saldo a cargo', icono: '🧮', descripcion: 'Impuestos pagados derivados de declaraciones.' },
];

const ORDEN_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const ORDEN_SEMANAS = ['Semana 1','Semana 2','Semana 3','Semana 4'];

// =====================================================
// Estado de la página
// =====================================================
const estado = {
  clientes: [],
  clienteId: null,
  documentos: [],
  esDemo: false,
  categoriaActiva: 'acuses',
  vista: localStorage.getItem('imc_vista_documentos') === 'tabla' ? 'tabla' : 'tarjetas',
  seleccion: new Set(),
};

function formatearMoneda(numero) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(numero || 0);
}
function formatearFecha(fechaIso) {
  if (!fechaIso) return '—';
  const d = new Date(fechaIso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return fechaIso;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}
function esReciente(fechaIso) {
  if (!fechaIso) return false;
  const d = new Date(fechaIso + 'T00:00:00');
  const diffDias = (Date.now() - d.getTime()) / 86400000;
  return diffDias >= 0 && diffDias <= 7;
}
function esAdmin(rol) {
  return typeof rol === 'string' && rol.trim().toLowerCase().startsWith('admin');
}
function generarIniciales(correo) {
  if (typeof correo !== 'string' || !correo.includes('@')) return '··';
  const usuario = correo.split('@')[0];
  const partes = usuario.split(/[.\-_]+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return usuario.slice(0, 2).toUpperCase();
}
function badgeEstatus(texto) {
  if (!texto) return '<span class="badge badge-gris">Sin estatus</span>';
  const normal = String(texto).toLowerCase();
  let clase = 'badge-gris';
  if (normal.includes('vigente') || normal.includes('pagad') || normal.includes('activ') || normal.includes('present')) clase = 'badge-verde';
  else if (normal.includes('pend')) clase = 'badge-ambar';
  else if (normal.includes('venc') || normal.includes('cancel') || normal.includes('rechaz')) clase = 'badge-rojo';
  return `<span class="badge ${clase}">${texto}</span>`;
}
function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}
function mostrarToast(texto) {
  const toast = document.createElement('div');
  toast.textContent = texto;
  toast.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#0D3327;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 8px 22px rgba(0,0,0,0.22);z-index:200;';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

// =====================================================
// Datos de ejemplo (se usan solo si la tabla "documentos"
// real aún no tiene las columnas enriquecidas).
// =====================================================
function generarDocumentosDemo(clienteId) {
  let i = 0;
  const docs = [];
  const add = (datos) => docs.push({ id: `demo-${++i}`, cliente_id: clienteId, ...datos });

  add({ categoria: 'acuses', subcategoria: 'Mayo', nombre: 'Acuse ISR mayo 2026', fecha: '2026-06-17', tipo: 'PDF', estatus: 'Presentado', observaciones: 'Presentación sin saldo a cargo.', subido_por: 'Ana Ramírez', url_archivo: '#', linea_captura: '07 18 0626 4471 8820' });
  add({ categoria: 'acuses', subcategoria: 'Abril', nombre: 'Acuse IVA abril 2026', fecha: '2026-05-17', tipo: 'PDF', estatus: 'Presentado', observaciones: '', subido_por: 'Ana Ramírez', url_archivo: '#', linea_captura: '07 18 0526 3390 1170' });
  add({ categoria: 'acuses', subcategoria: 'Marzo', nombre: 'Acuse ISR marzo 2026', fecha: '2026-04-17', tipo: 'PDF', estatus: 'Presentado', observaciones: '', subido_por: 'Carlos Peña', url_archivo: '#', linea_captura: '07 18 0426 2207 5541' });
  add({ categoria: 'acuses', subcategoria: 'Diciembre', nombre: 'Acuse anual ISR 2025', fecha: '2025-12-30', tipo: 'PDF', estatus: 'Presentado', observaciones: 'Declaración anual.', subido_por: 'Carlos Peña', url_archivo: '#', linea_captura: '07 18 1225 9087 0012' });

  add({ categoria: 'presupuestos', nombre: 'Presupuesto folio 0142', fecha: '2026-05-02', tipo: 'PDF', estatus: 'Aprobado', servicio: 'Contabilidad mensual + nómina', importe: 4800, observaciones: '', subido_por: 'Ana Ramírez', url_archivo: '#' });
  add({ categoria: 'presupuestos', nombre: 'Presupuesto folio 0119', fecha: '2026-01-14', tipo: 'PDF', estatus: 'Vencido', servicio: 'Dictamen fiscal simplificado', importe: 15600, observaciones: 'No fue aceptado por el cliente.', subido_por: 'Ana Ramírez', url_archivo: '#' });

  add({ categoria: 'opinion', nombre: 'Opinión de cumplimiento jun 2026', fecha: '2026-06-10', tipo: 'PDF', estatus: 'Positiva', vigencia: '30 días', observaciones: '', subido_por: 'Carlos Peña', url_archivo: '#' });
  add({ categoria: 'opinion', nombre: 'Opinión de cumplimiento mar 2026', fecha: '2026-03-08', tipo: 'PDF', estatus: 'Positiva', vigencia: '30 días', observaciones: '', subido_por: 'Carlos Peña', url_archivo: '#' });

  add({ categoria: 'detalle_opinion', nombre: 'Detalle de opinión jun 2026', fecha: '2026-06-10', tipo: 'PDF', estatus: 'Sin observaciones', observaciones: 'Cliente al corriente en sus 32 obligaciones registradas.', subido_por: 'Carlos Peña', url_archivo: '#' });

  add({ categoria: 'tramites', nombre: 'Alta en el SAT', fecha: '2021-03-02', tipo: 'PDF', estatus: 'Concluido', responsable: 'Ana Ramírez', observaciones: '', subido_por: 'Ana Ramírez', url_archivo: '#' });
  add({ categoria: 'tramites', nombre: 'Renovación de e.firma', fecha: '2026-02-19', tipo: 'PDF', estatus: 'Concluido', responsable: 'Carlos Peña', observaciones: 'Vigente hasta 2030.', subido_por: 'Carlos Peña', url_archivo: '#' });
  add({ categoria: 'tramites', nombre: 'Registro patronal IMSS', fecha: '2026-01-22', tipo: 'PDF', estatus: 'En proceso', responsable: 'Carlos Peña', observaciones: 'A la espera de folio del IMSS.', subido_por: 'Carlos Peña', url_archivo: '#' });
  add({ categoria: 'tramites', nombre: 'Registro REPSE', fecha: '2025-11-05', tipo: 'PDF', estatus: 'Concluido', responsable: 'Ana Ramírez', observaciones: '', subido_por: 'Ana Ramírez', url_archivo: '#' });

  add({ categoria: 'acuerdo', nombre: 'Acuerdo de servicio 2026', fecha: '2026-01-05', tipo: 'PDF', estatus: 'Vigente', vigencia: 'Hasta dic 2026', observaciones: '', subido_por: 'Ana Ramírez', url_archivo: '#' });

  add({ categoria: 'remisiones', subcategoria: 'Semana 3', nombre: 'Remisión semana 3 — junio', fecha: '2026-06-19', tipo: 'PDF', estatus: 'Entregada', observaciones: 'Incluye pólizas de ingresos y egresos.', subido_por: 'Ana Ramírez', url_archivo: '#' });
  add({ categoria: 'remisiones', subcategoria: 'Semana 2', nombre: 'Remisión semana 2 — junio', fecha: '2026-06-12', tipo: 'PDF', estatus: 'Entregada', observaciones: '', subido_por: 'Ana Ramírez', url_archivo: '#' });
  add({ categoria: 'remisiones', subcategoria: 'Semana 1', nombre: 'Remisión semana 1 — junio', fecha: '2026-06-05', tipo: 'PDF', estatus: 'Entregada', observaciones: '', subido_por: 'Ana Ramírez', url_archivo: '#' });

  add({ categoria: 'pagos_im', nombre: 'Honorarios mayo 2026', fecha: '2026-05-05', tipo: 'PDF', estatus: 'Pagado', monto: 4800, metodo_pago: 'Transferencia', referencia: 'TRX-88231', observaciones: '', subido_por: 'Cliente', url_archivo: '#' });
  add({ categoria: 'pagos_im', nombre: 'Honorarios abril 2026', fecha: '2026-04-05', tipo: 'PDF', estatus: 'Pagado', monto: 4800, metodo_pago: 'Transferencia', referencia: 'TRX-87015', observaciones: '', subido_por: 'Cliente', url_archivo: '#' });

  add({ categoria: 'pagos_declaraciones', subcategoria: 'Mayo', nombre: 'Pago ISR mayo 2026', fecha: '2026-06-17', tipo: 'PDF', estatus: 'Pagado', impuesto: 'ISR', importe: 2310.5, linea_captura: '07 18 0626 4471 8820', observaciones: '', subido_por: 'Carlos Peña', url_archivo: '#' });
  add({ categoria: 'pagos_declaraciones', subcategoria: 'Marzo', nombre: 'Pago IVA marzo 2026', fecha: '2026-04-17', tipo: 'PDF', estatus: 'Pendiente', impuesto: 'IVA', importe: 1875, linea_captura: '07 18 0426 2207 5541', observaciones: 'Pendiente de confirmar pago en banco.', subido_por: 'Carlos Peña', url_archivo: '#' });

  return docs;
}

// =====================================================
// Autenticación + clientes (misma lógica que dashboard.js)
// =====================================================
async function inicializar() {
  const { data: sesionData } = await supabaseClient.auth.getSession();
  const session = sesionData.session;

  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  const authUserId = session.user.id;

  const { data: usuario, error: errorUsuario } = await supabaseClient
    .from('usuarios')
    .select('id, email, rol')
    .eq('auth_user_id', authUserId)
    .single();

  if (errorUsuario || !usuario) {
    estadoCargaDocumentosEl.style.display = 'none';
    contenedorDocumentosEl.innerHTML = '<p class="estado-vacio-docs">No se encontró tu cuenta en el sistema. Contacta al administrador.</p>';
    return;
  }

  nombreUsuarioEl.textContent = usuario.email;
  rolUsuarioEl.textContent = usuario.rol;
  if (avatarUsuarioEl) avatarUsuarioEl.textContent = generarIniciales(usuario.email);
  if (dashboardShellEl && esAdmin(usuario.rol)) dashboardShellEl.classList.add('es-admin');

  let clientes = [];

  if (esAdmin(usuario.rol)) {
    const { data, error } = await supabaseClient
      .from('clientes')
      .select('id, nombre, rfc')
      .eq('activo', true)
      .order('nombre');
    if (!error) clientes = data || [];
  } else {
    const { data, error } = await supabaseClient
      .from('vw_usuarios_clientes')
      .select('cliente_id, cliente_nombre')
      .eq('usuario_id', usuario.id);
    if (!error) {
      clientes = (data || [])
        .filter(c => c.cliente_id !== null)
        .map(c => ({ id: c.cliente_id, nombre: c.cliente_nombre }));
    }
  }

  estado.clientes = clientes;

  if (clientes.length === 0) {
    estadoCargaDocumentosEl.style.display = 'none';
    contenedorDocumentosEl.innerHTML = '<p class="estado-vacio-docs">No tienes clientes asignados todavía.</p>';
    return;
  }

  selectorClienteEl.innerHTML = clientes.map(c => `<option value="${c.id}">${escaparHtml(c.nombre)}</option>`).join('');

  const params = new URLSearchParams(window.location.search);
  const clienteUrl = params.get('cliente_id');
  const clienteInicial = clientes.some(c => String(c.id) === clienteUrl) ? clienteUrl : String(clientes[0].id);
  selectorClienteEl.value = clienteInicial;

  await cargarDocumentosDeCliente(clienteInicial);
}

// =====================================================
// Carga de documentos del cliente seleccionado
// =====================================================
async function cargarDocumentosDeCliente(clienteId) {
  estado.clienteId = clienteId;
  estado.seleccion.clear();
  estadoCargaDocumentosEl.style.display = 'flex';
  contenedorDocumentosEl.innerHTML = '';

  let documentos = [];
  let esDemo = false;

  const { data, error } = await supabaseClient
    .from('documentos')
    .select('*')
    .eq('cliente_id', clienteId);

  const filaConDatosEnriquecidos = (fila) => fila && (fila.categoria || fila.nombre || fila.tipo);

  if (!error && Array.isArray(data) && data.some(filaConDatosEnriquecidos)) {
    documentos = data;
  } else {
    documentos = generarDocumentosDemo(clienteId);
    esDemo = true;
  }

  estado.documentos = documentos;
  estado.esDemo = esDemo;
  estadoCargaDocumentosEl.style.display = 'none';

  poblarFiltros();
  renderRail();
  renderPanel();
}

// =====================================================
// Filtros (año / tipo) — se construyen según los datos cargados
// =====================================================
function poblarFiltros() {
  const anios = [...new Set(estado.documentos.map(d => (d.fecha || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  filtroAnioEl.innerHTML = '<option value="todos">Todos los años</option>' +
    anios.map(a => `<option value="${a}">${a}</option>`).join('');

  const tipos = [...new Set(estado.documentos.map(d => d.tipo).filter(Boolean))];
  filtroTipoEl.innerHTML = '<option value="todos">Todos los tipos</option>' +
    tipos.map(t => `<option value="${escaparHtml(t)}">${escaparHtml(t)}</option>`).join('');
}

// =====================================================
// Rail de categorías
// =====================================================
function renderRail() {
  categoriasRailEl.innerHTML = CATEGORIAS.map(cat => {
    const cantidad = estado.documentos.filter(d => (d.categoria || 'otros') === cat.id).length;
    const activa = cat.id === estado.categoriaActiva ? 'activa' : '';
    return `
      <button type="button" class="categoria-tab ${activa}" data-categoria="${cat.id}">
        <span class="cat-icono">${cat.icono}</span>
        <span class="cat-nombre">${cat.nombre}</span>
        <span class="cat-contador">${cantidad}</span>
      </button>`;
  }).join('');

  categoriasRailEl.querySelectorAll('.categoria-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      estado.categoriaActiva = btn.dataset.categoria;
      renderRail();
      renderPanel();
    });
  });
}

// =====================================================
// Filtrado + orden de documentos de la categoría activa
// =====================================================
function documentosFiltrados() {
  const cat = estado.categoriaActiva;
  const texto = buscadorEl.value.trim().toLowerCase();
  const anio = filtroAnioEl.value;
  const tipo = filtroTipoEl.value;
  const soloRecientes = filtroRecientesEl.checked;
  const orden = ordenarFechaEl.value;

  let lista = estado.documentos.filter(d => (d.categoria || 'otros') === cat);

  if (texto) {
    lista = lista.filter(d => {
      const campos = [d.nombre, d.subcategoria, d.responsable, d.subido_por, d.observaciones, d.impuesto, d.servicio]
        .filter(Boolean).join(' ').toLowerCase();
      return campos.includes(texto);
    });
  }
  if (anio !== 'todos') lista = lista.filter(d => (d.fecha || '').startsWith(anio));
  if (tipo !== 'todos') lista = lista.filter(d => d.tipo === tipo);
  if (soloRecientes) lista = lista.filter(d => esReciente(d.fecha));

  lista = [...lista].sort((a, b) => {
    const fa = a.fecha || '';
    const fb = b.fecha || '';
    return orden === 'asc' ? fa.localeCompare(fb) : fb.localeCompare(fa);
  });

  return lista;
}

// =====================================================
// Render del panel principal (tarjetas o tabla, con
// subagrupación por mes/semana cuando la categoría lo pide)
// =====================================================
function renderPanel() {
  const cat = CATEGORIAS.find(c => c.id === estado.categoriaActiva);
  categoriaTituloEl.textContent = cat.nombre;
  categoriaDescripcionEl.textContent = cat.descripcion + (estado.esDemo ? ' · Datos de ejemplo' : '');

  const lista = documentosFiltrados();
  contadorResultadosEl.textContent = `${lista.length} documento${lista.length === 1 ? '' : 's'}`;

  contenedorDocumentosEl.className = `contenedor-documentos vista-${estado.vista}`;

  if (lista.length === 0) {
    contenedorDocumentosEl.innerHTML = '<p class="estado-vacio-docs">No hay documentos que coincidan con tu búsqueda o filtros en esta categoría.</p>';
    actualizarBarraSeleccion();
    return;
  }

  if (estado.vista === 'tabla') {
    renderTabla(lista);
  } else {
    renderTarjetas(lista, cat);
  }
  actualizarBarraSeleccion();
}

function agruparSiAplica(lista, cat) {
  if (!cat.agrupa) return [{ titulo: null, items: lista }];
  const orden = cat.agrupa === 'mes' ? ORDEN_MESES : ORDEN_SEMANAS;
  const grupos = {};
  lista.forEach(d => {
    const clave = d.subcategoria || 'Sin clasificar';
    if (!grupos[clave]) grupos[clave] = [];
    grupos[clave].push(d);
  });
  return Object.keys(grupos)
    .sort((a, b) => {
      const ia = orden.indexOf(a); const ib = orden.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    })
    .map(clave => ({ titulo: clave, items: grupos[clave] }));
}

function renderTarjetas(lista, cat) {
  const grupos = agruparSiAplica(lista, cat);
  contenedorDocumentosEl.innerHTML = grupos.map(grupo => `
    ${grupo.titulo ? `<div class="subgrupo-titulo">${grupo.titulo}</div>` : ''}
    <div class="contenedor-documentos vista-tarjetas">
      ${grupo.items.map(d => tarjetaHtml(d)).join('')}
    </div>
  `).join('');

  contenedorDocumentosEl.querySelectorAll('[data-accion="ver"]').forEach(btn => {
    btn.addEventListener('click', () => abrirVistaPrevia(buscarDocumento(btn.dataset.id)));
  });
  contenedorDocumentosEl.querySelectorAll('[data-accion="descargar"]').forEach(btn => {
    btn.addEventListener('click', () => descargarDocumento(buscarDocumento(btn.dataset.id)));
  });
  contenedorDocumentosEl.querySelectorAll('.documento-check').forEach(chk => {
    chk.addEventListener('change', () => {
      if (chk.checked) estado.seleccion.add(chk.dataset.id);
      else estado.seleccion.delete(chk.dataset.id);
      actualizarBarraSeleccion();
    });
  });
}

function tarjetaHtml(d) {
  const camposExtra = [];
  if (d.linea_captura) camposExtra.push(['Línea de captura', d.linea_captura, true]);
  if (d.importe != null) camposExtra.push(['Importe', formatearMoneda(d.importe), false]);
  if (d.monto != null) camposExtra.push(['Monto', formatearMoneda(d.monto), false]);
  if (d.servicio) camposExtra.push(['Servicio', d.servicio, false]);
  if (d.responsable) camposExtra.push(['Responsable', d.responsable, false]);
  if (d.vigencia) camposExtra.push(['Vigencia', d.vigencia, false]);
  if (d.metodo_pago) camposExtra.push(['Método de pago', d.metodo_pago, false]);
  if (d.referencia) camposExtra.push(['Referencia', d.referencia, true]);
  if (d.impuesto) camposExtra.push(['Impuesto', d.impuesto, false]);

  return `
    <div class="documento-card con-check">
      <input type="checkbox" class="documento-check" data-id="${d.id}" ${estado.seleccion.has(d.id) ? 'checked' : ''} aria-label="Seleccionar ${escaparHtml(d.nombre)}">
      <div class="documento-card-top">
        <h4>${escaparHtml(d.nombre || 'Documento')}</h4>
        ${esReciente(d.fecha) ? '<span class="doc-reciente">Nuevo</span>' : ''}
      </div>
      <div class="documento-meta-lista">
        <div class="fila"><span class="clave">Fecha</span><span class="valor">${formatearFecha(d.fecha)}</span></div>
        <div class="fila"><span class="clave">Tipo</span><span class="valor">${escaparHtml(d.tipo || '—')}</span></div>
        <div class="fila"><span class="clave">Estatus</span><span class="valor">${badgeEstatus(d.estatus)}</span></div>
        ${camposExtra.map(([clave, valor, mono]) => `<div class="fila"><span class="clave">${clave}</span><span class="valor ${mono ? 'mono' : ''}">${escaparHtml(valor)}</span></div>`).join('')}
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
        <thead>
          <tr>
            <th></th>
            <th>Nombre</th>
            <th>Periodo</th>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Estatus</th>
            <th>Subido por</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(d => `
            <tr>
              <td><input type="checkbox" class="documento-check" data-id="${d.id}" ${estado.seleccion.has(d.id) ? 'checked' : ''}></td>
              <td class="col-nombre">${escaparHtml(d.nombre || 'Documento')}</td>
              <td>${escaparHtml(d.subcategoria || '—')}</td>
              <td>${formatearFecha(d.fecha)}</td>
              <td>${escaparHtml(d.tipo || '—')}</td>
              <td>${badgeEstatus(d.estatus)}</td>
              <td>${escaparHtml(d.subido_por || '—')}</td>
              <td>
                <div class="col-acciones">
                  <button type="button" class="documento-acciones-btn" data-accion="ver" data-id="${d.id}">Ver</button>
                  <button type="button" class="documento-acciones-btn" data-accion="descargar" data-id="${d.id}">Descargar</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  contenedorDocumentosEl.querySelectorAll('[data-accion="ver"]').forEach(btn => {
    btn.addEventListener('click', () => abrirVistaPrevia(buscarDocumento(btn.dataset.id)));
  });
  contenedorDocumentosEl.querySelectorAll('[data-accion="descargar"]').forEach(btn => {
    btn.addEventListener('click', () => descargarDocumento(buscarDocumento(btn.dataset.id)));
  });
  contenedorDocumentosEl.querySelectorAll('.documento-check').forEach(chk => {
    chk.addEventListener('change', () => {
      if (chk.checked) estado.seleccion.add(chk.dataset.id);
      else estado.seleccion.delete(chk.dataset.id);
      actualizarBarraSeleccion();
    });
  });
}

function buscarDocumento(id) {
  return estado.documentos.find(d => String(d.id) === String(id));
}

function actualizarBarraSeleccion() {
  contadorSeleccionEl.textContent = estado.seleccion.size;
  btnDescargaMultipleEl.disabled = estado.seleccion.size === 0;
}

// =====================================================
// Vista previa / descarga / historial
// =====================================================
function registrarHistorial(doc) {
  const historial = JSON.parse(localStorage.getItem('imc_historial_documentos') || '[]');
  const entrada = { id: doc.id, nombre: doc.nombre, categoria: doc.categoria, fecha_consulta: new Date().toISOString() };
  const filtrado = historial.filter(h => h.id !== doc.id);
  filtrado.unshift(entrada);
  localStorage.setItem('imc_historial_documentos', JSON.stringify(filtrado.slice(0, 8)));
  renderHistorial();
}

function renderHistorial() {
  const historial = JSON.parse(localStorage.getItem('imc_historial_documentos') || '[]');
  if (historial.length === 0) {
    historialListaEl.innerHTML = '<li class="historial-vacio">Aún no has abierto documentos.</li>';
    return;
  }
  historialListaEl.innerHTML = historial.map(h => {
    const cat = CATEGORIAS.find(c => c.id === h.categoria);
    const hora = new Date(h.fecha_consulta).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<li class="historial-item"><span class="h-nombre">${escaparHtml(h.nombre || 'Documento')}</span><span class="h-meta">${cat ? cat.nombre : ''} · ${hora}</span></li>`;
  }).join('');
}

function abrirVistaPrevia(doc) {
  if (!doc) return;
  modalTituloEl.textContent = doc.nombre || 'Documento';
  modalSubtituloEl.textContent = `${formatearFecha(doc.fecha)} · ${doc.tipo || 'PDF'}`;

  const url = doc.url_archivo;
  if (!url || url === '#') {
    modalIframeEl.removeAttribute('src');
    modalIframeEl.srcdoc = `
      <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#647069;background:#EAEFEC;">
        <p style="text-align:center;max-width:340px;">Vista previa de ejemplo.<br>Conecta el archivo real (Supabase Storage) en <code>url_archivo</code> para mostrarlo aquí.</p>
      </body>`;
  } else {
    modalIframeEl.removeAttribute('srcdoc');
    modalIframeEl.src = url;
  }

  modalDescargarEl.href = (url && url !== '#') ? url : '#';
  modalEl.classList.add('abierto');
  registrarHistorial(doc);
}

function cerrarVistaPrevia() {
  modalEl.classList.remove('abierto');
  modalIframeEl.removeAttribute('src');
  modalIframeEl.srcdoc = '';
}

function descargarDocumento(doc) {
  if (!doc) return;
  registrarHistorial(doc);
  if (!doc.url_archivo || doc.url_archivo === '#') {
    mostrarToast(`Descarga de ejemplo: ${doc.nombre}`);
    return;
  }
  const a = document.createElement('a');
  a.href = doc.url_archivo;
  a.download = doc.nombre || 'documento.pdf';
  a.click();
}

// =====================================================
// Eventos de la barra de herramientas
// =====================================================
selectorClienteEl.addEventListener('change', () => cargarDocumentosDeCliente(selectorClienteEl.value));
buscadorEl.addEventListener('input', renderPanel);
filtroAnioEl.addEventListener('change', renderPanel);
filtroTipoEl.addEventListener('change', renderPanel);
ordenarFechaEl.addEventListener('change', renderPanel);
filtroRecientesEl.addEventListener('change', renderPanel);

vistaTarjetasBtn.addEventListener('click', () => cambiarVista('tarjetas'));
vistaTablaBtn.addEventListener('click', () => cambiarVista('tabla'));
function cambiarVista(v) {
  estado.vista = v;
  localStorage.setItem('imc_vista_documentos', v);
  vistaTarjetasBtn.classList.toggle('activo', v === 'tarjetas');
  vistaTablaBtn.classList.toggle('activo', v === 'tabla');
  renderPanel();
}
cambiarVista(estado.vista);

btnDescargaMultipleEl.addEventListener('click', () => {
  const docs = [...estado.seleccion].map(buscarDocumento).filter(Boolean);
  docs.forEach(descargarDocumento);
  mostrarToast(`${docs.length} documento(s) descargado(s)`);
  estado.seleccion.clear();
  renderPanel();
});

modalCerrarEl.addEventListener('click', cerrarVistaPrevia);
modalEl.addEventListener('click', (e) => { if (e.target === modalEl) cerrarVistaPrevia(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarVistaPrevia(); });

document.getElementById('btnCerrarSesion').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

if (btnMenuMovilEl && dashboardShellEl) {
  btnMenuMovilEl.addEventListener('click', () => dashboardShellEl.classList.toggle('menu-abierto'));
}
if (sidebarOverlayEl && dashboardShellEl) {
  sidebarOverlayEl.addEventListener('click', () => dashboardShellEl.classList.remove('menu-abierto'));
}

renderHistorial();
inicializar();
