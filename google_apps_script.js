/**
 * ==============================================================================
 * Google Apps Script for Solar Project Monitoring Dashboard & LINE Integration
 * ==============================================================================
 * วิธีใช้งาน:
 * 1. ใน Google Sheet ของคุณ ไปที่เมนู "ส่วนขยาย" (Extensions) > "Apps Script"
 * 2. ลบโค้ดเดิมทั้งหมดออก แล้ววางโค้ดชุดนี้ลงไป
 * 3. แก้ไขตัวแปร WEBHOOK_SERVER_URL (ถ้ามีเซิร์ฟเวอร์เว็บ Dashboard) และ LINE_ACCESS_TOKEN
 * 4. คลิก "ปรับใช้" (Deploy) > "การปรับใช้รายการใหม่" (New Deployment)
 *    - เลือกประเภท: "เว็บแอป" (Web App)
 *    - ผู้มีสิทธิ์เข้าถึง (Who has access): "ทุกคน" (Anyone)
 * 5. นำ URL ที่ได้ไปใส่ใน LINE Developers Console (เป็น Webhook URL หรือ LIFF Endpoint)
 */

var WEBHOOK_SERVER_URL = "http://localhost:8000/api/webhook";
var LINE_ACCESS_TOKEN = "YOUR_LINE_CHANNEL_ACCESS_TOKEN";

/**
 * เมนูเพิ่มเติมใน Google Sheet
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('⚡ Solar Dashboard')
    .addItem('📊 คำนวณ % ความก้าวหน้าทั้งหมด', 'recalculateAllProgress')
    .addItem('🔄 ส่งข้อมูลอัปเดตไปที่ Web Dashboard', 'syncToWebDashboard')
    .addToUi();
}

/**
 * รับ Request แบบ GET
 */
function doGet(e) {
  var action = e.parameter.action || "get_projects";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (action === "get_projects") {
    var sheet = ss.getSheetByName("Plan");
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({error: "Sheet 'Plan' not found"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var data = sheet.getDataRange().getValues();
    var projects = [];
    
    for (var r = 5; r < data.length; r++) {
      var name = data[r][2];
      if (name && name !== "") {
        projects.push({
          row: r + 1,
          business_unit: data[r][0],
          order_no: data[r][1],
          name: name,
          lot: data[r][3],
          capacity_kwp: data[r][4],
          installation_type: data[r][5],
          type_code: data[r][6]
        });
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({status: "success", count: projects.length, projects: projects}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({status: "ready", timestamp: new Date()}))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * รับ Request แบบ POST (จาก LINE Webhook หรือ LINE LIFF Form)
 */
function doPost(e) {
  try {
    var contents = JSON.parse(e.postData.contents);
    
    // ตรวจสอบกรณีเป็น LINE Webhook Event
    if (contents.events && contents.events.length > 0) {
      for (var i = 0; i < contents.events.length; i++) {
        var event = contents.events[i];
        if (event.type === "message" && event.message.type === "text") {
          handleLineTextMessage(event);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({status: "ok"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // ตรวจสอบกรณีส่งจาก LINE LIFF Form หรือ API
    if (contents.action === "update_milestone") {
      var res = updateMilestoneInSheet(
        contents.project_name,
        contents.milestone_name,
        contents.actual_pct,
        contents.actual_start,
        contents.actual_finish
      );
      
      return ContentService.createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({status: "unknown_action"}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * อัปเดตข้อมูล Milestone ลงใน Sheet 'data Progress'
 */
function updateMilestoneInSheet(projectName, milestoneName, actualPct, actualStart, actualFinish) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("data Progress") || ss.getSheetByName("Plan");
  if (!sheet) return {success: false, message: "Sheet not found"};
  
  var data = sheet.getDataRange().getValues();
  var headers = data[2]; // Row 3
  
  // ค้นหาคอลัมน์ของ Milestone
  var targetCol = -1;
  for (var c = 0; c < headers.length; c++) {
    if (headers[c] && headers[c].toString().trim() === milestoneName.trim()) {
      targetCol = c; // คอลัมน์ Start (c+1 = Finish, c+2 = %)
      break;
    }
  }
  
  // ค้นหาแถวของโครงการ (Col D = Index 3)
  var targetRow = -1;
  for (var r = 5; r < data.length; r++) {
    if (data[r][3] && data[r][3].toString().trim().toLowerCase() === projectName.trim().toLowerCase()) {
      targetRow = r + 1; // 1-indexed for Sheet API
      break;
    }
  }
  
  if (targetRow === -1) {
    return {success: false, message: "Project '" + projectName + "' not found"};
  }
  if (targetCol === -1) {
    return {success: false, message: "Milestone '" + milestoneName + "' not found"};
  }
  
  // อัปเดตข้อมูล (Col 1-indexed)
  if (actualStart) {
    sheet.getRange(targetRow, targetCol + 1).setValue(actualStart);
  }
  if (actualFinish) {
    sheet.getRange(targetRow, targetCol + 2).setValue(actualFinish);
  }
  if (actualPct !== undefined && actualPct !== null) {
    var pctVal = parseFloat(actualPct);
    if (pctVal > 1.0) pctVal = pctVal / 100.0;
    sheet.getRange(targetRow, targetCol + 3).setValue(pctVal);
  }
  
  return {
    success: true,
    message: "Updated " + projectName + " -> " + milestoneName + " (" + (actualPct*100) + "%)"
  };
}

/**
 * จัดการข้อความตอบกลับ LINE Bot
 */
function handleLineTextMessage(event) {
  var userMsg = event.message.text.trim();
  var replyToken = event.replyToken;
  
  // ข้อความช่วยเหลือ
  if (userMsg.toLowerCase() === "เมนู" || userMsg.toLowerCase() === "help" || userMsg === "ติดตามโครงการ") {
    var replyText = "📊 Solar Project Monitoring Bot\n\n"
      + "คุณสามารถ:\n"
      + "1. กดปุ่มเปิดฟอร์ม LIFF เพื่ออัปเดตหน้างาน\n"
      + "2. พิมพ์ชื่อโครงการเพื่อดูความก้าวหน้าล่าสุด\n"
      + "เช่น 'ฟาร์มกาญจนบุรี'";
    replyLine(replyToken, replyText);
    return;
  }
  
  // ค้นหาโครงการตามชื่อ
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Plan");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  
  for (var r = 5; r < data.length; r++) {
    var pName = data[r][2];
    if (pName && pName.toString().includes(userMsg)) {
      var bu = data[r][0];
      var lot = data[r][3];
      var cap = data[r][4];
      var install = data[r][5];
      
      var reply = "⚡ ข้อมูลโครงการ: " + pName + "\n"
        + "🏢 กลุ่มธุรกิจ: " + bu + "\n"
        + "📦 เฟส/Lot: " + lot + "\n"
        + "🔋 กำลังการผลิต: " + cap + " kWp\n"
        + "🏗️ ประเภท: " + install + "\n\n"
        + "👉 หากต้องการอัปเดตความก้าวหน้า ให้เปิดฟอร์ม LIFF ได้เลยครับ";
        
      replyLine(replyToken, reply);
      return;
    }
  }
}

function replyLine(replyToken, text) {
  if (!LINE_ACCESS_TOKEN || LINE_ACCESS_TOKEN === "YOUR_LINE_CHANNEL_ACCESS_TOKEN") return;
  var url = "https://api.line.me/v2/bot/message/reply";
  var payload = {
    replyToken: replyToken,
    messages: [{type: "text", text: text}]
  };
  UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload)
  });
}
