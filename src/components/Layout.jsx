import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Layout.css';
import { useCicloLectivo } from '../context/CicloLectivoContext';

function Layout() {
  const { usuario, cerrarSesion } = useAuth();
  const { cicloLectivo, setCicloLectivo } = useCicloLectivo();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  return (
    <div className="layout">
      <aside className="layout-menu">
        <div className="layout-marca">
          <span className="layout-marca-icono">🏫</span>
          <span className="layout-marca-texto">Gestión Escolar</span>
        </div>

        <div className="layout-ciclo">
          <label>Ciclo lectivo</label>
          <select value={cicloLectivo} onChange={(e) => setCicloLectivo(parseInt(e.target.value))}>
            {Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - 5 + i).map((año) => (
              <option key={año} value={año}>{año}</option>
            ))}
          </select>
        </div>

        <nav className="layout-nav">
          <NavLink to="/" end>Inicio</NavLink>

          {esSecretaria && <NavLink to="/personal">Personal</NavLink>}
          {esSecretaria && <NavLink to="/cargos">Cargos</NavLink>}
          <NavLink to="/alumnos">Alumnos</NavLink>
          <NavLink to="/boletines">Boletines</NavLink>
          <NavLink to="/inasistencias">Inasistencias</NavLink>
          <NavLink to="/partes-diarios">Partes diarios</NavLink>

          {esSecretaria && <NavLink to="/licencias">Licencias</NavLink>}
          {esSecretaria && <NavLink to="/materias-adeudadas">Materias adeudadas</NavLink>}
          {esSecretaria && <NavLink to="/informes">Informes</NavLink>}
        </nav>

        <div className="layout-pie">
          <div className="layout-usuario">
            <span className="layout-usuario-nombre">{usuario.nombreUsuario}</span>
            <span className="layout-usuario-rol">{usuario.rol}</span>
          </div>
          <button onClick={cerrarSesion} className="layout-cerrar-sesion">
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="layout-contenido">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;