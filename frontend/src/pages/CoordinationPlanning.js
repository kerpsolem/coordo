import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Plus, Edit2, Trash2, Copy, Check, Search, Calendar, BookOpen, Plane, ListTodo } from 'lucide-react';
import { FichesProjets } from './Coordination';
import { VacancesPanel } from './Vacances';

const TYPE_BADGE_COLOR = {
  CM: { bg: 'bg-yellow-300', text: 'text-yellow-900' },
  CMo: { bg: 'bg-blue-300', text: 'text-blue-900' },
  TD: { bg: 'bg-green-300', text: 'text-green-900' },
  TP: { bg: 'bg-orange-300', text: 'text-orange-900' },
  TPG: { bg: 'bg-orange-400', text: 'text-orange-900' },
  EVAL: { bg: 'bg-red-300', text: 'text-red-900' },
};

export default function CoordinationPlanning() {
  const { isAdmin, isSecretariat } = useAuth();
  const canEdit = isAdmin;
  const canToggleSaisi = isAdmin || isSecretariat;
  const [tab, setTab] = useState('seances');
  const [sessions, setSessions] = useState([]);
  const [aProgrammer, setAProgrammer] = useState([]);
  const [vacances, setVacances] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [actTypes, setActTypes] = useState([]);
  const [ues, setUes] = useState([]);
  const [domains, setDomains] = useState([]);
  const [sites, setSites] = useState([]);
  const [groups, setGroups] = useState([]);
  const [editSession, setEditSession] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showSiteSection, setShowSiteSection] = useState(false);
  const [search, setSearch] = useState('');
  const [filterPromo, setFilterPromo] = useState('all');
  const [filterSemestre, setFilterSemestre] = useState('all');
  const [filterUe, setFilterUe] = useState('all');
  const [filterDomain, setFilterDomain] = useState('all');
  const [filterPeriode, setFilterPeriode] = useState('all'); // 'all' | 'week'
  const [filterSaisi, setFilterSaisi] = useState('all'); // 'all' | 'oui' | 'non'
  const [linkContext, setLinkContext] = useState(null); // {fiche_id, activite_id} when scheduling from "À programmer"

  const loadData = useCallback(async () => {
    const params = {};
    if (filterPromo !== 'all') params.promotion_id = filterPromo;
    if (filterSemestre !== 'all') params.semestre = filterSemestre;
    if (filterUe !== 'all') params.ue_id = filterUe;
    if (filterDomain !== 'all') params.domain_id = filterDomain;
    try {
      const apParams = filterPromo !== 'all' ? { promotion_id: filterPromo } : {};
      const today = new Date();
      const yearStart = `${today.getFullYear()}-01-01`;
      const yearEnd = `${today.getFullYear() + 1}-12-31`;
      const [sessRes, proRes, fmRes, atRes, ueRes, domRes, sitRes, grpRes, apRes, vacRes] = await Promise.all([
        API.get('/sessions', { params }), API.get('/promotions'), API.get('/formateurs'),
        API.get('/activity-types'), API.get('/ues'), API.get('/domains'), API.get('/sites'), API.get('/groups'),
        API.get('/fiches-projet/a-programmer', { params: apParams }),
        API.get('/vacances/for-period', { params: { date_debut: yearStart, date_fin: yearEnd } }),
      ]);
      setSessions(sessRes.data); setPromotions(proRes.data); setFormateurs(fmRes.data);
      setActTypes(atRes.data); setUes(ueRes.data); setDomains(domRes.data);
      setSites(sitRes.data); setGroups(grpRes.data);
      setAProgrammer(apRes.data || []); setVacances(vacRes.data || []);
    } catch (e) { console.error(e); }
  }, [filterPromo, filterSemestre, filterUe, filterDomain]);

  useEffect(() => { loadData(); }, [loadData]);

  const getMap = (arr) => Object.fromEntries(arr.map(a => [a.id, a]));
  const promoMap = getMap(promotions);
  const fmMap = getMap(formateurs);
  const atMap = getMap(actTypes);
  const ueMap = getMap(ues);
  const domMap = getMap(domains);
  const siteMap = getMap(sites);
  const grpMap = getMap(groups);

  const startEdit = (s) => {
    setEditSession({ ...s, formateur_ids: s.formateur_ids || [], joker_formateur_ids: s.joker_formateur_ids || [] });
    setShowDialog(true);
  };

  const startNew = () => {
    setEditSession({
      date: '', heure_debut: '08:00', heure_fin: '10:00', type_activite_id: '',
      promotion_id: filterPromo !== 'all' ? filterPromo : '', group_id: '', ue_id: '',
      semestre: filterSemestre !== 'all' ? filterSemestre : '', formateur_ids: [], site_id: '',
      statut: 'Prevu', saisi: false, commentaire: '', intitule: ''
    });
    setShowDialog(true);
  };

  const saveSession = async () => {
    try {
      // Vacances blocking check
      const vacancesOnDate = vacances.filter(v => v.date === editSession.date && v.promotion_id === editSession.promotion_id);
      if (vacancesOnDate.length > 0) {
        const proceed = window.confirm(`Cette date (${editSession.date}) est en vacances pour cette promotion : "${vacancesOnDate[0].nom}". Continuer quand meme ?`);
        if (!proceed) return;
      }
      let savedId = editSession.id;
      if (editSession.id) {
        await API.put(`/sessions/${editSession.id}`, editSession);
      } else {
        const { data } = await API.post('/sessions', editSession);
        savedId = data.id;
      }
      // Link to fiche projet activite if context provided
      if (linkContext && savedId) {
        await API.post(`/fiches-projet/${linkContext.fiche_id}/activites/${linkContext.activite_id}/link-session`, { session_id: savedId });
      }
      setShowDialog(false);
      setLinkContext(null);
      loadData();
    } catch (e) { console.error(e); alert(e?.response?.data?.detail || 'Erreur'); }
  };

  const planFromAProgrammer = (act) => {
    const at = actTypes.find(a => a.id === act.type_activite_id);
    const heures = parseFloat(act.heures) || 2;
    // Compute target date from semaine_souhaitee or current week
    let date = '';
    if (act.semaine_souhaitee) {
      const wkStr = String(act.semaine_souhaitee).replace(/[^0-9]/g, '');
      const wk = parseInt(wkStr, 10);
      if (wk > 0 && wk <= 53) {
        const year = new Date().getFullYear();
        const jan1 = new Date(year, 0, 1);
        const days = (wk - 1) * 7 - jan1.getDay() + 1;
        const target = new Date(year, 0, 1 + days);
        date = target.toISOString().slice(0, 10);
      }
    }
    setEditSession({
      date, heure_debut: '08:00', heure_fin: `${String(8 + Math.min(8, Math.ceil(heures))).padStart(2, '0')}:00`,
      type_activite_id: act.type_activite_id || '',
      intitule: act.nom || '',
      promotion_id: act.promotion_id || '',
      ue_id: act.ue_id || '',
      semestre: act.semestre || '',
      formateur_ids: act.formateur_ids || [],
      group_id: '', site_id: '', statut: 'Prevu', saisi: false, commentaire: '',
    });
    setLinkContext({ fiche_id: act.fiche_id, activite_id: act.activite_id });
    setShowDialog(true);
  };

  const toggleField = async (id, field, currentValue) => {
    const newValue = field === 'statut' ? (currentValue === 'Valide' ? 'Prevu' : 'Valide') : !currentValue;
    try {
      await API.patch(`/sessions/${id}/toggle`, { field, value: newValue });
      loadData();
    } catch (e) {
      console.error(e);
      const detail = e.response?.data?.detail || 'Modification impossible';
      alert(detail);
    }
  };

  const [confirmDelId, setConfirmDelId] = useState(null);
  const deleteSession = async (id) => {
    if (confirmDelId !== id) {
      setConfirmDelId(id);
      setTimeout(() => setConfirmDelId(c => c === id ? null : c), 4000);
      return;
    }
    try {
      await API.delete(`/sessions/${id}`);
      setConfirmDelId(null);
      loadData();
    } catch (e) {
      console.error('Delete failed:', e);
      const detail = e.response?.data?.detail || e.message || 'Erreur inconnue';
      alert(`Suppression impossible : ${detail}`);
    }
  };

  const duplicateSession = async (id) => {
    try { await API.post(`/sessions/${id}/duplicate`); loadData(); } catch (e) { console.error(e); }
  };

  // Conflict detection: same formateur or same group at overlapping time
  const sessionsByDate = sessions.reduce((acc, s) => { (acc[s.date] = acc[s.date] || []).push(s); return acc; }, {});
  const hasConflict = (s) => {
    const same = sessionsByDate[s.date] || [];
    return same.some(o => {
      if (o.id === s.id) return false;
      const overlap = !(o.heure_fin <= s.heure_debut || s.heure_fin <= o.heure_debut);
      if (!overlap) return false;
      const sharesFormateur = (s.formateur_ids || []).some(id => (o.formateur_ids || []).includes(id));
      const sGroups = s.group_ids || (s.group_id ? [s.group_id] : []);
      const oGroups = o.group_ids || (o.group_id ? [o.group_id] : []);
      // Same promo + (intersecting group_ids OR one side = promo entière)
      const samePromo = s.promotion_id && s.promotion_id === o.promotion_id;
      const groupsOverlap = sGroups.length > 0 && oGroups.length > 0 && sGroups.some(g => oGroups.includes(g));
      const promoEntiereCovers = samePromo && (sGroups.length === 0 || oGroups.length === 0);
      const sharesGroup = samePromo && (groupsOverlap || promoEntiereCovers);
      return sharesFormateur || sharesGroup;
    });
  };

  const filtered = sessions.filter(s => {
    // Periode filter: current ISO week (Mon..Sun)
    if (filterPeriode === 'week') {
      const now = new Date();
      const day = (now.getDay() + 6) % 7; // 0=Mon..6=Sun
      const monday = new Date(now); monday.setDate(now.getDate() - day); monday.setHours(0,0,0,0);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999);
      const d = s.date ? new Date(s.date + 'T00:00:00') : null;
      if (!d || d < monday || d > sunday) return false;
    }
    // Saisi filter
    if (filterSaisi === 'oui' && !s.saisi) return false;
    if (filterSaisi === 'non' && s.saisi) return false;
    if (search) {
      const lower = search.toLowerCase();
      const at = atMap[s.type_activite_id]?.nom || '';
      const ue = ueMap[s.ue_id]?.intitule || '';
      return at.toLowerCase().includes(lower) || ue.toLowerCase().includes(lower) ||
        (s.intitule || '').toLowerCase().includes(lower) || s.date.includes(lower);
    }
    return true;
  });

  return (
    <div className="space-y-4" data-testid="coordination-planning">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Coordination planning</h1>
        {canEdit && tab === 'seances' && <Button onClick={startNew} data-testid="new-session-btn"><Plus size={16} className="mr-2" />Séance</Button>}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="seances" data-testid="tab-seances"><Calendar size={14} className="mr-1.5" />Séances</TabsTrigger>
          <TabsTrigger value="fiches" data-testid="tab-fiches"><BookOpen size={14} className="mr-1.5" />Fiches projets</TabsTrigger>
          <TabsTrigger value="vacances" data-testid="tab-vacances"><Plane size={14} className="mr-1.5" />Vacances</TabsTrigger>
        </TabsList>

        <TabsContent value="seances" className="space-y-4 mt-4">
        {/* À programmer banner */}
        {aProgrammer.length > 0 && (
          <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 p-3" data-testid="a-programmer-panel">
            <div className="flex items-center gap-2 mb-2">
              <ListTodo size={16} className="text-amber-600" />
              <span className="font-semibold text-sm text-amber-900 dark:text-amber-200">{aProgrammer.length} séquence(s) non programmée(s)</span>
              <span className="text-xs text-amber-700 dark:text-amber-300">— cliquez pour les planifier</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {aProgrammer.slice(0, 30).map(act => {
                const at = actTypes.find(a => a.id === act.type_activite_id);
                const badge = at && TYPE_BADGE_COLOR[at.nom];
                return (
                  <button key={act.activite_id} onClick={() => planFromAProgrammer(act)} data-testid={`plan-act-${act.activite_id}`}
                    className="group inline-flex items-center gap-1.5 px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition text-[11px] text-left max-w-xs">
                    {at && <span className={`px-1 py-0 rounded text-[9px] font-bold ${badge?.bg || 'bg-slate-200'} ${badge?.text || ''}`}>{at.nom}</span>}
                    <span className="font-medium truncate">{act.nom || '(sans intitulé)'}</span>
                    <span className="text-amber-700 font-semibold">· {act.heures}h</span>
                    {act.semaine_souhaitee && <span className="text-slate-500">· {String(act.semaine_souhaitee).startsWith('S') ? act.semaine_souhaitee : 'S' + act.semaine_souhaitee}</span>}
                  </button>
                );
              })}
              {aProgrammer.length > 30 && <span className="text-xs text-amber-700 self-center">+ {aProgrammer.length - 30} autres...</span>}
            </div>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} data-testid="search-sessions" />
          </div>
          <Select value={filterPromo} onValueChange={setFilterPromo}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Promotion" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes promotions</SelectItem>
              {promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterUe} onValueChange={setFilterUe}>
            <SelectTrigger className="w-48"><SelectValue placeholder="UE" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes UE</SelectItem>
              {ues.map(u => <SelectItem key={u.id} value={u.id}>{u.code_ue} - {u.intitule}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterDomain} onValueChange={setFilterDomain}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Domaine" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous domaines</SelectItem>
              {domains.map(d => <SelectItem key={d.id} value={d.id}>{d.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPeriode} onValueChange={setFilterPeriode}>
            <SelectTrigger className="w-40" data-testid="filter-periode"><SelectValue placeholder="Période" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Affichage total</SelectItem>
              <SelectItem value="week">Cette semaine</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterSaisi} onValueChange={setFilterSaisi}>
            <SelectTrigger className="w-40" data-testid="filter-saisi"><SelectValue placeholder="Saisie" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes saisies</SelectItem>
              <SelectItem value="oui">Saisies (Oui)</SelectItem>
              <SelectItem value="non">Non saisies</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sessions list (compact rows like screenshot) */}
        <Card>
          <CardContent className="p-0">
            {/* Legend */}
            <div className="flex items-center justify-end gap-4 px-3 py-1.5 text-[10px] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded inline-flex items-center justify-center text-[9px] font-bold bg-emerald-500 text-white">V</span> Validé / <span className="w-4 h-4 rounded inline-flex items-center justify-center text-[9px] font-bold bg-slate-200 text-slate-600">P</span> Prévu</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded inline-flex items-center justify-center bg-green-100"><Check size={10} className="text-green-600" /></span> Saisi</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(s => {
                const at = atMap[s.type_activite_id];
                const badge = at && TYPE_BADGE_COLOR[at.nom];
                const conflict = hasConflict(s);
                return (
                  <div key={s.id} className={`flex items-center gap-3 px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 ${conflict ? 'bg-red-50/60 dark:bg-red-950/20' : ''}`}>
                    <span className="text-slate-500 w-16 shrink-0">{s.date && new Date(s.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
                    <span className="font-mono text-slate-700 w-24 shrink-0">{s.heure_debut}-{s.heure_fin}</span>
                    {at && <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${badge?.bg || 'bg-slate-200'} ${badge?.text || ''}`}>{at.nom}</span>}
                    <span className="flex-1 truncate font-medium">{s.intitule || at?.nom || '—'}</span>
                    {conflict && <span title="Conflit formateur ou groupe" className="text-red-600 font-bold text-[10px]">⚠ Conflit</span>}
                    {s.promotion_id && <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] shrink-0">{promoMap[s.promotion_id]?.nom?.replace('Promotion ', '')}</span>}
                    {(() => {
                      const gids = s.group_ids || (s.group_id ? [s.group_id] : []);
                      if (!gids.length) return <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] shrink-0" title="Promotion entière">Tous</span>;
                      const labels = gids.map(gid => grpMap[gid]?.libelle).filter(Boolean);
                      const display = labels.length > 4 ? `${labels.slice(0, 4).join(', ')}…` : labels.join(', ');
                      return <span className="px-1.5 py-0.5 rounded bg-coral-50 dark:bg-coral-900/30 text-coral-700 dark:text-coral-300 text-[10px] font-medium shrink-0" title={labels.join(', ')} data-testid={`session-groups-${s.id}`}>{display}</span>;
                    })()}
                    <span className="text-slate-500 truncate w-32 hidden md:block">{ueMap[s.ue_id]?.intitule}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 w-20 truncate" title={(s.formateur_ids || []).map(fid => fmMap[fid] && `${fmMap[fid].prenom} ${fmMap[fid].nom}`).filter(Boolean).join(', ')}>
                      {(s.formateur_ids || []).map(fid => fmMap[fid]?.initiales).filter(Boolean).join(', ')}
                    </span>
                    {/* Statut toggle (admin only — Prevu/Valide) */}
                    {(() => {
                      const isValide = s.statut === 'Valide';
                      return (
                        <button
                          onClick={() => isAdmin && toggleField(s.id, 'statut', s.statut)}
                          disabled={!isAdmin}
                          title={isAdmin ? `Statut : ${isValide ? 'Validé — cliquer pour repasser en Prévu' : 'Prévu — cliquer pour valider'}` : `Statut : ${isValide ? 'Validé' : 'Prévu'}`}
                          className={`w-5 h-5 rounded inline-flex items-center justify-center text-[9px] font-bold ${isValide ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'} ${isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-emerald-300' : 'cursor-default'}`}
                          data-testid={`toggle-statut-${s.id}`}
                        >
                          {isValide ? 'V' : 'P'}
                        </button>
                      );
                    })()}
                    {(() => {
                      const isValide = s.statut === 'Valide';
                      // Secretariat: can toggle only on validated sessions. Admin: always.
                      const canClick = isAdmin || (isSecretariat && isValide);
                      const disabledReason = isSecretariat && !isValide ? 'Saisie modifiable uniquement sur une séance validée' : '';
                      return (
                        <button
                          onClick={() => canClick && toggleField(s.id, 'saisi', s.saisi)}
                          disabled={!canClick}
                          title={disabledReason || (s.saisi ? 'Saisi : Oui' : 'Saisi : Non')}
                          className={`w-5 h-5 rounded inline-flex items-center justify-center ${s.saisi ? 'bg-green-100 dark:bg-green-900/30' : 'bg-slate-100 dark:bg-slate-800'} ${canClick ? 'cursor-pointer hover:ring-2 hover:ring-coral-300' : 'opacity-40 cursor-not-allowed'}`}
                          data-testid={`toggle-saisi-${s.id}`}
                        >
                          {s.saisi && <Check size={12} className="text-green-600" />}
                        </button>
                      );
                    })()}
                    <div className="flex gap-0.5 shrink-0">
                      {canEdit && <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => startEdit(s)}><Edit2 size={11} /></Button>}
                      {canEdit && <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => duplicateSession(s.id)}><Copy size={11} /></Button>}
                      {canEdit && (confirmDelId === s.id ? (
                        <Button variant="destructive" size="sm" className="h-6 px-2 text-[10px]" onClick={() => deleteSession(s.id)} data-testid={`confirm-del-${s.id}`}>OK?</Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => deleteSession(s.id)} title="Supprimer (2x)" data-testid={`del-${s.id}`}><Trash2 size={11} /></Button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && <p className="text-center py-8 text-sm text-slate-500">Aucune séance</p>}
            </div>
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="fiches" className="mt-4">
          <FichesProjets />
        </TabsContent>

        <TabsContent value="vacances" className="mt-4">
          <VacancesPanel />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editSession?.id ? 'Modifier la seance' : 'Nouvelle seance'}</DialogTitle></DialogHeader>
          {editSession && (
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date</Label><Input type="date" value={editSession.date || ''} onChange={e => setEditSession({ ...editSession, date: e.target.value })} /></div>
              <div><Label>Intitule</Label><Input value={editSession.intitule || ''} onChange={e => setEditSession({ ...editSession, intitule: e.target.value })} /></div>
              <div><Label>Heure debut</Label><Input type="time" value={editSession.heure_debut || ''} onChange={e => setEditSession({ ...editSession, heure_debut: e.target.value })} /></div>
              <div><Label>Heure fin</Label><Input type="time" value={editSession.heure_fin || ''} onChange={e => setEditSession({ ...editSession, heure_fin: e.target.value })} /></div>
              <div>
                <Label>Type</Label>
                <Select value={editSession.type_activite_id || ''} onValueChange={v => setEditSession({ ...editSession, type_activite_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{actTypes.map(a => <SelectItem key={a.id} value={a.id}>{a.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Promotion</Label>
                <Select value={editSession.promotion_id || ''} onValueChange={v => setEditSession({ ...editSession, promotion_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Groupes</Label>
                {!editSession.promotion_id ? (
                  <p className="text-xs text-slate-400 italic mt-1" data-testid="session-group">Sélectionnez d'abord une promotion</p>
                ) : (() => {
                  const ids = editSession.group_ids || (editSession.group_id ? [editSession.group_id] : []);
                  const promoGroups = groups.filter(g => !g.promotion_id || g.promotion_id === editSession.promotion_id);
                  return (
                    <div className="flex flex-wrap gap-1.5 mt-1 items-center" data-testid="session-group">
                      <button type="button"
                        className={`px-2 py-1 rounded border text-xs font-medium ${ids.length === 0 ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-white border-slate-200 text-slate-600'}`}
                        onClick={() => setEditSession({ ...editSession, group_ids: [], group_id: '' })}>
                        Promo entière
                      </button>
                      {promoGroups.map(g => {
                        const checked = ids.includes(g.id);
                        return (
                          <label key={g.id} className={`flex items-center gap-1 px-2 py-1 rounded border text-xs cursor-pointer
                            ${checked ? 'bg-slate-200 dark:bg-slate-700 border-slate-400' : 'border-slate-200 dark:border-slate-700'}`}>
                            <input type="checkbox" className="w-3 h-3" checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked ? [...ids, g.id] : ids.filter(i => i !== g.id);
                                setEditSession({ ...editSession, group_ids: next, group_id: next[0] || '' });
                              }} />
                            {g.libelle}
                          </label>
                        );
                      })}
                      {promoGroups.length === 0 && <span className="text-xs text-slate-400">Aucun groupe défini pour cette promotion</span>}
                      {ids.length > 0 && <span className="text-[10px] text-slate-500 ml-auto">{ids.length} sélectionné{ids.length > 1 ? 's' : ''}</span>}
                    </div>
                  );
                })()}
              </div>
              <div>
                <Label>UE</Label>
                <Select value={editSession.ue_id || ''} onValueChange={v => setEditSession({ ...editSession, ue_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{ues.map(u => <SelectItem key={u.id} value={u.id}>{u.code_ue} - {u.intitule}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Semestre</Label>
                <Select value={editSession.semestre || ''} onValueChange={v => setEditSession({ ...editSession, semestre: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Formateurs <span className="text-[10px] text-slate-500 font-normal ml-2">Clic : ✓ sélection · clic 2 : ★ joker · clic 3 : retirer</span></Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {formateurs.map(f => {
                    const ids = editSession.formateur_ids || [];
                    const jokers = editSession.joker_formateur_ids || [];
                    const isSel = ids.includes(f.id);
                    const isJoker = jokers.includes(f.id);
                    const cycle = () => {
                      if (!isSel) {
                        setEditSession({ ...editSession, formateur_ids: [...ids, f.id], joker_formateur_ids: jokers.filter(i => i !== f.id) });
                      } else if (!isJoker) {
                        setEditSession({ ...editSession, formateur_ids: ids, joker_formateur_ids: [...jokers, f.id] });
                      } else {
                        setEditSession({ ...editSession, formateur_ids: ids.filter(i => i !== f.id), joker_formateur_ids: jokers.filter(i => i !== f.id) });
                      }
                    };
                    const cls = isJoker
                      ? 'bg-amber-200 dark:bg-amber-700/50 border-amber-500 text-amber-900 dark:text-amber-100 font-semibold'
                      : isSel
                        ? 'bg-slate-200 dark:bg-slate-700 border-slate-400'
                        : 'border-slate-200 dark:border-slate-700';
                    return (
                      <button key={f.id} type="button" onClick={cycle}
                        title={isJoker ? 'Joker (remplaçant/secours)' : isSel ? 'Sélectionné' : 'Non sélectionné'}
                        className={`flex items-center gap-1 px-2 py-1 rounded border text-xs cursor-pointer ${cls}`}
                        data-testid={`formateur-toggle-coord-${f.id}`}>
                        {isJoker && <span className="text-amber-700 dark:text-amber-300">★</span>}
                        {!isJoker && isSel && <span className="text-slate-500">✓</span>}
                        {f.initiales} - {f.prenom} {f.nom}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="col-span-2">
                {(() => {
                  const ids = editSession.site_ids || (editSession.site_id ? [editSession.site_id] : []);
                  const summary = ids.length === 0
                    ? 'Aucune salle'
                    : ids.map(id => sites.find(s => s.id === id)?.nom).filter(Boolean).join(', ');
                  return (
                    <>
                      <button type="button" onClick={() => setShowSiteSection(v => !v)}
                        className="flex items-center justify-between w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                        data-testid="toggle-site-section-coord">
                        <span className="font-medium text-slate-600 dark:text-slate-300">Salle(s) <span className="text-slate-400 font-normal ml-1.5">· {summary}</span></span>
                        <span className="text-slate-400 text-[10px]">{showSiteSection ? '▾ masquer' : '▸ afficher'}</span>
                      </button>
                      {showSiteSection && (
                        <div className="flex flex-wrap gap-1.5 mt-2 items-center" data-testid="session-sites-coord">
                          <button type="button"
                            className={`px-2 py-1 rounded border text-xs font-medium ${ids.length === 0 ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}
                            onClick={() => setEditSession({ ...editSession, site_ids: [], site_id: '' })}>
                            Aucune salle
                          </button>
                          {sites.map(s => {
                            const checked = ids.includes(s.id);
                            return (
                              <label key={s.id} className={`flex items-center gap-1 px-2 py-1 rounded border text-xs cursor-pointer
                                ${checked ? 'bg-slate-200 dark:bg-slate-700 border-slate-400' : 'border-slate-200 dark:border-slate-700'}`}>
                                <input type="checkbox" className="w-3 h-3" checked={checked}
                                  onChange={e => {
                                    const next = e.target.checked ? [...ids, s.id] : ids.filter(i => i !== s.id);
                                    setEditSession({ ...editSession, site_ids: next, site_id: next[0] || '' });
                                  }} />
                                {s.nom}
                              </label>
                            );
                          })}
                          {ids.length > 0 && <span className="text-[10px] text-slate-500 ml-auto">{ids.length} sélectionnée{ids.length > 1 ? 's' : ''}</span>}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="col-span-2 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={editSession.saisi || false} onCheckedChange={v => setEditSession({ ...editSession, saisi: v })} /> Saisi</label>
              </div>
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowDialog(false)}>Annuler</Button>
                <Button onClick={saveSession} data-testid="save-session-coord">Enregistrer</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
