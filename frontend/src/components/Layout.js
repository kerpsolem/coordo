import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import API from '../lib/api';
import {
  LayoutDashboard, Calendar, Map, Users, UserCheck, ClipboardList,
  Clock, Settings, AlertTriangle, UserX, StickyNote, LogOut,
  Sun, Moon, ChevronDown, ChevronRight, BookOpen, FileText, Menu, X, Key, FolderKanban, Plane, GraduationCap
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
  const { user, logout, isAdmin, isSuperAdmin, isSecretariat } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [coordOpen, setCoordOpen] = useState(true);
  const [consultOpen, setConsultOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showPwDialog, setShowPwDialog] = useState(false);
  const [pwForm, setPwForm] = useState({ old_password: '', new_password: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const handleChangePw = async () => {
    setPwError('');
    if (pwForm.new_password.length < 6) { setPwError('Min. 6 caracteres'); return; }
    if (pwForm.new_password !== pwForm.confirm) { setPwError('Les mots de passe ne correspondent pas'); return; }
    try {
      await API.post('/auth/change-password', { old_password: pwForm.old_password, new_password: pwForm.new_password });
      setPwSuccess(true);
      setTimeout(() => { setShowPwDialog(false); setPwSuccess(false); setPwForm({ old_password: '', new_password: '', confirm: '' }); }, 1500);
    } catch (e) { setPwError(e.response?.data?.detail || 'Erreur'); }
  };

  const toggleDark = () => {
    document.documentElement.classList.toggle('dark');
    setDark(!dark);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const showCoordination = isAdmin || isSecretariat;
  const isCoordPage = coordinationLinks.some(l => location.pathname === l.to);

  const NavLink = ({ to, label, icon: Icon }) => {
    const active = location.pathname === to;
    return (
      <Link
        to={to}
        data-testid={`nav-${to.replace(/\//g, '-').replace(/^-/, '')}`}
        className={`relative flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors
          ${active
            ? 'bg-white/5 text-white font-semibold'
            : 'text-slate-300 hover:bg-white/5 hover:text-white'
          }`}
      >
        {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-[#E97451]" />}
        <Icon size={18} className={active ? 'text-[#E97451]' : ''} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar (always navy, regardless of dark mode) */}
      <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-200 flex-shrink-0 bg-[#0E1F36] border-r border-[#1B3057] flex flex-col overflow-hidden text-slate-200`}>
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#1B3057] flex items-center justify-center">
            <GraduationCap size={20} className="text-[#E97451]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight" style={{ fontFamily: 'Outfit' }}>IFSI Planning</h1>
            <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">Coordination pédagogique</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {/* Consultation */}
          <button
            onClick={() => setConsultOpen(!consultOpen)}
            className="flex items-center justify-between w-full px-3 py-2 text-[11px] font-semibold tracking-widest uppercase text-[#E97451]"
            data-testid="nav-section-consultation"
          >
            <span>&gt; Consultation</span>
            {consultOpen ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
          </button>
          {consultOpen && (
            <div className="space-y-0.5">
              {consultationLinks.map(l => <NavLink key={l.to} {...l} />)}
            </div>
          )}

          {/* Coordination - visible for admins and secretariat */}
          {showCoordination && (
            <>
              <div className="my-3 border-t border-white/10" />
              <button
                onClick={() => setCoordOpen(!coordOpen)}
                className="flex items-center justify-between w-full px-3 py-2 text-[11px] font-semibold tracking-widest uppercase text-[#E97451]"
                data-testid="nav-section-coordination"
              >
                <span>&gt; Coordination</span>
                {coordOpen ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
              </button>
              {coordOpen && (
                <div className="space-y-0.5">
                  {coordinationLinks.map(l => {
                    if (isSecretariat && !isAdmin && l.to !== '/coordination-planning') return null;
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
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-9 h-9 rounded-full bg-[#E97451] flex items-center justify-center text-xs font-bold text-white">
              {(user?.prenom?.[0] || '') + (user?.nom?.[0] || '')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {user?.prenom} {user?.nom}
              </p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider truncate">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
          <div className="flex gap-1 mt-2">
            <Button variant="ghost" size="sm" onClick={toggleDark} data-testid="theme-toggle" className="flex-1 text-slate-300 hover:bg-white/10 hover:text-white">
              {dark ? <Sun size={16}/> : <Moon size={16}/>}
              <span className="ml-2 text-xs">{dark ? 'Clair' : 'Sombre'}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowPwDialog(true)} data-testid="change-pw-btn" title="Changer le mot de passe" className="text-slate-300 hover:bg-white/10 hover:text-white">
              <Key size={16}/>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="logout-btn" className="text-red-400 hover:text-red-300 hover:bg-white/10">
              <LogOut size={16}/>
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {isCoordPage && showCoordination && (
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

      {/* Change Password Dialog */}
      <Dialog open={showPwDialog} onOpenChange={(o) => { if (!o) { setShowPwDialog(false); setPwError(''); setPwSuccess(false); setPwForm({ old_password: '', new_password: '', confirm: '' }); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Changer le mot de passe</DialogTitle></DialogHeader>
          {pwSuccess ? (
            <p className="text-sm text-green-600 font-medium text-center py-4">Mot de passe modifie avec succes</p>
          ) : (
            <div className="space-y-3">
              {pwError && <div className="p-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-600">{pwError}</div>}
              <div><Label className="text-xs">Ancien mot de passe</Label><Input type="password" className="h-8 text-sm" value={pwForm.old_password} onChange={e => setPwForm({ ...pwForm, old_password: e.target.value })} data-testid="old-pw" /></div>
              <div><Label className="text-xs">Nouveau mot de passe</Label><Input type="password" className="h-8 text-sm" value={pwForm.new_password} onChange={e => setPwForm({ ...pwForm, new_password: e.target.value })} data-testid="new-pw" /></div>
              <div><Label className="text-xs">Confirmer</Label><Input type="password" className="h-8 text-sm" value={pwForm.confirm} onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })} data-testid="confirm-pw" /></div>
              <Button className="w-full" size="sm" onClick={handleChangePw} data-testid="save-pw">Modifier</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
