import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Calendar, Clock, Users, AlertTriangle, Gift, Quote, GraduationCap } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, getWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer, Legend } from 'recharts';
import { filterCls } from '../lib/filterCls';

const PIE_COLORS = ['#E97451', '#0E1F36', '#F4B393', '#1B3057', '#FFB088', '#395682', '#FBE9D7', '#6C8AB5', '#BF5430', '#9DAFCC', '#2B4A78'];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('semaine');
  const [weekNum, setWeekNum] = useState(getWeek(new Date(), { weekStartsOn: 1 }));
  const [filterPromo, setFilterPromo] = useState('all');
  const [filterSemestre, setFilterSemestre] = useState('all');
  const [filterAnneeSco, setFilterAnneeSco] = useState('all');
  const [coursOnly, setCoursOnly] = useState(true); // default ON: only "Cours" type
  const [promotions, setPromotions] = useState([]);
  const [schoolYears, setSchoolYears] = useState([]);
  const [actTypes, setActTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([API.get('/promotions'), API.get('/school-years'), API.get('/activity-types')]).then(([p, sy, at]) => {
      setPromotions(p.data); setSchoolYears(sy.data); setActTypes(at.data);
      // Default to current school year (one that contains today's date)
      const today = new Date().toISOString().slice(0, 10);
      const current = sy.data.find(s => s.date_debut && s.date_fin && s.date_debut <= today && today <= s.date_fin);
      if (current) setFilterAnneeSco(current.id);
    }).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const today = new Date();
    let dateDebut, dateFin;

    const selectedSY = filterAnneeSco !== 'all' ? schoolYears.find(sy => sy.id === filterAnneeSco) : null;
    if (selectedSY && selectedSY.date_debut && selectedSY.date_fin) {
      dateDebut = selectedSY.date_debut;
      dateFin = selectedSY.date_fin;
    } else if (period === 'jour') {
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
    if (filterPromo !== 'all') params.promotion_id = filterPromo;
    if (coursOnly) {
      // Filter to activity types flagged as "Cours" in Administration > Types d'activite
      const coursIds = actTypes.filter(a => a.is_cours === true).map(a => a.id);
      if (coursIds.length) params.type_activite_id = coursIds.join(',');
      else params.type_activite_id = '__none__'; // force empty result if no type flagged
    }

    try {
      const { data: d } = await API.get('/dashboard', { params });
      setData(d);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [period, weekNum, filterPromo, filterSemestre, filterAnneeSco, coursOnly, actTypes, promotions, schoolYears]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const today = new Date();
  const formattedDate = format(today, "EEEE d MMMM yyyy", { locale: fr });

  const pieData = data?.heures_par_type ? Object.entries(data.heures_par_type).map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 })).sort((a, b) => b.value - a.value) : [];

  if (loading && !data) return <div className="flex items-center justify-center h-64"><div className="text-slate-500">Chargement...</div></div>;

  return (
    <div className="space-y-5" data-testid="dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{fontFamily:'Outfit'}}>Tableau de bord</h1>
          <p className="text-base text-slate-500 dark:text-slate-400 mt-1 capitalize">{formattedDate}</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32 h-8 text-xs" data-testid="dashboard-period-trigger"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="jour">Jour</SelectItem>
              <SelectItem value="semaine">Semaine</SelectItem>
              <SelectItem value="mois">Mois</SelectItem>
            </SelectContent>
          </Select>
          {period === 'semaine' && (
            <Select value={String(weekNum)} onValueChange={v => setWeekNum(Number(v))}>
              <SelectTrigger className="w-20 h-8 text-xs"><SelectValue placeholder={`S${weekNum}`} /></SelectTrigger>
              <SelectContent>{Array.from({length: 52}, (_, i) => i + 1).map(w => (<SelectItem key={w} value={String(w)}>S{w}</SelectItem>))}</SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filterPromo} onValueChange={setFilterPromo}>
          <SelectTrigger className={filterCls(filterPromo, 'w-48 h-8 text-xs')} data-testid="dashboard-filter-promo"><SelectValue placeholder="Promotion" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes promotions</SelectItem>
            {promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAnneeSco} onValueChange={setFilterAnneeSco}>
          <SelectTrigger className={filterCls(filterAnneeSco, 'w-40 h-8 text-xs')} data-testid="dashboard-filter-annee"><SelectValue placeholder="Annee scolaire" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes annees</SelectItem>
            {schoolYears.map(sy => <SelectItem key={sy.id} value={sy.id}>{sy.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSemestre} onValueChange={setFilterSemestre}>
          <SelectTrigger className={filterCls(filterSemestre, 'w-40 h-8 text-xs')} data-testid="dashboard-filter-semestre"><SelectValue placeholder="Semestre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous semestres</SelectItem>
            <SelectItem value="pair">Pairs (S2,S4,S6)</SelectItem>
            <SelectItem value="impair">Impairs (S1,S3,S5)</SelectItem>
            {["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className={`flex items-center gap-1.5 ml-2 cursor-pointer select-none border rounded px-2 py-1 text-xs ${coursOnly ? 'filter-active' : 'border-transparent'}`} data-testid="dashboard-cours-only">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={coursOnly} onChange={e => setCoursOnly(e.target.checked)} />
          <span className="font-medium">Cours uniquement</span>
        </label>
      </div>

      {/* Saint + Citation — peach + soft white style */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data?.saint_du_jour && (
          <Card className="border-[#F8DBC2] bg-[#FFF1E8] dark:bg-amber-950/20 dark:border-amber-800"><CardContent className="flex items-center gap-4 py-3">
            <div className="w-10 h-10 rounded-full bg-white dark:bg-amber-900/30 flex items-center justify-center shadow-sm"><Gift size={20} className="text-[#E97451]" /></div>
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-[#E97451]">Éphéméride</p>
              <p className="text-base font-semibold mt-0.5" style={{ fontFamily: 'Outfit' }}>Aujourd'hui on fête les <span className="text-[#E97451]">{data.saint_du_jour}</span></p>
            </div>
          </CardContent></Card>
        )}
        {data?.citation && (
          <Card><CardContent className="flex items-center gap-4 py-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Quote size={18} className="text-slate-600 dark:text-slate-300" /></div>
            <div>
              <p className="text-sm italic text-slate-700 dark:text-slate-200">« {data.citation.text} »</p>
              <p className="text-xs text-slate-500 mt-0.5">— {data.citation.author}</p>
            </div>
          </CardContent></Card>
        )}
      </div>

      {data?.anniversaires?.length > 0 && (
        <Card className="border-[#F8DBC2] bg-[#FFF1E8] dark:border-amber-800 dark:bg-amber-950/20">
          <CardContent className="py-2 flex items-center gap-3"><Gift size={16} className="text-[#E97451]" /><span className="text-sm font-medium">Anniversaire : {data.anniversaires.join(', ')}</span></CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="kpi-seances"><CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Séances planifiées</p><p className="text-3xl font-bold mt-1 text-[#0E1F36] dark:text-white" style={{ fontFamily: 'Outfit' }}>{data?.total_seances || 0}</p><p className="text-[10px] text-slate-400 mt-0.5">sur la période</p></div>
            <Calendar size={22} className="text-[#E97451]" />
          </div>
        </CardContent></Card>
        <Card data-testid="kpi-heures"><CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Heures totales</p><p className="text-3xl font-bold mt-1 text-[#0E1F36] dark:text-white" style={{ fontFamily: 'Outfit' }}>{data?.total_heures?.toFixed(0) || 0}h</p><p className="text-[10px] text-slate-400 mt-0.5">heures cumulées</p></div>
            <Clock size={22} className="text-[#E97451]" />
          </div>
        </CardContent></Card>
        <Card data-testid="kpi-formateurs"><CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Formateurs actifs</p><p className="text-3xl font-bold mt-1 text-[#0E1F36] dark:text-white" style={{ fontFamily: 'Outfit' }}>{data?.total_formateurs || 0}</p><p className="text-[10px] text-slate-400 mt-0.5">intervenants</p></div>
            <Users size={22} className="text-[#E97451]" />
          </div>
        </CardContent></Card>
        <Card data-testid="kpi-promos"><CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Promotions</p><p className="text-3xl font-bold mt-1 text-[#0E1F36] dark:text-white" style={{ fontFamily: 'Outfit' }}>{promotions.length}</p><p className="text-[10px] text-slate-400 mt-0.5">en cours</p></div>
            <GraduationCap size={22} className="text-[#E97451]" />
          </div>
        </CardContent></Card>
      </div>

      {/* Charts: Heures par promotion + Repartition par type */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Heures par promotion / par étudiant</CardTitle></CardHeader>
          <CardContent>
            {data?.heures_par_promotion && Object.keys(data.heures_par_promotion).length > 0 ? (
              <div className="space-y-1">
                <div className="flex items-center text-[10px] uppercase tracking-wide text-slate-400 font-semibold pb-1 border-b border-slate-200">
                  <span className="flex-1">Promotion</span>
                  <span className="w-20 text-right">Total promo</span>
                  <span className="w-24 text-right">Par étudiant</span>
                </div>
                {Object.entries(data.heures_par_promotion).map(([promo, h]) => {
                  const hStu = data?.heures_par_etudiant?.[promo] ?? h;
                  return (
                    <div key={promo} className="flex items-center text-sm py-0.5">
                      <span className="flex-1 text-slate-700 dark:text-slate-200 truncate">{promo}</span>
                      <span className="w-20 text-right font-semibold">{h.toFixed(1)}h</span>
                      <span className="w-24 text-right font-semibold text-coral-700">{hStu.toFixed(1)}h</span>
                    </div>
                  );
                })}
                <p className="text-[10px] text-slate-400 italic pt-1">Par étudiant : Σ heures par groupe ÷ nb de groupes de la promo.</p>
              </div>
            ) : <p className="text-sm text-slate-500">Aucune donnee</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Repartition par type d'activite</CardTitle></CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} innerRadius={30} dataKey="value" paddingAngle={2}
                    label={({ name, value }) => `${name}: ${value}h`} labelLine={true}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <ReTooltip formatter={(v) => `${v}h`} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-slate-500">Aucune donnee</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
