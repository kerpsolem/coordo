import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { AlertTriangle, Info, AlertCircle, Filter } from 'lucide-react';
import { format, startOfWeek, endOfWeek, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Alertes() {
  const [alerts, setAlerts] = useState([]);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [filterType, setFilterType] = useState('all');

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

  const filtered = filterType === 'all' ? alerts : alerts.filter(a => a.type === filterType);

  const iconMap = { error: AlertCircle, warning: AlertTriangle, info: Info };
  const colorMap = {
    error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300',
    warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300',
    info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300'
  };

  return (
    <div className="space-y-4" data-testid="alertes">
      <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Alertes</h1>

      <div className="flex flex-wrap gap-3 items-end">
        <div><Label className="text-xs">Du</Label><Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">Au</Label><Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="w-40" /></div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36" data-testid="filter-alert-type"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="error">Erreurs</SelectItem>
            <SelectItem value="warning">Avertissements</SelectItem>
            <SelectItem value="info">Informations</SelectItem>
          </SelectContent>
        </Select>
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
