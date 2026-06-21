// =====================================================
// Subir documento - Portal de Clientes IM Servicios Contables
// =====================================================
// Esta página:
//  1) Verifica sesión y que el usuario sea administrador
//     (misma lógica de esAdmin() que dashboard.js).
//  2) Sube el archivo elegido al bucket de Supabase Storage
//     llamado "documentos".
//  3) Inserta una fila en la tabla "documentos" con la URL
//     pública del archivo y los campos capturados en el
//     formulario, usando los mismos nombres de columna que
//     espera documentos.js (ver el comentario al inicio de
//     ese archivo para la lista completa).
//
// REQUISITOS EN SUPABASE (una sola vez):
//  - Bucket de Storage llamado "documentos" (puede ser público,
//    o privado con una política de Storage que permita leer a
//    usuarios autenticados — ajusta getPublicUrl/createSignedUrl
//    según lo que elijas).
//  - Las columnas listadas en documentos.js agregadas a la
//    tabla "documentos" (categoria, subcategoria, nombre, fecha,
//    tipo, estatus, observaciones, subido_por, url_archivo,
//    linea_captura, importe, servicio, vigencia, responsable,
//    metodo_pago, referencia, monto, impuesto).
// =====================================================

const BUCKET_DOCUMENTOS = 'documentos';

// ---- DOM: encabezado ----
const nombreUsuarioEl = document.getElementById('nombreUsuario');
const rolUsuarioEl = document.getElementById('rolUsuario');
const avatarUsuarioEl = document.getElementById('avatarUsuario');
const dashboardShellEl = document.getElementById('dashboardShell');
const sidebarOverlayEl = document.getElementById('sidebarOverlay');
const btnMenuMovilEl = document.getElementById('btnMenuMovil');

// ---- DOM: estados de acceso ----
const estadoCargaPermisoEl = document.getElementById('estadoCargaPermiso');
const bloqueSinPermisoEl = document.getElementById('bloqueSinPermiso');
const formEl = document.getElementById('formSubirDocumento');

// ---- DOM: formulario ----
const campoClienteEl = document.getElementById('campoCliente');
const campoCategoriaEl = document.getElementById('campoCategoria');
const campoSubcategoriaWrapEl = document.getElementById('campoSubcategoriaWrap');
const campoSubcategoriaEl = document.getElementById('campoSubcategoria');
const campoNombreEl = document.getElementById('campoNombre');
const campoFechaEl = document.getElementById('campoFecha');
const campoEstatusEl = document.getElementById('campoEstatus');
const campoObservacionesEl = document.getElementById('campoObservaciones');
const camposExtraContainerEl = document.getElementById('camposExtraContainer');
const campoArchivoEl = document.getElementById('campoArchivo');
const campoSubidoPorEl = document.getElementById('campoSubidoPor');
const btnSubirEl = document.getElementById('btnSubir');
const mensajeFormularioEl = document.getElementById('mensajeFormulario');

// =====================================================
// Catálogo de categorías (debe coincidir con documentos.js)
// =====================================================
const CATEGORIAS = [
  { id: 'acuses', nombre: 'Acuses y líneas de captura', agrupa: 'mes' },
  { id: 'presupuestos', nombre: 'Presupuestos' },
  { id: 'opinion', nombre: 'Opinión de cumplimiento' },
  { id: 'detalle_opinion', nombre: 'Detalle de opinión de cumplimiento' },
  { id: 'tramites', nombre: 'Documentos de trámites' },
  { id: 'acuerdo', nombre: 'Acuerdo de servicio' },
  { id: 'remisiones', nombre: 'Remisiones semanales', agrupa: 'semana' },
  { id: 'pagos_im', nombre: 'Pagos a IM Servicios Contables' },
  { id: 'pagos_declaraciones', nombre: 'Pagos con saldo a cargo', agrupa: 'mes' },
];

const ORDEN_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const ORDEN_SEMANAS = ['Semana 1','Semana 2','Semana 3','Semana 4'];

