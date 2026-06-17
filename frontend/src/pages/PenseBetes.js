import { useState, useEffect, useRef } from 'react';
import API from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Edit2, Trash2, Check, X, GripVertical } from 'lucide-react';

const COLORS = ['#FEF08A', '#BBF7D0', '#BFDBFE', '#FED7AA', '#E9D5FF', '#FECDD3', '#D1FAE5', '#DBEAFE', '#FDE68A', '#F3E8FF'];

export default function PenseBetes() {
  const { isAdmin, user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [editNote, setEditNote] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [filterStatut, setFilterStatut] = useState('all');
  const boardRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await API.get('/sticky-notes');
      setNotes(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { load(); }, []);

  const startNew = () => {
    setEditNote({
      titre: '', contenu: '', couleur: COLORS[0], statut: 'non_resolu',
      date: '', afficher_planning: false,
      position_x: 50 + Math.random() * 200, position_y: 50 + Math.random() * 200
    });
    setShowDialog(true);
  };

  const startEdit = (note) => {
    setEditNote({ ...note });
    setShowDialog(true);
  };

  const save = async () => {
    try {
      if (editNote.id) await API.put(`/sticky-notes/${editNote.id}`, editNote);
      else await API.post('/sticky-notes', editNote);
      setShowDialog(false);
      load();
    } catch (e) { console.error(e); }
  };

  const del = async (id) => {
    if (!window.confirm('Supprimer ce pense-bete ?')) return;
    try { await API.delete(`/sticky-notes/${id}`); load(); } catch (e) { console.error(e); }
  };

  const handleMouseDown = (e, note) => {
    if (!isAdmin) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragging(note.id);
  };

  const handleMouseMove = (e) => {
    if (!dragging || !boardRef.current) return;
    const boardRect = boardRef.current.getBoundingClientRect();
    const x = e.clientX - boardRect.left - dragOffset.x;
    const y = e.clientY - boardRect.top - dragOffset.y;
    setNotes(prev => prev.map(n => n.id === dragging ? { ...n, position_x: Math.max(0, x), position_y: Math.max(0, y) } : n));
  };

  const handleMouseUp = async () => {
    if (!dragging) return;
    const note = notes.find(n => n.id === dragging);
    if (note) {
      try { await API.put(`/sticky-notes/${note.id}`, { position_x: note.position_x, position_y: note.position_y }); } catch {}
    }
    setDragging(null);
  };

  const fmtDt = (iso) => {
    if (!iso) return '';
    const d = iso.split('T')[0];
    const t = iso.split('T')[1];
    return t ? `${d} a ${t.slice(0, 5)}` : d;
  };

  const filteredNotes = filterStatut === 'all' ? notes : notes.filter(n => n.statut === filterStatut);

  return (
    <div className="space-y-4" data-testid="pense-betes">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Pense-betes</h1>
        <div className="flex gap-2 items-center">
          <Button variant={filterStatut === 'all' ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setFilterStatut('all')} data-testid="filter-all">Tous</Button>
          <Button variant={filterStatut === 'non_resolu' ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setFilterStatut('non_resolu')} data-testid="filter-non-resolu">Non resolus</Button>
          <Button variant={filterStatut === 'resolu' ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setFilterStatut('resolu')} data-testid="filter-resolu">Resolus</Button>
          {isAdmin && <Button onClick={startNew} data-testid="new-note"><Plus size={14} className="mr-1" />Nouveau</Button>}
        </div>
      </div>

      <div ref={boardRef} className="relative bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg min-h-[600px] overflow-hidden"
        onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        {filteredNotes.map(note => (
          <div
            key={note.id}
            data-testid={`note-${note.id}`}
            className={`absolute w-56 rounded-lg shadow-md border p-3 select-none
              ${note.statut === 'resolu' ? 'opacity-60' : ''} ${dragging === note.id ? 'z-50 shadow-xl scale-105' : 'z-10'}`}
            style={{
              left: note.position_x || 0, top: note.position_y || 0,
              backgroundColor: note.couleur || '#FEF08A', borderColor: note.couleur ? `${note.couleur}88` : '#fde68a',
              cursor: isAdmin ? 'grab' : 'default'
            }}
            onMouseDown={(e) => handleMouseDown(e, note)}
          >
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-1">
                {isAdmin && <GripVertical size={12} className="text-slate-500 cursor-grab" />}
                <span className="font-semibold text-sm text-slate-800 truncate">{note.titre}</span>
              </div>
              {note.statut === 'resolu' && <Check size={14} className="text-green-600 flex-shrink-0" />}
            </div>
            <p className="text-xs text-slate-700 whitespace-pre-wrap mb-2 line-clamp-4">{note.contenu}</p>
            <div className="text-[9px] text-slate-500 space-y-0.5">
              <div>Cree par {note.auteur} le {fmtDt(note.created_at)}</div>
              {note.modified_by && <div>Modifie par {note.modified_by} le {fmtDt(note.modified_at)}</div>}
            </div>
            {isAdmin && (
              <div className="flex gap-1 mt-2 pt-1 border-t border-slate-300/50">
                <button onClick={(e) => { e.stopPropagation(); startEdit(note); }} className="text-slate-600 hover:text-slate-900 p-0.5"><Edit2 size={11} /></button>
                <button onClick={(e) => { e.stopPropagation(); del(note.id); }} className="text-red-500 hover:text-red-700 p-0.5"><Trash2 size={11} /></button>
              </div>
            )}
          </div>
        ))}
        {filteredNotes.length === 0 && (
          <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
            {filterStatut === 'all' ? 'Aucun pense-bete. Cliquez sur "Nouveau" pour en creer un.' : `Aucun pense-bete ${filterStatut === 'resolu' ? 'resolu' : 'non resolu'}.`}
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editNote?.id ? 'Modifier' : 'Nouveau pense-bete'}</DialogTitle></DialogHeader>
          {editNote && (
            <div className="space-y-4">
              <div><Label>Titre</Label><Input value={editNote.titre || ''} onChange={e => setEditNote({ ...editNote, titre: e.target.value })} /></div>
              <div><Label>Contenu</Label><textarea className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={4}
                value={editNote.contenu || ''} onChange={e => setEditNote({ ...editNote, contenu: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="pb-date">Date concernée <span className="text-[10px] text-slate-400">(option)</span></Label>
                  <Input id="pb-date" type="date" value={editNote.date || ''} onChange={e => setEditNote({ ...editNote, date: e.target.value })} data-testid="pb-date" />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none" data-testid="pb-afficher-planning">
                    <input type="checkbox" className="w-4 h-4"
                      checked={!!editNote.afficher_planning}
                      onChange={e => setEditNote({ ...editNote, afficher_planning: e.target.checked })}
                      disabled={!editNote.date} />
                    <span className={!editNote.date ? 'text-slate-400' : ''}>Afficher sur planning</span>
                  </label>
                </div>
              </div>
              <div>
                <Label>Couleur</Label>
                <div className="flex gap-2 mt-1">
                  {COLORS.map(c => (
                    <button key={c} className={`w-7 h-7 rounded-full border-2 ${editNote.couleur === c ? 'border-slate-900 dark:border-white' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} onClick={() => setEditNote({ ...editNote, couleur: c })} />
                  ))}
                </div>
              </div>
              <div>
                <Label>Statut</Label>
                <div className="flex gap-3 mt-1">
                  <label className="flex items-center gap-1 text-sm">
                    <input type="radio" checked={editNote.statut === 'non_resolu'} onChange={() => setEditNote({ ...editNote, statut: 'non_resolu' })} />
                    Non resolu
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    <input type="radio" checked={editNote.statut === 'resolu'} onChange={() => setEditNote({ ...editNote, statut: 'resolu' })} />
                    Resolu
                  </label>
                </div>
              </div>
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
