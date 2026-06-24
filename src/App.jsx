import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Inicio from './pages/Inicio';

// Componente que protege rutas: si no hay sesión, manda al login
function RutaProtegida({ children }) {
  const { usuario } = useAuth();
  if (!usuario) {
    return <Navigate to="/login" />;
  }
  return children;
}

function RutasDeLaApp() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RutaProtegida>
            <Inicio />
          </RutaProtegida>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RutasDeLaApp />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;