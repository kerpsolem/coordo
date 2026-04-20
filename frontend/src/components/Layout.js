import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import {
  LayoutDashboard, Calendar, Map, Users, UserCheck, ClipboardList,
  Clock, Settings, AlertTriangle, UserX, StickyNote, LogOut,
  Sun, Moon, ChevronDown, ChevronRight, BookOpen, FileText, Menu, X
} from 'lucide-react';

const consultationLinks = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/planning-global', label: 'Planning global', icon: Calendar },
  { to: '/planning-macro', label: 'Planning macro', icon: Map },
  { to: '/par-promotion', label: 'Par promotion', icon: Users },
  { to: '/par-formateur', label: 'Par formateur', icon: UserCheck },
  { to: '/attribution-copies', label: 'Attribution des copies', icon: ClipboardList },
  { to: '/recap-heures', label: 'Recap heures', icon: Clock },
];

const coordinationLinks = [
  { to: '/coordination-planning', label: 'Coordination planning', icon: BookOpen },
  { to: '/alertes', label: 'Alertes', icon: AlertTriangle },
  { to: '/absences-formateurs', label: 'Absences formateurs', icon: UserX },
  { to: '/pense-betes', label: 'Pense-betes', icon: StickyNote },
  { to: '/administration', label: 'Administration', icon: Settings },
];

export default function Layout({ children }) {
  const { user, logout, isAdmin, isSuperAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [coordOpen, setCoordOpen] = useState(true);
  const [consultOpen, setConsultOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleDark = () => {
    document.documentElement.classList.toggle('dark');
    setDark(!dark);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isCoordPage = coordinationLinks.some(l => location.pathname === l.to);

  const NavLink = ({ to, label, icon: Icon }) => {
    const active = location.pathname === to;
    return (
      <Link
        to={to}
        data-testid={`nav-${to.replace(/\//g, '-').replace(/^-/, '')}`}
        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors
          ${active
            ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
          }`}
      >
        <Icon size={18} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-200 flex-shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden`}>
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight" style={{fontFamily:'Outfit'}}>
            IFSI Planning
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Coordination pedagogique</p>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {/* Consultation */}
          <button
            onClick={() => setConsultOpen(!consultOpen)}
            className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500"
            data-testid="nav-section-consultation"
          >
            <span>Consultation</span>
            {consultOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
          </button>
          {consultOpen && (
            <div className="space-y-0.5 ml-1">
              {consultationLinks.map(l => <NavLink key={l.to} {...l} />)}
            </div>
          )}

          {/* Coordination - visible only for admins */}
          {isAdmin && (
            <>
              <div className="my-3 border-t border-slate-200 dark:border-slate-700" />
              <button
                onClick={() => setCoordOpen(!coordOpen)}
                className={`flex items-center justify-between w-full px-3 py-2 text-xs font-semibold tracking-widest uppercase
                  ${isCoordPage ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}
                data-testid="nav-section-coordination"
              >
                <span>Coordination</span>
                {coordOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
              </button>
              {coordOpen && (
                <div className="space-y-0.5 ml-1">
                  {coordinationLinks.map(l => {
                    if (l.to === '/administration' && !isSuperAdmin && user?.role !== 'admin_coordination') return null;
                    return <NavLink key={l.to} {...l} />;
                  })}
                  {isSuperAdmin && (
                    <NavLink to="/gestion-utilisateurs" label="Utilisateurs" icon={FileText} />
                  )}
                </div>
              )}
            </>
          )}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-300">
              {(user?.prenom?.[0] || '') + (user?.nom?.[0] || '')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {user?.prenom} {user?.nom}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
          <div className="flex gap-1 mt-2">
            <Button variant="ghost" size="sm" onClick={toggleDark} data-testid="theme-toggle" className="flex-1">
              {dark ? <Sun size={16}/> : <Moon size={16}/>}
              <span className="ml-2 text-xs">{dark ? 'Clair' : 'Sombre'}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="logout-btn" className="text-red-500 hover:text-red-600">
              <LogOut size={16}/>
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {isCoordPage && isAdmin && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-6 py-1.5">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 tracking-wider uppercase">Mode edition</span>
          </div>
        )}
        <div className="flex items-center justify-between px-6 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} data-testid="toggle-sidebar" className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
            {sidebarOpen ? <X size={20}/> : <Menu size={20}/>}
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
