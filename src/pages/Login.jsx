import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

function Login() {
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const { iniciarSesion } = useAuth();
  const navegar = useNavigate();

  async function manejarEnvio(evento) {
    evento.preventDefault();
    setError('');
    setCargando(true);

    try {
      await iniciarSesion(nombreUsuario, password);
      navegar('/');
    } catch (err) {
      // 429 = demasiados intentos fallidos: el backend dice cuánto esperar
      setError(err.response?.status === 429
        ? err.response.data.error
        : 'Usuario o contraseña incorrectos');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login-pagina">
      <div className="login-tarjeta">
        <div className="login-encabezado">
          <div className="login-icono">🏫</div>
          <h1>Sistema de Gestión Escolar</h1>
          <p>Ciclo lectivo 2026</p>
        </div>

        <form onSubmit={manejarEnvio} className="login-formulario">
          <label htmlFor="usuario">Usuario</label>
          <input
            id="usuario"
            type="text"
            value={nombreUsuario}
            onChange={(e) => setNombreUsuario(e.target.value)}
            placeholder="Ingresá tu usuario"
            required
          />

          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Ingresá tu contraseña"
            required
          />

          {error && <div className="login-error">{error}</div>}

          <button type="submit" disabled={cargando}>
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;