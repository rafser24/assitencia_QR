import { useEffect } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { QrCode, LayoutDashboard, LogOut, UserPlus } from 'lucide-react'
import LectorPage   from './pages/LectorPage'
import AdminPage    from './pages/AdminPage'
import RegistroPage from './pages/RegistroPage'
import LoginPage    from './pages/LoginPage'
import { ToastContainer, useToast } from './components/Toast'
import { useAuth } from './hooks/useAuth'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const navigate          = useNavigate()
  const location          = useLocation()

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { state: { from: location.pathname }, replace: true })
    }
  }, [user, loading, navigate, location])

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', flexDirection: 'column', gap: 12,
      }}>
        <div style={{
          width: 24, height: 24,
          border: '2px solid #f59e0b',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
        <span style={{ color: '#6e7681', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          Verificando sesión...
        </span>
      </div>
    )
  }

  return user ? children : null
}

function Navbar({ toast }) {
  const { user, logout } = useAuth()
  const navigate         = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/')
    toast.add('Sesión cerrada correctamente', 'info')
  }

  return (
    <nav style={{
      position:     'sticky', top: 0, zIndex: 500,
      background:   '#ffffff',
      borderBottom: '1px solid #d8dff2',
      padding:      '0 24px',
      display:      'flex', alignItems: 'center', justifyContent: 'space-between',
      height:       56,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, background: '#f59e0b', borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <QrCode size={17} style={{ color: '#0d1117' }} />
        </div>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: '#2d3561', letterSpacing: -0.5 }}>
          Asistencia a practicas profesionales
        </span>
        <span style={{ fontSize: 10, color: '#484f58', fontFamily: 'var(--font-mono)' }}>v2.0</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <NavLink to="/" end style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8,
          background: isActive ? '#1c2128' : 'transparent',
          border: `1px solid ${isActive ? '#30363d' : 'transparent'}`,
          color: isActive ? '#e6edf3' : '#6e7681',
          textDecoration: 'none', fontSize: 12,
          fontFamily: 'var(--font-mono)', fontWeight: isActive ? 600 : 400,
          transition: 'all 0.15s',
        })}>
          <QrCode size={13} /> Lector
        </NavLink>

        <NavLink to="/registro" style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8,
          background: isActive ? '#1c2128' : 'transparent',
          border: `1px solid ${isActive ? '#f59e0b55' : 'transparent'}`,
          color: isActive ? '#f59e0b' : '#6e7681',
          textDecoration: 'none', fontSize: 12,
          fontFamily: 'var(--font-mono)', fontWeight: isActive ? 600 : 400,
          transition: 'all 0.15s',
        })}>
          <UserPlus size={13} /> Registro
        </NavLink>

        {user ? (
          <>
            <NavLink to="/admin" style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              background: isActive ? '#1c2128' : 'transparent',
              border: `1px solid ${isActive ? '#f59e0b55' : 'transparent'}`,
              color: isActive ? '#f59e0b' : '#6e7681',
              textDecoration: 'none', fontSize: 12,
              fontFamily: 'var(--font-mono)', fontWeight: isActive ? 600 : 400,
              transition: 'all 0.15s',
            })}>
              <LayoutDashboard size={13} /> Admin
            </NavLink>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginLeft: 4, paddingLeft: 12, borderLeft: '1px solid #21262d',
            }}>
              <span style={{ fontSize: 11, color: '#484f58', fontFamily: 'var(--font-mono)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </span>
              <button
                onClick={handleLogout}
                title="Cerrar sesión"
                style={{
                  background: 'transparent', border: '1px solid #21262d',
                  borderRadius: 7, padding: '5px 8px', color: '#484f58',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontFamily: 'var(--font-mono)', transition: 'all 0.15s',
                }}
              >
                <LogOut size={12} /> Salir
              </button>
            </div>
          </>
        ) : (
          <NavLink to="/login" style={() => ({
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8,
            background: 'transparent', border: '1px solid transparent',
            color: '#6e7681', textDecoration: 'none', fontSize: 12,
            fontFamily: 'var(--font-mono)', transition: 'all 0.15s',
          })}>
            🔒 Admin
          </NavLink>
        )}
      </div>
    </nav>
  )
}

export default function App() {
  const toast = useToast()

  return (
    <>
      <ToastContainer toasts={toast.toasts} removeToast={toast.remove} />
      <Navbar toast={toast} />

      <main style={{ padding: '32px 24px', maxWidth: 960, margin: '0 auto' }}>
        <Routes>
          <Route path="/"         element={<LectorPage toast={toast} />} />
          <Route path="/registro" element={<RegistroPage toast={toast} />} />
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/admin"    element={<RequireAuth><AdminPage toast={toast} /></RequireAuth>} />
        </Routes>
      </main>

      <footer style={{
        borderTop: '1px solid #21262d', padding: '14px 24px',
        textAlign: 'center', color: '#484f58',
        fontFamily: 'var(--font-mono)', fontSize: 11,
      }}>
        AttendanceQR v2.0 · Sistema de Prácticas Profesionales · Base 13:00 · Regla 180min
      </footer>
    </>
  )
}
