// State
let globalOverview = null;
let allProjects = [];
let currentProject = null;
let currentTab = 'overview';

// Charts references
let phaseBarChart = null;
let statusDonutChart = null;
let projectScurveChart = null;
let comparisonBarChart = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  await loadInitialData();
  
  // Set current URL in LIFF integration box
  const liffUrlEl = document.getElementById('liff-url-text');
  if (liffUrlEl) {
    liffUrlEl.innerText = window.location.origin + '/liff';
  }
});

// Toast notification helper
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  const toastIcon = document.getElementById('toast-icon');
  
  toastMsg.innerText = msg;
  toastIcon.innerHTML = type === 'success' 
    ? `<i data-lucide="check-circle-2" class="w-5 h-5 text-emerald-400"></i>`
    : `<i data-lucide="alert-circle" class="w-5 h-5 text-rose-400"></i>`;
    
  toast.classList.remove('hidden');
  lucide.createIcons();
  
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

// Refresh all data
async function refreshData() {
  const icon = document.getElementById('refresh-icon');
  if (icon) icon.classList.add('animate-spin');
  
  await loadInitialData();
  if (currentProject) {
    await selectProject(currentProject.id);
  }
  
  setTimeout(() => {
    if (icon) icon.classList.remove('animate-spin');
    showToast('อัปเดตข้อมูลล่าสุดเรียบร้อยแล้ว');
  }, 400);
}

// Fetch Initial Data
async function loadInitialData() {
  try {
    const [overviewRes, projectsRes] = await Promise.all([
      fetch('/api/overview'),
      fetch('/api/projects')
    ]);
    
    globalOverview = await overviewRes.json();
    const pData = await projectsRes.json();
    allProjects = pData.projects || [];
    
    renderKPIs();
    populateFilters();
    renderPhaseOverviewTab();
    renderComparisonTab();
    populateSimulatorDropdowns();
    populateCctvDropdown();
    
    // Select first project by default
    if (allProjects.length > 0 && !currentProject) {
      await selectProject(allProjects[0].id);
    }
    
  } catch (err) {
    console.error("Error loading data:", err);
    showToast("เกิดข้อผิดพลาดในการโหลดข้อมูล", "error");
  }
}

// Render Top KPI Cards
function renderKPIs() {
  if (!globalOverview) return;
  
  document.getElementById('kpi-total-projects').innerText = globalOverview.total_projects;
  document.getElementById('kpi-phases-count').innerText = (globalOverview.phases || []).length;
  document.getElementById('kpi-total-capacity').innerText = globalOverview.total_capacity_mwp + ' MW';
  document.getElementById('kpi-capacity-kwp').innerText = Number(globalOverview.total_capacity_kwp).toLocaleString();
  
  document.getElementById('kpi-actual-progress').innerText = globalOverview.avg_actual_progress_pct + '%';
  document.getElementById('kpi-planned-progress').innerText = '/ ' + globalOverview.avg_planned_progress_pct + '%';
  
  const varPct = globalOverview.variance_pct;
  const varBadge = document.getElementById('kpi-variance-badge');
  if (varPct >= 0) {
    varBadge.innerHTML = `<span class="text-emerald-600 font-semibold">▲ เร็วกว่าแผน +${varPct}%</span>`;
  } else {
    varBadge.innerHTML = `<span class="text-rose-600 font-semibold">▼ ช้ากว่าแผน ${varPct}%</span>`;
  }
  
  document.getElementById('kpi-completed').innerText = `${globalOverview.completed_count} เสร็จ`;
  document.getElementById('kpi-ontrack').innerText = `${globalOverview.on_track_count} ปกติ`;
  document.getElementById('kpi-delayed').innerText = `${globalOverview.delayed_count} ล่าช้า`;
  
  const now = new Date();
  document.getElementById('kpi-update-time').innerText = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

// Populate Filter dropdowns
function populateFilters() {
  const lotSel = document.getElementById('filter-lot');
  const buSel = document.getElementById('filter-bu');
  const compareLotSel = document.getElementById('compare-lot-select');
  
  lotSel.innerHTML = '<option value="">-- ทุกล็อต / เฟส --</option>';
  compareLotSel.innerHTML = '<option value="ALL">แสดงทุกโครงการ (Top 25)</option>';
  (globalOverview.lots || []).forEach(lot => {
    lotSel.innerHTML += `<option value="${lot}">${lot}</option>`;
    compareLotSel.innerHTML += `<option value="${lot}">เฉพาะ ${lot}</option>`;
  });
  
  buSel.innerHTML = '<option value="">-- ทุกกลุ่มธุรกิจ --</option>';
  (globalOverview.business_units || []).forEach(bu => {
    buSel.innerHTML += `<option value="${bu}">${bu}</option>`;
  });
  
  updateProjectDropdown(allProjects);
}

function populateCctvDropdown() {
  const cctvSel = document.getElementById('cctv-project-select');
  if (!cctvSel) return;
  cctvSel.innerHTML = '<option value="">-- เลือกโครงการที่ต้องการดูกล้อง --</option>';
  allProjects.forEach(p => {
    cctvSel.innerHTML += `<option value="${p.id}">[${p.lot}] ${p.name}</option>`;
  });
}

function updateProjectDropdown(projectsList) {
  const prjSel = document.getElementById('select-project');
  prjSel.innerHTML = '';
  projectsList.forEach(p => {
    prjSel.innerHTML += `<option value="${p.id}">[${p.lot}] ${p.name} (${p.capacity_kwp} kWp)</option>`;
  });
  if (currentProject) {
    prjSel.value = currentProject.id;
  }
}

// Tab Switching
function switchTab(tabId) {
  currentTab = tabId;
  const tabs = ['overview', 'project', 'comparison', 'cctv', 'integration'];
  
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (t === tabId) {
      el.classList.remove('hidden');
      btn.className = 'py-3 px-1 border-b-2 border-amber-500 text-amber-400 flex items-center space-x-2 font-medium whitespace-nowrap';
    } else {
      el.classList.add('hidden');
      btn.className = 'py-3 px-1 border-b-2 border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700 flex items-center space-x-2 font-medium whitespace-nowrap';
    }
  });
  
  lucide.createIcons();
  
  // Trigger chart resizes
  if (tabId === 'overview' && phaseBarChart) phaseBarChart.render();
  if (tabId === 'project' && projectScurveChart) projectScurveChart.render();
  if (tabId === 'comparison' && comparisonBarChart) comparisonBarChart.render();
}

