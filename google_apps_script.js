/**
 * =========================================================================
 * ⚡ KPGreenergy Planner - 2-Way Sync Engine for Google Sheets
 * =========================================================================
 * ชีตที่ใช้: 'Plan', 'data Progress', 'Weight Prj', 'Log_Updates'
 * รองรับ:
 *   1. รับข้อมูลจาก LINE LIFF / Web Dashboard -> เขียนลง 'data Progress' + 'Log_Updates'
 *   2. เมื่อแก้ใน Google Sheets -> แจ้งเตือน Web Dashboard อัตโนมัติ (onEdit Webhook)
 *   3. ส่งข้อมูลออกเป็น JSON API ให้หน้าเว็บดึงไปแสดงผลแบบ Real-time
 * =========================================================================
 */

// ใส่ URL ของ Web Dashboard ของคุณที่นี่ (เพื่อซิงค์ข้อมูลสด)
const WEBHOOK_DASHBOARD_URL = "https://your-dashboard-domain.onrender.com/api/webhook";

/**
 * 1. POST Request Handler: รับข้อมูลจาก LINE LIFF หรือ Web Dashboard
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    const projectName = data.project_name || "";
    const projectId = data.project_id || "";
    const milestoneName = data.milestone_name || "";
    const actualPct = parseFloat(data.actual_pct || 0); // 0 - 100 or 0 - 1
    const actualStart = data.actual_start || "";
    const actualFinish = data.actual_finish || "";
    const note = data.note || "อัปเดตผ่านระบบ";
    const updatedBy = data.updated_by || "LINE LIFF / Web User";

    const progSheet = ss.getSheetByName("data Progress");
    const logSheet = ss.getSheetByName("Log_Updates");

    if (!progSheet) {
      return createJsonResponse({ status: "error", message: "ไม่พบชีต 'data Progress'" });
    }

    // 1. ค้นหาแถวของโครงการ (ค้นหาจากคอลัมน์ C: ชื่อโครงการ)
    const progData = progSheet.getDataRange().getValues();
    let targetRow = -1;

    for (let r = 4; r < progData.length; r++) { // เริ่มตรวจตั้งแต่แถว 5 (index 4)
      const rowPrjName = String(progData[r][2] || "").trim(); // Col C
      const rowPrjOrder = String(progData[r][1] || "").trim(); // Col B
      
      if ((projectName && rowPrjName.toLowerCase() === projectName.trim().toLowerCase()) ||
          (projectId && (projectId === "prj_" + ("000" + (r - 3)).slice(-3) || rowPrjOrder === projectId))) {
        targetRow = r + 1; // 1-based row index
        break;
      }
    }

    if (targetRow === -1) {
      return createJsonResponse({ status: "error", message: "ไม่พบโครงการ: " + projectName });
    }

    // 2. ค้นหาคอลัมน์ของ Milestone ในแถว Header (แถวที่ 3 และ 4)
    const headerRow3 = progData[2]; // แถว 3 (ชื่อ Milestone)
    let targetCol = -1;

    for (let c = 7; c < headerRow3.length; c += 3) {
      const mTitle = String(headerRow3[c] || "").trim();
      if (mTitle.toLowerCase() === milestoneName.trim().toLowerCase()) {
        targetCol = c + 1; // 1-based col index (Actual Start)
        break;
      }
    }

    if (targetCol === -1) {
      // ค้นหาแบบ Partial Match ถ้าชื่อไม่ตรง 100%
      for (let c = 7; c < headerRow3.length; c += 3) {
        const mTitle = String(headerRow3[c] || "").trim();
        if (mTitle.toLowerCase().includes(milestoneName.trim().toLowerCase()) ||
            milestoneName.trim().toLowerCase().includes(mTitle.toLowerCase())) {
          targetCol = c + 1;
          break;
        }
      }
    }

    if (targetCol === -1) {
      return createJsonResponse({ status: "error", message: "ไม่พบคอลัมน์ Milestone: " + milestoneName });
    }

    // 3. เขียนข้อมูลลงชีต 'data Progress'
    // targetCol = Actual Start, targetCol+1 = Actual Finish, targetCol+2 = % Progress
    if (actualStart) {
      progSheet.getRange(targetRow, targetCol).setValue(actualStart);
    }
    if (actualFinish) {
      progSheet.getRange(targetRow, targetCol + 1).setValue(actualFinish);
    }
    
    // แปลง % เป็น decimal ถ้าค่าที่ส่งมาเป็น 0-100
    const pctVal = actualPct > 1.0 ? (actualPct / 100.0) : actualPct;
    progSheet.getRange(targetRow, targetCol + 2).setValue(pctVal);

    // 4. บันทึกลงชีต 'Log_Updates' (Audit Trail)
    if (logSheet) {
      const nowStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm:ss");
      const pctDisplay = (pctVal * 100).toFixed(0) + "%";
      logSheet.appendRow([
        nowStr,
        updatedBy,
        projectName || ("Row " + targetRow),
        milestoneName,
        pctDisplay,
        actualStart || "-",
        actualFinish || "-",
        note,
        "LINE / Web 2-Way API"
      ]);
    }

    // 5. แจ้งเตือน Webhook กลับไปยัง Web Dashboard
    notifyWebDashboard({
      action: "update_milestone",
      project_name: projectName,
      milestone_name: milestoneName,
      actual_pct: pctVal,
      actual_start: actualStart,
      actual_finish: actualFinish
    });

    return createJsonResponse({
      status: "success",
      message: "อัปเดต " + milestoneName + " ของ " + projectName + " สำเร็จแล้ว (" + (pctVal*100) + "%)",
      row: targetRow,
      col: targetCol
    });

  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

/**
 * 2. GET Request Handler: อ่านข้อมูลทั้งหมดส่งออกเป็น JSON API
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const planSheet = ss.getSheetByName("Plan");
    const progSheet = ss.getSheetByName("data Progress");

    if (!planSheet || !progSheet) {
      return createJsonResponse({ status: "error", message: "ไม่พบชีต Plan หรือ data Progress" });
    }

    const planData = planSheet.getDataRange().getValues();
    const progData = progSheet.getDataRange().getValues();

    // ดึงรายชื่อ Milestones จาก Header แถวที่ 3
    const headerRow3 = planData[2];
    const milestones = [];
    for (let c = 7; c < headerRow3.length; c += 3) {
      const mName = String(headerRow3[c] || "").trim();
      if (mName) {
        milestones.push({ name: mName, col_idx: c });
      }
    }

    // รวบรวมข้อมูลโครงการ
    const projects = [];
    for (let r = 4; r < planData.length; r++) {
      const prjName = String(planData[r][2] || "").trim();
      if (!prjName) continue;

      const pObj = {
        id: "prj_" + ("000" + (r - 3)).slice(-3),
        business_unit: String(planData[r][0] || ""),
        order_no: planData[r][1],
        name: prjName,
        lot: String(planData[r][3] || ""),
        capacity_kwp: parseFloat(planData[r][4] || 0),
        installation_type: String(planData[r][5] || ""),
        type_code: parseInt(planData[r][6] || 1),
        milestones: []
      };

      for (let m = 0; m < milestones.length; m++) {
        const mInfo = milestones[m];
        const c = mInfo.col_idx;
        
        const pStart = planData[r][c];
        const pFinish = planData[r][c+1];
        const pWeight = parseFloat(planData[r][c+2] || 0);

        const aStart = progData[r] ? progData[r][c] : "";
        const aFinish = progData[r] ? progData[r][c+1] : "";
        const aPct = progData[r] ? parseFloat(progData[r][c+2] || 0) : 0;

        pObj.milestones.push({
          name: mInfo.name,
          weight: pWeight,
          planned_start: formatDate(pStart),
          planned_finish: formatDate(pFinish),
          actual_start: formatDate(aStart),
          actual_finish: formatDate(aFinish),
          actual_pct: aPct
        });
      }

      projects.push(pObj);
    }

    return createJsonResponse({
      status: "success",
      total_projects: projects.length,
      milestones_count: milestones.length,
      updated_at: Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm:ss"),
      projects: projects
    });

  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

/**
 * 3. onEdit Trigger: เมื่อมีคนแก้ไขเซลล์ใน Google Sheet ให้ยิง Webhook ไปบอก Dashboard ทันที
 */
