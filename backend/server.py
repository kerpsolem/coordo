from pathlib import Path
from dotenv import load_dotenv
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, bcrypt, jwt
from datetime import datetime, timezone, timedelta, date
from typing import Optional
import calendar as cal_module
import random

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

JWT_SECRET = os.environ.get('JWT_SECRET', 'default-secret')
JWT_ALG = "HS256"
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# ===================== AUTH HELPERS =====================
def hash_pw(pw):
    return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_pw(pw, h):
    return bcrypt.checkpw(pw.encode('utf-8'), h.encode('utf-8'))

def make_token(uid, email, hours=24):
    return jwt.encode({"sub": uid, "email": email, "exp": datetime.now(timezone.utc) + timedelta(hours=hours), "type": "access"}, JWT_SECRET, algorithm=JWT_ALG)

async def get_user(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Non authentifie")
    try:
        p = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if p.get("type") != "access":
            raise HTTPException(401, "Token invalide")
        user = await db.users.find_one({"id": p["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(401, "Utilisateur non trouve")
        return {k: v for k, v in user.items() if k != "password_hash"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expire")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token invalide")

async def require_admin(request: Request):
    u = await get_user(request)
    if u.get("role") not in ["super_admin", "admin_coordination"]:
        raise HTTPException(403, "Acces non autorise")
    return u

async def require_admin_or_secretariat(request: Request):
    u = await get_user(request)
    if u.get("role") not in ["super_admin", "admin_coordination", "secretariat"]:
        raise HTTPException(403, "Acces non autorise")
    return u

# ===================== AUTH ROUTES =====================
@api_router.post("/auth/login")
async def login(request: Request, response: Response):
    b = await request.json()
    email = b.get("email", "").lower().strip()
    pw = b.get("password", "")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_pw(pw, user.get("password_hash", "")):
        raise HTTPException(401, "Email ou mot de passe incorrect")
    token = make_token(user["id"], user["email"])
    response.set_cookie("access_token", token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    safe = {k: v for k, v in user.items() if k != "password_hash"}
    safe["token"] = token
    return safe

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"message": "Deconnexion reussie"}

@api_router.get("/auth/me")
async def auth_me(request: Request):
    return await get_user(request)

# ===================== GENERIC CRUD =====================
def clean_doc(doc):
    if doc is None:
        return None
    return {k: v for k, v in doc.items() if k != "_id"}

async def crud_list(coll, query=None, sort=None, limit=2000):
    cursor = db[coll].find(query or {}, {"_id": 0})
    if sort:
        cursor = cursor.sort(sort)
    return await cursor.to_list(limit)

async def crud_get(coll, id):
    doc = await db[coll].find_one({"id": id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Non trouve")
    return doc

async def crud_create(coll, data):
    data["id"] = str(uuid.uuid4())
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    await db[coll].insert_one(data)
    return clean_doc(data)

async def crud_update(coll, id, data):
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data.pop("_id", None)
    data.pop("id", None)
    r = await db[coll].find_one_and_update({"id": id}, {"$set": data}, return_document=True)
    if not r:
        raise HTTPException(404, "Non trouve")
    return clean_doc(r)

async def crud_delete(coll, id):
    r = await db[coll].delete_one({"id": id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Non trouve")
    return {"message": "Supprime"}

# ===================== FORMATEURS =====================
@api_router.get("/formateurs")
async def list_formateurs():
    return await crud_list("formateurs", sort=[("nom", 1)])

@api_router.post("/formateurs")
async def create_formateur(request: Request):
    await require_admin(request)
    b = await request.json()
    return await crud_create("formateurs", b)

@api_router.put("/formateurs/{id}")
async def update_formateur(id: str, request: Request):
    await require_admin(request)
    b = await request.json()
    return await crud_update("formateurs", id, b)

@api_router.delete("/formateurs/{id}")
async def delete_formateur(id: str, request: Request):
    await require_admin(request)
    return await crud_delete("formateurs", id)

# ===================== PROMOTIONS =====================
@api_router.get("/promotions")
async def list_promotions():
    return await crud_list("promotions", sort=[("annee_entree", -1)])

@api_router.post("/promotions")
async def create_promotion(request: Request):
    await require_admin(request)
    return await crud_create("promotions", await request.json())

@api_router.put("/promotions/{id}")
async def update_promotion(id: str, request: Request):
    await require_admin(request)
    return await crud_update("promotions", id, await request.json())

@api_router.delete("/promotions/{id}")
async def delete_promotion(id: str, request: Request):
    await require_admin(request)
    return await crud_delete("promotions", id)

# ===================== GROUPS =====================
@api_router.get("/groups")
async def list_groups():
    return await crud_list("groups", sort=[("libelle", 1)])

@api_router.post("/groups")
async def create_group(request: Request):
    await require_admin(request)
    return await crud_create("groups", await request.json())

@api_router.put("/groups/{id}")
async def update_group(id: str, request: Request):
    await require_admin(request)
    return await crud_update("groups", id, await request.json())

@api_router.delete("/groups/{id}")
async def delete_group(id: str, request: Request):
    await require_admin(request)
    return await crud_delete("groups", id)

# ===================== SITES =====================
@api_router.get("/sites")
async def list_sites():
    return await crud_list("sites", sort=[("nom", 1)])

@api_router.post("/sites")
async def create_site(request: Request):
    await require_admin(request)
    return await crud_create("sites", await request.json())

@api_router.put("/sites/{id}")
async def update_site(id: str, request: Request):
    await require_admin(request)
    return await crud_update("sites", id, await request.json())

@api_router.delete("/sites/{id}")
async def delete_site(id: str, request: Request):
    await require_admin(request)
    return await crud_delete("sites", id)

# ===================== ACTIVITY TYPES =====================
@api_router.get("/activity-types")
async def list_activity_types():
    return await crud_list("activity_types", sort=[("nom", 1)])

@api_router.post("/activity-types")
async def create_activity_type(request: Request):
    await require_admin(request)
    return await crud_create("activity_types", await request.json())

@api_router.put("/activity-types/{id}")
async def update_activity_type(id: str, request: Request):
    await require_admin(request)
    return await crud_update("activity_types", id, await request.json())

@api_router.delete("/activity-types/{id}")
async def delete_activity_type(id: str, request: Request):
    await require_admin(request)
    return await crud_delete("activity_types", id)

# ===================== DOMAINS =====================
@api_router.get("/domains")
async def list_domains():
    return await crud_list("domains", sort=[("nom", 1)])

@api_router.post("/domains")
async def create_domain(request: Request):
    await require_admin(request)
    return await crud_create("domains", await request.json())

@api_router.put("/domains/{id}")
async def update_domain(id: str, request: Request):
    await require_admin(request)
    return await crud_update("domains", id, await request.json())

@api_router.delete("/domains/{id}")
async def delete_domain(id: str, request: Request):
    await require_admin(request)
    return await crud_delete("domains", id)

# ===================== UES =====================
@api_router.get("/ues")
async def list_ues():
    return await crud_list("ues", sort=[("code_ue", 1)])

@api_router.post("/ues")
async def create_ue(request: Request):
    await require_admin(request)
    return await crud_create("ues", await request.json())

@api_router.put("/ues/{id}")
async def update_ue(id: str, request: Request):
    await require_admin(request)
    return await crud_update("ues", id, await request.json())

@api_router.delete("/ues/{id}")
async def delete_ue(id: str, request: Request):
    await require_admin(request)
    return await crud_delete("ues", id)

# ===================== SESSIONS =====================
@api_router.get("/sessions")
async def list_sessions(request: Request, promotion_id: Optional[str] = None, formateur_id: Optional[str] = None,
                        semestre: Optional[str] = None, date_debut: Optional[str] = None, date_fin: Optional[str] = None,
                        type_activite_id: Optional[str] = None, ue_id: Optional[str] = None, domain_id: Optional[str] = None,
                        statut: Optional[str] = None, group_id: Optional[str] = None, site_id: Optional[str] = None,
                        annee_scolaire_id: Optional[str] = None):
    q = {}
    if promotion_id:
        if ',' in promotion_id:
            q["promotion_id"] = {"$in": promotion_id.split(",")}
        else:
            q["promotion_id"] = promotion_id
    if formateur_id:
        q["formateur_ids"] = formateur_id
    if semestre:
        if semestre == "pair":
            q["semestre"] = {"$in": ["S2", "S4", "S6"]}
        elif semestre == "impair":
            q["semestre"] = {"$in": ["S1", "S3", "S5"]}
        else:
            q["semestre"] = semestre
    if date_debut and date_fin:
        q["date"] = {"$gte": date_debut, "$lte": date_fin}
    elif date_debut:
        q["date"] = {"$gte": date_debut}
    elif date_fin:
        q["date"] = {"$lte": date_fin}
    if type_activite_id:
        q["type_activite_id"] = type_activite_id
    if ue_id:
        q["ue_id"] = ue_id
    if domain_id:
        q["domain_id"] = domain_id
    if statut:
        q["statut"] = statut
    if group_id:
        q["group_id"] = group_id
    if site_id:
        q["site_id"] = site_id
    if annee_scolaire_id:
        q["annee_scolaire_id"] = annee_scolaire_id
    return await crud_list("sessions", q, sort=[("date", 1), ("heure_debut", 1)])

@api_router.post("/sessions")
async def create_session(request: Request):
    await require_admin(request)
    b = await request.json()
    if b.get("ue_id"):
        ue = await db.ues.find_one({"id": b["ue_id"]}, {"_id": 0})
        if ue:
            b["domain_id"] = ue.get("domain_id", "")
    if b.get("heure_debut") and b.get("heure_fin"):
        try:
            hd = datetime.strptime(b["heure_debut"], "%H:%M")
            hf = datetime.strptime(b["heure_fin"], "%H:%M")
            diff = (hf - hd).total_seconds() / 3600
            b["duree"] = round(diff, 2)
        except:
            b["duree"] = 0
    return await crud_create("sessions", b)

@api_router.put("/sessions/{id}")
async def update_session(id: str, request: Request):
    await require_admin(request)
    b = await request.json()
    if b.get("ue_id"):
        ue = await db.ues.find_one({"id": b["ue_id"]}, {"_id": 0})
        if ue:
            b["domain_id"] = ue.get("domain_id", "")
    if b.get("heure_debut") and b.get("heure_fin"):
        try:
            hd = datetime.strptime(b["heure_debut"], "%H:%M")
            hf = datetime.strptime(b["heure_fin"], "%H:%M")
            diff = (hf - hd).total_seconds() / 3600
            b["duree"] = round(diff, 2)
        except:
            pass
    return await crud_update("sessions", id, b)

@api_router.delete("/sessions/{id}")
async def delete_session(id: str, request: Request):
    await require_admin(request)
    return await crud_delete("sessions", id)

@api_router.post("/sessions/{id}/duplicate")
async def duplicate_session(id: str, request: Request):
    await require_admin(request)
    orig = await db.sessions.find_one({"id": id}, {"_id": 0})
    if not orig:
        raise HTTPException(404, "Session non trouvee")
    new_data = {k: v for k, v in orig.items() if k not in ["id", "created_at", "updated_at"]}
    new_data["statut"] = "Prevu"
    new_data["saisi"] = False
    return await crud_create("sessions", new_data)

@api_router.patch("/sessions/{id}/toggle")
async def toggle_session_field(id: str, request: Request):
    u = await get_user(request)
    b = await request.json()
    field = b.get("field")
    value = b.get("value")
    if field not in ["saisi", "statut"]:
        raise HTTPException(400, "Champ non autorise")
    # Secretariat can only toggle 'saisi'
    if u.get("role") == "secretariat":
        if field != "saisi":
            raise HTTPException(403, "Le secretariat ne peut modifier que la saisie")
    elif u.get("role") not in ["super_admin", "admin_coordination"]:
        raise HTTPException(403, "Acces non autorise")
    return await crud_update("sessions", id, {field: value})

# ===================== ABSENCES =====================
@api_router.get("/absences")
async def list_absences(formateur_id: Optional[str] = None, status: Optional[str] = None):
    q = {}
    if formateur_id:
        q["formateur_id"] = formateur_id
    today = date.today().isoformat()
    if status == "en_cours":
        q["archived"] = {"$ne": True}
        q["$or"] = [
            {"date_fin": {"$gte": today}},
            {"recurrence": True, "date_fin_recurrence": {"$gte": today}}
        ]
    elif status == "passees":
        q["archived"] = {"$ne": True}
        q["$or"] = [
            {"recurrence": {"$ne": True}, "date_fin": {"$lt": today}},
            {"recurrence": True, "date_fin_recurrence": {"$lt": today}}
        ]
    elif status == "archivees":
        q["archived"] = True
    return await crud_list("absences", q, sort=[("date_debut", -1)])

@api_router.patch("/absences/{id}/archive")
async def archive_absence(id: str, request: Request):
    await require_admin(request)
    b = await request.json()
    return await crud_update("absences", id, {"archived": b.get("archived", True)})

@api_router.post("/absences")
async def create_absence(request: Request):
    await require_admin(request)
    return await crud_create("absences", await request.json())

@api_router.put("/absences/{id}")
async def update_absence(id: str, request: Request):
    await require_admin(request)
    return await crud_update("absences", id, await request.json())

@api_router.delete("/absences/{id}")
async def delete_absence(id: str, request: Request):
    await require_admin(request)
    return await crud_delete("absences", id)

@api_router.get("/absences/for-period")
async def absences_for_period(date_debut: str, date_fin: str):
    abs_query = {"$or": [
        {"date_fin": {"$gte": date_debut}},
        {"date_fin_recurrence": {"$gte": date_debut}},
        {"recurrence": True}
    ]}
    absences = await db.absences.find(abs_query, {"_id": 0}).to_list(1000)
    formateurs = {f["id"]: f for f in await crud_list("formateurs")}
    result = []
    d_start = date.fromisoformat(date_debut)
    d_end = date.fromisoformat(date_fin)
    for ab in absences:
        f = formateurs.get(ab.get("formateur_id"), {})
        try:
            ab_start = date.fromisoformat(ab.get("date_debut") or "2099-01-01")
            ab_end = date.fromisoformat(ab.get("date_fin") or "2000-01-01")
        except:
            continue
        if ab.get("recurrence") and ab.get("jours_recurrence"):
            rec_end_str = ab.get("date_fin_recurrence") or ab.get("date_fin") or "2000-01-01"
            if not rec_end_str: rec_end_str = "2000-01-01"
            rec_end = date.fromisoformat(rec_end_str)
            day_map = {"lundi": 0, "mardi": 1, "mercredi": 2, "jeudi": 3, "vendredi": 4, "samedi": 5, "dimanche": 6}
            jours = [day_map.get(j.lower(), -1) for j in ab.get("jours_recurrence", [])]
            type_rec = (ab.get("type_recurrence") or "hebdomadaire").lower()
            step_weeks = 2 if type_rec in ("bimensuelle", "bi-mensuelle", "bimensuel", "bi_mensuelle") else 1
            parite = (ab.get("parite_semaine") or "").lower()  # '', 'paire', 'impaire'
            current = d_start
            while current <= min(d_end, rec_end):
                if current.weekday() in jours and current >= ab_start:
                    # For bi-weekly: include only if (current - ab_start).days // 7 is even
                    if step_weeks == 1:
                        ok = True
                    elif parite in ("paire", "impaire"):
                        # Use ISO week parity directly (semaines paires/impaires)
                        iso_week = current.isocalendar()[1]
                        if parite == "paire":
                            ok = (iso_week % 2 == 0)
                        else:
                            ok = (iso_week % 2 == 1)
                    else:
                        # Anchor on the first matching weekday at/after ab_start
                        anchor = ab_start
                        # advance anchor to first jours weekday
                        for _ in range(7):
                            if anchor.weekday() in jours:
                                break
                            anchor = anchor + timedelta(days=1)
                        weeks_diff = (current - anchor).days // 7
                        ok = weeks_diff >= 0 and (weeks_diff % step_weeks == 0)
                    if ok:
                        result.append({
                            "formateur_id": ab.get("formateur_id"),
                            "formateur_nom": f.get("nom", ""),
                            "formateur_prenom": f.get("prenom", ""),
                            "formateur_initiales": f.get("initiales", ""),
                            "date": current.isoformat(),
                            "journee_entiere": ab.get("journee_entiere", True),
                            "periode": ab.get("periode") or ("journee" if ab.get("journee_entiere", True) else "matin"),
                            "recurrence": True,
                            "type_recurrence": type_rec,
                            "absence_id": ab.get("id")
                        })
                current += timedelta(days=1)
        else:
            overlap_start = max(d_start, ab_start)
            overlap_end = min(d_end, ab_end)
            current = overlap_start
            while current <= overlap_end:
                result.append({
                    "formateur_id": ab.get("formateur_id"),
                    "formateur_nom": f.get("nom", ""),
                    "formateur_prenom": f.get("prenom", ""),
                    "formateur_initiales": f.get("initiales", ""),
                    "date": current.isoformat(),
                    "journee_entiere": ab.get("journee_entiere", True),
                    "periode": ab.get("periode") or ("journee" if ab.get("journee_entiere", True) else "matin"),
                    "recurrence": False,
                    "absence_id": ab.get("id")
                })
                current += timedelta(days=1)
    return result

# ===================== COPY ATTRIBUTIONS =====================
@api_router.get("/copy-attributions")
async def list_copy_attributions(formateur_id: Optional[str] = None, promotion_id: Optional[str] = None,
                                  semestre: Optional[str] = None):
    q = {}
    if formateur_id:
        q["formateur_id"] = formateur_id
    if promotion_id:
        q["promotion_id"] = promotion_id
    if semestre:
        if semestre == "pair":
            q["semestre"] = {"$in": ["S2", "S4", "S6"]}
        elif semestre == "impair":
            q["semestre"] = {"$in": ["S1", "S3", "S5"]}
        else:
            q["semestre"] = semestre
    return await crud_list("copy_attributions", q, sort=[("formateur_id", 1)])

@api_router.post("/copy-attributions")
async def create_copy_attribution(request: Request):
    await require_admin(request)
    return await crud_create("copy_attributions", await request.json())

@api_router.put("/copy-attributions/{id}")
async def update_copy_attribution(id: str, request: Request):
    await require_admin(request)
    return await crud_update("copy_attributions", id, await request.json())

@api_router.delete("/copy-attributions/{id}")
async def delete_copy_attribution(id: str, request: Request):
    await require_admin(request)
    return await crud_delete("copy_attributions", id)

@api_router.post("/copy-attributions/{id}/duplicate")
async def duplicate_copy_attribution(id: str, request: Request):
    await require_admin(request)
    orig = await db.copy_attributions.find_one({"id": id}, {"_id": 0})
    if not orig:
        raise HTTPException(404, "Attribution non trouvee")
    new_data = {k: v for k, v in orig.items() if k not in ["id", "created_at", "updated_at"]}
    return await crud_create("copy_attributions", new_data)

# ===================== STICKY NOTES =====================
@api_router.get("/sticky-notes")
async def list_sticky_notes():
    return await crud_list("sticky_notes", sort=[("created_at", -1)])

@api_router.post("/sticky-notes")
async def create_sticky_note(request: Request):
    u = await require_admin(request)
    b = await request.json()
    b["auteur"] = f"{u.get('prenom','')} {u.get('nom','')}"
    b["auteur_id"] = u.get("id")
    return await crud_create("sticky_notes", b)

@api_router.put("/sticky-notes/{id}")
async def update_sticky_note(id: str, request: Request):
    u = await require_admin(request)
    b = await request.json()
    b["modified_by"] = f"{u.get('prenom','')} {u.get('nom','')}"
    b["modified_at"] = datetime.now(timezone.utc).isoformat()
    return await crud_update("sticky_notes", id, b)

@api_router.delete("/sticky-notes/{id}")
async def delete_sticky_note(id: str, request: Request):
    await require_admin(request)
    return await crud_delete("sticky_notes", id)

# ===================== SCHOOL YEARS =====================
@api_router.get("/school-years")
async def list_school_years():
    return await crud_list("school_years", sort=[("annee_debut", -1)])

@api_router.post("/school-years")
async def create_school_year(request: Request):
    await require_admin(request)
    return await crud_create("school_years", await request.json())

@api_router.put("/school-years/{id}")
async def update_school_year(id: str, request: Request):
    await require_admin(request)
    return await crud_update("school_years", id, await request.json())

@api_router.delete("/school-years/{id}")
async def delete_school_year(id: str, request: Request):
    await require_admin(request)
    return await crud_delete("school_years", id)



# ===================== CHANGE PASSWORD =====================
@api_router.post("/auth/change-password")
async def change_password(request: Request):
    u = await get_user(request)
    b = await request.json()
    old_pw = b.get("old_password", "")
    new_pw = b.get("new_password", "")
    if len(new_pw) < 6:
        raise HTTPException(400, "Le mot de passe doit contenir au moins 6 caracteres")
    user_doc = await db.users.find_one({"id": u["id"]}, {"_id": 0})
    if not user_doc or not verify_pw(old_pw, user_doc.get("password_hash", "")):
        raise HTTPException(400, "Ancien mot de passe incorrect")
    await db.users.update_one({"id": u["id"]}, {"$set": {"password_hash": hash_pw(new_pw)}})
    return {"message": "Mot de passe modifie avec succes"}

# ===================== ACCESS REQUESTS =====================
@api_router.post("/access-requests")
async def create_access_request(request: Request):
    b = await request.json()
    # Hash password if provided
    if b.get("password"):
        b["password_hash"] = hash_pw(b.pop("password"))
    b.pop("password_confirm", None)
    b["id"] = str(uuid.uuid4())
    b["status"] = "en_attente"
    b["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.access_requests.insert_one(b)
    return {k: v for k, v in b.items() if k not in ["_id", "password_hash"]}

@api_router.get("/access-requests")
async def list_access_requests(request: Request):
    await require_admin(request)
    return await crud_list("access_requests", sort=[("created_at", -1)])

@api_router.patch("/access-requests/{id}")
async def update_access_request(id: str, request: Request):
    await require_admin(request)
    b = await request.json()
    # If accepting, create user account
    if b.get("status") == "acceptee" and b.get("create_account"):
        req = await db.access_requests.find_one({"id": id}, {"_id": 0})
        if not req:
            raise HTTPException(404, "Demande non trouvee")
        role = b.get("role", "formateur")
        email = req.get("email", "").lower().strip()
        existing = await db.users.find_one({"email": email})
        if existing:
            raise HTTPException(400, "Un compte existe deja avec cet email")
        user_data = {
            "id": str(uuid.uuid4()), "email": email,
            "nom": req.get("nom", ""), "prenom": req.get("prenom", ""),
            "role": role, "created_at": datetime.now(timezone.utc).isoformat()
        }
        # Use password from request or provided override
        if b.get("password"):
            user_data["password_hash"] = hash_pw(b["password"])
        elif req.get("password_hash"):
            user_data["password_hash"] = req["password_hash"]
        else:
            raise HTTPException(400, "Aucun mot de passe defini")
        await db.users.insert_one(user_data)
    return await crud_update("access_requests", id, {"status": b.get("status", "en_attente")})

@api_router.delete("/access-requests/{id}")
async def delete_access_request(id: str, request: Request):
    await require_admin(request)
    return await crud_delete("access_requests", id)

# ===================== USERS MANAGEMENT =====================
@api_router.get("/users")
async def list_users(request: Request):
    await require_admin(request)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@api_router.post("/users")
async def create_user(request: Request):
    u = await get_user(request)
    if u.get("role") != "super_admin":
        raise HTTPException(403, "Seul le super admin peut creer des utilisateurs")
    b = await request.json()
    b["email"] = b.get("email", "").lower().strip()
    existing = await db.users.find_one({"email": b["email"]})
    if existing:
        raise HTTPException(400, "Email deja utilise")
    b["password_hash"] = hash_pw(b.pop("password", "changeme"))
    b["id"] = str(uuid.uuid4())
    b["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.insert_one(b)
    return {k: v for k, v in b.items() if k not in ["_id", "password_hash"]}

@api_router.put("/users/{id}")
async def update_user(id: str, request: Request):
    u = await get_user(request)
    if u.get("role") != "super_admin":
        raise HTTPException(403, "Seul le super admin peut modifier les utilisateurs")
    b = await request.json()
    if "password" in b:
        pw = b.pop("password")
        if pw:
            b["password_hash"] = hash_pw(pw)
    b.pop("_id", None)
    b.pop("id", None)
    b["updated_at"] = datetime.now(timezone.utc).isoformat()
    r = await db.users.find_one_and_update({"id": id}, {"$set": b}, return_document=True)
    if not r:
        raise HTTPException(404, "Utilisateur non trouve")
    return {k: v for k, v in r.items() if k not in ["_id", "password_hash"]}

@api_router.delete("/users/{id}")
async def delete_user(id: str, request: Request):
    u = await get_user(request)
    if u.get("role") != "super_admin":
        raise HTTPException(403, "Seul le super admin peut supprimer des utilisateurs")
    if id == u.get("id"):
        raise HTTPException(400, "Impossible de supprimer votre propre compte")
    return await crud_delete("users", id)


# ===================== JOURS FERIES (FR) =====================
def _easter_sunday(year: int) -> date:
    # Anonymous Gregorian (Meeus) algorithm
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)

def french_holidays(year: int):
    easter = _easter_sunday(year)
    fixed = [
        (date(year, 1, 1), "Jour de l'An"),
        (date(year, 5, 1), "Fete du travail"),
        (date(year, 5, 8), "Victoire 1945"),
        (date(year, 7, 14), "Fete nationale"),
        (date(year, 8, 15), "Assomption"),
        (date(year, 11, 1), "Toussaint"),
        (date(year, 11, 11), "Armistice"),
        (date(year, 12, 25), "Noel"),
    ]
    movable = [
        (easter + timedelta(days=1), "Lundi de Paques"),
        (easter + timedelta(days=39), "Ascension"),
        (easter + timedelta(days=50), "Lundi de Pentecote"),
    ]
    out = [{"date": d.isoformat(), "nom": n} for d, n in fixed + movable]
    out.sort(key=lambda x: x["date"])
    return out

@api_router.get("/holidays")
async def get_holidays(year: Optional[int] = None, date_debut: Optional[str] = None, date_fin: Optional[str] = None):
    if year:
        return french_holidays(year)
    if date_debut and date_fin:
        try:
            y1 = int(date_debut[:4]); y2 = int(date_fin[:4])
        except:
            raise HTTPException(400, "Format de date invalide")
        all_h = []
        for y in range(y1, y2 + 1):
            all_h.extend(french_holidays(y))
        return [h for h in all_h if date_debut <= h["date"] <= date_fin]
    today = date.today().year
    return french_holidays(today) + french_holidays(today + 1)

def _holidays_set(year_start: int, year_end: int):
    s = set()
    for y in range(year_start, year_end + 1):
        for h in french_holidays(y):
            s.add(h["date"])
    return s

# ===================== SESSIONS BULK (multi-day / Stage) =====================
@api_router.post("/sessions/bulk")
async def create_sessions_bulk(request: Request):
    """
    Body: { date_debut, date_fin, heure_debut, heure_fin, journee_entiere?, mode, exclude_holidays?, ... session fields }
    mode: 'multi_day' (one session per weekday) or 'stage' (computed week range)
    Returns: { created: [...], total_heures, total_sessions, jours_feries_exclus: [...] }
    """
    await require_admin(request)
    b = await request.json()
    dd = b.get("date_debut"); df = b.get("date_fin")
    if not dd or not df:
        raise HTTPException(400, "date_debut et date_fin requis")
    try:
        d_start = datetime.strptime(dd, "%Y-%m-%d").date()
        d_end = datetime.strptime(df, "%Y-%m-%d").date()
    except:
        raise HTTPException(400, "Format date invalide (YYYY-MM-DD)")
    if d_end < d_start:
        raise HTTPException(400, "date_fin avant date_debut")

    journee_entiere = b.get("journee_entiere", False)
    mode = b.get("mode", "multi_day")  # multi_day | stage
    exclude_holidays = b.get("exclude_holidays", True)
    holidays = _holidays_set(d_start.year, d_end.year) if exclude_holidays else set()

    if mode == "stage" and not journee_entiere:
        b.setdefault("heure_debut", "08:30")
        b.setdefault("heure_fin", "16:30")

    # Auto-compute UE -> domain
    if b.get("ue_id"):
        ue = await db.ues.find_one({"id": b["ue_id"]}, {"_id": 0})
        if ue:
            b["domain_id"] = ue.get("domain_id", "")

    # Per-day duration (used when not journee_entiere)
    duree_jour = 0
    if b.get("heure_debut") and b.get("heure_fin"):
        try:
            hd = datetime.strptime(b["heure_debut"], "%H:%M")
            hf = datetime.strptime(b["heure_fin"], "%H:%M")
            duree_jour = round((hf - hd).total_seconds() / 3600, 2)
        except:
            duree_jour = 0

    # Build daily list
    created = []
    excluded = []
    cur = d_start
    base = {k: v for k, v in b.items() if k not in ["date_debut", "date_fin", "mode", "exclude_holidays", "journee_entiere", "id"]}
    base["journee_entiere"] = False  # individual sessions are half-days
    if mode == "stage":
        base["type_marker"] = "stage"

    while cur <= d_end:
        # Only weekdays (Mon-Fri)
        if cur.weekday() < 5:
            iso = cur.isoformat()
            if iso in holidays:
                excluded.append(iso)
            else:
                if journee_entiere:
                    # 2 sessions per day: matin (8h30-12h, 3.5h) + apres-midi (13h-16h30, 3.5h)
                    for slot in [("08:30", "12:00", 3.5), ("13:00", "16:30", 3.5)]:
                        doc = dict(base)
                        doc["date"] = iso
                        doc["heure_debut"] = slot[0]
                        doc["heure_fin"] = slot[1]
                        doc["duree"] = slot[2]
                        doc["id"] = str(uuid.uuid4())
                        doc["created_at"] = datetime.now(timezone.utc).isoformat()
                        await db.sessions.insert_one(doc)
                        created.append({k: v for k, v in doc.items() if k != "_id"})
                else:
                    doc = dict(base)
                    doc["date"] = iso
                    doc["duree"] = duree_jour
                    doc["id"] = str(uuid.uuid4())
                    doc["created_at"] = datetime.now(timezone.utc).isoformat()
                    await db.sessions.insert_one(doc)
                    created.append({k: v for k, v in doc.items() if k != "_id"})
        cur += timedelta(days=1)

    # Stage: enforce 35h/week max (trim duration if needed)
    if mode == "stage":
        from collections import defaultdict
        by_week = defaultdict(list)
        for s in created:
            d_obj = datetime.strptime(s["date"], "%Y-%m-%d").date()
            wk = d_obj.isocalendar()[:2]
            by_week[wk].append(s)
        for wk, sess in by_week.items():
            total = sum(s.get("duree", 0) for s in sess)
            if total > 35:
                ratio = 35 / total
                for s in sess:
                    new_d = round(s["duree"] * ratio, 2)
                    await db.sessions.update_one({"id": s["id"]}, {"$set": {"duree": new_d}})
                    s["duree"] = new_d

    total_h = sum(s.get("duree", 0) for s in created)
    return {
        "created": created,
        "total_heures": round(total_h, 2),
        "total_sessions": len(created),
        "jours_feries_exclus": excluded,
    }

# ===================== COORDINATION - FICHES PROJET =====================
@api_router.get("/fiches-projet")
async def list_fiches_projet(request: Request, semestre: Optional[str] = None, ue_id: Optional[str] = None, promotion_id: Optional[str] = None):
    await get_user(request)
    q = {}
    if semestre: q["semestre"] = semestre
    if ue_id: q["ue_id"] = ue_id
    if promotion_id: q["promotion_id"] = promotion_id
    return await crud_list("fiches_projet", q, sort=[("created_at", -1)])

@api_router.get("/fiches-projet/a-programmer")
async def fiches_a_programmer(request: Request, promotion_id: Optional[str] = None, semestre: Optional[str] = None):
    """Returns list of activities from fiches_projet that are NOT yet placed in planning (no linked session)."""
    await get_user(request)
    q = {}
    if promotion_id: q["promotion_id"] = promotion_id
    if semestre: q["semestre"] = semestre
    fiches = await db.fiches_projet.find(q, {"_id": 0}).to_list(2000)
    result = []
    for f in fiches:
        for act in f.get("activites", []):
            if not act.get("session_id"):  # not yet placed
                result.append({
                    "fiche_id": f.get("id"),
                    "ue_id": f.get("ue_id"),
                    "semestre": f.get("semestre"),
                    "promotion_id": act.get("promotion_id") or f.get("promotion_id"),
                    "activite_id": act.get("id"),
                    "nom": act.get("nom", ""),
                    "heures": act.get("heures", 0),
                    "taille_groupe": act.get("taille_groupe", "Promo entière"),
                    "ordre": act.get("ordre", 99),
                    "type_activite_id": act.get("type_activite_id"),
                    "obligatoire": act.get("obligatoire", True),
                    "semaine_souhaitee": act.get("semaine_souhaitee", ""),
                    "formateur_ids": act.get("formateur_ids", []),
                    "methodologie": act.get("methodologie", ""),
                    "objectifs": act.get("objectifs", ""),
                    "remarques": act.get("remarques", ""),
                })
    result.sort(key=lambda x: (x["ue_id"], x["ordre"]))
    return result

# ===================== VACANCES PAR PROMOTION =====================
@api_router.get("/vacances")
async def list_vacances(request: Request, promotion_id: Optional[str] = None):
    await get_user(request)
    q = {}
    if promotion_id:
        q["promotion_id"] = promotion_id
    return await crud_list("vacances_periodes", q, sort=[("date_debut", 1)])

@api_router.post("/vacances")
async def create_vacance(request: Request):
    await require_admin(request)
    return await crud_create("vacances_periodes", await request.json())

@api_router.put("/vacances/{id}")
async def update_vacance(id: str, request: Request):
    await require_admin(request)
    return await crud_update("vacances_periodes", id, await request.json())

@api_router.delete("/vacances/{id}")
async def delete_vacance(id: str, request: Request):
    await require_admin(request)
    return await crud_delete("vacances_periodes", id)

@api_router.get("/vacances/for-period")
async def vacances_for_period(date_debut: str, date_fin: str, promotion_id: Optional[str] = None):
    """Retourne les jours de vacances pour la periode + promotion (optionnel)."""
    q = {"date_fin": {"$gte": date_debut}, "date_debut": {"$lte": date_fin}}
    if promotion_id:
        q["promotion_id"] = promotion_id
    periodes = await db.vacances_periodes.find(q, {"_id": 0}).to_list(2000)
    promotions = {p["id"]: p for p in await crud_list("promotions")}
    result = []
    try:
        d_start = date.fromisoformat(date_debut)
        d_end = date.fromisoformat(date_fin)
    except:
        raise HTTPException(400, "Format de date invalide")
    for v in periodes:
        try:
            v_start = date.fromisoformat(v.get("date_debut"))
            v_end = date.fromisoformat(v.get("date_fin"))
        except:
            continue
        cur = max(d_start, v_start)
        end = min(d_end, v_end)
        promo = promotions.get(v.get("promotion_id"), {})
        while cur <= end:
            result.append({
                "date": cur.isoformat(),
                "promotion_id": v.get("promotion_id"),
                "promotion_nom": promo.get("nom", ""),
                "nom": v.get("nom", "Vacances"),
                "vacance_id": v.get("id"),
            })
            cur += timedelta(days=1)
    return result

@api_router.post("/fiches-projet/import-sessions")
async def import_sessions_to_fiches(request: Request):
    """
    Recupere toutes les sessions deja programmees et les ajoute comme activites
    dans les fiches projet correspondantes (par ue_id + semestre + promotion_id).
    Cree la fiche manquante si necessaire. Ne re-cree pas une activite deja liee
    (idempotent grace a session_id).
    """
    await require_admin(request)
    sessions = await db.sessions.find({"ue_id": {"$exists": True, "$ne": ""}}, {"_id": 0}).to_list(5000)
    fiches = await db.fiches_projet.find({}, {"_id": 0}).to_list(2000)

    # Index existing activity session_ids across all fiches
    linked_session_ids = set()
    fiche_index = {}  # (ue_id, semestre, promotion_id) -> fiche
    for f in fiches:
        for act in f.get("activites", []):
            if act.get("session_id"):
                linked_session_ids.add(act["session_id"])
        key = (f.get("ue_id"), f.get("semestre", ""), f.get("promotion_id", ""))
        fiche_index[key] = f

    created_fiches = 0
    added_activites = 0
    skipped = 0

    for s in sessions:
        if s.get("id") in linked_session_ids:
            skipped += 1
            continue
        ue_id = s.get("ue_id")
        if not ue_id:
            skipped += 1
            continue
        sem = s.get("semestre") or ""
        promo = s.get("promotion_id") or ""
        key = (ue_id, sem, promo)

        fiche = fiche_index.get(key)
        if not fiche:
            # Try fallback: same UE + semestre, no promotion
            fiche = fiche_index.get((ue_id, sem, "")) or fiche_index.get((ue_id, "", ""))

        if not fiche:
            fiche = {
                "id": str(uuid.uuid4()),
                "ue_id": ue_id,
                "semestre": sem,
                "promotion_id": promo,
                "activites": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "auto_imported": True,
            }
            await db.fiches_projet.insert_one(fiche)
            fiche_index[key] = fiche
            created_fiches += 1

        new_act = {
            "id": str(uuid.uuid4()),
            "nom": s.get("intitule") or "(sans intitule)",
            "heures": s.get("duree", 0),
            "promotion_id": promo,
            "taille_groupe": "demi_promo" if s.get("group_id") else "promo_entiere",
            "ordre": len(fiche.get("activites", [])),
            "type_activite_id": s.get("type_activite_id") or "",
            "session_id": s.get("id"),
        }
        fiche.setdefault("activites", []).append(new_act)
        await db.fiches_projet.update_one({"id": fiche["id"]}, {"$set": {"activites": fiche["activites"]}})
        linked_session_ids.add(s["id"])
        added_activites += 1

    return {
        "sessions_total": len(sessions),
        "fiches_created": created_fiches,
        "activites_added": added_activites,
        "skipped": skipped,
    }

@api_router.post("/fiches-projet/clone-promotion")
async def clone_fiches_promotion(request: Request):
    """
    Clone toutes les fiches projet d'une promotion source vers une promotion cible.
    Body: { source_promotion_id, target_promotion_id, replace_existing? (bool) }
    Les activites sont copiees sans session_id (toutes a re-programmer).
    """
    await require_admin(request)
    b = await request.json()
    src = b.get("source_promotion_id")
    tgt = b.get("target_promotion_id")
    replace = bool(b.get("replace_existing", False))
    if not src or not tgt:
        raise HTTPException(400, "source_promotion_id et target_promotion_id requis")
    if src == tgt:
        raise HTTPException(400, "La promotion source et cible doivent etre differentes")

    # Optionnel: supprimer les fiches existantes de la cible
    if replace:
        await db.fiches_projet.delete_many({"promotion_id": tgt})

    # Recupere toutes les fiches dont la promotion source est utilisee
    src_fiches = await db.fiches_projet.find(
        {"$or": [{"promotion_id": src}, {"activites.promotion_id": src}]},
        {"_id": 0}
    ).to_list(2000)

    # Pour eviter les doublons (meme ue_id + semestre + cible) si pas replace
    existing = set()
    if not replace:
        cur = await db.fiches_projet.find({"promotion_id": tgt}, {"_id": 0, "ue_id": 1, "semestre": 1}).to_list(2000)
        existing = {(f.get("ue_id"), f.get("semestre")) for f in cur}

    cloned = 0
    skipped = 0
    for f in src_fiches:
        key = (f.get("ue_id"), f.get("semestre"))
        if not replace and key in existing:
            skipped += 1
            continue
        new_acts = []
        for act in f.get("activites", []):
            new_act = {k: v for k, v in act.items() if k not in ["id", "session_id"]}
            # Replace promotion_id at activity level if it pointed to source
            if new_act.get("promotion_id") == src:
                new_act["promotion_id"] = tgt
            new_act["id"] = str(uuid.uuid4())
            new_acts.append(new_act)
        new_fiche = {
            "id": str(uuid.uuid4()),
            "ue_id": f.get("ue_id"),
            "semestre": f.get("semestre"),
            "promotion_id": tgt,
            "activites": new_acts,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "cloned_from": f.get("id"),
        }
        await db.fiches_projet.insert_one(new_fiche)
        cloned += 1

    return {"cloned": cloned, "skipped": skipped, "source_total": len(src_fiches)}

@api_router.post("/fiches-projet/import-ues")
async def import_ues_to_fiches(request: Request):
    """Crée une fiche projet vide pour chaque UE qui n'en a pas encore."""
    await require_admin(request)
    ues = await db.ues.find({}, {"_id": 0}).to_list(2000)
    existing = await db.fiches_projet.find({}, {"_id": 0, "ue_id": 1}).to_list(2000)
    existing_ue_ids = {f.get("ue_id") for f in existing if f.get("ue_id")}
    created = []
    for ue in ues:
        if ue["id"] in existing_ue_ids:
            continue
        fiche = {
            "id": str(uuid.uuid4()),
            "ue_id": ue["id"],
            "semestre": ue.get("semestre", ""),
            "promotion_id": "",
            "activites": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "auto_imported": True,
        }
        await db.fiches_projet.insert_one(fiche)
        created.append({k: v for k, v in fiche.items() if k != "_id"})
    return {"created": len(created), "skipped": len(ues) - len(created), "total_ues": len(ues)}

@api_router.post("/fiches-projet")
async def create_fiche_projet(request: Request):
    await require_admin(request)
    b = await request.json()
    b["id"] = str(uuid.uuid4())
    b["created_at"] = datetime.now(timezone.utc).isoformat()
    # Ensure activites have ids
    for act in b.get("activites", []):
        if not act.get("id"):
            act["id"] = str(uuid.uuid4())
    await db.fiches_projet.insert_one(b)
    return {k: v for k, v in b.items() if k != "_id"}

@api_router.put("/fiches-projet/{id}")
async def update_fiche_projet(id: str, request: Request):
    await require_admin(request)
    b = await request.json()
    b.pop("_id", None); b.pop("id", None)
    b["updated_at"] = datetime.now(timezone.utc).isoformat()
    for act in b.get("activites", []) or []:
        if not act.get("id"):
            act["id"] = str(uuid.uuid4())
    r = await db.fiches_projet.find_one_and_update({"id": id}, {"$set": b}, return_document=True)
    if not r:
        raise HTTPException(404, "Fiche non trouvee")
    return {k: v for k, v in r.items() if k != "_id"}

@api_router.delete("/fiches-projet/{id}")
async def delete_fiche_projet(id: str, request: Request):
    await require_admin(request)
    return await crud_delete("fiches_projet", id)

@api_router.post("/fiches-projet/{fiche_id}/activites/{activite_id}/link-session")
async def link_activite_session(fiche_id: str, activite_id: str, request: Request):
    """Link a fiche_projet activity to a created session_id (so it's removed from 'À programmer')."""
    await require_admin(request)
    b = await request.json()
    session_id = b.get("session_id")
    fiche = await db.fiches_projet.find_one({"id": fiche_id}, {"_id": 0})
    if not fiche:
        raise HTTPException(404, "Fiche non trouvee")
    activites = fiche.get("activites", [])
    found = False
    for act in activites:
        if act.get("id") == activite_id:
            act["session_id"] = session_id
            found = True
            break
    if not found:
        raise HTTPException(404, "Activite non trouvee dans la fiche")
    await db.fiches_projet.update_one({"id": fiche_id}, {"$set": {"activites": activites}})
    return {"message": "Lie", "session_id": session_id}

@api_router.post("/fiches-projet/{fiche_id}/activites/{activite_id}/unlink-session")
async def unlink_activite_session(fiche_id: str, activite_id: str, request: Request):
    await require_admin(request)
    fiche = await db.fiches_projet.find_one({"id": fiche_id}, {"_id": 0})
    if not fiche:
        raise HTTPException(404, "Fiche non trouvee")
    activites = fiche.get("activites", [])
    for act in activites:
        if act.get("id") == activite_id:
            act.pop("session_id", None)
            break
    await db.fiches_projet.update_one({"id": fiche_id}, {"$set": {"activites": activites}})
    return {"message": "Delie"}


# ===================== DASHBOARD =====================
SAINTS = {
    "01-01": "Marie", "01-02": "Basile", "01-03": "Genevieve", "01-04": "Odilon", "01-05": "Edouard",
    "01-06": "Melchior", "01-07": "Raymond", "01-08": "Lucien", "01-09": "Alix", "01-10": "Guillaume",
    "01-11": "Paulin", "01-12": "Tatiana", "01-13": "Yvette", "01-14": "Nina", "01-15": "Remi",
    "01-16": "Marcel", "01-17": "Roseline", "01-18": "Prisca", "01-19": "Marius", "01-20": "Sebastien",
    "01-21": "Agnes", "01-22": "Vincent", "01-23": "Barnard", "01-24": "Francois de Sales", "01-25": "Paul",
    "01-26": "Paule", "01-27": "Angele", "01-28": "Thomas d'Aquin", "01-29": "Gildas", "01-30": "Martine", "01-31": "Marcelle",
    "02-01": "Ella", "02-02": "Presentation", "02-03": "Blaise", "02-04": "Veronique", "02-05": "Agathe",
    "02-06": "Gaston", "02-07": "Eugenie", "02-08": "Jacqueline", "02-09": "Apolline", "02-10": "Arnaud",
    "02-11": "Notre-Dame de Lourdes", "02-12": "Felix", "02-13": "Beatrice", "02-14": "Valentin",
    "02-15": "Claude", "02-16": "Julienne", "02-17": "Alexis", "02-18": "Bernadette", "02-19": "Gabin",
    "02-20": "Aime", "02-21": "Pierre-Damien", "02-22": "Isabelle", "02-23": "Lazare", "02-24": "Modeste",
    "02-25": "Romeo", "02-26": "Nestor", "02-27": "Honorine", "02-28": "Romain",
    "03-01": "Aubin", "03-02": "Charles le Bon", "03-03": "Guenole", "03-04": "Casimir", "03-05": "Olive",
    "03-06": "Colette", "03-07": "Felicite", "03-08": "Jean de Dieu", "03-09": "Francoise",
    "03-10": "Vivien", "03-11": "Rosine", "03-12": "Justine", "03-13": "Rodrigue", "03-14": "Mathilde",
    "03-15": "Louise", "03-16": "Benedicte", "03-17": "Patrick", "03-18": "Cyrille", "03-19": "Joseph",
    "03-20": "Herbert", "03-21": "Clemence", "03-22": "Lea", "03-23": "Victorien", "03-24": "Catherine de Suede",
    "03-25": "Humbert", "03-26": "Larissa", "03-27": "Habib", "03-28": "Gontran", "03-29": "Gwladys",
    "03-30": "Amedee", "03-31": "Benjamin",
    "04-01": "Hugues", "04-02": "Sandrine", "04-03": "Richard", "04-04": "Isidore", "04-05": "Irene",
    "04-06": "Marcellin", "04-07": "Jean-Baptiste de la Salle", "04-08": "Julie", "04-09": "Gautier",
    "04-10": "Fulbert", "04-11": "Stanislas", "04-12": "Jules", "04-13": "Ida", "04-14": "Maxime",
    "04-15": "Paterne", "04-16": "Benoit-Joseph", "04-17": "Anicet", "04-18": "Parfait", "04-19": "Emma",
    "04-20": "Odette", "04-21": "Anselme", "04-22": "Alexandre", "04-23": "Georges", "04-24": "Fidele",
    "04-25": "Marc", "04-26": "Alida", "04-27": "Zita", "04-28": "Valerie", "04-29": "Catherine de Sienne", "04-30": "Robert",
    "05-01": "Fete du Travail", "05-02": "Boris", "05-03": "Philippe", "05-04": "Sylvain", "05-05": "Judith",
    "05-06": "Prudence", "05-07": "Gisele", "05-08": "Armistice 1945", "05-09": "Pacifique",
    "05-10": "Solange", "05-11": "Estelle", "05-12": "Achille", "05-13": "Rolande", "05-14": "Matthias",
    "05-15": "Denise", "05-16": "Honore", "05-17": "Pascal", "05-18": "Eric", "05-19": "Yves",
    "05-20": "Bernardin", "05-21": "Constantin", "05-22": "Emile", "05-23": "Didier", "05-24": "Donatien",
    "05-25": "Sophie", "05-26": "Berenger", "05-27": "Augustin", "05-28": "Germain", "05-29": "Aymar",
    "05-30": "Ferdinand", "05-31": "Visitation",
    "06-01": "Justin", "06-02": "Blandine", "06-03": "Kevin", "06-04": "Clotilde", "06-05": "Igor",
    "06-06": "Norbert", "06-07": "Gilbert", "06-08": "Medard", "06-09": "Diane", "06-10": "Landry",
    "06-11": "Barnabe", "06-12": "Guy", "06-13": "Antoine de Padoue", "06-14": "Elisee", "06-15": "Germaine",
    "06-16": "Jean-Francois Regis", "06-17": "Herve", "06-18": "Leonce", "06-19": "Romuald", "06-20": "Silvere",
    "06-21": "Rodolphe", "06-22": "Alban", "06-23": "Audrey", "06-24": "Jean-Baptiste", "06-25": "Prosper",
    "06-26": "Anthelme", "06-27": "Fernand", "06-28": "Irenee", "06-29": "Pierre et Paul", "06-30": "Martial",
    "07-01": "Thierry", "07-02": "Martinien", "07-03": "Thomas", "07-04": "Florent", "07-05": "Antoine",
    "07-06": "Mariette", "07-07": "Raoul", "07-08": "Thibault", "07-09": "Amandine", "07-10": "Ulrich",
    "07-11": "Benoit", "07-12": "Olivier", "07-13": "Henri et Joel", "07-14": "Fete Nationale",
    "07-15": "Donald", "07-16": "Notre-Dame du Mont-Carmel", "07-17": "Charlotte", "07-18": "Frederic",
    "07-19": "Arsene", "07-20": "Marina", "07-21": "Victor", "07-22": "Marie-Madeleine", "07-23": "Brigitte",
    "07-24": "Christine", "07-25": "Jacques", "07-26": "Anne et Joachim", "07-27": "Nathalie", "07-28": "Samson",
    "07-29": "Marthe", "07-30": "Juliette", "07-31": "Ignace de Loyola",
    "08-01": "Alphonse", "08-02": "Julien Eymard", "08-03": "Lydie", "08-04": "Jean-Marie Vianney",
    "08-05": "Abel", "08-06": "Transfiguration", "08-07": "Gaetan", "08-08": "Dominique", "08-09": "Amour",
    "08-10": "Laurent", "08-11": "Claire", "08-12": "Clarisse", "08-13": "Hippolyte", "08-14": "Evrard",
    "08-15": "Assomption", "08-16": "Armel", "08-17": "Hyacinthe", "08-18": "Helene", "08-19": "Jean Eudes",
    "08-20": "Bernard", "08-21": "Christophe", "08-22": "Fabrice", "08-23": "Rose de Lima", "08-24": "Barthelemy",
    "08-25": "Louis", "08-26": "Natacha", "08-27": "Monique", "08-28": "Augustin", "08-29": "Sabine",
    "08-30": "Fiacre", "08-31": "Aristide",
    "09-01": "Gilles", "09-02": "Ingrid", "09-03": "Gregoire", "09-04": "Rosalie", "09-05": "Raissa",
    "09-06": "Bertrand", "09-07": "Reine", "09-08": "Nativite", "09-09": "Alain", "09-10": "Ines",
    "09-11": "Adelphe", "09-12": "Apollinaire", "09-13": "Aime", "09-14": "Croix Glorieuse", "09-15": "Roland",
    "09-16": "Edith", "09-17": "Renaud", "09-18": "Nadege", "09-19": "Emilie", "09-20": "Davy",
    "09-21": "Matthieu", "09-22": "Maurice", "09-23": "Constance", "09-24": "Thecle", "09-25": "Hermann",
    "09-26": "Come et Damien", "09-27": "Vincent de Paul", "09-28": "Venceslas", "09-29": "Michel",
    "09-30": "Jerome",
    "10-01": "Therese de l'Enfant-Jesus", "10-02": "Leger", "10-03": "Gerard", "10-04": "Francois d'Assise",
    "10-05": "Fleur", "10-06": "Bruno", "10-07": "Serge", "10-08": "Pelagie", "10-09": "Denis",
    "10-10": "Ghislain", "10-11": "Firmin", "10-12": "Wilfrid", "10-13": "Gerald", "10-14": "Juste",
    "10-15": "Therese d'Avila", "10-16": "Edwige", "10-17": "Baudouin", "10-18": "Luc", "10-19": "Rene",
    "10-20": "Adeline", "10-21": "Celine", "10-22": "Elodie", "10-23": "Jean de Capistran", "10-24": "Florentin",
    "10-25": "Crepy", "10-26": "Dimitri", "10-27": "Emeline", "10-28": "Simon et Jude", "10-29": "Narcisse",
    "10-30": "Bienvenu", "10-31": "Quentin",
    "11-01": "Toussaint", "11-02": "Defunts", "11-03": "Hubert", "11-04": "Charles", "11-05": "Sylvie",
    "11-06": "Bertille", "11-07": "Carine", "11-08": "Geoffrey", "11-09": "Theodore", "11-10": "Leon",
    "11-11": "Armistice 1918", "11-12": "Christian", "11-13": "Brice", "11-14": "Sidoine", "11-15": "Albert",
    "11-16": "Marguerite", "11-17": "Elisabeth", "11-18": "Aude", "11-19": "Tanguy", "11-20": "Edmond",
    "11-21": "Presentation de Marie", "11-22": "Cecile", "11-23": "Clement", "11-24": "Flora",
    "11-25": "Catherine", "11-26": "Delphine", "11-27": "Sevrin", "11-28": "Jacques de la Marche",
    "11-29": "Saturnin", "11-30": "Andre",
    "12-01": "Florence", "12-02": "Viviane", "12-03": "Francois-Xavier", "12-04": "Barbara", "12-05": "Gerald",
    "12-06": "Nicolas", "12-07": "Ambroise", "12-08": "Immaculee Conception", "12-09": "Pierre Fourier",
    "12-10": "Romaric", "12-11": "Daniel", "12-12": "Jeanne de Chantal", "12-13": "Lucie", "12-14": "Odile",
    "12-15": "Ninon", "12-16": "Alice", "12-17": "Gaelle", "12-18": "Gatien", "12-19": "Urbain",
    "12-20": "Abraham", "12-21": "Pierre Canisius", "12-22": "Francoise-Xaviere", "12-23": "Armand",
    "12-24": "Adele", "12-25": "Noel", "12-26": "Etienne", "12-27": "Jean l'Evangeliste", "12-28": "Innocents",
    "12-29": "David", "12-30": "Roger", "12-31": "Sylvestre"
}

QUOTES = [
    {"text": "Le doute est le commencement de la sagesse.", "author": "Aristote"},
    {"text": "Je pense, donc je suis.", "author": "Rene Descartes"},
    {"text": "L'homme est la mesure de toutes choses.", "author": "Protagoras"},
    {"text": "Science sans conscience n'est que ruine de l'ame.", "author": "Francois Rabelais"},
    {"text": "Le coeur a ses raisons que la raison ne connait point.", "author": "Blaise Pascal"},
    {"text": "L'homme est ne libre, et partout il est dans les fers.", "author": "Jean-Jacques Rousseau"},
    {"text": "Connais-toi toi-meme.", "author": "Socrate"},
    {"text": "Il n'y a qu'un heroisme au monde : c'est de voir le monde tel qu'il est et de l'aimer.", "author": "Romain Rolland"},
    {"text": "La liberte des uns s'arrete la ou commence celle des autres.", "author": "John Stuart Mill"},
    {"text": "L'ignorance est la nuit de l'esprit, et cette nuit n'a ni lune ni etoiles.", "author": "Confucius"},
    {"text": "Ce qui ne me tue pas me rend plus fort.", "author": "Friedrich Nietzsche"},
    {"text": "Le bonheur est parfois cache dans l'inconnu.", "author": "Victor Hugo"},
    {"text": "L'essentiel est invisible pour les yeux.", "author": "Antoine de Saint-Exupery"},
    {"text": "Rien ne se perd, rien ne se cree, tout se transforme.", "author": "Antoine Lavoisier"},
    {"text": "La simplicite est la sophistication supreme.", "author": "Leonard de Vinci"},
    {"text": "Tout ce que je sais, c'est que je ne sais rien.", "author": "Socrate"},
    {"text": "L'education est l'arme la plus puissante pour changer le monde.", "author": "Nelson Mandela"},
    {"text": "Qui n'avance pas recule.", "author": "Proverbe latin"},
    {"text": "Le savoir est la seule matiere qui s'accroit quand on la partage.", "author": "Socrate"},
    {"text": "Les grandes ames ont de la volonte, les faibles n'ont que des souhaits.", "author": "Proverbe chinois"},
    {"text": "La vie, c'est ce qui arrive quand on est occupe a faire d'autres projets.", "author": "John Lennon"},
    {"text": "Agis de telle sorte que tu traites l'humanite toujours comme une fin.", "author": "Emmanuel Kant"},
    {"text": "La culture, c'est ce qui reste quand on a tout oublie.", "author": "Edouard Herriot"},
    {"text": "L'homme n'est qu'un roseau, le plus faible de la nature, mais c'est un roseau pensant.", "author": "Blaise Pascal"},
    {"text": "Le vrai voyage de decouverte ne consiste pas a chercher de nouveaux paysages, mais a avoir de nouveaux yeux.", "author": "Marcel Proust"},
    {"text": "La patience est amere, mais son fruit est doux.", "author": "Jean-Jacques Rousseau"},
    {"text": "L'imagination est plus importante que le savoir.", "author": "Albert Einstein"},
    {"text": "Il faut cultiver notre jardin.", "author": "Voltaire"},
    {"text": "On ne voit bien qu'avec le coeur.", "author": "Antoine de Saint-Exupery"},
    {"text": "Chaque homme doit inventer son chemin.", "author": "Jean-Paul Sartre"},
    {"text": "La veritable generosite envers l'avenir consiste a tout donner au present.", "author": "Albert Camus"},
]

@api_router.get("/dashboard")
async def dashboard(date_debut: Optional[str] = None, date_fin: Optional[str] = None,
                    semestre: Optional[str] = None, annee_scolaire_id: Optional[str] = None,
                    promotion_id: Optional[str] = None, type_activite_id: Optional[str] = None):
    today = date.today()
    today_key = today.strftime("%m-%d")
    saint = SAINTS.get(today_key, "")
    day_of_year = today.timetuple().tm_yday
    quote = QUOTES[day_of_year % len(QUOTES)]

    if not date_debut or not date_fin:
        from datetime import timedelta as td
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
        date_debut = start.isoformat()
        date_fin = end.isoformat()

    q = {"date": {"$gte": date_debut, "$lte": date_fin}}
    if semestre:
        if semestre == "pair":
            q["semestre"] = {"$in": ["S2", "S4", "S6"]}
        elif semestre == "impair":
            q["semestre"] = {"$in": ["S1", "S3", "S5"]}
        else:
            q["semestre"] = semestre
    if promotion_id:
        q["promotion_id"] = promotion_id
    if annee_scolaire_id:
        q["annee_scolaire_id"] = annee_scolaire_id
    if type_activite_id:
        # accept comma-separated list for multi-type filter (e.g. all 'Cours' types)
        ids = [t for t in type_activite_id.split(",") if t]
        if len(ids) == 1:
            q["type_activite_id"] = ids[0]
        elif len(ids) > 1:
            q["type_activite_id"] = {"$in": ids}

    sessions = await db.sessions.find(q, {"_id": 0}).to_list(2000)
    promotions = {p["id"]: p for p in await crud_list("promotions")}
    formateurs = {f["id"]: f for f in await crud_list("formateurs")}
    act_types = {a["id"]: a for a in await crud_list("activity_types")}

    heures_par_promo = {}
    heures_par_formateur = {}
    heures_par_type = {}
    for s in sessions:
        pid = s.get("promotion_id", "")
        pname = promotions.get(pid, {}).get("nom", "Inconnu")
        dur = s.get("duree", 0)
        heures_par_promo[pname] = heures_par_promo.get(pname, 0) + dur
        tid = s.get("type_activite_id", "")
        tname = act_types.get(tid, {}).get("nom", "Inconnu")
        heures_par_type[tname] = heures_par_type.get(tname, 0) + dur
        for fid in s.get("formateur_ids", []):
            fname = f"{formateurs.get(fid, {}).get('prenom', '')} {formateurs.get(fid, {}).get('nom', '')}"
            heures_par_formateur[fname] = heures_par_formateur.get(fname, 0) + dur

    abs_query = {"$or": [
        {"date_fin": {"$gte": date_debut}},
        {"date_fin_recurrence": {"$gte": date_debut}},
        {"recurrence": True}
    ]}
    absences = await db.absences.find(abs_query, {"_id": 0}).to_list(1000)
    abs_period = []
    d_start = date.fromisoformat(date_debut)
    d_end = date.fromisoformat(date_fin)
    for ab in absences:
        f = formateurs.get(ab.get("formateur_id"), {})
        try:
            ab_start = date.fromisoformat(ab.get("date_debut") or "2099-01-01")
            ab_end = date.fromisoformat(ab.get("date_fin") or "2000-01-01")
        except:
            continue
        is_absent = False
        if ab.get("recurrence") and ab.get("jours_recurrence"):
            rec_end_str = ab.get("date_fin_recurrence") or ab.get("date_fin") or "2000-01-01"
            if not rec_end_str: rec_end_str = "2000-01-01"
            rec_end = date.fromisoformat(rec_end_str)
            day_map = {"lundi": 0, "mardi": 1, "mercredi": 2, "jeudi": 3, "vendredi": 4, "samedi": 5, "dimanche": 6}
            jours = [day_map.get(j.lower(), -1) for j in ab.get("jours_recurrence", [])]
            current = d_start
            while current <= min(d_end, rec_end):
                if current.weekday() in jours and current >= ab_start:
                    is_absent = True
                    break
                current += timedelta(days=1)
        else:
            if ab_start <= d_end and ab_end >= d_start:
                is_absent = True
        if is_absent:
            abs_period.append({
                "formateur_id": ab.get("formateur_id"),
                "initiales": f.get("initiales", ""),
                "nom": f.get("nom", ""),
                "prenom": f.get("prenom", ""),
                "date_debut": ab.get("date_debut"),
                "date_fin": ab.get("date_fin"),
                "recurrence": ab.get("recurrence", False)
            })

    birthdays = []
    for f in formateurs.values():
        if f.get("birth_day") and f.get("birth_month"):
            if int(f.get("birth_month", 0)) == today.month and int(f.get("birth_day", 0)) == today.day:
                birthdays.append(f"{f.get('prenom', '')} {f.get('nom', '')}")

    return {
        "saint_du_jour": saint,
        "citation": quote,
        "anniversaires": birthdays,
        "date_debut": date_debut,
        "date_fin": date_fin,
        "total_heures": sum(s.get("duree", 0) for s in sessions),
        "total_seances": len(sessions),
        "total_formateurs": len(formateurs),
        "heures_par_promotion": heures_par_promo,
        "heures_par_formateur": heures_par_formateur,
        "heures_par_type": heures_par_type,
        "formateurs_absents": abs_period,
        "alertes": []
    }

# ===================== RECAP HOURS =====================
@api_router.get("/recap")
async def recap_hours(date_debut: Optional[str] = None, date_fin: Optional[str] = None,
                      semestre: Optional[str] = None, formateur_id: Optional[str] = None,
                      promotion_id: Optional[str] = None, type_activite_id: Optional[str] = None,
                      ue_id: Optional[str] = None, domain_id: Optional[str] = None):
    q = {}
    if date_debut and date_fin:
        q["date"] = {"$gte": date_debut, "$lte": date_fin}
    if semestre:
        if semestre == "pair":
            q["semestre"] = {"$in": ["S2", "S4", "S6"]}
        elif semestre == "impair":
            q["semestre"] = {"$in": ["S1", "S3", "S5"]}
        else:
            q["semestre"] = semestre
    if formateur_id:
        q["formateur_ids"] = formateur_id
    if promotion_id:
        q["promotion_id"] = promotion_id
    if type_activite_id:
        q["type_activite_id"] = type_activite_id
    if ue_id:
        q["ue_id"] = ue_id
    if domain_id:
        q["domain_id"] = domain_id

    sessions = await db.sessions.find(q, {"_id": 0}).to_list(2000)
    formateurs = {f["id"]: f for f in await crud_list("formateurs")}
    promotions = {p["id"]: p for p in await crud_list("promotions")}
    act_types = {a["id"]: a for a in await crud_list("activity_types")}
    ues_map = {u["id"]: u for u in await crud_list("ues")}
    domains_map = {d["id"]: d for d in await crud_list("domains")}

    par_formateur = {}
    par_promotion = {}
    par_type = {}
    par_semestre = {}
    par_semaine = {}
    par_ue = {}

    for s in sessions:
        dur = s.get("duree", 0)
        pid = s.get("promotion_id", "")
        tid = s.get("type_activite_id", "")
        uid = s.get("ue_id", "")
        sem = s.get("semestre", "")
        d = s.get("date", "")
        pname = promotions.get(pid, {}).get("nom", "Inconnu")
        tname = act_types.get(tid, {}).get("nom", "Inconnu")
        uname = ues_map.get(uid, {}).get("intitule", "Inconnu")

        try:
            week = date.fromisoformat(d).isocalendar()[1]
        except:
            week = 0

        for fid in s.get("formateur_ids", []):
            fname = f"{formateurs.get(fid, {}).get('prenom', '')} {formateurs.get(fid, {}).get('nom', '')}"
            if fname not in par_formateur:
                par_formateur[fname] = {"total": 0, "par_type": {}, "par_promo": {}}
            par_formateur[fname]["total"] += dur
            par_formateur[fname]["par_type"][tname] = par_formateur[fname]["par_type"].get(tname, 0) + dur
            par_formateur[fname]["par_promo"][pname] = par_formateur[fname]["par_promo"].get(pname, 0) + dur

        par_promotion[pname] = par_promotion.get(pname, 0) + dur
        par_type[tname] = par_type.get(tname, 0) + dur
        par_semestre[sem] = par_semestre.get(sem, 0) + dur
        par_semaine[str(week)] = par_semaine.get(str(week), 0) + dur
        par_ue[uname] = par_ue.get(uname, 0) + dur

    return {
        "total_heures": sum(s.get("duree", 0) for s in sessions),
        "total_seances": len(sessions),
        "par_formateur": par_formateur,
        "par_promotion": par_promotion,
        "par_type_activite": par_type,
        "par_semestre": par_semestre,
        "par_semaine": par_semaine,
        "par_ue": par_ue
    }

# ===================== WORKLOAD =====================
@api_router.get("/workload")
async def workload(date_debut: Optional[str] = None, date_fin: Optional[str] = None,
                   semestre: Optional[str] = None, promotion_ids: Optional[str] = None):
    q = {}
    if date_debut and date_fin:
        q["date"] = {"$gte": date_debut, "$lte": date_fin}
    if semestre:
        if semestre == "pair":
            q["semestre"] = {"$in": ["S2", "S4", "S6"]}
        elif semestre == "impair":
            q["semestre"] = {"$in": ["S1", "S3", "S5"]}
        else:
            q["semestre"] = semestre
    if promotion_ids:
        pids = promotion_ids.split(",")
        q["promotion_id"] = {"$in": pids}

    sessions = await db.sessions.find(q, {"_id": 0}).to_list(2000)
    formateurs = await crud_list("formateurs")
    act_types = {a["id"]: a for a in await crud_list("activity_types")}

    total_cours = 0
    heures_par_formateur = {}
    for s in sessions:
        dur = s.get("duree", 0)
        tid = s.get("type_activite_id", "")
        is_cours = act_types.get(tid, {}).get("is_cours", False)
        if is_cours:
            total_cours += dur
        for fid in s.get("formateur_ids", []):
            if fid not in heures_par_formateur:
                heures_par_formateur[fid] = {"cours": 0, "total": 0, "par_type": {}}
            heures_par_formateur[fid]["total"] += dur
            tname = act_types.get(tid, {}).get("nom", "")
            heures_par_formateur[fid]["par_type"][tname] = heures_par_formateur[fid]["par_type"].get(tname, 0) + dur
            if is_cours:
                heures_par_formateur[fid]["cours"] += dur

    capacite_totale = sum(f.get("quotite", 100) / 100 for f in formateurs if f["id"] in heures_par_formateur)
    result = []
    for f in formateurs:
        fid = f["id"]
        if fid not in heures_par_formateur:
            continue
        quotite = f.get("quotite", 100) / 100
        ref = (total_cours * quotite / capacite_totale) if capacite_totale > 0 else 0
        heures = heures_par_formateur[fid]["cours"]
        ecart = heures - ref
        if abs(ecart) <= ref * 0.1:
            statut = "equilibre"
        elif ecart > 0:
            statut = "surcharge"
        else:
            statut = "sous-charge"
        result.append({
            "formateur_id": fid,
            "nom": f.get("nom", ""),
            "prenom": f.get("prenom", ""),
            "initiales": f.get("initiales", ""),
            "quotite": f.get("quotite", 100),
            "heures_cours": round(heures, 2),
            "heures_total": round(heures_par_formateur[fid]["total"], 2),
            "reference": round(ref, 2),
            "ecart": round(ecart, 2),
            "statut": statut,
            "par_type": heures_par_formateur[fid]["par_type"]
        })

    return {"formateurs": result, "total_cours_global": round(total_cours, 2), "capacite_totale": round(capacite_totale, 2)}

# ===================== ALERTS =====================
@api_router.get("/alerts")
async def get_alerts(date_debut: Optional[str] = None, date_fin: Optional[str] = None):
    today = date.today()
    if not date_debut:
        date_debut = (today - timedelta(days=today.weekday())).isoformat()
    if not date_fin:
        date_fin = (today + timedelta(days=30)).isoformat()

    sessions = await db.sessions.find({"date": {"$gte": date_debut, "$lte": date_fin}}, {"_id": 0}).to_list(2000)
    formateurs = {f["id"]: f for f in await crud_list("formateurs")}
    promotions = {p["id"]: p for p in await crud_list("promotions")}

    alerts = []
    for s in sessions:
        if not s.get("formateur_ids"):
            alerts.append({"type": "warning", "message": f"Seance sans formateur le {s.get('date')} ({s.get('heure_debut')}-{s.get('heure_fin')})",
                          "session_id": s.get("id"), "date": s.get("date")})
        if not s.get("ue_id"):
            alerts.append({"type": "warning", "message": f"Seance sans UE le {s.get('date')}",
                          "session_id": s.get("id"), "date": s.get("date")})
        if s.get("statut") == "Prevu" and s.get("date", "") < today.isoformat():
            alerts.append({"type": "info", "message": f"Seance passee non validee le {s.get('date')}",
                          "session_id": s.get("id"), "date": s.get("date")})

    by_date = {}
    for s in sessions:
        for fid in s.get("formateur_ids", []):
            key = f"{fid}_{s.get('date')}_{s.get('heure_debut')}"
            if key in by_date:
                f = formateurs.get(fid, {})
                alerts.append({"type": "error",
                    "message": f"Conflit horaire pour {f.get('prenom','')} {f.get('nom','')} le {s.get('date')} a {s.get('heure_debut')}",
                    "session_id": s.get("id"), "date": s.get("date")})
            by_date[key] = True

    return alerts

# ===================== SEED DATA =====================
@api_router.post("/seed")
async def seed_data(request: Request):
    for coll in ["formateurs", "promotions", "groups", "sites", "activity_types", "domains", "ues", "sessions", "absences", "copy_attributions", "sticky_notes", "school_years"]:
        await db[coll].delete_many({})

    now = datetime.now(timezone.utc).isoformat()
    # School Years
    sy_id = str(uuid.uuid4())
    await db.school_years.insert_one({"id": sy_id, "nom": "2025-2026", "annee_debut": 2025, "annee_fin": 2026,
        "date_debut": "2025-09-01", "date_fin": "2026-08-31", "created_at": now})

    # Sites
    site1_id, site2_id = str(uuid.uuid4()), str(uuid.uuid4())
    await db.sites.insert_many([
        {"id": site1_id, "nom": "Site Principal", "remarques": "Batiment A", "created_at": now},
        {"id": site2_id, "nom": "Site Annexe", "remarques": "Batiment B", "created_at": now}
    ])

    # Activity Types
    at_data = [
        {"nom": "CMo", "categorie": "Cours", "couleur": "#818CF8", "is_cours": True},
        {"nom": "CM", "categorie": "Cours", "couleur": "#6366F1", "is_cours": True},
        {"nom": "TD", "categorie": "Cours", "couleur": "#34D399", "is_cours": True},
        {"nom": "TP", "categorie": "Cours", "couleur": "#FBBF24", "is_cours": True},
        {"nom": "TPG", "categorie": "Cours", "couleur": "#F97316", "is_cours": True},
        {"nom": "EVAL", "categorie": "Evaluation", "couleur": "#F43F5E", "is_cours": False},
        {"nom": "SI", "categorie": "Suivi", "couleur": "#06B6D4", "is_cours": False},
        {"nom": "Stage", "categorie": "Stage", "couleur": "#38BDF8", "is_cours": False},
        {"nom": "Reunion", "categorie": "Reunion", "couleur": "#A78BFA", "is_cours": False},
        {"nom": "Suivi individuel", "categorie": "Suivi", "couleur": "#FB923C", "is_cours": False},
        {"nom": "Autre", "categorie": "Autre", "couleur": "#94A3B8", "is_cours": False},
    ]
    at_ids = {}
    for at in at_data:
        at["id"] = str(uuid.uuid4())
        at["created_at"] = now
        at_ids[at["nom"]] = at["id"]
    await db.activity_types.insert_many(at_data)

    # Domains
    dom_data = [
        {"nom": "Ancienne reforme", "description": "Programme avant reforme"},
        {"nom": "Domaine A", "description": "Sciences infirmieres et raisonnement clinique"},
        {"nom": "Domaine B", "description": "Pratiques cliniques infirmieres, qualite et gestion des risques"},
        {"nom": "Domaine C", "description": "Prevention et promotion de la sante"},
        {"nom": "Domaine D", "description": "Communication, travail en equipe et leadership"},
        {"nom": "Domaine E", "description": "Demarche scientifique, initiation a la recherche et methodologie"},
    ]
    dom_ids = {}
    for d in dom_data:
        d["id"] = str(uuid.uuid4())
        d["created_at"] = now
        dom_ids[d["nom"]] = d["id"]
    await db.domains.insert_many(dom_data)

    # UEs
    ue_data = [
        {"intitule": "Anatomie et physiologie", "code_ue": "UE1.1", "domain_id": dom_ids["Domaine A"], "reforme": "nouvelle", "semestre": "S1"},
        {"intitule": "Cycles de la vie", "code_ue": "UE2.1", "domain_id": dom_ids["Domaine A"], "reforme": "nouvelle", "semestre": "S1"},
        {"intitule": "Processus traumatiques", "code_ue": "UE2.4", "domain_id": dom_ids["Domaine A"], "reforme": "nouvelle", "semestre": "S1"},
        {"intitule": "Soins de confort et bien-etre", "code_ue": "UE3.1", "domain_id": dom_ids["Domaine B"], "reforme": "nouvelle", "semestre": "S1"},
        {"intitule": "Raisonnement clinique", "code_ue": "UE3.2", "domain_id": dom_ids["Domaine B"], "reforme": "nouvelle", "semestre": "S2"},
        {"intitule": "Projet de soins", "code_ue": "UE3.3", "domain_id": dom_ids["Domaine B"], "reforme": "nouvelle", "semestre": "S2"},
        {"intitule": "Sante publique", "code_ue": "UE4.1", "domain_id": dom_ids["Domaine C"], "reforme": "nouvelle", "semestre": "S2"},
        {"intitule": "Soins educatifs", "code_ue": "UE4.2", "domain_id": dom_ids["Domaine C"], "reforme": "nouvelle", "semestre": "S3"},
        {"intitule": "Communication", "code_ue": "UE5.1", "domain_id": dom_ids["Domaine D"], "reforme": "nouvelle", "semestre": "S3"},
        {"intitule": "Travail en equipe", "code_ue": "UE5.2", "domain_id": dom_ids["Domaine D"], "reforme": "nouvelle", "semestre": "S3"},
        {"intitule": "Initiation recherche", "code_ue": "UE6.1", "domain_id": dom_ids["Domaine E"], "reforme": "nouvelle", "semestre": "S4"},
        {"intitule": "Anglais professionnel", "code_ue": "UE6.2", "domain_id": dom_ids["Domaine E"], "reforme": "nouvelle", "semestre": "S4"},
        {"intitule": "Processus psychopathologiques", "code_ue": "UE2.6", "domain_id": dom_ids["Domaine A"], "reforme": "nouvelle", "semestre": "S5"},
        {"intitule": "Therapeutiques", "code_ue": "UE4.4", "domain_id": dom_ids["Domaine C"], "reforme": "nouvelle", "semestre": "S5"},
        {"intitule": "Memoire de fin d'etudes", "code_ue": "UE6.3", "domain_id": dom_ids["Domaine E"], "reforme": "nouvelle", "semestre": "S6"},
        {"intitule": "Pharmacologie", "code_ue": "UE2.11", "domain_id": dom_ids["Domaine A"], "reforme": "nouvelle", "semestre": "S5"},
        {"intitule": "Legislation ethique", "code_ue": "UE1.3", "domain_id": dom_ids["Domaine A"], "reforme": "nouvelle", "semestre": "S4"},
        {"intitule": "Encadrement des professionnels", "code_ue": "UE5.4", "domain_id": dom_ids["Domaine D"], "reforme": "nouvelle", "semestre": "S4"},
    ]
    ue_ids = {}
    for u in ue_data:
        u["id"] = str(uuid.uuid4())
        u["created_at"] = now
        ue_ids[u["code_ue"]] = u["id"]
    await db.ues.insert_many(ue_data)

    # Formateurs
    form_data = [
        {"nom": "Dupont", "prenom": "Marie", "email": "m.dupont@ifsi.fr", "statut": "Formateur", "quotite": 100, "initiales": "MD", "birth_day": 15, "birth_month": 3},
        {"nom": "Martin", "prenom": "Pierre", "email": "p.martin@ifsi.fr", "statut": "Formateur", "quotite": 100, "initiales": "PM", "birth_day": 22, "birth_month": 7},
        {"nom": "Bernard", "prenom": "Sophie", "email": "s.bernard@ifsi.fr", "statut": "Formateur", "quotite": 80, "initiales": "SB", "birth_day": 8, "birth_month": 11},
        {"nom": "Robert", "prenom": "Luc", "email": "l.robert@ifsi.fr", "statut": "Formateur", "quotite": 100, "initiales": "LR", "birth_day": 30, "birth_month": 1},
        {"nom": "Petit", "prenom": "Claire", "email": "c.petit@ifsi.fr", "statut": "Formateur", "quotite": 60, "initiales": "CP", "birth_day": 5, "birth_month": 9},
        {"nom": "Moreau", "prenom": "Jean", "email": "j.moreau@ifsi.fr", "statut": "Vacataire", "quotite": 100, "initiales": "JM", "birth_day": 12, "birth_month": 6},
        {"nom": "Treger", "prenom": "Jennifer", "email": "j.treger@ifsi.fr", "statut": "Formateur", "quotite": 80, "initiales": "JT", "birth_day": 18, "birth_month": 4},
        {"nom": "Michel", "prenom": "Sandrine", "email": "s.michel@ifsi.fr", "statut": "Formateur", "quotite": 50, "initiales": "SM", "birth_day": 25, "birth_month": 12},
    ]
    form_ids = {}
    for f in form_data:
        f["id"] = str(uuid.uuid4())
        f["created_at"] = now
        f["remarques"] = ""
        form_ids[f["initiales"]] = f["id"]
    await db.formateurs.insert_many(form_data)

    # Promotions
    promo_data = [
        {"nom": "Promotion 2023-2026", "annee_entree": 2023, "annee_sortie": 2026, "semestres": ["S5", "S6"], "annee_scolaire": "2025-2026"},
        {"nom": "Promotion 2024-2027", "annee_entree": 2024, "annee_sortie": 2027, "semestres": ["S3", "S4"], "annee_scolaire": "2025-2026"},
        {"nom": "Promotion 2025-2028", "annee_entree": 2025, "annee_sortie": 2028, "semestres": ["S1", "S2"], "annee_scolaire": "2025-2026"},
    ]
    promo_ids = {}
    for p in promo_data:
        p["id"] = str(uuid.uuid4())
        p["created_at"] = now
        promo_ids[p["nom"]] = p["id"]
    await db.promotions.insert_many(promo_data)

    # Groups
    grp_data = []
    for lbl in ["Groupe 1", "Groupe 2", "Groupe 3", "Groupe 4"]:
        grp_data.append({"id": str(uuid.uuid4()), "libelle": lbl, "created_at": now})
    await db.groups.insert_many(grp_data)
    grp_ids = {g["libelle"]: g["id"] for g in grp_data}

    # Sessions - create realistic data for current and next weeks
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sessions_to_create = []
    promo_list = list(promo_ids.items())
    ue_list = list(ue_ids.items())
    form_list = list(form_ids.items())
    grp_list = list(grp_ids.items())

    time_slots = [
        ("08:00", "10:00"), ("10:15", "12:15"), ("13:00", "15:00"), ("15:15", "17:15"),
        ("08:30", "10:30"), ("10:45", "12:45"), ("13:30", "15:30"), ("08:00", "12:00"),
        ("13:00", "17:00"), ("09:00", "11:00"), ("14:00", "16:00")
    ]

    for week_offset in range(4):
        week_monday = monday + timedelta(weeks=week_offset)
        for day_offset in range(5):
            current_date = week_monday + timedelta(days=day_offset)
            num_sessions = random.randint(2, 5)
            used_slots = []
            for _ in range(num_sessions):
                slot = random.choice(time_slots)
                if slot in used_slots:
                    continue
                used_slots.append(slot)
                pname, pid = random.choice(promo_list)
                ue_code, uid = random.choice(ue_list)
                ue_doc = next((u for u in ue_data if u["code_ue"] == ue_code), None)
                at_name = random.choice(["CM", "TD", "TP", "CMo", "TPG", "EVAL"])
                fini, fid = random.choice(form_list)
                fini2, fid2 = random.choice(form_list)
                formateur_ids = [fid] if random.random() > 0.3 else [fid, fid2]
                grp_name, gid = random.choice(grp_list)

                hd = datetime.strptime(slot[0], "%H:%M")
                hf = datetime.strptime(slot[1], "%H:%M")
                duree = round((hf - hd).total_seconds() / 3600, 2)

                sem_map = {"Promotion 2023-2026": random.choice(["S5", "S6"]),
                           "Promotion 2024-2027": random.choice(["S3", "S4"]),
                           "Promotion 2025-2028": random.choice(["S1", "S2"])}
                semestre = sem_map.get(pname, "S1")

                sessions_to_create.append({
                    "id": str(uuid.uuid4()),
                    "date": current_date.isoformat(),
                    "heure_debut": slot[0],
                    "heure_fin": slot[1],
                    "duree": duree,
                    "type_activite_id": at_ids[at_name],
                    "promotion_id": pid,
                    "group_id": gid if random.random() > 0.4 else "",
                    "ue_id": uid,
                    "domain_id": ue_doc["domain_id"] if ue_doc else "",
                    "semestre": semestre,
                    "formateur_ids": formateur_ids,
                    "site_id": random.choice([site1_id, site2_id]),
                    "statut": random.choice(["Prevu", "Valide"]),
                    "saisi": random.choice([True, False]),
                    "commentaire": "",
                    "intitule": f"{at_name} - {ue_code}",
                    "annee_scolaire_id": sy_id,
                    "created_at": now
                })

    if sessions_to_create:
        await db.sessions.insert_many(sessions_to_create)

    # Absences
    abs_data = [
        {"id": str(uuid.uuid4()), "formateur_id": form_ids["SB"], "date_debut": (monday + timedelta(days=2)).isoformat(),
         "date_fin": (monday + timedelta(days=30)).isoformat(), "journee_entiere": True,
         "recurrence": False, "jours_recurrence": [], "date_fin_recurrence": "", "type_recurrence": "", "created_at": now},
        {"id": str(uuid.uuid4()), "formateur_id": form_ids["LR"], "date_debut": (monday + timedelta(days=14)).isoformat(),
         "date_fin": (monday + timedelta(days=28)).isoformat(), "journee_entiere": True,
         "recurrence": False, "jours_recurrence": [], "date_fin_recurrence": "", "type_recurrence": "", "created_at": now},
        {"id": str(uuid.uuid4()), "formateur_id": form_ids["JT"], "date_debut": monday.isoformat(),
         "date_fin": monday.isoformat(), "journee_entiere": True,
         "recurrence": True, "jours_recurrence": ["mercredi"], "type_recurrence": "hebdomadaire",
         "date_fin_recurrence": (monday + timedelta(days=180)).isoformat(), "created_at": now},
    ]
    await db.absences.insert_many(abs_data)

    # Copy attributions
    copy_data = []
    for fini, fid in list(form_ids.items())[:5]:
        for sem in ["S1", "S3", "S5"]:
            ue_code, uid = random.choice(ue_list)
            pname, pid = random.choice(promo_list)
            copy_data.append({
                "id": str(uuid.uuid4()),
                "formateur_id": fid,
                "promotion_id": pid,
                "semestre": sem,
                "ue_id": uid,
                "type_evaluation": random.choice(["Ecrit", "Oral", "Pratique"]),
                "nombre_copies": random.randint(15, 45),
                "volume_horaire": round(random.uniform(2, 8), 1),
                "commentaire": "",
                "created_at": now
            })
    await db.copy_attributions.insert_many(copy_data)

    # Sticky notes
    sn_data = [
        {"id": str(uuid.uuid4()), "titre": "Reunion S5", "contenu": "Preparer la reunion de coordination S5",
         "couleur": "#FEF08A", "statut": "non_resolu", "auteur": "Admin", "auteur_id": "",
         "position_x": 50, "position_y": 50, "created_at": now},
        {"id": str(uuid.uuid4()), "titre": "Evaluations S3", "contenu": "Planifier les evaluations de mi-semestre",
         "couleur": "#BBF7D0", "statut": "non_resolu", "auteur": "Admin", "auteur_id": "",
         "position_x": 300, "position_y": 50, "created_at": now},
        {"id": str(uuid.uuid4()), "titre": "Stage planning", "contenu": "Valider les conventions de stage S4",
         "couleur": "#BFDBFE", "statut": "resolu", "auteur": "Admin", "auteur_id": "",
         "position_x": 550, "position_y": 50, "created_at": now},
    ]
    await db.sticky_notes.insert_many(sn_data)

    return {"message": "Donnees de demonstration creees avec succes", "stats": {
        "formateurs": len(form_data), "promotions": len(promo_data), "groups": len(grp_data),
        "sessions": len(sessions_to_create), "absences": len(abs_data), "copies": len(copy_data)
    }}

# ===================== APP STARTUP =====================
async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@ifsi.fr").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin123!")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": admin_email, "nom": "Administrateur", "prenom": "Super",
            "role": "super_admin", "password_hash": hash_pw(admin_password),
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Admin cree: {admin_email}")
    elif not verify_pw(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_pw(admin_password)}})

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await seed_admin()
    # Write test credentials
    creds_dir = Path("/app/memory")
    creds_dir.mkdir(exist_ok=True)
    with open(creds_dir / "test_credentials.md", "w") as f:
        f.write("# Test Credentials\n\n")
        f.write(f"## Admin\n- Email: {os.environ.get('ADMIN_EMAIL', 'admin@ifsi.fr')}\n")
        f.write(f"- Password: {os.environ.get('ADMIN_PASSWORD', 'Admin123!')}\n")
        f.write(f"- Role: super_admin\n\n")
        f.write("## Auth Endpoints\n- POST /api/auth/login\n- POST /api/auth/logout\n- GET /api/auth/me\n")

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
