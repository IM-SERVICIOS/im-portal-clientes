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

// --- Referencias del DOM que existen siempre, independientemente del
// rol o de si el formulario llega a mostrarse (encabezado, estados de
// carga y bloqueo). Se obtienen una sola vez al cargar el script. ---
const nombreUsuarioEl       = document.getElementById('nombreUsuario');
const rolUsuarioEl          = document.getElementById('rolUsuario');
const avatarUsuarioEl       = document.getElementById('avatarUsuario');
const dashboardShellEl      = document.getElementById('dashboardShell');
const sidebarOverlayEl      = document.getElementById('sidebarOverlay');
const btnMenuMovilEl        = document.getElementById('btnMenuMovil');
const btnCerrarSesionEl     = document.getElementById('btnCerrarSesion');

const estadoCargaPermisoEl  = document.getElementById('estadoCargaPermiso');
const bloqueSinPermisoEl    = document.getElementById('bloqueSinPermiso');
const formEl                = document.getElementById('formSubirDocumento');
const mensajeFormularioEl   = document.getElementById('mensajeFormulario');
const seccionAccionesAdminEl = document.getElementById('seccionAccionesAdmin');

// --- Referencias del DOM propias del formulario (campos, selectores y
// Acciones Administrativas). Se obtienen explícitamente en
// obtenerReferenciasDOM(), como parte del flujo de inicializar(), en
// lugar de asumirse disponibles al cargar el script. ---
let campoClienteEl;
let campoCategoriaEl;
let campoSubcategoriaWrapEl;
let campoSubcategoriaEl;
let campoAnioEl;
let campoNombreEl;
let campoFechaEl;
let campoEstatusEl;
let campoObservacionesEl;
let camposExtraContainerEl;
let campoArchivoEl;
let campoSubidoPorEl;
let btnSubirEl;

let chkGenerarDeclaracionEl;
let campoEstatusSatWrapEl;
let campoEstatusSatEl;
let campoMontoPagadoWrapEl;
let campoMontoPagadoEl;
let campoIsrWrapEl;
let campoIsrEl;
let campoIvaWrapEl;
let campoIvaEl;
let chkGenerarHonorarioEl;
let campoMontoHonorarioWrapEl;
let campoMontoHonorarioEl;
let campoConceptoHonorarioWrapEl;
let campoConceptoHonorarioEl;
let campoEstadoHonorarioWrapEl;
let campoEstadoHonorarioEl;

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
// INICIALIZACIÓN DEL MÓDULO
// =====================================================
// Punto de entrada único. Controla todo el arranque de la página en
// un flujo lineal y explícito, sin duplicaciones ni condiciones de
// carrera con el DOM:
//   1.  Verificar sesión
//   2.  Obtener usuario autenticado
//   3.  Obtener rol
//   4.  Mostrar datos del usuario
//   5.  Configurar permisos según el rol
//   6.  Obtener referencias del DOM propias del formulario
//   7.  Inicializar selectores del formulario
//   8.  Poblar selector de Año
//   9.  Poblar selector de Periodo
//   10. Cargar clientes
//   11. Cargar categorías
//   12. Registrar EventListeners
//   13. Mostrar el formulario listo
// =====================================================
async function inicializar() {
  // 1. Verificar sesión
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  // 2. Obtener usuario autenticado / 3. Obtener rol
  const { data: usuario, error } = await supabaseClient
    .from('usuarios')
    .select('id, email, rol')
    .eq('auth_user_id', session.user.id)
    .single();

  estadoCargaPermisoEl.style.display = 'none';

  if (error || !usuario) {
    bloqueSinPermisoEl.style.display = 'block';
    return;
  }

  usuarioActual = usuario;

  // 4. Mostrar datos del usuario
  mostrarDatosUsuario(usuario);

  // 5. Configurar permisos según el rol
  configurarPermisosPorRol(usuario.rol);

  // 6. Obtener referencias del DOM propias del formulario
  obtenerReferenciasDOM();

  // 7-12. Inicializar selectores, cargar catálogos y registrar eventos
  const formularioListo = await inicializarFormulario();

  // 13. Mostrar el formulario listo
  if (formularioListo) {
    formEl.style.display = 'flex';
  }
}

