import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { LogIn, Mail, ArrowLeft, Check } from 'lucide-react';
import API from '../lib/api';

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
      setReqError('Veuillez remplir tous les champs obligatoires');
      return;
    }
    if (reqForm.password.length < 6) {
      setReqError('Le mot de passe doit contenir au moins 6 caracteres');
      return;
    }
    if (reqForm.password !== reqForm.password_confirm) {
      setReqError('Les mots de passe ne correspondent pas');
      return;
    }
    try {
      await API.post('/access-requests', reqForm);
      setReqSent(true);
    } catch (err) {
      setReqError(err.response?.data?.detail || 'Erreur lors de l\'envoi');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-950" />
      <div className="absolute top-20 right-20 w-72 h-72 bg-blue-100 dark:bg-blue-900/20 rounded-full blur-3xl opacity-40" />
      <div className="absolute bottom-20 left-20 w-96 h-96 bg-amber-100 dark:bg-amber-900/10 rounded-full blur-3xl opacity-30" />

      <Card className="w-full max-w-md mx-4 relative z-10 shadow-xl border-slate-200 dark:border-slate-800" data-testid="login-card">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 bg-slate-900 dark:bg-white rounded-2xl flex items-center justify-center">
            <span className="text-2xl font-bold text-white dark:text-slate-900" style={{fontFamily:'Outfit'}}>IF</span>
          </div>
          <CardTitle className="text-2xl font-bold" style={{fontFamily:'Outfit'}}>IFSI Planning</CardTitle>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Coordination pedagogique</p>
        </CardHeader>
        <CardContent>
          {!showRequest ? (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400" data-testid="login-error">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="votre@email.fr" required data-testid="login-email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Votre mot de passe" required data-testid="login-password" />
                </div>
                <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">
                  {loading ? 'Connexion...' : <><LogIn size={16} className="mr-2" /> Se connecter</>}
                </Button>
              </form>
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-center">
                <button onClick={() => setShowRequest(true)}
                  className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors inline-flex items-center gap-1.5"
                  data-testid="request-access-link">
                  <Mail size={14} /> Demander un acces
                </button>
              </div>
            </>
          ) : reqSent ? (
            <div className="text-center py-4 space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Check size={24} className="text-green-600" />
              </div>
              <p className="text-sm font-medium">Demande envoyee</p>
              <p className="text-xs text-slate-500">Votre demande d'acces a ete transmise a l'administrateur. Vous recevrez une reponse par email.</p>
              <Button variant="outline" size="sm" onClick={() => { setShowRequest(false); setReqSent(false); setReqForm({ nom: '', prenom: '', email: '', message: '', password: '', password_confirm: '' }); }}>
                <ArrowLeft size={14} className="mr-1" /> Retour a la connexion
              </Button>
            </div>
          ) : (
            <form onSubmit={handleRequestAccess} className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <button type="button" onClick={() => setShowRequest(false)} className="text-slate-400 hover:text-slate-600">
                  <ArrowLeft size={16} />
                </button>
                <span className="text-sm font-semibold">Demander un acces</span>
              </div>
              {reqError && (
                <div className="p-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-600">{reqError}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Nom *</Label><Input value={reqForm.nom} onChange={e => setReqForm({ ...reqForm, nom: e.target.value })} placeholder="Dupont" className="h-8 text-sm" data-testid="req-nom" /></div>
                <div><Label className="text-xs">Prenom *</Label><Input value={reqForm.prenom} onChange={e => setReqForm({ ...reqForm, prenom: e.target.value })} placeholder="Marie" className="h-8 text-sm" data-testid="req-prenom" /></div>
              </div>
              <div><Label className="text-xs">Email *</Label><Input type="email" value={reqForm.email} onChange={e => setReqForm({ ...reqForm, email: e.target.value })} placeholder="votre@email.fr" className="h-8 text-sm" data-testid="req-email" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Mot de passe *</Label><Input type="password" value={reqForm.password} onChange={e => setReqForm({ ...reqForm, password: e.target.value })} placeholder="Min. 6 caracteres" className="h-8 text-sm" data-testid="req-password" /></div>
                <div><Label className="text-xs">Confirmer *</Label><Input type="password" value={reqForm.password_confirm} onChange={e => setReqForm({ ...reqForm, password_confirm: e.target.value })} placeholder="Confirmer" className="h-8 text-sm" data-testid="req-password-confirm" /></div>
              </div>
              <div><Label className="text-xs">Message (optionnel)</Label>
                <textarea className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={2} placeholder="Motif de la demande..."
                  value={reqForm.message} onChange={e => setReqForm({ ...reqForm, message: e.target.value })} data-testid="req-message" />
              </div>
              <Button type="submit" className="w-full" data-testid="req-submit">
                <Mail size={14} className="mr-2" /> Envoyer la demande
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
