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
- Sessions (création, édition, drag & drop, redimensionnement, duplication, multi-jours, journée entière 7h, type Stage avec cap 35h/sem)
- Absences : récurrence hebdomadaire / **bi-mensuelle**, période **matin / après-midi / journée**, archivage auto
- Attribution des copies par formateur (calculs auto minutes/copie)
- Pense-bêtes (sticky notes avec horodatage)
- Tableau de bord (filtres date / promo / semestre / année scolaire / **Cours uniquement**)
- Récap heures (table par formateur/UE/promo + onglet **Graphiques** : 6 charts recharts)
- Alertes (filtre période : semestre / année scolaire / personnalisée)

### Planning Global
- Vue semaine multi-promos (côte à côte ou empilé), drag & drop horaire ET inter-jour
- Affichage **jours fériés français** (couleur violette distincte)
- Création par clic-glisser / multi-jours (date_debut → date_fin) / journée entière 8h30-16h30
- Bouton **"Tous les formateurs"** dans la sélection
- Avertissement à la création sur jour férié

### Planning Macro
- Timeline annuelle multi-mois avec zoom
- Drag & drop entre semaines
- **Bouton Dupliquer** au survol des séances
- **Sidebar "À programmer"** : activités issues des fiches projet groupées par UE, drag-and-drop vers semaine, indicateur N/M, sync auto

### Coordination - Fiches projet (NOUVEAU)
- Onglet `/coordination` (sidebar : "Coordination · Fiches projet")
- CRUD fiches : UE + semestre + promotion + N activités
- Activités : nom, heures, promotion, taille (entière/demi/quart), ordre (flèches haut/bas)
- Lien automatique vers planning macro via colonne "À programmer"

### Endpoints clés
- POST/GET/PUT/DELETE /api/fiches-projet
- GET /api/fiches-projet/a-programmer
- POST /api/fiches-projet/{id}/activites/{aid}/link-session, unlink-session
- POST /api/sessions/bulk (multi_day / stage, exclude_holidays)
- GET /api/holidays?year= ou ?date_debut=&date_fin=
- POST /api/auth/change-password
- POST /api/access-requests, PATCH /api/access-requests/{id}, DELETE
- DELETE /api/users/{id}

## Date Log
- 2026-04 : MVP livré (template + auth + CRUD + planning global/macro/promotion/formateur)
- 2026-04 : Drag & drop + zoom + filtres + dashboard avec graph
- 2026-04 : Demande d'accès + change password + delete user (P0)
- 2026-04 : Onglet Graphiques du Récap Heures (6 charts)
- 2026-04 : **Phase 1-4** (jours fériés FR, sessions/bulk, fiches projet, absences bi-mensuelle/periode, Alertes period mode, Dashboard Cours-only, PlanningGlobal jours fériés/journée entière/multi-jours/all formateurs/horizontal D&D, PlanningMacro Duplicate + sidebar À programmer, nouvel onglet Coordination)

## Test Status
- Backend : 12/12 pytest PASS (iteration_2.json)
- Frontend : 100% des flows testés OK
- Credentials : admin@ifsi.fr / Admin123!

## Known Backlog (P2)
- Améliorer la vue "Par Promotion" (selon photo partagée précédemment)
- Notifications visuelles (Toasts) après chaque sauvegarde dans toute l'app
- Refactor server.py (1400+ lignes) en routers séparés

## Architecture Notes
- /app/backend/server.py : tout le backend (à splitter à terme)
- /app/frontend/src/pages : 1 fichier par page
- /app/frontend/src/components/Layout.js : sidebar + auth dialogs
