// =====================================================
// Dashboard - Portal de Clientes IM Servicios Contables
// =====================================================
// NOTA DE LA ACTUALIZACIÓN DE DISEÑO:
// Todo el código original se conserva tal cual (mismas
// funciones, mismos IDs, mismas consultas a Supabase).
// Las secciones marcadas con "NUEVO:" son adiciones para
// soportar el rediseño (avatar, régimen/estado del cliente,
// total cobrado para administradores, próximo vencimiento,
// última actualización y el menú móvil). Ninguna línea
// original fue eliminada.
// =====================================================

const nombreUsuarioEl = document.getElementById('nombreUsuario');
const rolUsuarioEl = document.getElementById('rolUsuario');
const estadoCargaEl = document.getElementById('estadoCarga');
const clientesGridEl = document.getElementById('clientesGrid');

// Elementos del panel "Resumen de tu operación"
const kpiClientesActivosEl = document.getElementById('kpiClientesActivos');
const kpiDeclaracionesEl = document.getElementById('kpiDeclaraciones');
const kpiHonorariosEl = document.getElementById('kpiHonorarios');
const kpiPendientesEl = document.getElementById('kpiPendientes');
const pendienteDeclaracionesEl = document.getElementById('pendienteDeclaraciones');
const pendienteDocumentosEl = document.getElementById('pendienteDocumentos');

// NUEVO: elementos opcionales del rediseño. Se buscan con
// getElementById y se usan solo si existen en el HTML, así
// este mismo archivo sigue funcionando con la versión anterior
// del dashboard sin romper nada.
const avatarUsuarioEl = document.getElementById('avatarUsuario');
const kpiTotalCobradoEl = document.getElementById('kpiTotalCobrado');
const proximoVencimientoEl = document.getElementById('proximoVencimiento');
const ultimaActualizacionEl = document.getElementById('ultimaActualizacion');
const dashboardShellEl = document.getElementById('dashboardShell');
const sidebarOverlayEl = document.getElementById('sidebarOverlay');
const btnMenuMovilEl = document.getElementById('btnMenuMovil');

function formatearMoneda(numero) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(numero || 0);
}

// Comparación robusta de estatus: ignora mayúsculas/acentos/espacios extra,
// igual que esAdmin(), para que no se rompa por variaciones de captura.
function estatusEs(valor, esperado) {
  return typeof valor === 'string' && valor.trim().toUpperCase() === esperado.toUpperCase();
}

// Un rol "es admin" si empieza con "admin", sin distinguir mayúsculas.
// Esto cubre tanto "admin" como "administración" (o cualquier variante)
// sin depender de que el texto exacto en la base de datos coincida.
function esAdmin(rol) {
  return typeof rol === 'string' && rol.trim().toLowerCase().startsWith('admin');
}

// NUEVO: iniciales para el avatar circular, a partir del correo del usuario.
function generarIniciales(correo) {
  if (typeof correo !== 'string' || !correo.includes('@')) return '··';
  const usuario = correo.split('@')[0];
  const partes = usuario.split(/[.\-_]+/).filter(Boolean);
  if (partes.length >= 2) {
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }
  return usuario.slice(0, 2).toUpperCase();
}

// NUEVO: badge de estado del cliente (Activo / Suspendido / etc.) con un
// color razonable según el texto. Si no hay dato, no se muestra nada.
function crearBadgeEstado(estatus) {
  if (!estatus) return null;
  const texto = String(estatus).trim();
  const normal = texto.toLowerCase();
  let clase = 'badge-gris';
  if (normal.startsWith('activ')) clase = 'badge-verde';
  else if (normal.startsWith('suspend') || normal.startsWith('moros')) clase = 'badge-rojo';
  else if (normal.startsWith('pend')) clase = 'badge-ambar';

  const span = document.createElement('span');
  span.className = `badge ${clase}`;
  span.textContent = texto;
  return span;
}

// NUEVO: calcula el próximo vencimiento general del calendario fiscal del
// SAT (la mayoría de los regímenes declaran a más tardar el día 17 de cada
// mes). Es una referencia general -no por cliente-; si en el futuro se
// agrega una fecha límite real por declaración, se puede sustituir aquí.
function calcularProximoVencimientoSAT() {
  const hoy = new Date();
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  let mes = hoy.getMonth();
  let anio = hoy.getFullYear();
  if (hoy.getDate() > 17) {
    mes += 1;
    if (mes > 11) { mes = 0; anio += 1; }
  }
  return `17 ${meses[mes]}`;
}