// Paso 4: pinta en el encabezado los datos del usuario autenticado.
function mostrarDatosUsuario(usuario) {
  nombreUsuarioEl.textContent = usuario.email;
  rolUsuarioEl.textContent    = usuario.rol;
  if (avatarUsuarioEl) avatarUsuarioEl.textContent = generarIniciales(usuario.email);
}

// Paso 5: aplica las reglas de visibilidad según el rol.
// Cualquier rol autenticado y válido (admin, supervisor, cliente) puede
// usar el formulario de "Subir documento"; el bloqueo por falta de
// permiso (bloqueSinPermiso) solo aplica si no se encontró el usuario
// en la tabla "usuarios" (ver inicializar()).
// "Acciones Administrativas" (Declaraciones/Honorarios) sigue siendo
// exclusiva del rol "admin". Para todos los demás roles la sección
// permanece oculta y no puede afectar esas tablas. La protección
// definitiva vive en las políticas RLS de Supabase.
function configurarPermisosPorRol(rol) {
  const esAdministrador = esRolExactoAdmin(rol);

  if (dashboardShellEl) dashboardShellEl.classList.toggle('es-admin', esAdministrador);
  if (seccionAccionesAdminEl) seccionAccionesAdminEl.style.display = esAdministrador ? 'block' : 'none';
}

// Paso 6: localiza todos los campos del formulario. Se hace de forma
// explícita y en un único lugar para que cualquier reconstrucción del
// formulario solo requiera volver a llamar a esta función.
function obtenerReferenciasDOM() {
  campoClienteEl          = document.getElementById('campoCliente');
  campoCategoriaEl        = document.getElementById('campoCategoria');
  campoSubcategoriaWrapEl = document.getElementById('campoSubcategoriaWrap');
  campoSubcategoriaEl     = document.getElementById('campoSubcategoria');
  campoAnioEl             = document.getElementById('campoAnio');
  campoNombreEl           = document.getElementById('campoNombre');
  campoFechaEl            = document.getElementById('campoFecha');
  campoEstatusEl          = document.getElementById('campoEstatus');
  campoObservacionesEl    = document.getElementById('campoObservaciones');
  camposExtraContainerEl  = document.getElementById('camposExtraContainer');
  campoArchivoEl          = document.getElementById('campoArchivo');
  campoSubidoPorEl        = document.getElementById('campoSubidoPor');
  btnSubirEl              = document.getElementById('btnSubir');

  chkGenerarDeclaracionEl      = document.getElementById('chkGenerarDeclaracion');
  campoEstatusSatWrapEl        = document.getElementById('campoEstatusSatWrap');
  campoEstatusSatEl            = document.getElementById('campoEstatusSat');
  campoMontoPagadoWrapEl       = document.getElementById('campoMontoPagadoWrap');
  campoMontoPagadoEl           = document.getElementById('campoMontoPagado');
  campoIsrWrapEl               = document.getElementById('campoIsrWrap');
  campoIsrEl                   = document.getElementById('campoIsr');
  campoIvaWrapEl               = document.getElementById('campoIvaWrap');
  campoIvaEl                   = document.getElementById('campoIva');
  chkGenerarHonorarioEl        = document.getElementById('chkGenerarHonorario');
  campoMontoHonorarioWrapEl    = document.getElementById('campoMontoHonorarioWrap');
  campoMontoHonorarioEl        = document.getElementById('campoMontoHonorario');
  campoConceptoHonorarioWrapEl = document.getElementById('campoConceptoHonorarioWrap');
  campoConceptoHonorarioEl     = document.getElementById('campoConceptoHonorario');
  campoEstadoHonorarioWrapEl   = document.getElementById('campoEstadoHonorarioWrap');
  campoEstadoHonorarioEl       = document.getElementById('campoEstadoHonorario');
}

