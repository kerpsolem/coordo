# PRD - IFSI Planning (Coordination pédagogique)

## Original Problem Statement
Application web complète pour l'équipe coordination d'un IFSI (Institut de Formation en Soins Infirmiers).
Gérer plannings pédagogiques, charges des formateurs, répartition des cours, attribution des copies, planning macro/global. Rôles : super_admin, admin_coordination, formateur, secretariat, public/lecture seule. Drag & drop, filtres complexes, calculs heures vs quotas, gestion absences avec récurrences, dashboard avec KPI, contraintes UX écran large.

## Stack Technique
- Frontend : React + Tailwind + Shadcn UI + recharts + react-router
- Backend : FastAPI + Motor + bcrypt + JWT
- DB : MongoDB

## What's Implemented (cumul)

### Auth & Sécurité
- Login JWT, demande d'accès, change password, delete user (super_admin)

### Modules métiers
- CRUD : promotions, formateurs, UE, domaines, types d'activités, sites, groupes, années scolaires
- Sessions : drag & drop horaire/inter-jour, multi-jours, journée entière split AM/PM, auto-link fiche projet, /deprogrammer
- Absences : récurrence hebdo/bi-mensuelle + matin/après-midi/journée
- Coordination consolidée (Séances + Fiches projets + Vacances)
- Alertes catégorisées (chevauchement / surcharge / sans_formateur / conflit_absence / autre) + résolution localStorage
- Récap heures + **NEW : Récap UE détaillé** (formule temps formateur = heures × nb_formateurs × nb_groupes)
- Tableau de bord avec filtres

### Planning Global
- Vue semaine multi-promos avec drag&drop + filtres Promotion / Semestre / Formateur / Type
- Jours fériés FR + vacances par promo
- Sidebar "Programmation des séances" (pills colorées groupées par promo)
- Drag depuis sidebar → planning : crée séance + lie automatiquement à l'activité fiche (avec **validation promo + semestre**)
- Drag d'une séance vers la sidebar = déprogrammer
- **NEW : toggle Afficher/Masquer sidebar** (data-testid toggle-sidebar-aprog)
- **NEW : sélecteur de jours** (Lun/Mar/Mer/Jeu/Ven, data-testid day-toggle-0..4 / day-all)
- Tooltip enrichie au survol (UE titre, formateur badge ID, horaire, durée, promo, lieu)

### Planning Macro
- Timeline annuelle multi-mois + zoom + filtres domaines + mois
- Sidebar "À programmer" avec badge type + drag-to-grid + drop sidebar = déprogrammer

### Coordination > Fiches Projets
- UE repliées par défaut + Tout déplier/replier + filtres (Promo/Semestre/Domaine/Statut)
- Champ Temps (h) agrandi + saisie fluide (mémoïsation + debounce 500ms)
- Marquage visuel ambre des séquences sans semaine_souhaitee + badge "X à programmer" sur header
- **NEW : multi-sélection de groupes** (GroupMultiSelect : préréglage Promo entière/Demi/1/4/1/8 + checkboxes groupes spécifiques de la promo)
- **NEW : champ Nb formateurs** optionnel (data-testid act-nbform-*)
- Auto-import "Récup. séances" : remplit auto N° semaine ISO + nb_formateurs + group_ids depuis les séances

### Coordination > Séances modale
- Champ Groupe (Promo entière + groupes filtrés sur promo)

### RecapHeures
- Onglets : Par formateur / Par promotion / Par type / Par semaine / Par semestre / Par UE / Graphiques
- **NEW : Onglet "Par UE" détaillé** : table expandable, formule `heures × nb_formateurs × nb_groupes`, répartition par type d'activité, détail des séances/activités, totaux globaux heures et temps formateur

