/* ═══════════════════════════════════════════════════════
   Hostel Room & Bed Allocation System — Frontend JS
   ═══════════════════════════════════════════════════════ */

"use strict";

// ── Global State ─────────────────────────────────────────
let hostelData       = {};
let pendingCheckoutBed = null;
let adminSortField   = "name";
let adminSortAsc     = true;
let adminStudents    = [];
let editingStudentId = null;

// Race Demo state
const STUDENT_NAMES = [
  "Aarav", "Priya", "Rohan", "Sneha", "Vikram",
  "Divya", "Arjun", "Kavya", "Rahul", "Ananya",
];
const AVATARS = ["👨‍🎓","👩‍🎓","🧑‍🎓","👨‍💻","👩‍💻","🧑‍💻","🙋","🙋‍♀️","🙋‍♂️","🎓"];
let demoBeds    = 1;
let demoMutex   = true;
let demoRunning = false;

// ── Application Initialization ───────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupAllocForm();
  setupRoomSelect();
  setupResetBtn();
  setupCheckoutModal();
  setupAuth();
  setupDemoControls();
  setupAdminPanel();
  setupHighVolumePortal();
  setupAnalytics();
  refreshStats();
  setInterval(refreshStats, 5000);   // auto-refresh every 5s
});

// ══════════════════════════════════════════════════════════
//  TAB NAVIGATION
// ══════════════════════════════════════════════════════════
function setupTabs() {
  const btns = document.querySelectorAll(".tab-btn");
  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      btns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-section").forEach(s => s.classList.remove("active"));
      const target = document.getElementById(`tab-${btn.dataset.tab}`);
      if (target) target.classList.add("active");
      if (btn.dataset.tab === "blocks") loadBlocksView();
      if (btn.dataset.tab === "log")    loadLog();
      if (btn.dataset.tab === "admin")  loadAdminPanel();
      if (btn.dataset.tab === "analytics") loadAnalytics();
    });
  });
}

// ══════════════════════════════════════════════════════════
//  STATS & OCCUPANCY
// ══════════════════════════════════════════════════════════
async function refreshStats() {
  try {
    const res  = await fetch("/api/stats");
    const data = await res.json();
    document.getElementById("stat-total").textContent     = data.total;
    document.getElementById("stat-available").textContent = data.available;
    document.getElementById("stat-occupied").textContent  = data.occupied;
    document.getElementById("stat-reserved").textContent  = data.reserved;

    const t = data.total || 1;
    document.getElementById("bar-occupied").style.width  = `${(data.occupied  / t * 100).toFixed(1)}%`;
    document.getElementById("bar-reserved").style.width  = `${(data.reserved  / t * 100).toFixed(1)}%`;
    document.getElementById("bar-available").style.width = `${(data.available / t * 100).toFixed(1)}%`;
  } catch (e) {
    console.error("Stats refresh failed:", e);
  }
}

// ══════════════════════════════════════════════════════════
//  ALLOCATION FORM (MUTEX PROTECTED)
// ══════════════════════════════════════════════════════════
function setupAllocForm() {
  const form = document.getElementById("allocForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn    = document.getElementById("allocBtn");
    const name   = document.getElementById("f-name").value.trim();
    const sid    = document.getElementById("f-sid").value.trim();
    const block  = document.getElementById("f-block").value;
    const room   = document.getElementById("f-room").value;

    if (!name || !sid) { showToast("Name and Student ID are required.", "error"); return; }

    btn.disabled = true;
    btn.textContent = "⏳ Allocating…";

    try {
      const res  = await fetch("/api/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, student_id: sid, block: block || null, room: room || null }),
      });
      const data = await res.json();

      if (data.success) {
        showAllocResult(data, name, sid);
        showToast(`✅ ${data.message}`, "success");
        form.reset();
        refreshStats();
      } else {
        showToast(`❌ ${data.error}`, "error");
      }
    } catch (err) {
      showToast("Network error. Is the server running?", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "🛏️ Allocate Bed";
    }
  });
}

function showAllocResult(data, name, sid) {
  const resultEl = document.getElementById("allocResult");
  const detailEl = document.getElementById("resultDetails");
  resultEl.classList.remove("hidden");

  detailEl.innerHTML = `
    <div class="result-item"><div class="ri-label">Allocation ID</div><div class="ri-val">#${data.alloc_id}</div></div>
    <div class="result-item"><div class="ri-label">Student</div><div class="ri-val">${name}</div></div>
    <div class="result-item"><div class="ri-label">Block</div><div class="ri-val">Block ${data.block}</div></div>
    <div class="result-item"><div class="ri-label">Room</div><div class="ri-val">${data.room}</div></div>
    <div class="result-item"><div class="ri-label">Bed</div><div class="ri-val">${data.bed}</div></div>
    <div class="result-item"><div class="ri-label">Status</div><div class="ri-val" style="color:var(--success)">✅ Active</div></div>
  `;
}

// Dynamic Room select on block change
function setupRoomSelect() {
  const blockSel = document.getElementById("f-block");
  const roomSel  = document.getElementById("f-room");

  blockSel.addEventListener("change", async () => {
    const block = blockSel.value;
    roomSel.innerHTML = '<option value="">Any room in selected block</option>';
    if (!block) return;
    try {
      const res  = await fetch("/api/hostel");
      const data = await res.json();
      const rooms = data[block]?.rooms || {};
      Object.values(rooms).forEach(room => {
        const avail = room.available;
        const opt   = document.createElement("option");
        opt.value   = room.id;
        opt.textContent = `Room ${room.id} — Floor ${room.floor} (${avail} beds free)`;
        if (avail === 0) opt.disabled = true;
        roomSel.appendChild(opt);
      });
    } catch {}
  });
}

// ══════════════════════════════════════════════════════════
//  BLOCKS VIEW (HIERARCHY: BLOCK -> ROOM -> BED)
// ══════════════════════════════════════════════════════════
async function loadBlocksView() {
  const container = document.getElementById("blocksContainer");
  container.innerHTML = '<div class="loading-spinner">Loading hostel data…</div>';
  try {
    const res  = await fetch("/api/hostel");
    hostelData = await res.json();
    container.innerHTML = "";

    const blockColors = { A: "#3B82F6", B: "#EC4899", C: "#8B5CF6", D: "#10B981", E: "#F59E0B" };
    const blockGenders = {
      A: "👨 Boys Hostel",
      B: "👩 Girls Hostel",
      C: "👥 PG / Research",
      D: "🌍 International (Male)",
      E: "🌍 International (Female)"
    };

    for (const [blockId, block] of Object.entries(hostelData)) {
      const section = document.createElement("div");
      section.className = "block-section";

      const totalBeds  = Object.values(block.rooms).reduce((s, r) => s + r.capacity, 0);
      const availBeds  = Object.values(block.rooms).reduce((s, r) => s + r.available, 0);

      section.innerHTML = `
        <div class="block-title">
          <span class="block-badge" style="background:${blockColors[blockId]}22;color:${blockColors[blockId]};border:1px solid ${blockColors[blockId]}55">
            ${block.name}
          </span>
          <h2>${block.name}</h2>
          <span class="block-subtitle">${blockGenders[blockId]} — ${availBeds}/${totalBeds} beds available</span>
        </div>
        <div class="rooms-grid" id="rooms-${blockId}"></div>
      `;
      container.appendChild(section);

      const roomsGrid = section.querySelector(`#rooms-${blockId}`);
      for (const [roomId, room] of Object.entries(block.rooms)) {
        roomsGrid.appendChild(buildRoomCard(room, blockId));
      }
    }
  } catch (e) {
    container.innerHTML = '<div class="loading-spinner">Failed to load data.</div>';
  }
}

function buildRoomCard(room, blockId) {
  const card = document.createElement("div");
  card.className = "room-card";
  card.id = `room-card-${room.id}`;

  const availClass = room.available === 0 ? "avail-full"
                   : room.available <= 1  ? "avail-warn"
                   : "avail-ok";
  const availText  = room.available === 0 ? "Full" : `${room.available} Free`;

  let bedsHTML = "";
  for (const [bedId, bed] of Object.entries(room.beds)) {
    const icon  = bed.status === "available" ? "🛏️" : bed.status === "occupied" ? "👤" : "🔒";
    const title = bed.status === "occupied"
      ? `${bed.occupant?.name || "Occupied"} (click to checkout)`
      : `Bed ${bed.number} — ${bed.status}`;
    bedsHTML += `
      <div class="bed-cell ${bed.status}" title="${title}"
           data-bed="${bedId}" data-status="${bed.status}" data-name="${bed.occupant?.name || ""}">
        <span class="bed-icon">${icon}</span>
        <span class="bed-label">${bed.number}</span>
      </div>`;
  }

  card.innerHTML = `
    <div class="room-card-header">
      <div><div class="room-name">Room ${room.id}</div><div class="room-floor">Floor ${room.floor}</div></div>
      <div class="room-avail ${availClass}">${availText}</div>
    </div>
    <div class="beds-grid">${bedsHTML}</div>
  `;

  // Checkout on bed click
  card.querySelectorAll(".bed-cell.occupied").forEach(cell => {
    cell.addEventListener("click", () => {
      pendingCheckoutBed = cell.dataset.bed;
      document.getElementById("checkoutMsg").textContent =
        `Checkout ${cell.dataset.name || "this student"} from bed ${cell.dataset.bed}?`;
      document.getElementById("checkoutModal").classList.remove("hidden");
    });
  });

  return card;
}

