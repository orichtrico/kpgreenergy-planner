import os
import json
from datetime import datetime, date
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine import ProjectEngine

app = FastAPI(title="KPGreenergy Planner", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Engine
engine = ProjectEngine()

# Ensure static directory exists
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
os.makedirs(STATIC_DIR, exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Pydantic models for requests
class MilestoneUpdateRequest(BaseModel):
    project_id: str
    milestone_name: str
    actual_pct: float
    actual_start: Optional[str] = None
    actual_finish: Optional[str] = None
    note: Optional[str] = None
    updated_by: Optional[str] = "LINE User"

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>KPGreenergy Planner Running</h1>")

@app.get("/index.html", response_class=HTMLResponse)
async def serve_index_html():
    return await serve_index()

@app.get("/liff", response_class=HTMLResponse)
async def serve_liff():
    liff_path = os.path.join(STATIC_DIR, "liff.html")
    if os.path.exists(liff_path):
        with open(liff_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>LINE LIFF Form</h1>")

@app.get("/liff.html", response_class=HTMLResponse)
async def serve_liff_html():
    return await serve_liff()

# API Endpoints
@app.get("/api/overview")
async def get_overview():
    projects = engine.projects
    total_projects = len(projects)
    total_capacity = sum(p.get("capacity_kwp", 0.0) for p in projects)
    
    completed_count = sum(1 for p in projects if p.get("status") == "COMPLETED")
    delayed_count = sum(1 for p in projects if p.get("status") == "DELAYED")
    on_track_count = sum(1 for p in projects if p.get("status") in ["ON_TRACK", "SLIGHT_DELAY"])
    
    total_act_weighted = sum(p.get("actual_progress_pct", 0.0) * p.get("capacity_kwp", 0.0) for p in projects)
    total_plan_weighted = sum(p.get("planned_progress_pct", 0.0) * p.get("capacity_kwp", 0.0) for p in projects)
    
    avg_actual = round(total_act_weighted / total_capacity, 2) if total_capacity > 0 else 0.0
    avg_planned = round(total_plan_weighted / total_capacity, 2) if total_capacity > 0 else 0.0
    
    business_units = sorted(list(set(p.get("business_unit") for p in projects if p.get("business_unit"))))
    lots = sorted(list(set(p.get("lot") for p in projects if p.get("lot"))))
    installation_types = sorted(list(set(p.get("installation_type") for p in projects if p.get("installation_type"))))
    
    phases = engine.get_phase_summary()

    return {
        "total_projects": total_projects,
        "total_capacity_kwp": round(total_capacity, 2),
        "total_capacity_mwp": round(total_capacity / 1000.0, 2),
        "avg_actual_progress_pct": avg_actual,
        "avg_planned_progress_pct": avg_planned,
        "variance_pct": round(avg_actual - avg_planned, 2),
        "completed_count": completed_count,
        "delayed_count": delayed_count,
        "on_track_count": on_track_count,
        "business_units": business_units,
        "lots": lots,
        "installation_types": installation_types,
        "phases": phases
    }

@app.get("/api/projects")
async def get_projects(
    lot: Optional[str] = None,
    business_unit: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None
):
    results = []
    for p in engine.projects:
        if lot and p.get("lot") != lot:
            continue
        if business_unit and p.get("business_unit") != business_unit:
            continue
        if status and p.get("status") != status:
            continue
        if search:
            q = search.lower().strip()
            name_match = q in p.get("name", "").lower()
            bu_match = q in p.get("business_unit", "").lower()
            lot_match = q in p.get("lot", "").lower()
            if not (name_match or bu_match or lot_match):
                continue
        
        results.append({
            "id": p["id"],
            "name": p["name"],
            "business_unit": p["business_unit"],
            "order_no": p["order_no"],
            "lot": p["lot"],
            "capacity_kwp": p["capacity_kwp"],
            "installation_type": p["installation_type"],
            "type_code": p["type_code"],
            "planned_start": p["planned_start"],
            "planned_finish": p["planned_finish"],
            "actual_start": p["actual_start"],
            "actual_finish": p["actual_finish"],
            "actual_progress_pct": p["actual_progress_pct"],
            "planned_progress_pct": p["planned_progress_pct"],
            "variance_pct": p["variance_pct"],
            "status": p["status"],
            "status_th": p["status_th"]
        })
    
    return {"count": len(results), "projects": results}

@app.get("/api/projects/{project_id}")
async def get_project_detail(project_id: str):
    if project_id not in engine.projects_dict:
        raise HTTPException(status_code=404, detail="Project not found")
    return engine.projects_dict[project_id]

@app.get("/api/phases")
async def get_phases():
    return engine.get_phase_summary()

@app.post("/api/update-milestone")
async def update_milestone(req: MilestoneUpdateRequest):
    pct = req.actual_pct
    if pct > 1.0:
        pct = pct / 100.0
    
    success = engine.update_milestone(
        project_id=req.project_id,
        milestone_name=req.milestone_name,
        actual_pct=pct,
        actual_start=req.actual_start,
        actual_finish=req.actual_finish
    )
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to update milestone. Check project_id and milestone_name.")
    
    updated_project = engine.projects_dict[req.project_id]
    
    return {
        "success": True,
        "message": f"Updated {req.milestone_name} to {pct*100:.1f}% successfully",
        "project": {
            "id": updated_project["id"],
            "name": updated_project["name"],
            "actual_progress_pct": updated_project["actual_progress_pct"],
            "planned_progress_pct": updated_project["planned_progress_pct"],
            "status": updated_project["status"],
            "status_th": updated_project["status_th"]
        }
    }

@app.post("/api/webhook")
async def handle_webhook(request: Request):
    try:
        body = await request.json()
    except:
        body = {}
    
    action = body.get("action") or body.get("event")
    
    if action == "update_milestone":
        p_id = body.get("project_id")
        p_name = body.get("project_name")
        m_name = body.get("milestone_name")
        pct = float(body.get("actual_pct", 0.0))
        if pct > 1.0:
            pct = pct / 100.0
        
        if not p_id and p_name:
            for p in engine.projects:
                if p["name"].strip().lower() == p_name.strip().lower():
                    p_id = p["id"]
                    break
        
        if p_id:
            eng_res = engine.update_milestone(
                project_id=p_id,
                milestone_name=m_name,
                actual_pct=pct,
                actual_start=body.get("actual_start"),
                actual_finish=body.get("actual_finish")
            )
            return {"status": "ok", "updated": eng_res}
            
    return {"status": "received", "body": body}

@app.get("/api/google-apps-script-code")
async def get_gas_code():
    gas_path = os.path.join(BASE_DIR, "google_apps_script.js")
    if os.path.exists(gas_path):
        with open(gas_path, "r", encoding="utf-8") as f:
            return {"code": f.read()}
    return {"code": "// Google Apps Script template"}


@app.post("/api/sync-google-sheet")
async def sync_google_sheet(request: Request):
    try:
        body = await request.json()
        sheet_url = body.get("sheet_url")
        if not sheet_url:
            raise HTTPException(status_code=400, detail="Missing sheet_url")
        
        # Fetch data from Google Apps Script Web App
        import requests
        resp = requests.get(sheet_url, timeout=20)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Google Sheet returned status {resp.status_code}")
        
        data = resp.json()
        projects_from_sheet = data.get("projects", [])
        
        if not projects_from_sheet:
            raise HTTPException(status_code=400, detail="No projects returned from Google Sheet")
        
        # Update engine projects
        for p_sheet in projects_from_sheet:
            p_name = p_sheet.get("name")
            # Find matching project in engine
            for p_eng in engine.projects:
                if p_eng["name"].strip().lower() == p_name.strip().lower():
                    # Update milestones
                    for m_s in p_sheet.get("milestones", []):
                        m_name = m_s.get("name")
                        act_pct = float(m_s.get("actual_pct", 0.0))
                        engine.update_milestone(
                            project_id=p_eng["id"],
                            milestone_name=m_name,
                            actual_pct=act_pct,
                            actual_start=m_s.get("actual_start"),
                            actual_finish=m_s.get("actual_finish")
                        )
                    break
                    
        engine.save_to_cache()
        return {"success": True, "message": f"Synced {len(projects_from_sheet)} projects from Google Sheet successfully!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
