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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Plus, Edit2, Trash2, Archive, ArchiveRestore, RefreshCw, Clock, CalendarOff } from 'lucide-react';

export default function AbsencesFormateurs() {
  const { isAdmin } = useAuth();
  const [absences, setAbsences] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [view, setView] = useState('en_cours');
  const [editItem, setEditItem] = useState(null);
  const [showDialog, setShowDialog] = useState(false);

  const load = useCallback(async () => {
    try {
      const [absRes, fmRes] = await Promise.all([
        API.get('/absences', { params: { status: view } }),
        API.get('/formateurs')
      ]);
      setAbsences(absRes.data);
      setFormateurs(fmRes.data);
    } catch (e) { console.error(e); }
  }, [view]);

  useEffect(() => { load(); }, [load]);

  const fmMap = Object.fromEntries(formateurs.map(f => [f.id, f]));
  const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const today = new Date().toISOString().split('T')[0];

  const startEdit = (item) => {
    setEditItem({ ...item, jours_recurrence: item.jours_recurrence || [] });
    setShowDialog(true);
  };

  const startNew = () => {
    setEditItem({
      formateur_id: '', date_debut: '', date_fin: '', journee_entiere: true, periode: 'journee',
      recurrence: false, type_recurrence: '', jours_recurrence: [], date_fin_recurrence: '', archived: false
    });
    setShowDialog(true);
  };

  const save = async () => {
    try {
      if (editItem.id) await API.put(`/absences/${editItem.id}`, editItem);
      else await API.post('/absences', editItem);
      setShowDialog(false);
      load();
    } catch (e) { console.error(e); }
  };

  const del = async (id) => {
    if (!window.confirm('Supprimer cette absence ?')) return;
    try { await API.delete(`/absences/${id}`); load(); } catch (e) { console.error(e); }
  };

  const toggleArchive = async (id, archived) => {
    try {
      await API.patch(`/absences/${id}/archive`, { archived });
      load();
    } catch (e) { console.error(e); }
  };

  const isExpired = (ab) => {
    if (ab.recurrence && ab.date_fin_recurrence) return ab.date_fin_recurrence < today;
    return (ab.date_fin || '') < today;
  };

  const viewLabels = {
    en_cours: { label: 'En cours', icon: Clock, desc: 'Absences actives ou recurrentes en cours' },
    passees: { label: 'Passees', icon: CalendarOff, desc: 'Absences dont la date est depassee' },
    archivees: { label: 'Archivees', icon: Archive, desc: 'Absences archivees manuellement' }
  };

  return (
    <div className="space-y-4" data-testid="absences-formateurs">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Absences formateurs</h1>
        <div className="flex gap-2">
          {Object.entries(viewLabels).map(([key, { label, icon: Icon }]) => (
            <Button key={key} variant={view === key ? 'default' : 'outline'} size="sm" className="h-8 text-xs"
              onClick={() => setView(key)} data-testid={`view-${key}`}>
              <Icon size={14} className="mr-1" />{label}
            </Button>
          ))}
          {isAdmin && <Button size="sm" className="h-8 text-xs" onClick={startNew} data-testid="new-absence"><Plus size={14} className="mr-1" />Nouvelle</Button>}
        </div>
      </div>

      <p className="text-xs text-slate-500">{viewLabels[view]?.desc}</p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Formateur</TableHead>
                <TableHead className="text-xs">Date debut</TableHead>
                <TableHead className="text-xs">Date fin</TableHead>
                <TableHead className="text-xs">Journee</TableHead>
                <TableHead className="text-xs">Periode</TableHead>
                <TableHead className="text-xs">Recurrence</TableHead>
                <TableHead className="text-xs">Jours</TableHead>
                <TableHead className="text-xs">Fin recurrence</TableHead>
                <TableHead className="text-xs">Statut</TableHead>
                {isAdmin && <TableHead className="text-xs">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {absences.map(ab => {
                const fm = fmMap[ab.formateur_id];
                const expired = isExpired(ab);
                return (
                  <TableRow key={ab.id} className={`text-sm ${expired && view === 'en_cours' ? 'opacity-50' : ''}`}>
                    <TableCell className="py-2">
                      <span className="font-bold mr-2">{fm?.initiales}</span>
                      {fm?.prenom} {fm?.nom}
                    </TableCell>
                    <TableCell className="py-2">{ab.date_debut}</TableCell>
                    <TableCell className="py-2">{ab.date_fin}</TableCell>
                    <TableCell className="py-2">{ab.journee_entiere ? 'Oui' : 'Non'}</TableCell>
                    <TableCell className="py-2 text-xs capitalize">{(ab.periode || 'journee').replace('_', ' ')}</TableCell>
                    <TableCell className="py-2">
                      {ab.recurrence ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400">
                          <RefreshCw size={10} className="inline mr-1" />{ab.type_recurrence}
                        </span>
                      ) : 'Non'}
                    </TableCell>
                    <TableCell className="py-2 text-xs capitalize">{(ab.jours_recurrence || []).join(', ')}</TableCell>
                    <TableCell className="py-2">{ab.date_fin_recurrence || '-'}</TableCell>
                    <TableCell className="py-2">
                      {ab.archived ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500">Archivee</span>
                      ) : expired ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600">Passee</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 dark:bg-green-900/30 text-green-600">En cours</span>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="py-2">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(ab)} title="Modifier"><Edit2 size={12} /></Button>
                          {!ab.archived ? (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-500" onClick={() => toggleArchive(ab.id, true)} title="Archiver">
                              <Archive size={12} />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-500" onClick={() => toggleArchive(ab.id, false)} title="Desarchiver">
                              <ArchiveRestore size={12} />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => del(ab.id)} title="Supprimer"><Trash2 size={12} /></Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {absences.length === 0 && <p className="text-center py-8 text-sm text-slate-500">Aucune absence dans cette categorie</p>}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editItem?.id ? 'Modifier l\'absence' : 'Nouvelle absence'}</DialogTitle></DialogHeader>
          {editItem && (
            <div className="space-y-4">
              <div>
                <Label>Formateur</Label>
                <Select value={editItem.formateur_id || ''} onValueChange={v => setEditItem({ ...editItem, formateur_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{formateurs.map(f => <SelectItem key={f.id} value={f.id}>{f.initiales} - {f.prenom} {f.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Date debut</Label><Input type="date" value={editItem.date_debut || ''} onChange={e => setEditItem({ ...editItem, date_debut: e.target.value })} /></div>
                <div><Label>Date fin</Label><Input type="date" value={editItem.date_fin || ''} onChange={e => setEditItem({ ...editItem, date_fin: e.target.value })} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={editItem.journee_entiere} onCheckedChange={v => setEditItem({ ...editItem, journee_entiere: v, periode: v ? 'journee' : (editItem.periode || 'matin') })} />
                Journee entiere
              </label>
              {!editItem.journee_entiere && (
                <div>
                  <Label>Periode</Label>
                  <Select value={editItem.periode || 'matin'} onValueChange={v => setEditItem({ ...editItem, periode: v })}>
                    <SelectTrigger data-testid="absence-periode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="matin">Matin</SelectItem>
                      <SelectItem value="apres_midi">Apres-midi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={editItem.recurrence || false} onCheckedChange={v => setEditItem({ ...editItem, recurrence: v })} />
                Recurrence
              </label>
              {editItem.recurrence && (
                <>
                  <div>
                    <Label>Type de recurrence</Label>
                    <Select value={editItem.type_recurrence || ''} onValueChange={v => setEditItem({ ...editItem, type_recurrence: v })}>
                      <SelectTrigger data-testid="absence-type-recurrence"><SelectValue placeholder="Choisir" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hebdomadaire">Hebdomadaire (toutes les semaines)</SelectItem>
                        <SelectItem value="bimensuelle">Bi-mensuelle (toutes les 2 semaines)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Jours concernes</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {JOURS.map(j => (
                        <label key={j} className={`px-2 py-1 rounded border text-xs cursor-pointer capitalize
                          ${(editItem.jours_recurrence || []).includes(j) ? 'bg-slate-200 dark:bg-slate-700 border-slate-400' : 'border-slate-200 dark:border-slate-700'}`}>
                          <input type="checkbox" className="sr-only"
                            checked={(editItem.jours_recurrence || []).includes(j)}
                            onChange={e => {
                              const jours = editItem.jours_recurrence || [];
                              setEditItem({ ...editItem, jours_recurrence: e.target.checked ? [...jours, j] : jours.filter(x => x !== j) });
                            }} />
                          {j}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div><Label>Date fin recurrence</Label><Input type="date" value={editItem.date_fin_recurrence || ''} onChange={e => setEditItem({ ...editItem, date_fin_recurrence: e.target.value })} /></div>
                </>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowDialog(false)}>Annuler</Button>
                <Button onClick={save}>Enregistrer</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
