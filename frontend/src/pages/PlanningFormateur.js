import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Clock, Users, BarChart3 } from 'lucide-react';
import { filterCls } from '../lib/filterCls';
import { format, startOfWeek, endOfWeek, addWeeks, getWeek, startOfMonth, endOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function PlanningFormateur() {
  const [formateurs, setFormateurs] = useState([]);
  const [selectedFormateur, setSelectedFormateur] = useState('');
  const [sessions, setSessions] = useState([]);
  const [actTypes, setActTypes] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [copyAttrs, setCopyAttrs] = useState([]);
  const [ues, setUes] = useState([]);
  const [workload, setWorkload] = useState(null);
  const [schoolYears, setSchoolYears] = useState([]);
  const [period, setPeriod] = useState('mois');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [filterSemestre, setFilterSemestre] = useState('all');
  const [filterAnneeSco, setFilterAnneeSco] = useState('all');

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

  useEffect(() => {
    API.get('/formateurs').then(r => setFormateurs(r.data));
    API.get('/activity-types').then(r => setActTypes(r.data));
    API.get('/promotions').then(r => setPromotions(r.data));
    API.get('/ues').then(r => setUes(r.data));
    API.get('/school-years').then(r => {
      setSchoolYears(r.data);
      const today = new Date().toISOString().slice(0, 10);
      const current = r.data.find(s => s.date_debut && s.date_fin && s.date_debut <= today && today <= s.date_fin);
      if (current) setFilterAnneeSco(current.id);
    });
  }, []);

  const fetchData = useCallback(async () => {
    if (!selectedFormateur) return;
    const dd = dateDebut, df = dateFin;
    if (!dd || !df) return;
    const params = { formateur_id: selectedFormateur, date_debut: dd, date_fin: df };
    if (filterSemestre !== 'all') params.semestre = filterSemestre;
    if (filterAnneeSco !== 'all') params.annee_scolaire_id = filterAnneeSco;
    try {
      const [sessRes, cpRes, wlRes] = await Promise.all([
        API.get('/sessions', { params }),
        API.get('/copy-attributions', { params: { formateur_id: selectedFormateur } }),
        API.get('/workload', { params: { date_debut: dd, date_fin: df, semestre: filterSemestre !== 'all' ? filterSemestre : undefined } })
      ]);
      setSessions(sessRes.data);
      setCopyAttrs(cpRes.data);
      setWorkload(wlRes.data);
    } catch (e) { console.error(e); }
  }, [selectedFormateur, dateDebut, dateFin, filterSemestre, filterAnneeSco]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const atMap = Object.fromEntries(actTypes.map(a => [a.id, a]));
  const prMap = Object.fromEntries(promotions.map(p => [p.id, p]));
  const ueMap = Object.fromEntries(ues.map(u => [u.id, u]));
  const fmMap = Object.fromEntries(formateurs.map(f => [f.id, f]));

  const totalHeures = sessions.reduce((s, ss) => s + (ss.duree || 0), 0);
  const heuresParType = {};
  const heuresParPromo = {};
  sessions.forEach(s => {
    const tname = atMap[s.type_activite_id]?.nom || 'Autre';
    const pname = prMap[s.promotion_id]?.nom || 'Autre';
    heuresParType[tname] = (heuresParType[tname] || 0) + (s.duree || 0);
    heuresParPromo[pname] = (heuresParPromo[pname] || 0) + (s.duree || 0);
  });

  const selectedFm = fmMap[selectedFormateur];

  return (
    <div className="space-y-4" data-testid="planning-formateur">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Par formateur</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">Formateur</Label>
          <Select value={selectedFormateur} onValueChange={setSelectedFormateur}>
            <SelectTrigger className={filterCls(selectedFormateur, 'w-52')} data-testid="select-formateur"><SelectValue placeholder="Choisir un formateur" /></SelectTrigger>
            <SelectContent>{formateurs.map(f => <SelectItem key={f.id} value={f.id}>{f.initiales} - {f.prenom} {f.nom}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Periode</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="filter-active w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="semaine">Semaine</SelectItem>
              <SelectItem value="mois">Mois</SelectItem>
              <SelectItem value="custom">Personnalise</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Du</Label><Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">Au</Label><Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="w-40" /></div>
        <Select value={filterSemestre} onValueChange={setFilterSemestre}>
          <SelectTrigger className={filterCls(filterSemestre, 'w-36')}><SelectValue placeholder="Semestre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pair">Pairs (S2,S4,S6)</SelectItem>
            <SelectItem value="impair">Impairs (S1,S3,S5)</SelectItem>
            {["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAnneeSco} onValueChange={setFilterAnneeSco}>
          <SelectTrigger className={filterCls(filterAnneeSco, 'w-40')}><SelectValue placeholder="Annee scolaire" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes annees</SelectItem>
            {schoolYears.map(sy => <SelectItem key={sy.id} value={sy.id}>{sy.nom}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {selectedFormateur && (
        <>
          {/* Formateur Info + KPI cards */}
          {selectedFm && (
            <Card>
              <CardContent className="py-3 flex items-center gap-6">
                <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-lg font-bold">{selectedFm.initiales}</div>
                <div>
                  <p className="font-semibold">{selectedFm.prenom} {selectedFm.nom}</p>
                  <p className="text-xs text-slate-500">{selectedFm.statut} - Quotite: {selectedFm.quotite}%</p>
                </div>
                <div className="ml-auto flex gap-6">
                  <div className="text-center">
                    <p className="text-xl font-bold" style={{ fontFamily: 'Outfit' }}>{totalHeures.toFixed(1)}h</p>
                    <p className="text-xs text-slate-500">Total heures</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold" style={{ fontFamily: 'Outfit' }}>{sessions.length}</p>
                    <p className="text-xs text-slate-500">Seances</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* KPI cards: Volume global / Volume théorique formateur / Heures assignées / Écart */}
          {workload && (() => {
            const myWl = (workload.formateurs || []).find(f => f.formateur_id === selectedFormateur);
            const ecart = myWl?.ecart ?? 0;
            const ref = myWl?.reference ?? 0;
            const heuresAss = myWl?.heures_cours ?? 0;
            const statut = myWl?.statut ?? 'equilibre';
            return (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="formateur-kpi">
                <Card className="border-coral-200">
                  <CardContent className="py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Volume global cours à pourvoir</p>
                    <p className="text-2xl font-extrabold mt-1" style={{ fontFamily: 'Outfit' }}>{(workload.total_cours_assignees ?? 0).toFixed(1)}h</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">durée × formateurs réels ou prévus · période</p>
                  </CardContent>
                </Card>
                <Card className={`${workload.heures_a_pourvoir > 0 ? 'border-red-300 bg-red-50/30' : 'border-emerald-200'}`} data-testid="kpi-a-pourvoir-formateur">
                  <CardContent className="py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Heures totales à pourvoir</p>
                    <p className={`text-2xl font-extrabold mt-1 ${workload.heures_a_pourvoir > 0 ? 'text-red-600' : 'text-emerald-700'}`} style={{ fontFamily: 'Outfit' }}>{(workload.heures_a_pourvoir ?? 0).toFixed(1)}h</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">séances incomplètes (formateurs manquants)</p>
                  </CardContent>
                </Card>
                <Card className="border-blue-200">
                  <CardContent className="py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Volume théorique du formateur</p>
                    <p className="text-2xl font-extrabold mt-1 text-blue-700" style={{ fontFamily: 'Outfit' }}>{ref.toFixed(1)}h</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">volume global × quotité {selectedFm?.quotite || 100}% / capacité totale</p>
                  </CardContent>
                </Card>
                <Card className="border-emerald-200">
                  <CardContent className="py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Heures réellement assignées (cours)</p>
                    <p className="text-2xl font-extrabold mt-1 text-emerald-700" style={{ fontFamily: 'Outfit' }}>{heuresAss.toFixed(1)}h</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">selon types « en cours » dans /administration</p>
                  </CardContent>
                </Card>
                <Card className={statut === 'surcharge' ? 'border-red-300 bg-red-50/40 dark:bg-red-900/10' : statut === 'sous-charge' ? 'border-blue-300 bg-blue-50/40 dark:bg-blue-900/10' : 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-900/10'}>
                  <CardContent className="py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Écart</p>
                    <p className={`text-2xl font-extrabold mt-1 ${statut === 'surcharge' ? 'text-red-600' : statut === 'sous-charge' ? 'text-blue-600' : 'text-emerald-700'}`} style={{ fontFamily: 'Outfit' }}>
                      {ecart > 0 ? '+' : ''}{ecart.toFixed(1)}h
                    </p>
                    <p className={`text-[10px] mt-0.5 capitalize font-semibold ${statut === 'surcharge' ? 'text-red-600' : statut === 'sous-charge' ? 'text-blue-600' : 'text-emerald-700'}`}>{statut}</p>
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          {/* Hours breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 size={14} />Heures par type</CardTitle></CardHeader>
              <CardContent>
                {Object.entries(heuresParType).sort((a, b) => b[1] - a[1]).map(([type, h]) => (
                  <div key={type} className="flex items-center justify-between py-1">
                    <span className="text-sm">{type}</span><span className="text-sm font-semibold">{h.toFixed(1)}h</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users size={14} />Heures par promotion</CardTitle></CardHeader>
              <CardContent>
                {Object.entries(heuresParPromo).map(([promo, h]) => (
                  <div key={promo} className="flex items-center justify-between py-1">
                    <span className="text-sm">{promo}</span><span className="text-sm font-semibold">{h.toFixed(1)}h</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Copies */}
          {copyAttrs.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Attribution des copies</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">Semestre</TableHead><TableHead className="text-xs">UE</TableHead>
                    <TableHead className="text-xs">Type</TableHead><TableHead className="text-xs">Copies</TableHead><TableHead className="text-xs">Heures</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {copyAttrs.map(c => (
                      <TableRow key={c.id} className="text-xs">
                        <TableCell>{c.semestre}</TableCell>
                        <TableCell>{ueMap[c.ue_id]?.code_ue} - {ueMap[c.ue_id]?.intitule}</TableCell>
                        <TableCell>{c.type_evaluation}</TableCell>
                        <TableCell className="font-semibold">{c.nombre_copies}</TableCell>
                        <TableCell>{c.volume_horaire}h</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Workload table */}
          {workload && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Tableau de charge comparative</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">Formateur</TableHead><TableHead className="text-xs">Quotite</TableHead>
                    <TableHead className="text-xs">Heures cours</TableHead><TableHead className="text-xs">Reference</TableHead>
                    <TableHead className="text-xs">Ecart</TableHead><TableHead className="text-xs">Statut</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {workload.formateurs?.map(f => (
                      <TableRow key={f.formateur_id} className={`text-xs ${f.formateur_id === selectedFormateur ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
                        <TableCell className="font-medium">{f.initiales} - {f.prenom} {f.nom}</TableCell>
                        <TableCell>{f.quotite}%</TableCell>
                        <TableCell className="font-semibold">{f.heures_cours}h</TableCell>
                        <TableCell>{f.reference}h</TableCell>
                        <TableCell className={f.ecart > 0 ? 'text-red-600' : f.ecart < 0 ? 'text-blue-600' : ''}>{f.ecart > 0 ? '+' : ''}{f.ecart}h</TableCell>
                        <TableCell>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium
                            ${f.statut === 'surcharge' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                              f.statut === 'sous-charge' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                            {f.statut}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Sessions list */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Seances planifiees</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Horaires</TableHead>
                  <TableHead className="text-xs">Intitule</TableHead><TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Promotion</TableHead><TableHead className="text-xs">UE</TableHead>
                  <TableHead className="text-xs">Statut</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {sessions.map(s => (
                    <TableRow key={s.id} className="text-xs">
                      <TableCell>{s.date}</TableCell>
                      <TableCell>{s.heure_debut}-{s.heure_fin}</TableCell>
                      <TableCell>{s.intitule}</TableCell>
                      <TableCell>{atMap[s.type_activite_id]?.nom}</TableCell>
                      <TableCell>{prMap[s.promotion_id]?.nom?.replace('Promotion ', '')}</TableCell>
                      <TableCell>{ueMap[s.ue_id]?.code_ue}</TableCell>
                      <TableCell>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${s.statut === 'Valide' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{s.statut}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {sessions.length === 0 && <p className="text-center py-6 text-sm text-slate-500">Aucune seance sur cette periode</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
