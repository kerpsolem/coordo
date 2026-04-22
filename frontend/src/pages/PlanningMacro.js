import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, GripVertical } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format, startOfMonth, endOfMonth, eachWeekOfInterval, endOfWeek, getWeek } from 'date-fns';
import { fr } from 'date-fns/locale';

const MONTH_NAMES = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];

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
  const [selectedDomains, setSelectedDomains] = useState(new Set());
  const [startYear, setStartYear] = useState(new Date().getFullYear());
  const [selectedMonths, setSelectedMonths] = useState([8,9,10,11,0,1,2,3,4,5]);
  const [zoom, setZoom] = useState(1);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [showPreSaisie, setShowPreSaisie] = useState(false);
  const [preSaisie, setPreSaisie] = useState(null);
  const [dragSession, setDragSession] = useState(null);
  const [dragOverWeek, setDragOverWeek] = useState(null);

  const months = selectedMonths.map(m => new Date(m >= 8 ? startYear : startYear + 1, m, 1));

  const loadData = useCallback(async () => {
    if (months.length === 0) return;
    const dateDebut = format(startOfMonth(months[0]), 'yyyy-MM-dd');
    const dateFin = format(endOfMonth(months[months.length - 1]), 'yyyy-MM-dd');
    const params = { date_debut: dateDebut, date_fin: dateFin };
    if (filterPromo !== 'all') params.promotion_id = filterPromo;
    if (filterSemestre !== 'all') params.semestre = filterSemestre;
    try {
      const [sessRes, prRes, atRes, ueRes, domRes, syRes] = await Promise.all([
        API.get('/sessions', { params }), API.get('/promotions'), API.get('/activity-types'),
        API.get('/ues'), API.get('/domains'), API.get('/school-years')
      ]);
      setSessions(sessRes.data); setPromotions(prRes.data); setActTypes(atRes.data);
      setUes(ueRes.data); setDomains(domRes.data); setSchoolYears(syRes.data);
    } catch (e) { console.error(e); }
  }, [startYear, selectedMonths, filterPromo, filterSemestre]);

  useEffect(() => { loadData(); }, [loadData]);

  const atMap = Object.fromEntries(actTypes.map(a => [a.id, a]));
  const ueMap = Object.fromEntries(ues.map(u => [u.id, u]));
  const domMap = Object.fromEntries(domains.map(d => [d.id, d]));
  const promoMap = Object.fromEntries(promotions.map(p => [p.id, p]));

  const getWeeksForMonth = (md) => eachWeekOfInterval({ start: startOfMonth(md), end: endOfMonth(md) }, { weekStartsOn: 1 });
  const getSessionsForWeek = (ws) => {
    const s = format(ws, 'yyyy-MM-dd'), e = format(endOfWeek(ws, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    return sessions.filter(x => x.date >= s && x.date <= e);
  };

  const hoursByUe = {};
  sessions.forEach(s => {
    const uid = s.ue_id || 'none';
    const tname = atMap[s.type_activite_id]?.nom || '?';
    if (!hoursByUe[uid]) hoursByUe[uid] = {};
    hoursByUe[uid][tname] = (hoursByUe[uid][tname] || 0) + (s.duree || 0);
  });

  const toggleMonth = (m) => {
    setSelectedMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m].sort((a, b) => {
      const oa = a >= 8 ? a - 8 : a + 4; const ob = b >= 8 ? b - 8 : b + 4; return oa - ob;
    }));
  };

  const toggleDomain = (did) => {
    const next = new Set(selectedDomains);
    if (next.has(did)) next.delete(did); else next.add(did);
    setSelectedDomains(next);
  };

  const visibleDomains = selectedDomains.size === 0 ? domains : domains.filter(d => selectedDomains.has(d.id));

  const startPreSaisie = (weekStart, ueId) => {
    setHoveredItem(null);
    setPreSaisie({
      date: format(weekStart, 'yyyy-MM-dd'), intitule: '', type_activite_id: '',
      ue_id: ueId || '', semestre: filterSemestre !== 'all' ? filterSemestre : '',
      promotion_id: filterPromo !== 'all' ? filterPromo : '',
      heure_debut: '', heure_fin: '', formateur_ids: [], site_id: '', statut: 'Prevu', saisi: false
    });
    setShowPreSaisie(true);
  };

  const editPreSaisie = (session) => {
    setHoveredItem(null);
    setPreSaisie({ ...session, formateur_ids: session.formateur_ids || [] });
    setShowPreSaisie(true);
  };

  const savePreSaisie = async () => {
    try {
      const data = { ...preSaisie };
      if (!data.heure_debut) data.heure_debut = '08:00';
      if (!data.heure_fin) data.heure_fin = '10:00';
      if (preSaisie.id) await API.put(`/sessions/${preSaisie.id}`, data);
      else await API.post('/sessions', data);
      setShowPreSaisie(false); loadData();
    } catch (e) { console.error(e); }
  };

  const handleHover = (e, s) => {
    if (dragSession) return;
    const r = e.currentTarget.getBoundingClientRect();
    setHoverPos({ x: Math.min(r.right + 8, window.innerWidth - 300), y: Math.max(10, r.top - 60) });
    setHoveredItem(s);
  };

  // Drag & drop between weeks
  const handleDragStart = (e, session) => {
    if (!isAdmin) return;
    e.dataTransfer.effectAllowed = 'move';
    setDragSession(session);
    setHoveredItem(null);
  };

  const handleDragOver = (e, weekStart) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverWeek(format(weekStart, 'yyyy-MM-dd'));
  };

  const handleDrop = (e, weekStart) => {
    e.preventDefault();
    if (!dragSession) return;
    const newDate = format(weekStart, 'yyyy-MM-dd');
    setDragOverWeek(null);
    // Open edit dialog with new date pre-filled
    setPreSaisie({ ...dragSession, date: newDate, formateur_ids: dragSession.formateur_ids || [] });
    setShowPreSaisie(true);
    setDragSession(null);
  };

  const handleDragEnd = () => { setDragSession(null); setDragOverWeek(null); };

  // Zoom sizes
  const baseFontUe = 10 * zoom;
  const baseFontCell = 7 * zoom;
  const colLeft = Math.round(140 * zoom);
  const colHours = Math.round(80 * zoom);
  const cellMinH = Math.round(24 * zoom);
  const minWidth = Math.round(1000 * zoom);

  return (
    <div className="space-y-3" data-testid="planning-macro">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Planning macro</h1>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={() => setZoom(z => Math.max(0.6, z - 0.1))} data-testid="zoom-out"><ZoomOut size={16} /></Button>
          <span className="text-xs font-medium w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="sm" onClick={() => setZoom(z => Math.min(1.8, z + 0.1))} data-testid="zoom-in"><ZoomIn size={16} /></Button>
          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
          <Button variant="outline" size="sm" onClick={() => setStartYear(y => y - 1)}><ChevronLeft size={16} /></Button>
          <span className="text-sm font-semibold">{startYear}-{startYear + 1}</span>
          <Button variant="outline" size="sm" onClick={() => setStartYear(y => y + 1)}><ChevronRight size={16} /></Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filterPromo} onValueChange={setFilterPromo}>
          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Promotion" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes promotions</SelectItem>
            {promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSemestre} onValueChange={setFilterSemestre}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Semestre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pair">Pairs</SelectItem>
            <SelectItem value="impair">Impairs</SelectItem>
            {["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Domain selector */}
      <div className="flex flex-wrap gap-1 items-center">
        <span className="text-[10px] text-slate-500 font-medium mr-1">Domaines :</span>
        <button onClick={() => setSelectedDomains(new Set())}
          className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors
            ${selectedDomains.size === 0 ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent' : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'}`}
          data-testid="domain-all">Tous</button>
        {domains.map(d => (
          <button key={d.id} onClick={() => toggleDomain(d.id)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors
              ${selectedDomains.has(d.id) ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent' : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'}`}
            data-testid={`domain-${d.id}`}>
            {d.nom.length > 12 ? d.nom.slice(0, 12) + '...' : d.nom}
          </button>
        ))}
      </div>

      {/* Month selector */}
      <div className="flex flex-wrap gap-1 items-center">
        <span className="text-[10px] text-slate-500 font-medium mr-1">Mois :</span>
        {[8,9,10,11,0,1,2,3,4,5,6,7].map(m => (
          <button key={m} onClick={() => toggleMonth(m)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors
              ${selectedMonths.includes(m) ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent' : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'}`}
            data-testid={`month-toggle-${m}`}>
            {MONTH_NAMES[m].slice(0, 4)}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <Card className="overflow-x-auto">
        <div className="p-0" style={{ minWidth: minWidth }}>
          {/* Month headers */}
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            <div className="flex-shrink-0 p-1.5 border-r bg-slate-50 dark:bg-slate-800/50 font-semibold" style={{ width: colLeft, fontSize: baseFontUe }}>UE / Domaine</div>
            <div className="flex-shrink-0 p-1.5 border-r bg-slate-50 dark:bg-slate-800/50 font-semibold text-center" style={{ width: colHours, fontSize: baseFontUe }}>Heures</div>
            {months.map((m, i) => {
              const weeks = getWeeksForMonth(m);
              return (
                <div key={i} className="flex-1 border-r border-slate-200 dark:border-slate-700 min-w-0">
                  <div className="text-center py-1 bg-slate-50 dark:bg-slate-800/50 font-semibold capitalize border-b" style={{ fontSize: baseFontUe }}>
                    {format(m, 'MMM yyyy', { locale: fr })}
                  </div>
                  <div className="flex">
                    {weeks.map((w, wi) => (
                      <div key={wi} className="flex-1 text-center py-0.5 text-slate-400 border-r border-slate-100 dark:border-slate-800" style={{ fontSize: baseFontCell + 1 }}>
                        S{getWeek(w, { weekStartsOn: 1 })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rows by domain */}
          {visibleDomains.map(dom => {
            const domUes = ues.filter(u => u.domain_id === dom.id);
            if (domUes.length === 0) return null;
            return (
              <div key={dom.id}>
                <div className="flex border-b bg-slate-50 dark:bg-slate-800/30">
                  <div className="flex-shrink-0 p-1 border-r font-semibold text-slate-700 dark:text-slate-300 truncate" style={{ width: colLeft, fontSize: baseFontUe }}>{dom.nom}</div>
                  <div className="flex-shrink-0 border-r" style={{ width: colHours }} />
                  <div className="flex-1" />
                </div>
                {domUes.map(ue => {
                  const ueHours = hoursByUe[ue.id] || {};
                  return (
                    <div key={ue.id} className="flex border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <div className="flex-shrink-0 p-1 border-r text-slate-600 dark:text-slate-400 truncate pl-3" style={{ width: colLeft, fontSize: baseFontUe - 1 }}
                        title={`${ue.code_ue} - ${ue.intitule}`}>
                        {ue.code_ue} - {ue.intitule}
                      </div>
                      <div className="flex-shrink-0 p-0.5 border-r text-slate-500 leading-tight" style={{ width: colHours, fontSize: baseFontCell + 1 }}>
                        {Object.entries(ueHours).map(([t, h]) => (
                          <div key={t}><span className="font-medium">{t}</span>:{h.toFixed(0)}h</div>
                        ))}
                      </div>
                      {months.map((m, mi) => {
                        const weeks = getWeeksForMonth(m);
                        return (
                          <div key={mi} className="flex-1 flex border-r border-slate-100 dark:border-slate-800 min-w-0">
                            {weeks.map((w, wi) => {
                              const weekSess = getSessionsForWeek(w).filter(s => s.ue_id === ue.id);
                              const weekKey = format(w, 'yyyy-MM-dd');
                              const isDropTarget = dragOverWeek === weekKey && dragSession?.ue_id === ue.id;
                              return (
                                <div key={wi}
                                  className={`flex-1 p-0.5 border-r border-slate-50 dark:border-slate-800/50 cursor-pointer relative transition-colors
                                    ${isDropTarget ? 'bg-blue-100 dark:bg-blue-900/30' : ''}`}
                                  style={{ minHeight: cellMinH }}
                                  onClick={() => isAdmin && startPreSaisie(w, ue.id)}
                                  onDragOver={(e) => handleDragOver(e, w)}
                                  onDrop={(e) => handleDrop(e, w)}>
                                  {weekSess.map(s => {
                                    const at = atMap[s.type_activite_id] || {};
                                    return (
                                      <div key={s.id}
                                        draggable={isAdmin}
                                        onDragStart={(e) => handleDragStart(e, s)}
                                        onDragEnd={handleDragEnd}
                                        className="px-0.5 py-0.5 rounded mb-0.5 cursor-grab active:cursor-grabbing truncate"
                                        style={{ fontSize: baseFontCell, backgroundColor: (at.couleur || '#94a3b8') + '30', borderLeft: `2px solid ${at.couleur || '#94a3b8'}` }}
                                        onClick={(e) => { e.stopPropagation(); isAdmin && editPreSaisie(s); }}
                                        onMouseEnter={(e) => handleHover(e, s)}
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
                  );
                })}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Hover tooltip */}
      {hoveredItem && !showPreSaisie && !dragSession && (
        <div className="fixed z-[100] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl p-3 w-64 pointer-events-none tooltip-enter"
          style={{ left: hoverPos.x, top: hoverPos.y }}>
          <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-slate-200 dark:border-slate-700">
            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: atMap[hoveredItem.type_activite_id]?.couleur }} />
            <span className="font-bold text-xs">{atMap[hoveredItem.type_activite_id]?.nom}</span>
            <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700">{hoveredItem.semestre}</span>
          </div>
          {hoveredItem.intitule && <p className="text-xs font-medium mb-1">{hoveredItem.intitule}</p>}
          <div className="space-y-0.5 text-[10px]">
            <div className="flex justify-between"><span className="text-slate-500">UE</span><span>{ueMap[hoveredItem.ue_id]?.code_ue} - {ueMap[hoveredItem.ue_id]?.intitule}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Domaine</span><span>{domMap[hoveredItem.domain_id]?.nom}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Promotion</span><span>{promoMap[hoveredItem.promotion_id]?.nom}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Date</span><span>{hoveredItem.date}</span></div>
            {hoveredItem.heure_debut && <div className="flex justify-between"><span className="text-slate-500">Horaires</span><span>{hoveredItem.heure_debut}-{hoveredItem.heure_fin}</span></div>}
          </div>
        </div>
      )}

      {/* Drag indicator */}
      {dragSession && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] bg-blue-600 text-white px-4 py-2 rounded-lg shadow-xl text-sm font-medium">
          Deplacez vers une autre semaine puis validez
        </div>
      )}

      {/* Pre-saisie Dialog */}
      <Dialog open={showPreSaisie} onOpenChange={setShowPreSaisie}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{preSaisie?.id ? 'Modifier la seance' : 'Pre-saisie de cours'}</DialogTitle></DialogHeader>
          {preSaisie && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Date</Label><Input type="date" className="h-8 text-sm" value={preSaisie.date || ''} onChange={e => setPreSaisie({ ...preSaisie, date: e.target.value })} /></div>
              <div><Label className="text-xs">Intitule</Label><Input className="h-8 text-sm" value={preSaisie.intitule || ''} onChange={e => setPreSaisie({ ...preSaisie, intitule: e.target.value })} /></div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={preSaisie.type_activite_id || ''} onValueChange={v => setPreSaisie({ ...preSaisie, type_activite_id: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{actTypes.map(a => <SelectItem key={a.id} value={a.id}>{a.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Promotion</Label>
                <Select value={preSaisie.promotion_id || ''} onValueChange={v => setPreSaisie({ ...preSaisie, promotion_id: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">UE</Label>
                <Select value={preSaisie.ue_id || ''} onValueChange={v => setPreSaisie({ ...preSaisie, ue_id: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{ues.map(u => <SelectItem key={u.id} value={u.id}>{u.code_ue} - {u.intitule}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Semestre</Label>
                <Select value={preSaisie.semestre || ''} onValueChange={v => setPreSaisie({ ...preSaisie, semestre: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Heure debut (optionnel)</Label><Input type="time" className="h-8 text-sm" value={preSaisie.heure_debut || ''} onChange={e => setPreSaisie({ ...preSaisie, heure_debut: e.target.value })} /></div>
              <div><Label className="text-xs">Heure fin (optionnel)</Label><Input type="time" className="h-8 text-sm" value={preSaisie.heure_fin || ''} onChange={e => setPreSaisie({ ...preSaisie, heure_fin: e.target.value })} /></div>
              <div className="col-span-2 flex justify-between pt-2 border-t">
                {preSaisie.id && (
                  <Button variant="destructive" size="sm" className="text-xs" onClick={async () => {
                    if (!window.confirm('Supprimer ?')) return;
                    try { await API.delete(`/sessions/${preSaisie.id}`); setShowPreSaisie(false); loadData(); } catch {}
                  }}>Supprimer</Button>
                )}
                <div className="flex gap-2 ml-auto">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowPreSaisie(false)}>Annuler</Button>
                  <Button size="sm" className="text-xs" onClick={savePreSaisie} data-testid="save-presaisie">Enregistrer</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
