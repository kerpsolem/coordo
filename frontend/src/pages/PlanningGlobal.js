import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { ChevronLeft, ChevronRight, Plus, Check, Edit2, Columns, FileDown } from 'lucide-react';
import { format, addDays, startOfWeek, getWeek, addWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';

function timeToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
const START_MIN = 7 * 60 + 30;
const END_MIN = 18 * 60;
const TOTAL_MIN = END_MIN - START_MIN;
const PX_PER_MIN = 1.2;
const GRID_H = Math.round(TOTAL_MIN * PX_PER_MIN);

export default function PlanningGlobal() {
  const { isAdmin } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [actTypes, setActTypes] = useState([]);
  const [ues, setUes] = useState([]);
  const [domains, setDomains] = useState([]);
  const [sites, setSites] = useState([]);
  const [groups, setGroups] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sideByView, setSideByView] = useState(false);
  const [filterPromo, setFilterPromo] = useState('all');
  const [filterSemestre, setFilterSemestre] = useState('all');
  const [editSession, setEditSession] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [hoveredSession, setHoveredSession] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekNum = getWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  const loadData = useCallback(async () => {
    const dateDebut = format(days[0], 'yyyy-MM-dd');
    const dateFin = format(days[4], 'yyyy-MM-dd');
    const params = { date_debut: dateDebut, date_fin: dateFin };
    if (filterPromo !== 'all') params.promotion_id = filterPromo;
    if (filterSemestre !== 'all') params.semestre = filterSemestre;
    try {
      const [sessR, absR, proR, fmR, atR, ueR, domR, sitR, grpR] = await Promise.all([
        API.get('/sessions', { params }), API.get('/absences/for-period', { params: { date_debut: dateDebut, date_fin: dateFin } }),
        API.get('/promotions'), API.get('/formateurs'), API.get('/activity-types'),
        API.get('/ues'), API.get('/domains'), API.get('/sites'), API.get('/groups')
      ]);
      setSessions(sessR.data); setAbsences(absR.data); setPromotions(proR.data); setFormateurs(fmR.data);
      setActTypes(atR.data); setUes(ueR.data); setDomains(domR.data); setSites(sitR.data); setGroups(grpR.data);
    } catch (e) { console.error(e); }
  }, [currentDate, filterPromo, filterSemestre]);

  useEffect(() => { loadData(); }, [loadData]);

  const mk = (a) => Object.fromEntries(a.map(x => [x.id, x]));
  const promoMap = mk(promotions), fmMap = mk(formateurs), atMap = mk(actTypes);
  const ueMap = mk(ues), domMap = mk(domains), siteMap = mk(sites), grpMap = mk(groups);

  const prevWeek = () => setCurrentDate(d => addWeeks(d, -1));
  const nextWeek = () => setCurrentDate(d => addWeeks(d, 1));
  const displayPromos = filterPromo === 'all' ? promotions : promotions.filter(p => p.id === filterPromo);
  const getAbsForDay = (dayStr) => [...new Set(absences.filter(a => a.date === dayStr).map(a => a.formateur_initiales))];

  const startEdit = (s) => { setEditSession({ ...s, formateur_ids: s.formateur_ids || [] }); setShowDialog(true); };
  const startNew = (dayStr, hour) => {
    const hEnd = hour ? `${String(Math.min(parseInt(hour.split(':')[0]) + 2, 18)).padStart(2, '0')}:${hour.split(':')[1]}` : '10:00';
    setEditSession({ date: dayStr, heure_debut: hour || '08:00', heure_fin: hEnd, type_activite_id: '', promotion_id: filterPromo !== 'all' ? filterPromo : '',
      group_id: '', ue_id: '', semestre: '', formateur_ids: [], site_id: '', statut: 'Prevu', saisi: false, commentaire: '', intitule: '' });
    setShowDialog(true);
  };
  const saveSession = async () => {
    try {
      if (editSession.id) await API.put(`/sessions/${editSession.id}`, editSession);
      else await API.post('/sessions', editSession);
      setShowDialog(false); loadData();
    } catch (e) { console.error(e); }
  };
  const duplicateSession = async (id) => { try { await API.post(`/sessions/${id}/duplicate`); loadData(); } catch (e) { console.error(e); } };
  const deleteSession = async (id) => { if (!window.confirm('Supprimer cette seance ?')) return; try { await API.delete(`/sessions/${id}`); setShowDialog(false); loadData(); } catch (e) { console.error(e); } };
  const toggleField = async (id, field, value) => { try { await API.patch(`/sessions/${id}/toggle`, { field, value }); loadData(); } catch (e) { console.error(e); } };

  const handleMouseEnter = (e, s) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: Math.min(r.right + 8, window.innerWidth - 320), y: Math.min(r.top, window.innerHeight - 320) });
    setHoveredSession(s);
  };

  const renderBlock = (s) => {
    const at = atMap[s.type_activite_id] || {};
    const ue = ueMap[s.ue_id] || {};
    const grp = grpMap[s.group_id] || {};
    const formNames = (s.formateur_ids || []).map(fid => fmMap[fid]?.initiales || '?').join(', ');
    return (
      <div key={s.id} data-testid={`session-block-${s.id}`}
        className="planning-block px-1 py-0.5 text-[10px] cursor-pointer overflow-hidden border-l-2 leading-tight"
        style={{ backgroundColor: at.couleur ? `${at.couleur}25` : '#e2e8f0', borderLeftColor: at.couleur || '#94a3b8' }}
        onClick={(e) => { e.stopPropagation(); isAdmin && startEdit(s); }}
        onMouseEnter={(e) => handleMouseEnter(e, s)} onMouseLeave={() => setHoveredSession(null)}>
        <div className="flex items-center gap-0.5">
          <span className="font-bold" style={{ color: at.couleur }}>{at.nom}</span>
          {ue.code_ue && <span className="text-slate-500 truncate">{ue.code_ue}</span>}
          {s.statut === 'Valide' && <Check size={7} className="text-green-600 flex-shrink-0" />}
          {s.saisi && <Edit2 size={7} className="text-blue-500 flex-shrink-0" />}
        </div>
        <div className="text-[9px] text-slate-500">{s.heure_debut}-{s.heure_fin}{grp.libelle ? ` · ${grp.libelle}` : ''}</div>
        <div className="font-bold text-black">{formNames}</div>
      </div>
    );
  };

  const renderTooltip = () => {
    if (!hoveredSession) return null;
    const s = hoveredSession, at = atMap[s.type_activite_id] || {}, promo = promoMap[s.promotion_id] || {};
    const ue = ueMap[s.ue_id] || {}, dom = domMap[s.domain_id] || domMap[ue.domain_id] || {};
    const site = siteMap[s.site_id] || {}, grp = grpMap[s.group_id] || {};
    const forms = (s.formateur_ids || []).map(fid => { const f = fmMap[fid]; return f ? `${f.prenom} ${f.nom} (${f.initiales})` : '?'; });
    return (
      <div className="fixed z-[100] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl p-4 w-80 tooltip-enter pointer-events-none"
        style={{ left: tooltipPos.x, top: tooltipPos.y }}>
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-200 dark:border-slate-700">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: at.couleur }} />
          <span className="font-bold text-sm">{at.nom}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700">{s.semestre}</span>
          {s.statut === 'Valide' && <span className="text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700">Valide</span>}
        </div>
        {s.intitule && <p className="text-sm font-semibold mb-2">{s.intitule}</p>}
        <div className="grid grid-cols-[100px_1fr] gap-y-1 text-xs">
          <span className="text-slate-500">Promotion</span><span className="font-medium">{promo.nom}</span>
          {grp.libelle && <><span className="text-slate-500">Groupe</span><span>{grp.libelle}</span></>}
          <span className="text-slate-500">UE</span><span>{ue.code_ue} - {ue.intitule}</span>
          <span className="text-slate-500">Domaine</span><span>{dom.nom}</span>
          <span className="text-slate-500">Formateurs</span><span>{forms.join(', ')}</span>
          <span className="text-slate-500">Lieu</span><span>{site.nom || '-'}</span>
          <span className="text-slate-500">Horaires</span><span className="font-medium">{s.heure_debut} - {s.heure_fin}</span>
          <span className="text-slate-500">Duree</span><span>{s.duree}h</span>
          <span className="text-slate-500">Saisi</span><span>{s.saisi ? 'Oui' : 'Non'}</span>
        </div>
      </div>
    );
  };

  const PromoGrid = ({ promoId, promoName }) => {
    const promoSessions = promoId === 'all' ? sessions : sessions.filter(s => s.promotion_id === promoId);
    return (
      <Card className="overflow-hidden">
        {promoName && <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-b text-sm font-semibold">{promoName}</div>}
        <div className="overflow-x-auto">
          <div className="grid min-w-[700px]" style={{ gridTemplateColumns: '50px repeat(5, 1fr)' }}>
            {/* Day headers */}
            <div className="border-b border-r border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800/30" />
            {days.map((day, i) => {
              const dayAbs = getAbsForDay(format(day, 'yyyy-MM-dd'));
              return (
                <div key={i} className="border-b border-r border-slate-200 dark:border-slate-700 text-center bg-slate-50 dark:bg-slate-800/30">
                  <div className="text-[10px] text-slate-500 capitalize pt-1">{format(day, 'EEEE', { locale: fr })}</div>
                  <div className="text-xs font-bold pb-1">{format(day, 'd MMM', { locale: fr })}</div>
                  {dayAbs.length > 0 && (
                    <div className="bg-red-50 dark:bg-red-950/30 border-t border-red-200 dark:border-red-800 px-1 py-0.5 text-[9px] text-red-600 font-medium">
                      Abs: {dayAbs.join(', ')}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Time column + day columns */}
            <div className="border-r border-slate-200 dark:border-slate-700 relative bg-slate-50/50 dark:bg-slate-800/20" style={{ height: GRID_H }}>
              {Array.from({ length: 22 }, (_, i) => { const h = 7 + Math.floor((i + 1) / 2); const m = (i + 1) % 2 === 0 ? '30' : '00'; return { h, m, label: m === '00' ? `${h}:00` : '', min: h * 60 + parseInt(m) }; })
                .filter(x => x.min >= START_MIN && x.min <= END_MIN).map((x, i) => (
                <div key={i} className="absolute w-full text-[9px] text-slate-400 text-right pr-1" style={{ top: (x.min - START_MIN) * PX_PER_MIN }}>
                  {x.label && <span className="bg-slate-50 dark:bg-slate-900 px-0.5">{x.label}</span>}
                </div>
              ))}
            </div>

            {days.map((day, di) => {
              const dayStr = format(day, 'yyyy-MM-dd');
              const daySessions = promoSessions.filter(s => s.date === dayStr).sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));

              return (
                <div key={di} className="border-r border-slate-200 dark:border-slate-700 relative" style={{ height: GRID_H }}
                  onClick={() => isAdmin && startNew(dayStr, '08:00')}>
                  {/* Hour lines */}
                  {Array.from({ length: 11 }, (_, i) => 8 + i).map(h => (
                    <div key={h} className="absolute w-full border-t border-slate-100 dark:border-slate-800/50" style={{ top: (h * 60 - START_MIN) * PX_PER_MIN }} />
                  ))}

                  {/* Sessions */}
                  {daySessions.map((s, si) => {
                    const top = Math.max(0, (timeToMin(s.heure_debut) - START_MIN) * PX_PER_MIN);
                    const height = Math.max(18, (timeToMin(s.heure_fin) - timeToMin(s.heure_debut)) * PX_PER_MIN);
                    const overlapping = daySessions.filter(o => o.id !== s.id && timeToMin(o.heure_debut) < timeToMin(s.heure_fin) && timeToMin(o.heure_fin) > timeToMin(s.heure_debut));
                    const total = overlapping.length + 1;
                    const idx = overlapping.filter(o => daySessions.indexOf(o) < daySessions.indexOf(s)).length;
                    return (
                      <div key={s.id} className="absolute px-0.5" style={{ top, height, width: `${100 / total}%`, left: `${(idx * 100) / total}%`, zIndex: 15 }}
                        onClick={e => e.stopPropagation()}>
                        {renderBlock(s)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-3" data-testid="planning-global">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Planning global</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevWeek} data-testid="prev-week"><ChevronLeft size={16} /></Button>
          <span className="text-sm font-semibold px-2"><span className="font-bold text-base">S{weekNum}</span> - {format(days[0], "d MMM", { locale: fr })} au {format(days[4], "d MMM yyyy", { locale: fr })}</span>
          <Button variant="outline" size="sm" onClick={nextWeek} data-testid="next-week"><ChevronRight size={16} /></Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filterPromo} onValueChange={setFilterPromo}>
          <SelectTrigger className="w-52 h-8 text-xs" data-testid="filter-promo"><SelectValue placeholder="Toutes promotions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les promotions</SelectItem>
            {promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSemestre} onValueChange={setFilterSemestre}>
          <SelectTrigger className="w-36 h-8 text-xs" data-testid="filter-semestre"><SelectValue placeholder="Semestre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous semestres</SelectItem>
            <SelectItem value="pair">Pairs (S2,S4,S6)</SelectItem>
            <SelectItem value="impair">Impairs (S1,S3,S5)</SelectItem>
            {["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={sideByView ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setSideByView(!sideByView)} data-testid="toggle-side-by-side">
          <Columns size={14} className="mr-1" /> Cote a cote
        </Button>
        {isAdmin && <Button size="sm" className="h-8 text-xs" onClick={() => startNew(format(new Date(), 'yyyy-MM-dd'))} data-testid="new-session-btn"><Plus size={14} className="mr-1" /> Nouvelle seance</Button>}
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => window.print()}><FileDown size={14} className="mr-1" /> PDF</Button>
      </div>

      {/* Grid display */}
      {sideByView && filterPromo === 'all' ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${displayPromos.length}, 1fr)` }}>
          {displayPromos.map(p => <PromoGrid key={p.id} promoId={p.id} promoName={p.nom} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {filterPromo === 'all' ? displayPromos.map(p => (
            <PromoGrid key={p.id} promoId={p.id} promoName={p.nom} />
          )) : <PromoGrid promoId={filterPromo} />}
        </div>
      )}

      {renderTooltip()}

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="session-dialog">
          <DialogHeader><DialogTitle>{editSession?.id ? 'Modifier la seance' : 'Nouvelle seance'}</DialogTitle></DialogHeader>
          {editSession && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Date</Label><Input type="date" value={editSession.date||''} onChange={e=>setEditSession({...editSession,date:e.target.value})} className="h-8 text-sm" /></div>
              <div><Label className="text-xs">Intitule</Label><Input value={editSession.intitule||''} onChange={e=>setEditSession({...editSession,intitule:e.target.value})} className="h-8 text-sm" /></div>
              <div><Label className="text-xs">Debut</Label><Input type="time" value={editSession.heure_debut||''} onChange={e=>setEditSession({...editSession,heure_debut:e.target.value})} className="h-8 text-sm" /></div>
              <div><Label className="text-xs">Fin</Label><Input type="time" value={editSession.heure_fin||''} onChange={e=>setEditSession({...editSession,heure_fin:e.target.value})} className="h-8 text-sm" /></div>
              <div><Label className="text-xs">Type</Label>
                <Select value={editSession.type_activite_id||''} onValueChange={v=>setEditSession({...editSession,type_activite_id:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{actTypes.map(a=><SelectItem key={a.id} value={a.id}>{a.nom}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Promotion</Label>
                <Select value={editSession.promotion_id||''} onValueChange={v=>setEditSession({...editSession,promotion_id:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{promotions.map(p=><SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Groupe</Label>
                <Select value={editSession.group_id||'none'} onValueChange={v=>setEditSession({...editSession,group_id:v==='none'?'':v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Optionnel" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Aucun</SelectItem>{groups.map(g=><SelectItem key={g.id} value={g.id}>{g.libelle}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">UE</Label>
                <Select value={editSession.ue_id||''} onValueChange={v=>setEditSession({...editSession,ue_id:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{ues.map(u=><SelectItem key={u.id} value={u.id}>{u.code_ue} - {u.intitule}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Semestre</Label>
                <Select value={editSession.semestre||''} onValueChange={v=>setEditSession({...editSession,semestre:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{["S1","S2","S3","S4","S5","S6"].map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Site</Label>
                <Select value={editSession.site_id||''} onValueChange={v=>setEditSession({...editSession,site_id:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Optionnel" /></SelectTrigger>
                  <SelectContent>{sites.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Statut</Label>
                <Select value={editSession.statut||'Prevu'} onValueChange={v=>setEditSession({...editSession,statut:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Prevu">Prevu</SelectItem><SelectItem value="Valide">Valide</SelectItem></SelectContent></Select></div>
              <div className="col-span-2"><Label className="text-xs">Formateurs</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">{formateurs.map(f=>(
                  <label key={f.id} className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] cursor-pointer
                    ${(editSession.formateur_ids||[]).includes(f.id)?'bg-slate-200 dark:bg-slate-700 border-slate-400':'border-slate-200 dark:border-slate-700'}`}>
                    <input type="checkbox" className="w-3 h-3" checked={(editSession.formateur_ids||[]).includes(f.id)}
                      onChange={e=>{const ids=editSession.formateur_ids||[];setEditSession({...editSession,formateur_ids:e.target.checked?[...ids,f.id]:ids.filter(i=>i!==f.id)});}}/>
                    {f.initiales} - {f.prenom} {f.nom}</label>))}</div></div>
              <div className="col-span-2 flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs"><Checkbox checked={editSession.saisi||false} onCheckedChange={v=>setEditSession({...editSession,saisi:v})}/>Saisi</label></div>
              <div className="col-span-2"><Label className="text-xs">Commentaire</Label><Input value={editSession.commentaire||''} onChange={e=>setEditSession({...editSession,commentaire:e.target.value})} className="h-8 text-sm"/></div>
              <div className="col-span-2 flex justify-between pt-2 border-t">
                <div className="flex gap-2">{editSession.id&&(<>
                  <Button variant="outline" size="sm" className="text-xs" onClick={()=>duplicateSession(editSession.id)}>Dupliquer</Button>
                  <Button variant="destructive" size="sm" className="text-xs" onClick={()=>deleteSession(editSession.id)}>Supprimer</Button></>)}</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-xs" onClick={()=>setShowDialog(false)}>Annuler</Button>
                  <Button size="sm" className="text-xs" onClick={saveSession} data-testid="save-session">Enregistrer</Button></div></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
