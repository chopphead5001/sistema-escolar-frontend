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

export default cliente;