// =========================================================================
// TAB 1: PHASE OVERVIEW
// =========================================================================
function renderPhaseOverviewTab() {
  if (!globalOverview) return;
  
  const phases = globalOverview.phases || [];
  
  // 1. Render Phase Bar Chart
  const phaseCategories = phases.map(p => p.lot);
  const plannedSeries = phases.map(p => p.avg_planned_progress);
  const actualSeries = phases.map(p => p.avg_actual_progress);
  
  const barOptions = {
    series: [
      { name: 'แผนงาน (Planned %)', data: plannedSeries },
      { name: 'ผลงานจริง (Actual %)', data: actualSeries }
    ],
    chart: {
      type: 'bar',
      height: '100%',
      toolbar: { show: false },
      fontFamily: 'Prompt, sans-serif'
    },
    colors: ['#3b82f6', '#10b981'],
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: '55%',
        borderRadius: 4
      }
    },
    dataLabels: {
      enabled: false
    },
    stroke: {
      show: true,
      width: 2,
      colors: ['transparent']
    },
    xaxis: {
      categories: phaseCategories,
      labels: { style: { fontSize: '11px', colors: '#64748b' } }
    },
    yaxis: {
      max: 100,
      title: { text: '% ความก้าวหน้า' },
      labels: { formatter: val => Math.round(val) + '%' }
    },
    fill: { opacity: 1 },
    tooltip: {
      y: { formatter: val => val + '%' }
    },
    legend: { position: 'top', fontSize: '12px' }
  };
  
  const chartEl = document.getElementById('phase-bar-chart');
  if (chartEl) {
    if (phaseBarChart) phaseBarChart.destroy();
    phaseBarChart = new ApexCharts(chartEl, barOptions);
    phaseBarChart.render();
  }
  
  // 2. Render Status Donut Chart
  const donutOptions = {
    series: [globalOverview.completed_count, globalOverview.on_track_count, globalOverview.delayed_count],
    labels: ['เสร็จสมบูรณ์', 'ตามแผนงาน', 'ล่าช้ากว่าแผน'],
    colors: ['#10b981', '#3b82f6', '#f43f5e'],
    chart: {
      type: 'donut',
      height: 220,
      fontFamily: 'Prompt, sans-serif'
    },
    legend: { show: false },
    dataLabels: { enabled: true, formatter: (val) => Math.round(val) + '%' },
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'โครงการ',
              fontSize: '12px',
              color: '#64748b',
              formatter: () => globalOverview.total_projects
            }
          }
        }
      }
    }
  };
  
  const donutEl = document.getElementById('status-donut-chart');
  if (donutEl) {
    if (statusDonutChart) statusDonutChart.destroy();
    statusDonutChart = new ApexCharts(donutEl, donutOptions);
    statusDonutChart.render();
  }
  
  document.getElementById('donut-stat-completed').innerText = globalOverview.completed_count;
  document.getElementById('donut-stat-ontrack').innerText = globalOverview.on_track_count;
  document.getElementById('donut-stat-delayed').innerText = globalOverview.delayed_count;
  
  // 3. Render Phase Cards Grid
  const container = document.getElementById('phase-cards-container');
  container.innerHTML = '';
  
  phases.forEach(phase => {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition cursor-pointer';
    card.onclick = () => filterByPhaseAndOpen(phase.lot);
    
    const diff = round(phase.avg_actual_progress - phase.avg_planned_progress, 1);
    const diffBadge = diff >= 0
      ? `<span class="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">▲ +${diff}%</span>`
      : `<span class="text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">▼ ${diff}%</span>`;
      
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800">${phase.lot}</span>
        ${diffBadge}
      </div>
      
      <div class="mt-3">
        <div class="flex items-baseline justify-between">
          <h4 class="font-bold text-slate-800 text-lg">${phase.project_count} โครงการ</h4>
          <span class="text-xs font-medium text-slate-500">${phase.total_capacity_kwp.toLocaleString()} kWp</span>
        </div>
      </div>
      
      <!-- Progress bar -->
      <div class="mt-4 space-y-1.5">
        <div class="flex justify-between text-xs font-medium">
          <span class="text-slate-600">ผลงานจริง: <strong class="text-emerald-600">${phase.avg_actual_progress}%</strong></span>
          <span class="text-slate-400">แผน: ${phase.avg_planned_progress}%</span>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
          <div class="bg-gradient-to-r from-emerald-500 to-teal-400 h-2.5 rounded-full transition-all" style="width: ${Math.min(100, phase.avg_actual_progress)}%"></div>
        </div>
      </div>
      
      <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>เสร็จ: ${phase.completed_count} | ช้า: ${phase.delayed_count}</span>
        <span class="text-amber-600 font-medium hover:underline flex items-center gap-0.5">
          ดูรายละเอียด <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
        </span>
      </div>
    `;
    container.appendChild(card);
  });
  
  lucide.createIcons();
}

function filterByPhaseAndOpen(lotName) {
  document.getElementById('filter-lot').value = lotName;
  onLotChange();
  switchTab('project');
}

// =========================================================================
// TAB 2: PROJECT DETAIL & S-CURVE
// =========================================================================
function onLotChange() {
  const lotVal = document.getElementById('filter-lot').value;
  const buVal = document.getElementById('filter-bu').value;
  
  const filtered = allProjects.filter(p => {
    if (lotVal && p.lot !== lotVal) return false;
    if (buVal && p.business_unit !== buVal) return false;
    return true;
  });
  
  updateProjectDropdown(filtered);
  if (filtered.length > 0) {
    selectProject(filtered[0].id);
  }
}

function onBuChange() {
  onLotChange();
}

function onProjectSelect() {
  const prjId = document.getElementById('select-project').value;
  if (prjId) {
    selectProject(prjId);
  }
}

async function selectProject(projectId) {
  try {
    const res = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) throw new Error("Project not found");
    currentProject = await res.json();
    renderProjectDetail();
  } catch (err) {
    console.error("Error fetching project:", err);
  }
}

function renderProjectDetail() {
  if (!currentProject) return;
  const p = currentProject;
  
  document.getElementById('prj-lot-badge').innerText = p.lot;
  document.getElementById('prj-bu-badge').innerText = p.business_unit;
  document.getElementById('prj-type-badge').innerText = `Type ${p.type_code}`;
  document.getElementById('prj-name').innerText = p.name;
  document.getElementById('prj-install-type').innerText = `${p.installation_type} • ${p.capacity_kwp} kWp`;
  
  document.getElementById('prj-act-pct').innerText = p.actual_progress_pct + '%';
  document.getElementById('prj-plan-pct').innerText = '/ ' + p.planned_progress_pct + '%';
  
  const pill = document.getElementById('prj-status-pill');
  if (p.status === 'COMPLETED') {
    pill.className = 'inline-block mt-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800';
    pill.innerText = 'เสร็จสมบูรณ์';
  } else if (p.status === 'DELAYED') {
    pill.className = 'inline-block mt-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800';
    pill.innerText = `ล่าช้า ${p.variance_pct}%`;
  } else {
    pill.className = 'inline-block mt-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800';
    pill.innerText = 'ตามแผนงาน';
  }
  
  document.getElementById('prj-plan-start').innerText = p.planned_start || '-';
  document.getElementById('prj-plan-finish').innerText = p.planned_finish || '-';
  document.getElementById('prj-act-start').innerText = p.actual_start || '-';
  document.getElementById('prj-act-finish').innerText = p.actual_finish || '-';
  
  // Render S-Curve
  renderProjectScurve(p.s_curve);
  
  // Render Milestone Table
  renderMilestonesTable(p.milestones || []);
}

function renderProjectScurve(scurveData) {
  if (!scurveData || !scurveData.weeks || scurveData.weeks.length === 0) return;
  
  const options = {
    series: [
      {
        name: 'Planned Cumulative S-Curve (%)',
        type: 'line',
        data: scurveData.planned_cum
      },
      {
        name: 'Actual Cumulative S-Curve (%)',
        type: 'line',
        data: scurveData.actual_cum
      },
      {
        name: 'Planned Weekly (%)',
        type: 'column',
        data: scurveData.planned_weekly
      },
      {
        name: 'Actual Weekly (%)',
        type: 'column',
        data: scurveData.actual_weekly
      }
    ],
    chart: {
      height: '100%',
      type: 'line',
      stacked: false,
      toolbar: {
        show: true,
        tools: { download: true, zoom: true, reset: true }
      },
      fontFamily: 'Prompt, sans-serif'
    },
    stroke: {
      width: [3.5, 3.5, 0, 0],
      curve: 'smooth',
      dashArray: [0, 0, 0, 0]
    },
    colors: ['#2563eb', '#10b981', '#93c5fd', '#6ee7b7'],
    fill: {
      opacity: [1, 1, 0.35, 0.45]
    },
    labels: scurveData.labels,
    xaxis: {
      type: 'category',
      labels: {
        rotate: -45,
        rotateAlways: false,
        style: { fontSize: '10px', colors: '#64748b' }
      }
    },
    yaxis: [
      {
        title: { text: 'Cumulative %' },
        min: 0,
        max: 100,
        labels: { formatter: val => Math.round(val) + '%' }
      },
      {
        opposite: true,
        show: false,
        min: 0,
        max: 100
      },
      {
        opposite: true,
        title: { text: 'Weekly %' },
        min: 0,
        max: 30,
        labels: { formatter: val => val ? val.toFixed(1) + '%' : '' }
      },
      {
        opposite: true,
        show: false,
        min: 0,
        max: 30
      }
    ],
    tooltip: {
      shared: true,
      intersect: false,
      y: {
        formatter: function (y) {
          if (typeof y !== "undefined" && y !== null) {
            return y.toFixed(2) + "%";
          }
          return "-";
        }
      }
    },
    legend: {
      position: 'top',
      fontSize: '12px'
    }
  };
  
  const chartEl = document.getElementById('project-scurve-chart');
  if (chartEl) {
    if (projectScurveChart) projectScurveChart.destroy();
    projectScurveChart = new ApexCharts(chartEl, options);
    projectScurveChart.render();
  }
}

function renderMilestonesTable(milestones) {
  const tbody = document.getElementById('milestones-table-body');
  tbody.innerHTML = '';
  document.getElementById('milestones-count-label').innerText = `${milestones.length} งานทั้งหมด`;
  
  milestones.forEach((m, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';
    
    const pctVal = Math.round(m.actual_pct * 100);
    const weightPct = (m.weight * 100).toFixed(1) + '%';
    const contribPct = (m.actual_contribution * 100).toFixed(2) + '%';
    
    let statusBadge = '';
    if (m.status === 'COMPLETED') {
      statusBadge = '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold">เสร็จสิ้น</span>';
    } else if (m.status === 'IN_PROGRESS') {
      statusBadge = '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold">กำลังทำ</span>';
    } else {
      statusBadge = '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">รอดำเนินการ</span>';
    }
    
    let catBadge = '';
    if (m.category.includes('Permission')) {
      catBadge = '<span class="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">งานราชการ</span>';
    } else if (m.category.includes('Engineering')) {
      catBadge = '<span class="text-[10px] text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded">ออกแบบ</span>';
    } else {
      catBadge = '<span class="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded">ก่อสร้าง</span>';
    }
    
    tr.innerHTML = `
      <td class="py-3 px-4 font-medium text-slate-900">${m.name}</td>
      <td class="py-3 px-3">${catBadge}</td>
      <td class="py-3 px-3 text-center font-mono font-semibold text-slate-700">${weightPct}</td>
      <td class="py-3 px-3 text-slate-500 font-mono">${m.planned_start || '-'} <br><span class="text-slate-400">ถึง</span> ${m.planned_finish || '-'}</td>
      <td class="py-3 px-3 text-slate-700 font-mono">${m.actual_start || '-'} <br><span class="text-slate-400">ถึง</span> ${m.actual_finish || '-'}</td>
      <td class="py-3 px-4">
        <div class="flex items-center space-x-2">
          <div class="w-20 bg-slate-100 rounded-full h-2 overflow-hidden">
            <div class="bg-amber-500 h-2 rounded-full" style="width: ${pctVal}%"></div>
          </div>
          <span class="font-bold text-slate-800 w-8 text-right">${pctVal}%</span>
        </div>
      </td>
      <td class="py-3 px-3 text-center font-mono font-semibold text-emerald-600">${contribPct}</td>
      <td class="py-3 px-3 text-center">${statusBadge}</td>
      <td class="py-3 px-3 text-center">
        <button onclick="openQuickUpdateModal('${m.name}', ${pctVal}, '${m.actual_start || ''}', '${m.actual_finish || ''}')" class="p-1 text-slate-400 hover:text-amber-600 rounded hover:bg-amber-50" title="แก้ไข">
          <i data-lucide="edit-2" class="w-4 h-4"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  lucide.createIcons();
}

// =========================================================================
// PDF REPORT GENERATOR
// =========================================================================
async function generateProjectPDF() {
  if (!currentProject) {
    showToast('กรุณาเลือกโครงการก่อนสร้างรายงาน', 'error');
    return;
  }
  
  const btn = document.getElementById('btn-gen-pdf');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="animate-spin mr-1">⏳</span> กำลังสร้าง PDF...`;
  
  const p = currentProject;
  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  
  // Build PDF HTML Template
  let milestoneRows = '';
  (p.milestones || []).forEach((m, idx) => {
    const pct = Math.round(m.actual_pct * 100);
    const weight = (m.weight * 100).toFixed(1);
    const contrib = (m.actual_contribution * 100).toFixed(2);
    milestoneRows += `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
        <td style="padding: 6px 8px; font-weight: 500;">${idx+1}. ${m.name}</td>
        <td style="padding: 6px 8px; text-align: center;">${weight}%</td>
        <td style="padding: 6px 8px; text-align: center;">${m.planned_start || '-'} ~ ${m.planned_finish || '-'}</td>
        <td style="padding: 6px 8px; text-align: center;">${m.actual_start || '-'} ~ ${m.actual_finish || '-'}</td>
        <td style="padding: 6px 8px; text-align: center; font-weight: bold; color: ${pct>=100 ? '#059669' : '#d97706'};">${pct}%</td>
        <td style="padding: 6px 8px; text-align: center; color: #2563eb; font-weight: 600;">${contrib}%</td>
        <td style="padding: 6px 8px; text-align: center;">${m.status === 'COMPLETED' ? 'เสร็จสิ้น' : (m.status === 'IN_PROGRESS' ? 'กำลังทำ' : 'รอดำเนินการ')}</td>
      </tr>
    `;
  });

  const reportContainer = document.getElementById('printable-report');
  reportContainer.innerHTML = `
    <div style="font-family: 'Prompt', sans-serif; color: #1e293b; padding: 20px; max-width: 800px; margin: 0 auto;">
      
      <!-- Report Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 15px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="background: #f59e0b; width: 28px; height: 28px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; color: white; font-weight: bold;">⚡</div>
            <h1 style="font-size: 20px; font-weight: bold; margin: 0; color: #0f172a;">KPGreenergy Planner</h1>
          </div>
          <p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0;">รายงานความก้าวหน้าโครงการพลังงานแสงอาทิตย์ (Project Progress Report)</p>
        </div>
        <div style="text-align: right; font-size: 11px; color: #475569;">
          <p style="margin: 0; font-weight: 600;">วันที่ออกรายงาน: ${dateStr}</p>
          <p style="margin: 2px 0 0 0;">Lot: <strong>${p.lot}</strong> | กลุ่ม: <strong>${p.business_unit}</strong></p>
        </div>
      </div>

      <!-- Project Key Information Box -->
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 15px;">
        <h2 style="font-size: 16px; font-weight: bold; margin: 0 0 8px 0; color: #0f172a;">โครงการ: ${p.name}</h2>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 11px;">
          <div>
            <span style="color: #64748b;">กำลังการผลิต:</span><br>
            <strong style="color: #0f172a; font-size: 13px;">${p.capacity_kwp} kWp</strong>
          </div>
          <div>
            <span style="color: #64748b;">ประเภทการติดตั้ง:</span><br>
            <strong style="color: #0f172a;">${p.installation_type} (Type ${p.type_code})</strong>
          </div>
          <div>
            <span style="color: #64748b;">ผลงานจริง / แผนงาน:</span><br>
            <strong style="color: #059669; font-size: 13px;">${p.actual_progress_pct}%</strong> <span style="color: #64748b;">/ ${p.planned_progress_pct}%</span>
          </div>
          <div>
            <span style="color: #64748b;">สถานะโครงการ:</span><br>
            <strong style="color: ${p.status==='DELAYED' ? '#e11d48' : '#059669'};">${p.status_th} (${p.variance_pct>=0 ? '+'+p.variance_pct : p.variance_pct}%)</strong>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 10px; border-top: 1px dashed #cbd5e1; margin-top: 8px; padding-top: 6px; color: #475569;">
          <div>แผนงาน: <strong>${p.planned_start || '-'}</strong> ถึง <strong>${p.planned_finish || '-'}</strong></div>
          <div>วันจริง: <strong>${p.actual_start || '-'}</strong> ถึง <strong>${p.actual_finish || '-'}</strong></div>
        </div>
      </div>

      <!-- S-Curve Summary Progress -->
      <div style="margin-bottom: 15px;">
        <h3 style="font-size: 13px; font-weight: bold; margin: 0 0 6px 0; color: #0f172a;">สรุปผลงานสะสม (S-Curve Cumulative Summary)</h3>
        <div style="background: #f1f5f9; border-radius: 6px; padding: 10px; display: flex; justify-content: space-around; font-size: 11px;">
          <div>แผนงานสะสมปัจจุบัน: <strong style="color: #2563eb; font-size: 14px;">${p.planned_progress_pct}%</strong></div>
          <div>ผลงานจริงสะสมปัจจุบัน: <strong style="color: #059669; font-size: 14px;">${p.actual_progress_pct}%</strong></div>
          <div>ผลต่าง (Variance): <strong style="color: ${p.variance_pct<0 ? '#e11d48' : '#059669'}; font-size: 14px;">${p.variance_pct}%</strong></div>
        </div>
      </div>

      <!-- Milestones Breakdown Table -->
      <div>
        <h3 style="font-size: 13px; font-weight: bold; margin: 0 0 6px 0; color: #0f172a;">รายละเอียดขั้นตอนการดำเนินงาน (Milestone Breakdown)</h3>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #e2e8f0; color: #334155; font-size: 10px; text-transform: uppercase;">
              <th style="padding: 6px 8px;">รายการงาน (Milestone)</th>
              <th style="padding: 6px 8px; text-align: center;">น้ำหนัก</th>
              <th style="padding: 6px 8px; text-align: center;">แผนเริ่ม-เสร็จ</th>
              <th style="padding: 6px 8px; text-align: center;">วันจริงเริ่ม-เสร็จ</th>
              <th style="padding: 6px 8px; text-align: center;">% งาน</th>
              <th style="padding: 6px 8px; text-align: center;">% สะสม</th>
              <th style="padding: 6px 8px; text-align: center;">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            ${milestoneRows}
          </tbody>
        </table>
      </div>

      <!-- Report Footer -->
      <div style="margin-top: 25px; border-top: 1px solid #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8;">
        <div>KPGreenergy Planner • เอกสารออกโดยระบบติดตามโครงการอัตโนมัติ</div>
        <div>หน้า 1 / 1</div>
      </div>

    </div>
  `;

  // Export options for html2pdf
  const opt = {
    margin: [10, 10, 10, 10],
    filename: `KPGreenergy_Report_${p.name.replace(/\s+/g, '_')}_${now.toISOString().split('T')[0]}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    await html2pdf().set(opt).from(reportContainer.firstElementChild).save();
    showToast(`สร้างรายงาน PDF โครงการ ${p.name} สำเร็จแล้ว!`);
  } catch (err) {
    console.error("PDF generation error:", err);
    // Fallback to window.print()
    window.print();
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    lucide.createIcons();
  }
}

