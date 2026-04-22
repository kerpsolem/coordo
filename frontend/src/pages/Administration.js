import { useState, useEffect } from 'react';
import API from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Plus, Edit2, Trash2, Database, Users, MapPin, BookOpen, Layers, GraduationCap, Calendar as CalIcon, Settings } from 'lucide-react';

function CrudTable({ title, icon: Icon, items, columns, onAdd, onEdit, onDelete, isAdmin }) {
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold flex items-center gap-2"><Icon size={16} />{title}</CardTitle>
        {isAdmin && <Button size="sm" onClick={onAdd} data-testid={`add-${title.toLowerCase().replace(/ /g,'-')}`}><Plus size={14} className="mr-1" />Ajouter</Button>}
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>{columns.map(c => <TableHead key={c.key} className="text-xs">{c.label}</TableHead>)}{isAdmin && <TableHead className="text-xs w-20">Actions</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id} className="text-sm">
                {columns.map(c => <TableCell key={c.key} className="py-2">{c.render ? c.render(item) : item[c.key] || '-'}</TableCell>)}
                {isAdmin && (
                  <TableCell className="py-2">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(item)}><Edit2 size={12} /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => onDelete(item.id)}><Trash2 size={12} /></Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {items.length === 0 && <p className="text-center py-6 text-sm text-slate-500">Aucun element</p>}
      </CardContent>
    </Card>
  );
}