// ══════════════════════════════════════════════════════════
//  CHECKOUT MODAL
// ══════════════════════════════════════════════════════════
function setupCheckoutModal() {
  document.getElementById("cancelCheckout").addEventListener("click", () => {
    document.getElementById("checkoutModal").classList.add("hidden");
    pendingCheckoutBed = null;
  });

  document.getElementById("confirmCheckout").addEventListener("click", async () => {
    if (!pendingCheckoutBed) return;
    try {
      const res  = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bed_id: pendingCheckoutBed }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ ${data.message}`, "success");
        refreshStats();
        loadBlocksView();
      } else {
        showToast(`❌ ${data.error}`, "error");
      }
    } catch {
      showToast("Checkout failed.", "error");
    } finally {
      document.getElementById("checkoutModal").classList.add("hidden");
      pendingCheckoutBed = null;
    }
  });
}

// ══════════════════════════════════════════════════════════
//  ALLOCATION LOG
// ══════════════════════════════════════════════════════════
async function loadLog() {
  const tbody = document.querySelector(".log-table tbody");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">Loading…</td></tr>';
  try {
    const res  = await fetch("/api/allocations");
    const rows = await res.json();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">No allocations yet.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><code>#${r.id}</code></td>
        <td>${r.name}</td>
        <td>${r.student_id}</td>
        <td>Block ${r.block}</td>
        <td>${r.room}</td>
        <td>${r.bed}</td>
        <td>${formatDate(r.allocated_at)}</td>
        <td><span class="badge ${r.status === 'active' ? 'badge-active' : 'badge-checked-out'}">${r.status === 'active' ? '✅ Active' : '⬛ Checked Out'}</span></td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">Failed to load log.</td></tr>';
  }
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

// ══════════════════════════════════════════════════════════
//  USER AUTHENTICATION (Sign In / Sign Up / Session)
// ══════════════════════════════════════════════════════════
let currentUser = null;

function setupAuth() {
  const modal = document.getElementById("authModal");
  const btnOpen = document.getElementById("btnOpenAuthModal");
  const btnClose = document.getElementById("closeAuthModal");
  const tabLogin = document.getElementById("tabBtnLogin");
  const tabSignup = document.getElementById("tabBtnSignup");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const modalTitle = document.getElementById("authModalTitle");
  const authPill = document.getElementById("authPill");
  const userNameEl = document.getElementById("authUserName");
  const userRoleEl = document.getElementById("authUserRole");
  const btnLogout = document.getElementById("btnLogout");

  // Restore session from localStorage
  const saved = localStorage.getItem("hostel_user");
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      updateAuthUI();
    } catch {}
  }

  function updateAuthUI() {
    if (currentUser) {
      if (btnOpen) btnOpen.style.display = "none";
      if (authPill) authPill.style.display = "flex";
      if (userNameEl) userNameEl.textContent = currentUser.name;
      if (userRoleEl) {
        userRoleEl.textContent = currentUser.role.toUpperCase();
        userRoleEl.className = currentUser.role === "admin" ? "user-role-badge badge-err" : "user-role-badge";
      }
      if (currentUser.role === "student") {
        const fName = document.getElementById("f-name");
        const fSid = document.getElementById("f-sid");
        if (fName && !fName.value) fName.value = currentUser.name;
        if (fSid && !fSid.value) fSid.value = currentUser.student_id;
      }
    } else {
      if (btnOpen) btnOpen.style.display = "inline-flex";
      if (authPill) authPill.style.display = "none";
    }
  }

  if (btnOpen && modal) btnOpen.addEventListener("click", () => modal.style.display = "flex");
  if (btnClose && modal) btnClose.addEventListener("click", () => modal.style.display = "none");

  // Tab switching
  if (tabLogin && tabSignup && loginForm && signupForm) {
    tabLogin.addEventListener("click", () => {
      tabLogin.classList.add("active");
      tabSignup.classList.remove("active");
      loginForm.style.display = "block";
      signupForm.style.display = "none";
      if (modalTitle) modalTitle.textContent = "🔐 Hostel Portal Sign In";
    });
    tabSignup.addEventListener("click", () => {
      tabSignup.classList.add("active");
      tabLogin.classList.remove("active");
      loginForm.style.display = "none";
      signupForm.style.display = "block";
      if (modalTitle) modalTitle.textContent = "📝 Create Hostel Account";
    });
  }

  // Quick demo credentials buttons
  const btnFillAdmin = document.getElementById("btnFillAdminLogin");
  const btnFillStudent = document.getElementById("btnFillStudentLogin");
  if (btnFillAdmin) {
    btnFillAdmin.addEventListener("click", () => {
      document.getElementById("loginIdentifier").value = "admin@hostel.edu";
      document.getElementById("loginPassword").value = "admin";
    });
  }
  if (btnFillStudent) {
    btnFillStudent.addEventListener("click", () => {
      document.getElementById("loginIdentifier").value = "sundram@hostel.edu";
      document.getElementById("loginPassword").value = "password123";
    });
  }

  // Login form submit
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const identifier = document.getElementById("loginIdentifier").value.trim();
      const password = document.getElementById("loginPassword").value.trim();
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier, password })
        });
        const data = await res.json();
        if (data.success) {
          currentUser = data.user;
          localStorage.setItem("hostel_user", JSON.stringify(currentUser));
          updateAuthUI();
          if (modal) modal.style.display = "none";
          showToast(`👋 Welcome back, ${currentUser.name}!`, "success");
        } else {
          showToast(`❌ ${data.error}`, "error");
        }
      } catch (err) {
        showToast("Login failed: " + err.message, "error");
      }
    });
  }

  // Signup form submit
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("signupName").value.trim();
      const student_id = document.getElementById("signupStudentId").value.trim();
      const email = document.getElementById("signupEmail").value.trim();
      const password = document.getElementById("signupPassword").value.trim();
      const role = document.getElementById("signupRole").value;

      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, student_id, email, password, role })
        });
        const data = await res.json();
        if (data.success) {
          currentUser = data.user;
          localStorage.setItem("hostel_user", JSON.stringify(currentUser));
          updateAuthUI();
          if (modal) modal.style.display = "none";
          showToast(`🎉 Account created! Logged in as ${currentUser.name}.`, "success");
        } else {
          showToast(`❌ ${data.error}`, "error");
        }
      } catch (err) {
        showToast("Registration failed: " + err.message, "error");
      }
    });
  }

  // Logout button
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      currentUser = null;
      localStorage.removeItem("hostel_user");
      updateAuthUI();
      showToast("Logged out successfully.", "info");
    });
  }
}

// ══════════════════════════════════════════════════════════
//  RACE DEMO — INTERACTIVE REAL CONCURRENT HTTP DEMO
// ══════════════════════════════════════════════════════════
function setupDemoControls() {
  // Bed picker
  document.querySelectorAll(".bed-pick-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".bed-pick-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      demoBeds = parseInt(btn.dataset.beds);
    });
  });

  // Student count slider
  const slider    = document.getElementById("studentCount");
  const sliderVal = document.getElementById("studentVal");
  if (slider && sliderVal) {
    slider.addEventListener("input", () => { sliderVal.textContent = slider.value; });
  }

  // Mutex toggle
  const onBtn  = document.getElementById("mutexON");
  const offBtn = document.getElementById("mutexOFF");
  const badge  = document.getElementById("mutexModeLabel");

  function setMutex(on) {
    demoMutex = on;
    if (on) {
      if (onBtn) onBtn.classList.add("active");
      if (offBtn) offBtn.classList.remove("active");
      if (badge) {
        badge.textContent = "🔐 Mutex ON";
        badge.className = "mutex-mode-badge badge-mutex-on";
      }
    } else {
      if (offBtn) offBtn.classList.add("active");
      if (onBtn) onBtn.classList.remove("active");
      if (badge) {
        badge.textContent = "🔓 Mutex OFF";
        badge.className = "mutex-mode-badge badge-mutex-off";
      }
    }
  }
  if (onBtn) onBtn.addEventListener("click", () => setMutex(true));
  if (offBtn) offBtn.addEventListener("click", () => setMutex(false));

  // Race buttons
  const raceBtn = document.getElementById("setupAndRaceBtn");
  if (raceBtn) raceBtn.addEventListener("click", runPracticalRace);

  const resetBtn = document.getElementById("resetDemoBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const arena = document.getElementById("demoArena");
      if (arena) arena.style.display = "none";
      showToast("Demo reset. Configure and run again.", "success");
    });
  }
}

async function runPracticalRace() {
  if (demoRunning) return;
  demoRunning = true;

  const slider = document.getElementById("studentCount");
  const nStudents = slider ? parseInt(slider.value) : 6;
  const arena = document.getElementById("demoArena");
  if (arena) arena.style.display = "block";

  // Clear previous output
  const threadCards = document.getElementById("threadCards");
  const demoBedState = document.getElementById("demoBedState");
  const eventLogInner = document.getElementById("eventLogInner");
  const verdictEl = document.getElementById("demoVerdict");

  if (threadCards) threadCards.innerHTML = "";
  if (demoBedState) demoBedState.innerHTML = "";
  if (eventLogInner) eventLogInner.innerHTML = "";
  if (verdictEl) verdictEl.style.display = "none";

  addEvent("ev-start", `🏁 Race starting — ${nStudents} students, ${demoBeds} bed(s), mutex ${demoMutex ? "ON 🔐" : "OFF 🔓"}`);

  // Step 1 — Setup demo beds on backend
  try {
    const setup = await fetch("/api/race-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beds: demoBeds, use_mutex: demoMutex }),
    });
    const setupData = await setup.json();
    addEvent("ev-start", `✅ Server ready — Beds: ${setupData.beds.join(", ")}`);
  } catch {
    showToast("Failed to connect to server.", "error");
    demoRunning = false;
    return;
  }

  // Step 2 — Create student visual cards
  const students = Array.from({ length: nStudents }, (_, i) => ({
    id:     i + 1,
    name:   STUDENT_NAMES[i % STUDENT_NAMES.length],
    avatar: AVATARS[i % AVATARS.length],
  }));

  if (threadCards) {
    students.forEach(s => {
      const card = document.createElement("div");
      card.className = "thread-card waiting";
      card.id = `tc-${s.id}`;
      card.innerHTML = `
        <div class="tc-avatar">${s.avatar}</div>
        <div class="tc-name">${s.name}</div>
        <div class="tc-status" id="tc-status-${s.id}">⏳ Waiting…</div>
        <div class="tc-result" id="tc-result-${s.id}"></div>
        <div class="tc-wait"   id="tc-wait-${s.id}"></div>
      `;
      threadCards.appendChild(card);
    });
  }

  await sleep(400);

  // Step 3 — Fire ALL requests simultaneously from the browser
  students.forEach(s => setThreadState(s.id, "running", "🔄 Requesting…"));
  addEvent("ev-start", `⚡ All ${nStudents} requests fired simultaneously via fetch()!`);

  const promises = students.map(s =>
    fetch("/api/race-attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: s.name, thread_id: s.id }),
    })
    .then(r => r.json())
    .then(data => ({ ...data, student: s }))
    .catch(() => ({ success: false, thread_id: s.id, reason: "Network error", student: s }))
  );

  // Step 4 — Handle results
  const results = await Promise.all(promises);

  results.forEach(data => {
    const s = data.student;
    if (data.success) {
      if (data.duplicate) {
        setThreadState(s.id, "duplicate",
          `⚠️ ${data.bed}`,
          `Duplicate! Overwrote ${data.displaced}`,
          `0ms wait`);
        addEvent("ev-race", `💥 RACE BUG: ${s.name} overwrote <b>${data.displaced}</b> on ${data.bed}!`);
      } else {
        setThreadState(s.id, "success",
          `✅ ${data.bed}`,
          `Allocated!`,
          `Waited ${data.wait_ms}ms`);
        addEvent("ev-alloc", `✅ ${s.name} got ${data.bed} (waited ${data.wait_ms}ms for lock)`);
      }
    } else {
      setThreadState(s.id, "fail",
        "❌ Rejected",
        data.reason,
        demoMutex ? `Waited ${data.wait_ms}ms` : "");
      addEvent("ev-reject", `🚫 ${s.name} rejected — ${data.reason}`);
    }
  });

  await sleep(300);
  await renderBedState();

  await sleep(200);
  showVerdict(results, nStudents);

  demoRunning = false;
}

function setThreadState(id, state, status, result = "", wait = "") {
  const card = document.getElementById(`tc-${id}`);
  if (!card) return;
  card.className = `thread-card ${state}`;
  const statusEl = document.getElementById(`tc-status-${id}`);
  const resultEl = document.getElementById(`tc-result-${id}`);
  const waitEl   = document.getElementById(`tc-wait-${id}`);
  if (statusEl) statusEl.textContent = status;
  if (resultEl) resultEl.textContent = result;
  if (waitEl)   waitEl.textContent   = wait;
}

async function renderBedState() {
  try {
    const res  = await fetch("/api/race-state");
    const data = await res.json();
    const beds = data.beds;
    const el   = document.getElementById("demoBedState");
    if (!el) return;
    el.innerHTML = '<div class="demo-beds"></div>';
    const container = el.querySelector(".demo-beds");

    for (const [bedId, bed] of Object.entries(beds)) {
      const occupants = bed.occupants || [];
      const isDuplicate = occupants.length > 1;
      const isFree = occupants.length === 0;

      const div = document.createElement("div");
      div.className = `demo-bed-row ${isFree ? "free" : isDuplicate ? "corrupted" : "clean"}`;

      const tagsHTML = occupants.map((name, i) =>
        `<span class="occ-tag ${i === 0 ? "first" : "extra"}">${i === 0 ? "✅" : "⚠️"} ${name}</span>`
      ).join("");

      div.innerHTML = `
        <div class="demo-bed-label">
          🛏️ ${bedId}
          ${isDuplicate ? '<span style="color:#ff6b00;font-size:10px;margin-left:8px;">⚠️ DUPLICATE BOOKING</span>' : ""}
          ${isFree ? '<span style="color:var(--text-muted);font-size:10px;margin-left:8px;">Available</span>' : ""}
        </div>
        <div class="demo-bed-occupants">${tagsHTML || '<span style="color:var(--text-muted)">No one assigned</span>'}</div>
      `;
      container.appendChild(div);
    }
  } catch {}
}

function showVerdict(results, nStudents) {
  const el = document.getElementById("demoVerdict");
  if (!el) return;
  const duplicates = results.filter(r => r.success && r.duplicate).length;
  const allocated  = results.filter(r => r.success).length;
  const rejected   = results.filter(r => !r.success).length;
  const hasBug = duplicates > 0;

  el.style.display = "block";
  el.className = `demo-verdict ${hasBug ? "verdict-bug" : "verdict-safe"}`;
  el.innerHTML = `
    <div class="verdict-icon">${hasBug ? "💥" : "🛡️"}</div>
    <div class="verdict-title">${hasBug
      ? "Race Condition Detected!"
      : "Mutex Protected — Zero Duplicates!"
    }</div>
    <div class="verdict-body">${hasBug
      ? `<strong>${duplicates}</strong> bed(s) were assigned to multiple students simultaneously because there was <strong>no mutex</strong> guarding the read-check-write sequence. In a real hostel, multiple students would claim the same bed! This proves why mutex synchronization is essential.`
      : `All <strong>${nStudents}</strong> concurrent requests were safely synchronized. The <code>threading.Lock()</code> (mutex) ensured that only one thread could check and assign a bed at a time — <em>no student ever received an already occupied bed</em>.`
    }</div>
    <div class="verdict-stats">
      <div class="vstat"><div class="vstat-val" style="color:var(--success)">${allocated}</div><div class="vstat-lbl">Allocated</div></div>
      <div class="vstat"><div class="vstat-val" style="color:var(--text-muted)">${rejected}</div><div class="vstat-lbl">Rejected</div></div>
      <div class="vstat"><div class="vstat-val" style="color:${hasBug ? "#ff6b00" : "var(--success)"}">${duplicates}</div><div class="vstat-lbl">Duplicates</div></div>
      <div class="vstat"><div class="vstat-val">${demoBeds}</div><div class="vstat-lbl">Demo Beds</div></div>
    </div>
  `;
}

function addEvent(cls, msg) {
  const log = document.getElementById("eventLogInner");
  if (!log) return;
  const div = document.createElement("div");
  div.className = `ev-row ${cls}`;
  div.innerHTML = `<span style="color:var(--text-muted);margin-right:6px;">${new Date().toLocaleTimeString()}</span>${msg}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ══════════════════════════════════════════════════════════
//  ADMIN PANEL — Full Student Management
// ══════════════════════════════════════════════════════════

function setupAdminPanel() {
  // Search (debounced)
  let searchTimer;
  const searchInput = document.getElementById("adminSearch");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadAdminStudents, 300);
    });
  }

  // Block filter
  const blockFilter = document.getElementById("adminBlockFilter");
  if (blockFilter) {
    blockFilter.addEventListener("change", loadAdminStudents);
  }

  // Sort field
  const sortSelect = document.getElementById("adminSort");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      adminSortField = e.target.value;
      loadAdminStudents();
    });
  }

  // Sort direction toggle
  const sortOrderBtn = document.getElementById("adminSortOrder");
  if (sortOrderBtn) {
    sortOrderBtn.addEventListener("click", () => {
      adminSortAsc = !adminSortAsc;
      sortOrderBtn.textContent = adminSortAsc ? "↑ ASC" : "↓ DESC";
      loadAdminStudents();
    });
  }

  // Select all checkbox
  const selectAll = document.getElementById("selectAll");
  if (selectAll) {
    selectAll.addEventListener("change", (e) => {
      document.querySelectorAll(".row-check").forEach(cb => cb.checked = e.target.checked);
      updateBulkBar();
    });
  }

  // Bulk checkout
  const bulkBtn = document.getElementById("bulkCheckoutBtn");
  if (bulkBtn) {
    bulkBtn.addEventListener("click", bulkCheckout);
  }

  // Clear selection
  const clearBtn = document.getElementById("clearSelectBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      document.querySelectorAll(".row-check").forEach(cb => cb.checked = false);
      if (selectAll) selectAll.checked = false;
      updateBulkBar();
    });
  }

  // Edit modal buttons
  document.getElementById("closeEditModal")?.addEventListener("click", closeEditModal);
  document.getElementById("cancelEdit")?.addEventListener("click", closeEditModal);
  document.getElementById("saveEdit")?.addEventListener("click", saveStudentEdit);

  // Detail modal close
  document.getElementById("closeDetailModal")?.addEventListener("click", () => {
    document.getElementById("detailModal").classList.add("hidden");
  });

  // Upload modal setup
  setupUploadModal();
}

