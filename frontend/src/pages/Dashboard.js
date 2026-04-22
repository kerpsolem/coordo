import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Calendar, Clock, Users, AlertTriangle, UserX, Gift, Quote } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, getWeek } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('semaine');
  const [weekNum, setWeekNum] = useState(getWeek(new Date(), { weekStartsOn: 1 }));
  const [filterPromo, setFilterPromo] = useState('all');
  const [filterSemestre, setFilterSemestre] = useState('all');
  const [filterAnneeSco, setFilterAnneeSco] = useState('all');
  const [promotions, setPromotions] = useState([]);
  const [schoolYears, setSchoolYears] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([API.get('/promotions'), API.get('/school-years')]).then(([p, sy]) => {
      setPromotions(p.data); setSchoolYears(sy.data);
    }).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const today = new Date();
    let dateDebut, dateFin;

    if (period === 'jour') {
      dateDebut = format(today, 'yyyy-MM-dd');
      dateFin = dateDebut;
    } else if (period === 'semaine') {
      const year = today.getFullYear();
      const jan1 = new Date(year, 0, 1);
      const weekStart = addWeeks(startOfWeek(jan1, { weekStartsOn: 1 }), weekNum - 1);
      dateDebut = format(weekStart, 'yyyy-MM-dd');
      dateFin = format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    } else if (period === 'mois') {
      dateDebut = format(startOfMonth(today), 'yyyy-MM-dd');
      dateFin = format(endOfMonth(today), 'yyyy-MM-dd');
    } else {
      dateDebut = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      dateFin = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    }

    const params = { date_debut: dateDebut, date_fin: dateFin };
    if (filterSemestre !== 'all') params.semestre = filterSemestre;

    try {
      const { data: d } = await API.get('/dashboard', { params });
      // Client-side filter by promotion
      if (filterPromo !== 'all' && d.heures_par_promotion) {
        const promoName = promotions.find(p => p.id === filterPromo)?.nom;
        if (promoName) {
          const filtered = {};
          if (d.heures_par_promotion[promoName] !== undefined) filtered[promoName] = d.heures_par_promotion[promoName];
          d.heures_par_promotion = filtered;
        }
      }
      setData(d);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [period, weekNum, filterPromo, filterSemestre, filterAnneeSco, promotions]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const today = new Date();
  const formattedDate = format(today, "EEEE d MMMM yyyy", { locale: fr });

  if (loading && !data) return <div className="flex items-center justify-center h-64"><div className="text-slate-500">Chargement...</div></div>;

  return (
    <div className="space-y-6" data-testid="dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{fontFamily:'Outfit'}}>Tableau de bord</h1>
          <p className="text-base text-slate-500 dark:text-slate-400 mt-1 capitalize">{formattedDate}</p>
        </div>
        <div className="flex gap-3 items-center">
          <Select value={period} onValueChange={setPeriod} data-testid="dashboard-period-select">
            <SelectTrigger className="w-36" data-testid="dashboard-period-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jour">Jour</SelectItem>
              <SelectItem value="semaine">Semaine</SelectItem>
              <SelectItem value="mois">Mois</SelectItem>
            </SelectContent>
          </Select>
          {period === 'semaine' && (
            <Select value={String(weekNum)} onValueChange={v => setWeekNum(Number(v))} data-testid="dashboard-week-select">
              <SelectTrigger className="w-24">
                <SelectValue placeholder={`S${weekNum}`} />
              </SelectTrigger>
              <SelectContent>
                {Array.from({length: 52}, (_, i) => i + 1).map(w => (
                  <SelectItem key={w} value={String(w)}>S{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filterPromo} onValueChange={setFilterPromo}>
          <SelectTrigger className="w-48 h-8 text-xs" data-testid="dashboard-filter-promo"><SelectValue placeholder="Promotion" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes promotions</SelectItem>
            {promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAnneeSco} onValueChange={setFilterAnneeSco}>
          <SelectTrigger className="w-40 h-8 text-xs" data-testid="dashboard-filter-annee"><SelectValue placeholder="Annee scolaire" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes annees</SelectItem>
            {schoolYears.map(sy => <SelectItem key={sy.id} value={sy.id}>{sy.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSemestre} onValueChange={setFilterSemestre}>
          <SelectTrigger className="w-40 h-8 text-xs" data-testid="dashboard-filter-semestre"><SelectValue placeholder="Semestre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous semestres</SelectItem>
            <SelectItem value="pair">Pairs (S2,S4,S6)</SelectItem>
            <SelectItem value="impair">Impairs (S1,S3,S5)</SelectItem>
            {["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Saint + Citation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data?.saint_du_jour && (
          <Card className="border-slate-200 dark:border-slate-800">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Gift size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Ephemeride</p>
                <p className="text-lg font-semibold" style={{fontFamily:'Outfit'}}>Aujourd'hui on fete les <span className="text-amber-600 dark:text-amber-400">{data.saint_du_jour}</span></p>
              </div>
            </CardContent>
          </Card>
        )}
        {data?.citation && (
          <Card className="border-slate-200 dark:border-slate-800">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <Quote size={20} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-sm italic text-slate-600 dark:text-slate-300">"{data.citation.text}"</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">-- {data.citation.author}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Anniversaires */}
      {data?.anniversaires?.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-3 flex items-center gap-3">
            <Gift size={18} className="text-amber-500" />
            <span className="text-sm font-medium">Anniversaire : {data.anniversaires.join(', ')}</span>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="kpi-heures">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Clock size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{fontFamily:'Outfit'}}>{data?.total_heures?.toFixed(1) || 0}h</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Heures planifiees</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="kpi-seances">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Calendar size={20} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{fontFamily:'Outfit'}}>{data?.total_seances || 0}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Seances</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="kpi-formateurs">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <Users size={20} className="text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{fontFamily:'Outfit'}}>{data?.total_formateurs || 0}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Formateurs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="kpi-alertes">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                <AlertTriangle size={20} className="text-rose-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{fontFamily:'Outfit'}}>{data?.alertes?.length || 0}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Alertes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Heures par promotion */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Heures par promotion</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.heures_par_promotion && Object.keys(data.heures_par_promotion).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(data.heures_par_promotion).map(([promo, h]) => (
                  <div key={promo} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-300 truncate">{promo}</span>
                    <span className="text-sm font-semibold">{h.toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-slate-500">Aucune donnee pour cette periode</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserX size={16}/> Formateurs absents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.formateurs_absents?.length > 0 ? (
              <div className="space-y-2">
                {data.formateurs_absents.map((ab, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-md bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-xs font-bold bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">{ab.initiales}</span>
                    <div>
                      <p className="text-sm font-medium">{ab.prenom} {ab.nom}</p>
                      <p className="text-xs text-slate-500">{ab.date_debut} - {ab.date_fin} {ab.recurrence ? '(recurrence)' : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-slate-500">Aucun formateur absent</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