export default function Administration() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const [tab, setTab] = useState('formateurs');
  const [formateurs, setFormateurs] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sites, setSites] = useState([]);
  const [actTypes, setActTypes] = useState([]);
  const [domains, setDomains] = useState([]);
  const [ues, setUes] = useState([]);
  const [schoolYears, setSchoolYears] = useState([]);
  const [users, setUsers] = useState([]);
  const [editItem, setEditItem] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogType, setDialogType] = useState('');

  const loadAll = async () => {
    try {
      const [fm, pr, gr, si, at, dm, ue, sy] = await Promise.all([
        API.get('/formateurs'), API.get('/promotions'), API.get('/groups'),
        API.get('/sites'), API.get('/activity-types'), API.get('/domains'),
        API.get('/ues'), API.get('/school-years')
      ]);
      setFormateurs(fm.data); setPromotions(pr.data); setGroups(gr.data);
      setSites(si.data); setActTypes(at.data); setDomains(dm.data);
      setUes(ue.data); setSchoolYears(sy.data);
      try { const u = await API.get('/users'); setUsers(u.data); } catch {}
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadAll(); }, []);

  const domMap = Object.fromEntries(domains.map(d => [d.id, d]));

  const openDialog = (type, item = null) => {
    setDialogType(type);
    setEditItem(item || {});
    setShowDialog(true);
  };

  const save = async () => {
    const endpoints = { formateurs: '/formateurs', promotions: '/promotions', groups: '/groups', sites: '/sites',
      actTypes: '/activity-types', domains: '/domains', ues: '/ues', schoolYears: '/school-years', users: '/users' };
    const ep = endpoints[dialogType];
    try {
      if (editItem.id) await API.put(`${ep}/${editItem.id}`, editItem);
      else await API.post(ep, editItem);
      setShowDialog(false);
      loadAll();
    } catch (e) { console.error(e); }
  };

  const del = async (type, id) => {
    if (!window.confirm('Supprimer ?')) return;
    const endpoints = { formateurs: '/formateurs', promotions: '/promotions', groups: '/groups', sites: '/sites',
      actTypes: '/activity-types', domains: '/domains', ues: '/ues', schoolYears: '/school-years', users: '/users' };
    try { await API.delete(`${endpoints[type]}/${id}`); loadAll(); } catch (e) { console.error(e); }
  };

  const seedData = async () => {
    if (!window.confirm('Regenerer les donnees de demonstration ? Cela supprimera les donnees existantes.')) return;
    try { await API.post('/seed'); loadAll(); } catch (e) { console.error(e); }
  };

  const renderField = (key, label, type = 'text', options = null) => (
    <div key={key}>
      <Label>{label}</Label>
      {options ? (
        <Select value={String(editItem?.[key] || '')} onValueChange={v => setEditItem({ ...editItem, [key]: v })}>
          <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
          <SelectContent>{options.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      ) : type === 'checkbox' ? (
        <div className="mt-1"><Checkbox checked={editItem?.[key] || false} onCheckedChange={v => setEditItem({ ...editItem, [key]: v })} /></div>
      ) : (
        <Input type={type} value={editItem?.[key] || ''} onChange={e => setEditItem({ ...editItem, [key]: type === 'number' ? Number(e.target.value) : e.target.value })} />
      )}
    </div>
  );

  const dialogFields = {
    formateurs: [
      ['nom', 'Nom'], ['prenom', 'Prenom'], ['email', 'Email', 'email'], ['initiales', 'Initiales'],
      ['statut', 'Statut', 'select', [{ value: 'Formateur', label: 'Formateur' }, { value: 'Vacataire', label: 'Vacataire' }]],
      ['quotite', 'Quotite (%)', 'number'], ['birth_day', 'Jour naissance', 'number'], ['birth_month', 'Mois naissance', 'number'], ['remarques', 'Remarques']
    ],
    promotions: [
      ['nom', 'Nom'], ['annee_entree', 'Annee entree', 'number'], ['annee_sortie', 'Annee sortie', 'number'],
      ['annee_scolaire', 'Annee scolaire']
    ],
    groups: [['libelle', 'Libelle']],
    sites: [['nom', 'Nom'], ['remarques', 'Remarques']],
    actTypes: [
      ['nom', 'Nom'], ['categorie', 'Categorie'], ['couleur', 'Couleur', 'color'],
      ['is_cours', 'Activite de cours', 'checkbox']
    ],
    domains: [['nom', 'Nom'], ['description', 'Description']],
    ues: [
      ['intitule', 'Intitule'], ['code_ue', 'Code UE'],
      ['domain_id', 'Domaine', 'select', domains.map(d => ({ value: d.id, label: d.nom }))],
      ['reforme', 'Reforme', 'select', [{ value: 'nouvelle', label: 'Nouvelle reforme' }, { value: 'ancienne', label: 'Ancienne reforme' }]],
      ['semestre', 'Semestre', 'select', ['S1','S2','S3','S4','S5','S6'].map(s => ({ value: s, label: s }))]
    ],
    schoolYears: [['nom', 'Nom'], ['annee_debut', 'Annee debut', 'number'], ['annee_fin', 'Annee fin', 'number'], ['date_debut', 'Date debut', 'date'], ['date_fin', 'Date fin', 'date']],
    users: [
      ['nom', 'Nom'], ['prenom', 'Prenom'], ['email', 'Email', 'email'],
      ['role', 'Role', 'select', [
        { value: 'super_admin', label: 'Super Admin' }, { value: 'admin_coordination', label: 'Admin Coordination' },
        { value: 'secretariat', label: 'Secretariat' },
        { value: 'formateur', label: 'Formateur' }, { value: 'lecture_seule', label: 'Lecture seule' }
      ]],
      ['password', 'Mot de passe', 'password']
    ]
  };

  return (
    <div className="space-y-4" data-testid="administration">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Administration</h1>
        {isAdmin && (
          <Button variant="outline" onClick={seedData} data-testid="seed-data-btn">
            <Database size={14} className="mr-2" /> Donnees de demonstration
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="formateurs">Formateurs</TabsTrigger>
          <TabsTrigger value="promotions">Promotions</TabsTrigger>
          <TabsTrigger value="groups">Groupes</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="actTypes">Types activite</TabsTrigger>
          <TabsTrigger value="domains">Domaines</TabsTrigger>
          <TabsTrigger value="ues">UEs</TabsTrigger>
          <TabsTrigger value="schoolYears">Annees scolaires</TabsTrigger>
          {isSuperAdmin && <TabsTrigger value="users">Utilisateurs</TabsTrigger>}
        </TabsList>

        <TabsContent value="formateurs">
          <CrudTable title="Formateurs" icon={Users} items={formateurs} isAdmin={isAdmin}
            columns={[{ key: 'initiales', label: 'Init.' }, { key: 'nom', label: 'Nom' }, { key: 'prenom', label: 'Prenom' },
              { key: 'statut', label: 'Statut' }, { key: 'quotite', label: 'Quotite', render: i => `${i.quotite || 100}%` },
              { key: 'email', label: 'Email' }]}
            onAdd={() => openDialog('formateurs')} onEdit={i => openDialog('formateurs', i)} onDelete={id => del('formateurs', id)} />
        </TabsContent>
        <TabsContent value="promotions">
          <CrudTable title="Promotions" icon={GraduationCap} items={promotions} isAdmin={isAdmin}
            columns={[{ key: 'nom', label: 'Nom' }, { key: 'annee_entree', label: 'Entree' }, { key: 'annee_sortie', label: 'Sortie' },
              { key: 'annee_scolaire', label: 'Annee scolaire' }]}
            onAdd={() => openDialog('promotions')} onEdit={i => openDialog('promotions', i)} onDelete={id => del('promotions', id)} />
        </TabsContent>
        <TabsContent value="groups">
          <CrudTable title="Groupes" icon={Layers} items={groups} isAdmin={isAdmin}
            columns={[{ key: 'libelle', label: 'Libelle' }]}
            onAdd={() => openDialog('groups')} onEdit={i => openDialog('groups', i)} onDelete={id => del('groups', id)} />
        </TabsContent>
        <TabsContent value="sites">
          <CrudTable title="Sites" icon={MapPin} items={sites} isAdmin={isAdmin}
            columns={[{ key: 'nom', label: 'Nom' }, { key: 'remarques', label: 'Remarques' }]}
            onAdd={() => openDialog('sites')} onEdit={i => openDialog('sites', i)} onDelete={id => del('sites', id)} />
        </TabsContent>
        <TabsContent value="actTypes">
          <CrudTable title="Types d'activite" icon={BookOpen} items={actTypes} isAdmin={isAdmin}
            columns={[{ key: 'nom', label: 'Nom' }, { key: 'categorie', label: 'Categorie' },
              { key: 'couleur', label: 'Couleur', render: i => <div className="flex items-center gap-2"><div className="w-4 h-4 rounded" style={{ backgroundColor: i.couleur }} />{i.couleur}</div> },
              { key: 'is_cours', label: 'Cours', render: i => i.is_cours ? 'Oui' : 'Non' }]}
            onAdd={() => openDialog('actTypes')} onEdit={i => openDialog('actTypes', i)} onDelete={id => del('actTypes', id)} />
        </TabsContent>
        <TabsContent value="domains">
          <CrudTable title="Domaines" icon={Layers} items={domains} isAdmin={isAdmin}
            columns={[{ key: 'nom', label: 'Nom' }, { key: 'description', label: 'Description' }]}
            onAdd={() => openDialog('domains')} onEdit={i => openDialog('domains', i)} onDelete={id => del('domains', id)} />
        </TabsContent>
        <TabsContent value="ues">
          <CrudTable title="Unites d'Enseignement" icon={BookOpen} items={ues} isAdmin={isAdmin}
            columns={[{ key: 'code_ue', label: 'Code' }, { key: 'intitule', label: 'Intitule' },
              { key: 'domain_id', label: 'Domaine', render: i => domMap[i.domain_id]?.nom || '-' },
              { key: 'semestre', label: 'Semestre' }, { key: 'reforme', label: 'Reforme' }]}
            onAdd={() => openDialog('ues')} onEdit={i => openDialog('ues', i)} onDelete={id => del('ues', id)} />
        </TabsContent>
        <TabsContent value="schoolYears">
          <CrudTable title="Annees scolaires" icon={CalIcon} items={schoolYears} isAdmin={isAdmin}
            columns={[{ key: 'nom', label: 'Nom' }, { key: 'annee_debut', label: 'Debut' }, { key: 'annee_fin', label: 'Fin' },
              { key: 'date_debut', label: 'Date debut' }, { key: 'date_fin', label: 'Date fin' }]}
            onAdd={() => openDialog('schoolYears')} onEdit={i => openDialog('schoolYears', i)} onDelete={id => del('schoolYears', id)} />
        </TabsContent>
        {isSuperAdmin && (
          <TabsContent value="users">
            <CrudTable title="Utilisateurs" icon={Users} items={users} isAdmin={isSuperAdmin}
              columns={[{ key: 'nom', label: 'Nom' }, { key: 'prenom', label: 'Prenom' }, { key: 'email', label: 'Email' },
                { key: 'role', label: 'Role', render: i => i.role?.replace('_', ' ') }]}
              onAdd={() => openDialog('users')} onEdit={i => openDialog('users', i)} onDelete={id => del('users', id)} />
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editItem?.id ? 'Modifier' : 'Ajouter'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {(dialogFields[dialogType] || []).map(([key, label, type, options]) =>
              renderField(key, label, type || 'text', options)
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Annuler</Button>
            <Button onClick={save} data-testid="save-admin-item">Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
