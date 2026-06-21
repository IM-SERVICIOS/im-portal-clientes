// =====================================================
// Dashboard - Portal de Clientes IM Servicios Contables
// =====================================================

const nombreUsuarioEl       = document.getElementById('nombreUsuario');
const rolUsuarioEl          = document.getElementById('rolUsuario');
const estadoCargaEl         = document.getElementById('estadoCarga');
const clientesGridEl        = document.getElementById('clientesGrid');

const kpiClientesActivosEl  = document.getElementById('kpiClientesActivos');
const kpiDeclaracionesEl    = document.getElementById('kpiDeclaraciones');
const kpiHonorariosEl       = document.getElementById('kpiHonorarios');
const kpiCobradoEl          = document.getElementById('kpiCobrado');
const kpiPendientesEl       = document.getElementById('kpiPendientes');
const pendienteDeclaracionesEl = document.getElementById('pendienteDeclaraciones');
const pendienteDocumentosEl    = document.getElementById('pendienteDocumentos');

// Sección KPI honorarios (se muestra solo a admin)
const seccionHonorariosAdminEl = document.getElementById('seccionHonorariosAdmin');

const NOMBRE_MES_A_NUMERO = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};

function mesANumero(valor) {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string') {
    const limpio = valor.trim();
    const comoNumero = Number(limpio);
    if (!Number.isNaN(comoNumero) && limpio !== '') return comoNumero;
    return NOMBRE_MES_A_NUMERO[limpio.toLowerCase()] || null;
  }
  return null;
}

function formatearMoneda(numero) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(numero || 0);
}

function estatusEs(valor, esperado) {
  return typeof valor === 'string' && valor.trim().toUpperCase() === esperado.toUpperCase();
}

function esAdmin(rol) {
  return typeof rol === 'string' && rol.trim().toLowerCase().startsWith('admin');
}

// ─────────────────────────────────────────────────────
// TARJETAS DE CLIENTE
// cliente = { id, nombre, rfc, honorarios: [...] }
// honorarios puede ser undefined si aún no se cargó
// ─────────────────────────────────────────────────────
function crearTarjetaCliente(cliente) {
  const card = document.createElement('div');
  card.className = 'cliente-card';

  // — Encabezado —
  const nombre = document.createElement('h3');
  nombre.textContent = cliente.nombre || 'Sin nombre';

  const rfc = document.createElement('p');
  rfc.className = 'cliente-rfc';
  rfc.textContent = cliente.rfc ? `RFC: ${cliente.rfc}` : '';

  card.append(nombre, rfc);

  // — Columnas de honorarios (solo si hay datos) —
  const honorarios = cliente.honorarios || [];
  if (honorarios.length > 0) {
    const pagoPendiente = honorarios.some(h => estatusEs(h.estatus_pago, 'FALTA PAGO'));

    // Calcular saldo neto: positivo = a favor del cliente, negativo = a pagar
    const importe = honorarios.reduce((suma, h) => {
      const val = Number(h.importe || 0);
      return estatusEs(h.estatus_pago, 'PAGADO') ? suma + val : suma - val;
    }, 0);

    // Fila de columnas financieras
    const filaCols = document.createElement('div');
    filaCols.className = 'cliente-cols';

    // Columna 1: Cobrado
    const cobrado = honorarios
      .filter(h => estatusEs(h.estatus_pago, 'PAGADO'))
      .reduce((s, h) => s + Number(h.importe || 0), 0);

    const colCobrado = document.createElement('div');
    colCobrado.className = 'cliente-col';
    colCobrado.innerHTML = `
      <span class="col-etiqueta">Cobrado</span>
      <span class="col-valor verde">${formatearMoneda(cobrado)}</span>
    `;

    // Columna 2: Por cobrar
    const porCobrar = honorarios
      .filter(h => estatusEs(h.estatus_pago, 'FALTA PAGO'))
      .reduce((s, h) => s + Number(h.importe || 0), 0);

    const colPendiente = document.createElement('div');
    colPendiente.className = 'cliente-col';
    colPendiente.innerHTML = `
      <span class="col-etiqueta">Por cobrar</span>
      <span class="col-valor ${porCobrar > 0 ? 'rojo' : 'gris'}">${formatearMoneda(porCobrar)}</span>
    `;

    // Columna 3: Saldo neto
    const claseImporte = importe > 0 ? 'verde' : importe < 0 ? 'rojo' : 'gris';
    const prefijoImporte = importe > 0 ? '+' : '';

    const colSaldo = document.createElement('div');
    colSaldo.className = 'cliente-col';
    colSaldo.innerHTML = `
      <span class="col-etiqueta">Saldo neto</span>
      <span class="col-valor ${claseImporte}">${prefijoImporte}${formatearMoneda(importe)}</span>
    `;

    filaCols.append(colCobrado, colPendiente, colSaldo);
    card.appendChild(filaCols);

    // — Indicador de pago pendiente —
    if (pagoPendiente) {
      const alerta = document.createElement('div');
      alerta.className = 'cliente-alerta';
      alerta.innerHTML = `
        <span class="alerta-icono">!</span>
        <span class="alerta-texto">Tiene honorarios sin pagar</span>
      `;
      card.appendChild(alerta);
    }
  }

  // — Botón Ver detalle —
  const boton = document.createElement('button');
  boton.textContent = 'Ver detalle';
  boton.addEventListener('click', () => {
    window.location.href = `declaraciones.html?cliente_id=${encodeURIComponent(cliente.id)}`;
  });

  card.appendChild(boton);
  return card;
}