// Campos adicionales por categoría (deben coincidir con los que
// documentos.js sabe mostrar en cada tarjeta).
const CAMPOS_EXTRA = {
  acuses: [{ key: 'linea_captura', label: 'Línea de captura', type: 'text' }],
  presupuestos: [
    { key: 'servicio', label: 'Servicio cotizado', type: 'text' },
    { key: 'importe', label: 'Importe (MXN)', type: 'number' },
  ],
  opinion: [{ key: 'vigencia', label: 'Vigencia', type: 'text' }],
  detalle_opinion: [],
  tramites: [{ key: 'responsable', label: 'Responsable', type: 'text' }],
  acuerdo: [{ key: 'vigencia', label: 'Vigencia', type: 'text' }],
  remisiones: [],
  pagos_im: [
    { key: 'monto', label: 'Monto (MXN)', type: 'number' },
    { key: 'metodo_pago', label: 'Método de pago', type: 'text' },
    { key: 'referencia', label: 'Referencia', type: 'text' },
  ],
  pagos_declaraciones: [
    { key: 'impuesto', label: 'Impuesto', type: 'text' },
    { key: 'importe', label: 'Importe (MXN)', type: 'number' },
    { key: 'linea_captura', label: 'Línea de captura', type: 'text' },
  ],
};

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
function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}
function mostrarMensaje(texto, tipo) {
  mensajeFormularioEl.textContent = texto;
  mensajeFormularioEl.className = `mensaje-formulario ${tipo || ''}`;
}

// =====================================================
// Verificación de sesión y rol de administrador
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

  estadoCargaPermisoEl.style.display = 'none';

  if (errorUsuario || !usuario) {
    bloqueSinPermisoEl.style.display = 'block';
    return;
  }

  nombreUsuarioEl.textContent = usuario.email;
  rolUsuarioEl.textContent = usuario.rol;
  if (avatarUsuarioEl) avatarUsuarioEl.textContent = generarIniciales(usuario.email);

  if (!esAdmin(usuario.rol)) {
    bloqueSinPermisoEl.style.display = 'block';
    return;
  }

  if (dashboardShellEl) dashboardShellEl.classList.add('es-admin');

  // Carga de clientes activos (admin ve todos, igual que dashboard.js)
  const { data: clientes, error: errorClientes } = await supabaseClient
    .from('clientes')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre');

  if (errorClientes || !clientes || clientes.length === 0) {
    mostrarMensaje('No se pudieron cargar los clientes. Verifica la conexión con Supabase.', 'error');
    return;
  }

  campoClienteEl.innerHTML = clientes.map(c => `<option value="${c.id}">${escaparHtml(c.nombre)}</option>`).join('');
  campoCategoriaEl.innerHTML = CATEGORIAS.map(c => `<option value="${c.id}">${escaparHtml(c.nombre)}</option>`).join('');
  campoSubidoPorEl.value = usuario.email;
  campoFechaEl.value = new Date().toISOString().slice(0, 10);

  actualizarCamposSegunCategoria();

  formEl.style.display = 'flex';
}

// =====================================================
// Campos dinámicos: periodo (mes/semana) y campos extra
// =====================================================
function actualizarCamposSegunCategoria() {
  const cat = CATEGORIAS.find(c => c.id === campoCategoriaEl.value) || CATEGORIAS[0];

  if (cat.agrupa === 'mes') {
    campoSubcategoriaWrapEl.style.display = 'flex';
    campoSubcategoriaEl.required = true;
    campoSubcategoriaEl.innerHTML = ORDEN_MESES.map(m => `<option value="${m}">${m}</option>`).join('');
  } else if (cat.agrupa === 'semana') {
    campoSubcategoriaWrapEl.style.display = 'flex';
    campoSubcategoriaEl.required = true;
    campoSubcategoriaEl.innerHTML = ORDEN_SEMANAS.map(s => `<option value="${s}">${s}</option>`).join('');
  } else {
    campoSubcategoriaWrapEl.style.display = 'none';
    campoSubcategoriaEl.required = false;
    campoSubcategoriaEl.innerHTML = '';
  }

  const extras = CAMPOS_EXTRA[cat.id] || [];
  camposExtraContainerEl.innerHTML = extras.map(campo => `
    <div class="campo">
      <label for="extra_${campo.key}">${campo.label}</label>
      <input type="${campo.type}" id="extra_${campo.key}" data-campo-extra="${campo.key}" ${campo.type === 'number' ? 'step="0.01"' : ''}>
    </div>
  `).join('');
}

