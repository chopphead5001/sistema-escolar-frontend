import { createContext, useContext, useState } from 'react';

const CicloLectivoContext = createContext(null);

export function CicloLectivoProvider({ children }) {
  const cicloGuardado = localStorage.getItem('cicloLectivo');
  const [cicloLectivo, setCicloLectivoState] = useState(
    cicloGuardado ? parseInt(cicloGuardado) : 2026
  );

  function setCicloLectivo(nuevoCiclo) {
    localStorage.setItem('cicloLectivo', nuevoCiclo);
    setCicloLectivoState(nuevoCiclo);
  }

  return (
    <CicloLectivoContext.Provider value={{ cicloLectivo, setCicloLectivo }}>
      {children}
    </CicloLectivoContext.Provider>
  );
}

export function useCicloLectivo() {
  return useContext(CicloLectivoContext);
}