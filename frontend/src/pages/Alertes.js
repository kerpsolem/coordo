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

  useEffect(() => {
    const today = new Date();
    setDateDebut(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
    setDateFin(format(addDays(today, 30), 'yyyy-MM-dd'));
  }, []);

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
        <div><Label className="text-xs">Du</Label><Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="w-40 h-8 text-xs" /></div>
        <div><Label className="text-xs">Au</Label><Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="w-40 h-8 text-xs" /></div>
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
