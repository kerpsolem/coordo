import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { LogIn } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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
        </CardContent>
      </Card>
    </div>
  );
}
