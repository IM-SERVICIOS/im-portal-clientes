// =====================================================
// Subir documento - Portal de Clientes IM Servicios Contables
// =====================================================
// COLUMNAS REALES DE LA TABLA "documentos":
//   identificacion  → PK (auto)
//   id_cliente      → FK (usa este, NO cliente_id)
//   tipo_documento  → se mapea a "categoria"
//   nombre_archivo  → nombre visible
//   url_archivo     → RUTA en Storage (NO URL pública)
//
// BUCKET PRIVADO: se guarda solo la RUTA relativa del archivo
// (ej. "42/acuses/1750000000-acuse.pdf").
// documentos.js genera URLs firmadas al vuelo para Ver/Descargar.
//
// PARA CREAR EL BUCKET EN SUPABASE:
//  Storage → New bucket → nombre: "documentos" → NO marcar "Public" → Save
//  Luego en Policies del bucket, agregar política para que
//  usuarios autenticados puedan INSERT y SELECT:
//    INSERT: (auth.role() = 'authenticated')
//    SELECT: (auth.role() = 'authenticated')
// =====================================================

const BUCKET_DOCUMENTOS = 'documentos';

const nombreUsuarioEl       = document.getElementById('nombreUsuario');
const rolUsuarioEl          = document.getElementById('rolUsuario');
const avatarUsuarioEl       = document.getElementById('avatarUsuario');
const dashboardShellEl      = document.getElementById('dashboardShell');
const sidebarOverlayEl      = document.getElementById('sidebarOverlay');
const btnMenuMovilEl        = document.getElementById('btnMenuMovil');

const estadoCargaPermisoEl  = document.getElementById('estadoCargaPermiso');
const bloqueSinPermisoEl    = document.getElementById('bloqueSinPermiso');
const formEl                = document.getElementById('formSubirDocumento');

const campoClienteEl            = document.getElementById('campoCliente');
const campoCategoriaEl          = document.getElementById('campoCategoria');
const campoSubcategoriaWrapEl   = document.getElementById('campoSubcategoriaWrap');
const campoSubcategoriaEl       = document.getElementById('campoSubcategoria');
const campoNombreEl             = document.getElementById('campoNombre');
const campoFechaEl              = document.getElementById('campoFecha');
const campoEstatusEl            = document.getElementById('campoEstatus');
const campoObservacionesEl      = document.getElementById('campoObservaciones');
const camposExtraContainerEl    = document.getElementById('camposExtraContainer');
const campoArchivoEl            = document.getElementById('campoArchivo');
const campoSubidoPorEl          = document.getElementById('campoSubidoPor');
const btnSubirEl                = document.getElementById('btnSubir');
const mensajeFormularioEl       = document.getElementById('mensajeFormulario');

const CATEGORIAS = [
  { id: 'acuses',              nombre: 'Acuses y líneas de captura',         agrupa: 'mes'    },
  { id: 'presupuestos',        nombre: 'Presupuestos'                                         },
  { id: 'opinion',             nombre: 'Opinión de cumplimiento'                               },
  { id: 'detalle_opinion',     nombre: 'Detalle de opinión de cumplimiento'                    },
  { id: 'tramites',            nombre: 'Documentos de trámites'                                },
  { id: 'acuerdo',             nombre: 'Acuerdo de servicio'                                   },
  { id: 'remisiones',          nombre: 'Remisiones semanales',               agrupa: 'semana' },
  { id: 'pagos_im',            nombre: 'Pagos a IM Servicios Contables'                        },
  { id: 'pagos_declaraciones', nombre: 'Pagos con saldo a cargo',            agrupa: 'mes'    },
];

const ORDEN_MESES   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const ORDEN_SEMANAS = ['Semana 1','Semana 2','Semana 3','Semana 4'];