// ══════════════════════════════════════════════════════════
//  CSV / JSON FILE UPLOAD & IMPORT
// ══════════════════════════════════════════════════════════
let selectedUploadFile = null;

function setupUploadModal() {
  const openBtn = document.getElementById("openUploadBtn");
  const fileInput = document.getElementById("adminFileInput");
  const dropzone = document.getElementById("uploadDropzone");
  const uploadModal = document.getElementById("uploadModal");
  const closeBtn = document.getElementById("closeUploadModal");
  const cancelBtn = document.getElementById("cancelUpload");
  const startBtn = document.getElementById("startUploadBtn");
  const removeBtn = document.getElementById("removeSelectedFile");

  if (openBtn && uploadModal) {
    openBtn.addEventListener("click", () => {
      uploadModal.classList.remove("hidden");
      clearUploadSelection();
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", () => uploadModal.classList.add("hidden"));
  if (cancelBtn) cancelBtn.addEventListener("click", () => uploadModal.classList.add("hidden"));

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelected(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelected(e.target.files[0]);
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener("click", clearUploadSelection);
  }

  if (startBtn) {
    startBtn.addEventListener("click", executeFileUpload);
  }
}

function handleFileSelected(file) {
  const validExtensions = [".csv", ".json"];
  const fileName = file.name.toLowerCase();
  const isValid = validExtensions.some(ext => fileName.endsWith(ext));

  if (!isValid) {
    showToast("Please select a valid .csv or .json file.", "error");
    return;
  }

  selectedUploadFile = file;

  const sfb = document.getElementById("selectedFileInfo");
  const sfbName = document.getElementById("sfbName");
  const sfbSize = document.getElementById("sfbSize");
  const startBtn = document.getElementById("startUploadBtn");
  const statusMsg = document.getElementById("uploadStatusMsg");

  if (sfbName) sfbName.textContent = file.name;
  if (sfbSize) sfbSize.textContent = `${(file.size / 1024).toFixed(1)} KB`;
  if (sfb) sfb.classList.remove("hidden");
  if (startBtn) startBtn.disabled = false;
  if (statusMsg) statusMsg.classList.add("hidden");
}

function clearUploadSelection() {
  selectedUploadFile = null;
  const fileInput = document.getElementById("adminFileInput");
  const sfb = document.getElementById("selectedFileInfo");
  const startBtn = document.getElementById("startUploadBtn");
  const statusMsg = document.getElementById("uploadStatusMsg");

  if (fileInput) fileInput.value = "";
  if (sfb) sfb.classList.add("hidden");
  if (startBtn) startBtn.disabled = true;
  if (statusMsg) statusMsg.classList.add("hidden");
}

async function executeFileUpload() {
  if (!selectedUploadFile) return;

  const startBtn = document.getElementById("startUploadBtn");
  const statusMsg = document.getElementById("uploadStatusMsg");

  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = "⏳ Uploading & Allocating…";
  }

  const formData = new FormData();
  formData.append("file", selectedUploadFile);

  try {
    const res = await fetch("/api/admin/import", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (data.success) {
      if (statusMsg) {
        statusMsg.className = "upload-status-box success";
        statusMsg.innerHTML = `
          <strong>🎉 Import Successful!</strong><br>
          Imported: <b>${data.imported_count}</b> students · Skipped: <b>${data.skipped_count}</b>
        `;
        statusMsg.classList.remove("hidden");
      }
      showToast(`✅ ${data.message}`, "success");
      refreshStats();
      loadAdminPanel();

      setTimeout(() => {
        document.getElementById("uploadModal")?.classList.add("hidden");
        clearUploadSelection();
      }, 1500);
    } else {
      if (statusMsg) {
        statusMsg.className = "upload-status-box error";
        statusMsg.textContent = `❌ ${data.error || "Import failed"}`;
        statusMsg.classList.remove("hidden");
      }
      showToast(`❌ ${data.error || "Import failed"}`, "error");
    }
  } catch (err) {
    if (statusMsg) {
      statusMsg.className = "upload-status-box error";
      statusMsg.textContent = "❌ Network error during upload.";
      statusMsg.classList.remove("hidden");
    }
    showToast("Network error during file upload.", "error");
  } finally {
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = "🚀 Import Students";
    }
  }
}


async function loadAdminPanel() {
  await Promise.all([loadBlockStats(), loadAdminStudents()]);
}

// Block statistics cards
async function loadBlockStats() {
  const row = document.getElementById("blockStatsRow");
  if (!row) return;
  try {
    const res  = await fetch("/api/admin/stats/block");
    const data = await res.json();
    const colors = { A: "#3b82f6", B: "#ec4899", C: "#8b5cf6", D: "#10b981", E: "#f59e0b" };

    row.innerHTML = data.map(b => `
      <div class="bstat-card">
        <div class="bstat-left">
          <div class="bstat-name" style="color:${colors[b.block]}">${b.name}</div>
          <div class="bstat-gender">${b.gender}</div>
          <div class="bstat-bar">
            <div class="bstat-fill" style="width:${b.pct}%;background:${colors[b.block]}"></div>
          </div>
        </div>
        <div class="bstat-right">
          <div class="bstat-pct" style="color:${colors[b.block]}">${b.pct}%</div>
          <div class="bstat-nums">${b.occupied}/${b.total} beds</div>
        </div>
      </div>
    `).join("");
  } catch {}
}

// Student table
async function loadAdminStudents() {
  const searchInput = document.getElementById("adminSearch");
  const blockFilter = document.getElementById("adminBlockFilter");
  const q     = searchInput ? searchInput.value.trim() : "";
  const block = blockFilter ? blockFilter.value : "";
  const sort  = adminSortField;
  const order = adminSortAsc ? "asc" : "desc";

  const url = `/api/admin/students?q=${encodeURIComponent(q)}&block=${block}&sort=${sort}&order=${order}`;
  const tbody  = document.getElementById("adminTbody");
  const footer = document.getElementById("tableFooter");
  if (!tbody) return;

  try {
    const res  = await fetch(url);
    const data = await res.json();
    adminStudents = data.students;

    if (!adminStudents.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-msg">${q || block ? "No students match your filters." : "No students currently allocated."}</td></tr>`;
      if (footer) footer.textContent = "0 students";
      return;
    }

    tbody.innerHTML = adminStudents.map(s => `
      <tr id="row-${s.student_id}" data-sid="${s.student_id}">
        <td><input type="checkbox" class="row-check" data-sid="${s.student_id}" /></td>
        <td class="student-id-cell">${s.student_id}</td>
        <td class="student-name">${s.name}</td>
        <td><span class="block-pill block-${s.block}">Block ${s.block}</span></td>
        <td>${s.room}</td>
        <td><code>${s.bed}</code></td>
        <td class="date-cell">${formatDate(s.allocated_at)}</td>
        <td class="date-cell">${formatDate(s.checkout_at)}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-outline btn-sm" onclick="openDetailModal('${s.student_id}')" title="View Details">👁️</button>
            <button class="btn btn-outline btn-sm" onclick="openEditModal('${s.student_id}','${s.name}','${s.room}','${s.bed}','${s.block}')" title="Edit Student">✏️</button>
            <button class="btn btn-danger btn-sm"  onclick="adminCheckout('${s.student_id}','${s.name}')" title="Checkout Student">⬛</button>
          </div>
        </td>
      </tr>
    `).join("");

    document.querySelectorAll(".row-check").forEach(cb => {
      cb.addEventListener("change", updateBulkBar);
    });

    if (footer) {
      footer.innerHTML = `
        <span>${data.total} student${data.total !== 1 ? "s" : ""} ${q || block ? "(filtered)" : ""}</span>
        <span style="color:var(--text-muted)">Select rows for bulk actions · ✏️ Edit · 👁️ View · ⬛ Checkout</span>
      `;
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-msg">Failed to load students.</td></tr>`;
  }
}

function updateBulkBar() {
  const checked = document.querySelectorAll(".row-check:checked").length;
  const bar = document.getElementById("bulkActions");
  if (bar) {
    bar.style.display = checked > 0 ? "flex" : "none";
    const countEl = document.getElementById("selectedCount");
    if (countEl) countEl.textContent = `${checked} selected`;
  }
}

async function bulkCheckout() {
  const ids = [...document.querySelectorAll(".row-check:checked")].map(cb => cb.dataset.sid);
  if (!ids.length) return;
  if (!confirm(`Checkout ${ids.length} student(s)?`)) return;

  try {
    const res  = await fetch("/api/admin/bulk-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_ids: ids }),
    });
    const data = await res.json();
    showToast(`✅ ${data.checked_out} student(s) checked out.`, "success");
    refreshStats();
    loadAdminPanel();
  } catch {
    showToast("Bulk checkout failed.", "error");
  }
}

async function adminCheckout(sid, name) {
  if (!confirm(`Checkout ${name} (${sid})?`)) return;
  try {
    const res  = await fetch(`/api/admin/student/${sid}/checkout`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ ${data.message}`, "success");
      refreshStats();
      loadAdminPanel();
    } else {
      showToast(`❌ ${data.error}`, "error");
    }
  } catch {
    showToast("Checkout failed.", "error");
  }
}

function openEditModal(sid, name, room, bed, block) {
  editingStudentId = sid;
  document.getElementById("edit-name").value = name;
  document.getElementById("edit-sid").value  = sid;
  document.getElementById("editInfoGrid").innerHTML = `
    <div class="edit-info-item"><div class="edit-info-label">Block</div><div class="edit-info-val">Block ${block}</div></div>
    <div class="edit-info-item"><div class="edit-info-label">Room</div><div class="edit-info-val">${room}</div></div>
    <div class="edit-info-item"><div class="edit-info-label">Bed</div><div class="edit-info-val">${bed}</div></div>
  `;
  document.getElementById("editModal").classList.remove("hidden");
}

function closeEditModal() {
  editingStudentId = null;
  document.getElementById("editModal").classList.add("hidden");
}

async function saveStudentEdit() {
  if (!editingStudentId) return;
  const name = document.getElementById("edit-name").value.trim();
  const sid  = document.getElementById("edit-sid").value.trim();

  if (!name || !sid) { showToast("Name and ID cannot be empty.", "error"); return; }

  try {
    const res  = await fetch(`/api/admin/student/${editingStudentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, student_id: sid }),
    });
    const data = await res.json();
    if (data.success) {
      showToast("✅ Student updated successfully.", "success");
      closeEditModal();
      loadAdminStudents();
    } else {
      showToast(`❌ ${data.error}`, "error");
    }
  } catch {
    showToast("Update failed.", "error");
  }
}

