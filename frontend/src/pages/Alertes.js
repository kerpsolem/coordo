import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { format, startOfWeek, addDays } from 'date-fns';

export default function Alertes() {
  const [alerts, setAlerts] = useState([]);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [showError, setShowError] = useState(true);
  const [showWarning, setShowWarning] = useState(true);
  const [showInfo, setShowInfo] = useState(true);

  // Period filter
  const [periodMode, setPeriodMode] = useState('custom'); // semestre | annee_scolaire | custom
  const [filterSemestre, setFilterSemestre] = useState('');
  const [filterAnneeSco, setFilterAnneeSco] = useState('');
  const [schoolYears, setSchoolYears] = useState([]);

  // Load school years once
  useEffect(() => {
    (async () => {
      try { const { data } = await API.get('/school-years'); setSchoolYears(data); } catch (e) { console.error(e); }
    })();
  }, []);

  // Default custom range
  useEffect(() => {
    if (periodMode === 'custom' && !dateDebut) {
      const today = new Date();
      setDateDebut(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setDateFin(format(addDays(today, 30), 'yyyy-MM-dd'));
    }
  }, [periodMode, dateDebut]);

  // Apply filter mode
  useEffect(() => {
    if (periodMode === 'annee_scolaire' && filterAnneeSco) {
      const sy = schoolYears.find(s => s.id === filterAnneeSco);
      if (sy?.date_debut && sy?.date_fin) { setDateDebut(sy.date_debut); setDateFin(sy.date_fin); }
    } else if (periodMode === 'semestre' && filterSemestre) {
      // Approximate semester windows in current year
      const y = new Date().getFullYear();
      const sNum = parseInt(filterSemestre.replace('S', ''), 10);
      const isOdd = sNum % 2 === 1;
      // S1, S3, S5 = sept->fev ; S2, S4, S6 = fev->aug
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

  const filtered = alerts.filter(a =>
    (a.type === 'error' && showError) ||
    (a.type === 'warning' && showWarning) ||
    (a.type === 'info' && showInfo)
  );

  const iconMap = { error: AlertCircle, warning: AlertTriangle, info: Info };
  const colorMap = {
    error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300',
    warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300',
    info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300'
  };

  const counts = { error: alerts.filter(a => a.type === 'error').length, warning: alerts.filter(a => a.type === 'warning').length, info: alerts.filter(a => a.type === 'info').length };

  return (
    <div className="space-y-4" data-testid="alertes">
      <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Alertes</h1>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">Periode</Label>
          <Select value={periodMode} onValueChange={setPeriodMode}>
            <SelectTrigger className="w-44 h-8 text-xs" data-testid="alert-period-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Personnalisee</SelectItem>
              <SelectItem value="semestre">Par semestre</SelectItem>
              <SelectItem value="annee_scolaire">Par annee scolaire</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {periodMode === 'semestre' && (
          <div>
            <Label className="text-xs">Semestre</Label>
            <Select value={filterSemestre} onValueChange={setFilterSemestre}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>
                {['S1','S2','S3','S4','S5','S6'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {periodMode === 'annee_scolaire' && (
          <div>
            <Label className="text-xs">Annee scolaire</Label>
            <Select value={filterAnneeSco} onValueChange={setFilterAnneeSco}>
              <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>
                {schoolYears.map(sy => <SelectItem key={sy.id} value={sy.id}>{sy.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {periodMode === 'custom' && (
          <>
            <div><Label className="text-xs">Du</Label><Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="w-40 h-8 text-xs" /></div>
            <div><Label className="text-xs">Au</Label><Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="w-40 h-8 text-xs" /></div>
          </>
        )}
        <div className="flex items-center gap-3 ml-2">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <Checkbox checked={showError} onCheckedChange={setShowError} />
            <span className="flex items-center gap-1"><AlertCircle size={12} className="text-red-500" /> Erreurs ({counts.error})</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <Checkbox checked={showWarning} onCheckedChange={setShowWarning} />
            <span className="flex items-center gap-1"><AlertTriangle size={12} className="text-amber-500" /> Avertissements ({counts.warning})</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <Checkbox checked={showInfo} onCheckedChange={setShowInfo} />
            <span className="flex items-center gap-1"><Info size={12} className="text-blue-500" /> Informations ({counts.info})</span>
          </label>
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((alert, i) => {
          const Icon = iconMap[alert.type] || Info;
          return (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${colorMap[alert.type] || colorMap.info}`}>
              <Icon size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">{alert.message}</p>
                {alert.date && <p className="text-xs mt-0.5 opacity-70">{alert.date}</p>}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <Card><CardContent className="py-8 text-center text-sm text-slate-500">Aucune alerte sur cette periode</CardContent></Card>
        )}
      </div>
    </div>
  );
}
