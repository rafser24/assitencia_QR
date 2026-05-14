/**
 * firestoreService.js — SIN índices compuestos
 * Todas las queries usan un solo where(); filtros de fecha y orden en cliente.
 */
import {
  collection, doc, getDoc, getDocs, addDoc,
  updateDoc, query, where, Timestamp, setDoc, deleteDoc,
} from 'firebase/firestore'
import { db } from '../firebase'

const toDate = (v) => v?.toDate?.() ?? (v instanceof Date ? v : new Date(v))

// ─── ALUMNOS ──────────────────────────────────────────────────────────────────

export async function getAlumnos() {
  const snap = await getDocs(collection(db, 'alumnos'))
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
}

export async function getAlumnoByQR(codigoQR) {
  const q    = query(collection(db, 'alumnos'), where('codigoQR', '==', codigoQR))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { uid: d.id, ...d.data() }
}

export async function getAlumnoById(uid) {
  const snap = await getDoc(doc(db, 'alumnos', uid))
  if (!snap.exists()) return null
  return { uid: snap.id, ...snap.data() }
}

export async function createAlumno(uid, data) {
  await setDoc(doc(db, 'alumnos', uid), {
    nombre: data.nombre, codigoQR: data.codigoQR,
    minutosAcumulados: 0, diasExtra: 0,
    historialFaltas: [], creadoEn: Timestamp.now(),
  })
}

export async function updateAlumno(uid, updates) {
  await updateDoc(doc(db, 'alumnos', uid), updates)
}

export async function deleteAlumno(uid) {
  await deleteDoc(doc(db, 'alumnos', uid))
}

// ─── ASISTENCIAS ─────────────────────────────────────────────────────────────

export async function createAsistencia({ alumnoId, fecha, entrada, minutosRetraso, esReposicion }) {
  const ref = await addDoc(collection(db, 'asistencias'), {
    alumnoId,
    fecha:          Timestamp.fromDate(fecha),
    entrada:        Timestamp.fromDate(entrada),
    salida:         null,
    minutosRetraso: minutosRetraso || 0,
    esReposicion:   esReposicion || false,
  })
  return ref.id
}

export async function registrarSalida(asistenciaId, salida) {
  await updateDoc(doc(db, 'asistencias', asistenciaId), {
    salida: Timestamp.fromDate(salida),
  })
}

export async function deleteAsistencia(asistenciaId) {
  await deleteDoc(doc(db, 'asistencias', asistenciaId))
}

/** Check-in abierto hoy — solo where('alumnoId'), fecha filtra en cliente */
export async function getCheckinAbierto(alumnoId, hoy) {
  const inicio = new Date(hoy); inicio.setHours(0, 0, 0, 0)
  const fin    = new Date(hoy); fin.setHours(23, 59, 59, 999)

  const snap = await getDocs(
    query(collection(db, 'asistencias'), where('alumnoId', '==', alumnoId))
  )
  const abierto = snap.docs.find((d) => {
    const data  = d.data()
    const fecha = toDate(data.fecha)
    return fecha >= inicio && fecha <= fin && data.salida === null
  })
  if (!abierto) return null
  return { id: abierto.id, ...abierto.data() }
}

/** Asistencias de la semana — rango de fechas en cliente */
export async function getAsistenciasSemana(alumnoId, weekStart, weekEnd) {
  const snap = await getDocs(
    query(collection(db, 'asistencias'), where('alumnoId', '==', alumnoId))
  )
  return snap.docs
    .map((d) => {
      const data = d.data()
      return {
        id: d.id, alumnoId: data.alumnoId,
        fecha:          toDate(data.fecha),
        entrada:        toDate(data.entrada),
        salida:         data.salida ? toDate(data.salida) : null,
        minutosRetraso: data.minutosRetraso,
        esReposicion:   data.esReposicion,
      }
    })
    .filter((a) => a.fecha >= weekStart && a.fecha < weekEnd)
}

/**
 * Historial del alumno — SIN orderBy (evita índice compuesto).
 * El orden descendente se aplica en el cliente.
 */
export async function getHistorialAlumno(alumnoId, limite = 60) {
  const snap = await getDocs(
    query(collection(db, 'asistencias'), where('alumnoId', '==', alumnoId))
  )
  return snap.docs
    .map((d) => {
      const data = d.data()
      return {
        id: d.id, alumnoId: data.alumnoId,
        fecha:          toDate(data.fecha),
        entrada:        toDate(data.entrada),
        salida:         data.salida ? toDate(data.salida) : null,
        minutosRetraso: data.minutosRetraso,
        esReposicion:   data.esReposicion,
      }
    })
    .sort((a, b) => b.fecha - a.fecha)   // desc en cliente
    .slice(0, limite)
}

/** Asistencias de hoy — trae toda la colección y filtra en cliente */
export async function getAsistenciasHoy(hoy) {
  const inicio = new Date(hoy); inicio.setHours(0, 0, 0, 0)
  const fin    = new Date(hoy); fin.setHours(23, 59, 59, 999)

  const snap = await getDocs(collection(db, 'asistencias'))
  return snap.docs
    .map((d) => {
      const data = d.data()
      return {
        id: d.id, alumnoId: data.alumnoId,
        fecha:          toDate(data.fecha),
        entrada:        toDate(data.entrada),
        salida:         data.salida ? toDate(data.salida) : null,
        minutosRetraso: data.minutosRetraso,
        esReposicion:   data.esReposicion,
      }
    })
    .filter((a) => a.fecha >= inicio && a.fecha <= fin)
    .sort((a, b) => b.fecha - a.fecha)
}
