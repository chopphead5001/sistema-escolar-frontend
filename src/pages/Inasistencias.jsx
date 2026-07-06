import { useState, useEffect } from 'react';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './Inasistencias.css';

function Inasistencias() {
  const { cicloLectivo } = useCicloLectivo();

  const [alumnos, setAlumnos] = useState([]);
  const [divisiones, setDivisiones] = useState([]);
  const [cargandoAlumnos, setCargandoAlumnos] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState('');

  const [divisionSeleccionada, setDivisionSeleccionada] = useState('');
  const [fecha, setFecha] = useState('');

  const [marcas, setMarcas] = useState({});

  const [diaYaConfirmado, setDiaYaConfirmado] = useState(null);
  const [verificandoDia, setVerificandoDia] = useState(false);

  async function cargarAlumnos() {
    setCargandoAlumnos(true);
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
      setCargandoAlumnos(false);
    }
  }

  useEffect(() => {
    cargarAlumnos();
  }, []);

  useEffect(() => {
    async function verificarDia() {
      if (!divisionSeleccionada || !fecha) {
        setDiaYaConfirmado(null);
        return;
      }
      setVerificandoDia(true);
      try {
        const respuesta = await cliente.get('/inasistencias/verificar-dia', {
          params: { divisionId: divisionSeleccionada, fecha }
        });
        setDiaYaConfirmado(respuesta.data.confirmado);
      } catch (err) {
        setDiaYaConfirmado(null);
      } finally {
        setVerificandoDia(false);
      }
    }
    verificarDia();
  }, [divisionSeleccionada, fecha]);

  const divisionesOrdenadas = [...divisiones].sort((a, b) => a.nombre.localeCompare(b.nombre));

  const alumnosDelCurso = alumnos.filter(a =>
    a.matriculas.some(m => m.cicloLectivo === cicloLectivo && m.divisionId === parseInt(divisionSeleccionada))
  );

  function actualizarMarca(alumnoId, campo, valor) {
    setMarcas((anterior) => {
      const marcaActual = anterior[alumnoId] || {
        ausenteTodoElDia: false, llegadaTarde: false, ausenteEducFisica: false
      };

      const nuevaMarca = { ...marcaActual, [campo]: valor };

      if (campo === 'ausenteTodoElDia' && valor) {
        nuevaMarca.llegadaTarde = false;
        nuevaMarca.ausenteEducFisica = false;
      }

      return { ...anterior, [alumnoId]: nuevaMarca };
    });
  }

  async function guardarParteDelDia() {
    setGuardando(true);
    setError('');
    setMensajeExito('');

    const alumnosConMarcas = Object.entries(marcas).filter(
      ([, marca]) => marca.ausenteTodoElDia || marca.llegadaTarde || marca.ausenteEducFisica
    );

    try {
      await cliente.post('/inasistencias/confirmar-dia', {
        divisionId: parseInt(divisionSeleccionada),
        cicloLectivo,
        fecha,
        huboClase: true
      });

      for (const [alumnoId, marca] of alumnosConMarcas) {
        await cliente.post('/inasistencias', {
          alumnoId: parseInt(alumnoId),
          divisionId: parseInt(divisionSeleccionada),
          cicloLectivo,
          fecha,
          ...marca
        });
      }

      setMensajeExito(
        alumnosConMarcas.length > 0
          ? `Parte del ${fecha} guardado: ${alumnosConMarcas.length} novedades registradas`
          : `Parte del ${fecha} guardado: sin novedades, todos presentes`
      );
      setMarcas({});
      setDiaYaConfirmado(true);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el parte del día');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Inasistencias — Parte diario por curso (Ciclo {cicloLectivo})</h1>
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      <div className="alumnos-formulario">
        <div className="alumnos-formulario-fila">
          <div>
            <label>División</label>
            <select
              value={divisionSeleccionada}
              onChange={(e) => { setDivisionSeleccionada(e.target.value); setMarcas({}); }}
            >
              <option value="">Seleccioná una división</option>
              {divisionesOrdenadas.map((division) => (
                <option key={division.id} value={division.id}>{division.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
        </div>

        {verificandoDia && (
          <p className="inasistencias-aviso-verificando">Verificando si este día ya fue cargado...</p>
        )}
        {!verificandoDia && diaYaConfirmado === true && (
          <p className="inasistencias-aviso-ya-cargado">
            ⚠️ Este día ya fue cargado para esta división. Si guardás de nuevo, se actualiza lo existente.
          </p>
        )}
        {!verificandoDia && diaYaConfirmado === false && (
          <p className="inasistencias-aviso-pendiente">Este día todavía no fue cargado.</p>
        )}
      </div>

      {cargandoAlumnos ? (
        <p>Cargando alumnos...</p>
      ) : !divisionSeleccionada || !fecha ? (
        <p className="alumnos-vacio">Elegí una división y una fecha para cargar el parte del día.</p>
      ) : alumnosDelCurso.length === 0 ? (
        <p className="alumnos-vacio">No hay alumnos cargados en esa división para este ciclo.</p>
      ) : (
        <>
          <table className="alumnos-tabla inasistencias-tabla-curso">
            <thead>
              <tr>
                <th>Alumno</th>
                <th>Ausente todo el día</th>
                <th>Llegada tarde</th>
                <th>Ausente Ed. Física</th>
              </tr>
            </thead>
            <tbody>
              {alumnosDelCurso.map((alumno) => {
                const marca = marcas[alumno.id] || {
                  ausenteTodoElDia: false, llegadaTarde: false, ausenteEducFisica: false
                };
                return (
                  <tr key={alumno.id}>
                    <td>{alumno.apellido}, {alumno.nombre}</td>
                    <td className="inasistencias-celda-check">
                      <input
                        type="checkbox"
                        checked={marca.ausenteTodoElDia}
                        onChange={(e) => actualizarMarca(alumno.id, 'ausenteTodoElDia', e.target.checked)}
                      />
                    </td>
                    <td className="inasistencias-celda-check">
                      <input
                        type="checkbox"
                        checked={marca.llegadaTarde}
                        disabled={marca.ausenteTodoElDia}
                        onChange={(e) => actualizarMarca(alumno.id, 'llegadaTarde', e.target.checked)}
                      />
                    </td>
                    <td className="inasistencias-celda-check">
                      <input
                        type="checkbox"
                        checked={marca.ausenteEducFisica}
                        disabled={marca.ausenteTodoElDia}
                        onChange={(e) => actualizarMarca(alumno.id, 'ausenteEducFisica', e.target.checked)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <button
            className="inasistencias-boton-guardar"
            onClick={guardarParteDelDia}
            disabled={guardando}
          >
            {guardando ? 'Guardando...' : 'Guardar parte del día'}
          </button>
        </>
      )}
    </div>
  );
}

export default Inasistencias;