// Pasos 7-12: prepara por completo el formulario. Es la única función
// responsable de dejarlo listo para usarse. Devuelve `true` si todo
// se cargó correctamente, o `false` si hubo un error que impide
// mostrar el formulario (por ejemplo, no se pudieron cargar clientes).
async function inicializarFormulario() {
  // 7-9. Selectores propios del formulario (Año y Periodo)
  inicializarSelectorAnio();
  inicializarSelectorPeriodo();

  // 10. Cargar clientes
  const clientesCargados = await cargarClientes();
  if (!clientesCargados) return false;

  // 11. Cargar categorías (y sincronizar Periodo/campos extra con la
  // categoría seleccionada por defecto)
  cargarCategorias();

  // 12. Registrar EventListeners
  registrarEventos();

  // Valores por defecto del formulario
  campoSubidoPorEl.value = usuarioActual.email;
  campoFechaEl.value     = new Date().toISOString().slice(0, 10);

  return true;
}

// =====================================================
// Selector de Año (junto al selector de Período)
// El "ejercicio" (año) para Declaraciones/Honorarios ya no se toma de
// new Date().getFullYear(): el usuario lo elige aquí. Se muestran el
// año actual, 5 años anteriores y 2 posteriores, con el año actual
// seleccionado por defecto.
// Localiza el elemento nuevamente y limpia su contenido antes de
// generar las opciones, por lo que puede volver a ejecutarse en
// cualquier momento (por ejemplo, tras reconstruir el formulario) sin
// duplicar opciones.
// =====================================================
function inicializarSelectorAnio() {
  const selectorAnio = document.getElementById('campoAnio');
  if (!selectorAnio) return;

  selectorAnio.innerHTML = '';

  const anioActual = new Date().getFullYear();
  const fragmento   = document.createDocumentFragment();

  for (let anio = anioActual - 5; anio <= anioActual + 2; anio++) {
    const opcion = document.createElement('option');
    opcion.value = String(anio);
    opcion.textContent = String(anio);
    fragmento.appendChild(opcion);
  }

  selectorAnio.appendChild(fragmento);
  selectorAnio.value = String(anioActual);

  campoAnioEl = selectorAnio;
}

// =====================================================
// Selector de Periodo (campo "Periodo", ligado a la categoría)
// Deja el selector en su estado inicial: vacío, oculto y no
// obligatorio. Las opciones reales (meses o semanas) dependen de la
// categoría elegida y se generan en actualizarCamposSegunCategoria(),
// que se ejecuta al cargar las categorías y cada vez que el usuario
// cambia de categoría.
// =====================================================
function inicializarSelectorPeriodo() {
  const selectorPeriodo = document.getElementById('campoSubcategoria');
  const wrapPeriodo     = document.getElementById('campoSubcategoriaWrap');
  if (!selectorPeriodo) return;

  selectorPeriodo.innerHTML = '';
  selectorPeriodo.required  = false;
  if (wrapPeriodo) wrapPeriodo.style.display = 'none';

  campoSubcategoriaEl     = selectorPeriodo;
  campoSubcategoriaWrapEl = wrapPeriodo;
}

// Paso 10: carga los clientes activos y los coloca en el selector.
// Devuelve `true`/`false` según el resultado, para que
// inicializarFormulario() decida si el formulario puede mostrarse.
async function cargarClientes() {
  const { data: clientes, error } = await supabaseClient
    .from('clientes')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre');

  if (error || !clientes?.length) {
    mostrarMensaje('No se pudieron cargar los clientes. Verifica la conexión con Supabase.', 'error');
    return false;
  }

  campoClienteEl.innerHTML = clientes.map(c => `<option value="${c.id}">${escaparHtml(c.nombre)}</option>`).join('');
  return true;
}

