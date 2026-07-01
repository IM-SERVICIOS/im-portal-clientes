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

// --- Acciones Administrativas (solo rol "admin") ---
const seccionAccionesAdminEl       = document.getElementById('seccionAccionesAdmin');
const chkGenerarDeclaracionEl      = document.getElementById('chkGenerarDeclaracion');
const chkGenerarHonorarioEl        = document.getElementById('chkGenerarHonorario');
const campoMontoHonorarioWrapEl    = document.getElementById('campoMontoHonorarioWrap');
const campoMontoHonorarioEl        = document.getElementById('campoMontoHonorario');
const campoConceptoHonorarioWrapEl = document.getElementById('campoConceptoHonorarioWrap');
const campoConceptoHonorarioEl     = document.getElementById('campoConceptoHonorario');
const campoEstadoHonorarioWrapEl   = document.getElementById('campoEstadoHonorarioWrap');
const campoEstadoHonorarioEl       = document.getElementById('campoEstadoHonorario');

// Usuario autenticado actual (se llena en inicializar()). Se usa como
// segunda capa de protección en el frontend para las Acciones
// Administrativas; la protección real vive en las políticas RLS de
// Supabase (ver setup_acciones_administrativas.sql).
let usuarioActual = null;

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
// Coincidencia exacta con el rol "admin" (no incluye "supervisor" ni "cliente").
// Se usa para decidir si se muestra la sección "Acciones Administrativas".
function esRolExactoAdmin(rol) { return typeof rol === 'string' && rol.trim().toLowerCase() === 'admin'; }
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

  usuarioActual = usuario;

  // Cualquier rol autenticado y válido (admin, supervisor, cliente) puede
  // usar el formulario de "Subir documento". Ya NO se bloquea por rol aquí;
  // el bloqueo previo (bloqueSinPermiso) ahora solo aplica si no se encontró
  // el usuario en la tabla "usuarios" (ver arriba: error || !usuario).

  // "Acciones Administrativas" (Declaraciones/Honorarios) sigue siendo
  // exclusiva del rol "admin". Para todos los demás roles la sección
  // permanece oculta y no puede afectar esas tablas.
  const esAdministrador = esRolExactoAdmin(usuario.rol);
  if (dashboardShellEl) dashboardShellEl.classList.toggle('es-admin', esAdministrador);

  if (seccionAccionesAdminEl) {
    seccionAccionesAdminEl.style.display = esAdministrador ? 'block' : 'none';
  }

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
// Acciones Administrativas (solo admin)
// Genera automáticamente registros en "declaraciones" y/o "honorarios"
// al terminar de subir el documento. Ver ejecutarAccionesAdministrativas()
// más abajo para el flujo completo y las validaciones de seguridad.
// =====================================================
if (chkGenerarHonorarioEl) {
  chkGenerarHonorarioEl.addEventListener('change', () => {
    const mostrar = chkGenerarHonorarioEl.checked;
    if (campoConceptoHonorarioWrapEl) campoConceptoHonorarioWrapEl.style.display = mostrar ? 'flex' : 'none';
    if (campoMontoHonorarioWrapEl)    campoMontoHonorarioWrapEl.style.display    = mostrar ? 'flex' : 'none';
    if (campoEstadoHonorarioWrapEl)   campoEstadoHonorarioWrapEl.style.display   = mostrar ? 'flex' : 'none';

    // El monto es obligatorio solo cuando se va a generar el honorario.
    if (campoMontoHonorarioEl) campoMontoHonorarioEl.required = mostrar;

    if (!mostrar) {
      if (campoConceptoHonorarioEl) campoConceptoHonorarioEl.value = '';
      if (campoMontoHonorarioEl)    campoMontoHonorarioEl.value    = '';
      if (campoEstadoHonorarioEl)   campoEstadoHonorarioEl.value   = 'Pendiente';
    }
  });
}

// Devuelve un objeto con los valores elegidos en "Acciones Administrativas".
function obtenerAccionesAdministrativas() {
  const generarDeclaracion = !!(chkGenerarDeclaracionEl && chkGenerarDeclaracionEl.checked);
  const generarHonorario   = !!(chkGenerarHonorarioEl && chkGenerarHonorarioEl.checked);

  return {
    generar_declaracion: generarDeclaracion,
    generar_honorario:   generarHonorario,
    honorario: generarHonorario ? {
      concepto: campoConceptoHonorarioEl ? campoConceptoHonorarioEl.value.trim() : '',
      monto:    campoMontoHonorarioEl ? (parseFloat(campoMontoHonorarioEl.value) || null) : null,
      estado:   campoEstadoHonorarioEl ? campoEstadoHonorarioEl.value : 'Pendiente',
    } : null,
  };
}