function onEdit(e) {
  try {
    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();
    
    // ทำงานเฉพาะเมื่อแก้ไขชีต 'data Progress' หรือ 'Plan'
    if (sheetName === "data Progress" || sheetName === "Plan") {
      const row = e.range.getRow();
      const col = e.range.getColumn();
      const value = e.value;

      if (row >= 5 && col >= 8) {
        const prjName = sheet.getRange(row, 3).getValue();
        const headerCol = Math.floor((col - 8) / 3) * 3 + 8;
        const milestoneName = sheet.getRange(3, headerCol).getValue();

        notifyWebDashboard({
          event: "sheet_edited",
          sheet: sheetName,
          row: row,
          project_name: prjName,
          milestone_name: milestoneName,
          new_value: value
        });
      }
    }
  } catch (err) {
    console.error("onEdit error: " + err);
  }
}

/**
 * Helper: ส่งสัญญาณ Webhook ไปยัง Web Dashboard
 */
function notifyWebDashboard(payload) {
  if (!WEBHOOK_DASHBOARD_URL || WEBHOOK_DASHBOARD_URL.includes("your-dashboard-domain")) {
    return;
  }
  try {
    UrlFetchApp.fetch(WEBHOOK_DASHBOARD_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    console.warn("Failed to notify dashboard: " + e);
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatDate(dt) {
  if (!dt) return "";
  if (dt instanceof Date) {
    return Utilities.formatDate(dt, "Asia/Bangkok", "yyyy-MM-dd");
  }
  return String(dt);
}