// =========================================================================
// TAB 3: COMPARISON TAB
// =========================================================================
function renderComparisonTab() {
  const lotFilter = document.getElementById('compare-lot-select').value;
  let list = allProjects;
  if (lotFilter !== 'ALL') {
    list = allProjects.filter(p => p.lot === lotFilter);
  }
  
  const topList = list.slice(0, 25);
  
  const names = topList.map(p => p.name.length > 20 ? p.name.substring(0, 18) + '...' : p.name);
  const planData = topList.map(p => p.planned_progress_pct);
  const actData = topList.map(p => p.actual_progress_pct);
  
  const options = {
    series: [
      { name: 'แผนงาน (%)', data: planData },
      { name: 'ผลงานจริง (%)', data: actData }
    ],
    chart: {
      type: 'bar',
      height: 380,
      toolbar: { show: true },
      fontFamily: 'Prompt, sans-serif'
    },
    colors: ['#93c5fd', '#10b981'],
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: '60%',
        borderRadius: 3
      }
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: names,
      labels: { rotate: -45, style: { fontSize: '10px' } }
    },
    yaxis: {
      max: 100,
      labels: { formatter: val => val + '%' }
    },
    tooltip: {
      y: { formatter: val => val + '%' }
    },
    legend: { position: 'top' }
  };
  
  const chartEl = document.getElementById('comparison-bar-chart');
  if (chartEl) {
    if (comparisonBarChart) comparisonBarChart.destroy();
    comparisonBarChart = new ApexCharts(chartEl, options);
    comparisonBarChart.render();
  }
  
  // Render Delayed Table
  const delayedList = allProjects.filter(p => p.status === 'DELAYED' || p.variance_pct < -5);
  const delayedTbody = document.getElementById('delayed-table-body');
  delayedTbody.innerHTML = '';
  
  delayedList.forEach(p => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-rose-50/40 transition';
    tr.innerHTML = `
      <td class="py-3 px-4 font-semibold text-slate-900">${p.name}</td>
      <td class="py-3 px-3">${p.business_unit}</td>
      <td class="py-3 px-3"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">${p.lot}</span></td>
      <td class="py-3 px-3 font-mono">${p.capacity_kwp}</td>
      <td class="py-3 px-3 text-center font-semibold text-slate-500">${p.planned_progress_pct}%</td>
      <td class="py-3 px-3 text-center font-bold text-rose-600">${p.actual_progress_pct}%</td>
      <td class="py-3 px-3 text-center">
        <span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold">${p.variance_pct}%</span>
      </td>
      <td class="py-3 px-3 text-center">
        <button onclick="selectAndOpenProject('${p.id}')" class="text-xs bg-amber-500 text-white px-2.5 py-1 rounded-lg font-medium hover:bg-amber-600 transition">
          ดู S-Curve
        </button>
      </td>
    `;
    delayedTbody.appendChild(tr);
  });
}