function mostrarError(texto) {
  estadoCargaEl.textContent = texto;
  estadoCargaEl.classList.add('estado-error');
}

// ─────────────────────────────────────────────────────
// RESUMEN OPERATIVO (KPIs superiores)
// ─────────────────────────────────────────────────────
async function cargarResumenOperativo(clientes, esAdminUsuario) {
  kpiClientesActivosEl.textContent = clientes.length;

  if (clientes.length === 0) {
    kpiDeclaracionesEl.textContent = '0';
    kpiHonorariosEl.textContent    = formatearMoneda(0);
    if (kpiCobradoEl) kpiCobradoEl.textContent = formatearMoneda(0);
    kpiPendientesEl.textContent    = '0';
    pendienteDeclaracionesEl.textContent = '0';
    pendienteDocumentosEl.textContent    = '0';
    return;
  }

  const idsClientes = clientes.map(c => c.id);
  const anioActual  = new Date().getFullYear();
  const mesActual   = new Date().getMonth() + 1;

  // Declaraciones
  const { data: declaraciones, error: errorDeclaraciones } = await supabaseClient
    .from('declaraciones')
    .select('id, estatus_sat, mes, ejercicio')
    .in('cliente_id', idsClientes);

  if (errorDeclaraciones) {
    console.error('Error cargando declaraciones:', errorDeclaraciones);
    kpiDeclaracionesEl.textContent = '—';
    kpiPendientesEl.textContent    = '—';
    pendienteDeclaracionesEl.textContent = '—';
  } else {
    const declaracionesDelMes = (declaraciones || []).filter(d =>
      mesANumero(d.mes) === mesActual && Number(d.ejercicio) === anioActual
    ).length;

    const declaracionesPendientes = (declaraciones || [])
      .filter(d => estatusEs(d.estatus_sat, 'PENDIENTE')).length;

    kpiDeclaracionesEl.textContent       = declaracionesDelMes;
    kpiPendientesEl.textContent          = declaracionesPendientes;
    pendienteDeclaracionesEl.textContent = declaracionesPendientes;
  }

  // Honorarios — para admin mostramos cobrado + por cobrar
  const { data: honorarios, error: errorHonorarios } = await supabaseClient
    .from('honorarios')
    .select('cliente_id, importe, estatus_pago')
    .in('cliente_id', idsClientes);

  if (errorHonorarios) {
    console.error('Error cargando honorarios:', errorHonorarios);
    kpiHonorariosEl.textContent = '—';
    if (kpiCobradoEl) kpiCobradoEl.textContent = '—';
  } else {
    const lista = honorarios || [];

    const porCobrar = lista
      .filter(h => estatusEs(h.estatus_pago, 'FALTA PAGO'))
      .reduce((s, h) => s + Number(h.importe || 0), 0);

    kpiHonorariosEl.textContent = formatearMoneda(porCobrar);

    if (esAdminUsuario && kpiCobradoEl) {
      const cobrado = lista
        .filter(h => estatusEs(h.estatus_pago, 'PAGADO'))
        .reduce((s, h) => s + Number(h.importe || 0), 0);
      kpiCobradoEl.textContent = formatearMoneda(cobrado);
      if (seccionHonorariosAdminEl) seccionHonorariosAdminEl.style.display = '';
    }

    // Devolver honorarios agrupados por cliente para las tarjetas
    return lista;
  }

  return [];
}