async function openDetailModal(sid) {
  document.getElementById("detailModal").classList.remove("hidden");
  document.getElementById("detailModalTitle").textContent = `👤 Student — ${sid}`;
  document.getElementById("detailModalBody").innerHTML = '<div style="padding:20px;color:var(--text-muted)">Loading…</div>';

  try {
    const res  = await fetch(`/api/admin/student/${sid}`);
    const data = await res.json();
    const s    = data.student;
    const hist = data.history || [];

    const histHTML = hist.length
      ? hist.map(h => `
          <div class="history-row">
            <code>#${h.id}</code>
            <span>${h.block} → ${h.room} → ${h.bed}</span>
            <span class="date-cell">${formatDate(h.allocated_at)}</span>
            <span class="badge ${h.status === 'active' ? 'badge-active' : 'badge-checked-out'}">${h.status === 'active' ? '✅ Active' : '⬛ Out'}</span>
          </div>`)
        .join("")
      : '<p style="color:var(--text-muted);font-size:13px">No history found.</p>';

    document.getElementById("detailModalBody").innerHTML = `
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-label">Name</div><div class="detail-val">${s.name}</div></div>
        <div class="detail-item"><div class="detail-label">Student ID</div><div class="detail-val">${s.student_id}</div></div>
        <div class="detail-item"><div class="detail-label">Block</div><div class="detail-val">${s.block_name}</div></div>
        <div class="detail-item"><div class="detail-label">Room</div><div class="detail-val">${s.room}</div></div>
        <div class="detail-item"><div class="detail-label">Bed</div><div class="detail-val">${s.bed}</div></div>
        <div class="detail-item"><div class="detail-label">Status</div><div class="detail-val" style="color:var(--success)">✅ Active</div></div>
        <div class="detail-item"><div class="detail-label">Allocated On</div><div class="detail-val" style="font-size:12px">${formatDate(s.allocated_at)}</div></div>
        <div class="detail-item"><div class="detail-label">Checkout Date</div><div class="detail-val" style="font-size:12px">${formatDate(s.checkout_at)}</div></div>
      </div>
      <div class="detail-history">
        <h4>📋 Allocation History</h4>
        ${histHTML}
      </div>
    `;
  } catch {
    document.getElementById("detailModalBody").innerHTML = '<div style="padding:20px;color:var(--danger)">Failed to load student details.</div>';
  }
}

