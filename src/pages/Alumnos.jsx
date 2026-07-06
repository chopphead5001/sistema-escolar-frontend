import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';

function Alumnos() {
  const { usuario } = useAuth();
  const { cicloLectivo } = useCicloLectivo();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  const [alumnos, setAlumnos] = useState([]);
  const [divisiones, setDivisiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevoAlumno, setNuevoAlumno] = useState({
    dni: '', nombre: '', apellido: '', divisionId: '', cicloLectivo
  });
  const [guardando, setGuardando] = useState(false);

  const [promoviendoId, setPromoviendoId] = useState(null);
  const [divisionDestino, setDivisionDestino] = useState('');
  const [divisionDestinoPorGrupo, setDivisionDestinoPorGrupo] = useState({});

  const [dandoDeBajaId, setDandoDeBajaId] = useState(null);
  const [motivoBaja, setMotivoBaja] = useState('');

  async function cargarAlumnos() {
    setCargando(true);
    setError('');
    try {
      const [respuestaAlumnos, respuestaDivisiones] = await Promise.all([
        cliente.get('/alumnos'),
        cliente.get('/divisiones')
      ]);
      setAlumnos(respuestaAlumnos.data);
      setDivisiones(respuestaDivisiones.data);
    } catch (err) {
      setError('No se pudo cargar el listado de alumnos');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarAlumnos();
  }, []);

  useEffect(() => {
    setNuevoAlumno((anterior) => ({ ...anterior, cicloLectivo }));
  }, [cicloLectivo]);

  async function manejarAlta(evento) {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await cliente.post('/alumnos', nuevoAlumno);
      setNuevoAlumno({ dni: '', nombre: '', apellido: '', divisionId: '', cicloLectivo });
      setMostrarFormulario(false);
      cargarAlumnos();
    } catch (err) {
      setError('No se pudo dar de alta al alumno. Revisá los datos.');
    } finally {
      setGuardando(false);
    }
  }

  function matriculaActivaDelCiclo(alumno) {
    return alumno.matriculas.find(
      (m) => m.cicloLectivo === cicloLectivo && m.activa !== false
    );
  }

  const alumnosDelCiclo = alumnos.filter((alumno) => !!matriculaActivaDelCiclo(alumno));

  const gruposDelCiclo = {};
  alumnosDelCiclo.forEach((alumno) => {
    const matricula = matriculaActivaDelCiclo(alumno);
    const division = matricula?.division?.nombre || 'Sin división';
    if (!gruposDelCiclo[division]) gruposDelCiclo[division] = [];
    gruposDelCiclo[division].push(alumno);
  });
  const divisionesDelCicloOrdenadas = Object.keys(gruposDelCiclo).sort();

  const alumnosParaPromover = alumnos.filter((alumno) => {
    const yaTieneEsteCiclo = alumno.matriculas.some((m) => m.cicloLectivo === cicloLectivo);
    const teniaCicloAnteriorActivo = alumno.matriculas.some(
      (m) => m.cicloLectivo === cicloLectivo - 1 && m.activa !== false
    );
    return !yaTieneEsteCiclo && teniaCicloAnteriorActivo;
  });

  const divisionesOrdenadas = [...divisiones].sort((a, b) => a.nombre.localeCompare(b.nombre));

  const gruposParaPromover = {};
  alumnosParaPromover.forEach((alumno) => {
    const matriculaAnterior = alumno.matriculas.find((m) => m.cicloLectivo === cicloLectivo - 1);
    const divisionOrigen = matriculaAnterior?.division?.nombre || 'Sin división';
    if (!gruposParaPromover[divisionOrigen]) gruposParaPromover[divisionOrigen] = [];
    gruposParaPromover[divisionOrigen].push(alumno);
  });
  const divisionesOrigenOrdenadas = Object.keys(gruposParaPromover).sort();

  async function promoverAlumno(alumnoId) {
    if (!divisionDestino) {
      setError('Elegí la división de destino antes de confirmar');
      return;
    }
    try {
      await cliente.post(`/alumnos/${alumnoId}/promover`, {
        cicloLectivo,
        divisionId: divisionDestino
      });
      setMensajeExito('Alumno promovido correctamente');
      setPromoviendoId(null);
      setDivisionDestino('');
      cargarAlumnos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo promover al alumno');
    }
  }

  async function promoverGrupoCompleto(divisionOrigen) {
    const destino = divisionDestinoPorGrupo[divisionOrigen];
    if (!destino) {
      setError('Elegí la división de destino para este grupo antes de confirmar');
      return;
    }
    const alumnosDelGrupo = gruposParaPromover[divisionOrigen];
    const nombreDestino = divisiones.find((d) => d.id === parseInt(destino))?.nombre || destino;
    setError('');
    try {
      for (const alumno of alumnosDelGrupo) {
        await cliente.post(`/alumnos/${alumno.id}/promover`, {
          cicloLectivo,
          divisionId: destino
        });
      }
      setMensajeExito(`Se promovieron ${alumnosDelGrupo.length} alumnos de ${divisionOrigen} a ${nombreDestino}`);
      cargarAlumnos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo promover al grupo completo');
    }
  }

  async function confirmarBaja(alumnoId, motivo) {
    const motivoFinal = motivo || motivoBaja;
    if (!motivoFinal || !motivoFinal.trim()) {
      setError('Indicá un motivo de baja (egreso, cambio de escuela, etc.)');
      return;
    }
    try {
      await cliente.put(`/alumnos/${alumnoId}/baja`, { motivo: motivoFinal });
      setMensajeExito('Alumno dado de baja correctamente');
      setDandoDeBajaId(null);
      setMotivoBaja('');
      cargarAlumnos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo dar de baja al alumno');
    }
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Alumnos — Ciclo {cicloLectivo}</h1>
        {esSecretaria && (
          <button onClick={() => setMostrarFormulario(!mostrarFormulario)}>
            {mostrarFormulario ? 'Cancelar' : '+ Nuevo alumno'}
          </button>
        )}
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      {mostrarFormulario && (
        <form onSubmit={manejarAlta} className="alumnos-formulario">
          <div className="alumnos-formulario-fila">
            <div>
              <label>DNI</label>
              <input
                type="text"
                value={nuevoAlumno.dni}
                onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, dni: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Nombre</label>
              <input
                type="text"
                value={nuevoAlumno.nombre}
                onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, nombre: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Apellido</label>
              <input
                type="text"
                value={nuevoAlumno.apellido}
                onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, apellido: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="alumnos-formulario-fila">
            <div>
              <label>División</label>
              <select
                value={nuevoAlumno.divisionId}
                onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, divisionId: e.target.value })}
                required
              >
                <option value="">Seleccioná una división</option>
                {divisionesOrdenadas.map((division) => (
                  <option key={division.id} value={division.id}>{division.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Ciclo lectivo</label>
              <input
                type="number"
                value={nuevoAlumno.cicloLectivo}
                onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, cicloLectivo: parseInt(e.target.value) })}
                required
              />
            </div>
          </div>
          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar alumno'}
          </button>
        </form>
      )}

      {esSecretaria && alumnosParaPromover.length > 0 && (
        <div className="alumnos-panel-promover">
          <p className="alumnos-panel-promover-titulo">
            {alumnosParaPromover.length} alumno(s) del ciclo {cicloLectivo - 1} todavía no fueron promovidos a {cicloLectivo}:
          </p>

          {divisionesOrigenOrdenadas.map((divisionOrigen) => (
            <div key={divisionOrigen} className="alumnos-grupo-promover">
              <div className="alumnos-grupo-promover-encabezado">
                <h3>{divisionOrigen} ({gruposParaPromover[divisionOrigen].length} alumnos)</h3>
                <div className="alumnos-promover-acciones">
                  <select
                    value={divisionDestinoPorGrupo[divisionOrigen] || ''}
                    onChange={(e) => setDivisionDestinoPorGrupo({
                      ...divisionDestinoPorGrupo,
                      [divisionOrigen]: e.target.value
                    })}
                  >
                    <option value="">Nueva división para todos...</option>
                    {divisionesOrdenadas.map((division) => (
                      <option key={division.id} value={division.id}>{division.nombre}</option>
                    ))}
                  </select>
                  <button onClick={() => promoverGrupoCompleto(divisionOrigen)}>
                    Promover grupo completo
                  </button>
                </div>
              </div>

              <ul className="alumnos-lista-promover">
                {gruposParaPromover[divisionOrigen].map((alumno) => (
                  <li key={alumno.id}>
                    <span>{alumno.apellido}, {alumno.nombre}</span>
                    {promoviendoId === alumno.id ? (
                      <span className="alumnos-promover-acciones">
                        <select value={divisionDestino} onChange={(e) => setDivisionDestino(e.target.value)}>
                          <option value="">Nueva división...</option>
                          {divisionesOrdenadas.map((division) => (
                            <option key={division.id} value={division.id}>{division.nombre}</option>
                          ))}
                        </select>
                        <button onClick={() => promoverAlumno(alumno.id)}>Confirmar</button>
                        <button onClick={() => { setPromoviendoId(null); setDivisionDestino(''); }}>Cancelar</button>
                      </span>
                    ) : (
                      <span className="alumnos-promover-acciones">
                        <button onClick={() => setPromoviendoId(alumno.id)}>Promover</button>
                        <button onClick={() => {
                          const motivo = window.prompt('Motivo de baja (egreso, cambio de escuela, etc.):');
                          if (motivo) confirmarBaja(alumno.id, motivo);
                        }}>
                          Dar de baja
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {cargando ? (
        <p>Cargando alumnos...</p>
      ) : alumnosDelCiclo.length === 0 ? (
        <p className="alumnos-vacio">No hay alumnos matriculados en el ciclo {cicloLectivo}.</p>
      ) : (
        divisionesDelCicloOrdenadas.map((division) => (
          <div key={division} className="alumnos-grupo-listado">
            <h3 className="alumnos-grupo-listado-titulo">
              {division} ({gruposDelCiclo[division].length} alumnos)
            </h3>
            <table className="alumnos-tabla">
              <thead>
                <tr>
                  <th>DNI</th>
                  <th>Apellido y nombre</th>
                  <th>Ciclo</th>
                  {esSecretaria && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {gruposDelCiclo[division].map((alumno) => (
                  <tr key={alumno.id}>
                    <td>{alumno.dni}</td>
                    <td>{alumno.apellido}, {alumno.nombre}</td>
                    <td>{cicloLectivo}</td>
                    {esSecretaria && (
                      <td>
                        {dandoDeBajaId === alumno.id ? (
                          <span className="alumnos-promover-acciones">
                            <input
                              type="text"
                              placeholder="Motivo (egreso, cambio de escuela...)"
                              value={motivoBaja}
                              onChange={(e) => setMotivoBaja(e.target.value)}
                            />
                            <button onClick={() => confirmarBaja(alumno.id)}>Confirmar baja</button>
                            <button onClick={() => { setDandoDeBajaId(null); setMotivoBaja(''); }}>Cancelar</button>
                          </span>
                        ) : (
                          <button onClick={() => setDandoDeBajaId(alumno.id)}>Dar de baja</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

export default Alumnos;