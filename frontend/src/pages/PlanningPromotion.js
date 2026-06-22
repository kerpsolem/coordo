import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { format, startOfWeek, endOfWeek, addWeeks, addDays, getWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';

export default function PlanningPromotion() {
  const { isAdmin, isSecretariat } = useAuth();
  const canEdit = isAdmin || isSecretariat;
  const [promotions, setPromotions] = useState([]);
  const [selectedPromo, setSelectedPromo] = useState('');
  const [sessions, setSessions] = useState([]);
  const [actTypes, setActTypes] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [ues, setUes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sites, setSites] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekNum = getWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    API.get('/promotions').then(r => setPromotions(r.data));
    API.get('/activity-types').then(r => setActTypes(r.data));
    API.get('/formateurs').then(r => setFormateurs(r.data));
    API.get('/ues').then(r => setUes(r.data));
    API.get('/groups').then(r => setGroups(r.data));
    API.get('/sites').then(r => setSites(r.data));
  }, []);

  const openEdit = (s) => {
    if (!canEdit) return;
    setEditing({ ...s, site_ids: s.site_ids || (s.site_id ? [s.site_id] : []), saisi: !!s.saisi });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      // secretariat ne peut toggle saisi que sur séances 'Valide' (sécurité côté back déjà mais soyons cohérents)
      const payload = { saisi: editing.saisi, site_ids: editing.site_ids };
      await API.put(`/sessions/${editing.id}`, payload);
      setEditing(null);
      fetchSessions();
    } catch (e) {
      alert(e.response?.data?.detail || 'Erreur lors de la sauvegarde');
    } finally { setSaving(false); }
  };

  const fetchSessions = useCallback(async () => {
    if (!selectedPromo) return;
    const params = {
      promotion_id: selectedPromo,
      date_debut: format(weekStart, 'yyyy-MM-dd'),
      date_fin: format(days[4], 'yyyy-MM-dd')
    };
    try {
      const { data } = await API.get('/sessions', { params });
      setSessions(data);
    } catch (e) { console.error(e); }
  }, [selectedPromo, currentDate]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const atMap = Object.fromEntries(actTypes.map(a => [a.id, a]));
  const fmMap = Object.fromEntries(formateurs.map(f => [f.id, f]));
  const ueMap = Object.fromEntries(ues.map(u => [u.id, u]));
  const grpMap = Object.fromEntries(groups.map(g => [g.id, g]));

  const totalHeures = sessions.reduce((s, ss) => s + (ss.duree || 0), 0);
  const heuresParType = {};
  const heuresParFormateur = {};
  sessions.forEach(s => {
    const tname = atMap[s.type_activite_id]?.nom || 'Autre';
    heuresParType[tname] = (heuresParType[tname] || 0) + (s.duree || 0);
    (s.formateur_ids || []).forEach(fid => {
      const fname = `${fmMap[fid]?.prenom || ''} ${fmMap[fid]?.nom || ''}`;
      heuresParFormateur[fname] = (heuresParFormateur[fname] || 0) + (s.duree || 0);
    });
  });

  return (
    <div className="space-y-4" data-testid="planning-promotion">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Par promotion</h1>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Select value={selectedPromo} onValueChange={setSelectedPromo}>
          <SelectTrigger className="w-52" data-testid="select-promotion"><SelectValue placeholder="Choisir une promotion" /></SelectTrigger>
          <SelectContent>{promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(d => addWeeks(d, -1))}><ChevronLeft size={16} /></Button>
          <span className="text-sm font-semibold px-2">S{weekNum} - {format(days[0], "d MMM", { locale: fr })} au {format(days[4], "d MMM yyyy", { locale: fr })}</span>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(d => addWeeks(d, 1))}><ChevronRight size={16} /></Button>
        </div>
      </div>

      {selectedPromo && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="py-3"><p className="text-xl font-bold">{totalHeures.toFixed(1)}h</p><p className="text-xs text-slate-500">Total heures</p></CardContent></Card>
            <Card><CardContent className="py-3"><p className="text-xl font-bold">{sessions.length}</p><p className="text-xs text-slate-500">Seances</p></CardContent></Card>
            <Card><CardContent className="py-3"><p className="text-xl font-bold">{Object.keys(heuresParFormateur).length}</p><p className="text-xs text-slate-500">Formateurs</p></CardContent></Card>
          </div>

          {/* Week overview */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Planning de la semaine</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                {days.map((day, i) => {
                  const dayStr = format(day, 'yyyy-MM-dd');
                  const daySessions = sessions.filter(s => s.date === dayStr).sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));
                  return (
                    <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <div className="bg-slate-100 dark:bg-slate-800 px-2 py-1.5 text-center">
                        <p className="text-xs text-slate-500 capitalize">{format(day, 'EEEE', { locale: fr })}</p>
                        <p className="text-sm font-semibold">{format(day, 'd MMM', { locale: fr })}</p>
                      </div>
                      <div className="p-1.5 space-y-1 min-h-[100px]">
                        {daySessions.map(s => {
                          const at = atMap[s.type_activite_id] || {};
                          const sGroupIds = s.group_ids || (s.group_id ? [s.group_id] : []);
                          const grpLabel = sGroupIds.map(gid => grpMap[gid]?.libelle).filter(Boolean).join(', ');
                          return (
                            <div key={s.id}
                                 className={`p-1.5 rounded text-[10px] border ${canEdit ? 'cursor-pointer hover:ring-2 hover:ring-coral-400 transition' : ''}`}
                                 style={{ backgroundColor: (at.couleur || '#94a3b8') + '20', borderColor: at.couleur || '#94a3b8' }}
                                 onClick={() => openEdit(s)}
                                 data-testid={`prom-session-${s.id}`}>
                              <div className="font-semibold flex items-center justify-between" style={{ color: at.couleur }}>
                                <span>{at.nom}</span>
                                {s.saisi && <span className="text-emerald-700 text-[9px] font-bold">✓ saisi</span>}
                              </div>
                              {s.intitule && (
                                <div className="font-semibold text-slate-900 dark:text-slate-100 truncate" title={s.intitule}>{s.intitule}</div>
                              )}
                              <div className="text-slate-600 dark:text-slate-400">{s.heure_debut}-{s.heure_fin}</div>
                              <div className="font-bold text-blue-700 dark:text-blue-300 truncate">{(s.formateur_ids || []).map(fid => fmMap[fid]?.initiales).join(', ')}</div>
                              {grpLabel && (
                                <div className="text-coral-700 dark:text-coral-300 font-medium truncate" title={grpLabel}>👥 {grpLabel}</div>
                              )}
                              {(s.site_ids?.length > 0 || s.site_id) && (
                                <div className="text-[9px] text-slate-500 truncate">📍 {(s.site_ids || [s.site_id]).map(sid => sites.find(x => x.id === sid)?.nom).filter(Boolean).join(', ')}</div>
                              )}
                            </div>
                          );
                        })}
                        {daySessions.length === 0 && <p className="text-[10px] text-slate-400 text-center mt-4">-</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Par type d'activite</CardTitle></CardHeader>
              <CardContent>
                {Object.entries(heuresParType).sort((a, b) => b[1] - a[1]).map(([t, h]) => (
                  <div key={t} className="flex justify-between py-1 text-sm"><span>{t}</span><span className="font-semibold">{h.toFixed(1)}h</span></div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Par formateur</CardTitle></CardHeader>
              <CardContent>
                {Object.entries(heuresParFormateur).sort((a, b) => b[1] - a[1]).map(([f, h]) => (
                  <div key={f} className="flex justify-between py-1 text-sm"><span>{f}</span><span className="font-semibold">{h.toFixed(1)}h</span></div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Sessions table */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Liste des seances</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Horaires</TableHead>
                  <TableHead className="text-xs">Type</TableHead><TableHead className="text-xs">Intitule</TableHead>
                  <TableHead className="text-xs">UE</TableHead><TableHead className="text-xs">Formateurs</TableHead>
                  <TableHead className="text-xs">Groupe</TableHead>
                  <TableHead className="text-xs">Salles</TableHead>
                  <TableHead className="text-xs text-center">Saisi</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {sessions.map(s => (
                    <TableRow key={s.id}
                              className={`text-xs ${canEdit ? 'cursor-pointer hover:bg-coral-50' : ''}`}
                              onClick={() => openEdit(s)}
                              data-testid={`prom-row-${s.id}`}>
                      <TableCell>{s.date}</TableCell>
                      <TableCell>{s.heure_debut}-{s.heure_fin}</TableCell>
                      <TableCell>{atMap[s.type_activite_id]?.nom}</TableCell>
                      <TableCell>{s.intitule}</TableCell>
                      <TableCell>{ueMap[s.ue_id]?.code_ue}</TableCell>
                      <TableCell className="font-bold">{(s.formateur_ids || []).map(fid => fmMap[fid]?.initiales).join(', ')}</TableCell>
                      <TableCell>{grpMap[s.group_id]?.libelle || '-'}</TableCell>
                      <TableCell>{(s.site_ids || (s.site_id ? [s.site_id] : [])).map(sid => sites.find(x => x.id === sid)?.nom).filter(Boolean).join(', ') || '-'}</TableCell>
                      <TableCell className="text-center">
                        {s.saisi
                          ? <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold text-[10px]">Oui</span>
                          : <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">Non</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Modifier la séance</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="text-sm text-slate-600 border-b pb-2">
                <div><strong>{atMap[editing.type_activite_id]?.nom}</strong> · {editing.intitule || ueMap[editing.ue_id]?.code_ue || '—'}</div>
                <div className="text-xs">{editing.date} · {editing.heure_debut}–{editing.heure_fin}</div>
              </div>
              <div className="flex items-center justify-between p-2 rounded border bg-slate-50">
                <Label className="text-sm">Saisi (validation administrative)</Label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4" checked={!!editing.saisi}
                         onChange={e => setEditing({ ...editing, saisi: e.target.checked })}
                         data-testid="edit-saisi" />
                  <span className={`text-xs font-semibold ${editing.saisi ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {editing.saisi ? 'Oui' : 'Non'}
                  </span>
                </label>
              </div>
              <div>
                <Label className="text-sm flex items-center gap-1"><MapPin size={14} /> Salles prévues</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5 p-2 rounded border max-h-40 overflow-y-auto" data-testid="edit-sites">
                  {sites.length === 0 && <span className="text-xs text-slate-400 italic">Aucun site disponible</span>}
                  {sites.map(site => {
                    const checked = (editing.site_ids || []).includes(site.id);
                    return (
                      <label key={site.id} className={`flex items-center gap-1 px-2 py-1 rounded border text-xs cursor-pointer ${checked ? 'bg-coral-100 border-coral-400 text-coral-700 font-semibold' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <input type="checkbox" className="w-3 h-3" checked={checked}
                          onChange={e => {
                            const next = e.target.checked
                              ? [...(editing.site_ids || []), site.id]
                              : (editing.site_ids || []).filter(x => x !== site.id);
                            setEditing({ ...editing, site_ids: next });
                          }} />
                        {site.nom}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
            <Button onClick={saveEdit} disabled={saving} className="bg-coral-500 hover:bg-coral-600 text-white" data-testid="edit-save">
              {saving ? 'Sauvegarde…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
