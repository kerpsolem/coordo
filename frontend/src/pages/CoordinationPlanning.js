import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Plus, Edit2, Trash2, Copy, Check, X, Search, Filter } from 'lucide-react';

export default function CoordinationPlanning() {
  const { isAdmin, isSecretariat } = useAuth();
  const canEdit = isAdmin;
  const canToggleSaisi = isAdmin || isSecretariat;
  const [sessions, setSessions] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [actTypes, setActTypes] = useState([]);
  const [ues, setUes] = useState([]);
  const [domains, setDomains] = useState([]);
  const [sites, setSites] = useState([]);
  const [groups, setGroups] = useState([]);
  const [editSession, setEditSession] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [search, setSearch] = useState('');
  const [filterPromo, setFilterPromo] = useState('all');
  const [filterSemestre, setFilterSemestre] = useState('all');
  const [filterUe, setFilterUe] = useState('all');
  const [filterDomain, setFilterDomain] = useState('all');

  const loadData = useCallback(async () => {
    const params = {};
    if (filterPromo !== 'all') params.promotion_id = filterPromo;
    if (filterSemestre !== 'all') params.semestre = filterSemestre;
    if (filterUe !== 'all') params.ue_id = filterUe;
    if (filterDomain !== 'all') params.domain_id = filterDomain;
    try {
      const [sessRes, proRes, fmRes, atRes, ueRes, domRes, sitRes, grpRes] = await Promise.all([
        API.get('/sessions', { params }), API.get('/promotions'), API.get('/formateurs'),
        API.get('/activity-types'), API.get('/ues'), API.get('/domains'), API.get('/sites'), API.get('/groups')
      ]);
      setSessions(sessRes.data); setPromotions(proRes.data); setFormateurs(fmRes.data);
      setActTypes(atRes.data); setUes(ueRes.data); setDomains(domRes.data);
      setSites(sitRes.data); setGroups(grpRes.data);
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

  const startEdit = (s) => {
    setEditSession({ ...s, formateur_ids: s.formateur_ids || [] });
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
      if (editSession.id) await API.put(`/sessions/${editSession.id}`, editSession);
      else await API.post('/sessions', editSession);
      setShowDialog(false);
      loadData();
    } catch (e) { console.error(e); }
  };

  const toggleField = async (id, field, currentValue) => {
    const newValue = field === 'statut' ? (currentValue === 'Valide' ? 'Prevu' : 'Valide') : !currentValue;
    try {
      await API.patch(`/sessions/${id}/toggle`, { field, value: newValue });
      loadData();
    } catch (e) { console.error(e); }
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

  const filtered = sessions.filter(s => {
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
        {canEdit && <Button onClick={startNew} data-testid="new-session-btn"><Plus size={16} className="mr-2" />Nouvelle seance</Button>}
      </div>

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
        <Select value={filterSemestre} onValueChange={setFilterSemestre}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Semestre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pair">Pairs</SelectItem>
            <SelectItem value="impair">Impairs</SelectItem>
            {["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterUe} onValueChange={setFilterUe}>
          <SelectTrigger className="w-48"><SelectValue placeholder="UE" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes UEs</SelectItem>
            {ues.map(u => <SelectItem key={u.id} value={u.id}>{u.code_ue} - {u.intitule}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDomain} onValueChange={setFilterDomain}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Domaine" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous domaines</SelectItem>
            {domains.map(d => <SelectItem key={d.id} value={d.id}>{d.nom}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Horaires</TableHead>
                <TableHead className="text-xs">Intitule</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Promotion</TableHead>
                <TableHead className="text-xs">UE</TableHead>
                <TableHead className="text-xs">Formateurs</TableHead>
                <TableHead className="text-xs">Sem.</TableHead>
                <TableHead className="text-xs">Statut</TableHead>
                <TableHead className="text-xs">Saisi</TableHead>
                {(canEdit || canToggleSaisi) && <TableHead className="text-xs">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(s => (
                <TableRow key={s.id} className="text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TableCell className="py-2">{s.date}</TableCell>
                  <TableCell className="py-2">{s.heure_debut}-{s.heure_fin}</TableCell>
                  <TableCell className="py-2 max-w-32 truncate">{s.intitule}</TableCell>
                  <TableCell className="py-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: (atMap[s.type_activite_id]?.couleur || '#94a3b8') + '30', color: atMap[s.type_activite_id]?.couleur }}>
                      {atMap[s.type_activite_id]?.nom}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">{promoMap[s.promotion_id]?.nom?.replace('Promotion ', '')}</TableCell>
                  <TableCell className="py-2">{ueMap[s.ue_id]?.code_ue}</TableCell>
                  <TableCell className="py-2 font-bold text-black dark:text-white">
                    {(s.formateur_ids || []).map(fid => fmMap[fid]?.initiales).filter(Boolean).join(', ')}
                  </TableCell>
                  <TableCell className="py-2">{s.semestre}</TableCell>
                  <TableCell className="py-2">
                    <button onClick={() => canEdit && toggleField(s.id, 'statut', s.statut)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${canEdit ? 'cursor-pointer' : 'cursor-default'}
                        ${s.statut === 'Valide' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}
                      data-testid={`toggle-statut-${s.id}`}>
                      {s.statut}
                    </button>
                  </TableCell>
                  <TableCell className="py-2">
                    <button onClick={() => canToggleSaisi && toggleField(s.id, 'saisi', !s.saisi)}
                      className={`w-5 h-5 rounded flex items-center justify-center ${canToggleSaisi ? 'cursor-pointer' : 'cursor-default'}
                        ${s.saisi ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-slate-100 dark:bg-slate-800'}`}
                      data-testid={`toggle-saisi-${s.id}`}>
                      {s.saisi && <Check size={12} className="text-blue-600" />}
                    </button>
                  </TableCell>
                  {(canEdit || canToggleSaisi) && (
                    <TableCell className="py-2">
                      <div className="flex gap-1">
                        {canEdit && <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => startEdit(s)}><Edit2 size={12} /></Button>}
                        {canEdit && <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => duplicateSession(s.id)}><Copy size={12} /></Button>}
                        {canEdit && (confirmDelId === s.id ? (
                          <Button variant="destructive" size="sm" className="h-6 px-2 text-[10px] font-bold" onClick={() => deleteSession(s.id)} data-testid={`confirm-del-${s.id}`}>OK?</Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:bg-red-100" onClick={() => deleteSession(s.id)} title="Supprimer (cliquer 2x)" data-testid={`del-${s.id}`}><Trash2 size={12} /></Button>
                        ))}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length === 0 && <p className="text-center py-8 text-sm text-slate-500">Aucune seance trouvee</p>}
        </CardContent>
      </Card>

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
                <Label>Formateurs</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {formateurs.map(f => (
                    <label key={f.id} className={`flex items-center gap-1 px-2 py-1 rounded border text-xs cursor-pointer
                      ${(editSession.formateur_ids || []).includes(f.id) ? 'bg-slate-200 dark:bg-slate-700 border-slate-400' : 'border-slate-200 dark:border-slate-700'}`}>
                      <input type="checkbox" className="w-3 h-3"
                        checked={(editSession.formateur_ids || []).includes(f.id)}
                        onChange={e => {
                          const ids = editSession.formateur_ids || [];
                          setEditSession({ ...editSession, formateur_ids: e.target.checked ? [...ids, f.id] : ids.filter(i => i !== f.id) });
                        }} />
                      {f.initiales} - {f.prenom} {f.nom}
                    </label>
                  ))}
                </div>
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
