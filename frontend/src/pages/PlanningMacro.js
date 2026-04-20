import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Edit2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format, addMonths, startOfMonth, endOfMonth, eachWeekOfInterval, startOfWeek, endOfWeek, getWeek } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function PlanningMacro() {
  const { isAdmin } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [actTypes, setActTypes] = useState([]);
  const [ues, setUes] = useState([]);
  const [domains, setDomains] = useState([]);
  const [schoolYears, setSchoolYears] = useState([]);
  const [filterPromo, setFilterPromo] = useState('all');
  const [filterSemestre, setFilterSemestre] = useState('all');
  const [filterDomain, setFilterDomain] = useState('all');
  const [startMonth, setStartMonth] = useState(new Date());
  const [numMonths, setNumMonths] = useState(6);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [showPreSaisie, setShowPreSaisie] = useState(false);
  const [preSaisie, setPreSaisie] = useState(null);

  const months = Array.from({ length: numMonths }, (_, i) => addMonths(startMonth, i));

  const loadData = useCallback(async () => {
    const dateDebut = format(startOfMonth(months[0]), 'yyyy-MM-dd');
    const dateFin = format(endOfMonth(months[months.length - 1]), 'yyyy-MM-dd');
    const params = { date_debut: dateDebut, date_fin: dateFin };
    if (filterPromo !== 'all') params.promotion_id = filterPromo;
    if (filterSemestre !== 'all') params.semestre = filterSemestre;
    if (filterDomain !== 'all') params.domain_id = filterDomain;
    try {
      const [sessRes, prRes, atRes, ueRes, domRes, syRes] = await Promise.all([
        API.get('/sessions', { params }), API.get('/promotions'), API.get('/activity-types'),
        API.get('/ues'), API.get('/domains'), API.get('/school-years')
      ]);
      setSessions(sessRes.data); setPromotions(prRes.data); setActTypes(atRes.data);
      setUes(ueRes.data); setDomains(domRes.data); setSchoolYears(syRes.data);
    } catch (e) { console.error(e); }
  }, [startMonth, numMonths, filterPromo, filterSemestre, filterDomain]);

  useEffect(() => { loadData(); }, [loadData]);

  const atMap = Object.fromEntries(actTypes.map(a => [a.id, a]));
  const ueMap = Object.fromEntries(ues.map(u => [u.id, u]));
  const domMap = Object.fromEntries(domains.map(d => [d.id, d]));
  const promoMap = Object.fromEntries(promotions.map(p => [p.id, p]));

  const getWeeksForMonth = (monthDate) => {
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  };

  const getSessionsForWeek = (weekStart) => {
    const ws = format(weekStart, 'yyyy-MM-dd');
    const we = format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    return sessions.filter(s => s.date >= ws && s.date <= we);
  };

  const groupByUe = (weekSessions) => {
    const grouped = {};
    weekSessions.forEach(s => {
      const ue = ueMap[s.ue_id];
      const key = s.ue_id || 'none';
      if (!grouped[key]) grouped[key] = { ue, sessions: [], types: new Set(), promos: new Set() };
      grouped[key].sessions.push(s);
      grouped[key].types.add(atMap[s.type_activite_id]?.nom || '');
      grouped[key].promos.add(promoMap[s.promotion_id]?.nom || '');
    });
    return grouped;
  };

  const startPreSaisie = (weekStart) => {
    setPreSaisie({
      date: format(weekStart, 'yyyy-MM-dd'),
      intitule: '', type_activite_id: '', ue_id: '', semestre: filterSemestre !== 'all' ? filterSemestre : '',
      promotion_id: filterPromo !== 'all' ? filterPromo : '',
      heure_debut: '08:00', heure_fin: '10:00', formateur_ids: [], site_id: '', statut: 'Prevu', saisi: false
    });
    setShowPreSaisie(true);
  };

  const editPreSaisie = (session) => {
    setPreSaisie({ ...session, formateur_ids: session.formateur_ids || [] });
    setShowPreSaisie(true);
  };

  const savePreSaisie = async () => {
    try {
      if (preSaisie.id) await API.put(`/sessions/${preSaisie.id}`, preSaisie);
      else await API.post('/sessions', preSaisie);
      setShowPreSaisie(false);
      loadData();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-4" data-testid="planning-macro">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Planning macro</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setStartMonth(d => addMonths(d, -1))}><ChevronLeft size={16} /></Button>
          <Button variant="outline" size="sm" onClick={() => setStartMonth(d => addMonths(d, 1))}><ChevronRight size={16} /></Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <Select value={filterPromo} onValueChange={setFilterPromo}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Promotion" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes promotions</SelectItem>
            {promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSemestre} onValueChange={setFilterSemestre}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Semestre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pair">Pairs</SelectItem>
            <SelectItem value="impair">Impairs</SelectItem>
            {["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDomain} onValueChange={setFilterDomain}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Domaine" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous domaines</SelectItem>
            {domains.map(d => <SelectItem key={d.id} value={d.id}>{d.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(numMonths)} onValueChange={v => setNumMonths(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3">3 mois</SelectItem>
            <SelectItem value="6">6 mois</SelectItem>
            <SelectItem value="12">12 mois</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      <Card className="overflow-x-auto">
        <CardContent className="p-0">
          <div className="min-w-[1200px]">
            {/* Month headers */}
            <div className="flex border-b border-slate-200 dark:border-slate-700">
              <div className="w-40 flex-shrink-0 p-2 border-r bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold">UE / Domaine</div>
              {months.map((m, i) => {
                const weeks = getWeeksForMonth(m);
                return (
                  <div key={i} className="flex-1 border-r border-slate-200 dark:border-slate-700">
                    <div className="text-center py-1 bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold capitalize border-b">
                      {format(m, 'MMMM yyyy', { locale: fr })}
                    </div>
                    <div className="flex">
                      {weeks.map((w, wi) => (
                        <div key={wi} className="flex-1 text-center py-0.5 text-[10px] text-slate-400 border-r border-slate-100 dark:border-slate-800">
                          S{getWeek(w, { weekStartsOn: 1 })}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rows - grouped by domain/UE */}
            {domains.map(dom => {
              const domUes = ues.filter(u => u.domain_id === dom.id);
              if (domUes.length === 0) return null;
              return (
                <div key={dom.id}>
                  <div className="flex border-b bg-slate-50 dark:bg-slate-800/30">
                    <div className="w-40 flex-shrink-0 p-1.5 border-r text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{dom.nom}</div>
                    <div className="flex-1" />
                  </div>
                  {domUes.map(ue => (
                    <div key={ue.id} className="flex border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <div className="w-40 flex-shrink-0 p-1.5 border-r text-[10px] text-slate-600 dark:text-slate-400 truncate pl-4">
                        {ue.code_ue} - {ue.intitule}
                      </div>
                      {months.map((m, mi) => {
                        const weeks = getWeeksForMonth(m);
                        return (
                          <div key={mi} className="flex-1 flex border-r border-slate-100 dark:border-slate-800">
                            {weeks.map((w, wi) => {
                              const weekSess = getSessionsForWeek(w).filter(s => s.ue_id === ue.id);
                              return (
                                <div key={wi} className="flex-1 p-0.5 border-r border-slate-50 dark:border-slate-800/50 min-h-[28px] relative"
                                  onClick={() => isAdmin && weekSess.length === 0 && startPreSaisie(w)}>
                                  {weekSess.map(s => {
                                    const at = atMap[s.type_activite_id] || {};
                                    return (
                                      <div key={s.id}
                                        className="text-[8px] px-1 py-0.5 rounded mb-0.5 cursor-pointer truncate"
                                        style={{ backgroundColor: (at.couleur || '#94a3b8') + '30', borderLeft: `2px solid ${at.couleur || '#94a3b8'}` }}
                                        onClick={(e) => { e.stopPropagation(); isAdmin && editPreSaisie(s); }}
                                        onMouseEnter={() => setHoveredItem(s)}
                                        onMouseLeave={() => setHoveredItem(null)}>
                                        {at.nom}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Hover tooltip */}
      {hoveredItem && (
        <div className="fixed z-50 bg-white dark:bg-slate-800 border rounded-lg shadow-xl p-3 w-64 pointer-events-none tooltip-enter"
          style={{ left: '50%', bottom: '20px', transform: 'translateX(-50%)' }}>
          <p className="font-semibold text-sm">{atMap[hoveredItem.type_activite_id]?.nom} {hoveredItem.intitule ? `- ${hoveredItem.intitule}` : ''}</p>
          <p className="text-xs text-slate-500">UE: {ueMap[hoveredItem.ue_id]?.code_ue} - {ueMap[hoveredItem.ue_id]?.intitule}</p>
          <p className="text-xs text-slate-500">Domaine: {domMap[hoveredItem.domain_id]?.nom}</p>
          <p className="text-xs text-slate-500">Promotion: {promoMap[hoveredItem.promotion_id]?.nom}</p>
          <p className="text-xs text-slate-500">{hoveredItem.date} {hoveredItem.heure_debut}-{hoveredItem.heure_fin}</p>
          <p className="text-xs text-slate-500">Semestre: {hoveredItem.semestre}</p>
        </div>
      )}

      {/* Pre-saisie Dialog */}
      <Dialog open={showPreSaisie} onOpenChange={setShowPreSaisie}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{preSaisie?.id ? 'Modifier' : 'Pre-saisie de cours'}</DialogTitle></DialogHeader>
          {preSaisie && (
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date</Label><Input type="date" value={preSaisie.date || ''} onChange={e => setPreSaisie({ ...preSaisie, date: e.target.value })} /></div>
              <div><Label>Intitule</Label><Input value={preSaisie.intitule || ''} onChange={e => setPreSaisie({ ...preSaisie, intitule: e.target.value })} /></div>
              <div>
                <Label>Type</Label>
                <Select value={preSaisie.type_activite_id || ''} onValueChange={v => setPreSaisie({ ...preSaisie, type_activite_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{actTypes.map(a => <SelectItem key={a.id} value={a.id}>{a.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Promotion</Label>
                <Select value={preSaisie.promotion_id || ''} onValueChange={v => setPreSaisie({ ...preSaisie, promotion_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>UE</Label>
                <Select value={preSaisie.ue_id || ''} onValueChange={v => setPreSaisie({ ...preSaisie, ue_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{ues.map(u => <SelectItem key={u.id} value={u.id}>{u.code_ue} - {u.intitule}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Semestre</Label>
                <Select value={preSaisie.semestre || ''} onValueChange={v => setPreSaisie({ ...preSaisie, semestre: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowPreSaisie(false)}>Annuler</Button>
                <Button onClick={savePreSaisie}>Enregistrer</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