function selectAndOpenProject(prjId) {
  selectProject(prjId);
  switchTab('project');
}

// =========================================================================
// QUICK UPDATE MODAL
// =========================================================================
function openQuickUpdateModal(milestoneName, pctVal = 100, actStart = '', actFinish = '') {
  if (!currentProject) return;
  
  const pwdInput = document.getElementById('modal-editor-password');
  const sessionPwd = sessionStorage.getItem('kpg_auth_pwd');
  if (pwdInput && sessionPwd) {
    pwdInput.value = sessionPwd;
  }
  
  document.getElementById('modal-subtitle').innerText = `โครงการ: ${currentProject.name}`;
  const mSelect = document.getElementById('modal-milestone-select');
  mSelect.innerHTML = '';
  
  (currentProject.milestones || []).forEach(m => {
    mSelect.innerHTML += `<option value="${m.name}">${m.name} (${(m.weight*100).toFixed(1)}%)</option>`;
  });
  
  if (milestoneName) {
    mSelect.value = milestoneName;
  }
  
  document.getElementById('modal-pct-slider').value = pctVal;
  document.getElementById('modal-pct-display').innerText = pctVal + '%';
  document.getElementById('modal-start-date').value = actStart || new Date().toISOString().split('T')[0];
  document.getElementById('modal-finish-date').value = actFinish || (pctVal >= 100 ? new Date().toISOString().split('T')[0] : '');
  
  document.getElementById('update-modal').classList.remove('hidden');
}

