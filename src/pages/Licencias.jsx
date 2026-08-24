import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCicloLectivo } from '../context/CicloLectivoContext';
import cliente from '../api/cliente';
import './Alumnos.css';
import './Cargos.css';
import './MateriasAdeudadas.css';
import './Inasistencias.css';
import './Licencias.css';
import { claveDiaUTC, licenciaVigenteEn } from '../constants/horarios';

// Formatea "YYYY-MM-DDT00:00:00.000Z" a "DD/MM/YYYY" leyendo el string
// directamente, sin construir un Date y sin pasar por toLocaleDateString —
// esta última reinterpreta la medianoche UTC en la hora local del navegador,
// y en cualquier zona horaria con offset negativo (ej. Argentina, UTC-3)
// termina mostrando el día anterior al que realmente se guardó.
function formatearFecha(fechaIso) {
  const [anio, mes, dia] = fechaIso.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

// Cuenta días de calendario distintos cubiertos por un conjunto de rangos
// {inicio, fin}, mergeando solapamientos — así 2 licencias de la misma
// persona en 2 cargos distintos pero con las mismas fechas (el caso típico de
// "tiene 2 cargos y toma licencia de los 2 a la vez") cuentan una sola vez,
// no el doble. fin null (todavía vigente) se corta en hoy.
function diasUnicos(rangos) {
  const dias = new Set();
  const ahora = new Date();
  const hoyUTC = Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const unDia = 24 * 60 * 60 * 1000;
  rangos.forEach(({ inicio, fin }) => {
    if (!inicio) return;
    const desde = claveDiaUTC(inicio);
    const hasta = fin ? claveDiaUTC(fin) : hoyUTC;
    if (hasta < desde) return;
    for (let t = desde; t <= hasta; t += unDia) {
      dias.add(t);
    }
  });
  return dias.size;
}

// Agrupa licencias por persona (titular) y, dentro de cada persona, por tipo
// de licencia — para responder "¿cuántos días de enfermedad tiene Walter?"
// sin duplicar si tomó licencia de 2 cargos a la vez con las mismas fechas.
function agruparPorTitular(licencias) {
  const porPersona = {};
  licencias.forEach((l) => {
    const pid = l.personaId;
    if (!porPersona[pid]) {
      porPersona[pid] = { personaId: pid, nombre: `${l.persona.apellido}, ${l.persona.nombre}`, porTipo: {} };
    }
    const tipoNombre = l.tipoLicencia.nombre;
    if (!porPersona[pid].porTipo[tipoNombre]) porPersona[pid].porTipo[tipoNombre] = [];
    porPersona[pid].porTipo[tipoNombre].push(l);
  });
  return Object.values(porPersona)
    .map((p) => {
      const todosLosRangos = Object.values(p.porTipo).flat().map((l) => ({ inicio: l.fechaInicio, fin: l.fechaFin }));
      return {
        ...p,
        // Total sin duplicar entre tipos, no la suma de cada tipo — si por
        // algún motivo 2 licencias de tipos distintos se superponen en fecha,
        // esos días no deben contarse dos veces en el total general.
        diasTotales: diasUnicos(todosLosRangos),
        tipos: Object.entries(p.porTipo)
          .map(([tipoNombre, licenciasDelTipo]) => ({
            tipoNombre,
            dias: diasUnicos(licenciasDelTipo.map((l) => ({ inicio: l.fechaInicio, fin: l.fechaFin }))),
            licencias: [...licenciasDelTipo].sort((a, b) => new Date(b.fechaInicio) - new Date(a.fechaInicio))
          }))
          .sort((a, b) => b.dias - a.dias)
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// Agrupa los cargos de suplencia (origenLicenciaId no null) por la persona que
// cubrió, para responder "¿de cuándo a cuándo trabajó cada suplente?" —
// incluye coberturas de coberturas (suplente de suplente), cada una es un
// Cargo más en la lista, no hay nada especial que tratar distinto.
function agruparPorSuplente(cargos) {
  const cargosSuplencia = cargos.filter((c) => c.origenLicenciaId);
  const porPersona = {};
  cargosSuplencia.forEach((c) => {
    const pid = c.personaId;
    if (!porPersona[pid]) {
      porPersona[pid] = { personaId: pid, nombre: `${c.persona.apellido}, ${c.persona.nombre}`, coberturas: [] };
    }
    porPersona[pid].coberturas.push({
      cargoId: c.id,
      cargoNombre: c.nombreCargo,
      divisionNombre: c.division?.nombre,
      cubreA: c.origenLicencia?.persona,
      fechaInicio: c.fechaInicioCobertura,
      fechaFin: c.fechaFinCobertura,
      vigente: c.vigente
    });
  });
  return Object.values(porPersona)
    .map((p) => ({
      ...p,
      diasTotales: diasUnicos(p.coberturas.map((cob) => ({ inicio: cob.fechaInicio, fin: cob.fechaFin }))),
      coberturas: p.coberturas.sort((a, b) => new Date(b.fechaInicio || 0) - new Date(a.fechaInicio || 0))
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function Licencias() {
  const { usuario } = useAuth();
  const { cicloLectivo } = useCicloLectivo();
  const esSecretaria = usuario.rol === 'SECRETARIA';

  const [vista, setVista] = useState('licencias');
  const [personas, setPersonas] = useState([]);
  const [tiposLicencia, setTiposLicencia] = useState([]);
  const [licencias, setLicencias] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [subiendoCertificado, setSubiendoCertificado] = useState(false);
  const [arrastrandoCertificado, setArrastrandoCertificado] = useState(false);
  const inputArchivoRef = useRef(null);

  const [mostrarFormularioTipo, setMostrarFormularioTipo] = useState(false);
  const [nuevoTipo, setNuevoTipo] = useState({
    nombre: '', generaFalta: true, requiereCertificado: false, habilitaSuplente: true
  });
  const [tipoEnEdicionId, setTipoEnEdicionId] = useState(null);
  const [tipoEnEdicion, setTipoEnEdicion] = useState(null);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [licenciaEnEdicion, setLicenciaEnEdicion] = useState(null);
  const [busquedaPersona, setBusquedaPersona] = useState('');
  const [busquedaSuplente, setBusquedaSuplente] = useState('');
  const [busquedaTabla, setBusquedaTabla] = useState('');
  const [busquedaHistorial, setBusquedaHistorial] = useState('');
  const [tiposFiltro, setTiposFiltro] = useState([]);
  const [formulario, setFormulario] = useState({
    personaId: '', cargoIds: [], tipoLicenciaId: '', fechaInicio: '', fechaFin: '',
    certificadoArchivo: '', certificadoNombreOriginal: '', suplentePersonaId: '',
    // Solo se usa en alta con más de un cargo afectado: cada cargo puede
    // necesitar un suplente distinto (ej. quien cubre "Jefe de Preceptores"
    // no tiene por qué ser quien cubre las clases de otra materia).
    suplentesPorCargo: {}
  });

  async function cargarDatos() {
    setCargando(true);
    setError('');
    try {
      const [respuestaPersonal, respuestaTipos, respuestaLicencias, respuestaCargos] = await Promise.all([
        cliente.get('/personal'),
        cliente.get('/licencias/tipos'),
        cliente.get('/licencias', { params: { cicloLectivo } }),
        cliente.get('/cargos', { params: { cicloLectivo } })
      ]);
      setPersonas(respuestaPersonal.data);
      setTiposLicencia(respuestaTipos.data);
      setLicencias(respuestaLicencias.data);
      setCargos(respuestaCargos.data);
    } catch (err) {
      setError('No se pudo cargar la información de licencias');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (esSecretaria) cargarDatos();
  }, [cicloLectivo, esSecretaria]);

  // El personal deshabilitado no puede tomar una licencia nueva ni cubrir como suplente.
  const personasActivas = personas.filter((p) => p.activo);

  const personasFiltradas = busquedaPersona
    ? personasActivas.filter((p) => `${p.apellido} ${p.nombre}`.toLowerCase().includes(busquedaPersona.toLowerCase()))
    : personasActivas;

  // Una persona no puede ser su propia suplente: la excluimos tanto en alta
  // (personaId elegido en el formulario) como en edición (dueña de la licencia).
  const personaIdAExcluirDeSuplente = licenciaEnEdicion
    ? licenciaEnEdicion.personaId
    : parseInt(formulario.personaId) || null;
  const personasParaSuplente = (busquedaSuplente
    ? personasActivas.filter((p) => `${p.apellido} ${p.nombre}`.toLowerCase().includes(busquedaSuplente.toLowerCase()))
    : personasActivas
  ).filter((p) => p.id !== personaIdAExcluirDeSuplente);

  const personaSeleccionada = personas.find((p) => p.id === parseInt(formulario.personaId));
  // Un cargo de cobertura (origenLicenciaId) puede a su vez tomar licencia: si
  // quien cubre se enferma, necesita quedar registrado con sus propios días,
  // certificado y hasta su propio suplente (ver 2026-08-21 en CLAUDE.md).
  const cargosDeLaPersona = personaSeleccionada
    ? personaSeleccionada.cargos.filter((c) => c.vigente && c.cicloLectivo === cicloLectivo)
    : [];

  // Un tipo desactivado no debe ofrecerse para licencias nuevas, pero si una
  // licencia ya lo usa (fue desactivado después) tiene que seguir apareciendo
  // en su propio formulario de edición, si no desaparecería del selector.
  const tiposParaSeleccionar = tiposLicencia.filter(
    (t) => t.activa || t.id === (licenciaEnEdicion ? licenciaEnEdicion.tipoLicenciaId : null)
  );
  const tipoSeleccionado = tiposLicencia.find((t) => t.id === parseInt(formulario.tipoLicenciaId));

  function alternarTipoFiltro(tipoId) {
    setTiposFiltro((anterior) =>
      anterior.includes(tipoId) ? anterior.filter((id) => id !== tipoId) : [...anterior, tipoId]
    );
  }

  // Vigentes primero, y dentro de cada grupo la más reciente arriba.
  const licenciasFiltradas = licencias
    .filter((l) => !busquedaTabla || `${l.persona.apellido} ${l.persona.nombre}`.toLowerCase().includes(busquedaTabla.toLowerCase()))
    .filter((l) => tiposFiltro.length === 0 || tiposFiltro.includes(l.tipoLicenciaId))
    .sort((a, b) => {
      const vigenteA = licenciaVigenteEn(a);
      const vigenteB = licenciaVigenteEn(b);
      if (vigenteA !== vigenteB) return vigenteA ? -1 : 1;
      return new Date(b.fechaInicio) - new Date(a.fechaInicio);
    });

  const historialTitular = agruparPorTitular(licencias);
  const historialSuplente = agruparPorSuplente(cargos);

  // Un solo buscador para las 4 tablas del Historial: encuentra a la persona
  // sea cual sea su rol ahí (titular de la licencia, o suplente que cubrió).
  const busquedaHistorialNorm = busquedaHistorial.trim().toLowerCase();
  function coincideHistorial(nombreCompleto) {
    return !busquedaHistorialNorm || nombreCompleto.toLowerCase().includes(busquedaHistorialNorm);
  }
  const historialTitularFiltrado = historialTitular.filter((p) => coincideHistorial(p.nombre));
  const licenciasHistorialFiltradas = licencias.filter((l) =>
    coincideHistorial(`${l.persona.apellido} ${l.persona.nombre}`) ||
    (l.suplente && coincideHistorial(`${l.suplente.apellido} ${l.suplente.nombre}`))
  );
  const historialSuplenteFiltrado = historialSuplente.filter((p) => coincideHistorial(p.nombre));
  const historialCoberturaFiltrado = historialSuplente
    .map((p) => ({
      ...p,
      coberturas: coincideHistorial(p.nombre)
        ? p.coberturas
        : p.coberturas.filter((c) => c.cubreA && coincideHistorial(`${c.cubreA.apellido} ${c.cubreA.nombre}`))
    }))
    .filter((p) => p.coberturas.length > 0);

  function abrirFormularioNuevo() {
    setLicenciaEnEdicion(null);
    setFormulario({
      personaId: '', cargoIds: [], tipoLicenciaId: '', fechaInicio: '', fechaFin: '',
      certificadoArchivo: '', certificadoNombreOriginal: '', suplentePersonaId: '', suplentesPorCargo: {}
    });
    setBusquedaPersona('');
    setBusquedaSuplente('');
    setMostrarFormulario(true);
  }

  function abrirFormularioEdicion(licencia) {
    setLicenciaEnEdicion(licencia);
    setFormulario({
      personaId: '', cargoIds: [],
      tipoLicenciaId: licencia.tipoLicenciaId,
      fechaInicio: licencia.fechaInicio.slice(0, 10),
      fechaFin: licencia.fechaFin ? licencia.fechaFin.slice(0, 10) : '',
      certificadoArchivo: licencia.certificadoArchivo || '',
      certificadoNombreOriginal: licencia.certificadoNombreOriginal || '',
      suplentePersonaId: licencia.suplentePersonaId || '',
      suplentesPorCargo: {}
    });
    setBusquedaSuplente('');
    setMostrarFormulario(true);
  }

  function cerrarFormulario() {
    setMostrarFormulario(false);
    setLicenciaEnEdicion(null);
  }

  function alternarCargo(cargoId) {
    setFormulario((anterior) => {
      const yaSeleccionado = anterior.cargoIds.includes(cargoId);
      const cargoIds = yaSeleccionado
        ? anterior.cargoIds.filter((id) => id !== cargoId)
        : [...anterior.cargoIds, cargoId];
      // Si se destilda un cargo, se olvida el suplente que tenía elegido —
      // si se vuelve a marcar más tarde, arranca en blanco otra vez.
      const suplentesPorCargo = { ...anterior.suplentesPorCargo };
      if (yaSeleccionado) delete suplentesPorCargo[cargoId];
      return { ...anterior, cargoIds, suplentesPorCargo };
    });
  }

  function setSuplenteDeCargo(cargoId, personaId) {
    setFormulario((anterior) => ({
      ...anterior,
      suplentesPorCargo: { ...anterior.suplentesPorCargo, [cargoId]: personaId }
    }));
  }

  function aplicarSuplenteATodosLosCargos(personaId) {
    setFormulario((anterior) => ({
      ...anterior,
      suplentesPorCargo: Object.fromEntries(anterior.cargoIds.map((id) => [id, personaId]))
    }));
  }

  async function subirArchivoCertificado(archivo) {
    setSubiendoCertificado(true);
    setError('');
    try {
      const datosFormulario = new FormData();
      datosFormulario.append('archivo', archivo);
      const respuesta = await cliente.post('/licencias/certificado', datosFormulario);
      setFormulario((anterior) => ({
        ...anterior,
        certificadoArchivo: respuesta.data.archivo,
        certificadoNombreOriginal: respuesta.data.nombreOriginal
      }));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo subir el certificado');
    } finally {
      setSubiendoCertificado(false);
    }
  }

  function manejarSeleccionArchivo(evento) {
    const archivo = evento.target.files[0];
    evento.target.value = '';
    if (archivo) subirArchivoCertificado(archivo);
  }

  function manejarDragOverCertificado(evento) {
    evento.preventDefault();
    if (subiendoCertificado) return;
    setArrastrandoCertificado(true);
  }

  function manejarDragLeaveCertificado(evento) {
    // Sin este chequeo, moverse entre elementos hijos del dropzone dispara
    // dragleave/dragover en cascada y la marca visual "parpadea".
    if (evento.currentTarget.contains(evento.relatedTarget)) return;
    setArrastrandoCertificado(false);
  }

  function manejarDropCertificado(evento) {
    evento.preventDefault();
    setArrastrandoCertificado(false);
    if (subiendoCertificado) return;
    const archivo = evento.dataTransfer.files[0];
    if (archivo) subirArchivoCertificado(archivo);
  }

  function quitarCertificadoSeleccionado() {
    setFormulario((anterior) => ({ ...anterior, certificadoArchivo: '', certificadoNombreOriginal: '' }));
  }

  async function verCertificado(archivo, nombreOriginal) {
    try {
      const respuesta = await cliente.get(`/licencias/certificado/${archivo}`, {
        responseType: 'blob',
        params: nombreOriginal ? { nombre: nombreOriginal } : undefined
      });
      const url = window.URL.createObjectURL(respuesta.data);
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setError('No se pudo abrir el certificado');
    }
  }

  async function manejarAltaTipo(evento) {
    evento.preventDefault();
    try {
      await cliente.post('/licencias/tipos', nuevoTipo);
      setNuevoTipo({ nombre: '', generaFalta: true, requiereCertificado: false, habilitaSuplente: true });
      setMostrarFormularioTipo(false);
      setMensajeExito('Tipo de licencia creado correctamente');
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear el tipo de licencia');
    }
  }

  function abrirEdicionTipo(tipo) {
    setTipoEnEdicionId(tipo.id);
    setTipoEnEdicion({
      nombre: tipo.nombre,
      generaFalta: tipo.generaFalta,
      requiereCertificado: tipo.requiereCertificado,
      habilitaSuplente: tipo.habilitaSuplente
    });
    setError('');
    setMensajeExito('');
  }

  function cancelarEdicionTipo() {
    setTipoEnEdicionId(null);
    setTipoEnEdicion(null);
  }

  async function guardarEdicionTipo(evento) {
    evento.preventDefault();
    try {
      const tipoActual = tiposLicencia.find((t) => t.id === tipoEnEdicionId);
      await cliente.put(`/licencias/tipos/${tipoEnEdicionId}`, { ...tipoEnEdicion, activa: tipoActual.activa });
      setMensajeExito('Tipo de licencia actualizado correctamente');
      cancelarEdicionTipo();
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron guardar los cambios');
    }
  }

  async function alternarActivaTipo(tipo) {
    const accion = tipo.activa ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Confirmás que querés ${accion} el tipo de licencia "${tipo.nombre}"?`)) return;
    try {
      await cliente.put(`/licencias/tipos/${tipo.id}`, {
        nombre: tipo.nombre, generaFalta: tipo.generaFalta, requiereCertificado: tipo.requiereCertificado,
        habilitaSuplente: tipo.habilitaSuplente, activa: !tipo.activa
      });
      cargarDatos();
    } catch (err) {
      setError(`No se pudo ${accion} el tipo de licencia`);
    }
  }

  async function manejarAlta(evento) {
    evento.preventDefault();
    setError('');
    setMensajeExito('');

    if (licenciaEnEdicion) {
      setGuardando(true);
      try {
        await cliente.put(`/licencias/${licenciaEnEdicion.id}`, {
          tipoLicenciaId: parseInt(formulario.tipoLicenciaId),
          fechaInicio: formulario.fechaInicio,
          fechaFin: formulario.fechaFin || null,
          certificadoArchivo: tipoSeleccionado?.requiereCertificado ? (formulario.certificadoArchivo || null) : null,
          certificadoNombreOriginal: tipoSeleccionado?.requiereCertificado ? (formulario.certificadoNombreOriginal || null) : null,
          suplentePersonaId: tipoSeleccionado?.habilitaSuplente && formulario.suplentePersonaId
            ? parseInt(formulario.suplentePersonaId)
            : null
        });
        setMensajeExito('Licencia actualizada correctamente');
        cerrarFormulario();
        cargarDatos();
      } catch (err) {
        setError(err.response?.data?.error || 'No se pudo actualizar la licencia');
      } finally {
        setGuardando(false);
      }
      return;
    }

    if (formulario.cargoIds.length === 0) {
      setError('Seleccioná al menos un cargo afectado');
      return;
    }
    setGuardando(true);
    const cargoIdsOriginales = formulario.cargoIds;
    const cargoIdsRestantes = [...cargoIdsOriginales];
    try {
      while (cargoIdsRestantes.length > 0) {
        const cargoId = cargoIdsRestantes[0];
        await cliente.post('/licencias', {
          personaId: parseInt(formulario.personaId),
          cargoId,
          tipoLicenciaId: parseInt(formulario.tipoLicenciaId),
          fechaInicio: formulario.fechaInicio,
          fechaFin: formulario.fechaFin || null,
          certificadoArchivo: tipoSeleccionado?.requiereCertificado ? (formulario.certificadoArchivo || null) : null,
          certificadoNombreOriginal: tipoSeleccionado?.requiereCertificado ? (formulario.certificadoNombreOriginal || null) : null,
          suplentePersonaId: tipoSeleccionado?.habilitaSuplente && formulario.suplentesPorCargo[cargoId]
            ? parseInt(formulario.suplentesPorCargo[cargoId])
            : null,
          cicloLectivo
        });
        // Se saca de la lista de pendientes recién después de que el POST confirmó éxito,
        // así un reintento tras un fallo parcial no vuelve a crear los que ya se guardaron.
        cargoIdsRestantes.shift();
      }
      setMensajeExito(
        cargoIdsOriginales.length === 1
          ? 'Licencia registrada correctamente'
          : `Se registraron ${cargoIdsOriginales.length} licencias (una por cada cargo seleccionado)`
      );
      cerrarFormulario();
    } catch (err) {
      const guardados = cargoIdsOriginales.length - cargoIdsRestantes.length;
      setFormulario((anterior) => ({ ...anterior, cargoIds: cargoIdsRestantes }));
      if (guardados > 0) {
        setError(
          `${err.response?.data?.error || 'Falló el registro de uno de los cargos'} — ` +
          `se guardaron ${guardados} de ${cargoIdsOriginales.length} licencias. ` +
          'Los cargos restantes quedaron seleccionados: podés reintentar sin duplicar los que ya se guardaron.'
        );
      } else {
        setError(err.response?.data?.error || 'No se pudo registrar la licencia');
      }
    } finally {
      setGuardando(false);
      cargarDatos();
    }
  }

  if (!esSecretaria) {
    return (
      <div className="alumnos-pagina">
        <h1>Licencias</h1>
        <p className="alumnos-vacio">No tenés permiso para acceder a este módulo.</p>
      </div>
    );
  }

  return (
    <div className="alumnos-pagina">
      <div className="alumnos-encabezado">
        <h1>Licencias — Ciclo {cicloLectivo}</h1>
        {vista === 'licencias' ? (
          <button onClick={() => mostrarFormulario ? cerrarFormulario() : abrirFormularioNuevo()}>
            {mostrarFormulario ? 'Cancelar' : '+ Nueva licencia'}
          </button>
        ) : vista === 'tipos' ? (
          <button onClick={() => setMostrarFormularioTipo(!mostrarFormularioTipo)}>
            {mostrarFormularioTipo ? 'Cancelar' : '+ Tipo de licencia'}
          </button>
        ) : null}
      </div>

      <div className="cargos-tabs">
        <button
          className={vista === 'licencias' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
          onClick={() => setVista('licencias')}
        >
          Licencias
        </button>
        <button
          className={vista === 'tipos' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
          onClick={() => setVista('tipos')}
        >
          Tipos de licencia
        </button>
        <button
          className={vista === 'historial' ? 'cargos-tab cargos-tab-activa' : 'cargos-tab'}
          onClick={() => setVista('historial')}
        >
          Historial
        </button>
      </div>

      {error && <div className="alumnos-error">{error}</div>}
      {mensajeExito && <div className="inasistencias-exito">{mensajeExito}</div>}

      {vista === 'tipos' ? (
        <>
          {mostrarFormularioTipo && (
            <form onSubmit={manejarAltaTipo} className="alumnos-formulario">
              <div className="alumnos-formulario-fila">
                <div>
                  <label>Nombre del tipo de licencia</label>
                  <input
                    type="text"
                    placeholder="Ej: Enfermedad, Vacaciones, Maternidad"
                    value={nuevoTipo.nombre}
                    onChange={(e) => setNuevoTipo({ ...nuevoTipo, nombre: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="alumnos-formulario-fila">
                <label className="inasistencias-checkbox">
                  <input
                    type="checkbox"
                    checked={nuevoTipo.generaFalta}
                    onChange={(e) => setNuevoTipo({ ...nuevoTipo, generaFalta: e.target.checked })}
                  />
                  Genera falta
                </label>
                <label className="inasistencias-checkbox">
                  <input
                    type="checkbox"
                    checked={nuevoTipo.requiereCertificado}
                    onChange={(e) => setNuevoTipo({ ...nuevoTipo, requiereCertificado: e.target.checked })}
                  />
                  Requiere certificado
                </label>
                <label className="inasistencias-checkbox">
                  <input
                    type="checkbox"
                    checked={nuevoTipo.habilitaSuplente}
                    onChange={(e) => setNuevoTipo({ ...nuevoTipo, habilitaSuplente: e.target.checked })}
                  />
                  Habilita suplente
                </label>
              </div>
              <button type="submit">Guardar tipo de licencia</button>
            </form>
          )}

          {cargando ? (
            <p>Cargando...</p>
          ) : tiposLicencia.length === 0 ? (
            <p className="alumnos-vacio">No hay tipos de licencia cargados todavía.</p>
          ) : (
            <table className="alumnos-tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Genera falta</th>
                  <th>Requiere certificado</th>
                  <th>Habilita suplente</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {[...tiposLicencia].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((tipo) => (
                  tipoEnEdicionId === tipo.id ? (
                    <tr key={tipo.id}>
                      <td colSpan={6}>
                        <form onSubmit={guardarEdicionTipo} className="alumnos-formulario">
                          <div className="alumnos-formulario-fila">
                            <div>
                              <label>Nombre</label>
                              <input
                                type="text"
                                value={tipoEnEdicion.nombre}
                                onChange={(e) => setTipoEnEdicion({ ...tipoEnEdicion, nombre: e.target.value })}
                                required
                              />
                            </div>
                          </div>
                          <div className="alumnos-formulario-fila">
                            <label className="inasistencias-checkbox">
                              <input
                                type="checkbox"
                                checked={tipoEnEdicion.generaFalta}
                                onChange={(e) => setTipoEnEdicion({ ...tipoEnEdicion, generaFalta: e.target.checked })}
                              />
                              Genera falta
                            </label>
                            <label className="inasistencias-checkbox">
                              <input
                                type="checkbox"
                                checked={tipoEnEdicion.requiereCertificado}
                                onChange={(e) => setTipoEnEdicion({ ...tipoEnEdicion, requiereCertificado: e.target.checked })}
                              />
                              Requiere certificado
                            </label>
                            <label className="inasistencias-checkbox">
                              <input
                                type="checkbox"
                                checked={tipoEnEdicion.habilitaSuplente}
                                onChange={(e) => setTipoEnEdicion({ ...tipoEnEdicion, habilitaSuplente: e.target.checked })}
                              />
                              Habilita suplente
                            </label>
                          </div>
                          <span className="alumnos-promover-acciones">
                            <button type="submit">Guardar cambios</button>
                            <button type="button" onClick={cancelarEdicionTipo}>Cancelar</button>
                          </span>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={tipo.id}>
                      <td>{tipo.nombre}</td>
                      <td>{tipo.generaFalta ? 'Sí' : 'No'}</td>
                      <td>{tipo.requiereCertificado ? 'Sí' : 'No'}</td>
                      <td>{tipo.habilitaSuplente ? 'Sí' : 'No'}</td>
                      <td>
                        <span className={`materiasadeudadas-estado ${tipo.activa ? 'materiasadeudadas-estado-aprobada' : 'materiasadeudadas-estado-trasladada'}`}>
                          {tipo.activa ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <span className="materiasadeudadas-acciones">
                          <button onClick={() => abrirEdicionTipo(tipo)}>Editar</button>
                          <button onClick={() => alternarActivaTipo(tipo)}>
                            {tipo.activa ? 'Desactivar' : 'Activar'}
                          </button>
                        </span>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : vista === 'historial' ? (
        <>
          <div className="alumnos-formulario">
            <label>Buscar persona</label>
            <input
              type="text"
              placeholder="Buscar por apellido o nombre..."
              value={busquedaHistorial}
              onChange={(e) => setBusquedaHistorial(e.target.value)}
              style={{ maxWidth: '320px' }}
            />
          </div>

          <div className="alumnos-formulario">
            <h2 className="licencias-historial-titulo">Días de licencia por persona</h2>
            {historialTitular.length === 0 ? (
              <p className="alumnos-vacio">No hay licencias registradas para el ciclo {cicloLectivo}.</p>
            ) : historialTitularFiltrado.length === 0 ? (
              <p className="alumnos-vacio">Nadie coincide con la búsqueda.</p>
            ) : (
              <table className="alumnos-tabla">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Tipo</th>
                    <th>Días (sin duplicar)</th>
                    <th>Total persona</th>
                  </tr>
                </thead>
                <tbody>
                  {historialTitularFiltrado.map((persona) => (
                    persona.tipos.map((tipo, indice) => (
                      <tr key={`${persona.personaId}-${tipo.tipoNombre}`}>
                        <td>{indice === 0 ? persona.nombre : ''}</td>
                        <td>{tipo.tipoNombre}</td>
                        <td>{tipo.dias}</td>
                        <td>{indice === 0 ? <strong>{persona.diasTotales}</strong> : ''}</td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="alumnos-formulario">
            <h3 className="licencias-historial-subtitulo">Detalle de cada licencia</h3>
            {licencias.length === 0 ? (
              <p className="alumnos-vacio">Sin datos.</p>
            ) : licenciasHistorialFiltradas.length === 0 ? (
              <p className="alumnos-vacio">Nadie coincide con la búsqueda.</p>
            ) : (
              <table className="alumnos-tabla">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Tipo</th>
                    <th>Cargo</th>
                    <th>Desde</th>
                    <th>Hasta</th>
                    <th>Días</th>
                    <th>Suplente</th>
                  </tr>
                </thead>
                <tbody>
                  {[...licenciasHistorialFiltradas].sort((a, b) => new Date(b.fechaInicio) - new Date(a.fechaInicio)).map((l) => (
                    <tr key={l.id}>
                      <td>{l.persona.apellido}, {l.persona.nombre}</td>
                      <td>{l.tipoLicencia.nombre}</td>
                      <td>{l.cargo.nombreCargo}{l.cargo.division ? ` (${l.cargo.division.nombre})` : ''}</td>
                      <td>{formatearFecha(l.fechaInicio)}</td>
                      <td>
                        {l.fechaFin ? (
                          formatearFecha(l.fechaFin)
                        ) : (
                          <span className="materiasadeudadas-estado materiasadeudadas-estado-csa">Vigente</span>
                        )}
                      </td>
                      <td>{diasUnicos([{ inicio: l.fechaInicio, fin: l.fechaFin }])}</td>
                      <td>{l.suplente ? `${l.suplente.apellido}, ${l.suplente.nombre}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="alumnos-formulario">
            <h2 className="licencias-historial-titulo">Días cubiertos por suplente</h2>
            {historialSuplente.length === 0 ? (
              <p className="alumnos-vacio">Todavía nadie cubrió ninguna licencia en este ciclo.</p>
            ) : historialSuplenteFiltrado.length === 0 ? (
              <p className="alumnos-vacio">Nadie coincide con la búsqueda.</p>
            ) : (
              <table className="alumnos-tabla">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Días cubiertos (sin duplicar)</th>
                  </tr>
                </thead>
                <tbody>
                  {historialSuplenteFiltrado.map((persona) => (
                    <tr key={persona.personaId}>
                      <td>{persona.nombre}</td>
                      <td>{persona.diasTotales}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="alumnos-formulario">
            <h3 className="licencias-historial-subtitulo">Detalle de cada cobertura</h3>
            {historialSuplente.length === 0 ? (
              <p className="alumnos-vacio">Sin datos.</p>
            ) : historialCoberturaFiltrado.length === 0 ? (
              <p className="alumnos-vacio">Nadie coincide con la búsqueda.</p>
            ) : (
              <table className="alumnos-tabla">
                <thead>
                  <tr>
                    <th>Suplente</th>
                    <th>Cubrió a</th>
                    <th>Cargo</th>
                    <th>Desde</th>
                    <th>Hasta</th>
                    <th>Días</th>
                  </tr>
                </thead>
                <tbody>
                  {historialCoberturaFiltrado.map((persona) => (
                    persona.coberturas.map((cob, indice) => (
                      <tr key={cob.cargoId}>
                        <td>{indice === 0 ? persona.nombre : ''}</td>
                        <td>{cob.cubreA ? `${cob.cubreA.apellido}, ${cob.cubreA.nombre}` : '-'}</td>
                        <td>{cob.cargoNombre}{cob.divisionNombre ? ` (${cob.divisionNombre})` : ''}</td>
                        <td>{cob.fechaInicio ? formatearFecha(cob.fechaInicio) : '-'}</td>
                        <td>
                          {cob.vigente ? (
                            <span className="materiasadeudadas-estado materiasadeudadas-estado-csa">Vigente</span>
                          ) : cob.fechaFin ? (
                            formatearFecha(cob.fechaFin)
                          ) : '-'}
                        </td>
                        <td>{diasUnicos([{ inicio: cob.fechaInicio, fin: cob.fechaFin }])}</td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <>
          {mostrarFormulario && (
            <form onSubmit={manejarAlta} className="alumnos-formulario">
              {licenciaEnEdicion ? (
                <div className="alumnos-formulario-fila">
                  <div>
                    <label>Persona</label>
                    <p>{licenciaEnEdicion.persona.apellido}, {licenciaEnEdicion.persona.nombre}</p>
                  </div>
                  <div>
                    <label>Cargo afectado</label>
                    <p>
                      {licenciaEnEdicion.cargo.nombreCargo}
                      {licenciaEnEdicion.cargo.division ? ` (${licenciaEnEdicion.cargo.division.nombre})` : ''}
                    </p>
                  </div>
                  <div>
                    <label>Tipo de licencia</label>
                    <select
                      value={formulario.tipoLicenciaId}
                      onChange={(e) => setFormulario({ ...formulario, tipoLicenciaId: e.target.value })}
                      required
                    >
                      <option value="">Seleccioná un tipo</option>
                      {tiposParaSeleccionar.map((tipo) => (
                        <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <>
                  <div className="alumnos-formulario-fila">
                    <div>
                      <label>Persona</label>
                      <input
                        type="text"
                        placeholder="Buscar por apellido..."
                        value={busquedaPersona}
                        onChange={(e) => setBusquedaPersona(e.target.value)}
                        style={{ marginBottom: '6px' }}
                      />
                      <select
                        value={formulario.personaId}
                        onChange={(e) => setFormulario({ ...formulario, personaId: e.target.value, cargoIds: [] })}
                        required
                      >
                        <option value="">Seleccioná una persona</option>
                        {personasFiltradas.map((persona) => (
                          <option key={persona.id} value={persona.id}>{persona.apellido}, {persona.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Tipo de licencia</label>
                      <select
                        value={formulario.tipoLicenciaId}
                        onChange={(e) => setFormulario({ ...formulario, tipoLicenciaId: e.target.value })}
                        required
                      >
                        <option value="">Seleccioná un tipo</option>
                        {tiposParaSeleccionar.map((tipo) => (
                          <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label>
                      Cargos afectados
                      {cargosDeLaPersona.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setFormulario({
                            ...formulario,
                            cargoIds: formulario.cargoIds.length === cargosDeLaPersona.length
                              ? []
                              : cargosDeLaPersona.map((c) => c.id)
                          })}
                          style={{ marginLeft: '10px' }}
                        >
                          {formulario.cargoIds.length === cargosDeLaPersona.length ? 'Ninguno' : 'Seleccionar todos'}
                        </button>
                      )}
                    </label>
                    {!formulario.personaId ? (
                      <p className="alumnos-vacio">Elegí primero una persona</p>
                    ) : cargosDeLaPersona.length === 0 ? (
                      <p className="alumnos-vacio">Esta persona no tiene cargos vigentes en el ciclo {cicloLectivo}</p>
                    ) : (
                      cargosDeLaPersona.map((cargo) => (
                        <label key={cargo.id} className="inasistencias-checkbox">
                          <input
                            type="checkbox"
                            checked={formulario.cargoIds.includes(cargo.id)}
                            onChange={() => alternarCargo(cargo.id)}
                          />
                          {cargo.nombreCargo}{cargo.division ? ` (${cargo.division.nombre})` : ''}
                          {cargo.origenLicenciaId && (
                            <span className="licencias-chip licencias-chip-activo" style={{ marginLeft: '8px' }}>
                              cubriendo a {cargo.origenLicencia.persona.apellido}, {cargo.origenLicencia.persona.nombre}
                            </span>
                          )}
                        </label>
                      ))
                    )}
                  </div>
                </>
              )}

              <div className="alumnos-formulario-fila">
                <div>
                  <label>Fecha de inicio</label>
                  <input
                    type="date"
                    value={formulario.fechaInicio}
                    onChange={(e) => setFormulario({ ...formulario, fechaInicio: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label>Fecha de fin (si ya se sabe)</label>
                  <input
                    type="date"
                    value={formulario.fechaFin}
                    min={formulario.fechaInicio || undefined}
                    onChange={(e) => setFormulario({ ...formulario, fechaFin: e.target.value })}
                  />
                </div>
              </div>
              {tipoSeleccionado?.requiereCertificado && (
                <div className="alumnos-formulario-fila">
                  <div>
                    <label>Certificado (PDF, JPG o PNG)</label>
                    {formulario.certificadoNombreOriginal ? (
                      <div className="licencias-certificado-adjunto">
                        <span>📎</span>
                        <span className="licencias-certificado-nombre">{formulario.certificadoNombreOriginal}</span>
                        <span className="licencias-certificado-acciones">
                          <button type="button" onClick={() => verCertificado(formulario.certificadoArchivo, formulario.certificadoNombreOriginal)}>Ver</button>
                          <button type="button" onClick={quitarCertificadoSeleccionado}>Quitar</button>
                        </span>
                      </div>
                    ) : (
                      <div
                        className={
                          'licencias-dropzone' +
                          (arrastrandoCertificado ? ' licencias-dropzone-activa' : '') +
                          (subiendoCertificado ? ' licencias-dropzone-deshabilitada' : '')
                        }
                        onClick={() => !subiendoCertificado && inputArchivoRef.current?.click()}
                        onDragOver={manejarDragOverCertificado}
                        onDragLeave={manejarDragLeaveCertificado}
                        onDrop={manejarDropCertificado}
                      >
                        <input
                          ref={inputArchivoRef}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={manejarSeleccionArchivo}
                          disabled={subiendoCertificado}
                          style={{ display: 'none' }}
                        />
                        {subiendoCertificado
                          ? 'Subiendo...'
                          : <span>Arrastrá el archivo acá o <strong>hacé click para elegirlo</strong></span>}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {tipoSeleccionado?.habilitaSuplente && (
                <div className="alumnos-formulario-fila">
                  <div style={{ flex: '1 1 100%' }}>
                    <label>
                      {!licenciaEnEdicion && formulario.cargoIds.length > 1
                        ? 'Suplente por cargo (opcional — no tiene que ser la misma persona en todos)'
                        : 'Suplente (opcional)'}
                    </label>
                    <input
                      type="text"
                      placeholder="Buscar por apellido..."
                      value={busquedaSuplente}
                      onChange={(e) => setBusquedaSuplente(e.target.value)}
                      style={{ marginBottom: '6px', maxWidth: '320px' }}
                    />

                    {licenciaEnEdicion ? (
                      <select
                        value={formulario.suplentePersonaId}
                        onChange={(e) => setFormulario({ ...formulario, suplentePersonaId: e.target.value })}
                      >
                        <option value="">Sin suplente asignado todavía</option>
                        {personasParaSuplente.map((persona) => (
                          <option key={persona.id} value={persona.id}>{persona.apellido}, {persona.nombre}</option>
                        ))}
                      </select>
                    ) : formulario.cargoIds.length > 1 ? (
                      <>
                        <select
                          className="licencias-suplente-masivo"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) aplicarSuplenteATodosLosCargos(e.target.value);
                            e.target.value = '';
                          }}
                        >
                          <option value="">Aplicar el mismo suplente a todos los cargos...</option>
                          {personasParaSuplente.map((persona) => (
                            <option key={persona.id} value={persona.id}>{persona.apellido}, {persona.nombre}</option>
                          ))}
                        </select>
                        <div className="licencias-suplentes-por-cargo">
                          {formulario.cargoIds.map((cargoId) => {
                            const cargo = cargosDeLaPersona.find((c) => c.id === cargoId);
                            return (
                              <div key={cargoId} className="licencias-suplente-cargo-fila">
                                <span className="licencias-suplente-cargo-nombre">
                                  {cargo ? `${cargo.nombreCargo}${cargo.division ? ` (${cargo.division.nombre})` : ''}` : ''}
                                </span>
                                <select
                                  value={formulario.suplentesPorCargo[cargoId] || ''}
                                  onChange={(e) => setSuplenteDeCargo(cargoId, e.target.value)}
                                >
                                  <option value="">Sin suplente</option>
                                  {personasParaSuplente.map((persona) => (
                                    <option key={persona.id} value={persona.id}>{persona.apellido}, {persona.nombre}</option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <select
                        value={formulario.cargoIds[0] ? (formulario.suplentesPorCargo[formulario.cargoIds[0]] || '') : ''}
                        disabled={formulario.cargoIds.length === 0}
                        onChange={(e) => setSuplenteDeCargo(formulario.cargoIds[0], e.target.value)}
                      >
                        <option value="">Sin suplente asignado todavía</option>
                        {personasParaSuplente.map((persona) => (
                          <option key={persona.id} value={persona.id}>{persona.apellido}, {persona.nombre}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}
              <button type="submit" disabled={guardando || subiendoCertificado}>
                {guardando ? 'Guardando...' : licenciaEnEdicion ? 'Guardar cambios' : 'Registrar licencia'}
              </button>
            </form>
          )}

          {cargando ? (
            <p>Cargando...</p>
          ) : licencias.length === 0 ? (
            <p className="alumnos-vacio">No hay licencias registradas para el ciclo {cicloLectivo}.</p>
          ) : (
            <>
              <div className="alumnos-formulario licencias-filtros">
                <div className="alumnos-formulario-fila">
                  <div>
                    <label>Buscar por persona</label>
                    <input
                      type="text"
                      placeholder="Buscar por apellido o nombre..."
                      value={busquedaTabla}
                      onChange={(e) => setBusquedaTabla(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Filtrar por tipo</label>
                    <div className="licencias-filtro-tipos">
                      {tiposLicencia.map((tipo) => (
                        <button
                          key={tipo.id}
                          type="button"
                          className={tiposFiltro.includes(tipo.id) ? 'licencias-chip licencias-chip-activo' : 'licencias-chip'}
                          onClick={() => alternarTipoFiltro(tipo.id)}
                        >
                          {tipo.nombre}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {licenciasFiltradas.length === 0 ? (
                <p className="alumnos-vacio">Ninguna licencia coincide con la búsqueda.</p>
              ) : (
            <table className="alumnos-tabla">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Cargo</th>
                  <th>Tipo</th>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th>Certificado</th>
                  <th>Suplente</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {licenciasFiltradas.map((licencia) => (
                  <tr key={licencia.id}>
                    <td>{licencia.persona.apellido}, {licencia.persona.nombre}</td>
                    <td>
                      {licencia.cargo.nombreCargo}{licencia.cargo.division ? ` (${licencia.cargo.division.nombre})` : ''}
                    </td>
                    <td>{licencia.tipoLicencia.nombre}</td>
                    <td>{formatearFecha(licencia.fechaInicio)}</td>
                    <td>
                      {licencia.fechaFin ? (
                        formatearFecha(licencia.fechaFin)
                      ) : (
                        <span className="materiasadeudadas-estado materiasadeudadas-estado-csa">Vigente</span>
                      )}
                    </td>
                    <td>
                      {licencia.certificadoArchivo ? (
                        <button onClick={() => verCertificado(licencia.certificadoArchivo, licencia.certificadoNombreOriginal)}>Ver</button>
                      ) : '-'}
                    </td>
                    <td>{licencia.suplente ? `${licencia.suplente.apellido}, ${licencia.suplente.nombre}` : '-'}</td>
                    <td>
                      <span className="materiasadeudadas-acciones">
                        <button onClick={() => abrirFormularioEdicion(licencia)}>Editar</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Licencias;
