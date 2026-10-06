import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Inicio from './pages/Inicio';
import Alumnos from './pages/Alumnos';
import Personal from './pages/Personal';
import Inasistencias from './pages/Inasistencias';
import Boletines from './pages/Boletines';
import MateriasAdeudadas from './pages/MateriasAdeudadas';
import { CicloLectivoProvider } from './context/CicloLectivoContext';
import Cargos from './pages/Cargos';
import Divisiones from './pages/Divisiones';
import PartesDiarios from './pages/PartesDiarios';
import Licencias from './pages/Licencias';
import Informes from './pages/Informes';
import Horarios from './pages/Horarios';

function RutaProtegida({ children }) {
  const { usuario } = useAuth();
  if (!usuario) {
    return <Navigate to="/login" />;
  }
  return children;
}

// Para una ruta hija SECRETARIA-only (el login ya lo garantiza RutaProtegida
// en el padre) — redirige a Inicio en vez de dejar que la página cargue y se
// encuentre con el 403 crudo del backend. Mismo criterio que usa Layout.jsx
// para ocultar el link del menú (ver esSecretaria ahí); esto solo mejora la
// UX de un PRECEPTOR que tipea la URL a mano, no es una capa de seguridad —
// esa vive en el backend (soloSecretaria en las rutas correspondientes).
function RutaSecretaria({ children }) {
  const { usuario } = useAuth();
  if (usuario.rol !== 'SECRETARIA') {
    return <Navigate to="/" />;
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
            <Layout />
          </RutaProtegida>
        }
      >
        <Route index element={<Inicio />} />
        <Route path="personal" element={<RutaSecretaria><Personal /></RutaSecretaria>} />
        <Route path="cargos" element={<RutaSecretaria><Cargos /></RutaSecretaria>} />
        <Route path="horarios" element={<RutaSecretaria><Horarios /></RutaSecretaria>} />
        <Route path="divisiones" element={<RutaSecretaria><Divisiones /></RutaSecretaria>} />
        <Route path="alumnos" element={<Alumnos />} />
        <Route path="boletines" element={<Boletines />} />
        <Route path="inasistencias" element={<Inasistencias />} />
        <Route path="partes-diarios" element={<PartesDiarios />} />
        <Route path="licencias" element={<RutaSecretaria><Licencias /></RutaSecretaria>} />
        <Route path="materias-adeudadas" element={<RutaSecretaria><MateriasAdeudadas /></RutaSecretaria>} />
        <Route path="informes" element={<RutaSecretaria><Informes /></RutaSecretaria>} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CicloLectivoProvider>
          <RutasDeLaApp />
        </CicloLectivoProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;