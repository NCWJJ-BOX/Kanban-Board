import { Link, Outlet, useNavigate } from 'react-router-dom'
import reactLogo from '../assets/react.svg'
import { useAuth } from '../auth'
import NotificationBell from './NotificationBell'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function onLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/boards" className="brand">
          <img className="brand-mark" src={reactLogo} alt="" aria-hidden="true" /> Kanban Board
        </Link>
        <nav className="topbar-right">
          <NotificationBell />
          <span className="user-chip" title={user?.email}>
            {user?.username}
          </span>
          <button className="btn btn-ghost" onClick={onLogout}>
            Log out
          </button>
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}