import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfWeek, endOfWeek, addWeeks, addDays, getWeek } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function PlanningPromotion() {
  const [promotions, setPromotions] = useState([]);
  const [selectedPromo, setSelectedPromo] = useState('');
  const [sessions, setSessions] = useState([]);
  const [actTypes, setActTypes] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [ues, setUes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());

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
  }, []);

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
                          return (
                            <div key={s.id} className="p-1.5 rounded text-[10px] border" style={{ backgroundColor: (at.couleur || '#94a3b8') + '20', borderColor: at.couleur || '#94a3b8' }}>
                              <div className="font-semibold" style={{ color: at.couleur }}>{at.nom}</div>
                              <div className="text-slate-600 dark:text-slate-400">{s.heure_debut}-{s.heure_fin}</div>
                              <div className="font-bold text-black dark:text-white">{(s.formateur_ids || []).map(fid => fmMap[fid]?.initiales).join(', ')}</div>
                              {s.intitule && <div className="truncate">{s.intitule}</div>}
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
                </TableRow></TableHeader>
                <TableBody>
                  {sessions.map(s => (
                    <TableRow key={s.id} className="text-xs">
                      <TableCell>{s.date}</TableCell>
                      <TableCell>{s.heure_debut}-{s.heure_fin}</TableCell>
                      <TableCell>{atMap[s.type_activite_id]?.nom}</TableCell>
                      <TableCell>{s.intitule}</TableCell>
                      <TableCell>{ueMap[s.ue_id]?.code_ue}</TableCell>
                      <TableCell className="font-bold">{(s.formateur_ids || []).map(fid => fmMap[fid]?.initiales).join(', ')}</TableCell>
                      <TableCell>{grpMap[s.group_id]?.libelle || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
