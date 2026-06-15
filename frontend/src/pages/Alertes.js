import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { AlertTriangle, AlertCircle, BarChart3, UserX, CalendarX, Pin, RefreshCw, Check, Filter, Users } from 'lucide-react';
import { format, startOfWeek, addDays } from 'date-fns';

const CATEGORIES = [
  { id: 'all', label: 'Tous types', icon: Filter, color: 'slate' },
  { id: 'chevauchement', label: 'Chevauchement', icon: AlertTriangle, color: 'amber' },
  { id: 'surcharge', label: 'Surcharge', icon: BarChart3, color: 'fuchsia' },
  { id: 'sans_formateur', label: 'Sans formateur', icon: UserX, color: 'red' },
  { id: 'incomplet', label: 'Séance incomplète', icon: Users, color: 'orange' },
  { id: 'conflit_absence', label: 'Conflit absence', icon: CalendarX, color: 'rose' },
  { id: 'autre', label: 'Autre', icon: Pin, color: 'slate' },
];

const COLOR_BG = {
  amber: 'bg-amber-50 border-amber-300 text-amber-800',
  red: 'bg-red-50 border-red-300 text-red-800',
  rose: 'bg-rose-50 border-rose-300 text-rose-800',
  fuchsia: 'bg-fuchsia-50 border-fuchsia-300 text-fuchsia-800',
  orange: 'bg-orange-50 border-orange-300 text-orange-800',
  slate: 'bg-slate-50 border-slate-300 text-slate-700',
};
const ICON_COLOR = {
  amber: 'text-amber-500',
  red: 'text-red-500',
  rose: 'text-rose-500',
  fuchsia: 'text-fuchsia-500',
  orange: 'text-orange-500',
  slate: 'text-slate-500',
};