// Restablece la sección a su estado inicial (usado tras subir un documento).
function reiniciarAccionesAdministrativas() {
  if (chkGenerarDeclaracionEl) chkGenerarDeclaracionEl.checked = false;
  if (chkGenerarHonorarioEl)   chkGenerarHonorarioEl.checked   = false;
  if (campoConceptoHonorarioWrapEl) campoConceptoHonorarioWrapEl.style.display = 'none';
  if (campoMontoHonorarioWrapEl)    campoMontoHonorarioWrapEl.style.display    = 'none';
  if (campoEstadoHonorarioWrapEl)   campoEstadoHonorarioWrapEl.style.display   = 'none';
  if (campoConceptoHonorarioEl) campoConceptoHonorarioEl.value = '';
  if (campoMontoHonorarioEl)  { campoMontoHonorarioEl.value = ''; campoMontoHonorarioEl.required = false; }
  if (campoEstadoHonorarioEl)   campoEstadoHonorarioEl.value   = 'Pendiente';
}

// =====================================================
// Cálculo de "periodo" (ejercicio + mes) a partir del formulario.
// Las tablas reales no tienen una sola columna "periodo": usan
// "ejercicio" (año) y "mes" por separado, con tipos distintos:
//   declaraciones.mes → character varying (se guarda el nombre, ej. "Mayo")
//   honorarios.mes    → smallint (se guarda el número 1-12)
// Si la categoría del documento agrupa por mes/semana y el usuario
// eligió un mes en "Periodo", se usa ese mes; si no, se usa el mes de
// la fecha del documento.
// =====================================================
function calcularPeriodoDesdeFormulario() {
  const valorFecha = campoFechaEl.value ? new Date(`${campoFechaEl.value}T00:00:00`) : new Date();
  const ejercicio  = valorFecha.getFullYear();
  let mesNumero    = valorFecha.getMonth() + 1; // 1-12, por defecto según la fecha

  const categoriaActual = CATEGORIAS.find(c => c.id === campoCategoriaEl.value);
  if (categoriaActual?.agrupa === 'mes' && campoSubcategoriaEl.value) {
    const indiceMes = ORDEN_MESES.indexOf(campoSubcategoriaEl.value);
    if (indiceMes !== -1) mesNumero = indiceMes + 1;
  }

  return {
    ejercicio,
    mesNumero,                       // para honorarios.mes (smallint)
    mesNombre: ORDEN_MESES[mesNumero - 1], // para declaraciones.mes (varchar)
  };
}

// =====================================================
// Inserta el registro en "declaraciones" a partir de los datos del
// formulario de "Subir documento". Solo se llama si:
//   1) el usuario autenticado es admin (verificado con datos de Supabase,
//      no con el estado del checkbox en pantalla), y
//   2) la subida del documento ya fue exitosa.
// La protección definitiva contra usuarios no-admin vive en las
// políticas RLS de Supabase (ver setup_acciones_administrativas.sql).
// =====================================================
async function crearRegistroDeclaracion({ clienteId, categoriaNombre, periodo, rutaArchivo }) {
  const fila = {
    cliente_id:         Number(clienteId),
    ejercicio:          periodo.ejercicio,
    mes:                periodo.mesNombre,
    tipo_declaracion:   categoriaNombre,
    fecha_presentacion: campoFechaEl.value,
    // columnas enriquecidas (ver ALTER TABLE en setup_acciones_administrativas.sql)
    nombre_documento:   campoNombreEl.value.trim(),
    observaciones:      campoObservacionesEl.value.trim() || null,
    archivo_relacionado: rutaArchivo || null,
    creado_por:         usuarioActual.email,
  };

  return supabaseClient.from('declaraciones').insert([fila]);
}