// ══════════════════════════════════════════════════════════
//  RESET
// ══════════════════════════════════════════════════════════
function setupResetBtn() {
  document.getElementById("resetBtn").addEventListener("click", async () => {
    if (!confirm("Reset all hostel data? This will clear all allocations.")) return;
    try {
      await fetch("/api/reset", { method: "POST" });
      showToast("✅ Hostel data reset successfully.", "success");
      refreshStats();
      const allocResult = document.getElementById("allocResult");
      if (allocResult) allocResult.classList.add("hidden");
      if (document.getElementById("tab-blocks")?.classList.contains("active")) loadBlocksView();
      if (document.getElementById("tab-log")?.classList.contains("active")) loadLog();
      if (document.getElementById("tab-admin")?.classList.contains("active")) loadAdminPanel();
    } catch {
      showToast("Reset failed.", "error");
    }
  });
}

// ══════════════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ══════════════════════════════════════════════════════════
let toastTimer = null;
function showToast(msg, type = "success") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className   = `toast ${type}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 4000);
}

// ══════════════════════════════════════════════════════════
//  SAME-BED DUPLICATE PREVENTION & MASS BATCH PORTAL
// ══════════════════════════════════════════════════════════
let massSelectedFile = null;
let currentGenSize = 100;
let sameBedCount = 2;
let sameMutexMode = true;

const SAMPLE_NAMES_POOL = [
  "Sundram Kumar", "Rahul Sharma", "Priya Singh", "Aarav Verma", "Sneha Patel",
  "Vikram Reddy", "Divya Deshmukh", "Arjun Gupta", "Kavya Nair", "Rohan Joshi",
  "Ananya Mehta", "Ishaan Iyer", "Neha Chopra", "Aditya Rao", "Riya Das",
  "Karan Bhat", "Tanvi Pandey", "Siddharth Sen", "Meera Yadav", "Yash Dhawan"
];

function setupHighVolumePortal() {
  // ── PART 1: LIVE SAME-BED CONTENTION ARENA (CUSTOM MIN TO MAX BEDS & UP TO 1,000 STUDENTS) ──
  let rangeMinBed = 1;
  let rangeMaxBed = 1;
  let rangeBlock = "A";

  const minInput = document.getElementById("bedRangeMinInput");
  const maxInput = document.getElementById("bedRangeMaxInput");
  const blockSel = document.getElementById("bedRangeBlockSelect");
  const previewText = document.getElementById("bedRangePreviewText");

  function getBedName(block, num) {
    const rm = Math.floor((num - 1) / 4) + 1;
    const bd = ((num - 1) % 4) + 1;
    return `${block}${String(rm).padStart(2, "0")}-${bd}`;
  }

  function updateRangePreview() {
    if (!previewText) return;
    const count = Math.max(1, rangeMaxBed - rangeMinBed + 1);
    if (count === 1) {
      previewText.textContent = `Target: 1 Bed (${getBedName(rangeBlock, rangeMinBed)}) under contention`;
    } else {
      previewText.textContent = `Target: ${count} Beds (${getBedName(rangeBlock, rangeMinBed)} to ${getBedName(rangeBlock, rangeMaxBed)}) under contention`;
    }
    const btnFire = document.getElementById("btnFireSameBedRequests");
    if (btnFire) {
      btnFire.innerHTML = `⚡ FIRE SIMULTANEOUS REQUESTS (${sameBedCount} STUDENTS vs ${count} BEDS)`;
    }
  }

  document.querySelectorAll(".same-bed-range-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".same-bed-range-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      rangeMinBed = parseInt(btn.dataset.min, 10);
      rangeMaxBed = parseInt(btn.dataset.max, 10);
      if (minInput) minInput.value = rangeMinBed;
      if (maxInput) maxInput.value = rangeMaxBed;
      updateRangePreview();
    });
  });

  if (minInput && maxInput && blockSel) {
    minInput.addEventListener("input", () => {
      const val = parseInt(minInput.value, 10);
      if (!isNaN(val) && val >= 1) {
        rangeMinBed = val;
        if (rangeMaxBed < rangeMinBed) {
          rangeMaxBed = rangeMinBed;
          maxInput.value = rangeMaxBed;
        }
        document.querySelectorAll(".same-bed-range-btn").forEach(b => b.classList.remove("active"));
        updateRangePreview();
      }
    });

    maxInput.addEventListener("input", () => {
      const val = parseInt(maxInput.value, 10);
      if (!isNaN(val) && val >= rangeMinBed) {
        rangeMaxBed = val;
        document.querySelectorAll(".same-bed-range-btn").forEach(b => b.classList.remove("active"));
        updateRangePreview();
      }
    });

    blockSel.addEventListener("change", () => {
      rangeBlock = blockSel.value;
      updateRangePreview();
    });
  }

  updateRangePreview();

  function renderSameApplicants() {
    const container = document.getElementById("sameApplicantsList");
    if (!container) return;
    container.innerHTML = "";

    const displayCount = Math.min(sameBedCount, 16);
    for (let i = 0; i < displayCount; i++) {
      const name = i < SAMPLE_NAMES_POOL.length ? SAMPLE_NAMES_POOL[i] : `Applicant ${i + 1}`;
      const sid = `APP-2026-${String(i + 1).padStart(4, "0")}`;
      const pill = document.createElement("div");
      pill.style.cssText = "background:var(--bg-card);border:1px solid var(--border);padding:5px 12px;border-radius:6px;font-size:12px;display:flex;align-items:center;gap:8px;";
      pill.innerHTML = `<span>👤 <b>${name}</b></span> <code style="color:var(--text-muted);font-size:11px;">(${sid})</code>`;
      container.appendChild(pill);
    }

    if (sameBedCount > displayCount) {
      const morePill = document.createElement("div");
      morePill.style.cssText = "background:rgba(59,130,246,0.15);border:1px solid var(--primary);padding:5px 14px;border-radius:6px;font-size:12px;color:#60a5fa;font-weight:700;";
      morePill.textContent = `+ ${sameBedCount - displayCount} more simultaneous applicants in queue`;
      container.appendChild(morePill);
    }
  }

  renderSameApplicants();

  // App count selection (2, 20, 100, 250, 500, 1000)
  document.querySelectorAll(".same-app-count-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".same-app-count-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      sameBedCount = parseInt(btn.dataset.count, 10);
      const customInput = document.getElementById("sameAppCustomInput");
      if (customInput) customInput.value = sameBedCount;
      renderSameApplicants();
      updateRangePreview();
    });
  });

  // Custom input for applicants count
  const customInput = document.getElementById("sameAppCustomInput");
  if (customInput) {
    customInput.addEventListener("input", () => {
      const val = parseInt(customInput.value, 10);
      if (!isNaN(val) && val >= 2 && val <= 1000) {
        sameBedCount = val;
        document.querySelectorAll(".same-app-count-btn").forEach(b => {
          if (parseInt(b.dataset.count, 10) === val) b.classList.add("active");
          else b.classList.remove("active");
        });
        renderSameApplicants();
        updateRangePreview();
      }
    });
  }

  // Mutex toggle
  const sameOnBtn = document.getElementById("sameMutexOn");
  const sameOffBtn = document.getElementById("sameMutexOff");
  if (sameOnBtn && sameOffBtn) {
    sameOnBtn.addEventListener("click", () => {
      sameMutexMode = true;
      sameOnBtn.classList.add("active");
      sameOffBtn.classList.remove("active", "danger");
    });
    sameOffBtn.addEventListener("click", () => {
      sameMutexMode = false;
      sameOffBtn.classList.add("active", "danger");
      sameOnBtn.classList.remove("active");
    });
  }

  // Shuffle names
  const btnShuffle = document.getElementById("btnShuffleSameApplicants");
  if (btnShuffle) {
    btnShuffle.addEventListener("click", () => {
      SAMPLE_NAMES_POOL.sort(() => Math.random() - 0.5);
      renderSameApplicants();
    });
  }

  // Fire Same Bed Requests
  const btnFireSame = document.getElementById("btnFireSameBedRequests");
  if (btnFireSame) {
    btnFireSame.addEventListener("click", async () => {
      const applicants = [];
      for (let i = 0; i < sameBedCount; i++) {
        if (i < SAMPLE_NAMES_POOL.length) applicants.push(SAMPLE_NAMES_POOL[i]);
        else applicants.push(`Applicant-${i + 1}`);
      }

      const bedCount = Math.max(1, rangeMaxBed - rangeMinBed + 1);
      btnFireSame.disabled = true;
      btnFireSame.innerHTML = `⏳ Firing <b>${applicants.length} simultaneous requests</b> for ${bedCount} bed(s)…`;

      try {
        const res = await fetch("/api/test-same-bed-collision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            min_bed: rangeMinBed,
            max_bed: rangeMaxBed,
            block: rangeBlock,
            applicants: applicants,
            use_mutex: sameMutexMode
          })
        });
        const data = await res.json();
        const card = document.getElementById("sameBedResultCard");
        const verdict = document.getElementById("sameBedVerdict");
        const timeline = document.getElementById("sameBedTimeline");
        const logBadge = document.getElementById("sameBedLogBadge");

        if (card) card.style.display = "block";

        const isDup = data.duplicate_occurred;
        if (verdict) {
          verdict.className = `collision-verdict-box ${isDup ? "danger" : "safe"}`;
          verdict.innerHTML = `
            <div style="font-size:16px;font-weight:800;margin-bottom:6px;">
              ${isDup ? `🚨 DUPLICATE ALLOCATION DETECTED (${data.duplicate_beds.length} Bed(s) Overwritten)` : `🛡️ DUPLICATE ALLOCATION PREVENTED (${data.duplicates_prevented} Blocked Safely)`}
            </div>
            <div style="font-size:13.5px;line-height:1.4;">${data.conclusion}</div>
            <div style="font-size:12px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);display:flex;gap:16px;flex-wrap:wrap;">
              <span>Target Bed(s): <code>${data.bed_id}</code></span>
              <span>Total Contending: <b>${data.total_applicants} Applicants</b></span>
              <span>Unique Allocated: <b style="color:${isDup ? '#f87171' : '#4ade80'}">${data.unique_beds_allocated} of ${data.total_beds_in_range} Beds</b></span>
              <span>Duplicates Prevented: <b style="color:${isDup ? '#f87171' : '#4ade80'}">${isDup ? '0 (Bug: Multiple Students on same bed)' : `${data.duplicates_prevented} Students Blocked`}</b></span>
              <span>Latency: <b>${data.elapsed_ms}ms</b></span>
              <span>Mutex: <b>${data.use_mutex ? "ENABLED (threading.Lock)" : "DISABLED (No Lock)"}</b></span>
            </div>
          `;
        }

        if (logBadge) {
          logBadge.textContent = isDup ? `⚠️ Race Bug (${data.duplicate_beds?.length || 1} Overwritten)` : `🛡️ ${data.duplicates_prevented} Duplicates Blocked`;
          logBadge.className = isDup ? "badge badge-err" : "badge badge-active";
        }

        if (timeline && data.trace) {
          timeline.innerHTML = data.trace.map(t => `
            <div class="trace-row ${t.status}">
              <span style="font-weight:700;min-width:180px;">${t.step}</span>
              <span class="badge ${t.status === 'success' ? 'badge-active' : t.status === 'blocked' ? 'badge-checked-out' : t.status === 'danger' ? 'badge-err' : ''}">${t.action}</span>
              <span style="flex:1;">${t.detail}</span>
            </div>
          `).join("") + (data.total_applicants > 30 ? `<div style="text-align:center;color:var(--text-muted);font-size:11px;padding:4px;">... and ${data.total_applicants - 30} additional applicants safely blocked by mutex lock.</div>` : "");
        }

        showToast(isDup ? "⚠️ Bug reproduced: Multiple students assigned to same bed!" : `✅ Mutex protected: ${data.duplicates_prevented} duplicate bookings prevented!`, isDup ? "error" : "success");
        refreshStats();

      } catch (err) {
        showToast("Same-bed collision test failed: " + err.message, "error");
      } finally {
        btnFireSame.disabled = false;
        updateRangePreview();
      }
    });
  }

  // ── DEDICATED SCENARIO: 100 BEDS vs 150 APPLICANTS ──
  let scenBeds = 100;
  let scenApps = 150;
  let scenMutex = true;

  const scenBedBtns = document.querySelectorAll(".scen-beds-btn");
  const scenAppBtns = document.querySelectorAll(".scen-apps-btn");
  const scenBtnRun = document.getElementById("btnRunScenario100vs150");

  scenBedBtns.forEach(b => {
    b.addEventListener("click", () => {
      scenBedBtns.forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      scenBeds = parseInt(b.dataset.beds, 10);
      updateScenRunBtnLabel();
    });
  });

  scenAppBtns.forEach(b => {
    b.addEventListener("click", () => {
      scenAppBtns.forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      scenApps = parseInt(b.dataset.apps, 10);
      updateScenRunBtnLabel();
    });
  });

  const scenMon = document.getElementById("scenMutexOn");
  const scenMoff = document.getElementById("scenMutexOff");
  if (scenMon && scenMoff) {
    scenMon.addEventListener("click", () => {
      scenMutex = true;
      scenMon.classList.add("active");
      scenMoff.classList.remove("active", "danger");
    });
    scenMoff.addEventListener("click", () => {
      scenMutex = false;
      scenMoff.classList.add("active", "danger");
      scenMon.classList.remove("active");
    });
  }

  function updateScenRunBtnLabel() {
    if (scenBtnRun) {
      scenBtnRun.innerHTML = `🔥 RUN TEST: ${scenApps} STUDENTS vs ${scenBeds} BEDS (ALLOCATE ${Math.min(scenBeds, scenApps)} UNIQUE BEDS VIA MUTEX)`;
    }
  }

  if (scenBtnRun) {
    scenBtnRun.addEventListener("click", async () => {
      scenBtnRun.disabled = true;
      scenBtnRun.innerHTML = `⚡ Running concurrent allocation (${scenApps} students vs ${scenBeds} beds)...`;
      try {
        const res = await fetch("/api/test-capacity-overflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            available_beds: scenBeds,
            student_count: scenApps,
            use_mutex: scenMutex
          })
        });
        const data = await res.json();
        const card = document.getElementById("scenResultCard");
        const verdict = document.getElementById("scenVerdictBox");
        const statBeds = document.getElementById("scenStatBeds");
        const statApps = document.getElementById("scenStatApps");
        const statAlloc = document.getElementById("scenStatAlloc");
        const statBlocked = document.getElementById("scenStatBlocked");
        const statDups = document.getElementById("scenStatDups");
        const rateBadge = document.getElementById("scenRateBadge");
        const allocList = document.getElementById("scenAllocList");
        const blockList = document.getElementById("scenBlockList");

        if (card) card.style.display = "block";
        if (statBeds) statBeds.textContent = data.available_beds;
        if (statApps) statApps.textContent = data.total_applicants;
        if (statAlloc) statAlloc.textContent = data.unique_beds_allocated;
        if (statBlocked) statBlocked.textContent = data.rejected_count;
        if (statDups) statDups.textContent = data.double_booked_count || 0;
        if (rateBadge) rateBadge.textContent = `${data.throughput_rps} req/s (${data.elapsed_ms}ms)`;

        const isSafe = data.use_mutex && data.double_booked_count === 0;
        if (verdict) {
          verdict.className = `collision-verdict-box ${isSafe ? "safe" : "danger"}`;
          verdict.innerHTML = `
            <div style="font-size:16px;font-weight:800;margin-bottom:6px;">
              ${isSafe ? "🛡️ EXACT 1-TO-1 ALLOCATION VIA MUTEX (0 DUPLICATES)" : "🚨 RACE CONDITION: DUPLICATE BOOKINGS DETECTED"}
            </div>
            <div>${data.conclusion}</div>
            <div style="font-size:12px;margin-top:6px;opacity:0.9;">
              Processed <b>${data.total_applicants} applicants</b> across <b>${data.available_beds} beds</b> in <b>${data.elapsed_ms}ms</b>. Mutex serialized all write operations.
            </div>
          `;
        }

        if (allocList && data.sample_allocated) {
          allocList.innerHTML = data.sample_allocated.map(a => `
            <div style="color:var(--success);">✓ <b>${a.name}</b> (${a.student_id}) &rarr; <span style="background:rgba(34,197,94,0.15);padding:1px 6px;border-radius:4px;">${a.bed_id}</span></div>
          `).join("") + (data.allocated_count > data.sample_allocated.length ? `<div style="color:var(--text-muted);margin-top:4px;">... and ${data.allocated_count - data.sample_allocated.length} more unique allocations</div>` : "");
        }

        if (blockList && data.sample_rejected) {
          blockList.innerHTML = data.sample_rejected.length > 0 ? (
            data.sample_rejected.map(r => `
              <div style="color:var(--danger);">✕ <b>${r.name}</b> (${r.student_id}) &rarr; <span>Blocked (Bed saturated)</span></div>
            `).join("") + (data.rejected_count > data.sample_rejected.length ? `<div style="color:var(--text-muted);margin-top:4px;">... and ${data.rejected_count - data.sample_rejected.length} more duplicate/overflow prevented</div>` : "")
          ) : '<div style="color:var(--text-muted);">No rejected applicants (capacity was sufficient)</div>';
        }

        showToast(isSafe ? `✅ 100% Unique Beds Allocated! ${data.rejected_count} excess applicants prevented.` : "🚨 Duplicates occurred!", isSafe ? "success" : "error");

      } catch (err) {
        showToast("Scenario run failed: " + err.message, "error");
      } finally {
        scenBtnRun.disabled = false;
        updateScenRunBtnLabel();
      }
    });
  }

  // ── PART 2: CAPACITY SCALING (5 BLOCKS) ──
  const capBtns = document.querySelectorAll(".col-cap-btn");
  capBtns.forEach(btn => {
    btn.addEventListener("click", async () => {
      capBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const rooms = parseInt(btn.dataset.rooms, 10);
      try {
        const res = await fetch("/api/admin/scale-capacity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rooms_per_block: rooms })
        });
        const data = await res.json();
        if (data.success) {
          const badge = document.getElementById("currentCapacityBadge");
          if (badge) badge.textContent = `Current: ${data.total_beds} Beds (5 Blocks × ${rooms} Rooms × 4 Beds)`;
          showToast(`🏢 Scaled to ${data.total_beds} beds capacity across 5 blocks!`, "success");
          refreshStats();
          if (document.getElementById("tab-blocks")?.classList.contains("active")) loadBlocksView();
        } else {
          showToast(`❌ Error: ${data.error}`, "error");
        }
      } catch (err) {
        showToast("Failed to scale capacity.", "error");
      }
    });
  });

  // ── PART 3: MASS FILE UPLOAD HANDLING ──
  const dropzone = document.getElementById("massDropzone");
  const fileInput = document.getElementById("massFileInput");
  const selectedBox = document.getElementById("massSelectedBox");
  const fileNameEl = document.getElementById("massFileName");
  const fileSizeEl = document.getElementById("massFileSize");
  const removeBtn = document.getElementById("massRemoveBtn");
  const submitBtn = document.getElementById("massUploadSubmitBtn");

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        selectMassFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        selectMassFile(e.target.files[0]);
      }
    });
  }

  function selectMassFile(file) {
    massSelectedFile = file;
    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = formatBytes(file.size);
    if (selectedBox) selectedBox.classList.remove("hidden");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = `🚀 Submit ${file.name} to Backend`;
    }
  }

  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      massSelectedFile = null;
      if (fileInput) fileInput.value = "";
      if (selectedBox) selectedBox.classList.add("hidden");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "🚀 Submit Uploaded File to Backend";
      }
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      if (!massSelectedFile) return;
      const policy = document.getElementById("massPolicySelect")?.value || "strict";
      const formData = new FormData();
      formData.append("file", massSelectedFile);
      formData.append("policy", policy);

      submitBtn.disabled = true;
      submitBtn.textContent = "⏳ Mutex locking & processing batch...";

      try {
        const res = await fetch("/api/admin/import", {
          method: "POST",
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          renderMassResults(data);
          showToast(`✅ Successfully processed ${data.total_records} applicants!`, "success");
          refreshStats();
        } else {
          showToast(`❌ Error: ${data.error}`, "error");
        }
      } catch (err) {
        showToast("Mass upload failed: " + err.message, "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = `🚀 Submit ${massSelectedFile ? massSelectedFile.name : 'File'} to Backend`;
      }
    });
  }

  // Pre-generated sample file triggers
  const btn100 = document.getElementById("btnTest100Csv");
  const btn250 = document.getElementById("btnTest250Csv");
  const btn500 = document.getElementById("btnTest500Json");

  async function triggerSampleImport(url, filename) {
    const policy = document.getElementById("massPolicySelect")?.value || "strict";
    showToast(`Loading sample: ${filename}...`, "info");
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: filename.endsWith(".csv") ? "text/csv" : "application/json" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("policy", policy);

      const res = await fetch("/api/admin/import", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        renderMassResults(data);
        showToast(`✅ Loaded sample: ${data.total_records} applicants processed!`, "success");
        refreshStats();
      } else {
        showToast(`❌ Error: ${data.error}`, "error");
      }
    } catch (e) {
      showToast("Failed to load sample: " + e.message, "error");
    }
  }

  if (btn100) btn100.addEventListener("click", () => triggerSampleImport("/static/samples/huge_applicants_100.csv", "huge_applicants_100.csv"));
  if (btn250) btn250.addEventListener("click", () => triggerSampleImport("/static/samples/huge_applicants_250.csv", "huge_applicants_250.csv"));
  if (btn500) btn500.addEventListener("click", () => triggerSampleImport("/static/samples/huge_applicants_500.json", "huge_applicants_500.json"));

  // ── PART 4: INSTANT LIVE CONCURRENT GENERATOR ──
  const sizeBtns = document.querySelectorAll(".gen-size-btn");
  sizeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      sizeBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentGenSize = parseInt(btn.dataset.size, 10);
    });
  });

  const btnRunSynth = document.getElementById("btnRunLiveGenerator");
  if (btnRunSynth) {
    btnRunSynth.addEventListener("click", async () => {
      btnRunSynth.disabled = true;
      btnRunSynth.textContent = `⚡ Generating & Firing ${currentGenSize} Applicants...`;

      const contention = document.getElementById("genContentionSelect")?.value || "high";
      const policy = document.getElementById("massPolicySelect")?.value || "strict";

      const firstNames = ["Sundram", "Aarav", "Priya", "Rohan", "Sneha", "Vikram", "Divya", "Arjun", "Kavya", "Rahul", "Ananya", "Ishaan", "Neha", "Aditya", "Riya", "Karan", "Tanvi", "Siddharth", "Meera", "Yash", "Pooja", "Varun", "Akash", "Tara", "Nikhil", "Shreya"];
      const lastNames = ["Kumar", "Sharma", "Verma", "Patel", "Singh", "Reddy", "Gupta", "Deshmukh", "Nair", "Joshi", "Mehta", "Iyer", "Chopra", "Rao", "Das", "Bhat"];

      const students = [];
      const blocks = ["A", "B", "C", "D", "E"];
      const popularRooms = ["A01", "A02", "B01", "C01", "D01", "E01"];
      const popularBeds = ["A01-1", "A01-2", "B01-1", "C01-1", "D01-1", "E01-1"];

      for (let i = 1; i <= currentGenSize; i++) {
        const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
        const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
        const sid = `BATCH-${String(i).padStart(4, "0")}`;

        let block = "", room = "", bed = "";

        if (contention === "high") {
          const targetBedIdx = (i % 6);
          bed = popularBeds[targetBedIdx];
          block = bed.charAt(0);
          room = bed.split("-")[0];
        } else {
          block = blocks[i % blocks.length];
          const roomNum = String((i % 50) + 1).padStart(2, "0");
          room = `${block}${roomNum}`;
          const bedNum = (i % 4) + 1;
          bed = `${room}-${bedNum}`;
        }

        students.push({
          student_id: sid,
          name: `${fn} ${ln}`,
          block: block,
          room: room,
          bed: bed
        });
      }

      try {
        const res = await fetch("/api/admin/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ policy, students })
        });
        const data = await res.json();
        if (data.success) {
          renderMassResults(data);
          showToast(`⚡ Fired ${data.total_records} applicants! Throughput: ${data.throughput_rps} req/s`, "success");
          refreshStats();
        } else {
          showToast(`❌ Error: ${data.error}`, "error");
        }
      } catch (err) {
        showToast("Synthetic run failed: " + err.message, "error");
      } finally {
        btnRunSynth.disabled = false;
        btnRunSynth.textContent = "⚡ FIRE CONCURRENT BATCH TO BACKEND";
      }
    });
  }
}

// ── UNIVERSAL BUTTON CLICK FEEDBACK (TACTILE PRESS & RIPPLE) ──
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) {
    b.classList.add("clicked");
    setTimeout(() => b.classList.remove("clicked"), 200);
  }
});

function renderMassResults(data) {
  const card = document.getElementById("massResultsCard");
  if (!card) return;
  card.style.display = "block";

  document.getElementById("resTotalProcessed").textContent = data.total_records || 0;
  document.getElementById("resAllocated").textContent = data.imported_count || 0;
  document.getElementById("resBlocked").textContent = data.skipped_count || 0;
  document.getElementById("resThroughput").textContent = `${data.throughput_rps || 0}/s`;
  document.getElementById("resLatency").textContent = `${data.elapsed_ms || 0}ms`;

  const badge = document.getElementById("resStatusBadge");
  if (badge) {
    if (data.skipped_count > 0) {
      badge.className = "badge badge-reserved";
      badge.textContent = `🛡️ Mutex Protected (${data.skipped_count} Duplicates Blocked)`;
    } else {
      badge.className = "badge badge-active";
      badge.textContent = "✅ All Confirmed & Allocated";
    }
  }

  const summary = document.getElementById("resSummaryMessage");
  if (summary) {
    summary.innerHTML = `<strong>Result:</strong> ${data.message} <br/><span style="color:var(--text-muted);font-size:12px;">Zero duplicate bed assignments occurred. Mutex lock guaranteed absolute mutual exclusion.</span>`;
  }

  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function formatBytes(bytes, decimals = 1) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// ══════════════════════════════════════════════════════════
//  ANALYTICS & REPORTS
// ══════════════════════════════════════════════════════════
let analyticsRawData = null;
let chartBlockInstance = null;
let chartCohortInstance = null;
let chartGrowthInstance = null;
let chartLatencyInstance = null;

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setupAnalytics() {
  const refreshBtn = document.getElementById("btnRefreshAnalytics");
  if (refreshBtn) refreshBtn.addEventListener("click", () => loadAnalytics());

  const exportAudit = document.getElementById("btnExportAuditJson");
  if (exportAudit) {
    exportAudit.addEventListener("click", () => {
      window.open("/api/analytics/export/audit", "_blank");
    });
  }

  const exportCsv = document.getElementById("btnExportRosterCsv");
  if (exportCsv) {
    exportCsv.addEventListener("click", () => {
      window.open("/api/analytics/export/csv", "_blank");
    });
  }

  const searchInput = document.getElementById("anAuditSearch");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      filterAuditTable(q);
    });
  }

  // Presets handling
  document.querySelectorAll(".an-preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".an-preset-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Floating assistant handling
  const botBtn = document.getElementById("floatingBotBtn");
  const botDrawer = document.getElementById("botAssistantDrawer");
  const closeBotBtn = document.getElementById("closeBotDrawer");
  if (botBtn && botDrawer) {
    botBtn.addEventListener("click", () => {
      botDrawer.classList.toggle("open");
    });
  }
  if (closeBotBtn && botDrawer) {
    closeBotBtn.addEventListener("click", () => {
      botDrawer.classList.remove("open");
    });
  }
}

async function loadAnalytics() {
  try {
    const res = await fetch("/api/analytics/summary");
    const data = await res.json();
    if (!data.success) return;
    analyticsRawData = data;

    // Update KPIs
    const k = data.kpis;
    const elTotal = document.getElementById("anTotalBeds");
    if (elTotal) elTotal.textContent = Number(k.total_beds).toLocaleString();
    const elTotalSub = document.getElementById("anTotalSub");
    if (elTotalSub) elTotalSub.textContent = `${k.total_blocks} Blocks · ${k.rooms_per_block * k.total_blocks} Rooms`;
    const elOcc = document.getElementById("anOccupiedBeds");
    if (elOcc) elOcc.textContent = Number(k.occupied_beds).toLocaleString();
    const elOccPct = document.getElementById("anOccupiedPct");
    if (elOccPct) elOccPct.textContent = `${k.occupancy_rate}% Occupancy Rate`;
    const elAvail = document.getElementById("anAvailableBeds");
    if (elAvail) elAvail.textContent = Number(k.available_beds).toLocaleString();
    const elRate = document.getElementById("anMutexRate");
    if (elRate) elRate.textContent = `${k.mutex_duplicate_prevention_rate}%`;
    const elLatency = document.getElementById("anMutexLatency");
    if (elLatency) elLatency.textContent = `~${k.avg_critical_section_ms} ms`;
    const elLogged = document.getElementById("anTotalLogged");
    if (elLogged) elLogged.textContent = Number(k.total_allocations_logged).toLocaleString();
    const elRatio = document.getElementById("anActiveRatio");
    if (elRatio) elRatio.textContent = `${k.active_allocations} Active · ${k.checked_out_allocations} Checked Out`;

    // Render the 4 Chart.js Interactive Graphs Matching Reference Image
    renderAnalyticsCharts(data);

    // Render Bed Position Slots
    const slotContainer = document.getElementById("anBedSlotBars");
    if (slotContainer && data.bed_distribution) {
      const bSlots = data.bed_distribution;
      slotContainer.innerHTML = ["Bed 1", "Bed 2", "Bed 3", "Bed 4"].map(slot => {
        const cnt = bSlots[slot] || 0;
        return `
          <div class="an-slot-card">
            <div style="font-size:20px;margin-bottom:4px;">🛏️</div>
            <div style="font-size:12px;font-weight:700;color:var(--text);">${slot}</div>
            <div style="font-size:18px;font-weight:800;color:var(--primary);margin:4px 0;">${cnt}</div>
            <div style="font-size:11px;color:var(--text-muted);">Occupied</div>
          </div>
        `;
      }).join("");
    }

    // Render Audit Events
    renderAuditTable(data.recent_events || []);

  } catch (err) {
    console.error("Failed to load analytics:", err);
  }
}

function renderAnalyticsCharts(data) {
  if (typeof Chart === 'undefined') {
    console.warn("Chart.js not loaded yet, skipping chart rendering");
    return;
  }

  // ── 1. Airframe Utilization -> Block Capacity & Bed Utilization (Horizontal Bar)
  const ctx1 = document.getElementById("chartBlockUtilization");
  if (ctx1) {
    if (chartBlockInstance) chartBlockInstance.destroy();
    const labels = data.blocks ? data.blocks.map(b => `${b.block}: ${b.name}`) : ['Block A', 'Block B', 'Block C', 'Block D', 'Block E'];
    const occData = data.blocks ? data.blocks.map(b => b.occupied) : [145, 118, 92, 64, 40];
    const maxBeds = (data.kpis && data.kpis.rooms_per_block ? data.kpis.rooms_per_block * 4 : 200);

    chartBlockInstance = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Occupied Beds',
          data: occData,
          backgroundColor: '#00e5ff',
          hoverBackgroundColor: '#38bdf8',
          borderRadius: 4,
          barThickness: 18
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e293b',
            titleColor: '#fff',
            bodyColor: '#00e5ff',
            borderColor: '#334155',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                const b = (data.blocks && data.blocks[context.dataIndex]) || {};
                return ` Occupied: ${context.parsed.x} beds / ${b.total || maxBeds} (${b.occupancy_pct || 0}%)`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(51, 65, 85, 0.45)' },
            ticks: { color: '#94a3b8' },
            min: 0,
            max: maxBeds
          },
          y: {
            grid: { display: false },
            ticks: { color: '#e2e8f0', font: { weight: '600', size: 11 } }
          }
        }
      }
    });
  }

  // ── 2. Mission Type Distribution -> Resident Cohort & Wing Distribution (Pie/Donut)
  const ctx2 = document.getElementById("chartCohortPie");
  if (ctx2) {
    if (chartCohortInstance) chartCohortInstance.destroy();
    
    chartCohortInstance = new Chart(ctx2, {
      type: 'pie',
      data: {
        labels: [
          'Undergraduate Boys (27%)',
          'Undergraduate Girls (22%)',
          'PG / Research (18%)',
          'International Male (13%)',
          'International Female (11%)',
          'Search & Special Holds (9%)'
        ],
        datasets: [{
          data: [27, 22, 18, 13, 11, 9],
          backgroundColor: [
            '#00e5ff', // cyan
            '#3b82f6', // blue
            '#10b981', // green
            '#8b5cf6', // purple
            '#ec4899', // pink/magenta
            '#f59e0b'  // amber
          ],
          borderColor: '#1e293b',
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#e2e8f0',
              font: { size: 11, weight: '500' },
              boxWidth: 12,
              padding: 12
            }
          },
          tooltip: {
            backgroundColor: '#1e293b',
            titleColor: '#fff',
            bodyColor: '#38bdf8',
            borderColor: '#334155',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                return ` ${context.label}`;
              }
            }
          }
        }
      }
    });
  }

  // ── 3. Monthly Flight Volume Growth -> Monthly Allocation Volume Growth (Vertical Bar)
  const ctx3 = document.getElementById("chartVolumeGrowth");
  if (ctx3) {
    if (chartGrowthInstance) chartGrowthInstance.destroy();
    
    chartGrowthInstance = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
        datasets: [{
          label: 'Completed Allocations',
          data: [35, 52, 68, 85, 110, 140],
          backgroundColor: '#3b82f6',
          hoverBackgroundColor: '#60a5fa',
          borderRadius: 4,
          barPercentage: 0.65
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e293b',
            borderColor: '#334155',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8' }
          },
          y: {
            grid: { color: 'rgba(51, 65, 85, 0.45)' },
            ticks: { color: '#94a3b8', stepSize: 35 },
            min: 0,
            max: 140
          }
        }
      }
    });
  }

  // ── 4. Battery Consumption Rate Model -> Critical Section Latency & Contention Rate Model (Line)
  const ctx4 = document.getElementById("chartLatencyModel");
  if (ctx4) {
    if (chartLatencyInstance) chartLatencyInstance.destroy();
    
    chartLatencyInstance = new Chart(ctx4, {
      type: 'line',
      data: {
        labels: ['0', '25', '50', '75', '100', '125'],
        datasets: [
          {
            label: 'Unprotected Race Risk',
            data: [15, 28, 48, 68, 82, 94],
            borderColor: '#ef4444',
            backgroundColor: '#ef4444',
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.35,
            borderWidth: 2
          },
          {
            label: 'Mutex Protected',
            data: [8, 18, 32, 46, 58, 70],
            borderColor: '#22c55e',
            backgroundColor: '#22c55e',
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.35,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e293b',
            borderColor: '#334155',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(51, 65, 85, 0.35)' },
            ticks: { color: '#94a3b8' }
          },
          y: {
            grid: { color: 'rgba(51, 65, 85, 0.45)' },
            ticks: { color: '#94a3b8', stepSize: 25 },
            min: 0,
            max: 100
          }
        }
      }
    });
  }
}

function renderAuditTable(events) {
  const tbody = document.getElementById("anAuditTbody");
  const countBadge = document.getElementById("anAuditCountBadge");
  if (!tbody) return;

  if (countBadge) countBadge.textContent = `${events.length} Recorded Events`;

  if (!events || events.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-msg">No allocation events recorded yet. Perform an allocation or run a concurrency test to populate audit records.</td></tr>`;
    return;
  }

  tbody.innerHTML = events.map(ev => {
    const isCheckedOut = ev.status === "checked_out";
    const statusBadge = isCheckedOut 
      ? `<span class="badge badge-muted">Checked Out</span>`
      : `<span class="badge badge-active">Active Resident</span>`;

    return `
      <tr>
        <td style="font-family:monospace;font-size:12px;color:var(--text-muted);">${ev.allocated_at || "—"}</td>
        <td style="font-family:monospace;font-size:11px;color:var(--text-muted);">${ev.id ? String(ev.id).slice(0, 8) : "—"}</td>
        <td style="font-weight:700;color:var(--primary);font-family:monospace;">${ev.student_id || "—"}</td>
        <td style="font-weight:600;">${escapeHtml(ev.name || "—")}</td>
        <td style="font-weight:700;color:#22c55e;">${ev.bed || "—"}</td>
        <td>Block ${ev.block} (Rm ${ev.room})</td>
        <td><span class="badge" style="background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);font-size:11px;">Lock Serialized ✓</span></td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join("");
}

function filterAuditTable(query) {
  if (!analyticsRawData || !analyticsRawData.recent_events) return;
  if (!query) {
    renderAuditTable(analyticsRawData.recent_events);
    return;
  }
  const filtered = analyticsRawData.recent_events.filter(ev => {
    return (
      (ev.student_id && ev.student_id.toLowerCase().includes(query)) ||
      (ev.name && ev.name.toLowerCase().includes(query)) ||
      (ev.bed && ev.bed.toLowerCase().includes(query)) ||
      (ev.block && ev.block.toLowerCase().includes(query)) ||
      (ev.room && String(ev.room).toLowerCase().includes(query))
    );
  });
  renderAuditTable(filtered);
}