### Endpoints clés
- POST/GET/PUT/DELETE /api/fiches-projet
- GET /api/fiches-projet/a-programmer
- POST /api/fiches-projet/{id}/activites/{aid}/link-session, unlink-session
- POST /api/fiches-projet/import-sessions (enrichi : semaine_souhaitee, nb_formateurs, group_ids, formateur_ids)
- POST /api/sessions/{id}/deprogrammer
- POST /api/sessions/bulk
- GET /api/holidays
- GET /api/alerts (schema enrichi)
- GET /api/recap-ue (NEW : détail UE avec temps formateur)
- POST /api/auth/change-password
- POST /api/access-requests, PATCH/DELETE /api/access-requests/{id}
- DELETE /api/users/{id}

## Test Status
- Backend : 6/6 iter6 + 5/5 iter5 + 5/5 iter4 + 6/6 iter3 + 12/12 iter2 = **34/34 PASS**
- Frontend : 100% sur les flows iter6 testés
- Credentials : admin@ifsi.fr / Admin123!

## Known Backlog (P2)
- Refactor server.py (~2249 lignes) en routers
- Splitter PlanningGlobal.js (~898 lignes) en sous-composants (DaySelector, SidebarAProgrammer)
- Remplacer pickers natifs date/time (modale Séance) par shadcn Calendar
- Pagination Alertes pour gros volumes
- Ajouter data-testid sur cellules jour pour E2E drag tests
- Pre-existing test failures (TestUserDelete, TestSessionsBulk) à mettre à jour
- DialogContent a11y warning Radix (Missing Description)

## Date Log
- 2026-04 : MVP livré
- 2026-04 : Phases 1-4 (jours fériés, fiches projet, sessions/bulk, absences enrichies)
- 2026-05 : **Iter4** Coordination Fiches Projets + Planning Global drag-déprogrammer + filtres + tooltip + Alertes refonte
- 2026-05 : **Iter5** Drag activity → grid PlanningGlobal + sidebar pills par promo + visuel "à programmer" Fiches Projets
- 2026-05 : **Iter6** Validation drop promo+semestre + sélecteur jours + toggle sidebar + nb_formateurs + multi-groupes + Récap UE détaillé (formule temps formateur)
- 2026-06 : **TICE Gantt** module créé (sous-projets, mardis identifiés, drag/resize bars, drag progression). Refonte UI complète selon maquette (palette coral/cream/navy ajoutée à tailwind.config, en-tête clair, barres rondes durée+progression, badges pâles). Suppression du double Layout (ProtectedRoute enveloppe déjà).
- 2026-06 : **nb_formateurs_requis** ajouté sur les séances (champ + auto-default selon type d'activité via flag `is_cours` de /administration, exception TPG=0). Refonte `/workload` (formule équitable : `ref_i = total_cours_requis × quotité_i / capacité_totale`). Alertes "Surcharge" maintenant déclenchées sur la période (écart > max(10%·ref, 5h) au lieu de l'ancien seuil >8.5h/jour). Page "Par formateur" : 4 KPI cards (Volume global, Volume théorique, Heures assignées, Écart). Recap heures : 5 KPI cards. Modale Session : input "Requis" + badge live "X / Y" (rouge incomplet, vert complet, ambre surnombre). Endpoint `/migrations/backfill-nb-formateurs-requis?recompute=true` pour ré-aligner les données existantes.
- 2026-06 : **Highlight filtres actifs** : nouvelle classe `.filter-active` (coral 100/500/700) appliquée automatiquement aux `<SelectTrigger>` et checkboxes dont la valeur ≠ 'all'/vide via helper `/lib/filterCls.js`. Appliqué sur Dashboard, RecapHeures, PlanningGlobal, PlanningFormateur. Tableau de bord enrichi : nouvelle colonne **"par étudiant"** (créneaux parallèles dédoublonnés) côté backend `/dashboard.heures_par_etudiant`.

## Architecture Notes
- /app/backend/server.py : monolithique (à splitter)
- /app/frontend/src/pages : 1 fichier par page
- /app/frontend/src/pages/Coordination.js : ActiviteRow mémoïsé + GroupMultiSelect + FormateurMultiSelect
- /app/frontend/src/pages/PlanningGlobal.js : drop validation isDropAllowed, dropActivityOnDay avec alert si promo/semestre mismatch
