import { useAuth } from '../context/AuthContext';

function Inicio() {
  const { usuario, cerrarSesion } = useAuth();

  return (
    <div style={{ padding: '40px' }}>
      <h1>Bienvenido/a, {usuario.nombreUsuario}</h1>
      <p>Rol: {usuario.rol}</p>
      {usuario.cursosAsignados && usuario.cursosAsignados.length > 0 && (
        <div>
          <p>Tus divisiones asignadas:</p>
          <ul>
            {usuario.cursosAsignados.map((curso) => (
              <li key={curso.id}>{curso.division.nombre} (Ciclo {curso.cicloLectivo})</li>
            ))}
          </ul>
        </div>
      )}
      <button onClick={cerrarSesion}>Cerrar sesión</button>
    </div>
  );
}

export default Inicio;