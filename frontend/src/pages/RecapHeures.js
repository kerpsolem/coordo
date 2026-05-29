import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Filter, BarChart3 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addWeeks, getWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';

const CHART_COLORS = ['#6366F1', '#34D399', '#FBBF24', '#F43F5E', '#A78BFA', '#06B6D4', '#F97316', '#94A3B8', '#38BDF8', '#FB923C', '#818CF8', '#10B981'];

export default function RecapHeures() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('mois');
  const [filterFormateur, setFilterFormateur] = useState('all');
  const [filterPromo, setFilterPromo] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterSemestre, setFilterSemestre] = useState('all');
  const [filterAnneeSco, setFilterAnneeSco] = useState('all');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [formateurs, setFormateurs] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [actTypes, setActTypes] = useState([]);
  const [schoolYears, setSchoolYears] = useState([]);
  const [view, setView] = useState('formateur');
  const [ueData, setUeData] = useState(null);
  const [expandedUe, setExpandedUe] = useState({});

  useEffect(() => {
    const today = new Date();
    if (period === 'mois') {
      setDateDebut(format(startOfMonth(today), 'yyyy-MM-dd'));
      setDateFin(format(endOfMonth(today), 'yyyy-MM-dd'));
    } else if (period === 'semaine') {
      setDateDebut(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setDateFin(format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
    }
  }, [period]);

  const fetchData = useCallback(async () => {
    let dd = dateDebut, df = dateFin;
    const selectedSY = filterAnneeSco !== 'all' ? schoolYears.find(sy => sy.id === filterAnneeSco) : null;
    if (selectedSY && selectedSY.date_debut && selectedSY.date_fin) {
      dd = selectedSY.date_debut;
      df = selectedSY.date_fin;
    }
    if (!dd || !df) return;

    const params = { date_debut: dd, date_fin: df };
    if (filterFormateur !== 'all') params.formateur_id = filterFormateur;
    if (filterPromo !== 'all') params.promotion_id = filterPromo;
    if (filterType !== 'all') params.type_activite_id = filterType;
    if (filterSemestre !== 'all') params.semestre = filterSemestre;

    try {
      const params2 = { date_debut: dd, date_fin: df };
      if (filterPromo !== 'all') params2.promotion_id = filterPromo;
      if (filterSemestre !== 'all') params2.semestre = filterSemestre;
      const [recRes, fmRes, prRes, atRes, syRes, ueRes] = await Promise.all([
        API.get('/recap', { params }), API.get('/formateurs'), API.get('/promotions'), API.get('/activity-types'), API.get('/school-years'),
        API.get('/recap-ue', { params: params2 })
      ]);
      setData(recRes.data);
      setFormateurs(fmRes.data);
      setPromotions(prRes.data);
      setActTypes(atRes.data);
      setSchoolYears(syRes.data);
      setUeData(ueRes.data);
      // Default to current school year on first load
      if (filterAnneeSco === 'all' && syRes.data?.length) {
        const today = new Date().toISOString().slice(0, 10);
        const current = syRes.data.find(s => s.date_debut && s.date_fin && s.date_debut <= today && today <= s.date_fin);
        if (current) setFilterAnneeSco(current.id);
      }
    } catch (e) { console.error(e); }
  }, [dateDebut, dateFin, filterFormateur, filterPromo, filterType, filterSemestre, filterAnneeSco, schoolYears]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---- Chart data ----
  const chartFormateurs = data?.par_formateur
    ? Object.entries(data.par_formateur)
        .map(([name, info]) => ({ name, heures: +info.total.toFixed(1) }))
        .sort((a, b) => b.heures - a.heures)
        .slice(0, 12)
    : [];

  const chartTypes = data?.par_type_activite
    ? Object.entries(data.par_type_activite)
        .map(([name, h]) => ({ name, value: +h.toFixed(1) }))
        .sort((a, b) => b.value - a.value)
    : [];

  const chartPromos = data?.par_promotion
    ? Object.entries(data.par_promotion)
        .map(([name, h]) => ({ name: name.replace('Promotion ', ''), heures: +h.toFixed(1) }))
        .sort((a, b) => b.heures - a.heures)
    : [];

  const chartSemaines = data?.par_semaine
    ? Object.entries(data.par_semaine)
        .map(([w, h]) => ({ semaine: `S${w}`, heures: +h.toFixed(1), _w: Number(w) }))
        .sort((a, b) => a._w - b._w)
    : [];

  const chartUes = data?.par_ue
    ? Object.entries(data.par_ue)
        .map(([name, h]) => ({ name, heures: +h.toFixed(1) }))
        .sort((a, b) => b.heures - a.heures)
        .slice(0, 12)
    : [];

  const chartSemestres = data?.par_semestre
    ? Object.entries(data.par_semestre)
        .map(([s, h]) => ({ semestre: s, heures: +h.toFixed(1) }))
        .sort((a, b) => a.semestre.localeCompare(b.semestre))
    : [];

  return (
    <div className="space-y-4" data-testid="recap-heures">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Recap heures</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">Periode</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="semaine">Semaine</SelectItem>
              <SelectItem value="mois">Mois</SelectItem>
              <SelectItem value="custom">Personnalise</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Du</Label><Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">Au</Label><Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="w-40" /></div>
        <Select value={filterFormateur} onValueChange={setFilterFormateur}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Formateur" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous formateurs</SelectItem>
            {formateurs.map(f => <SelectItem key={f.id} value={f.id}>{f.initiales} - {f.prenom} {f.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPromo} onValueChange={setFilterPromo}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Promotion" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes promotions</SelectItem>
            {promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSemestre} onValueChange={setFilterSemestre}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Semestre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pair">Pairs</SelectItem>
            <SelectItem value="impair">Impairs</SelectItem>
            {["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAnneeSco} onValueChange={setFilterAnneeSco}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Annee scolaire" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes annees</SelectItem>
            {schoolYears.map(sy => <SelectItem key={sy.id} value={sy.id}>{sy.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            {actTypes.map(a => <SelectItem key={a.id} value={a.id}>{a.nom}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="py-3"><p className="text-2xl font-bold" style={{ fontFamily: 'Outfit' }}>{data?.total_heures?.toFixed(1) || 0}h</p><p className="text-xs text-slate-500">Total heures</p></CardContent></Card>
        <Card><CardContent className="py-3"><p className="text-2xl font-bold" style={{ fontFamily: 'Outfit' }}>{data?.total_seances || 0}</p><p className="text-xs text-slate-500">Total seances</p></CardContent></Card>
      </div>

      {/* Views */}
      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="formateur">Par formateur</TabsTrigger>
          <TabsTrigger value="promotion">Par promotion</TabsTrigger>
          <TabsTrigger value="type">Par type</TabsTrigger>
          <TabsTrigger value="semaine">Par semaine</TabsTrigger>
          <TabsTrigger value="semestre">Par semestre</TabsTrigger>
          <TabsTrigger value="ue" data-testid="recap-ue-tab">Par UE</TabsTrigger>
          <TabsTrigger value="graphiques" data-testid="tab-graphiques"><BarChart3 size={14} className="mr-1" />Graphiques</TabsTrigger>
        </TabsList>

        <TabsContent value="formateur">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Formateur</TableHead>
                    <TableHead className="text-xs">Total</TableHead>
                    <TableHead className="text-xs">Detail par type</TableHead>
                    <TableHead className="text-xs">Detail par promo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.par_formateur && Object.entries(data.par_formateur).sort((a, b) => b[1].total - a[1].total).map(([name, info]) => (
                    <TableRow key={name} className="text-sm">
                      <TableCell className="py-2 font-medium">{name}</TableCell>
                      <TableCell className="py-2 font-bold">{info.total.toFixed(1)}h</TableCell>
                      <TableCell className="py-2 text-xs">{Object.entries(info.par_type).map(([t, h]) => `${t}: ${h.toFixed(1)}h`).join(', ')}</TableCell>
                      <TableCell className="py-2 text-xs">{Object.entries(info.par_promo).map(([p, h]) => `${p.replace('Promotion ', '')}: ${h.toFixed(1)}h`).join(', ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="promotion">
          <Card><CardContent className="p-0">
            <Table><TableHeader><TableRow><TableHead>Promotion</TableHead><TableHead>Heures</TableHead></TableRow></TableHeader>
              <TableBody>{data?.par_promotion && Object.entries(data.par_promotion).map(([name, h]) => (
                <TableRow key={name}><TableCell>{name}</TableCell><TableCell className="font-bold">{h.toFixed(1)}h</TableCell></TableRow>
              ))}</TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="type">
          <Card><CardContent className="p-0">
            <Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Heures</TableHead></TableRow></TableHeader>
              <TableBody>{data?.par_type_activite && Object.entries(data.par_type_activite).sort((a, b) => b[1] - a[1]).map(([name, h]) => (
                <TableRow key={name}><TableCell>{name}</TableCell><TableCell className="font-bold">{h.toFixed(1)}h</TableCell></TableRow>
              ))}</TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="semaine">
          <Card><CardContent className="p-0">
            <Table><TableHeader><TableRow><TableHead>Semaine</TableHead><TableHead>Heures</TableHead></TableRow></TableHeader>
              <TableBody>{data?.par_semaine && Object.entries(data.par_semaine).sort((a, b) => Number(a[0]) - Number(b[0])).map(([w, h]) => (
                <TableRow key={w}><TableCell>S{w}</TableCell><TableCell className="font-bold">{h.toFixed(1)}h</TableCell></TableRow>
              ))}</TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="semestre">
          <Card><CardContent className="p-0">
            <Table><TableHeader><TableRow><TableHead>Semestre</TableHead><TableHead>Heures</TableHead></TableRow></TableHeader>
              <TableBody>{data?.par_semestre && Object.entries(data.par_semestre).sort().map(([s, h]) => (
                <TableRow key={s}><TableCell>{s}</TableCell><TableCell className="font-bold">{h.toFixed(1)}h</TableCell></TableRow>
              ))}</TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ue" data-testid="recap-ue-content">
          <Card>
            <CardContent className="p-0">
              {ueData && (
                <div className="px-3 py-2 border-b bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between flex-wrap gap-2 text-xs">
                  <span className="font-semibold">Détail par UE — formule temps formateur : <span className="font-mono text-violet-600">heures × nb_formateurs × nb_groupes</span></span>
                  <div className="flex gap-4">
                    <span>Total heures : <span className="font-bold">{(ueData.total_heures || 0).toFixed(1)}h</span></span>
                    <span>Total temps formateur : <span className="font-bold text-violet-700">{(ueData.total_temps_formateur || 0).toFixed(1)}h</span></span>
                  </div>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>UE</TableHead>
                    <TableHead>Domaine</TableHead>
                    <TableHead className="text-right">Total heures</TableHead>
                    <TableHead>Répartition par type</TableHead>
                    <TableHead className="text-right">Temps formateur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(ueData?.rows || []).map(row => {
                    const expanded = expandedUe[row.ue_id];
                    return (
                      <>
                        <TableRow key={row.ue_id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => setExpandedUe(s => ({ ...s, [row.ue_id]: !s[row.ue_id] }))}>
                          <TableCell className="px-2 text-slate-400">{expanded ? '▾' : '▸'}</TableCell>
                          <TableCell className="font-semibold"><span className="font-mono mr-1.5">{row.ue_code}</span>{row.ue_intitule}</TableCell>
                          <TableCell>
                            {row.domain_nom && <span className="inline-flex items-center gap-1 text-[11px]"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: row.domain_couleur || '#cbd5e1' }} />{row.domain_nom}</span>}
                          </TableCell>
                          <TableCell className="text-right font-bold">{row.total_heures.toFixed(1)}h</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(row.par_type).sort((a, b) => b[1] - a[1]).map(([t, h]) => (
                                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800"><span className="font-semibold">{t}</span> {h.toFixed(1)}h</span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold text-violet-700">{row.total_temps_formateur.toFixed(1)}h</TableCell>
                        </TableRow>
                        {expanded && (
                          <TableRow key={`${row.ue_id}-detail`} className="bg-slate-50/60 dark:bg-slate-900/40">
                            <TableCell></TableCell>
                            <TableCell colSpan={5}>
                              <div className="py-2 space-y-2">
                                <div>
                                  <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">Temps formateur par type</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(row.par_type_tf).sort((a, b) => b[1] - a[1]).map(([t, h]) => (
                                      <span key={t} className="text-[11px] px-2 py-0.5 rounded border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-violet-700"><span className="font-semibold">{t}</span> · {h.toFixed(1)}h</span>
                                    ))}
                                  </div>
                                </div>
                                <details className="text-[11px]">
                                  <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Voir le détail des séances/activités ({row.details.length})</summary>
                                  <table className="w-full mt-2 text-[11px]">
                                    <thead className="text-slate-500"><tr><th className="text-left px-2 py-1">Source</th><th className="text-left">Date</th><th className="text-left">Intitulé</th><th>Type</th><th className="text-right">H</th><th className="text-right">Nb form.</th><th className="text-right">Nb gpes</th><th className="text-right">TF</th></tr></thead>
                                    <tbody>
                                      {row.details.map((d, i) => {
                                        const noForm = !d.nb_formateurs;
                                        const isTPG = d.type === 'TPG';
                                        const dim = noForm || isTPG;
                                        return (
                                        <tr key={i} className={`border-t border-slate-100 dark:border-slate-800 ${dim ? 'text-slate-400 italic' : ''}`}>
                                          <td className="px-2 py-0.5">{d.source === 'session' ? '📅 séance' : '📝 fiche'}</td>
                                          <td>{d.source === 'session' ? (d.date || '—') : '—'}</td>
                                          <td className="truncate max-w-[260px]" title={d.intitule || d.nom || ''}>{d.intitule || d.nom || <span className="text-slate-400">—</span>}</td>
                                          <td className="text-center">{d.type}{isTPG && <span className="ml-1 text-[9px] text-slate-400">(non compté)</span>}</td>
                                          <td className="text-right">{d.heures.toFixed(1)}h</td>
                                          <td className="text-right">{d.nb_formateurs || <span className="text-amber-600" title="Aucun formateur — temps formateur non compté">0</span>}</td>
                                          <td className="text-right">{d.nb_groupes}</td>
                                          <td className={`text-right font-bold ${d.temps_formateur > 0 ? 'text-violet-700' : 'text-slate-400'}`}>{d.temps_formateur.toFixed(1)}h</td>
                                        </tr>
                                      );})}
                                    </tbody>
                                  </table>
                                </details>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                  {(!ueData?.rows || ueData.rows.length === 0) && (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-slate-500 py-6">Aucune donnée sur cette période</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="graphiques" data-testid="graphiques-content">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Heures par formateur (top 12)</CardTitle></CardHeader>
              <CardContent>
                {chartFormateurs.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={chartFormateurs} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                      <ReTooltip formatter={(v) => `${v}h`} />
                      <Bar dataKey="heures" fill="#6366F1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-slate-500 py-4">Aucune donnee</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Repartition par type d'activite</CardTitle></CardHeader>
              <CardContent>
                {chartTypes.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie data={chartTypes} cx="50%" cy="50%" outerRadius={100} innerRadius={40} dataKey="value" paddingAngle={2}
                        label={({ name, value }) => `${name}: ${value}h`} labelLine={true}>
                        {chartTypes.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <ReTooltip formatter={(v) => `${v}h`} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-slate-500 py-4">Aucune donnee</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Heures par promotion</CardTitle></CardHeader>
              <CardContent>
                {chartPromos.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartPromos} margin={{ top: 5, right: 20, left: 0, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <ReTooltip formatter={(v) => `${v}h`} />
                      <Bar dataKey="heures" fill="#34D399" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-slate-500 py-4">Aucune donnee</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Evolution par semaine</CardTitle></CardHeader>
              <CardContent>
                {chartSemaines.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartSemaines} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="semaine" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <ReTooltip formatter={(v) => `${v}h`} />
                      <Line type="monotone" dataKey="heures" stroke="#F43F5E" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-slate-500 py-4">Aucune donnee</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Heures par UE (top 12)</CardTitle></CardHeader>
              <CardContent>
                {chartUes.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={chartUes} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={160} />
                      <ReTooltip formatter={(v) => `${v}h`} />
                      <Bar dataKey="heures" fill="#A78BFA" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-slate-500 py-4">Aucune donnee</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Heures par semestre</CardTitle></CardHeader>
              <CardContent>
                {chartSemestres.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartSemestres} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="semestre" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <ReTooltip formatter={(v) => `${v}h`} />
                      <Bar dataKey="heures" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-slate-500 py-4">Aucune donnee</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