const CAMPOS_EXTRA = {
  acuses:              [{ key: 'linea_captura', label: 'Línea de captura', type: 'text' }],
  presupuestos:        [{ key: 'servicio', label: 'Servicio cotizado', type: 'text' }, { key: 'importe', label: 'Importe (MXN)', type: 'number' }],
  opinion:             [{ key: 'vigencia', label: 'Vigencia', type: 'text' }],
  detalle_opinion:     [],
  tramites:            [{ key: 'responsable', label: 'Responsable', type: 'text' }],
  acuerdo:             [{ key: 'vigencia', label: 'Vigencia', type: 'text' }],
  remisiones:          [],
  pagos_im:            [{ key: 'monto', label: 'Monto (MXN)', type: 'number' }, { key: 'metodo_pago', label: 'Método de pago', type: 'text' }, { key: 'referencia', label: 'Referencia', type: 'text' }],
  pagos_declaraciones: [{ key: 'impuesto', label: 'Impuesto', type: 'text' }, { key: 'importe', label: 'Importe (MXN)', type: 'number' }, { key: 'linea_captura', label: 'Línea de captura', type: 'text' }],
};

function esAdmin(rol) { return typeof rol === 'string' && rol.trim().toLowerCase().startsWith('admin'); }
function generarIniciales(correo) {
  if (!correo || !correo.includes('@')) return '··';
  const partes = correo.split('@')[0].split(/[.\-_]+/).filter(Boolean);
  return partes.length >= 2 ? (partes[0][0] + partes[1][0]).toUpperCase() : correo.slice(0, 2).toUpperCase();
}
function escaparHtml(t) { const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
function mostrarMensaje(texto, tipo) {
  mensajeFormularioEl.innerHTML  = texto;
  mensajeFormularioEl.className  = `mensaje-formulario ${tipo || ''}`;
}

// =====================================================
// Verificación de sesión y rol administrador
// =====================================================
async function inicializar() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }

  const { data: usuario, error } = await supabaseClient
    .from('usuarios').select('id, email, rol')
    .eq('auth_user_id', session.user.id).single();

  estadoCargaPermisoEl.style.display = 'none';

  if (error || !usuario) { bloqueSinPermisoEl.style.display = 'block'; return; }

  nombreUsuarioEl.textContent = usuario.email;
  rolUsuarioEl.textContent    = usuario.rol;
  if (avatarUsuarioEl) avatarUsuarioEl.textContent = generarIniciales(usuario.email);

  if (!esAdmin(usuario.rol)) { bloqueSinPermisoEl.style.display = 'block'; return; }

  if (dashboardShellEl) dashboardShellEl.classList.add('es-admin');

  const { data: clientes, error: errClientes } = await supabaseClient
    .from('clientes').select('id, nombre').eq('activo', true).order('nombre');

  if (errClientes || !clientes?.length) {
    mostrarMensaje('No se pudieron cargar los clientes. Verifica la conexión con Supabase.', 'error');
    return;
  }

  campoClienteEl.innerHTML    = clientes.map(c => `<option value="${c.id}">${escaparHtml(c.nombre)}</option>`).join('');
  campoCategoriaEl.innerHTML  = CATEGORIAS.map(c => `<option value="${c.id}">${escaparHtml(c.nombre)}</option>`).join('');
  campoSubidoPorEl.value      = usuario.email;
  campoFechaEl.value          = new Date().toISOString().slice(0, 10);

  actualizarCamposSegunCategoria();
  formEl.style.display = 'flex';
}

// =====================================================
// Campos dinámicos por categoría
// =====================================================
function actualizarCamposSegunCategoria() {
  const cat = CATEGORIAS.find(c => c.id === campoCategoriaEl.value) || CATEGORIAS[0];

  if (cat.agrupa === 'mes') {
    campoSubcategoriaWrapEl.style.display = 'flex';
    campoSubcategoriaEl.required  = true;
    campoSubcategoriaEl.innerHTML = ORDEN_MESES.map(m => `<option value="${m}">${m}</option>`).join('');
  } else if (cat.agrupa === 'semana') {
    campoSubcategoriaWrapEl.style.display = 'flex';
    campoSubcategoriaEl.required  = true;
    campoSubcategoriaEl.innerHTML = ORDEN_SEMANAS.map(s => `<option value="${s}">${s}</option>`).join('');
  } else {
    campoSubcategoriaWrapEl.style.display = 'none';
    campoSubcategoriaEl.required  = false;
    campoSubcategoriaEl.innerHTML = '';
  }

  const extras = CAMPOS_EXTRA[cat.id] || [];
  camposExtraContainerEl.innerHTML = extras.map(f => `
    <div class="campo">
      <label for="extra_${f.key}">${f.label}</label>
      <input type="${f.type}" id="extra_${f.key}" data-campo-extra="${f.key}" ${f.type === 'number' ? 'step="0.01"' : ''}>
    </div>`).join('');
}