function closeQuickUpdateModal() {
  document.getElementById('update-modal').classList.add('hidden');
}

function setModalPct(val) {
  document.getElementById('modal-pct-slider').value = val;
  document.getElementById('modal-pct-display').innerText = val + '%';
  if (val >= 100) {
    document.getElementById('modal-finish-date').value = new Date().toISOString().split('T')[0];
  }
}

async function handleModalSubmit(e) {
  e.preventDefault();
  if (!currentProject) return;
  
  const mName = document.getElementById('modal-milestone-select').value;
  const pct = parseFloat(document.getElementById('modal-pct-slider').value);
  const startD = document.getElementById('modal-start-date').value;
  const finishD = document.getElementById('modal-finish-date').value;
  const pwdInput = document.getElementById('modal-editor-password');
  const pwd = pwdInput ? pwdInput.value.trim() : '';
  const savedSheetUrl = localStorage.getItem('kpgreenergy_webapp_url') || localStorage.getItem('kpgreenergy_gsheet_url') || '';
  
  if (!pwd) {
    showToast('กรุณาใส่รหัสผ่าน KPGEditor เพื่อบันทึกข้อมูล', 'error');
    return;
  }
  
  const btn = document.getElementById('modal-submit-btn');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="animate-spin mr-1">⏳</span> กำลังบันทึก...`;
  
  try {
    const res = await fetch('/api/update-milestone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: currentProject.id,
        milestone_name: mName,
        actual_pct: pct,
        actual_start: startD,
        actual_finish: finishD,
        password: pwd,
        sheet_url: savedSheetUrl,
        updated_by: 'Web Editor'
      })
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'บันทึกไม่สำเร็จ');
    }
    
    closeQuickUpdateModal();
    showToast(data.message || `อัปเดต ${mName} สำเร็จแล้ว!`);
    
    // Remember password in session
    sessionStorage.setItem('kpg_auth_pwd', pwd);
    
    // Refresh UI
    await loadInitialData();
    await selectProject(currentProject.id);
    
  } catch (err) {
    console.error(err);
    showToast(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    lucide.createIcons();
  }
}

// =========================================================================
// TAB 5: INTEGRATION & SIMULATOR
// =========================================================================
function populateSimulatorDropdowns() {
  const simPrj = document.getElementById('sim-project-select');
  const simM = document.getElementById('sim-milestone-select');
  
  simPrj.innerHTML = '';
  allProjects.forEach(p => {
    simPrj.innerHTML += `<option value="${p.id}">${p.name}</option>`;
  });
  
  simM.innerHTML = '';
  if (currentProject && currentProject.milestones) {
    currentProject.milestones.forEach(m => {
      simM.innerHTML += `<option value="${m.name}">${m.name}</option>`;
    });
  }
}

async function submitSimulatorUpdate() {
  const prjId = document.getElementById('sim-project-select').value;
  const mName = document.getElementById('sim-milestone-select').value;
  const pct = parseFloat(document.getElementById('sim-pct-input').value);
  const resBox = document.getElementById('sim-result-box');
  
  try {
    const res = await fetch('/api/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_milestone',
        project_id: prjId,
        milestone_name: mName,
        actual_pct: pct,
        actual_start: new Date().toISOString().split('T')[0]
      })
    });
    
    const data = await res.json();
    resBox.classList.remove('hidden');
    resBox.innerText = `>>> Webhook Response (HTTP 200 OK):\n` + JSON.stringify(data, null, 2);
    showToast('ส่ง Webhook จำลองเรียบร้อย Dashboard อัปเดตแล้ว!');
    
    await loadInitialData();
    if (currentProject && currentProject.id === prjId) {
      await selectProject(prjId);
    }
  } catch (err) {
    resBox.classList.remove('hidden');
    resBox.innerText = `Error: ` + err.message;
  }
}

async function copyGasCode() {
  try {
    const res = await fetch('/api/google-apps-script-code');
    const data = await res.json();
    await navigator.clipboard.writeText(data.code);
    const btnText = document.getElementById('copy-gas-btn-text');
    btnText.innerText = 'คัดลอกเรียบร้อยแล้ว!';
    showToast('คัดลอกโค้ด Google Apps Script ไปที่คลิปบอร์ดแล้ว');
    setTimeout(() => {
      btnText.innerText = 'คัดลอกโค้ด Google Apps Script';
    }, 2500);
  } catch (err) {
    showToast('ไม่สามารถคัดลอกได้: ' + err.message, 'error');
  }
}

function round(val, decimals = 2) {
  return Number(Math.round(val + 'e' + decimals) + 'e-' + decimals);
}


// Google Sheets Live Sync
// Google Sheets Live Sync with Timeout Protection
async function saveAndSyncGoogleSheet() {
  const urlInput = document.getElementById('gsheet-url-input');
  const url = urlInput ? urlInput.value.trim() : '';
  if (!url) {
    showToast('กรุณาวางลิงก์ Google Sheet หรือ Web App URL', 'error');
    return;
  }
  
  localStorage.setItem('kpgreenergy_gsheet_url', url);
  const btn = document.getElementById('btn-sync-gsheet');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="animate-spin mr-1">⏳</span> กำลังซิงค์ข้อมูล...`;
  
  // Abort controller for 15s max timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  try {
    const res = await fetch('/api/sync-google-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheet_url: url }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'การซิงค์ไม่สำเร็จ');
    }
    
    showToast(data.message || 'ซิงค์ข้อมูลจาก Google Sheets สำเร็จเรียบร้อย!');
    await refreshData();
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("Sync error:", err);
    if (err.name === 'AbortError') {
      showToast('การเชื่อมต่อใช้เวลานานเกินไป กรุณาใช้ลิงก์แชร์ Google Sheet โดยตรงแทนครับ', 'error');
    } else {
      showToast(err.message || 'เกิดข้อผิดพลาดในการซิงค์ข้อมูล', 'error');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
    lucide.createIcons();
  }
}

// On page load, populate saved Google Sheet URL if any
document.addEventListener('DOMContentLoaded', () => {
  const savedUrl = localStorage.getItem('kpgreenergy_gsheet_url');
  const savedWebAppUrl = localStorage.getItem('kpgreenergy_webapp_url');
  const webappInput = document.getElementById('webapp-url-input');
  if (savedWebAppUrl && webappInput) {
    webappInput.value = savedWebAppUrl;
  }
  const inputEl = document.getElementById('gsheet-url-input');
  if (savedUrl && inputEl) {
    inputEl.value = savedUrl;
  }
});


// Save Web App URL for 2-Way Writing
function saveWebAppUrl() {
  const inputEl = document.getElementById('webapp-url-input');
  const url = inputEl ? inputEl.value.trim() : '';
  if (!url) {
    showToast('กรุณาวาง URL ของ Web App จาก Apps Script', 'error');
    return;
  }
  localStorage.setItem('kpgreenergy_webapp_url', url);
  showToast('บันทึกลิงก์เขียนข้อมูล 2-Way เรียบร้อยแล้ว!');
}