export default function Alertes() {
  const [alerts, setAlerts] = useState([]);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [showResolved, setShowResolved] = useState(false);
  const [resolved, setResolved] = useState(() => {
    try { return JSON.parse(localStorage.getItem('resolved_alerts') || '[]'); } catch { return []; }
  });

  const [periodMode, setPeriodMode] = useState('annee_scolaire');
  const [filterSemestre, setFilterSemestre] = useState('');
  const [filterAnneeSco, setFilterAnneeSco] = useState('');
  const [schoolYears, setSchoolYears] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await API.get('/school-years');
        setSchoolYears(data);
        if (data.length && !filterAnneeSco) {
          const today = new Date().toISOString().slice(0, 10);
          const current = data.find(sy => sy.date_debut && sy.date_fin && sy.date_debut <= today && today <= sy.date_fin);
          setFilterAnneeSco((current || data[0]).id);
        }
      } catch (e) { console.error(e); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (periodMode === 'custom' && !dateDebut) {
      const today = new Date();
      setDateDebut(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setDateFin(format(addDays(today, 30), 'yyyy-MM-dd'));
    }
  }, [periodMode, dateDebut]);

  useEffect(() => {
    if (periodMode === 'annee_scolaire' && filterAnneeSco) {
      const sy = schoolYears.find(s => s.id === filterAnneeSco);
      if (sy?.date_debut && sy?.date_fin) { setDateDebut(sy.date_debut); setDateFin(sy.date_fin); }
    } else if (periodMode === 'semestre' && filterSemestre) {
      const y = new Date().getFullYear();
      const sNum = parseInt(filterSemestre.replace('S', ''), 10);
      const isOdd = sNum % 2 === 1;
      const start = isOdd ? `${y - (new Date().getMonth() < 8 ? 1 : 0)}-09-01` : `${y}-02-01`;
      const end = isOdd ? `${y + (new Date().getMonth() < 8 ? 0 : 1)}-01-31` : `${y}-08-31`;
      setDateDebut(start); setDateFin(end);
    }
  }, [periodMode, filterAnneeSco, filterSemestre, schoolYears]);

  const fetchAlerts = useCallback(async () => {
    if (!dateDebut || !dateFin) return;
    try {
      const { data } = await API.get('/alerts', { params: { date_debut: dateDebut, date_fin: dateFin } });
      setAlerts(data);
    } catch (e) { console.error(e); }
  }, [dateDebut, dateFin]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const alertKey = (a) => `${a.category}|${a.session_id || ''}|${a.date || ''}|${a.title || ''}`;
  const isResolved = (a) => resolved.includes(alertKey(a));
  const toggleResolved = (a) => {
    const k = alertKey(a);
    const next = resolved.includes(k) ? resolved.filter(r => r !== k) : [...resolved, k];
    setResolved(next);
    localStorage.setItem('resolved_alerts', JSON.stringify(next));
  };

  // Counts by category (active only = unresolved)
  const counts = alerts.reduce((acc, a) => {
    if (isResolved(a) && !showResolved) return acc;
    acc[a.category || 'autre'] = (acc[a.category || 'autre'] || 0) + 1;
    return acc;
  }, {});
  const totalActive = Object.values(counts).reduce((a, b) => a + b, 0);

  const filtered = alerts.filter(a => {
    if (!showResolved && isResolved(a)) return false;
    if (filterCat !== 'all' && (a.category || 'autre') !== filterCat) return false;
    return true;
  });

  // Group by date for visual structure
  const sorted = [...filtered].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return (
    <div className="space-y-4" data-testid="alertes">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Alertes</h1>
          <p className="text-sm text-slate-500 mt-0.5">Générées automatiquement depuis le planning et les absences</p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchAlerts} className="text-xs gap-1 text-slate-600" data-testid="alerts-refresh">
          <RefreshCw size={14} /> Mise à jour automatique
        </Button>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.filter(c => c.id !== 'all').map(c => {
          const Icon = c.icon;
          const n = counts[c.id] || 0;
          return (
            <button key={c.id} onClick={() => setFilterCat(c.id === filterCat ? 'all' : c.id)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors
                ${filterCat === c.id ? COLOR_BG[c.color] + ' ring-2 ring-offset-1 ring-' + c.color + '-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50'}`}
              data-testid={`alert-cat-${c.id}`}>
              <Icon size={14} className={ICON_COLOR[c.color]} />
              <span>{c.label}</span>
              {n > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">{n}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">Période</Label>
          <Select value={periodMode} onValueChange={setPeriodMode}>
            <SelectTrigger className="w-44 h-8 text-xs" data-testid="alert-period-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Personnalisée</SelectItem>
              <SelectItem value="semestre">Par semestre</SelectItem>
              <SelectItem value="annee_scolaire">Par année scolaire</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {periodMode === 'semestre' && (
          <div>
            <Label className="text-xs">Semestre</Label>
            <Select value={filterSemestre} onValueChange={setFilterSemestre}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>{['S1','S2','S3','S4','S5','S6'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        {periodMode === 'annee_scolaire' && (
          <div>
            <Label className="text-xs">Année scolaire</Label>
            <Select value={filterAnneeSco} onValueChange={setFilterAnneeSco}>
              <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>{schoolYears.map(sy => <SelectItem key={sy.id} value={sy.id}>{sy.nom}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        {periodMode === 'custom' && (
          <>
            <div><Label className="text-xs">Du</Label><Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="w-40 h-8 text-xs" /></div>
            <div><Label className="text-xs">Au</Label><Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="w-40 h-8 text-xs" /></div>
          </>
        )}
        <div className="ml-auto flex items-end gap-2">
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-44 h-8 text-xs" data-testid="alert-cat-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant={showResolved ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setShowResolved(s => !s)} data-testid="alert-toggle-resolved">
            {showResolved ? 'Masquer résolues' : 'Voir résolues'}
          </Button>
          <span className="h-8 inline-flex items-center px-3 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-semibold" data-testid="alert-count">
            {totalActive} alerte{totalActive > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Alert list */}
      <div className="space-y-2">
        {sorted.map((alert, i) => {
          const cat = CATEGORIES.find(c => c.id === alert.category) || CATEGORIES[CATEGORIES.length - 1];
          const Icon = cat.icon;
          const dateLabel = alert.date ? new Date(alert.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
          const time = alert.heure_debut && alert.heure_fin ? `${alert.heure_debut}-${alert.heure_fin}` : '';
          const resolvedThis = isResolved(alert);
          return (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${COLOR_BG[cat.color]} ${resolvedThis ? 'opacity-50' : ''}`} data-testid={`alert-item-${i}`}>
              <Icon size={20} className={`flex-shrink-0 mt-0.5 ${ICON_COLOR[cat.color]}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/70 ${ICON_COLOR[cat.color]}`}>{cat.label}</span>
                  {dateLabel && <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 capitalize">{dateLabel}{time && ` ${time}`}</span>}
                  {alert.context && <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium">{alert.context}</span>}
                  {alert.auto && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 font-bold">Auto</span>}
                </div>
                <p className="text-sm font-semibold mt-1">{alert.title || alert.message}</p>
                {alert.title && alert.message && alert.message !== alert.title && (
                  <p className="text-xs mt-0.5 opacity-80">{alert.message}</p>
                )}
              </div>
              <button onClick={() => toggleResolved(alert)} className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${resolvedThis ? 'bg-green-500 border-green-500' : 'border-slate-300 hover:border-green-400'}`}
                title={resolvedThis ? 'Marquer comme non résolue' : 'Marquer comme résolue'} data-testid={`alert-resolve-${i}`}>
                {resolvedThis && <Check size={14} className="text-white" />}
              </button>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <Card><CardContent className="py-8 text-center text-sm text-slate-500">
            <AlertCircle size={20} className="mx-auto mb-2 text-slate-400" />
            Aucune alerte sur cette période
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}