// =====================================================
// Inserta el registro en "honorarios". Misma protección que la función
// anterior: solo se invoca si el usuario autenticado es admin y ya se
// subió el documento correctamente.
// =====================================================
async function crearRegistroHonorario({ clienteId, periodo, honorario }) {
  const esPagado = honorario.estado === 'Pagado';

  const fila = {
    cliente_id:    Number(clienteId),
    ejercicio:     periodo.ejercicio,
    mes:           periodo.mesNumero,
    concepto:      honorario.concepto || campoNombreEl.value.trim(),
    monto:         honorario.monto,
    estatus_pago:  honorario.estado,
    fecha_remision: campoFechaEl.value,
    fecha_pago:    esPagado ? campoFechaEl.value : null,
    // columna enriquecida (ver ALTER TABLE en setup_acciones_administrativas.sql)
    creado_por:    usuarioActual.email,
  };

  return supabaseClient.from('honorarios').insert([fila]);
}

// =====================================================
// Orquesta la creación de Declaraciones/Honorarios según lo marcado
// en "Acciones Administrativas". Devuelve un arreglo de mensajes de
// error (vacío si todo salió bien) para que el submit los muestre.
// =====================================================
async function ejecutarAccionesAdministrativas({ clienteId, categoriaNombre, rutaArchivo }) {
  const errores = [];

  // Segunda verificación de rol en el frontend (defensa en profundidad).
  // La verificación real e infranqueable está en las políticas RLS.
  if (!usuarioActual || !esRolExactoAdmin(usuarioActual.rol)) {
    return errores; // No es admin: no se intenta nada, sin mostrar error.
  }

  const acciones = obtenerAccionesAdministrativas();
  if (!acciones.generar_declaracion && !acciones.generar_honorario) {
    return errores; // No se marcó ninguna acción.
  }

  const periodo = calcularPeriodoDesdeFormulario();

  if (acciones.generar_declaracion) {
    const { error } = await crearRegistroDeclaracion({ clienteId, categoriaNombre, periodo, rutaArchivo });
    if (error) {
      console.error('Error creando registro en declaraciones:', error);
      errores.push(`No se pudo crear el registro en Declaraciones: ${error.message}`);
    }
  }

  if (acciones.generar_honorario) {
    if (!acciones.honorario.monto || acciones.honorario.monto <= 0) {
      errores.push('No se creó el registro en Honorarios: el Monto es obligatorio y debe ser mayor a 0.');
    } else {
      const { error } = await crearRegistroHonorario({ clienteId, periodo, honorario: acciones.honorario });
      if (error) {
        console.error('Error creando registro en honorarios:', error);
        errores.push(`No se pudo crear el registro en Honorarios: ${error.message}`);
      }
    }
  }

  return errores;
}

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

  // Acciones Administrativas: SOLO se ejecutan si el documento ya se
  // subió y se guardó correctamente (requisito 3). Si el rol no es admin,
  // ejecutarAccionesAdministrativas() no hace nada (requisito 5).
  const erroresAccionesAdmin = await ejecutarAccionesAdministrativas({
    clienteId,
    categoriaNombre: (CATEGORIAS.find(c => c.id === categoria) || {}).nombre || categoria,
    rutaArchivo: ruta,
  });

  const clienteNombre = campoClienteEl.options[campoClienteEl.selectedIndex].text;
  let mensajeFinal =
    `Documento subido correctamente para <strong>${escaparHtml(clienteNombre)}</strong>. ` +
    `<a href="documentos.html?cliente_id=${encodeURIComponent(clienteId)}&categoria=${encodeURIComponent(categoria)}" style="color:inherit;text-decoration:underline;">Verlo en Documentos →</a>`;

  if (erroresAccionesAdmin.length) {
    // El documento SÍ se subió; solo Declaraciones/Honorarios tuvieron problemas.
    mensajeFinal += `<br><br><strong>Atención:</strong><ul style="margin:6px 0 0 18px;padding:0;">` +
      erroresAccionesAdmin.map(e => `<li>${escaparHtml(e)}</li>`).join('') + `</ul>`;
    mostrarMensaje(mensajeFinal, 'error');
  } else {
    mostrarMensaje(mensajeFinal, 'exito');
  }

  formEl.reset();
  campoSubidoPorEl.value = fila.subido_por;
  campoFechaEl.value     = new Date().toISOString().slice(0, 10);
  actualizarCamposSegunCategoria();
  reiniciarAccionesAdministrativas();
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
