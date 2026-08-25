/**
 * =========================================================================
 * ⚡ KPGreenergy Planner - 2-Way Sync Engine (Ultra-Fast Version)
 * =========================================================================
 */

const WEBHOOK_DASHBOARD_URL = "https://kpgreenergy-planner.onrender.com/api/webhook";

/**
 * 1. GET Request: ส่งข้อมูลออกเป็น JSON แบบความเร็วสูง (Sub-second)
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const planSheet = ss.getSheetByName("Plan");
    const progSheet = ss.getSheetByName("data Progress");

    if (!planSheet || !progSheet) {
      return createJsonResponse({ status: "error", message: "ไม่พบชีต 'Plan' หรือ 'data Progress'" });
    }

    const planLastRow = planSheet.getLastRow();
    const planLastCol = planSheet.getLastColumn();
    const progLastRow = progSheet.getLastRow();
    const progLastCol = progSheet.getLastColumn();

    if (planLastRow < 5) {
      return createJsonResponse({ status: "success", total_projects: 0, projects: [] });
    }

    // อ่านข้อมูลแบบ Batch รวดเดียว (เฉพาะแถวและคอลัมน์ที่มีข้อมูลจริง)
    const planData = planSheet.getRange(1, 1, planLastRow, planLastCol).getValues();
    const progData = progSheet.getRange(1, 1, progLastRow, progLastCol).getValues();

    // ดึงรายชื่อ Milestones จาก Header แถวที่ 3 (Index 2)
    const headerRow3 = planData[2];
    const milestones = [];
    for (let c = 7; c < headerRow3.length; c += 3) {
      const mName = String(headerRow3[c] || "").trim();
      if (mName) {
        milestones.push({ name: mName, col_idx: c });
      }
    }

    // สร้าง Map ของ Progress เพื่อการค้นหาทันที
    const progMap = {};
    for (let r = 4; r < progData.length; r++) {
      const pName = String(progData[r][2] || "").trim();
      if (pName) {
        progMap[pName] = progData[r];
      }
    }

    const projects = [];
    for (let r = 4; r < planData.length; r++) {
      const prjName = String(planData[r][2] || "").trim();
      if (!prjName) continue;

      const progRow = progMap[prjName] || planData[r];
      const mList = [];

      for (let i = 0; i < milestones.length; i++) {
        const c = milestones[i].col_idx;
        const pStart = planData[r][c];
        const pFinish = planData[r][c+1];
        const pWeight = Number(planData[r][c+2]) || 0;

        const aStart = progRow[c];
        const aFinish = progRow[c+1];
        let aPct = Number(progRow[c+2]) || 0;
        if (aPct > 1.0) aPct = aPct / 100.0;

        mList.push({
          name: milestones[i].name,
          weight: pWeight,
          planned_start: formatSimpleDate(pStart),
          planned_finish: formatSimpleDate(pFinish),
          actual_start: formatSimpleDate(aStart),
          actual_finish: formatSimpleDate(aFinish),
          actual_pct: aPct
        });
      }

      projects.push({
        id: "prj_" + ("000" + (r - 3)).slice(-3),
        business_unit: String(planData[r][0] || ""),
        order_no: planData[r][1],
        name: prjName,
        lot: String(planData[r][3] || ""),
        capacity_kwp: Number(planData[r][4]) || 0,
        installation_type: String(planData[r][5] || ""),
        type_code: Number(planData[r][6]) || 1,
        milestones: mList
      });
    }

    return createJsonResponse({
      status: "success",
      total_projects: projects.length,
      milestones_count: milestones.length,
      projects: projects
    });

  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

/**
 * 2. POST Request: รับข้อมูลอัปเดตจาก LINE LIFF / Web
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    const projectName = String(data.project_name || "").trim();
    const milestoneName = String(data.milestone_name || "").trim();
    let actualPct = parseFloat(data.actual_pct || 0);
    if (actualPct > 1.0) actualPct = actualPct / 100.0;
    
    const actualStart = data.actual_start || "";
    const actualFinish = data.actual_finish || "";
    const note = data.note || "อัปเดตผ่านระบบ";
    const updatedBy = data.updated_by || "LINE User";

    const progSheet = ss.getSheetByName("data Progress");
    const logSheet = ss.getSheetByName("Log_Updates");

    if (!progSheet) {
      return createJsonResponse({ status: "error", message: "ไม่พบชีต 'data Progress'" });
    }

    const lastRow = progSheet.getLastRow();
    const lastCol = progSheet.getLastColumn();
    const progData = progSheet.getRange(1, 1, lastRow, lastCol).getValues();

    // 1. หาแถวโครงการ
    let targetRow = -1;
    for (let r = 4; r < progData.length; r++) {
      if (String(progData[r][2] || "").trim().toLowerCase() === projectName.toLowerCase()) {
        targetRow = r + 1;
        break;
      }
    }

    if (targetRow === -1) {
      return createJsonResponse({ status: "error", message: "ไม่พบโครงการ: " + projectName });
    }

    // 2. หาคอลัมน์ Milestone
    const headerRow3 = progData[2];
    let targetCol = -1;
    for (let c = 7; c < headerRow3.length; c += 3) {
      const title = String(headerRow3[c] || "").trim().toLowerCase();
      if (title === milestoneName.toLowerCase() || title.includes(milestoneName.toLowerCase()) || milestoneName.toLowerCase().includes(title)) {
        targetCol = c + 1;
        break;
      }
    }

    if (targetCol === -1) {
      return createJsonResponse({ status: "error", message: "ไม่พบคอลัมน์ Milestone: " + milestoneName });
    }

    // 3. เขียนค่าลงเซลล์
    if (actualStart) progSheet.getRange(targetRow, targetCol).setValue(actualStart);
    if (actualFinish) progSheet.getRange(targetRow, targetCol + 1).setValue(actualFinish);
    progSheet.getRange(targetRow, targetCol + 2).setValue(actualPct);

    // 4. บันทึก Log
    if (logSheet) {
      const nowStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm:ss");
      logSheet.appendRow([nowStr, updatedBy, projectName, milestoneName, (actualPct * 100).toFixed(0) + "%", actualStart, actualFinish, note, "2-Way API"]);
    }

    return createJsonResponse({
      status: "success",
      message: "อัปเดต " + milestoneName + " ของ " + projectName + " สำเร็จ (" + (actualPct * 100) + "%)"
    });

  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

function onEdit(e) {
  // Trigger onEdit webhook if configured
}

function formatSimpleDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = ("0" + (val.getMonth() + 1)).slice(-2);
    const d = ("0" + val.getDate()).slice(-2);
    return y + "-" + m + "-" + d;
  }
  return String(val).slice(0, 10);
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