// Paso 11: carga las categorías fijas del catálogo y sincroniza los
// campos que dependen de la categoría seleccionada por defecto
// (Periodo y campos extra).
function cargarCategorias() {
  campoCategoriaEl.innerHTML = CATEGORIAS.map(c => `<option value="${c.id}">${escaparHtml(c.nombre)}</option>`).join('');
  actualizarCamposSegunCategoria();
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

// =====================================================
// Acciones Administrativas (solo admin)
// Genera automáticamente registros en "declaraciones" y/o "honorarios"
// al terminar de subir el documento. Ver ejecutarAccionesAdministrativas()
// más abajo para el flujo completo y las validaciones de seguridad.
// =====================================================

// Handler del checkbox "Generar registro en Declaraciones": muestra u
// oculta sus campos condicionales (Estatus, Monto pagado, ISR, IVA).
function manejarCambioGenerarDeclaracion() {
  const mostrar = chkGenerarDeclaracionEl.checked;
  if (campoEstatusSatWrapEl)  campoEstatusSatWrapEl.style.display  = mostrar ? 'flex' : 'none';
  if (campoMontoPagadoWrapEl) campoMontoPagadoWrapEl.style.display = mostrar ? 'flex' : 'none';
  if (campoIsrWrapEl)         campoIsrWrapEl.style.display         = mostrar ? 'flex' : 'none';
  if (campoIvaWrapEl)         campoIvaWrapEl.style.display         = mostrar ? 'flex' : 'none';

  if (!mostrar) {
    if (campoEstatusSatEl)  campoEstatusSatEl.value  = '';
    if (campoMontoPagadoEl) campoMontoPagadoEl.value = '';
    if (campoIsrEl)         campoIsrEl.value         = '';
    if (campoIvaEl)         campoIvaEl.value         = '';
  }
}

// Handler del checkbox "Generar registro en Honorarios": muestra u
// oculta sus campos condicionales.
function manejarCambioGenerarHonorario() {
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
}

// Devuelve un objeto con los valores elegidos en "Acciones Administrativas".
function obtenerAccionesAdministrativas() {
  const generarDeclaracion = !!(chkGenerarDeclaracionEl && chkGenerarDeclaracionEl.checked);
  const generarHonorario   = !!(chkGenerarHonorarioEl && chkGenerarHonorarioEl.checked);

  return {
    generar_declaracion: generarDeclaracion,
    generar_honorario:   generarHonorario,
    declaracion: generarDeclaracion ? {
      estatusSat:   campoEstatusSatEl ? campoEstatusSatEl.value.trim() || null : null,
      montoPagado:  campoMontoPagadoEl ? (parseFloat(campoMontoPagadoEl.value) || null) : null,
      isr:          campoIsrEl ? (parseFloat(campoIsrEl.value) || null) : null,
      iva:          campoIvaEl ? (parseFloat(campoIvaEl.value) || null) : null,
    } : null,
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
  if (campoEstatusSatWrapEl)  campoEstatusSatWrapEl.style.display  = 'none';
  if (campoMontoPagadoWrapEl) campoMontoPagadoWrapEl.style.display = 'none';
  if (campoIsrWrapEl)         campoIsrWrapEl.style.display         = 'none';
  if (campoIvaWrapEl)         campoIvaWrapEl.style.display         = 'none';
  if (campoEstatusSatEl)  campoEstatusSatEl.value  = '';
  if (campoMontoPagadoEl) campoMontoPagadoEl.value = '';
  if (campoIsrEl)         campoIsrEl.value         = '';
  if (campoIvaEl)         campoIvaEl.value         = '';
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
// El año ("ejercicio") se toma del selector de Año (junto al selector
// de Período), no del año de la fecha del documento.
// =====================================================
function calcularPeriodoDesdeFormulario() {
  const valorFecha = campoFechaEl.value ? new Date(`${campoFechaEl.value}T00:00:00`) : new Date();

  // El año ("ejercicio") viene del selector de Año elegido por el
  // usuario. Si por alguna razón no tiene valor (compatibilidad), se
  // usa el año de la fecha como respaldo.
  const anioSeleccionado = campoAnioEl && campoAnioEl.value ? parseInt(campoAnioEl.value, 10) : NaN;
  const ejercicio  = Number.isFinite(anioSeleccionado) ? anioSeleccionado : valorFecha.getFullYear();

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
// Utilidad de depuración para errores de Supabase.
// Centraliza el console.error de TODAS las operaciones (Storage,
// Documentos, Declaraciones, Honorarios) mostrando siempre:
//   - qué operación falló
//   - qué datos se enviaron
//   - la respuesta completa que devolvió Supabase
// Así cada función de más abajo solo necesita llamar a esta utilidad
// en lugar de escribir su propio console.error genérico.
// =====================================================
function registrarErrorSupabase(operacion, datosEnviados, respuesta) {
  console.error(`[${operacion}] Falló la operación contra Supabase`, {
    operacion,
    datosEnviados,
    respuesta,
  });
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
async function crearDeclaracion({ clienteId, categoriaNombre, periodo, rutaArchivo, declaracion }) {
  const fila = {
    cliente_id:         Number(clienteId),
    ejercicio:          periodo.ejercicio,
    mes:                periodo.mesNombre,
    tipo_declaracion:   categoriaNombre,
    fecha_presentacion: campoFechaEl.value,
    // columnas reales de la tabla, capturadas desde "Acciones Administrativas"
    estatus_sat:        declaracion?.estatusSat ?? null,
    monto_pagado:       declaracion?.montoPagado ?? null,
    isr:                declaracion?.isr ?? null,
    iva:                declaracion?.iva ?? null,
    // columnas enriquecidas (ver ALTER TABLE en setup_acciones_administrativas.sql)
    nombre_documento:   campoNombreEl.value.trim(),
    observaciones:      campoObservacionesEl.value.trim() || null,
    archivo_relacionado: rutaArchivo || null,
    creado_por:         usuarioActual.email,
  };

  const respuesta = await supabaseClient.from('declaraciones').insert([fila]);

  if (respuesta.error) {
    registrarErrorSupabase('crearDeclaracion', fila, respuesta);
  }

  return respuesta;
}

// =====================================================
// Inserta el registro en "honorarios". Misma protección que la función
// anterior: solo se invoca si el usuario autenticado es admin y ya se
// subió el documento correctamente.
// =====================================================
async function crearHonorario({ clienteId, periodo, honorario }) {
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

  const respuesta = await supabaseClient.from('honorarios').insert([fila]);

  if (respuesta.error) {
    registrarErrorSupabase('crearHonorario', fila, respuesta);
  }

  return respuesta;
}

// =====================================================
// Decide si corresponde ejecutar Declaraciones/Honorarios y, de ser
// así, con qué valores. Es una verificación en el frontend (defensa en
// profundidad); la verificación real e infranqueable está en las
// políticas RLS de Supabase. Devuelve `null` cuando no hay que
// ejecutar nada (usuario no-admin o ninguna acción marcada), o el
// objeto de acciones (ver obtenerAccionesAdministrativas) cuando sí.
// =====================================================
function validarAccionesAdministrador() {
  if (!usuarioActual || !esRolExactoAdmin(usuarioActual.rol)) {
    return null; // No es admin: no se intenta nada, sin mostrar error.
  }

  const acciones = obtenerAccionesAdministrativas();
  if (!acciones.generar_declaracion && !acciones.generar_honorario) {
    return null; // No se marcó ninguna acción.
  }

  return acciones;
}

// =====================================================
// Orquesta la creación de Declaraciones/Honorarios según lo marcado
// en "Acciones Administrativas". Devuelve un arreglo de mensajes de
// error (vacío si todo salió bien) para que el flujo principal los
// muestre. El detalle técnico de cada error ya quedó registrado por
// crearDeclaracion()/crearHonorario() a través de registrarErrorSupabase().
// =====================================================
async function ejecutarAccionesAdministrativas({ clienteId, categoriaNombre, rutaArchivo }) {
  const errores = [];

  const acciones = validarAccionesAdministrador();
  if (!acciones) return errores;

  const periodo = calcularPeriodoDesdeFormulario();

  if (acciones.generar_declaracion) {
    const { error } = await crearDeclaracion({ clienteId, categoriaNombre, periodo, rutaArchivo, declaracion: acciones.declaracion });
    if (error) {
      errores.push(`No se pudo crear el registro en Declaraciones: ${error.message}`);
    }
  }

  if (acciones.generar_honorario) {
    if (!acciones.honorario.monto || acciones.honorario.monto <= 0) {
      errores.push('No se creó el registro en Honorarios: el Monto es obligatorio y debe ser mayor a 0.');
    } else {
      const { error } = await crearHonorario({ clienteId, periodo, honorario: acciones.honorario });
      if (error) {
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
function rutaStorage(clienteId, categoria, file) {
  const limpio = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${clienteId}/${categoria}/${Date.now()}-${limpio}`;
}

// Sube el archivo al bucket privado de Storage. Si falla, registra el
// error completo (operación + datos enviados + respuesta de Supabase)
// para que se pueda depurar sin ambigüedad con otras operaciones.
async function subirArchivoStorage(ruta, file) {
  const datosEnviados = { bucket: BUCKET_DOCUMENTOS, ruta, nombreArchivo: file.name, tipoArchivo: file.type, tamañoBytes: file.size };

  const respuesta = await supabaseClient.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(ruta, file, { upsert: false });

  if (respuesta.error) {
    registrarErrorSupabase('subirArchivoStorage', datosEnviados, respuesta);
  }

  return respuesta;
}

// Construye la fila con los nombres REALES de columna de "documentos"
// (incluye los campos dinámicos según la categoría) e inserta el
// registro. Si falla, registra el error completo para depuración.
async function guardarDocumento({ clienteId, categoria, ruta }) {
  const fila = {
    cliente_id:     clienteId,           // nombre real en tu tabla
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

  const respuesta = await supabaseClient.from('documentos').insert([fila]);

  if (respuesta.error) {
    registrarErrorSupabase('guardarDocumento', fila, respuesta);
  }

  return { ...respuesta, fila };
}

// Muestra el mensaje final del formulario: éxito con enlace a
// Documentos, o éxito del documento + advertencias puntuales si
// Declaraciones/Honorarios tuvieron problemas (el documento igual se
// subió correctamente, por eso no se trata como error genérico).
function mostrarResultado({ clienteId, categoria, clienteNombre, erroresAccionesAdmin }) {
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
}

// =====================================================
// Coordina el flujo completo de "Subir documento":
//   1. Subir archivo a Storage
//   2. Guardar el registro en "documentos"
//   3. Ejecutar Acciones Administrativas (Declaraciones/Honorarios)
//   4. Mostrar el resultado y reiniciar el formulario
// Cada paso usa su propia función especializada; procesarFormulario()
// solo decide el orden y qué hacer con el resultado de cada uno.
// Si falla Storage, se muestra ÚNICAMENTE el error de Storage.
// Si falla Documentos, se muestra ÚNICAMENTE el error de Documentos.
// Declaraciones/Honorarios nunca se ejecutan si los pasos 1 o 2 fallaron.
// =====================================================
async function procesarFormulario(file) {
  const clienteId = campoClienteEl.value;
  const categoria = campoCategoriaEl.value;
  const ruta      = rutaStorage(clienteId, categoria, file);

  // 1. Subir al bucket privado
  mostrarMensaje('Subiendo archivo al servidor seguro…', '');
  const { error: errSubida } = await subirArchivoStorage(ruta, file);

  if (errSubida) {
    const msg = errSubida.message?.includes('Bucket not found')
      ? 'No existe el bucket "documentos" en Supabase Storage. Créalo como privado y vuelve a intentar.'
      : `Error al subir: ${errSubida.message}`;
    mostrarMensaje(msg, 'error');
    return; // No se intenta nada más: ni guardar documento ni Acciones Administrativas.
  }

  // 2. Guardar el registro en "documentos"
  mostrarMensaje('Archivo subido. Guardando registro…', '');
  const { error: errInsert, fila } = await guardarDocumento({ clienteId, categoria, ruta });

  if (errInsert) {
    mostrarMensaje(`El archivo se subió a Storage pero no se pudo guardar el registro: ${errInsert.message}. Verifica que la tabla "documentos" tenga todas las columnas del ALTER TABLE.`, 'error');
    return; // El archivo ya está en Storage, pero no se ejecutan Acciones Administrativas.
  }

  // 3. Acciones Administrativas: SOLO se ejecutan si el documento ya se
  // subió y se guardó correctamente (requisito 3). Si el rol no es admin,
  // ejecutarAccionesAdministrativas() no hace nada (requisito 5).
  const erroresAccionesAdmin = await ejecutarAccionesAdministrativas({
    clienteId,
    categoriaNombre: (CATEGORIAS.find(c => c.id === categoria) || {}).nombre || categoria,
    rutaArchivo: ruta,
  });

  // 4. Mostrar resultado y reiniciar el formulario
  const clienteNombre = campoClienteEl.options[campoClienteEl.selectedIndex].text;
  mostrarResultado({ clienteId, categoria, clienteNombre, erroresAccionesAdmin });

  formEl.reset();
  campoSubidoPorEl.value = fila.subido_por;
  campoFechaEl.value     = new Date().toISOString().slice(0, 10);
  inicializarSelectorAnio();
  actualizarCamposSegunCategoria();
  reiniciarAccionesAdministrativas();
}

// Handler del envío del formulario: valida el archivo, bloquea el
// botón mientras se procesa y delega todo el trabajo en
// procesarFormulario().
async function manejarEnvioFormulario(e) {
  e.preventDefault();
  mostrarMensaje('', '');

  const file = campoArchivoEl.files[0];
  if (!file) { mostrarMensaje('Selecciona un archivo antes de subir.', 'error'); return; }

  btnSubirEl.disabled = true;
  try {
    await procesarFormulario(file);
  } finally {
    btnSubirEl.disabled = false;
  }
}

// Cierra la sesión y regresa a la pantalla de acceso.
async function cerrarSesion() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

// Paso 12: registra, en un único lugar, todos los EventListeners del
// módulo. Se llama una sola vez desde inicializarFormulario().
function registrarEventos() {
  campoCategoriaEl.addEventListener('change', actualizarCamposSegunCategoria);

  if (chkGenerarDeclaracionEl) {
    chkGenerarDeclaracionEl.addEventListener('change', manejarCambioGenerarDeclaracion);
  }

  if (chkGenerarHonorarioEl) {
    chkGenerarHonorarioEl.addEventListener('change', manejarCambioGenerarHonorario);
  }

  formEl.addEventListener('submit', manejarEnvioFormulario);

  if (btnCerrarSesionEl) btnCerrarSesionEl.addEventListener('click', cerrarSesion);
  if (btnMenuMovilEl)    btnMenuMovilEl.addEventListener('click', () => dashboardShellEl.classList.toggle('menu-abierto'));
  if (sidebarOverlayEl)  sidebarOverlayEl.addEventListener('click', () => dashboardShellEl.classList.remove('menu-abierto'));
}

inicializar();