campoCategoriaEl.addEventListener('change', actualizarCamposSegunCategoria);

// =====================================================
// Subida de archivo + inserción del registro
// Usa los nombres REALES de columna de tu tabla:
//   id_cliente, tipo_documento, nombre_archivo, url_archivo
//   + columnas enriquecidas con ALTER TABLE
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

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensaje('', '');

  const file = campoArchivoEl.files[0];
  if (!file) { mostrarMensaje('Selecciona un archivo antes de subir.', 'error'); return; }

  btnSubirEl.disabled = true;
  mostrarMensaje('Subiendo archivo al servidor seguro…', '');

  const clienteId = campoClienteEl.value;
  const categoria = campoCategoriaEl.value;
  const ruta      = rutaStorage(clienteId, categoria, file);

  // 1. Subir al bucket privado
  const { error: errSubida } = await supabaseClient.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(ruta, file, { upsert: false });

  if (errSubida) {
    console.error('Error subiendo:', errSubida);
    const msg = errSubida.message?.includes('Bucket not found')
      ? 'No existe el bucket "documentos" en Supabase Storage. Créalo como privado y vuelve a intentar.'
      : `Error al subir: ${errSubida.message}`;
    mostrarMensaje(msg, 'error');
    btnSubirEl.disabled = false;
    return;
  }

  mostrarMensaje('Archivo subido. Guardando registro…', '');

  // 2. Construir la fila con los nombres REALES de columna
  const fila = {
    id_cliente:     clienteId,           // nombre real en tu tabla
    tipo_documento: categoria,           // nombre real en tu tabla (también guardamos en "categoria" abajo)
    nombre_archivo: campoNombreEl.value.trim(),  // nombre real en tu tabla
    url_archivo:    ruta,                // guardamos la RUTA, no la URL pública
    // columnas enriquecidas (agregadas con ALTER TABLE):
    categoria:      categoria,
    subcategoria:   campoSubcategoriaEl.value || null,
    fecha:          campoFechaEl.value,
    estatus:        campoEstatusEl.value.trim() || null,
    observaciones:  campoObservacionesEl.value.trim() || null,
    subido_por:     campoSubidoPorEl.value,
  };

  // Campos extra según categoría
  camposExtraContainerEl.querySelectorAll('[data-campo-extra]').forEach(input => {
    const v = input.value.trim();
    if (v !== '') fila[input.dataset.campoExtra] = input.type === 'number' ? Number(v) : v;
  });

  const { error: errInsert } = await supabaseClient.from('documentos').insert([fila]);

  btnSubirEl.disabled = false;

  if (errInsert) {
    console.error('Error guardando registro:', errInsert);
    mostrarMensaje(`El archivo se subió a Storage pero no se pudo guardar el registro: ${errInsert.message}. Verifica que la tabla "documentos" tenga todas las columnas del ALTER TABLE.`, 'error');
    return;
  }

  const clienteNombre = campoClienteEl.options[campoClienteEl.selectedIndex].text;
  mostrarMensaje(
    `Documento subido correctamente para <strong>${escaparHtml(clienteNombre)}</strong>. ` +
    `<a href="documentos.html?cliente_id=${encodeURIComponent(clienteId)}&categoria=${encodeURIComponent(categoria)}" style="color:inherit;text-decoration:underline;">Verlo en Documentos →</a>`,
    'exito'
  );

  formEl.reset();
  campoSubidoPorEl.value = fila.subido_por;
  campoFechaEl.value     = new Date().toISOString().slice(0, 10);
  actualizarCamposSegunCategoria();
});

// =====================================================
// Sesión y menú móvil
// =====================================================
document.getElementById('btnCerrarSesion').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

if (btnMenuMovilEl) btnMenuMovilEl.addEventListener('click', () => dashboardShellEl.classList.toggle('menu-abierto'));
if (sidebarOverlayEl) sidebarOverlayEl.addEventListener('click', () => dashboardShellEl.classList.remove('menu-abierto'));

inicializar();
