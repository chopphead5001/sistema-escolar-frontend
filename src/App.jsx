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
            <Layout />
          </RutaProtegida>
        }
      >
        <Route index element={<Inicio />} />
        <Route path="personal" element={<Personal />} />
        <Route path="cargos" element={<Cargos />} />
        <Route path="divisiones" element={<Divisiones />} />
        <Route path="alumnos" element={<Alumnos />} />
        <Route path="boletines" element={<Boletines />} />
        <Route path="inasistencias" element={<Inasistencias />} />
        <Route path="partes-diarios" element={<PartesDiarios />} />
        <Route path="licencias" element={<Licencias />} />
        <Route path="materias-adeudadas" element={<MateriasAdeudadas />} />
        <Route path="informes" element={<Informes />} />
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