/**
 * LoginPage.jsx
 * =============
 * Página de inicio de sesión para el panel de administración.
 * Usa Firebase Auth (email + contraseña).
 *
 * Para crear el primer admin, ve a:
 *   Firebase Console → Authentication → Users → Add user
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QrCode, Mail, Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { login, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [error, setError]         = useState(null)
  const [loading, setLoading]     = useState(false)

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (!email.trim() || !password) return
    setError(null)
    setLoading(true)
    try {
      await login(email.trim(), password)
      navigate('/admin')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo + título */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 52, height: 52,
            background: '#f59e0b',
            borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <QrCode size={26} style={{ color: '#0d1117' }} />
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26, fontWeight: 800,
            color: '#e6edf3', letterSpacing: -0.5,
            marginBottom: 6,
          }}>
            Panel de Administración
          </h1>
          <p style={{
            color: '#6e7681', fontSize: 13,
            fontFamily: 'var(--font-mono)',
          }}>
            Asistencia
          </p>
        </div>

        {/* Card de login */}
        <div className="card" style={{ padding: '28px 28px' }}>

          {/* Error */}
          {error && (
            <div style={{
              background: '#2e1a1a',
              border: '1px solid #7f1d1d',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 20,
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <AlertTriangle size={15} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: '#f87171', fontSize: 13, fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>
                {error}
              </span>
            </div>
          )}

          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block', fontSize: 11,
              color: '#8b949e', letterSpacing: '0.05em', marginBottom: 6,
            }}>
              CORREO ELECTRÓNICO
            </label>
            <div style={{ position: 'relative' }}>
              <Mail
                size={15}
                style={{
                  position: 'absolute', left: 12, top: '50%',
                  transform: 'translateY(-50%)', color: '#484f58',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null) }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="admin@tuinstitucion.edu"
                autoComplete="username"
                style={{ paddingLeft: 36 }}
              />
            </div>
          </div>

          {/* Contraseña */}
          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block', fontSize: 11,
              color: '#8b949e', letterSpacing: '0.05em', marginBottom: 6,
            }}>
              CONTRASEÑA
            </label>
            <div style={{ position: 'relative' }}>
              <Lock
                size={15}
                style={{
                  position: 'absolute', left: 12, top: '50%',
                  transform: 'translateY(-50%)', color: '#484f58',
                  pointerEvents: 'none',
                }}
              />
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null) }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ paddingLeft: 36, paddingRight: 40 }}
              />
              <button
                onClick={() => setShowPass(v => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none',
                  color: '#484f58', cursor: 'pointer', padding: 4,
                  display: 'flex', alignItems: 'center',
                }}
                tabIndex={-1}
                title={showPass ? 'Ocultar' : 'Mostrar'}
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Botón */}
          <button
            onClick={handleSubmit}
            disabled={loading || !email || !password}
            style={{
              width: '100%',
              background: loading || !email || !password ? '#92400e' : '#f59e0b',
              border: 'none', borderRadius: 10,
              padding: '12px', color: '#0d1117',
              fontWeight: 700, fontFamily: 'var(--font-mono)',
              fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background 0.2s',
              opacity: !email || !password ? 0.6 : 1,
            }}
          >
            {loading ? (
              <>
                <div style={{
                  width: 14, height: 14,
                  border: '2px solid #0d1117',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                }} />
                Verificando...
              </>
            ) : (
              'INICIAR SESIÓN'
            )}
          </button>
        </div>

        {/* Nota de ayuda */}
        <div style={{
          marginTop: 20, textAlign: 'center',
          color: '#484f58', fontSize: 11,
          fontFamily: 'var(--font-mono)', lineHeight: 1.7,
        }}>
          ¿Olvidaste tu contraseña? Ve a<br />
          <span style={{ color: '#6e7681' }}>
            Firebase Console → Authentication → Users
          </span>
          <br />y restablécela desde ahí.
        </div>

      </div>
    </div>
  )
}
