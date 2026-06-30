import axios from 'axios';

const cliente = axios.create({
  baseURL: 'http://localhost:3001/api'
});

// Antes de cada pedido, si hay un token guardado, lo agregamos automáticamente
cliente.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Si el backend responde 401 (sesión inválida o expirada), cerramos sesión
// automáticamente y mandamos al login, en vez de dejar que la pantalla
// falle en silencio
cliente.interceptors.response.use(
  (respuesta) => respuesta,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default cliente;