// ─────────────────────────────────────────────────────
// PUNTO DE ENTRADA
// ─────────────────────────────────────────────────────
async function cargarDashboard() {
  const { data: sesionData } = await supabaseClient.auth.getSession();
  const session = sesionData.session;

  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  const { data: usuario, error: errorUsuario } = await supabaseClient
    .from('usuarios')
    .select('id, email, rol')
    .eq('auth_user_id', session.user.id)
    .single();

  if (errorUsuario || !usuario) {
    mostrarError('No se encontró tu cuenta en el sistema. Contacta al administrador.');
    return;
  }

  nombreUsuarioEl.textContent = usuario.email;
  rolUsuarioEl.textContent    = usuario.rol;

  // Inicializar avatar con inicial del email
  const avatarEl = document.getElementById('usuarioAvatar');
  if (avatarEl) avatarEl.textContent = usuario.email.charAt(0).toUpperCase();

  // Clientes según rol
  let clientes = [];

  if (esAdmin(usuario.rol)) {
    const { data, error } = await supabaseClient
      .from('clientes')
      .select('id, nombre, rfc')
      .eq('activo', true)
      .order('nombre');

    if (error) { mostrarError('No se pudieron cargar los clientes.'); return; }
    clientes = data;
  } else {
    const { data, error } = await supabaseClient
      .from('vw_usuarios_clientes')
      .select('cliente_id, cliente_nombre')
      .eq('usuario_id', usuario.id);

    if (error) { mostrarError('No se pudieron cargar tus clientes asignados.'); return; }
    clientes = (data || [])
      .filter(c => c.cliente_id !== null)
      .map(c => ({ id: c.cliente_id, nombre: c.cliente_nombre, rfc: null }));
  }

  estadoCargaEl.style.display = 'none';

  // Cargar KPIs y obtener honorarios agrupados
  const honorariosList = await cargarResumenOperativo(clientes, esAdmin(usuario.rol)) || [];

  // Agrupar honorarios por cliente_id para las tarjetas
  const honorariosPorCliente = {};
  honorariosList.forEach(h => {
    if (!honorariosPorCliente[h.cliente_id]) honorariosPorCliente[h.cliente_id] = [];
    honorariosPorCliente[h.cliente_id].push(h);
  });

  if (clientes.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'estado-vacio';
    vacio.textContent = 'No tienes clientes asignados todavía.';
    clientesGridEl.appendChild(vacio);
    return;
  }

  clientesGridEl.innerHTML = '';
  clientes.forEach(c => {
    // Inyectar honorarios en el objeto cliente para la tarjeta
    c.honorarios = honorariosPorCliente[c.id] || [];
    clientesGridEl.appendChild(crearTarjetaCliente(c));
  });
}

document.getElementById('btnCerrarSesion').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

cargarDashboard();