// NUEVO: texto corto de fecha/hora para "Última actualización".
function formatearFechaHoraCorta(fecha) {
  return fecha.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function crearTarjetaCliente(cliente) {
  const card = document.createElement('div');
  card.className = 'cliente-card';

  // NUEVO: encabezado de la tarjeta (nombre + estado, si existe).
  const top = document.createElement('div');
  top.className = 'cliente-card-top';

  const nombre = document.createElement('h3');
  nombre.textContent = cliente.nombre || 'Sin nombre';
  top.appendChild(nombre);

  const badgeEstado = crearBadgeEstado(cliente.estatus);
  if (badgeEstado) top.appendChild(badgeEstado);

  const rfc = document.createElement('p');
  rfc.className = 'cliente-rfc';
  rfc.textContent = cliente.rfc ? `RFC: ${cliente.rfc}` : '';

  card.append(top, rfc);

  // NUEVO: régimen fiscal, solo si el dato está disponible.
  if (cliente.regimen) {
    const meta = document.createElement('div');
    meta.className = 'cliente-meta';
    const badgeRegimen = document.createElement('span');
    badgeRegimen.className = 'badge badge-azul';
    badgeRegimen.textContent = cliente.regimen;
    meta.appendChild(badgeRegimen);
    card.appendChild(meta);
  }

  const boton = document.createElement('button');
  boton.textContent = 'Ver detalle';
  boton.addEventListener('click', () => {
    window.location.href = `declaraciones.html?cliente_id=${encodeURIComponent(cliente.id)}`;
  });

  card.append(boton);
  return card;
}

function mostrarError(texto) {
  estadoCargaEl.textContent = texto;
  estadoCargaEl.classList.add('estado-error');
}

// Llena el panel "Resumen de tu operación" con datos reales de
// declaraciones y honorarios, filtrados a los clientes que el
// usuario puede ver (ya resueltos por cargarDashboard()).
// NUEVO: recibe también `esAdminUsuario` para calcular el total
// cobrado, que solo debe verse en el rol de administrador.
async function cargarResumenOperativo(clientes, esAdminUsuario) {
  kpiClientesActivosEl.textContent = clientes.length;

  // NUEVO: "Última actualización" no depende de Supabase, se marca
  // en el momento en que el panel termina de calcularse.
  if (ultimaActualizacionEl) {
    ultimaActualizacionEl.textContent = formatearFechaHoraCorta(new Date());
  }
  if (proximoVencimientoEl) {
    proximoVencimientoEl.textContent = calcularProximoVencimientoSAT();
  }

  if (clientes.length === 0) {
    kpiDeclaracionesEl.textContent = '0';
    kpiHonorariosEl.textContent = formatearMoneda(0);
    kpiPendientesEl.textContent = '0';
    pendienteDeclaracionesEl.textContent = '0';
    pendienteDocumentosEl.textContent = '0';
    if (kpiTotalCobradoEl) kpiTotalCobradoEl.textContent = formatearMoneda(0);
    return;
  }

  const idsClientes = clientes.map(c => c.id);

  // Declaraciones de estos clientes
  const { data: declaraciones, error: errorDeclaraciones } = await supabaseClient
    .from('declaraciones')
    .select('id, estatus_sat')
    .in('cliente_id', idsClientes);

  if (errorDeclaraciones) {
    console.error('Error cargando declaraciones:', errorDeclaraciones);
    kpiDeclaracionesEl.textContent = '—';
    kpiPendientesEl.textContent = '—';
    pendienteDeclaracionesEl.textContent = '—';
  } else {
    const totalDeclaraciones = declaraciones.length;
    const declaracionesPendientes = declaraciones.filter(d => estatusEs(d.estatus_sat, 'PENDIENTE')).length;

    kpiDeclaracionesEl.textContent = totalDeclaraciones;
    kpiPendientesEl.textContent = declaracionesPendientes;
    pendienteDeclaracionesEl.textContent = declaracionesPendientes;
  }

  // Honorarios de estos clientes
  const { data: honorarios, error: errorHonorarios } = await supabaseClient
    .from('honorarios')
    .select('importe, estatus_pago')
    .in('cliente_id', idsClientes);

  if (errorHonorarios) {
    console.error('Error cargando honorarios:', errorHonorarios);
    kpiHonorariosEl.textContent = '—';
    if (kpiTotalCobradoEl) kpiTotalCobradoEl.textContent = '—';
  } else {
    const porCobrar = honorarios
      .filter(h => estatusEs(h.estatus_pago, 'FALTA PAGO'))
      .reduce((suma, h) => suma + Number(h.importe || 0), 0);

    kpiHonorariosEl.textContent = formatearMoneda(porCobrar);

    // NUEVO: total cobrado (solo se calcula/se muestra para admins).
    // Reutiliza los honorarios ya consultados arriba, sin pedir datos
    // adicionales a Supabase.
    if (kpiTotalCobradoEl && esAdminUsuario) {
      const cobrado = honorarios
        .filter(h => estatusEs(h.estatus_pago, 'PAGADO'))
        .reduce((suma, h) => suma + Number(h.importe || 0), 0);
      kpiTotalCobradoEl.textContent = formatearMoneda(cobrado);
    }
  }

  // Documentos de estos clientes
  // Nota: la tabla "documentos" solo registra archivos ya subidos,
  // no tiene un estatus de "pendiente por entregar". Por ahora este
  // número muestra el total de documentos subidos para estos clientes.
  const { data: documentos, error: errorDocumentos } = await supabaseClient
    .from('documentos')
    .select('id')
    .in('cliente_id', idsClientes);

  if (errorDocumentos) {
    console.error('Error cargando documentos:', errorDocumentos);
    pendienteDocumentosEl.textContent = '—';
  } else {
    pendienteDocumentosEl.textContent = documentos.length;
  }
}

async function cargarDashboard() {
  // 1. Confirmar que hay una sesión activa
  const { data: sesionData } = await supabaseClient.auth.getSession();
  const session = sesionData.session;

  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  const authUserId = session.user.id;

  // 2. Buscar el registro en "usuarios" vinculado a este auth_user_id
  const { data: usuario, error: errorUsuario } = await supabaseClient
    .from('usuarios')
    .select('id, email, rol')
    .eq('auth_user_id', authUserId)
    .single();

  if (errorUsuario || !usuario) {
    mostrarError('No se encontró tu cuenta en el sistema. Contacta al administrador.');
    return;
  }

  nombreUsuarioEl.textContent = usuario.email;
  rolUsuarioEl.textContent = usuario.rol;

  // NUEVO: iniciales del avatar + clase "es-admin" en el shell para que
  // el CSS pueda mostrar/ocultar los bloques marcados como .admin-only.
  if (avatarUsuarioEl) avatarUsuarioEl.textContent = generarIniciales(usuario.email);
  const usuarioEsAdmin = esAdmin(usuario.rol);
  if (dashboardShellEl && usuarioEsAdmin) dashboardShellEl.classList.add('es-admin');

  // 3. Obtener los clientes que le corresponden según su rol
  let clientes = [];

  if (usuarioEsAdmin) {
    // NUEVO: intentamos traer también régimen y estatus para las tarjetas
    // de cliente. Si esas columnas no existen todavía en la tabla
    // "clientes", se hace un segundo intento con la consulta original
    // para no romper la carga del dashboard.
    let { data, error } = await supabaseClient
      .from('clientes')
      .select('id, nombre, rfc, regimen, estatus')
      .eq('activo', true)
      .order('nombre');

    if (error) {
      const basica = await supabaseClient
        .from('clientes')
        .select('id, nombre, rfc')
        .eq('activo', true)
        .order('nombre');
      data = basica.data;
      error = basica.error;
    }

    if (error) {
      mostrarError('No se pudieron cargar los clientes.');
      return;
    }
    clientes = data;
  } else {
    // NUEVO: mismo intento "ampliado con respaldo" para la vista de
    // clientes asignados, por si en el futuro se agregan las columnas
    // cliente_rfc / cliente_regimen / cliente_estatus a la vista.
    let { data, error } = await supabaseClient
      .from('vw_usuarios_clientes')
      .select('cliente_id, cliente_nombre, cliente_rfc, cliente_regimen, cliente_estatus')
      .eq('usuario_id', usuario.id);

    if (error) {
      const basica = await supabaseClient
        .from('vw_usuarios_clientes')
        .select('cliente_id, cliente_nombre')
        .eq('usuario_id', usuario.id);
      data = basica.data;
      error = basica.error;
    }

    if (error) {
      mostrarError('No se pudieron cargar tus clientes asignados.');
      return;
    }
    clientes = (data || [])
      .filter(c => c.cliente_id !== null)
      .map(c => ({
        id: c.cliente_id,
        nombre: c.cliente_nombre,
        rfc: c.cliente_rfc || null,
        regimen: c.cliente_regimen || null,
        estatus: c.cliente_estatus || null,
      }));
  }

  // 4. Mostrar resultado
  estadoCargaEl.style.display = 'none';

  // El resumen operativo se calcula sobre los mismos clientes que
  // el usuario puede ver, sin importar si es admin o no.
  cargarResumenOperativo(clientes, usuarioEsAdmin);

  if (clientes.length === 0) {
    clientesGridEl.innerHTML = '';
    const vacio = document.createElement('p');
    vacio.className = 'estado-vacio';
    vacio.textContent = 'No tienes clientes asignados todavía.';
    clientesGridEl.appendChild(vacio);
    return;
  }

  clientesGridEl.innerHTML = '';
  clientes.forEach(c => clientesGridEl.appendChild(crearTarjetaCliente(c)));
}

document.getElementById('btnCerrarSesion').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

// NUEVO: menú lateral en móvil (abre/cierra con el botón hamburguesa
// y con el overlay oscuro). No afecta el comportamiento en escritorio.
if (btnMenuMovilEl && dashboardShellEl) {
  btnMenuMovilEl.addEventListener('click', () => {
    dashboardShellEl.classList.toggle('menu-abierto');
  });
}
if (sidebarOverlayEl && dashboardShellEl) {
  sidebarOverlayEl.addEventListener('click', () => {
    dashboardShellEl.classList.remove('menu-abierto');
  });
}

cargarDashboard();