campoCategoriaEl.addEventListener('change', actualizarCamposSegunCategoria);

// =====================================================
// Subida de archivo + inserción del registro
// =====================================================
function tipoDesdeArchivo(file) {
  if (!file) return 'Documento';
  if (file.type === 'application/pdf') return 'PDF';
  if (file.type.startsWith('image/')) return 'Imagen';
  return file.name.split('.').pop().toUpperCase();
}

function rutaStorage(clienteId, categoria, file) {
  const limpio = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${clienteId}/${categoria}/${Date.now()}-${limpio}`;
}

formEl.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mostrarMensaje('', '');

  const file = campoArchivoEl.files[0];
  if (!file) {
    mostrarMensaje('Selecciona un archivo antes de subir.', 'error');
    return;
  }

  btnSubirEl.disabled = true;
  mostrarMensaje('Subiendo archivo…', '');

  const clienteId = campoClienteEl.value;
  const categoria = campoCategoriaEl.value;
  const ruta = rutaStorage(clienteId, categoria, file);

  const { error: errorSubida } = await supabaseClient
    .storage
    .from(BUCKET_DOCUMENTOS)
    .upload(ruta, file, { upsert: false });

  if (errorSubida) {
    console.error('Error subiendo archivo:', errorSubida);
    mostrarMensaje('No se pudo subir el archivo. Revisa que el bucket "documentos" exista en Supabase Storage.', 'error');
    btnSubirEl.disabled = false;
    return;
  }

  const { data: urlData } = supabaseClient.storage.from(BUCKET_DOCUMENTOS).getPublicUrl(ruta);
  const urlArchivo = urlData ? urlData.publicUrl : null;

  const fila = {
    cliente_id: clienteId,
    categoria,
    subcategoria: campoSubcategoriaEl.value || null,
    nombre: campoNombreEl.value.trim(),
    fecha: campoFechaEl.value,
    tipo: tipoDesdeArchivo(file),
    estatus: campoEstatusEl.value.trim() || null,
    observaciones: campoObservacionesEl.value.trim() || null,
    subido_por: campoSubidoPorEl.value,
    url_archivo: urlArchivo,
  };

  camposExtraContainerEl.querySelectorAll('[data-campo-extra]').forEach(input => {
    const valor = input.value.trim();
    if (valor !== '') {
      fila[input.dataset.campoExtra] = input.type === 'number' ? Number(valor) : valor;
    }
  });

  const { error: errorInsert } = await supabaseClient.from('documentos').insert([fila]);

  btnSubirEl.disabled = false;

  if (errorInsert) {
    console.error('Error guardando el documento:', errorInsert);
    mostrarMensaje('El archivo se subió, pero no se pudo guardar el registro. Verifica que la tabla "documentos" tenga las columnas necesarias (ver comentario al inicio de este archivo).', 'error');
    return;
  }

  mensajeFormularioEl.innerHTML = `Documento subido correctamente. <a href="documentos.html?cliente_id=${encodeURIComponent(clienteId)}&categoria=${encodeURIComponent(categoria)}" style="color:inherit;text-decoration:underline;">Verlo en Documentos →</a>`;
  mensajeFormularioEl.className = 'mensaje-formulario exito';
  formEl.reset();
  campoSubidoPorEl.value = fila.subido_por;
  campoFechaEl.value = new Date().toISOString().slice(0, 10);
  actualizarCamposSegunCategoria();
});

// =====================================================
// Sesión y menú móvil
// =====================================================
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

inicializar();
