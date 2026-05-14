/**
 * useAuth.js
 * ==========
 * Hook de autenticación con Firebase Auth.
 * Expone el usuario actual, estado de carga, login y logout.
 *
 * Uso:
 *   const { user, loading, login, logout, error } = useAuth()
 */
import { useState, useEffect, useCallback } from 'react'
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from '../firebase'

export function useAuth() {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)   // true hasta que Firebase responda
  const [error, setError]     = useState(null)

  // Escucha cambios de sesión en tiempo real
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })
    return unsub
  }, [])

  const login = useCallback(async (email, password) => {
    setError(null)
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      return cred.user
    } catch (err) {
      const mensajes = {
        'auth/invalid-credential':    'Correo o contraseña incorrectos.',
        'auth/user-not-found':        'No existe una cuenta con ese correo.',
        'auth/wrong-password':        'Contraseña incorrecta.',
        'auth/invalid-email':         'El formato del correo no es válido.',
        'auth/too-many-requests':     'Demasiados intentos. Espera unos minutos.',
        'auth/user-disabled':         'Esta cuenta ha sido deshabilitada.',
        'auth/network-request-failed':'Sin conexión. Verifica tu internet.',
      }
      const msg = mensajes[err.code] || `Error inesperado (${err.code})`
      setError(msg)
      throw new Error(msg)
    }
  }, [])

  const logout = useCallback(async () => {
    await signOut(auth)
    setUser(null)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return { user, loading, error, login, logout, clearError }
}
