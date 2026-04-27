import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Mail, ArrowLeft, ArrowRight, Check, GraduationCap, Lock } from 'lucide-react';
import API from '../lib/api';

const BUILDING_IMG = 'https://customer-assets.emergentagent.com/job_pedagog-planner/artifacts/picu5nzr_PXL_20230503_132701261.jpg';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [reqForm, setReqForm] = useState({ nom: '', prenom: '', email: '', message: '', password: '', password_confirm: '' });
  const [reqSent, setReqSent] = useState(false);
  const [reqError, setReqError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') setError(detail);
      else if (Array.isArray(detail)) setError(detail.map(d => d.msg || JSON.stringify(d)).join(' '));
      else setError('Erreur de connexion');
    }
    setLoading(false);
  };

  const handleRequestAccess = async (e) => {
    e.preventDefault();
    setReqError('');
    if (!reqForm.nom || !reqForm.prenom || !reqForm.email || !reqForm.password) {
      setReqError('Veuillez remplir tous les champs obligatoires'); return;
    }
    if (reqForm.password.length < 6) {
      setReqError('Le mot de passe doit contenir au moins 6 caracteres'); return;
    }
    if (reqForm.password !== reqForm.password_confirm) {
      setReqError('Les mots de passe ne correspondent pas'); return;
    }
    try {
      await API.post('/access-requests', reqForm);
      setReqSent(true);
    } catch (err) {
      setReqError(err.response?.data?.detail || 'Erreur lors de l\'envoi');
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F8F6F0] dark:bg-slate-950">
      {/* LEFT — formulaire */}
      <div className="flex-1 lg:w-[42%] lg:max-w-[640px] flex flex-col px-6 sm:px-12 lg:px-20 py-10 lg:py-12 relative">
        {/* Logo + titre */}
        <div className="flex items-center gap-3 animate-fadeIn">
          <div className="w-12 h-12 rounded-xl bg-slate-900 dark:bg-white flex items-center justify-center shadow-md">
            <GraduationCap size={22} className="text-white dark:text-slate-900" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit' }}>IFSI Planning</h1>
            <p className="text-[10px] tracking-[0.2em] text-slate-500 font-medium uppercase">Coordination pedagogique</p>
          </div>
        </div>

        {/* Bloc principal */}
        <div className="flex-1 flex items-center">
          <div className="w-full max-w-md mx-auto py-10 lg:py-0">
            {!showRequest ? (
              <>
                <div className="mb-8 animate-slideUp">
                  <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white mb-3" style={{ fontFamily: 'Outfit' }}>
                    Connexion
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400">
                    Accedez a l'espace de coordination de votre institut.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5 animate-slideUp" style={{ animationDelay: '120ms' }}>
                  {error && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300" data-testid="login-error">
                      {error}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-semibold text-slate-700 dark:text-slate-300">Email</Label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="vous@ifsi.fr" required data-testid="login-email"
                        className="h-12 pl-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl shadow-sm focus-visible:ring-orange-500/40 focus-visible:border-orange-500" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-sm font-semibold text-slate-700 dark:text-slate-300">Mot de passe</Label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="Votre mot de passe" required data-testid="login-password"
                        className="h-12 pl-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl shadow-sm focus-visible:ring-orange-500/40 focus-visible:border-orange-500" />
                    </div>
                  </div>
                  <Button type="submit" disabled={loading} data-testid="login-submit"
                    className="w-full h-12 rounded-xl bg-[#E67E5C] hover:bg-[#D86E4C] text-white font-semibold shadow-md hover:shadow-lg transition-all group">
                    {loading ? 'Connexion...' : (
                      <span className="inline-flex items-center justify-center gap-2">
                        Se connecter <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                      </span>
                    )}
                  </Button>
                </form>

                <div className="mt-6 text-center animate-slideUp" style={{ animationDelay: '200ms' }}>
                  <button onClick={() => setShowRequest(true)} type="button"
                    className="text-sm text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 transition-colors inline-flex items-center gap-1.5 font-medium"
                    data-testid="request-access-link">
                    <Mail size={14} /> Demander un acces
                  </button>
                </div>
              </>
            ) : reqSent ? (
              <div className="text-center py-8 space-y-4 animate-fadeIn">
                <div className="mx-auto w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Check size={28} className="text-green-600" />
                </div>
                <h3 className="text-xl font-bold">Demande envoyee</h3>
                <p className="text-sm text-slate-500">Votre demande d'acces a ete transmise a l'administrateur. Vous recevrez une reponse par email.</p>
                <Button variant="outline" size="sm" onClick={() => { setShowRequest(false); setReqSent(false); setReqForm({ nom: '', prenom: '', email: '', message: '', password: '', password_confirm: '' }); }}>
                  <ArrowLeft size={14} className="mr-1" /> Retour a la connexion
                </Button>
              </div>
            ) : (
              <form onSubmit={handleRequestAccess} className="space-y-3 animate-slideUp">
                <div className="flex items-center gap-2 mb-3">
                  <button type="button" onClick={() => setShowRequest(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                    <ArrowLeft size={18} />
                  </button>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit' }}>Demander un acces</h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">Remplissez ce formulaire pour qu'un administrateur cree votre compte.</p>
                {reqError && (
                  <div className="p-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-600">{reqError}</div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Nom *</Label><Input value={reqForm.nom} onChange={e => setReqForm({ ...reqForm, nom: e.target.value })} placeholder="Dupont" className="h-9 text-sm rounded-lg" data-testid="req-nom" /></div>
                  <div><Label className="text-xs">Prenom *</Label><Input value={reqForm.prenom} onChange={e => setReqForm({ ...reqForm, prenom: e.target.value })} placeholder="Marie" className="h-9 text-sm rounded-lg" data-testid="req-prenom" /></div>
                </div>
                <div><Label className="text-xs">Email *</Label><Input type="email" value={reqForm.email} onChange={e => setReqForm({ ...reqForm, email: e.target.value })} placeholder="votre@email.fr" className="h-9 text-sm rounded-lg" data-testid="req-email" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Mot de passe *</Label><Input type="password" value={reqForm.password} onChange={e => setReqForm({ ...reqForm, password: e.target.value })} placeholder="Min. 6 caracteres" className="h-9 text-sm rounded-lg" data-testid="req-password" /></div>
                  <div><Label className="text-xs">Confirmer *</Label><Input type="password" value={reqForm.password_confirm} onChange={e => setReqForm({ ...reqForm, password_confirm: e.target.value })} placeholder="Confirmer" className="h-9 text-sm rounded-lg" data-testid="req-password-confirm" /></div>
                </div>
                <div>
                  <Label className="text-xs">Message (optionnel)</Label>
                  <textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" rows={2} placeholder="Motif de la demande..."
                    value={reqForm.message} onChange={e => setReqForm({ ...reqForm, message: e.target.value })} data-testid="req-message" />
                </div>
                <Button type="submit" data-testid="req-submit"
                  className="w-full h-11 rounded-xl bg-[#E67E5C] hover:bg-[#D86E4C] text-white font-semibold shadow-md transition-all">
                  <Mail size={14} className="mr-2" /> Envoyer la demande
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Comptes démo */}
        {!showRequest && (
          <div className="text-[11px] text-slate-400 leading-relaxed animate-fadeIn" style={{ animationDelay: '300ms' }}>
            <p className="font-semibold text-slate-500 mb-1">Comptes de demonstration disponibles :</p>
            <p><span className="font-mono">admin@ifsi.fr</span> · <span className="font-mono">Admin123!</span></p>
          </div>
        )}
      </div>

      {/* RIGHT — image bâtiment IFPS */}
      <div className="hidden lg:block lg:flex-1 relative overflow-hidden">
        <img src={BUILDING_IMG} alt="Institut de formation en soins infirmiers"
          className="absolute inset-0 w-full h-full object-cover" loading="eager" />
        {/* Liseré orange à gauche */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#E67E5C] via-[#E67E5C]/60 to-transparent z-10" />
        {/* Dégradé sombre uniquement en bas pour lisibilité du texte */}
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-slate-900/85 via-slate-900/40 to-transparent" />
        {/* Texte d'accroche */}
        <div className="absolute inset-x-0 bottom-0 p-10 lg:p-14 text-white z-10 animate-slideUp" style={{ animationDelay: '180ms' }}>
          <span className="inline-block text-[10px] tracking-[0.25em] font-bold text-slate-900 mb-3 px-2.5 py-1 rounded-full border border-slate-900/20 bg-white/90 backdrop-blur-sm uppercase shadow-sm">
            Institut de formation en soins infirmiers
          </span>
          <h2 className="text-3xl xl:text-5xl font-bold leading-tight mb-3" style={{ fontFamily: 'Outfit' }}>
            Planification <span className="text-orange-300">IFSI Chuga.</span>
          </h2>
          <p className="text-sm xl:text-base text-white/80 max-w-xl leading-relaxed">
            Planifie, gere les semestres et construis.
          </p>
        </div>
      </div>

      {/* Mobile : image en bandeau haut */}
      <div className="lg:hidden relative h-48 overflow-hidden order-first">
        <img src={BUILDING_IMG} alt="IFPS" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#F8F6F0] dark:from-slate-950 via-transparent to-transparent" />
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.6s ease-out both; }
        .animate-slideUp { animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both; }
      `}</style>
    </div>
  );
}
