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
- Login JWT (admin / formateur / secretariat / super_admin / admin_coordination)
- Demande d'accès depuis Login (avec mot de passe choisi par l'utilisateur)
- Acceptation/refus depuis Administration → création automatique du compte
- Changement de mot de passe (dialog dans la sidebar)
- Suppression de compte (super_admin, sauf soi-même)

### Modules métiers
- CRUD complet : promotions, formateurs, UE, domaines, types d'activités, sites, groupes, années scolaires
- Sessions (création, édition, drag & drop, redimensionnement, duplication, multi-jours, journée entière → 2 demi-journées 7h, type Stage avec cap 35h/sem, **auto-link** vers fiche projet, **/deprogrammer** restaure l'activité)
- Absences : récurrence hebdomadaire / bi-mensuelle, période matin / après-midi / journée
- Coordination consolidée (3 onglets) : Séances, Fiches projets, Vacances
- Alertes **enrichies** (catégories : chevauchement / surcharge / sans_formateur / conflit_absence / autre + badges Auto + résolution locale)
- Récap heures (table + onglet Graphiques 6 charts recharts)
- Tableau de bord (filtres date / promo / semestre / année scolaire)

### Planning Global
- Vue semaine multi-promos (côte à côte ou empilé), drag & drop horaire ET inter-jour
- Jours fériés français + Vacances par promo
- **Sidebar "À programmer"** + drag-drop d'un bloc vers la sidebar pour déprogrammer
- Filtres Promo, Semestre, **Formateur**, **Type de cours**
- Texte agrandi sur les blocs (intitulé, UE, initiales formateurs)
- **Tooltip enrichie** au survol (UE titre, type+couleur, horaire, formateurs avec badge ID, promo, lieu, statut)

### Planning Macro
- Timeline annuelle multi-mois avec zoom + filtres domaines + mois
- **Sidebar "À programmer"** : items avec **badge type** (CM/TD/...), drag vers semaine pour planifier, drop d'une séance dessus pour la déprogrammer
- Tooltip détaillée

### Coordination > Fiches Projets
- UE **repliées par défaut** + boutons Tout déplier/replier
- Filtres Promotion, Semestre, **Domaine**, **Statut** (À programmer / Programmé)
- Champ **Temps (h) agrandi** (h-8 w-20)
- **Saisie fluide** (mémoïsation ActiviteRow + debounce 500ms, plus de lag)
- Auto-save vers backend toutes les 600ms

### Coordination > Séances modale
- **Champ Groupe** (Promo entière / groupes filtrés sur promo)

### Endpoints clés
- POST/GET/PUT/DELETE /api/fiches-projet
- GET /api/fiches-projet/a-programmer
- POST /api/fiches-projet/{id}/activites/{aid}/link-session, unlink-session
- POST /api/sessions/bulk
- POST /api/sessions/{id}/deprogrammer (supprime + déslie l'activité fiche)
- GET /api/holidays
- GET /api/alerts → schema enrichi {category, title, context, auto, heure_debut, heure_fin, ...}
- POST /api/auth/change-password
- POST /api/access-requests, PATCH/DELETE /api/access-requests/{id}
- DELETE /api/users/{id}

## Test Status
- Backend : 5/5 iter4 PASS (test_iter4_ux_batch.py) + 6/6 iter3 + 12/12 iter2
- Frontend : 100% des flows iter4 testés OK
- Credentials : admin@ifsi.fr / Admin123!

## Known Backlog (P2)
- Refactor server.py (~2100 lignes) en routers (auth, sessions, fiches_projet, vacances, dashboard, alerts)
- Replace native date/time pickers (modale Séance) par shadcn Calendar + select 24h
- Pagination/filtre par défaut sur Alertes (volume actuel ~80 alertes/an)
- Pre-fill complet (Type + Formateurs) lors d'un click sur "À programmer" depuis Coordination
- Pre-existing test failures (TestUserDelete, TestSessionsBulk) à mettre à jour (hors-scope)
- DialogContent a11y warning Radix (Missing Description)

## Date Log
- 2026-04 : MVP livré
- 2026-04 : Phases 1-4 (jours fériés, fiches projet, sessions/bulk, absences enrichies)
- 2026-05 : **Iter4 UX batch** — Coordination Fiches Projets (UE repliées, filtres, fix lag), Planning Global (sidebar À programmer + drag-déprogrammer + filtres formateur/type + texte agrandi + tooltip enrichie), Planning Macro (drag-déprogrammer + badge type sidebar), modale Coordination (Groupe), Alertes (refonte + catégories + Auto + résolution locale)

## Architecture Notes
- /app/backend/server.py : tout le backend (à splitter à terme)
- /app/frontend/src/pages : 1 fichier par page
- /app/frontend/src/pages/Coordination.js : composant ActiviteRow mémoïsé pour fluidité de saisie
