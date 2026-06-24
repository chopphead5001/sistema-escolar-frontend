import { createContext, useContext, useState } from 'react';
import cliente from '../api/cliente';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const usuarioGuardado = localStorage.getItem('usuario');
  const [usuario, setUsuario] = useState(
    usuarioGuardado ? JSON.parse(usuarioGuardado) : null
  );

  async function iniciarSesion(nombreUsuario, password) {
    const respuesta = await cliente.post('/auth/login', { nombreUsuario, password });
    const { token, usuario: datosUsuario } = respuesta.data;

    localStorage.setItem('token', token);
    localStorage.setItem('usuario', JSON.stringify(datosUsuario));
    setUsuario(datosUsuario);
  }

  function cerrarSesion() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}