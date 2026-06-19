/* =====================================================
   Dashboard - Portal de Clientes IM Servicios Contables
   ===================================================== */

:root {
  --azul-marca: #2c4a7c;
  --azul-marca-oscuro: #1f3759;
  --fondo: #f5f7fa;
  --texto-principal: #1f2937;
  --texto-secundario: #6b7280;
  --borde: #e2e8f0;
  --error: #c0392b;
}

.dashboard-body {
  margin: 0;
  font-family: 'Segoe UI', Arial, sans-serif;
  background: var(--fondo);
  color: var(--texto-principal);
}

.dashboard-shell {
  display: flex;
  min-height: 100vh;
}

/* Sidebar */

.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--azul-marca-oscuro);
  color: #fff;
  display: flex;
  flex-direction: column;
  padding: 24px 16px;
}

.sidebar-logo {
  display: flex;
  justify-content: center;
  margin-bottom: 32px;
}

.sidebar-logo img {
  max-width: 120px;
  filter: brightness(0) invert(1);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-grow: 1;
}

.nav-item {
  padding: 10px 14px;
  border-radius: 8px;
  color: #cbd5e1;
  text-decoration: none;
  font-size: 14px;
  transition: background 0.15s ease;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav-item.active {
  background: var(--azul-marca);
  color: #fff;
  font-weight: 600;
}

.sidebar-logout {
  margin-top: auto;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: #fff;
  padding: 10px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.sidebar-logout:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* Main content */

.dashboard-main {
  flex-grow: 1;
  padding: 32px 40px;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
}

.dashboard-header h1 {
  margin: 0;
  font-size: 24px;
}

.subtitle {
  margin: 4px 0 0;
  color: var(--texto-secundario);
  font-size: 14px;
}

.usuario-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  font-size: 14px;
  color: var(--texto-secundario);
}

.badge-rol {
  background: var(--azul-marca);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  text-transform: capitalize;
}

/* Estados */

.estado-carga {
  color: var(--texto-secundario);
  font-size: 14px;
}

.estado-error {
  color: var(--error);
}

.estado-vacio {
  color: var(--texto-secundario);
  font-size: 14px;
}

/* Tarjetas de clientes */

.clientes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 18px;
}

.cliente-card {
  background: #fff;
  border: 1px solid var(--borde);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cliente-card h3 {
  margin: 0;
  font-size: 17px;
}

.cliente-rfc {
  margin: 0;
  font-size: 13px;
  color: var(--texto-secundario);
}

.cliente-card button {
  align-self: flex-start;
  background: var(--azul-marca);
  color: #fff;
  border: none;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.cliente-card button:hover {
  background: var(--azul-marca-oscuro);
}

/* Responsive */

@media (max-width: 720px) {
  .dashboard-shell {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    flex-direction: row;
    align-items: center;
    padding: 12px 16px;
  }

  .sidebar-logo {
    margin-bottom: 0;
    margin-right: 16px;
  }

  .sidebar-nav {
    flex-direction: row;
    flex-grow: 1;
    overflow-x: auto;
  }

  .sidebar-logout {
    margin-top: 0;
  }

  .dashboard-main {
    padding: 24px 20px;
  }

  .dashboard-header {
    flex-direction: column;
    gap: 12px;
  }

  .usuario-info {
    align-items: flex-start;
  }
}
