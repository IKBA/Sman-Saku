// ==========================================
// SUPABASE CONFIGURATION & FALLBACK SYSTEM
// ==========================================
// Ganti dengan URL dan Anon Key dari project Supabase Anda
const RAW_SUPABASE_URL = "https://ktkrlzuyvtvtpvkpzhgd.supabase.co/rest/v1/";
const SUPABASE_URL = RAW_SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const SUPABASE_KEY = "sb_publishable_0n9JcPwL-wjcgPw18y8ikQ_DlgqZZfm";

// Deteksi apakah kredensial Supabase sudah dikonfigurasi
const isCloudMode = (
  SUPABASE_URL && 
  SUPABASE_URL !== "" && 
  SUPABASE_URL !== "YOUR_SUPABASE_URL" &&
  SUPABASE_KEY && 
  SUPABASE_KEY !== "" && 
  SUPABASE_KEY !== "YOUR_SUPABASE_KEY"
);

// ==========================================
// SUPABASE REST API WRAPPER (tanpa SDK)
// Kompatibel dengan semua jenis API Key Supabase
// (anon JWT maupun publishable key)
// ==========================================
const supabaseHeaders = isCloudMode ? {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json"
} : {};

// Helper: build a chainable query object
function buildQuery(table, selectCols = "*") {
  const filters = [];
  let limitVal = null;

  const obj = {
    // Immutable chaining methods (return new obj state)
    eq(col, val) {
      filters.push(`${col}=eq.${encodeURIComponent(val)}`);
      return obj;
    },
    limit(n) {
      limitVal = n;
      return obj;
    },
    // Terminal methods that execute the fetch
    async maybeSingle() {
      const qs = [...filters, "limit=1"].join("&");
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${selectCols}&${qs}`, { headers: supabaseHeaders });
        const arr = await res.json();
        return res.ok ? { data: (arr && arr.length > 0 ? arr[0] : null), error: null } : { data: null, error: arr };
      } catch(e) { return { data: null, error: e }; }
    },
    then(resolve, reject) {
      // Makes the query thenable — await-able
      const qs = [
        `select=${selectCols}`,
        ...filters,
        ...(limitVal !== null ? [`limit=${limitVal}`] : [])
      ].join("&");
      return fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, { headers: supabaseHeaders })
        .then(res => res.json().then(data => res.ok ? resolve({ data, error: null }) : resolve({ data: null, error: data })))
        .catch(e => resolve({ data: null, error: e }));
    }
  };
  return obj;
}

const supabase = isCloudMode ? {
  from: (table) => ({
    // --- READ ---
    select(cols = "*") {
      return buildQuery(table, cols);
    },

    // --- INSERT ---
    async insert(payload) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
          method: "POST",
          headers: { ...supabaseHeaders, "Prefer": "return=representation" },
          body: JSON.stringify(payload)
        });
        const data = res.status === 204 ? null : await res.json();
        return res.ok ? { data, error: null } : { data: null, error: data };
      } catch(e) { return { data: null, error: e }; }
    },

    // --- UPSERT ---
    async upsert(payload, opts = {}) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
          method: "POST",
          headers: { ...supabaseHeaders, "Prefer": "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(payload)
        });
        const data = res.status === 204 ? null : await res.json();
        return res.ok ? { data, error: null } : { data: null, error: data };
      } catch(e) { return { data: null, error: e }; }
    },

    // --- UPDATE (chainable: .update({}).eq()) ---
    update(updatePayload) {
      const filters = [];
      const chain = {
        eq(col, val) {
          filters.push(`${col}=eq.${encodeURIComponent(val)}`);
          return chain;
        },
        then(resolve) {
          const qs = filters.join("&");
          return fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
            method: "PATCH",
            headers: { ...supabaseHeaders, "Prefer": "return=representation" },
            body: JSON.stringify(updatePayload)
          })
          .then(res => res.json().then(data => res.ok ? resolve({ data, error: null }) : resolve({ data: null, error: data })))
          .catch(e => resolve({ data: null, error: e }));
        }
      };
      return chain;
    },

    // --- DELETE (chainable: .delete().eq()) ---
    delete() {
      const filters = [];
      const chain = {
        eq(col, val) {
          filters.push(`${col}=eq.${encodeURIComponent(val)}`);
          return chain;
        },
        then(resolve) {
          const qs = filters.join("&");
          return fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
            method: "DELETE",
            headers: supabaseHeaders
          })
          .then(res => resolve({ data: null, error: res.ok ? null : res.statusText }))
          .catch(e => resolve({ data: null, error: e }));
        }
      };
      return chain;
    }
  })
} : null;

if (isCloudMode) {
  console.log("Sman_Saku is running in Cloud Mode (Supabase REST API active)");
} else {
  console.log("Sman_Saku is running in Local Mode (localStorage fallback)");
}

// State Management
let db = {};
let activeEditJurnalId = null;

// Helper to get local date string (YYYY-MM-DD) avoiding UTC timezone offset issues
function getLocalDateString() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ==========================================
// AUTHENTICATION SYSTEM
// ==========================================
const AUTH_STORAGE_KEY = "saku_guru_auth";
const USERS_STORAGE_KEY = "saku_guru_users";
const APP_BUILD_VERSION = "1.2.3_20261002";

// Reset session on fresh installation or new APK build to always show login screen
(function checkAppInstallVersion() {
  try {
    const lastBuild = localStorage.getItem("sman_saku_build_version");
    if (lastBuild !== APP_BUILD_VERSION) {
      // Reinstall or new build detected: clear session so user must pass login screen
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.setItem("sman_saku_build_version", APP_BUILD_VERSION);
    }
  } catch(e) {
    console.warn("Failed to check app build version:", e);
  }
})();

// Default admin-registered users (email + password)
async function getRegisteredUsers() {
  if (isCloudMode && supabase) {
    try {
      const { data, error } = await supabase.from("saku_guru_users").select("*");
      if (!error && data && data.length > 0) return data;
    } catch(e) { console.warn("Supabase getRegisteredUsers error:", e); }
  }
  // Fallback to localStorage
  const stored = localStorage.getItem(USERS_STORAGE_KEY);
  if (stored) {
    try { return JSON.parse(stored); } catch(e) { /* fall through */ }
  }
  // Default users seeded by administrator (with offline teacher accounts)
  const defaultUsers = [
    { email: "admin@smansaku.id", password: "admin123", nama: "Administrator Sman_Saku", role: "admin" },
    { email: "kamria@smansaku.id", password: "@kamria123", nama: "Dr. Kamria, S.Pd., M.Si", role: "admin" },
    { email: "ikbar@smansaku.id", password: "r@bk10812", nama: "Muh. Ikbar, S.Pd., Gr", role: "guru" }
  ];
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(defaultUsers));
  return defaultUsers;
}

async function saveRegisteredUsers(users) {
  // Always save to localStorage as cache/fallback
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  // No direct batch-save to Supabase here; individual operations handle cloud saves
}

function getSession() {
  const data = localStorage.getItem(AUTH_STORAGE_KEY);
  if (data) {
    try { return JSON.parse(data); } catch(e) { return null; }
  }
  return null;
}

function setSession(user) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ email: user.email, nama: user.nama, role: user.role, loginAt: new Date().toISOString() }));
}

function clearSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function isLoggedIn() {
  return getSession() !== null;
}

// Quick fill demo login helper
function fillDemoLogin(email, password) {
  const emailInput = document.getElementById("login-email");
  const passInput = document.getElementById("login-password");
  const errorEl = document.getElementById("login-error");
  if (emailInput) emailInput.value = email;
  if (passInput) passInput.value = password;
  if (errorEl) errorEl.style.display = "none";
}

// Handle Login
async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById("login-email").value.trim().toLowerCase();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  const errorMsg = document.getElementById("login-error-msg");

  // Show loading state
  const submitBtn = document.getElementById("login-submit-btn");
  const origBtnHtml = submitBtn.innerHTML;
  submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Memverifikasi...`;
  submitBtn.disabled = true;

  try {
    const users = await getRegisteredUsers();
    const matchedUser = users.find(u => u.email.toLowerCase() === email && u.password === password);

    if (!matchedUser) {
      const emailExists = users.find(u => u.email.toLowerCase() === email);
      if (emailExists) {
        errorMsg.textContent = "Password salah. Silakan coba lagi.";
      } else {
        errorMsg.textContent = "Email tidak terdaftar. Hubungi administrator.";
      }
      errorEl.style.display = "flex";
      return;
    }

    // Success
    errorEl.style.display = "none";
    setSession(matchedUser);
    await showApp();
  } catch(e) {
    errorMsg.textContent = "Terjadi kesalahan. Coba lagi.";
    errorEl.style.display = "flex";
    console.error("Login error:", e);
  } finally {
    submitBtn.innerHTML = origBtnHtml;
    submitBtn.disabled = false;
  }
}

// Handle Logout
function handleLogout() {
  if (confirm("Apakah Anda yakin ingin keluar dari aplikasi?")) {
    clearSession();
    hideApp();
  }
}

// Toggle password visibility
function togglePasswordVisibility() {
  const input = document.getElementById("login-password");
  const icon = document.getElementById("password-eye-icon");
  if (input.type === "password") {
    input.type = "text";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  }
}

// Show main app, hide login
async function showApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-sidebar").style.display = "";
  document.querySelector("main").style.display = "";

  // Initialize app
  await initDatabase();
  initTheme();
  initAppMode();
  initRouter();
  updateHeaderProfile();
  updateCloudSyncUI(isCloudMode ? "synced" : "offline");

  // Auto sync contacts from Administrator if this is a teacher account
  const session = getSession();
  if (session && session.role !== "admin" && isCloudMode && supabase) {
    syncAdminContactsToTeacher(db, getCurrentSchoolName(), false).catch(e => console.warn(e));
  }
}

// Hide main app, show login
function hideApp() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("app-sidebar").style.display = "none";
  document.querySelector("main").style.display = "none";

  // Clear form
  document.getElementById("login-email").value = "";
  document.getElementById("login-password").value = "";
  document.getElementById("login-error").style.display = "none";
}

// Initialize App
document.addEventListener("DOMContentLoaded", async () => {
  if (isLoggedIn()) {
    await showApp();
  } else {
    hideApp();
  }
});

// ==========================================
// PWA (PROGRESSIVE WEB APP) & SERVICE WORKER
// ==========================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      console.log("[PWA] ServiceWorker registered with scope:", reg.scope);
    }).catch((err) => {
      console.warn("[PWA] ServiceWorker registration error:", err);
    });
  });
}

let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const pwaBtn = document.getElementById("btn-pwa-install");
  if (pwaBtn) pwaBtn.style.display = "inline-flex";
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const pwaBtn = document.getElementById("btn-pwa-install");
  if (pwaBtn) pwaBtn.style.display = "none";
  showToast("Aplikasi Sman_Saku berhasil dipasang!");
});

function triggerPwaInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then((choice) => {
      if (choice.outcome === "accepted") {
        console.log("[PWA] User accepted installation prompt");
      }
      deferredInstallPrompt = null;
      const pwaBtn = document.getElementById("btn-pwa-install");
      if (pwaBtn) pwaBtn.style.display = "none";
    });
  } else {
    alert("Untuk memasang aplikasi Sman_Saku di HP:\nBuka menu browser Anda (titik tiga di kanan atas) lalu pilih 'Tambahkan ke Layar Utama' atau 'Install Aplikasi'.");
  }
}

// Get Database Key based on email session
function getDbKey() {
  const session = getSession();
  if (session && session.email) {
    return "saku_guru_db_" + session.email.toLowerCase().replace(/[^a-z0-9]/g, "_");
  }
  return "saku_guru_db_guest";
}

// Sanitasi data warisan / sampah dari aplikasi duplikat sebelumnya
function cleanupLegacyDuplicateData(targetDb) {
  if (!targetDb || typeof targetDb !== 'object') return false;
  let modified = false;

  // 1. Bersihkan guruProfile dari data dummy aplikasi duplikat
  if (targetDb.guruProfile) {
    if (targetDb.guruProfile.sekolah === "SMA Negeri 1 Jakarta") {
      targetDb.guruProfile.sekolah = "SMA Negeri 1 Lasolo";
      modified = true;
    }
    if (targetDb.guruProfile.alamat === "Jl. Budi Utomo No. 7, Jakarta Pusat") {
      targetDb.guruProfile.alamat = "Konawe Utara, Sulawesi Tenggara";
      modified = true;
    }
    if (targetDb.guruProfile.kepalaSekolah === "Drs. H. Ahmad Fauzi, M.Pd.") {
      targetDb.guruProfile.kepalaSekolah = "";
      modified = true;
    }
    if (targetDb.guruProfile.kepalaSekolahNip === "197208151998031002") {
      targetDb.guruProfile.kepalaSekolahNip = "";
      modified = true;
    }
    if (targetDb.guruProfile.nip === "198503112010011003") {
      targetDb.guruProfile.nip = "";
      modified = true;
    }
    if (targetDb.guruProfile.nama === "Budi Santoso, S.Pd.") {
      const session = getSession();
      targetDb.guruProfile.nama = (session && session.nama) ? session.nama : "Guru Pengampu";
      modified = true;
    }
  }

  // 2. Bersihkan kontak sampah sekolah Jakarta (kw-sma-1, kw-smp-1, kw-smp-2)
  if (Array.isArray(targetDb.kontakWali)) {
    const originalLen = targetDb.kontakWali.length;
    targetDb.kontakWali = targetDb.kontakWali.filter(kw => {
      if (kw.id === "kw-sma-1" || kw.id === "kw-smp-1" || kw.id === "kw-smp-2") return false;
      if (kw.sekolah && (kw.sekolah.includes("SMP Negeri 2") || (kw.namaSiswa === "Aditya Pratama" && kw.kelasNama === "X IPA 1"))) return false;
      return true;
    });
    // Ganti tag sekolah Jakarta pada data siswa riil menjadi SMA Negeri 1 Lasolo
    targetDb.kontakWali.forEach(kw => {
      if (kw.sekolah === "SMA Negeri 1 Jakarta") {
        kw.sekolah = "SMA Negeri 1 Lasolo";
        modified = true;
      }
    });
    if (targetDb.kontakWali.length !== originalLen) modified = true;
  }

  // 3. Bersihkan kelas dummy (k-10a, k-10b, k-11a, k-12a) jika data riil sudah ada
  if (Array.isArray(targetDb.kelas)) {
    const hasDummy = targetDb.kelas.some(k => k.id === "k-10a" || k.id === "k-10b");
    const hasReal = targetDb.kelas.some(k => k.id !== "k-10a" && k.id !== "k-10b" && k.id !== "k-11a" && k.id !== "k-12a");
    if (hasDummy && hasReal) {
      targetDb.kelas = targetDb.kelas.filter(k => !["k-10a", "k-10b", "k-11a", "k-12a"].includes(k.id));
      modified = true;
    }
  }

  // 4. Bersihkan siswa dummy (s-1 s/d s-14) jika data siswa riil sudah ada
  if (Array.isArray(targetDb.siswa)) {
    const dummyIds = ["s-1","s-2","s-3","s-4","s-5","s-6","s-7","s-8","s-9","s-10","s-11","s-12","s-13","s-14"];
    const hasDummy = targetDb.siswa.some(s => dummyIds.includes(s.id));
    const hasReal = targetDb.siswa.some(s => !dummyIds.includes(s.id));
    if (hasDummy && hasReal) {
      targetDb.siswa = targetDb.siswa.filter(s => !dummyIds.includes(s.id));
      modified = true;
    }
  }

  // 5. Bersihkan absensi dummy dari kelas k-10a
  if (Array.isArray(targetDb.absensi)) {
    const originalLen = targetDb.absensi.length;
    targetDb.absensi = targetDb.absensi.filter(a => a.kelasId !== "k-10a" && a.kelasId !== "k-10b");
    if (targetDb.absensi.length !== originalLen) modified = true;
  }

  // 6. Bersihkan nilai dummy
  if (Array.isArray(targetDb.nilai)) {
    const dummyStudentIds = ["s-1","s-2","s-3","s-4","s-5"];
    const originalLen = targetDb.nilai.length;
    targetDb.nilai = targetDb.nilai.filter(n => !dummyStudentIds.includes(n.siswaId));
    if (targetDb.nilai.length !== originalLen) modified = true;
  }

  // 7. Bersihkan jurnal dummy
  if (Array.isArray(targetDb.jurnal)) {
    const originalLen = targetDb.jurnal.length;
    targetDb.jurnal = targetDb.jurnal.filter(j => j.kelasId !== "k-10a" && j.id !== "jrn-1" && j.id !== "jrn-2");
    if (targetDb.jurnal.length !== originalLen) modified = true;
  }

  return modified;
}

// Database Initialization
async function initDatabase() {
  // 1. Load local data first as baseline/fallback
  const dbKey = getDbKey();
  const localData = localStorage.getItem(dbKey);
  let localDb = null;
  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      if (parsed && typeof parsed === 'object') {
        // Self-repair local schema
        parsed.guruProfile = parsed.guruProfile || { nama: "Nama Guru, S.Pd.", nip: "" };
        parsed.kelas = parsed.kelas || [];
        parsed.siswa = parsed.siswa || [];
        parsed.absensi = parsed.absensi || [];
        parsed.nilai = parsed.nilai || [];
        parsed.jurnal = parsed.jurnal || [];
        parsed.jadwal = parsed.jadwal || [];
        parsed.mapel = parsed.mapel || ["Matematika", "Fisika", "Kimia", "Biologi", "Bahasa Indonesia", "Bahasa Inggris"];
        parsed.bobotNilai = parsed.bobotNilai || { "Tugas": 30, "UTS": 25, "UAS": 25, "Ulangan Harian": 10, "Nilai Praktek": 10 };
        parsed.kontakWali = parsed.kontakWali || [];
        cleanupLegacyDuplicateData(parsed);
        localDb = parsed;
      }
    } catch (e) {
      console.warn("Error parsing local database as baseline:", e);
    }
  }

  // 2. Try Cloud Mode first
  if (isCloudMode && supabase) {
    try {
      const session = getSession();
      if (!session || !session.email) {
        if (localDb) {
          db = localDb;
        } else {
          await loadSeedData();
        }
        cleanupLegacyDuplicateData(db);
        updateHeaderProfile();
        return;
      }

      const { data, error } = await supabase
        .from("saku_guru_databases")
        .select("data, updated_at")
        .eq("email", session.email.toLowerCase())
        .maybeSingle();

      if (!error) {
        if (data && data.data) {
          const cloudDb = data.data;
          const isCloudValid = cloudDb && typeof cloudDb === 'object';
          
          if (isCloudValid) {
            // Self-repair cloud schema
            cloudDb.guruProfile = cloudDb.guruProfile || { nama: "Nama Guru, S.Pd.", nip: "" };
            cloudDb.kelas = cloudDb.kelas || [];
            cloudDb.siswa = cloudDb.siswa || [];
            cloudDb.absensi = cloudDb.absensi || [];
            cloudDb.nilai = cloudDb.nilai || [];
            cloudDb.jurnal = cloudDb.jurnal || [];
            cloudDb.jadwal = cloudDb.jadwal || [];
            cloudDb.mapel = cloudDb.mapel || ["Matematika", "Fisika", "Kimia", "Biologi", "Bahasa Indonesia", "Bahasa Inggris"];
            cloudDb.bobotNilai = cloudDb.bobotNilai || { "Tugas": 30, "UTS": 25, "UAS": 25, "Ulangan Harian": 10, "Nilai Praktek": 10 };
            cloudDb.kontakWali = cloudDb.kontakWali || [];
            cleanupLegacyDuplicateData(cloudDb);

            if (localDb) {
              // Compare timestamps and demo status
              const localTime = localDb.last_updated ? new Date(localDb.last_updated).getTime() : 0;
              const cloudTimeInDb = cloudDb.last_updated ? new Date(cloudDb.last_updated).getTime() : 0;
              const cloudTimeColumn = data.updated_at ? new Date(data.updated_at).getTime() : 0;
              const cloudTime = Math.max(cloudTimeInDb, cloudTimeColumn);

              // If local database is just demo data but cloud is real user data, sync cloud to local instead
              if (localDb.is_demo && !cloudDb.is_demo) {
                console.log("Local database is demo data but cloud database is real. Syncing cloud to local instead.");
                db = cloudDb;
                cleanupLegacyDuplicateData(db);
                try {
                  localStorage.setItem(dbKey, JSON.stringify(db));
                } catch(e) {
                  console.error("Failed to sync cloud data to localStorage:", e);
                }
                updateHeaderProfile();
                return;
              }

              if (localTime > cloudTime) {
                console.log("Local database is newer than cloud. Syncing local to cloud.");
                db = localDb;
                cleanupLegacyDuplicateData(db);
                await saveDatabase(false); // Upload local to cloud (no new mutation)
                updateHeaderProfile();
                return;
              }
            }
            
            console.log("Cloud database loaded and synchronized to local.");
            db = cloudDb;
            cleanupLegacyDuplicateData(db);
            // Sync to local cache
            try {
              localStorage.setItem(dbKey, JSON.stringify(db));
            } catch(e) {
              console.error("Failed to sync cloud data to localStorage:", e);
            }
            updateHeaderProfile();
            return;
          }
        }
        
        // No cloud record found (or invalid) but query succeeded: sync local to cloud
        if (localDb) {
          console.log("No valid cloud database found, but local database exists. Syncing local to cloud.");
          db = localDb;
          cleanupLegacyDuplicateData(db);
          await saveDatabase(false); // upload baseline only
          updateHeaderProfile();
          return;
        }
        
        // No cloud data, no local data: load seeds
        await loadSeedData();
        cleanupLegacyDuplicateData(db);
        updateHeaderProfile();
        return;
      } else {
        console.warn("Supabase query error, falling back to local database:", error);
        if (localDb) {
          db = localDb;
        } else {
          await loadSeedData();
        }
        cleanupLegacyDuplicateData(db);
        updateHeaderProfile();
        return;
      }
    } catch(e) {
      console.warn("Supabase initDatabase error, falling back to localStorage:", e);
    }
  }

  // 3. Local Mode Fallback (if cloud mode is off or failed)
  if (localDb) {
    db = localDb;
  } else {
    await loadSeedData();
  }
  cleanupLegacyDuplicateData(db);
  updateHeaderProfile();
}

async function loadSeedData() {
  // DEFAULT_SEEDS is defined in data-seed.js
  db = JSON.parse(JSON.stringify(DEFAULT_SEEDS));
  
  // Customize guruProfile name based on session
  const session = getSession();
  if (session && session.nama) {
    db.guruProfile.nama = session.nama;
  }
  
  // Mark database as demo data
  db.is_demo = true;
  
  await saveDatabase(false); // initial load is not a user mutation
  showToast("Data awal (seed data) berhasil dimuat!");
}

async function saveDatabase(isMutation = true) {
  // Strip is_demo flag if user starts modifying data
  if (isMutation && db.is_demo) {
    delete db.is_demo;
  }

  // Add modified timestamp
  db.last_updated = new Date().toISOString();

  // Always save locally as cache
  const dbKey = getDbKey();
  try {
    localStorage.setItem(dbKey, JSON.stringify(db));
  } catch(e) {
    console.error("Failed to save to localStorage:", e);
  }

  // Also save to cloud if available
  if (isCloudMode && supabase) {
    try {
      const session = getSession();
      if (session && session.email) {
        updateCloudSyncUI("syncing");
        const { error } = await supabase.from("saku_guru_databases").upsert(
          { email: session.email.toLowerCase(), data: db, updated_at: new Date().toISOString() },
          { onConflict: "email" }
        );
        if (!error) {
          updateCloudSyncUI("synced");
        } else {
          console.warn("Supabase upsert error:", error);
          updateCloudSyncUI("offline");
        }
      }
    } catch(e) {
      console.warn("Supabase saveDatabase error:", e);
      updateCloudSyncUI("offline");
    }
  }

  updateHeaderProfile();
}

// ==========================================
// REAL-TIME CLOUD SYNC (ANDROID & WEB)
// ==========================================
function updateCloudSyncUI(status) {
  const btn = document.getElementById("btn-cloud-sync");
  const icon = document.getElementById("cloud-sync-icon");
  const text = document.getElementById("cloud-sync-text");
  if (!btn || !icon || !text) return;

  btn.classList.remove("synced", "syncing", "offline");

  if (!isCloudMode) {
    btn.classList.add("offline");
    icon.className = "fas fa-database";
    text.textContent = "Lokal";
    btn.title = "Mode Lokal (Penyimpanan Offline Browser)";
    return;
  }

  if (status === "syncing") {
    btn.classList.add("syncing");
    icon.className = "fas fa-sync fa-spin";
    text.textContent = "Sync...";
    btn.title = "Sedang menyinkronkan data dengan Cloud...";
  } else if (status === "synced") {
    btn.classList.add("synced");
    icon.className = "fas fa-cloud-arrow-up";
    text.textContent = "Cloud Aktif";
    btn.title = "Data tersinkronisasi online antara Web & Android (Klik untuk periksa ulang)";
  } else if (status === "offline") {
    btn.classList.add("offline");
    icon.className = "fas fa-cloud-slash";
    text.textContent = "Offline";
    btn.title = "Tidak ada internet / Gagal terhubung ke Cloud. Data tersimpan lokal.";
  }
}

async function syncWithCloud(notifyUser = false) {
  if (!isCloudMode || !supabase) {
    updateCloudSyncUI("offline");
    if (notifyUser) showToast("Aplikasi berjalan dalam Mode Lokal.");
    return;
  }

  const session = getSession();
  if (!session || !session.email) {
    return;
  }

  updateCloudSyncUI("syncing");
  try {
    const { data, error } = await supabase
      .from("saku_guru_databases")
      .select("data, updated_at")
      .eq("email", session.email.toLowerCase())
      .maybeSingle();

    if (error) {
      console.warn("Cloud sync query error:", error);
      updateCloudSyncUI("offline");
      if (notifyUser) showToast("Gagal terhubung ke Cloud: Periksa koneksi internet.");
      return;
    }

    if (data && data.data) {
      const cloudDb = data.data;
      const localTime = db && db.last_updated ? new Date(db.last_updated).getTime() : 0;
      const cloudTimeInDb = cloudDb.last_updated ? new Date(cloudDb.last_updated).getTime() : 0;
      const cloudTimeColumn = data.updated_at ? new Date(data.updated_at).getTime() : 0;
      const cloudTime = Math.max(cloudTimeInDb, cloudTimeColumn);

      if (cloudTime > localTime) {
        console.log("[Sync] Cloud data is newer. Pulling updates to current device...");
        db = cloudDb;
        const dbKey = getDbKey();
        try {
          localStorage.setItem(dbKey, JSON.stringify(db));
        } catch(e) {}
        updateHeaderProfile();
        
        // Auto sync contacts from Administrator if this is a teacher account
        if (session && session.role !== "admin") {
          await syncAdminContactsToTeacher(db, getCurrentSchoolName(), false);
        }

        // Re-render current active view so user sees newest changes immediately
        const activeNav = document.querySelector(".sidebar-menu li.active");
        const activePage = activeNav ? activeNav.getAttribute("data-page") : "dashboard";
        if (typeof renderPage === "function" && activePage) {
          renderPage(activePage);
        }
        updateCloudSyncUI("synced");
        if (notifyUser) showToast("Data terbaru dari perangkat lain berhasil dimuat!");
        return;
      } else if (localTime > cloudTime) {
        console.log("[Sync] Local data is newer. Pushing to Cloud...");
        await saveDatabase(false);
        updateCloudSyncUI("synced");
        if (notifyUser) showToast("Data berhasil diunggah ke Cloud!");
        return;
      }
    }

    // Auto sync contacts from Administrator if this is a teacher account
    if (session && session.role !== "admin") {
      await syncAdminContactsToTeacher(db, getCurrentSchoolName(), false);
    }

    updateCloudSyncUI("synced");
    if (notifyUser) showToast("Data sudah sinkron antara Web & Android!");
  } catch(e) {
    console.warn("Sync error:", e);
    updateCloudSyncUI("offline");
    if (notifyUser) showToast("Mode Offline: Data tersimpan aman di perangkat.");
  }
}

// Auto sync when user switches tabs or returns to the app
window.addEventListener("focus", () => {
  if (isLoggedIn()) {
    syncWithCloud(false);
  }
});

// Auto sync when network is restored
window.addEventListener("online", () => {
  updateCloudSyncUI("synced");
  if (isLoggedIn()) {
    syncWithCloud(true);
  }
});

window.addEventListener("offline", () => {
  updateCloudSyncUI("offline");
});

async function resetDatabase() {
  db = {
    guruProfile: {
      nama: "Nama Guru, S.Pd.",
      nip: "198000000000000000",
      sekolah: "Nama Sekolah",
      mapel: "Mata Pelajaran",
      alamat: "Alamat Sekolah",
      kepalaSekolah: "Nama Kepala Sekolah",
      kepalaSekolahNip: "197000000000000000",
      foto: null,
      logo: null
    },
    kelas: [],
    siswa: [],
    mapel: ["Matematika", "Fisika", "Kimia", "Biologi", "Bahasa Indonesia", "Bahasa Inggris"],
    jadwal: [],
    absensi: [],
    nilai: [],
    jurnal: [],
    bobotNilai: { "Tugas": 30, "UTS": 25, "UAS": 25, "Ulangan Harian": 10, "Nilai Praktek": 10 }
  };
  await saveDatabase();
  showToast("Database berhasil dikosongkan!");
}

// Update Header Profile
function updateHeaderProfile() {
  if (db.guruProfile) {
    const modeBadge = isCloudMode 
      ? `<span class="badge badge-hadir" style="padding: 2px 6px; font-size: 0.65rem; font-weight: 700; margin-left: 6px; display: inline-flex; align-items: center; gap: 4px; vertical-align: middle;"><i class="fas fa-cloud"></i> Cloud</span>`
      : `<span class="badge badge-izin" style="padding: 2px 6px; font-size: 0.65rem; font-weight: 700; margin-left: 6px; display: inline-flex; align-items: center; gap: 4px; vertical-align: middle;"><i class="fas fa-database"></i> Lokal</span>`;

    document.getElementById("header-guru-name").innerHTML = db.guruProfile.nama + modeBadge;
    document.getElementById("header-guru-nip").textContent = `NIP: ${db.guruProfile.nip || '-'}`;
    
    const avatarEl = document.getElementById("header-avatar");
    if (db.guruProfile.foto) {
      avatarEl.innerHTML = `<img src="${db.guruProfile.foto}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      avatarEl.style.padding = "0";
    } else {
      // Create avatar from initials
      const initials = db.guruProfile.nama
        ? db.guruProfile.nama.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()
        : "G";
      avatarEl.textContent = initials;
      avatarEl.style.padding = "";
    }
  }
}

// Routing & Navigation
function initRouter() {
  // Listen to hash changes
  window.addEventListener("hashchange", handleHashChange);
  
  // Initial routing
  handleHashChange();
}

function handleHashChange() {
  const hash = window.location.hash.substring(1) || "dashboard";
  navigate(hash);
}

function navigate(pageId) {
  // Update sidebar active state
  const menuItems = document.querySelectorAll(".sidebar-menu li");
  menuItems.forEach(item => {
    if (item.getAttribute("data-page") === pageId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Render view
  renderPage(pageId);
  
  // Scroll to top
  window.scrollTo(0, 0);

  // Close sidebar on mobile if it is open
  const sidebar = document.getElementById("app-sidebar");
  if (sidebar.classList.contains("show")) {
    sidebar.classList.remove("show");
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById("app-sidebar");
  sidebar.classList.toggle("show");
}

// Theme & Color Palette Management
const THEME_PALETTES = [
  { id: "royal-blue", name: "Royal Indigo", tag: "Modern Edu (Rekomendasi)", color: "#2563eb", icon: "fa-crown" },
  { id: "emerald-teal", name: "Emerald & Mint", tag: "Fresh Academic", color: "#059669", icon: "fa-leaf" },
  { id: "violet-modern", name: "Deep Violet", tag: "Creative Tech", color: "#7c3aed", icon: "fa-wand-magic-sparkles" },
  { id: "amber-prestige", name: "Amber & Navy", tag: "Klasik Prestisius", color: "#d97706", icon: "fa-gem" },
  { id: "slate-carbon", name: "Slate & Carbon", tag: "Minimalis Monokrom", color: "#475569", icon: "fa-circle-half-stroke" }
];

function getPaletteDisplayName(id) {
  const p = THEME_PALETTES.find(item => item.id === id);
  return p ? p.name : "Deep Violet";
}

function initTheme() {
  const savedTheme = localStorage.getItem("saku_guru_theme") || "light";
  const savedPalette = localStorage.getItem("saku_guru_palette") || "violet-modern";
  document.documentElement.setAttribute("data-theme", savedTheme);
  document.documentElement.setAttribute("data-palette", savedPalette);
  updateThemeIcon(savedTheme);
}

function setThemeMode(mode) {
  document.documentElement.setAttribute("data-theme", mode);
  localStorage.setItem("saku_guru_theme", mode);
  updateThemeIcon(mode);
  showToast(`Mode ${mode === 'dark' ? 'Gelap' : 'Terang'} diaktifkan!`);
  document.querySelectorAll('.theme-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
  });
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  setThemeMode(newTheme);
}

function setPalette(paletteId) {
  document.documentElement.setAttribute("data-palette", paletteId);
  localStorage.setItem("saku_guru_palette", paletteId);
  showToast(`Tema '${getPaletteDisplayName(paletteId)}' aktif!`);
  
  document.querySelectorAll('.palette-card').forEach(card => {
    card.classList.toggle('active', card.getAttribute('data-palette') === paletteId);
  });
  const badge = document.getElementById('active-palette-badge');
  if (badge) badge.textContent = `Aktif: ${getPaletteDisplayName(paletteId)}`;
}

function updateThemeIcon(theme) {
  const icon = document.getElementById("theme-icon");
  if (icon) {
    if (theme === "dark") {
      icon.className = "fas fa-sun";
    } else {
      icon.className = "fas fa-moon";
    }
  }
}

// Toast System
function showToast(message) {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toast-message");
  toastMessage.textContent = message;
  toast.style.display = "flex";
  
  // Fade in animation simple
  toast.style.opacity = "0";
  setTimeout(() => {
    toast.style.transition = "opacity 0.3s ease";
    toast.style.opacity = "1";
  }, 10);
  
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => {
      toast.style.display = "none";
    }, 300);
  }, 3000);
}

// Reusable Modal Methods
function openModal(title, bodyHtml, footerHtml = "", isLarge = false) {
  const modal = document.getElementById("app-modal");
  if (!modal) return;
  const modalContent = modal.querySelector(".modal-content");
  if (modalContent) {
    if (isLarge) {
      modalContent.classList.add("modal-lg");
    } else {
      modalContent.classList.remove("modal-lg");
    }
  }
  const titleEl = document.getElementById("modal-title");
  if (titleEl) titleEl.textContent = title;
  const bodyEl = document.getElementById("modal-body");
  if (bodyEl) bodyEl.innerHTML = bodyHtml;
  
  const footerEl = document.getElementById("modal-footer");
  if (footerEl) {
    footerEl.innerHTML = footerHtml || "";
    footerEl.style.display = (footerHtml && footerHtml.trim().length > 0) ? "flex" : "none";
  }
  
  modal.classList.add("show");
}

function showModal(title, bodyHtml, footerHtml = "", isLarge = false) {
  openModal(title, bodyHtml, footerHtml, isLarge);
}

function closeModal() {
  const modal = document.getElementById("app-modal");
  modal.classList.remove("show");
  const modalContent = modal.querySelector(".modal-content");
  if (modalContent) {
    modalContent.classList.remove("modal-lg");
  }
}

// Modal Form Submit Handlers
// (These are triggered by buttons in the modals)

// RENDER PAGES
function renderPage(pageId) {
  const container = document.getElementById("content-container");
  const titleEl = document.getElementById("view-title");
  const subtitleEl = document.getElementById("view-subtitle");
  
  switch(pageId) {
    case "dashboard":
      if (currentAppMode === "walikelas") {
        titleEl.textContent = "Dashboard Wali Kelas";
        subtitleEl.textContent = "Rekapitulasi presensi final, radar siswa bermasalah, dan komunikasi wali murid.";
        renderDashboardWaliKelas(container);
      } else if (currentAppMode === "guruwali") {
        titleEl.textContent = "Dashboard Guru Wali";
        subtitleEl.textContent = "Pendampingan siswa asuhan, catatan bimbingan konseling, dan pemantauan karakter.";
        renderDashboardGuruWali(container);
      } else {
        titleEl.textContent = "Dashboard";
        subtitleEl.textContent = "Ringkasan aktivitas dan administrasi Anda hari ini.";
        renderDashboard(container);
      }
      break;
    case "rekap_final":
      titleEl.textContent = "Rekap Presensi Final Kelas";
      subtitleEl.textContent = "Rekapan presensi gabungan dari seluruh guru mata pelajaran.";
      renderRekapFinalWaliKelas(container);
      break;
    case "siswa_kelas":
      titleEl.textContent = "Siswa Kelas Binaan";
      subtitleEl.textContent = "Daftar siswa dan kontak orang tua kelas binaan Anda.";
      renderSiswaKelasWaliKelas(container);
      break;
    case "ledger_nilai":
      titleEl.textContent = "Ledger Nilai Multi-Mapel";
      subtitleEl.textContent = "Pantau nilai siswa kelas binaan di seluruh mata pelajaran.";
      renderLedgerNilaiWaliKelas(container);
      break;
    case "catatan_wali":
      titleEl.textContent = "Buku Catatan Pembinaan Siswa";
      subtitleEl.textContent = "Catatan kasus, pembinaan karakter, dan tindak lanjut orang tua.";
      renderCatatanWaliKelas(container);
      break;
    case "siswa_asuhan":
      titleEl.textContent = "Daftar Siswa Asuhan";
      subtitleEl.textContent = "Daftar seluruh anak bimbingan/mentee Anda yang aktif didampingi.";
      renderDaftarSiswaAsuhanGuruWali(container);
      break;
    case "tambah_siswa_asuhan":
      titleEl.textContent = "Tambah Siswa Asuhan";
      subtitleEl.textContent = "Daftar nama siswa dari seluruh kelas yang dapat ditambahkan menjadi anak asuhan.";
      renderTambahSiswaAsuhanGuruWali(container);
      break;
    case "jurnal_bimbingan":
      titleEl.textContent = "Jurnal Bimbingan & Konseling";
      subtitleEl.textContent = "Catatan pendampingan perkembangan siswa asuhan.";
      renderJurnalBimbinganGuruWali(container);
      break;
    case "pantauan_absensi":
      titleEl.textContent = "Pantauan Presensi Siswa Asuhan";
      subtitleEl.textContent = "Riwayat kehadiran anak asuhan dari jam pelajaran guru mapel.";
      renderPantauanAbsensiGuruWali(container);
      break;
    case "kelas":
      titleEl.textContent = "Data Kelas";
      subtitleEl.textContent = "Kelola daftar kelas dan wali kelas.";
      renderKelas(container);
      break;
    case "siswa":
      titleEl.textContent = "Data Siswa";
      subtitleEl.textContent = "Daftar siswa, pencarian, dan filter per kelas.";
      renderSiswa(container);
      break;
    case "kontak":
      titleEl.textContent = "Kontak Orang Tua / Wali";
      subtitleEl.textContent = "Cari nomor HP orang tua/wali dan hubungi via WhatsApp atau Telepon.";
      renderKontak(container);
      break;
    case "jadwal":
      titleEl.textContent = "Jadwal Mengajar";
      subtitleEl.textContent = "Jadwal mengajar mingguan Anda.";
      renderJadwal(container);
      break;
    case "absensi":
      titleEl.textContent = "Absensi Siswa";
      subtitleEl.textContent = "Input dan kelola absensi harian kelas.";
      renderAbsensi(container);
      break;
    case "nilai":
      titleEl.textContent = "Nilai Siswa";
      subtitleEl.textContent = "Input dan kelola nilai tugas, UTS, dan UAS.";
      renderNilai(container);
      break;
    case "jurnal":
      titleEl.textContent = "Jurnal Mengajar";
      subtitleEl.textContent = "Catatan aktivitas harian proses belajar mengajar.";
      renderJurnal(container);
      break;
    case "rekap":
      titleEl.textContent = "Rekap & Cetak";
      subtitleEl.textContent = "Ekspor laporan rekapitulasi ke Excel (CSV) atau cetak PDF.";
      renderRekap(container);
      break;
    case "profil":
      titleEl.textContent = "Profil";
      subtitleEl.textContent = "Ubah profil guru, sekolah, dan atur database.";
      renderProfil(container);
      break;
    default:
      container.innerHTML = `<div class="card"><h2>Halaman tidak ditemukan</h2></div>`;
  }
}

// ------------------------------------------
// 1. DASHBOARD VIEW RENDER
// ------------------------------------------
function renderDashboard(container) {
  // Calculations
  const totalKelas = db.kelas.length;
  const totalSiswa = db.siswa.length;
  
  // Attendance calculations for today or latest day
  const todayStr = getLocalDateString();
  const todayAbsensi = db.absensi.filter(a => a.tanggal === todayStr);
  let attendanceRate = 0;
  if (todayAbsensi.length > 0) {
    const present = todayAbsensi.filter(a => a.status === "Hadir" || a.status === "Terlambat").length;
    attendanceRate = Math.round((present / todayAbsensi.length) * 100);
  } else {
    // Fallback to average rate overall
    const allDates = [...new Set(db.absensi.map(a => a.tanggal))];
    if (allDates.length > 0) {
      let totalRateSum = 0;
      allDates.forEach(d => {
        const dayAbs = db.absensi.filter(a => a.tanggal === d);
        const present = dayAbs.filter(a => a.status === "Hadir" || a.status === "Terlambat").length;
        totalRateSum += (present / dayAbs.length);
      });
      attendanceRate = Math.round((totalRateSum / allDates.length) * 100);
    }
  }

  const totalJurnal = db.jurnal.length;

  container.innerHTML = `
    <!-- Welcome Banner -->
    <div class="welcome-banner">
      <h2>Selamat Datang di Sman_Saku!</h2>
      <p>Aplikasi administrasi guru dalam satu genggaman. Kelola jadwal kelas, pantau kehadiran dan nilai siswa secara instan, serta catat jurnal mengajar harian Anda dengan mudah.</p>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-info">
          <h3>Total Kelas</h3>
          <div class="stat-value">${totalKelas}</div>
        </div>
        <div class="stat-icon"><i class="fas fa-school"></i></div>
      </div>
      
      <div class="stat-card">
        <div class="stat-info">
          <h3>Total Siswa</h3>
          <div class="stat-value">${totalSiswa}</div>
        </div>
        <div class="stat-icon"><i class="fas fa-user-graduate"></i></div>
      </div>
      
      <div class="stat-card">
        <div class="stat-info">
          <h3>Rata-rata Kehadiran</h3>
          <div class="stat-value">${attendanceRate}%</div>
        </div>
        <div class="stat-icon"><i class="fas fa-clipboard-user"></i></div>
      </div>
      
      <div class="stat-card">
        <div class="stat-info">
          <h3>Jurnal Mengajar</h3>
          <div class="stat-value">${totalJurnal}</div>
        </div>
        <div class="stat-icon"><i class="fas fa-book-open"></i></div>
      </div>
    </div>

    <!-- PUSAT TINDAK LANJUT KEHADIRAN SISWA -->
    <div id="dashboard-tindak-lanjut-section" class="tl-container"></div>

    <!-- Detail Dashboard grid -->
    <div class="dashboard-details">
      <!-- Left side: Attendance Chart & Upcoming schedule -->
      <div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Statistik Kehadiran Mingguan (%)</h3>
            <span class="badge badge-hadir">Terupdate</span>
          </div>
          <div class="chart-container" id="attendance-chart-wrapper">
            <!-- SVG Chart will be injected here -->
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Jadwal Mengajar Terdekat</h3>
            <a href="#jadwal" class="btn btn-secondary btn-sm"><i class="fas fa-external-link-alt"></i> Lihat Semua</a>
          </div>
          <div class="table-responsive">
            <table id="upcoming-schedule-table">
              <thead>
                <tr>
                  <th>Hari</th>
                  <th>Jam</th>
                  <th>Kelas</th>
                  <th>Mata Pelajaran</th>
                </tr>
              </thead>
              <tbody>
                <!-- Injected schedules -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Right side: Quick Shortcuts -->
      <div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Akses Cepat</h3>
          </div>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <button class="btn btn-secondary" style="justify-content: center; width: 100%; color: #2563eb; border-color: #2563eb; font-weight: 600;" onclick="showSyncMasterSekolahModal()">
              <i class="fas fa-cloud-arrow-down"></i> Sinkron Data Sekolah (Spreadsheet)
            </button>
            <a href="#absensi" class="btn btn-primary" style="justify-content: center; width: 100%;">
              <i class="fas fa-clipboard-user"></i> Isi Absensi Kelas
            </a>
            <a href="#nilai" class="btn btn-secondary" style="justify-content: center; width: 100%;">
              <i class="fas fa-award"></i> Input Nilai Siswa
            </a>
            <a href="#jurnal" class="btn btn-secondary" style="justify-content: center; width: 100%;">
              <i class="fas fa-book"></i> Buat Jurnal Baru
            </a>
            <a href="#rekap" class="btn btn-secondary" style="justify-content: center; width: 100%;">
              <i class="fas fa-print"></i> Rekap Laporan & Cetak
            </a>
          </div>
        </div>
        
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Info Aplikasi</h3>
          </div>
          <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.6;">
            <p><strong>Nama Guru:</strong> ${db.guruProfile.nama}</p>
            <p><strong>Sekolah:</strong> ${db.guruProfile.sekolah}</p>
            <p><strong>Mata Pelajaran Utama:</strong> ${db.guruProfile.mapel}</p>
            <hr style="margin: 10px 0; border: none; border-top: 1px solid var(--border-color);">
            <p>Database tersimpan lokal di browser Anda (LocalStorage).</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // Render Student Attendance Intervention Panel
  renderDashboardIntervention();

  // Draw SVG Chart
  drawAttendanceChart();

  // Populate Upcoming schedule
  populateUpcomingSchedule();
}

// ----------------------------------------------------
// SCHOOL NORMALIZATION & MATCHING HELPERS
// ----------------------------------------------------
function normalizeSchoolName(name) {
  if (!name || typeof name !== "string") return "";
  return name.toLowerCase()
    .replace(/[.,\-_/()]/g, ' ')
    .replace(/\bsma\s*negeri\b/g, 'sman')
    .replace(/\bsmp\s*negeri\b/g, 'smpn')
    .replace(/\bsd\s*negeri\b/g, 'sdn')
    .replace(/\bsmk\s*negeri\b/g, 'smkn')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSameSchool(schoolA, schoolB) {
  if (!schoolA || !schoolB) return false;
  const normA = normalizeSchoolName(schoolA);
  const normB = normalizeSchoolName(schoolB);
  if (!normA || !normB) return false;
  if (normA === "nama sekolah" || normB === "nama sekolah") return false;
  return normA === normB || normA.includes(normB) || normB.includes(normA);
}

function isSameNisn(nisnA, nisnB) {
  if (!nisnA || !nisnB) return false;
  const a = String(nisnA).trim().replace(/\D/g, '');
  const b = String(nisnB).trim().replace(/\D/g, '');
  if (!a || !b || a === '-' || b === '-') return false;
  if (a === b) return true;
  if (a.replace(/^0+/, '') === b.replace(/^0+/, '')) return true;
  return false;
}

// ----------------------------------------------------
// PUSAT TINDAK LANJUT KEHADIRAN SISWA (INTERVENTION)
// ----------------------------------------------------
function getStudentParentContact(studentOrId) {
  const student = (typeof studentOrId === 'object' && studentOrId !== null)
    ? studentOrId
    : (db.siswa || []).find(x => x.id === studentOrId);
  if (!student) return {
    student: null,
    namaWali: "Orang Tua / Wali",
    hubungan: "Orang Tua",
    noHp: "",
    cleanPhone: "",
    catatan: "",
    hasPhone: false
  };
  const userSchool = getCurrentSchoolName();

  // 1. Cari di db.kontakWali yang terisolasi sesuai sekolah
  let kw = (db.kontakWali || []).find(k => {
    if (!isSameSchool(k.sekolah || userSchool, userSchool)) return false;
    if (student.nisn && isSameNisn(student.nisn, k.nisn)) {
      return true;
    }
    return k.namaSiswa && student.nama && 
      k.namaSiswa.trim().toLowerCase() === student.nama.trim().toLowerCase();
  });

  const namaWali = kw ? kw.namaWali : (student.namaWali || "");
  const hubungan = kw ? kw.hubungan : (student.hubungan || "Orang Tua");
  const noHp = kw ? kw.noHp : (student.noHp || "");
  const catatan = kw ? kw.catatan : (student.catatan || "");
  
  let cleanPhone = "";
  if (noHp && !/[a-zA-Z]/.test(String(noHp))) {
    const digits = String(noHp).replace(/\D/g, '');
    if (digits.length >= 7) {
      cleanPhone = formatPhoneNumber(noHp);
    }
  }

  return {
    student,
    namaWali: (namaWali && namaWali !== "-") ? namaWali : "Orang Tua / Wali",
    hubungan: hubungan || "Orang Tua",
    noHp: noHp || "",
    cleanPhone: cleanPhone,
    catatan: catatan || "",
    hasPhone: Boolean(cleanPhone && cleanPhone.length >= 7)
  };
}

function renderDashboardIntervention(targetDate = null) {
  const container = document.getElementById("dashboard-tindak-lanjut-section");
  if (!container) return;

  const todayStr = getLocalDateString();
  const mode = typeof currentAppMode !== "undefined" ? currentAppMode : "mapel";

  // Identifikasi siswa yang diampu sesuai mode peran
  let scopedStudentIds = null;
  let activeKelasObj = null;

  if (mode === "walikelas") {
    const classId = getWaliKelasClassId();
    activeKelasObj = (db.kelas || []).find(k => k.id === classId) || { nama: "Kelas", tingkat: "-" };
    const classStudents = (db.siswa || []).filter(s => s.kelasId === classId);
    scopedStudentIds = classStudents.map(s => s.id);
  } else if (mode === "guruwali") {
    const asuhanList = getSiswaAsuhanList();
    scopedStudentIds = asuhanList.map(s => s.id);
  }

  // Tanggal default
  let dateToUse = targetDate || (mode === "walikelas" ? currentWaliKelasDate : window.activeDashboardInterventionDate);
  if (!dateToUse) {
    const dayHasRecords = (db.absensi || []).some(a => {
      if (a.tanggal !== todayStr) return false;
      if (scopedStudentIds) return scopedStudentIds.includes(a.siswaId);
      return true;
    });

    if (dayHasRecords) {
      dateToUse = todayStr;
    } else {
      // Cari tanggal terbaru dengan catatan masalah kehadiran
      const datesWithIssues = [...new Set((db.absensi || [])
        .filter(a => {
          if (!["Alpa", "Bolos", "Terlambat", "Sakit", "Izin"].includes(a.status)) return false;
          if (scopedStudentIds) return scopedStudentIds.includes(a.siswaId);
          return true;
        })
        .map(a => a.tanggal))].sort().reverse();

      dateToUse = datesWithIssues.length > 0 ? datesWithIssues[0] : todayStr;
    }
  }

  window.activeDashboardInterventionDate = dateToUse;
  if (mode === "walikelas") {
    currentWaliKelasDate = dateToUse;
    const dateInput = document.getElementById("walikelas-date-input");
    if (dateInput) dateInput.value = dateToUse;
  }
  const activeFilter = window.activeInterventionFilter || 'all';

  // Ambil data absensi pada tanggal tersebut
  let dayRecords = (db.absensi || []).filter(a => a.tanggal === dateToUse);
  if (scopedStudentIds) {
    dayRecords = dayRecords.filter(a => scopedStudentIds.includes(a.siswaId));
  }

  // Filter siswa yang bermasalah (Alpa, Bolos, Terlambat, Sakit, Izin)
  const allIssues = dayRecords.filter(a => ["Alpa", "Bolos", "Terlambat", "Sakit", "Izin"].includes(a.status));

  // Urutkan prioritas: Alpa (1), Bolos (2), Terlambat (3), Sakit (4), Izin (5)
  const priorityOrder = { "Alpa": 1, "Bolos": 2, "Terlambat": 3, "Sakit": 4, "Izin": 5 };
  allIssues.sort((a, b) => (priorityOrder[a.status] || 99) - (priorityOrder[b.status] || 99));

  // Hitung jumlah masing-masing kategori
  const alpaCount = allIssues.filter(a => a.status === "Alpa").length;
  const bolosCount = allIssues.filter(a => a.status === "Bolos").length;
  const terlambatCount = allIssues.filter(a => a.status === "Terlambat").length;
  const sakitIzinCount = allIssues.filter(a => a.status === "Sakit" || a.status === "Izin").length;
  const confirmedCount = allIssues.filter(a => a.followUp && a.followUp.status === "sudah").length;
  const pendingCount = allIssues.length - confirmedCount;

  // Filter sesuai tab aktif
  let filteredIssues = allIssues;
  if (activeFilter === 'alpa') filteredIssues = allIssues.filter(a => a.status === "Alpa");
  else if (activeFilter === 'bolos') filteredIssues = allIssues.filter(a => a.status === "Bolos");
  else if (activeFilter === 'terlambat') filteredIssues = allIssues.filter(a => a.status === "Terlambat");
  else if (activeFilter === 'sakit_izin') filteredIssues = allIssues.filter(a => a.status === "Sakit" || a.status === "Izin");
  else if (activeFilter === 'belum') filteredIssues = allIssues.filter(a => !a.followUp || a.followUp.status !== "sudah");
  else if (activeFilter === 'sudah') filteredIssues = allIssues.filter(a => a.followUp && a.followUp.status === "sudah");

  // Cari tanggal-tanggal lain yang memiliki catatan masalah absensi
  const otherDatesWithIssues = [...new Set((db.absensi || [])
    .filter(a => {
      if (a.tanggal === dateToUse) return false;
      if (!["Alpa", "Bolos", "Terlambat", "Sakit", "Izin"].includes(a.status)) return false;
      if (scopedStudentIds) return scopedStudentIds.includes(a.siswaId);
      return true;
    })
    .map(a => a.tanggal))].sort().reverse();
  const latestOtherDate = otherDatesWithIssues.length > 0 ? otherDatesWithIssues[0] : null;

  // Header teks dinamis sesuai peran
  let headerTitleHtml = "";
  let headerSubtitle = "";
  let headerBadgeHtml = "";

  if (mode === "walikelas") {
    const kNama = activeKelasObj ? activeKelasObj.nama : "Kelas";
    headerTitleHtml = `
      <i class="fas fa-clipboard-check" style="color: #10b981;"></i>
      Laporan Tindak Lanjut Kehadiran Siswa (Kelas ${kNama})
    `;
    headerSubtitle = `Laporan kehadiran siswa binaan bermasalah (Alpa, Bolos, Terlambat, Sakit, Izin) dari seluruh guru mata pelajaran yang perlu dikonfirmasi & ditindaklanjuti wali kelas.`;
    headerBadgeHtml = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.78rem;"><i class="fas fa-chalkboard-user"></i> Sumber: Rekap Guru Mapel</span>`;
  } else if (mode === "guruwali") {
    headerTitleHtml = `
      <i class="fas fa-hand-holding-heart" style="color: #7c3aed;"></i>
      Laporan Tindak Lanjut Kehadiran Siswa Asuhan
    `;
    headerSubtitle = `Laporan ketidakhadiran anak asuhan Anda dari guru mata pelajaran di berbagai kelas untuk pemantauan karakter dan bimbingan konseling.`;
    headerBadgeHtml = `<span class="badge" style="background: rgba(124, 58, 237, 0.15); color: #7c3aed; border: 1px solid rgba(124, 58, 237, 0.3); font-size: 0.78rem;"><i class="fas fa-chalkboard-user"></i> Sumber: Rekap Guru Mapel Lintas Kelas</span>`;
  } else {
    headerTitleHtml = `
      <i class="fas fa-user-clock" style="color: #ef4444;"></i>
      Tindak Lanjut Kehadiran Siswa
    `;
    headerSubtitle = `Daftar siswa dengan catatan absensi, bolos, atau terlambat yang perlu segera dihubungi dan dikonfirmasi ke orang tua/wali.`;
    headerBadgeHtml = ``;
  }

  // Bangun HTML Card
  let bodyContentHtml = "";

  if (dayRecords.length === 0) {
    let emptyMsg = "";
    if (mode === "walikelas") {
      emptyMsg = `Belum ada data presensi yang dikirimkan oleh guru mata pelajaran untuk siswa kelas ${activeKelasObj ? activeKelasObj.nama : ''} pada tanggal ${formatDateIndo(dateToUse)}.`;
    } else if (mode === "guruwali") {
      emptyMsg = (scopedStudentIds && scopedStudentIds.length === 0) 
        ? "Anda belum menentukan siswa asuhan. Silakan tentukan siswa di menu Kelola Siswa Asuhan."
        : `Belum ada data presensi yang dikirimkan oleh guru mata pelajaran untuk siswa asuhan Anda pada tanggal ${formatDateIndo(dateToUse)}.`;
    } else {
      emptyMsg = (dateToUse === todayStr) ? 'Silakan isi absensi kelas hari ini untuk memantau siswa yang memerlukan konfirmasi kehadiran.' : 'Tidak ditemukan rekaman absensi pada tanggal yang dipilih.';
    }

    bodyContentHtml = `
      <div style="background: rgba(59, 130, 246, 0.05); border: 2px dashed rgba(59, 130, 246, 0.3); border-radius: 12px; padding: 24px 16px; text-align: center;">
        <i class="fas fa-clipboard-list" style="font-size: 2.2rem; color: var(--primary); margin-bottom: 10px;"></i>
        <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">
          Belum Ada Laporan Presensi pada Tanggal ${formatDateIndo(dateToUse)}
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 6px auto 16px auto; max-width: 480px; line-height: 1.5;">
          ${emptyMsg}
        </p>
        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
          ${latestOtherDate ? `
            <button class="btn btn-secondary btn-sm" onclick="changeDashboardInterventionDate('${latestOtherDate}')">
              <i class="fas fa-history"></i> Buka Catatan ${formatDateIndo(latestOtherDate)}
            </button>
          ` : ''}
          ${dateToUse !== todayStr ? `
            <button class="btn btn-secondary btn-sm" onclick="changeDashboardInterventionDate('${todayStr}')">
              <i class="fas fa-calendar-day"></i> Kembali ke Hari Ini
            </button>
          ` : ''}
        </div>
      </div>
    `;
  } else if (allIssues.length === 0) {
    let completeMsg = "";
    if (mode === "walikelas") {
      completeMsg = `Luar Biasa! Seluruh siswa kelas ${activeKelasObj ? activeKelasObj.nama : ''} hadir lengkap pada semua sesi jam mata pelajaran. Tidak ada laporan kendala kehadiran pada tanggal ${formatDateIndo(dateToUse)}.`;
    } else if (mode === "guruwali") {
      completeMsg = `Seluruh siswa asuhan Anda terpantau aman dan hadir lengkap pada seluruh mata pelajaran hari ini (${formatDateIndo(dateToUse)}).`;
    } else {
      completeMsg = `Tidak ada catatan Alpa, Bolos, atau Terlambat pada tanggal ${formatDateIndo(dateToUse)}.`;
    }

    bodyContentHtml = `
      <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 22px 16px; text-align: center;">
        <i class="fas fa-check-circle" style="font-size: 2.4rem; color: #10b981; margin-bottom: 8px;"></i>
        <div style="font-weight: 700; color: #10b981; font-size: 1.05rem;">
          Luar Biasa! Semua Siswa Hadir Lengkap
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 4px 0 0 0;">
          ${completeMsg}
        </p>
        ${dateToUse !== todayStr ? `
          <button class="btn btn-secondary btn-sm" onclick="changeDashboardInterventionDate('${todayStr}')" style="margin-top: 12px;">
            <i class="fas fa-calendar-day"></i> Lihat Hari Ini (${formatDateIndo(todayStr)})
          </button>
        ` : ''}
      </div>
    `;
  } else if (filteredIssues.length === 0) {
    bodyContentHtml = `
      <div style="background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.88rem;">
        <i class="fas fa-filter" style="margin-right: 6px;"></i> Tidak ada siswa dengan kriteria filter ini.
        <div style="margin-top: 8px;">
          <button class="btn btn-secondary btn-sm" onclick="setInterventionFilter('all')">Tampilkan Semua Masalah (${allIssues.length})</button>
        </div>
      </div>
    `;
  } else {
    const itemsHtml = filteredIssues.map(a => {
      const s = (db.siswa || []).find(x => x.id === a.siswaId) || { nama: "Siswa Tidak Ditemukan", nisn: "-", id: a.siswaId };
      const k = (db.kelas || []).find(x => x.id === (a.kelasId || s.kelasId)) || { nama: "Kelas -" };
      const contact = getStudentParentContact(s.id);

      let statusBadge = "";
      let statusClass = "status-" + a.status.toLowerCase();
      let avatarBg = "#ef4444";

      if (a.status === "Alpa") {
        statusBadge = `<span class="badge badge-alpa"><i class="fas fa-times-circle"></i> Alpa / Absen</span>`;
        avatarBg = "#ef4444";
      } else if (a.status === "Bolos") {
        statusBadge = `<span class="badge badge-bolos"><i class="fas fa-walking"></i> Membolos</span>`;
        avatarBg = "#8b5cf6";
      } else if (a.status === "Terlambat") {
        statusBadge = `<span class="badge badge-terlambat"><i class="fas fa-clock"></i> Terlambat</span>`;
        avatarBg = "#f59e0b";
      } else if (a.status === "Sakit") {
        statusBadge = `<span class="badge badge-sakit"><i class="fas fa-heartbeat"></i> Sakit</span>`;
        avatarBg = "#06b6d4";
      } else if (a.status === "Izin") {
        statusBadge = `<span class="badge badge-izin"><i class="fas fa-envelope-open-text"></i> Izin</span>`;
        avatarBg = "#3b82f6";
      }

      const isConfirmed = a.followUp && a.followUp.status === "sudah";
      const followUpBadge = isConfirmed
        ? `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid #10b981;" title="${a.followUp.catatan || ''}">
             <i class="fas fa-check-double"></i> Terkonfirmasi (${a.followUp.metode || 'WA'} ${a.followUp.waktu ? a.followUp.waktu : ''})
           </span>`
        : `<span class="badge" style="background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);">
             <i class="fas fa-bell"></i> Butuh Tindak Lanjut
           </span>`;

      const initials = s.nama.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();

      let guardianInfoHtml = "";
      if (contact && contact.hasPhone) {
        guardianInfoHtml = `
          <div class="tl-guardian-info">
            <span><i class="fas fa-user-shield" style="color: var(--primary);"></i> <b>${contact.namaWali}</b> (${contact.hubungan})</span>
            <span><i class="fas fa-phone-alt" style="color: #10b981;"></i> <b style="font-family: monospace; color: #10b981;">${contact.noHp}</b></span>
            ${a.followUp && a.followUp.catatan ? `<span style="font-style: italic; color: var(--text-muted);"><i class="fas fa-comment-alt"></i> "${a.followUp.catatan}"</span>` : ''}
          </div>
        `;
      } else {
        guardianInfoHtml = `
          <div class="tl-guardian-info" style="color: var(--alpa);">
            <i class="fas fa-phone-slash"></i> Belum ada nomor HP orang tua/wali siswa ini di database
            ${a.followUp && a.followUp.catatan ? `<span style="font-style: italic; color: var(--text-muted); margin-left: 8px;"><i class="fas fa-comment-alt"></i> "${a.followUp.catatan}"</span>` : ''}
          </div>
        `;
      }

      // Tombol aksi tindak lanjut
      let roleSpecificBtn = "";
      if (mode === "walikelas") {
        roleSpecificBtn = `
          <button class="btn btn-secondary btn-sm" onclick="openCatatanWaliModal(null, '${s.id}')" title="Catat ke Buku Kasus & Pembinaan Wali Kelas" style="display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border-radius: 8px;">
            <i class="fas fa-book-bookmark"></i>
          </button>
        `;
      } else if (mode === "guruwali") {
        roleSpecificBtn = `
          <button class="btn btn-secondary btn-sm" onclick="openJurnalBimbinganModal(null, '${s.id}')" title="Catat ke Jurnal Bimbingan & Konseling Siswa Asuhan" style="display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border-radius: 8px;">
            <i class="fas fa-hand-holding-heart"></i>
          </button>
        `;
      }

      let actionButtonsHtml = "";
      if (contact && contact.hasPhone) {
        actionButtonsHtml = `
          <div class="tl-actions">
            <button class="btn-wa-action" onclick="openTindakLanjutWA('${a.id}')" title="Kirim Pesan Konfirmasi WhatsApp">
              <i class="fab fa-whatsapp"></i> Hubungi WA
            </button>
            <a href="tel:${contact.cleanPhone}" class="btn btn-secondary btn-sm" onclick="markAttendanceFollowUp('${a.id}', 'sudah', 'Telepon')" title="Telepon Langsung" style="display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border-radius: 8px;">
              <i class="fas fa-phone-alt"></i>
            </a>
            <button class="btn btn-secondary btn-sm" onclick="showTindakLanjutCatatanModal('${a.id}')" title="Catatan & Ubah Status" style="display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border-radius: 8px;">
              <i class="fas fa-clipboard-check"></i>
            </button>
            ${roleSpecificBtn}
          </div>
        `;
      } else {
        actionButtonsHtml = `
          <div class="tl-actions">
            <button class="btn btn-primary btn-sm" onclick="showAddEditKontakModalForStudent('${s.id}')" style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; padding: 6px 12px; border-radius: 8px;">
              <i class="fas fa-user-plus"></i> Lengkapi No HP
            </button>
            <button class="btn btn-secondary btn-sm" onclick="showTindakLanjutCatatanModal('${a.id}')" title="Konfirmasi Manual / Catatan" style="display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border-radius: 8px;">
              <i class="fas fa-clipboard-check"></i>
            </button>
            ${roleSpecificBtn}
          </div>
        `;
      }

      return `
        <div class="tl-item ${statusClass}">
          <div class="tl-item-main">
            <div class="tl-avatar" style="background: ${avatarBg};">
              ${initials || 'S'}
            </div>
            <div class="tl-info">
              <div class="tl-info-header">
                <span class="tl-student-name">${s.nama}</span>
                <span class="badge" style="background: var(--primary-light); color: var(--primary); font-weight: 600;">${k.nama}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">NISN: ${s.nisn || '-'}</span>
                <span class="badge" style="background: var(--bg-app); border: 1px solid var(--border-color); font-size: 0.75rem; color: var(--text-muted);"><i class="fas fa-book"></i> Mapel: <strong>${a.mapel || 'Pelajaran'}</strong></span>
                ${statusBadge}
                ${followUpBadge}
              </div>
              ${guardianInfoHtml}
            </div>
          </div>
          ${actionButtonsHtml}
        </div>
      `;
    }).join("");

    bodyContentHtml = `
      <div class="tl-list">
        ${itemsHtml}
      </div>
    `;
  }

  // Render Full Card Container
  container.innerHTML = `
    <div class="card" style="border: 1px solid rgba(239, 68, 68, 0.25); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);">
      <div class="card-header" style="flex-wrap: wrap; gap: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 14px; margin-bottom: 16px;">
        <div>
          <h2 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            ${headerTitleHtml}
            ${headerBadgeHtml}
            ${allIssues.length > 0 ? `<span class="badge badge-alpa" style="font-size: 0.8rem; border-radius: 12px;">${pendingCount} Butuh Tindak Lanjut</span>` : ''}
          </h2>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
            ${headerSubtitle}
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 6px; background: var(--bg-app); padding: 4px 10px; border-radius: 8px; border: 1px solid var(--border-color);">
            <i class="fas fa-calendar-alt" style="color: var(--primary); font-size: 0.85rem;"></i>
            <span style="font-size: 0.8rem; font-weight: 600;">Tanggal:</span>
            <input type="date" id="tl-date-picker" class="form-control form-control-sm" value="${dateToUse}" onchange="changeDashboardInterventionDate(this.value)" style="border: none; background: transparent; padding: 2px 4px; font-size: 0.8rem; font-weight: 600; cursor: pointer;">
          </div>
          ${dateToUse !== todayStr ? `
            <button class="btn btn-secondary btn-sm" onclick="changeDashboardInterventionDate('${todayStr}')" style="font-size: 0.75rem; padding: 4px 8px;">
              <i class="fas fa-calendar-day"></i> Hari Ini
            </button>
          ` : ''}
          ${latestOtherDate && dateToUse !== latestOtherDate ? `
            <button class="btn btn-secondary btn-sm" onclick="changeDashboardInterventionDate('${latestOtherDate}')" style="font-size: 0.75rem; padding: 4px 8px;" title="Lihat tanggal terakhir dengan catatan kendala kehadiran">
              <i class="fas fa-history"></i> ${formatDateIndo(latestOtherDate)}
            </button>
          ` : ''}
        </div>
      </div>

      ${allIssues.length > 0 ? `
        <!-- Filter Tabs / Chips -->
        <div class="tl-filter-bar">
          <div class="tl-filter-chip ${activeFilter === 'all' ? 'active' : ''}" onclick="setInterventionFilter('all')">
            Semua Masalah (${allIssues.length})
          </div>
          ${alpaCount > 0 ? `
            <div class="tl-filter-chip ${activeFilter === 'alpa' ? 'active' : ''}" onclick="setInterventionFilter('alpa')" style="${activeFilter === 'alpa' ? 'background: #ef4444; border-color: #ef4444;' : 'color: #ef4444;'}">
              <i class="fas fa-times-circle"></i> Alpa (${alpaCount})
            </div>
          ` : ''}
          ${bolosCount > 0 ? `
            <div class="tl-filter-chip ${activeFilter === 'bolos' ? 'active' : ''}" onclick="setInterventionFilter('bolos')" style="${activeFilter === 'bolos' ? 'background: #8b5cf6; border-color: #8b5cf6;' : 'color: #8b5cf6;'}">
              <i class="fas fa-walking"></i> Bolos (${bolosCount})
            </div>
          ` : ''}
          ${terlambatCount > 0 ? `
            <div class="tl-filter-chip ${activeFilter === 'terlambat' ? 'active' : ''}" onclick="setInterventionFilter('terlambat')" style="${activeFilter === 'terlambat' ? 'background: #f59e0b; border-color: #f59e0b;' : 'color: #f59e0b;'}">
              <i class="fas fa-clock"></i> Terlambat (${terlambatCount})
            </div>
          ` : ''}
          ${sakitIzinCount > 0 ? `
            <div class="tl-filter-chip ${activeFilter === 'sakit_izin' ? 'active' : ''}" onclick="setInterventionFilter('sakit_izin')" style="${activeFilter === 'sakit_izin' ? 'background: #3b82f6; border-color: #3b82f6;' : 'color: #3b82f6;'}">
              <i class="fas fa-envelope-open"></i> Sakit / Izin (${sakitIzinCount})
            </div>
          ` : ''}
          <div class="tl-filter-chip ${activeFilter === 'belum' ? 'active' : ''}" onclick="setInterventionFilter('belum')">
            <i class="fas fa-bell"></i> Belum Konfirmasi (${pendingCount})
          </div>
          ${confirmedCount > 0 ? `
            <div class="tl-filter-chip ${activeFilter === 'sudah' ? 'active' : ''}" onclick="setInterventionFilter('sudah')">
              <i class="fas fa-check-circle"></i> Selesai (${confirmedCount})
            </div>
          ` : ''}
        </div>
      ` : ''}

      ${bodyContentHtml}
    </div>
  `;
}

function changeDashboardInterventionDate(newDate) {
  window.activeDashboardInterventionDate = newDate;
  if (typeof currentAppMode !== "undefined" && currentAppMode === "walikelas") {
    currentWaliKelasDate = newDate;
    const picker = document.getElementById("walikelas-date-input");
    if (picker) picker.value = newDate;
  }
  renderDashboardIntervention(newDate);
}


function setInterventionFilter(filterKey) {
  window.activeInterventionFilter = filterKey;
  renderDashboardIntervention();
}

function openTindakLanjutWA(absensiId) {
  const att = (db.absensi || []).find(a => a.id === absensiId);
  if (!att) {
    showToast("Data absensi tidak ditemukan!");
    return;
  }

  const student = (db.siswa || []).find(s => s.id === att.siswaId);
  const kelas = (db.kelas || []).find(k => k.id === (att.kelasId || (student ? student.kelasId : null)));
  const contact = getStudentParentContact(att.siswaId);

  if (!contact || !contact.hasPhone) {
    showToast("Nomor HP wali belum tersedia. Silakan lengkapi nomor kontak terlebih dahulu.");
    showAddEditKontakModalForStudent(att.siswaId);
    return;
  }

  const userSchool = getCurrentSchoolName();
  const guruName = db.guruProfile.nama || "Guru Pengajar";
  const kelasName = kelas ? kelas.nama : "Kelas";
  const studentName = student ? student.nama : "Siswa";
  const waliName = contact.namaWali;
  const statusLabel = att.status;
  const mapel = att.mapel || "Pelajaran";
  const dateStr = formatDateIndo(att.tanggal);

  let roleSender = guruName;
  let sourceText = "";
  if (typeof currentAppMode !== "undefined" && currentAppMode === "walikelas") {
    roleSender = `${guruName} (Wali Kelas ${kelasName})`;
    sourceText = `berdasarkan laporan dari guru mata pelajaran ${mapel}`;
  } else if (typeof currentAppMode !== "undefined" && currentAppMode === "guruwali") {
    roleSender = `${guruName} (Guru Wali / Pendamping Asuhan)`;
    sourceText = `berdasarkan laporan dari guru mata pelajaran ${mapel} di kelas ${kelasName}`;
  } else {
    sourceText = `pada jam mata pelajaran ${mapel}`;
  }

  // Template 1: Konfirmasi Utama berdasarkan status
  let tplUtama = "";
  if (att.status === "Alpa") {
    tplUtama = `Yth. Bapak/Ibu ${waliName},\n\nKami dari ${userSchool} menginformasikan bahwa ananda ${studentName} (${kelasName}) pada hari ini, ${dateStr}, tercatat TIDAK HADIR di sekolah tanpa keterangan (Alpa) ${sourceText}.\n\nMohon konfirmasinya apakah ananda sedang sakit atau berhalangan karena ada urusan keluarga mendesak? Terima kasih atas perhatian dan kerja samanya.\n\nHormat kami,\n${roleSender}\n${userSchool}`;
  } else if (att.status === "Bolos") {
    tplUtama = `Yth. Bapak/Ibu ${waliName},\n\nKami dari ${userSchool} ingin mengonfirmasi terkait ananda ${studentName} (${kelasName}). Pada hari ini, ${dateStr}, ananda tercatat TIDAK BERADA DI KELAS saat jam pelajaran ${mapel} (Membolos) ${sourceText}.\n\nMohon bantuan Bapak/Ibu untuk mengecek dan mengonfirmasi kondisi ananda saat ini demi keselamatan dan ketertiban belajar. Terima kasih.\n\nHormat kami,\n${roleSender}\n${userSchool}`;
  } else if (att.status === "Terlambat") {
    tplUtama = `Yth. Bapak/Ibu ${waliName},\n\nKami dari ${userSchool} menginformasikan bahwa ananda ${studentName} (${kelasName}) pada hari ini, ${dateStr}, tercatat DATANG TERLAMBAT ke sekolah saat jam pelajaran ${mapel} ${sourceText}.\n\nMohon dukungan dan kerja sama Bapak/Ibu untuk mengingatkan ananda agar dapat berangkat lebih awal sehingga proses belajar tidak tertinggal. Terima kasih.\n\nHormat kami,\n${roleSender}\n${userSchool}`;
  } else {
    tplUtama = `Yth. Bapak/Ibu ${waliName},\n\nKami dari ${userSchool} mengonfirmasi status kehadiran ananda ${studentName} (${kelasName}) pada hari ini, ${dateStr}, yang tercatat ${statusLabel} ${sourceText}.\n\nTerima kasih atas kerja samanya.\n\nHormat kami,\n${roleSender}\n${userSchool}`;
  }

  // Template 2: Panggilan / Diskusi ke Sekolah
  const tplUndangan = `Yth. Bapak/Ibu ${waliName},\n\nSehubungan dengan kendala kehadiran ananda ${studentName} (${kelasName}) di ${userSchool} yang tercatat ${statusLabel} ${sourceText} pada ${dateStr}, kami mengundang Bapak/Ibu untuk dapat hadir berdiskusi bersama pihak sekolah demi pembinaan dan kelancaran proses belajar ananda.\n\nMohon konfirmasi waktu luang Bapak/Ibu. Terima kasih.\n\nHormat kami,\n${roleSender}\n${userSchool}`;

  // Template 3: Singkat & Cepat
  const tplSingkat = `Yth. Bapak/Ibu ${waliName}, ananda ${studentName} (${kelasName}) hari ini (${dateStr}) tercatat ${statusLabel} ${sourceText} di ${userSchool}. Mohon konfirmasi atau kabar dari Bapak/Ibu terkait ananda via pesan ini. Terima kasih. - ${roleSender}`;

  window.activeInterventionWATemplates = {
    1: tplUtama,
    2: tplUndangan,
    3: tplSingkat
  };
  window.activeInterventionTargetPhone = contact.cleanPhone;
  window.activeInterventionAbsensiId = absensiId;

  window.switchInterventionWATemplate = function(tplId) {
    const area = document.getElementById("tl-wa-message-text");
    if (area && window.activeInterventionWATemplates[tplId]) {
      area.value = window.activeInterventionWATemplates[tplId];
    }
  };

  const modalHtml = `
    <div style="font-size: 0.88rem; line-height: 1.5;">
      <div style="background: rgba(37, 211, 102, 0.08); border: 1px solid rgba(37, 211, 102, 0.3); padding: 12px 14px; border-radius: 10px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
        <div>
          <div style="font-weight: 700; color: #10b981; font-size: 0.95rem;">
            <i class="fab fa-whatsapp"></i> Konfirmasi Kehadiran Wali Siswa
          </div>
          <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 2px;">
            Target: <b>${contact.namaWali}</b> (${contact.hubungan}) - ${studentName} (${kelasName})
          </div>
        </div>
        <div style="font-family: monospace; font-weight: 700; color: #10b981; background: #fff; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(37, 211, 102, 0.3);">
          ${contact.noHp}
        </div>
      </div>

      <div style="margin-bottom: 10px;">
        <label style="font-weight: 600; font-size: 0.82rem; color: var(--text-muted); display: block; margin-bottom: 6px;">
          PILIH TEMPLATE PESAN:
        </label>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="switchInterventionWATemplate(1)" style="font-size: 0.78rem;">
            <i class="fas fa-comment-dots"></i> 1. Konfirmasi Kehadiran
          </button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="switchInterventionWATemplate(2)" style="font-size: 0.78rem;">
            <i class="fas fa-envelope-open-text"></i> 2. Undangan Diskusi
          </button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="switchInterventionWATemplate(3)" style="font-size: 0.78rem;">
            <i class="fas fa-bolt"></i> 3. Format Singkat
          </button>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label style="font-weight: 600; font-size: 0.82rem; color: var(--text-muted); display: block; margin-bottom: 4px;">
          TEKS PESAN WHATSAPP:
        </label>
        <textarea id="tl-wa-message-text" class="form-control" rows="8" style="font-size: 0.85rem; line-height: 1.4; font-family: inherit;">${tplUtama}</textarea>
      </div>

      <div style="background: var(--bg-app); border: 1px solid var(--border-color); padding: 10px 14px; border-radius: 8px; font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
        <span><i class="fas fa-info-circle"></i> Setelah membuka WA, status absensi akan otomatis ditandai <b>Terkonfirmasi (WhatsApp)</b>.</span>
        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600; color: var(--text-main); margin: 0;">
          <input type="checkbox" id="tl-auto-mark-check" checked> Tandai Terkonfirmasi Otomatis
        </label>
      </div>
    </div>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button type="button" class="btn-wa-action" onclick="submitInterventionWA()" style="padding: 9px 18px; font-size: 0.9rem;">
      <i class="fab fa-whatsapp"></i> Buka WhatsApp & Kirim
    </button>
  `;

  openModal("Konfirmasi Presensi Siswa", modalHtml, footerHtml);
}


function showTindakLanjutCatatanModal(absensiId) {
  const att = (db.absensi || []).find(a => a.id === absensiId);
  if (!att) return;

  const student = (db.siswa || []).find(s => s.id === att.siswaId);
  const kelas = (db.kelas || []).find(k => k.id === (att.kelasId || (student ? student.kelasId : null)));
  const contact = getStudentParentContact(att.siswaId);

  const currentStatus = (att.followUp && att.followUp.status) || "belum";
  const currentMetode = (att.followUp && att.followUp.metode) || "WhatsApp";
  const currentCatatan = (att.followUp && att.followUp.catatan) || "";

  const modalHtml = `
    <form id="form-tl-catatan" onsubmit="handleSaveTindakLanjutCatatan(event, '${absensiId}')">
      <div style="background: var(--bg-app); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 0.85rem;">
        <div><b>Siswa:</b> ${student ? student.nama : '-'} (${kelas ? kelas.nama : '-'})</div>
        <div style="color: var(--text-muted); margin-top: 2px;">
          Catatan Masalah: <b>${att.status}</b> pada tanggal ${formatDateIndo(att.tanggal)} (${att.mapel || 'Pelajaran'})
        </div>
        ${contact && contact.hasPhone ? `
          <div style="margin-top: 4px; color: #10b981; font-weight: 600;">
            <i class="fas fa-user-shield"></i> ${contact.namaWali} (${contact.hubungan}) - ${contact.noHp}
          </div>
        ` : ''}
      </div>

      <div class="form-group">
        <label class="form-label" style="font-weight: 600;">Status Tindak Lanjut:</label>
        <select id="tl-modal-status" class="form-control" required>
          <option value="sudah" ${currentStatus === 'sudah' ? 'selected' : ''}>✅ Sudah Dikonfirmasi / Ditindaklanjuti</option>
          <option value="belum" ${currentStatus === 'belum' ? 'selected' : ''}>⏳ Belum Dikonfirmasi / Perlu Tindak Lanjut</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" style="font-weight: 600;">Metode Komunikasi:</label>
        <select id="tl-modal-metode" class="form-control">
          <option value="WhatsApp" ${currentMetode === 'WhatsApp' ? 'selected' : ''}>WhatsApp</option>
          <option value="Telepon" ${currentMetode === 'Telepon' ? 'selected' : ''}>Telepon Suara</option>
          <option value="Tatap Muka" ${currentMetode === 'Tatap Muka' ? 'selected' : ''}>Tatap Muka di Sekolah</option>
          <option value="Kunjungan Rumah" ${currentMetode === 'Kunjungan Rumah' ? 'selected' : ''}>Kunjungan Rumah (Home Visit)</option>
          <option value="Surat Resmi" ${currentMetode === 'Surat Resmi' ? 'selected' : ''}>Surat Resmi Panggilan</option>
          <option value="Lainnya" ${currentMetode === 'Lainnya' ? 'selected' : ''}>Lainnya</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" style="font-weight: 600;">Catatan Hasil Konfirmasi Orang Tua / Tindak Lanjut:</label>
        <textarea id="tl-modal-catatan" class="form-control" rows="3" placeholder="Contoh: Orang tua konfirmasi siswa izin karena menghadiri acara keluarga mendadak, besok masuk kembali.">${currentCatatan}</textarea>
      </div>
    </form>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button type="submit" form="form-tl-catatan" class="btn btn-primary"><i class="fas fa-save"></i> Simpan Status</button>
  `;

  openModal("Konfirmasi & Tindak Lanjut Kehadiran", modalHtml, footerHtml);
}

function handleSaveTindakLanjutCatatan(e, absensiId) {
  e.preventDefault();
  const att = (db.absensi || []).find(a => a.id === absensiId);
  if (!att) return;

  const status = document.getElementById("tl-modal-status").value;
  const metode = document.getElementById("tl-modal-metode").value;
  const catatan = document.getElementById("tl-modal-catatan").value.trim();

  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  att.followUp = {
    status: status,
    metode: metode,
    waktu: timeStr,
    tanggal: getLocalDateString(),
    catatan: catatan
  };

  saveDatabase(true);
  closeModal();
  showToast("Status tindak lanjut berhasil diperbarui!");
  renderDashboardIntervention();
}

function markAttendanceFollowUp(absensiId, status, metode = "Telepon") {
  const att = (db.absensi || []).find(a => a.id === absensiId);
  if (!att) return;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  att.followUp = {
    status: status,
    metode: metode,
    waktu: timeStr,
    tanggal: getLocalDateString(),
    catatan: `Terkonfirmasi melalui ${metode}`
  };

  saveDatabase(true);
  showToast(`Status berhasil ditandai (${metode})`);
  setTimeout(() => {
    renderDashboardIntervention();
  }, 100);
}

function showAddEditKontakModalForStudent(siswaId) {
  showAddEditKontakModal(null, siswaId);
}

function submitInterventionWA() {
  const phone = window.activeInterventionTargetPhone;
  const absensiId = window.activeInterventionAbsensiId;
  const textEl = document.getElementById("tl-wa-message-text");
  const msg = textEl ? textEl.value.trim() : "";
  const autoMark = document.getElementById("tl-auto-mark-check") ? document.getElementById("tl-auto-mark-check").checked : true;

  if (!phone) {
    alert("Nomor HP tidak valid.");
    return;
  }

  if (autoMark && absensiId) {
    markAttendanceFollowUp(absensiId, "sudah", "WhatsApp");
  }

  closeModal();
  const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
  window.open(waUrl, "_blank");
}

// ============================================================================
// PUSAT LAPORAN PENILAIAN & TUGAS SISWA (DI BAWAH KKM & BELUM MENYETOR TUGAS/ULANGAN)
// ============================================================================

window.activeAcademicTypeFilter = 'all'; // 'all', 'below_kkm', 'missing_task', 'belum', 'sudah'
window.activeAcademicMapelFilter = 'ALL';
window.activeAcademicSearchQuery = '';
window.activeAcademicIssues = [];
window.activeAcademicIssuesMap = {};

function renderDashboardAcademicAlerts(containerId = "dashboard-akademik-section") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const mode = typeof currentAppMode !== "undefined" ? currentAppMode : "mapel";
  if (mode !== "walikelas" && mode !== "guruwali") {
    container.innerHTML = "";
    return;
  }

  const kkmVal = (typeof db.kkm === 'number' && db.kkm > 0) ? db.kkm : 75;
  db.academicFollowUp = db.academicFollowUp || {};

  // Scoped students according to currentAppMode
  let students = [];
  let headerTitleHtml = "";
  let headerSubtitle = "";
  let headerBadgeHtml = "";
  let activeKelasObj = null;

  if (mode === "walikelas") {
    const classId = getWaliKelasClassId();
    activeKelasObj = (db.kelas || []).find(k => k.id === classId) || { nama: "Kelas", tingkat: "-" };
    students = (db.siswa || []).filter(s => s.kelasId === classId);
    
    headerTitleHtml = `
      <i class="fas fa-graduation-cap" style="color: #f59e0b;"></i>
      Laporan Penilaian & Kendala Tugas Siswa (Kelas ${activeKelasObj.nama})
    `;
    headerSubtitle = `Pemantauan siswa binaan kelas ${activeKelasObj.nama} yang memperoleh nilai di bawah KKM (< ${kkmVal}) atau belum menyetor tugas/ulangan dari seluruh guru mata pelajaran.`;
    headerBadgeHtml = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 0.78rem;"><i class="fas fa-chalkboard-user"></i> Rekap Nilai Guru Mapel</span>`;
  } else if (mode === "guruwali") {
    students = getSiswaAsuhanList();
    headerTitleHtml = `
      <i class="fas fa-graduation-cap" style="color: #7c3aed;"></i>
      Laporan Penilaian & Kendala Tugas Siswa Asuhan
    `;
    headerSubtitle = `Pemantauan hasil belajar siswa asuhan Anda lintas kelas yang memiliki nilai di bawah KKM (< ${kkmVal}) atau belum menyetor tugas/ulangan untuk bimbingan akademik personal.`;
    headerBadgeHtml = `<span class="badge" style="background: rgba(124, 58, 237, 0.15); color: #7c3aed; border: 1px solid rgba(124, 58, 237, 0.3); font-size: 0.78rem;"><i class="fas fa-chalkboard-user"></i> Rekap Penilaian Lintas Kelas</span>`;
  }

  // 1. Kumpulkan semua kendala akademik siswa yang diampu
  const allIssues = [];

  students.forEach(s => {
    const sKelas = (db.kelas || []).find(k => k.id === s.kelasId) || { nama: "-" };
    const sGrades = (db.nilai || []).filter(n => n.siswaId === s.id);

    // A. Nilai di bawah KKM (< kkmVal)
    sGrades.forEach(n => {
      if (n.nilai !== null && n.nilai !== undefined && String(n.nilai).trim() !== "") {
        const val = parseFloat(n.nilai);
        if (!isNaN(val) && val < kkmVal) {
          const mapelKey = (n.mapel || "Pelajaran").trim();
          const jenisKey = (n.jenis || "Tugas").trim();
          const labelKey = (n.label || "Tagihan").trim();
          const issueId = `kkm_${s.id}_${mapelKey}_${jenisKey}_${labelKey}`.replace(/[^a-zA-Z0-9_-]/g, '_');
          const followUp = db.academicFollowUp[issueId] || null;

          allIssues.push({
            id: issueId,
            type: "below_kkm",
            siswaId: s.id,
            student: s,
            kelasId: s.kelasId,
            kelasNama: sKelas.nama,
            mapel: mapelKey,
            jenis: jenisKey,
            label: labelKey,
            nilai: val,
            kkm: kkmVal,
            tanggal: n.tanggal || "",
            followUp: followUp
          });
        }
      }
    });

    // B. Belum Menyetor Tugas atau Ulangan
    if (s.kelasId) {
      const pastAssignments = getPastAssignmentsForClass(s.kelasId);
      pastAssignments.forEach(pa => {
        const entry = sGrades.find(g => 
          g.mapel === pa.mapel && 
          g.jenis === pa.jenis && 
          g.label === pa.label
        );
        const isMissing = !entry || 
          entry.nilai === null || 
          entry.nilai === undefined || 
          String(entry.nilai).trim() === "";

        if (isMissing) {
          const mapelKey = (pa.mapel || "Pelajaran").trim();
          const jenisKey = (pa.jenis || "Tugas").trim();
          const labelKey = (pa.label || "Tagihan").trim();
          const issueId = `missing_${s.id}_${mapelKey}_${jenisKey}_${labelKey}`.replace(/[^a-zA-Z0-9_-]/g, '_');
          const followUp = db.academicFollowUp[issueId] || null;

          allIssues.push({
            id: issueId,
            type: "missing_task",
            siswaId: s.id,
            student: s,
            kelasId: s.kelasId,
            kelasNama: sKelas.nama,
            mapel: mapelKey,
            jenis: jenisKey,
            label: labelKey,
            nilai: null,
            kkm: kkmVal,
            tanggal: pa.tanggal || "",
            followUp: followUp
          });
        }
      });
    }
  });

  // Urutkan kendala: Siswa, lalu type (below_kkm dulu lalu missing_task), lalu mapel
  allIssues.sort((a, b) => {
    if (a.student.nama !== b.student.nama) return a.student.nama.localeCompare(b.student.nama);
    if (a.type !== b.type) return a.type === "below_kkm" ? -1 : 1;
    return a.mapel.localeCompare(b.mapel);
  });

  // Simpan di window untuk aksi klik modal
  window.activeAcademicIssues = allIssues;
  window.activeAcademicIssuesMap = {};
  allIssues.forEach(item => {
    window.activeAcademicIssuesMap[item.id] = item;
  });

  // Statistik ringkasan
  const belowKkmIssues = allIssues.filter(i => i.type === "below_kkm");
  const missingTaskIssues = allIssues.filter(i => i.type === "missing_task");
  const distinctProblemStudents = [...new Set(allIssues.map(i => i.siswaId))];
  const pendingCount = allIssues.filter(i => !i.followUp || i.followUp.status !== "sudah").length;
  const completedCount = allIssues.length - pendingCount;

  // Daftar Mapel unik yang ada kendala
  const availableMapels = [...new Set(allIssues.map(i => i.mapel))].sort();

  // Filter aktif
  const activeTypeFilter = window.activeAcademicTypeFilter || 'all';
  const activeMapelFilter = window.activeAcademicMapelFilter || 'ALL';
  const searchQuery = (window.activeAcademicSearchQuery || '').toLowerCase().trim();

  let filteredIssues = allIssues;

  if (activeTypeFilter === 'below_kkm') {
    filteredIssues = filteredIssues.filter(i => i.type === 'below_kkm');
  } else if (activeTypeFilter === 'missing_task') {
    filteredIssues = filteredIssues.filter(i => i.type === 'missing_task');
  } else if (activeTypeFilter === 'belum') {
    filteredIssues = filteredIssues.filter(i => !i.followUp || i.followUp.status !== 'sudah');
  } else if (activeTypeFilter === 'sudah') {
    filteredIssues = filteredIssues.filter(i => i.followUp && i.followUp.status === 'sudah');
  }

  if (activeMapelFilter !== 'ALL') {
    filteredIssues = filteredIssues.filter(i => i.mapel === activeMapelFilter);
  }

  if (searchQuery) {
    filteredIssues = filteredIssues.filter(i => 
      (i.student.nama && i.student.nama.toLowerCase().includes(searchQuery)) ||
      (i.student.nisn && i.student.nisn.toLowerCase().includes(searchQuery)) ||
      (i.mapel && i.mapel.toLowerCase().includes(searchQuery)) ||
      (i.label && i.label.toLowerCase().includes(searchQuery))
    );
  }

  // Bangun konten tampilan
  let bodyContentHtml = "";

  if (students.length === 0) {
    bodyContentHtml = `
      <div style="background: var(--bg-app); border: 2px dashed var(--border-color); border-radius: 12px; padding: 24px; text-align: center;">
        <i class="fas fa-users-slash" style="font-size: 2.2rem; color: var(--text-muted); margin-bottom: 8px;"></i>
        <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">
          ${mode === 'guruwali' ? 'Belum Ada Siswa Asuhan' : 'Belum Ada Siswa di Kelas Ini'}
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 6px 0 0 0;">
          ${mode === 'guruwali' ? 'Silakan tambahkan siswa asuhan terlebih dahulu melalui menu Kelola Siswa Asuhan.' : 'Belum ditemukan data siswa pada kelas binaan yang dipilih.'}
        </p>
      </div>
    `;
  } else if (allIssues.length === 0) {
    // Cek apakah ada penilaian yang sudah diinput
    const hasAnyAssignments = students.some(s => {
      if (!s.kelasId) return false;
      return getPastAssignmentsForClass(s.kelasId).length > 0;
    });

    if (!hasAnyAssignments) {
      bodyContentHtml = `
        <div style="background: rgba(59, 130, 246, 0.05); border: 2px dashed rgba(59, 130, 246, 0.3); border-radius: 12px; padding: 24px 16px; text-align: center;">
          <i class="fas fa-file-signature" style="font-size: 2.2rem; color: #3b82f6; margin-bottom: 8px;"></i>
          <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">
            Belum Ada Tagihan Penilaian / Tugas yang Dicatat
          </div>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin: 6px auto 0 auto; max-width: 480px; line-height: 1.5;">
            Guru mata pelajaran belum menginput daftar tugas atau ulangan untuk kelas ini. Panel pemantauan kendala penilaian akan otomatis aktif dan mendeteksi siswa saat nilai mata pelajaran mulai diisi.
          </p>
        </div>
      `;
    } else {
      bodyContentHtml = `
        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 24px 16px; text-align: center;">
          <i class="fas fa-award" style="font-size: 2.5rem; color: #10b981; margin-bottom: 8px;"></i>
          <div style="font-weight: 700; color: #10b981; font-size: 1.1rem;">
            Luar Biasa! Semua Siswa Tuntas KKM & Tugas Lengkap
          </div>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin: 6px auto 0 auto; max-width: 460px; line-height: 1.5;">
            Seluruh siswa yang diampu telah mencapai batas kelulusan KKM (≥ ${kkmVal}) dan tidak ada tunggakan tugas maupun ulangan yang belum disetor.
          </p>
        </div>
      `;
    }
  } else if (filteredIssues.length === 0) {
    bodyContentHtml = `
      <div style="background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.88rem;">
        <i class="fas fa-filter" style="margin-right: 6px;"></i> Tidak ada data kendala nilai dengan filter yang dipilih.
        <div style="margin-top: 10px;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="resetAcademicFilters()">
            <i class="fas fa-rotate-left"></i> Reset Filter
          </button>
        </div>
      </div>
    `;
  } else {
    // Render List Items
    const itemsHtml = filteredIssues.map(item => {
      const s = item.student;
      const contact = getStudentParentContact(s.id);
      const isBelowKkm = item.type === "below_kkm";
      const statusClass = isBelowKkm ? "status-below_kkm" : "status-missing_task";
      const avatarBg = isBelowKkm ? "#ef4444" : "#f59e0b";
      const initials = s.nama.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();

      // Badge status nilai / tugas
      let issueBadge = "";
      if (isBelowKkm) {
        issueBadge = `
          <span class="badge" style="background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 700;">
            <i class="fas fa-arrow-trend-down"></i> Nilai: ${item.nilai} (KKM: ${item.kkm})
          </span>
        `;
      } else {
        issueBadge = `
          <span class="badge" style="background: rgba(245, 158, 11, 0.12); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.3); font-weight: 700;">
            <i class="fas fa-clock-rotate-left"></i> Belum Menyetor ${item.jenis}
          </span>
        `;
      }

      // Badge follow up
      let followUpBadge = "";
      if (item.followUp && item.followUp.status === "sudah") {
        followUpBadge = `
          <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid #10b981;" title="${item.followUp.catatan || ''}">
            <i class="fas fa-check-double"></i> Terkonfirmasi (${item.followUp.metode || 'WA'})
          </span>
        `;
      } else if (item.followUp && item.followUp.status === "sedang") {
        followUpBadge = `
          <span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #2563eb; border: 1px solid #2563eb;" title="${item.followUp.catatan || ''}">
            <i class="fas fa-spinner fa-spin"></i> Proses Bimbingan (${item.followUp.metode || 'Guru'})
          </span>
        `;
      } else {
        followUpBadge = `
          <span class="badge" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.25);">
            <i class="fas fa-bell"></i> Perlu Tindak Lanjut
          </span>
        `;
      }

      // Info wali & kontak
      let guardianInfoHtml = "";
      if (contact && contact.hasPhone) {
        guardianInfoHtml = `
          <div class="tl-guardian-info">
            <span><i class="fas fa-user-shield" style="color: var(--primary);"></i> <b>${contact.namaWali}</b> (${contact.hubungan})</span>
            <span><i class="fas fa-phone-alt" style="color: #10b981;"></i> <b style="font-family: monospace; color: #10b981;">${contact.noHp}</b></span>
            ${item.followUp && item.followUp.catatan ? `<span style="font-style: italic; color: var(--text-muted);"><i class="fas fa-comment-alt"></i> "${item.followUp.catatan}"</span>` : ''}
          </div>
        `;
      } else {
        guardianInfoHtml = `
          <div class="tl-guardian-info" style="color: var(--alpa);">
            <i class="fas fa-phone-slash"></i> Belum ada nomor HP orang tua/wali siswa ini di database
            ${item.followUp && item.followUp.catatan ? `<span style="font-style: italic; color: var(--text-muted); margin-left: 8px;"><i class="fas fa-comment-alt"></i> "${item.followUp.catatan}"</span>` : ''}
          </div>
        `;
      }

      // Role specific button: Buku Kasus vs Jurnal Bimbingan
      let roleSpecificBtn = "";
      if (mode === "walikelas") {
        roleSpecificBtn = `
          <button type="button" class="btn btn-secondary btn-sm" onclick="openCatatanWaliModal(null, '${s.id}')" title="Catat Kasus & Pembinaan Wali Kelas" style="display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border-radius: 8px;">
            <i class="fas fa-book-bookmark"></i>
          </button>
        `;
      } else if (mode === "guruwali") {
        roleSpecificBtn = `
          <button type="button" class="btn btn-secondary btn-sm" onclick="openJurnalBimbinganModal(null, '${s.id}')" title="Catat di Jurnal Bimbingan & Konseling Asuhan" style="display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border-radius: 8px;">
            <i class="fas fa-hand-holding-heart"></i>
          </button>
        `;
      }

      // Tombol aksi
      let actionsHtml = "";
      if (contact && contact.hasPhone) {
        actionsHtml = `
          <div class="tl-actions">
            <button type="button" class="btn-wa-action" onclick="openAcademicAlertWA('${item.id}')" title="Kirim Notifikasi Remedial / Tugas ke WA Wali Murid">
              <i class="fab fa-whatsapp"></i> Hubungi WA
            </button>
            <a href="tel:${contact.cleanPhone}" class="btn btn-secondary btn-sm" title="Telepon Orang Tua" style="display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border-radius: 8px;">
              <i class="fas fa-phone-alt"></i>
            </a>
            <button type="button" class="btn btn-secondary btn-sm" onclick="showInputPastGradesModal('${s.id}')" title="Input / Cek Nilai Tugas Susulan Siswa Ini" style="display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border-radius: 8px;">
              <i class="fas fa-pen-to-square"></i>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="showAcademicFollowUpModal('${item.id}')" title="Catatan & Ubah Status Tindak Lanjut" style="display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border-radius: 8px;">
              <i class="fas fa-clipboard-check"></i>
            </button>
            ${roleSpecificBtn}
          </div>
        `;
      } else {
        actionsHtml = `
          <div class="tl-actions">
            <button type="button" class="btn btn-primary btn-sm" onclick="showAddEditKontakModalForStudent('${s.id}')" style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; padding: 6px 12px; border-radius: 8px;">
              <i class="fas fa-user-plus"></i> Lengkapi No HP
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="showInputPastGradesModal('${s.id}')" title="Input / Cek Nilai Tugas Susulan Siswa Ini" style="display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border-radius: 8px;">
              <i class="fas fa-pen-to-square"></i>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="showAcademicFollowUpModal('${item.id}')" title="Catatan & Ubah Status Tindak Lanjut" style="display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border-radius: 8px;">
              <i class="fas fa-clipboard-check"></i>
            </button>
            ${roleSpecificBtn}
          </div>
        `;
      }

      return `
        <div class="tl-item ${statusClass}">
          <div class="tl-item-main">
            <div class="tl-avatar" style="background: ${avatarBg};">
              ${initials || 'S'}
            </div>
            <div class="tl-info">
              <div class="tl-info-header">
                <span class="tl-student-name">${s.nama}</span>
                <span class="badge" style="background: var(--primary-light); color: var(--primary); font-weight: 600;">${item.kelasNama}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">NISN: ${s.nisn || '-'}</span>
                <span class="badge" style="background: var(--bg-app); border: 1px solid var(--border-color); font-size: 0.76rem; color: var(--text-main); font-weight: 600;">
                  <i class="fas fa-book"></i> ${item.mapel}
                </span>
                ${issueBadge}
                ${followUpBadge}
              </div>
              <div style="font-size: 0.82rem; margin-top: 3px; color: var(--text-main);">
                <i class="fas fa-tag" style="color: var(--primary); font-size: 0.78rem;"></i>
                Tagihan: <strong>${item.jenis} - ${item.label}</strong>
                ${isBelowKkm 
                  ? `<span style="color: #ef4444; margin-left: 6px; font-weight: 600;">(Kurang ${item.kkm - item.nilai} poin dari KKM ${item.kkm})</span>` 
                  : `<span style="color: #d97706; margin-left: 6px; font-weight: 600;">(Belum ada data nilai / belum menyetor)</span>`}
                ${item.tanggal ? `<span style="color: var(--text-muted); font-size: 0.75rem; margin-left: 6px;">• ${formatDateIndo(item.tanggal)}</span>` : ''}
              </div>
              ${guardianInfoHtml}
            </div>
          </div>
          ${actionsHtml}
        </div>
      `;
    }).join("");

    bodyContentHtml = `
      <div class="tl-list">
        ${itemsHtml}
      </div>
    `;
  }

  // Mapel dropdown options
  const mapelFilterOptions = [
    `<option value="ALL" ${activeMapelFilter === 'ALL' ? 'selected' : ''}>Semua Mata Pelajaran (${allIssues.length})</option>`,
    ...availableMapels.map(m => {
      const c = allIssues.filter(i => i.mapel === m).length;
      return `<option value="${m}" ${activeMapelFilter === m ? 'selected' : ''}>${m} (${c})</option>`;
    })
  ].join("");

  container.innerHTML = `
    <div class="card" style="border: 1px solid rgba(245, 158, 11, 0.3); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);">
      <!-- Header -->
      <div class="card-header" style="flex-wrap: wrap; gap: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 14px; margin-bottom: 16px;">
        <div>
          <h2 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            ${headerTitleHtml}
            ${headerBadgeHtml}
            ${allIssues.length > 0 ? `
              <span class="badge" style="background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); font-size: 0.78rem; border-radius: 12px;">
                ${distinctProblemStudents.length} Siswa Terkendala (${pendingCount} Perlu Ditindaklanjuti)
              </span>
            ` : ''}
          </h2>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
            ${headerSubtitle}
          </p>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          ${allIssues.length > 0 ? `
            <button type="button" class="btn btn-success btn-sm" onclick="shareAcademicAlertRecapWA()" title="Bagikan rekapitulasi kendala nilai siswa ke WhatsApp">
              <i class="fab fa-whatsapp"></i> Bagikan Rekap WA
            </button>
          ` : ''}
        </div>
      </div>

      ${allIssues.length > 0 ? `
        <!-- Filter Controls Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; background: var(--bg-app); padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-color);">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1 1 260px;">
            <div style="flex: 1 1 130px; min-width: 120px;">
              <select class="form-control form-control-sm" style="font-weight: 600; font-size: 0.82rem; width: 100%;" onchange="setAcademicMapelFilter(this.value)">
                ${mapelFilterOptions}
              </select>
            </div>
            <div style="flex: 1 1 130px; min-width: 120px;">
              <input type="text" class="form-control form-control-sm" placeholder="Cari nama siswa / NISN..." value="${window.activeAcademicSearchQuery || ''}" oninput="setAcademicSearchQuery(this.value)" style="font-size: 0.82rem; width: 100%;">
            </div>
          </div>
          <div style="font-size: 0.76rem; color: var(--text-muted); flex: 1 1 auto; text-align: right;">
            Menampilkan: <b>${filteredIssues.length}</b> dari <b>${allIssues.length}</b> kendala
          </div>
        </div>

        <!-- Filter Tabs / Chips -->
        <div class="tl-filter-bar">
          <div class="tl-filter-chip ${activeTypeFilter === 'all' ? 'active' : ''}" onclick="setAcademicTypeFilter('all')">
            Semua Kendala (${allIssues.length})
          </div>
          ${belowKkmIssues.length > 0 ? `
            <div class="tl-filter-chip ${activeTypeFilter === 'below_kkm' ? 'active' : ''}" onclick="setAcademicTypeFilter('below_kkm')" style="${activeTypeFilter === 'below_kkm' ? 'background: #ef4444; border-color: #ef4444; color: #fff;' : 'color: #ef4444;'}">
              <i class="fas fa-arrow-trend-down"></i> Di Bawah KKM / Remedial (${belowKkmIssues.length})
            </div>
          ` : ''}
          ${missingTaskIssues.length > 0 ? `
            <div class="tl-filter-chip ${activeTypeFilter === 'missing_task' ? 'active' : ''}" onclick="setAcademicTypeFilter('missing_task')" style="${activeTypeFilter === 'missing_task' ? 'background: #f59e0b; border-color: #f59e0b; color: #fff;' : 'color: #d97706;'}">
              <i class="fas fa-clock-rotate-left"></i> Belum Setor Tugas/Ulangan (${missingTaskIssues.length})
            </div>
          ` : ''}
          <div class="tl-filter-chip ${activeTypeFilter === 'belum' ? 'active' : ''}" onclick="setAcademicTypeFilter('belum')">
            <i class="fas fa-bell"></i> Belum Konfirmasi (${pendingCount})
          </div>
          ${completedCount > 0 ? `
            <div class="tl-filter-chip ${activeTypeFilter === 'sudah' ? 'active' : ''}" onclick="setAcademicTypeFilter('sudah')">
              <i class="fas fa-check-circle"></i> Selesai Ditindaklanjuti (${completedCount})
            </div>
          ` : ''}
        </div>
      ` : ''}

      ${bodyContentHtml}
    </div>
  `;
}

function openAcademicAlertWA(issueId) {
  const item = (window.activeAcademicIssuesMap || {})[issueId];
  if (!item) {
    showToast("Data penilaian tidak ditemukan!");
    return;
  }

  const student = item.student;
  const contact = getStudentParentContact(item.siswaId);

  if (!contact || !contact.hasPhone) {
    showToast("Nomor HP orang tua belum tersedia. Silakan lengkapi nomor kontak terlebih dahulu.");
    showAddEditKontakModalForStudent(item.siswaId);
    return;
  }

  const userSchool = getCurrentSchoolName();
  const guruName = (db.guruProfile && db.guruProfile.nama) || "Guru Pembimbing";
  const kelasName = item.kelasNama;
  const studentName = student ? student.nama : "Siswa";
  const waliName = contact.namaWali;
  const mapel = item.mapel;
  const isBelowKkm = item.type === "below_kkm";

  let roleSender = guruName;
  if (typeof currentAppMode !== "undefined" && currentAppMode === "walikelas") {
    roleSender = `${guruName} (Wali Kelas ${kelasName})`;
  } else if (typeof currentAppMode !== "undefined" && currentAppMode === "guruwali") {
    roleSender = `${guruName} (Guru Wali / Pendamping Asuhan)`;
  }

  // Template 1: Notifikasi Spesifik (Remedial atau Belum Setor)
  let tplUtama = "";
  if (isBelowKkm) {
    tplUtama = `Yth. Bapak/Ibu ${waliName},\n\nKami dari ${userSchool} menginformasikan hasil evaluasi belajar ananda *${studentName}* (${kelasName}) pada mata pelajaran *${mapel}* untuk tagihan *${item.jenis} (${item.label})* memperoleh nilai *${item.nilai}* (di bawah KKM sekolah yaitu ${item.kkm}).\n\nMohon dukungan dan pendampingan Bapak/Ibu di rumah agar ananda dapat mempersiapkan diri mengikuti kegiatan bimbingan perbaikan (remedial) bersama guru mata pelajaran. Terima kasih atas perhatian dan kerja samanya.\n\nHormat kami,\n${roleSender}\n${userSchool}`;
  } else {
    tplUtama = `Yth. Bapak/Ibu ${waliName},\n\nKami dari ${userSchool} menginformasikan bahwa ananda *${studentName}* (${kelasName}) pada mata pelajaran *${mapel}* tercatat *BELUM MENYETOR / MENGERJAKAN* tagihan *${item.jenis} (${item.label})*.\n\nMohon bantuan Bapak/Ibu untuk mendampingi dan mengingatkan ananda agar dapat segera menyelesaikan dan mengumpulkan tugas tersebut kepada guru mata pelajaran demi kelengkapan nilai rapor ananda. Terima kasih atas kerja samanya.\n\nHormat kami,\n${roleSender}\n${userSchool}`;
  }

  // Template 2: Undangan Konsultasi / Diskusi Pembinaan
  const tplUndangan = `Yth. Bapak/Ibu ${waliName},\n\nSehubungan dengan perkembangan belajar ananda *${studentName}* (${kelasName}) pada mata pelajaran *${mapel}* terkait ketuntasan nilai dan tugas, kami mengundang Bapak/Ibu untuk dapat berkomunikasi atau berdiskusi bersama kami demi kelancaran dan perbaikan prestasi belajar ananda di sekolah.\n\nMohon konfirmasi waktu luang Bapak/Ibu. Terima kasih.\n\nHormat kami,\n${roleSender}\n${userSchool}`;

  // Template 3: Singkat & Cepat
  const tplSingkat = isBelowKkm
    ? `Yth. Bapak/Ibu ${waliName}, ananda *${studentName}* (${kelasName}) memperoleh nilai ${item.nilai} (< KKM ${item.kkm}) pada ${item.jenis} (${item.label}) mapel *${mapel}*. Mohon motivasi dan pendampingan ananda untuk remedial. Terima kasih. - ${roleSender} ${userSchool}`
    : `Yth. Bapak/Ibu ${waliName}, ananda *${studentName}* (${kelasName}) belum menyetor *${item.jenis} (${item.label})* mapel *${mapel}*. Mohon ananda diingatkan agar segera mengumpulkan tugas ke guru. Terima kasih. - ${roleSender} ${userSchool}`;

  window.activeAcademicWATemplates = {
    1: tplUtama,
    2: tplUndangan,
    3: tplSingkat
  };
  window.activeAcademicTargetPhone = contact.cleanPhone;
  window.activeAcademicIssueId = issueId;

  window.switchAcademicWATemplate = function(tplId) {
    const area = document.getElementById("academic-wa-message-text");
    if (area && window.activeAcademicWATemplates[tplId]) {
      area.value = window.activeAcademicWATemplates[tplId];
    }
  };

  const modalHtml = `
    <div style="font-size: 0.88rem; line-height: 1.5;">
      <div style="background: rgba(37, 211, 102, 0.08); border: 1px solid rgba(37, 211, 102, 0.3); padding: 12px 14px; border-radius: 10px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
        <div>
          <div style="font-weight: 700; color: #10b981; font-size: 0.95rem;">
            <i class="fab fa-whatsapp"></i> Notifikasi Penilaian & Kendala Tugas Siswa
          </div>
          <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 2px;">
            Target: <b>${contact.namaWali}</b> (${contact.hubungan}) - ${studentName} (${kelasName})
          </div>
        </div>
        <div style="font-family: monospace; font-weight: 700; color: #10b981; background: #fff; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(37, 211, 102, 0.3);">
          ${contact.noHp}
        </div>
      </div>

      <div style="margin-bottom: 10px;">
        <label style="font-weight: 600; font-size: 0.82rem; color: var(--text-muted); display: block; margin-bottom: 6px;">
          PILIH FORMAT PESAN:
        </label>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="switchAcademicWATemplate(1)" style="font-size: 0.78rem;">
            <i class="fas fa-comment-dots"></i> 1. Notifikasi Kendala
          </button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="switchAcademicWATemplate(2)" style="font-size: 0.78rem;">
            <i class="fas fa-envelope-open-text"></i> 2. Undangan Diskusi
          </button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="switchAcademicWATemplate(3)" style="font-size: 0.78rem;">
            <i class="fas fa-bolt"></i> 3. Format Ringkas
          </button>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label style="font-weight: 600; font-size: 0.82rem; color: var(--text-muted); display: block; margin-bottom: 4px;">
          TEKS PESAN WHATSAPP:
        </label>
        <textarea id="academic-wa-message-text" class="form-control" rows="8" style="font-size: 0.85rem; line-height: 1.4; font-family: inherit;">${tplUtama}</textarea>
      </div>

      <div style="background: var(--bg-app); border: 1px solid var(--border-color); padding: 10px 14px; border-radius: 8px; font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
        <span><i class="fas fa-info-circle"></i> Setelah membuka WA, status kendala otomatis ditandai <b>Terkonfirmasi (WhatsApp)</b>.</span>
        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600; color: var(--text-main); margin: 0;">
          <input type="checkbox" id="academic-auto-mark-check" checked> Tandai Terkonfirmasi Otomatis
        </label>
      </div>
    </div>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button type="button" class="btn-wa-action" onclick="submitAcademicAlertWA()" style="padding: 9px 18px; font-size: 0.9rem;">
      <i class="fab fa-whatsapp"></i> Buka WhatsApp & Kirim
    </button>
  `;

  openModal("Notifikasi Nilai & Tugas Siswa ke Orang Tua", modalHtml, footerHtml);
}

function submitAcademicAlertWA() {
  const phone = window.activeAcademicTargetPhone;
  const issueId = window.activeAcademicIssueId;
  const textEl = document.getElementById("academic-wa-message-text");
  const msg = textEl ? textEl.value.trim() : "";
  const autoMark = document.getElementById("academic-auto-mark-check") ? document.getElementById("academic-auto-mark-check").checked : true;

  if (!phone) {
    alert("Nomor HP tidak valid.");
    return;
  }

  if (autoMark && issueId) {
    markAcademicFollowUp(issueId, "sudah", "WhatsApp");
  }

  closeModal();
  const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
  window.open(waUrl, "_blank");
}

function markAcademicFollowUp(issueId, status = "sudah", metode = "WhatsApp", catatan = "") {
  db.academicFollowUp = db.academicFollowUp || {};
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  db.academicFollowUp[issueId] = {
    status: status,
    metode: metode,
    waktu: timeStr,
    tanggal: getLocalDateString(),
    catatan: catatan || `Terkonfirmasi melalui ${metode}`
  };

  saveDatabase(true);
  showToast(`Status tindak lanjut akademik berhasil diperbarui (${metode})`);
  setTimeout(() => {
    renderDashboardAcademicAlerts();
  }, 100);
}

function showAcademicFollowUpModal(issueId) {
  const item = (window.activeAcademicIssuesMap || {})[issueId];
  if (!item) return;

  const s = item.student;
  const contact = getStudentParentContact(s.id);
  db.academicFollowUp = db.academicFollowUp || {};
  const current = db.academicFollowUp[issueId] || {};
  const currentStatus = current.status || "belum";
  const currentMetode = current.metode || "WhatsApp";
  const currentCatatan = current.catatan || "";

  const isBelowKkm = item.type === "below_kkm";
  const issueDesc = isBelowKkm 
    ? `Nilai ${item.jenis} (${item.label}) = ${item.nilai} di bawah KKM ${item.kkm}` 
    : `Belum menyetor ${item.jenis} (${item.label})`;

  const modalHtml = `
    <form id="form-academic-catatan" onsubmit="handleSaveAcademicFollowUp(event, '${issueId}')">
      <div style="background: var(--bg-app); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 0.85rem;">
        <div><b>Siswa:</b> ${s.nama} (${item.kelasNama})</div>
        <div style="color: var(--text-muted); margin-top: 2px;">
          <b>Mapel:</b> ${item.mapel} • <b>Kendala:</b> ${issueDesc}
        </div>
        ${contact && contact.hasPhone ? `
          <div style="margin-top: 4px; color: #10b981; font-weight: 600;">
            <i class="fas fa-user-shield"></i> ${contact.namaWali} (${contact.hubungan}) - ${contact.noHp}
          </div>
        ` : ''}
      </div>

      <div class="form-group">
        <label class="form-label" style="font-weight: 600;">Status Tindak Lanjut Akademik:</label>
        <select id="academic-modal-status" class="form-control" required>
          <option value="sudah" ${currentStatus === 'sudah' ? 'selected' : ''}>✅ Sudah Ditindaklanjuti / Remedial Tuntas</option>
          <option value="sedang" ${currentStatus === 'sedang' ? 'selected' : ''}>🔄 Sedang Dalam Bimbingan / Dijadwalkan Remedial</option>
          <option value="belum" ${currentStatus === 'belum' ? 'selected' : ''}>⏳ Belum Ditindaklanjuti / Menunggu Konfirmasi</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" style="font-weight: 600;">Metode Tindak Lanjut / Komunikasi:</label>
        <select id="academic-modal-metode" class="form-control">
          <option value="WhatsApp" ${currentMetode === 'WhatsApp' ? 'selected' : ''}>WhatsApp Orang Tua</option>
          <option value="Telepon" ${currentMetode === 'Telepon' ? 'selected' : ''}>Telepon Suara</option>
          <option value="Tatap Muka di Sekolah" ${currentMetode === 'Tatap Muka di Sekolah' ? 'selected' : ''}>Tatap Muka / Bimbingan Siswa Langsung</option>
          <option value="Konsultasi Orang Tua" ${currentMetode === 'Konsultasi Orang Tua' ? 'selected' : ''}>Pertemuan Konsultasi Orang Tua</option>
          <option value="Tugas Pengganti" ${currentMetode === 'Tugas Pengganti' ? 'selected' : ''}>Pemberian Tugas Pengganti / Tambahan</option>
          <option value="Lainnya" ${currentMetode === 'Lainnya' ? 'selected' : ''}>Lainnya</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" style="font-weight: 600;">Catatan Hasil Tindak Lanjut / Perkembangan Siswa:</label>
        <textarea id="academic-modal-catatan" class="form-control" rows="3" placeholder="Contoh: Orang tua sudah diberitahu dan siap membimbing siswa. Remedial dijadwalkan hari Kamis dengan guru mapel.">${currentCatatan}</textarea>
      </div>
    </form>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button type="submit" form="form-academic-catatan" class="btn btn-primary"><i class="fas fa-save"></i> Simpan Catatan</button>
  `;

  openModal("Tindak Lanjut Penilaian & Tugas Siswa", modalHtml, footerHtml);
}

function handleSaveAcademicFollowUp(e, issueId) {
  e.preventDefault();
  const status = document.getElementById("academic-modal-status").value;
  const metode = document.getElementById("academic-modal-metode").value;
  const catatan = document.getElementById("academic-modal-catatan").value.trim();

  markAcademicFollowUp(issueId, status, metode, catatan);
  closeModal();
}

function shareAcademicAlertRecapWA() {
  const issues = window.activeAcademicIssues || [];
  if (issues.length === 0) {
    showToast("Tidak ada kendala nilai atau tugas yang perlu dibagikan.");
    return;
  }

  const mode = typeof currentAppMode !== "undefined" ? currentAppMode : "mapel";
  const userSchool = getCurrentSchoolName();
  const guruName = (db.guruProfile && db.guruProfile.nama) || "Guru";
  const todayStr = formatDateIndo(getLocalDateString());

  let titleHeader = "";
  if (mode === "walikelas") {
    const classId = getWaliKelasClassId();
    const k = (db.kelas || []).find(c => c.id === classId) || { nama: "Kelas" };
    titleHeader = `REKAPITULASI KENDALA NILAI & TUGAS SISWA\nKelas: ${k.nama} - ${userSchool}\nPer Tanggal: ${todayStr}\nWali Kelas: ${guruName}`;
  } else {
    titleHeader = `REKAPITULASI KENDALA NILAI & TUGAS SISWA ASUHAN\n${userSchool}\nPer Tanggal: ${todayStr}\nGuru Wali: ${guruName}`;
  }

  // Kelompokkan per siswa
  const groupedByStudent = {};
  issues.forEach(i => {
    if (!groupedByStudent[i.student.nama]) {
      groupedByStudent[i.student.nama] = {
        student: i.student,
        kelasNama: i.kelasNama,
        items: []
      };
    }
    groupedByStudent[i.student.nama].items.push(i);
  });

  let textLines = [
    `📢 *${titleHeader}*`,
    `----------------------------------------`,
    `Total Siswa Terkendala: ${Object.keys(groupedByStudent).length} orang`,
    `Total Tagihan/Kendala: ${issues.length} catatan`,
    `----------------------------------------\n`
  ];

  let no = 1;
  for (const name in groupedByStudent) {
    const group = groupedByStudent[name];
    textLines.push(`*${no}. ${name}* (${group.kelasNama})`);
    group.items.forEach(it => {
      if (it.type === "below_kkm") {
        textLines.push(`  • [Di Bawah KKM] ${it.mapel} - ${it.jenis} (${it.label}): Nilai *${it.nilai}* (KKM ${it.kkm})`);
      } else {
        textLines.push(`  • [Belum Setor] ${it.mapel} - ${it.jenis} (${it.label})`);
      }
    });
    textLines.push(``);
    no++;
  }

  textLines.push(`Mohon kerja sama Bapak/Ibu untuk mendampingi ananda agar ketuntasan nilai rapor dapat terpenuhi. Terima kasih.`);

  const fullMsg = textLines.join("\n");
  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(fullMsg)}`;
  window.open(waUrl, "_blank");
}

function setAcademicTypeFilter(filterKey) {
  window.activeAcademicTypeFilter = filterKey;
  renderDashboardAcademicAlerts();
}

function setAcademicMapelFilter(mapelKey) {
  window.activeAcademicMapelFilter = mapelKey;
  renderDashboardAcademicAlerts();
}

function setAcademicSearchQuery(query) {
  window.activeAcademicSearchQuery = query;
  renderDashboardAcademicAlerts();
}

function resetAcademicFilters() {
  window.activeAcademicTypeFilter = 'all';
  window.activeAcademicMapelFilter = 'ALL';
  window.activeAcademicSearchQuery = '';
  renderDashboardAcademicAlerts();
}


function drawAttendanceChart() {
  const chartWrapper = document.getElementById("attendance-chart-wrapper");
  if (!chartWrapper) return;

  // Calculate past 5 dates with attendance
  const allDates = [...new Set(db.absensi.map(a => a.tanggal))].sort();
  const last5Dates = allDates.slice(-5);
  
  if (last5Dates.length === 0) {
    chartWrapper.innerHTML = `<div style="text-align: center; padding-top: 50px; color: var(--text-muted);">Belum ada data absensi untuk digambarkan.</div>`;
    return;
  }

  // Calculate rate for each date
  const chartData = last5Dates.map(date => {
    const dayAbs = db.absensi.filter(a => a.tanggal === date);
    const present = dayAbs.filter(a => a.status === "Hadir" || a.status === "Terlambat").length;
    const rate = Math.round((present / dayAbs.length) * 100);
    // Format date Indonesian format (dd/mm)
    const parts = date.split('-');
    const label = `${parts[2]}/${parts[1]}`;
    return { label, rate };
  });

  // Create SVG string
  const svgWidth = 500;
  const svgHeight = 200;
  const padding = 30;
  const graphWidth = svgWidth - padding * 2;
  const graphHeight = svgHeight - padding * 2;

  let barsHtml = "";
  const barWidth = 40;
  const spacing = (graphWidth - (barWidth * chartData.length)) / (chartData.length + 1);

  // Y-axis Grid Lines (0%, 25%, 50%, 75%, 100%)
  for (let i = 0; i <= 4; i++) {
    const yVal = padding + (graphHeight * i / 4);
    const percent = 100 - (i * 25);
    barsHtml += `
      <line class="chart-grid-line" x1="${padding}" y1="${yVal}" x2="${svgWidth - padding}" y2="${yVal}" />
      <text x="${padding - 8}" y="${yVal + 4}" font-size="10" fill="var(--text-muted)" text-anchor="end">${percent}%</text>
    `;
  }

  chartData.forEach((d, idx) => {
    const x = padding + spacing + idx * (barWidth + spacing);
    const barHeight = (d.rate / 100) * graphHeight;
    const y = padding + graphHeight - barHeight;

    barsHtml += `
      <!-- Bar -->
      <rect class="chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" />
      <!-- Rate Text -->
      <text x="${x + barWidth/2}" y="${y - 6}" font-size="11" font-weight="bold" fill="var(--text-main)" text-anchor="middle">${d.rate}%</text>
      <!-- Date Label -->
      <text x="${x + barWidth/2}" y="${padding + graphHeight + 16}" font-size="10" fill="var(--text-muted)" text-anchor="middle">${d.label}</text>
    `;
  });

  chartWrapper.innerHTML = `
    <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="chart-svg">
      ${barsHtml}
    </svg>
  `;
}

function populateUpcomingSchedule() {
  const tbody = document.querySelector("#upcoming-schedule-table tbody");
  if (!tbody) return;

  const daysOrder = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
  
  // Sort schedule by day and time
  const sortedJadwal = [...db.jadwal].sort((a, b) => {
    const dayDiff = daysOrder.indexOf(a.hari) - daysOrder.indexOf(b.hari);
    if (dayDiff !== 0) return dayDiff;
    return a.jamMulai.localeCompare(b.jamMulai);
  });

  if (sortedJadwal.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Belum ada jadwal mengajar.</td></tr>`;
    return;
  }

  tbody.innerHTML = sortedJadwal.slice(0, 5).map(j => {
    const kelasObj = db.kelas.find(k => k.id === j.kelasId);
    const kelasNama = kelasObj ? kelasObj.nama : "Tidak Diketahui";
    return `
      <tr>
        <td><strong>${j.hari}</strong></td>
        <td>${j.jamMulai} - ${j.jamSelesai}</td>
        <td><span class="badge badge-izin">${kelasNama}</span></td>
        <td>${j.mapel}</td>
      </tr>
    `;
  }).join("");
}


// ------------------------------------------
// 2. DATA KELAS VIEW RENDER
// ------------------------------------------
function renderKelas(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header" style="flex-wrap: wrap; gap: 10px;">
        <h3 class="card-title">Daftar Kelas</h3>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn-secondary btn-sm" onclick="showSyncMasterSekolahModal()" style="color: #2563eb; border-color: #2563eb; font-weight: 600;"><i class="fas fa-cloud-arrow-down"></i> Sinkron Data Spreadsheet</button>
          <button class="btn btn-primary btn-sm" onclick="showAddKelasModal()"><i class="fas fa-plus"></i> Tambah Kelas</button>
        </div>
      </div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Nama Kelas</th>
              <th>Wali Kelas</th>
              <th>Jumlah Siswa</th>
              <th class="actions-cell">Aksi</th>
            </tr>
          </thead>
          <tbody id="kelas-table-body">
            <!-- Loaded classes dynamically -->
          </tbody>
        </table>
      </div>
    </div>
  `;

  loadKelasTable();
}

function loadKelasTable() {
  const tbody = document.getElementById("kelas-table-body");
  if (!tbody) return;

  if (db.kelas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Belum ada data kelas. Silakan tambah kelas baru.</td></tr>`;
    return;
  }

  tbody.innerHTML = db.kelas.map((k, idx) => {
    const jmlSiswa = db.siswa.filter(s => s.kelasId === k.id).length;
    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${k.nama}</strong></td>
        <td>${k.waliKelas || '-'}</td>
        <td><span class="badge badge-hadir">${jmlSiswa} Siswa</span></td>
        <td class="actions-cell">
          <button class="btn btn-secondary btn-sm" onclick="showEditKelasModal('${k.id}')"><i class="fas fa-edit"></i> Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteKelas('${k.id}')"><i class="fas fa-trash"></i> Hapus</button>
        </td>
      </tr>
    `;
  }).join("");
}

function showAddKelasModal() {
  const formHtml = `
    <div class="form-group">
      <label class="form-label" for="kelas-nama">Nama Kelas</label>
      <input type="text" id="kelas-nama" class="form-control" placeholder="Contoh: X IPA 1" required>
    </div>
    <div class="form-group">
      <label class="form-label" for="kelas-wali">Wali Kelas</label>
      <input type="text" id="kelas-wali" class="form-control" placeholder="Nama Guru Wali Kelas" required>
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="submitAddKelas()">Simpan</button>
  `;

  openModal("Tambah Kelas Baru", formHtml, footerHtml);
}

function submitAddKelas() {
  const nama = document.getElementById("kelas-nama").value.trim();
  const waliKelas = document.getElementById("kelas-wali").value.trim();

  if (!nama || !waliKelas) {
    alert("Semua input wajib diisi!");
    return;
  }

  const id = "k-" + Date.now();
  db.kelas.push({ id, nama, waliKelas });
  saveDatabase();
  closeModal();
  loadKelasTable();
  showToast(`Kelas ${nama} berhasil ditambahkan!`);
}

function showEditKelasModal(id) {
  const kelasObj = db.kelas.find(k => k.id === id);
  if (!kelasObj) return;

  const formHtml = `
    <input type="hidden" id="edit-kelas-id" value="${kelasObj.id}">
    <div class="form-group">
      <label class="form-label" for="edit-kelas-nama">Nama Kelas</label>
      <input type="text" id="edit-kelas-nama" class="form-control" value="${kelasObj.nama}" required>
    </div>
    <div class="form-group">
      <label class="form-label" for="edit-kelas-wali">Wali Kelas</label>
      <input type="text" id="edit-kelas-wali" class="form-control" value="${kelasObj.waliKelas || ''}" required>
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="submitEditKelas()">Update</button>
  `;

  openModal("Edit Kelas", formHtml, footerHtml);
}

function submitEditKelas() {
  const id = document.getElementById("edit-kelas-id").value;
  const nama = document.getElementById("edit-kelas-nama").value.trim();
  const waliKelas = document.getElementById("edit-kelas-wali").value.trim();

  if (!nama || !waliKelas) {
    alert("Semua input wajib diisi!");
    return;
  }

  const idx = db.kelas.findIndex(k => k.id === id);
  if (idx !== -1) {
    db.kelas[idx].nama = nama;
    db.kelas[idx].waliKelas = waliKelas;
    saveDatabase();
    closeModal();
    loadKelasTable();
    showToast(`Kelas ${nama} berhasil diupdate!`);
  }
}

function deleteKelas(id) {
  const kelasObj = db.kelas.find(k => k.id === id);
  if (!kelasObj) return;

  if (confirm(`Apakah Anda yakin ingin menghapus kelas ${kelasObj.nama}? Semua siswa di kelas ini beserta data nilai dan absensinya juga akan ikut terhapus.`)) {
    // Remove class
    db.kelas = db.kelas.filter(k => k.id !== id);
    
    // Get all student IDs in this class to cascade delete their grades and attendance
    const studentIds = db.siswa.filter(s => s.kelasId === id).map(s => s.id);
    
    // Remove students in this class
    db.siswa = db.siswa.filter(s => s.kelasId !== id);
    
    // Remove attendance and grades for these students
    db.absensi = db.absensi.filter(a => !studentIds.includes(a.siswaId));
    db.nilai = db.nilai.filter(n => !studentIds.includes(n.siswaId));
    
    // Remove schedules for this class
    db.jadwal = db.jadwal.filter(j => j.kelasId !== id);
    
    saveDatabase();
    loadKelasTable();
    showToast(`Kelas ${kelasObj.nama} dihapus.`);
  }
}


// ------------------------------------------
// PENGATURAN & KELOLA NILAI TUGAS LALU UNTUK SISWA BARU
// ------------------------------------------

function getSettingsSiswaBaru() {
  if (!db.settingsSiswaBaru) {
    db.settingsSiswaBaru = { mode: "prompt", defaultScore: 75 };
  }
  return db.settingsSiswaBaru;
}

// Get all past assignment templates for a class across all mapel
function getPastAssignmentsForClass(kelasId) {
  if (!kelasId) return [];
  const classStudents = db.siswa.filter(s => s.kelasId === kelasId);
  if (classStudents.length === 0) return [];
  
  const studentIds = new Set(classStudents.map(s => s.id));
  const classEntries = db.nilai.filter(n => studentIds.has(n.siswaId));
  
  const map = new Map();
  classEntries.forEach(entry => {
    const key = `${entry.mapel}||${entry.jenis}||${entry.label}`;
    if (!map.has(key)) {
      map.set(key, {
        mapel: entry.mapel,
        jenis: entry.jenis,
        label: entry.label,
        tanggal: entry.tanggal
      });
    }
  });
  
  return Array.from(map.values()).sort((a, b) => {
    if (a.mapel !== b.mapel) return a.mapel.localeCompare(b.mapel);
    const jenisOrder = { "Tugas": 1, "UTS": 2, "UAS": 3 };
    if (jenisOrder[a.jenis] !== jenisOrder[b.jenis]) return (jenisOrder[a.jenis] || 9) - (jenisOrder[b.jenis] || 9);
    return a.label.localeCompare(b.label);
  });
}

// Get past assignments missing for a specific student
function getMissingPastAssignmentsForStudent(siswaId) {
  const s = db.siswa.find(siswa => siswa.id === siswaId);
  if (!s || !s.kelasId) return [];
  
  const allPast = getPastAssignmentsForClass(s.kelasId);
  const studentEntries = db.nilai.filter(n => n.siswaId === siswaId);
  
  return allPast.filter(past => {
    return !studentEntries.some(e => e.mapel === past.mapel && e.jenis === past.jenis && e.label === past.label);
  });
}

// Get class average for a specific past assignment
function getClassAverageForAssignment(kelasId, mapel, jenis, label) {
  const classStudents = db.siswa.filter(s => s.kelasId === kelasId);
  const studentIds = new Set(classStudents.map(s => s.id));
  const entries = db.nilai.filter(n => studentIds.has(n.siswaId) && n.mapel === mapel && n.jenis === jenis && n.label === label && typeof n.nilai === 'number');
  if (entries.length === 0) return 75;
  const sum = entries.reduce((acc, curr) => acc + curr.nilai, 0);
  return Math.round(sum / entries.length);
}

// Show modal to input/edit past assignment grades for a student
function showInputPastGradesModal(siswaId) {
  const s = db.siswa.find(siswa => siswa.id === siswaId);
  if (!s) return;
  
  const kelasObj = db.kelas.find(k => k.id === s.kelasId);
  const kelasNama = kelasObj ? kelasObj.nama : "Tanpa Kelas";
  
  const pastAssignments = getPastAssignmentsForClass(s.kelasId);
  
  if (pastAssignments.length === 0) {
    alert(`Belum ada riwayat tugas/ujian untuk kelas ${kelasNama}. Tidak ada nilai tugas lalu yang perlu diisi.`);
    return;
  }
  
  const studentGrades = db.nilai.filter(n => n.siswaId === siswaId);
  
  const grouped = {};
  pastAssignments.forEach(pa => {
    if (!grouped[pa.mapel]) grouped[pa.mapel] = [];
    grouped[pa.mapel].push(pa);
  });
  
  let contentHtml = `
    <div style="margin-bottom:15px; background:var(--primary-light); padding:12px; border-radius:8px; border:1px solid var(--border-color);">
      <div style="font-weight:600; font-size:0.95rem; color:var(--primary-dark);">
        <i class="fas fa-user-graduate"></i> ${s.nama} (${kelasNama})
      </div>
      <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">
        Silakan isi atau sesuaikan nilai tugas/ujian lalu yang telah berlangsung di kelas ini.
      </div>
      <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" onclick="quickFillPastGrades('kkm')"><i class="fas fa-magic"></i> Isi Semua KKM (75)</button>
        <button class="btn btn-secondary btn-sm" onclick="quickFillPastGrades('avg')"><i class="fas fa-calculator"></i> Isi Rata-rata Kelas</button>
        <button class="btn btn-secondary btn-sm" onclick="quickFillPastGrades('clear')"><i class="fas fa-eraser"></i> Kosongkan Semua</button>
      </div>
    </div>
    <form id="form-past-grades" onsubmit="event.preventDefault(); submitInputPastGrades('${s.id}');">
  `;
  
  Object.keys(grouped).forEach(mapel => {
    contentHtml += `
      <div style="margin-bottom: 20px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; padding:14px;">
        <h4 style="margin:0 0 10px 0; color:var(--accent); font-size:0.9rem; display:flex; align-items:center; gap:6px;">
          <i class="fas fa-book"></i> Mata Pelajaran: ${mapel}
        </h4>
        <div class="table-responsive">
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-color); background:var(--bg-app); text-align:left;">
                <th style="padding:6px 10px;">Jenis</th>
                <th style="padding:6px 10px;">Label Tugas/Ujian</th>
                <th style="padding:6px 10px;">Tanggal</th>
                <th style="padding:6px 10px; width:130px;">Nilai (0-100)</th>
              </tr>
            </thead>
            <tbody>
    `;
    
    grouped[mapel].forEach(pa => {
      const existing = studentGrades.find(g => g.mapel === pa.mapel && g.jenis === pa.jenis && g.label === pa.label);
      const val = existing !== undefined ? existing.nilai : "";
      const avg = getClassAverageForAssignment(s.kelasId, pa.mapel, pa.jenis, pa.label);
      const inputId = `past-grade-${pa.mapel.replace(/\s+/g, '_')}-${pa.jenis}-${pa.label.replace(/\s+/g, '_')}`;
      const badgeClass = pa.jenis === "Tugas" ? "badge-izin" : pa.jenis === "UTS" ? "badge-sakit" : "badge-terlambat";
      
      contentHtml += `
        <tr style="border-bottom:1px solid var(--border-color);">
          <td style="padding:8px 10px;"><span class="badge ${badgeClass}">${pa.jenis}</span></td>
          <td style="padding:8px 10px;"><strong>${pa.label}</strong></td>
          <td style="padding:8px 10px; color:var(--text-muted);">${formatDateIndo(pa.tanggal)}</td>
          <td style="padding:8px 10px;">
            <input type="number" 
                   id="${inputId}" 
                   class="form-control past-grade-input" 
                   min="0" max="100" 
                   value="${val}" 
                   placeholder="0-100" 
                   data-mapel="${pa.mapel}" 
                   data-jenis="${pa.jenis}" 
                   data-label="${pa.label}" 
                   data-tanggal="${pa.tanggal}"
                   data-avg="${avg}">
          </td>
        </tr>
      `;
    });
    
    contentHtml += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  });
  
  contentHtml += `</form>`;
  
  const footerHtml = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="submitInputPastGrades('${s.id}')"><i class="fas fa-save"></i> Simpan Nilai Tugas Lalu</button>
  `;
  
  openModal(`Nilai Tugas Lalu - ${s.nama}`, contentHtml, footerHtml, true);
}

// Helper to quick fill inputs in modal
function quickFillPastGrades(type) {
  const inputs = document.querySelectorAll(".past-grade-input");
  inputs.forEach(input => {
    if (type === "kkm") {
      input.value = 75;
    } else if (type === "avg") {
      const avg = input.getAttribute("data-avg") || 75;
      input.value = avg;
    } else if (type === "clear") {
      input.value = "";
    }
  });
}

// Submit input past grades for single student
function submitInputPastGrades(siswaId) {
  const s = db.siswa.find(siswa => siswa.id === siswaId);
  if (!s) return;
  
  const inputs = document.querySelectorAll(".past-grade-input");
  let updatedCount = 0;
  
  inputs.forEach(input => {
    const mapel = input.getAttribute("data-mapel");
    const jenis = input.getAttribute("data-jenis");
    const label = input.getAttribute("data-label");
    const tanggal = input.getAttribute("data-tanggal") || getLocalDateString();
    const valStr = input.value.trim();
    
    const existingIdx = db.nilai.findIndex(n => n.siswaId === siswaId && n.mapel === mapel && n.jenis === jenis && n.label === label);
    
    if (valStr === "") {
      if (existingIdx !== -1) {
        db.nilai.splice(existingIdx, 1);
        updatedCount++;
      }
    } else {
      const nilaiVal = parseFloat(valStr);
      if (!isNaN(nilaiVal) && nilaiVal >= 0 && nilaiVal <= 100) {
        if (existingIdx !== -1) {
          db.nilai[existingIdx].nilai = nilaiVal;
        } else {
          db.nilai.push({
            id: "n-" + Date.now() + Math.random().toString(36).substr(2, 5),
            siswaId: siswaId,
            mapel: mapel,
            jenis: jenis,
            label: label,
            nilai: nilaiVal,
            tanggal: tanggal
          });
        }
        updatedCount++;
      }
    }
  });
  
  saveDatabase();
  closeModal();
  showToast(`Nilai tugas lalu untuk ${s.nama} berhasil diperbarui!`);
  
  if (document.getElementById("siswa-table-body")) filterSiswaTable();
  if (document.querySelector(".nilai-tab.active")) onNilaiFilterChange();
}

// Auto apply past grades according to mode (auto_kkm, auto_avg)
function applyPastGradesAuto(siswaId, mode) {
  const s = db.siswa.find(siswa => siswa.id === siswaId);
  if (!s || !s.kelasId) return 0;
  
  const missingPast = getMissingPastAssignmentsForStudent(siswaId);
  if (missingPast.length === 0) return 0;
  
  const defaultScore = getSettingsSiswaBaru().defaultScore || 75;
  let count = 0;
  
  missingPast.forEach(pa => {
    let score = defaultScore;
    if (mode === "auto_avg") {
      score = getClassAverageForAssignment(s.kelasId, pa.mapel, pa.jenis, pa.label);
    }
    
    db.nilai.push({
      id: "n-" + Date.now() + Math.random().toString(36).substr(2, 5),
      siswaId: siswaId,
      mapel: pa.mapel,
      jenis: pa.jenis,
      label: pa.label,
      nilai: score,
      tanggal: pa.tanggal || getLocalDateString()
    });
    count++;
  });
  
  if (count > 0) {
    saveDatabase();
  }
  return count;
}

// Handle new student creation and past grades trigger
function checkAndHandleNewStudentPastGrades(siswaId) {
  const s = db.siswa.find(siswa => siswa.id === siswaId);
  if (!s || !s.kelasId) return;
  
  const pastAssignments = getPastAssignmentsForClass(s.kelasId);
  if (pastAssignments.length === 0) return;
  
  const settings = getSettingsSiswaBaru();
  const mode = settings.mode || "prompt";
  
  if (mode === "prompt") {
    setTimeout(() => {
      showInputPastGradesModal(siswaId);
    }, 300);
  } else if (mode === "auto_kkm" || mode === "auto_avg") {
    const count = applyPastGradesAuto(siswaId, mode);
    if (count > 0) {
      showToast(`Otomatis memberikan ${count} nilai tugas lalu untuk ${s.nama}`);
    }
  }
}

// Batch Modal for Multiple Students (e.g. after CSV Import)
function showBatchInputPastGradesModal(siswaIdList) {
  if (!siswaIdList || siswaIdList.length === 0) return;
  
  const students = db.siswa.filter(s => siswaIdList.includes(s.id));
  if (students.length === 0) return;
  
  let listHtml = students.map(s => {
    const kelasObj = db.kelas.find(k => k.id === s.kelasId);
    const kelasNama = kelasObj ? kelasObj.nama : "Tanpa Kelas";
    const missing = getMissingPastAssignmentsForStudent(s.id);
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--border-color);">
        <div>
          <strong>${s.nama}</strong> <span style="font-size:0.8rem; color:var(--text-muted);">(${kelasNama})</span>
          <br><span class="badge ${missing.length > 0 ? 'badge-sakit' : 'badge-hadir'}" style="font-size:0.75rem; margin-top:3px; display:inline-block;">${missing.length} nilai lalu belum diisi</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="showInputPastGradesModal('${s.id}')">
          <i class="fas fa-pen"></i> Isi Nilai
        </button>
      </div>
    `;
  }).join("");
  
  const contentHtml = `
    <div style="margin-bottom:15px; font-size:0.85rem;">
      <p style="margin-bottom:12px; color:var(--text-main);">
        Siswa berikut baru saja ditambahkan/di-import ke kelas yang memiliki riwayat tugas/ujian lalu:
      </p>
      <div style="max-height:300px; overflow-y:auto; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-card);">
        ${listHtml}
      </div>
    </div>
  `;
  
  const footerHtml = `
    <button class="btn btn-secondary" onclick="quickFillAllBatchStudents('${siswaIdList.join(',')}', 'auto_kkm')"><i class="fas fa-magic"></i> Isi KKM Semua</button>
    <button class="btn btn-primary" onclick="closeModal()">Selesai</button>
  `;
  
  openModal("Kelola Nilai Tugas Lalu Siswa Baru", contentHtml, footerHtml);
}

function quickFillAllBatchStudents(idsStr, mode) {
  const ids = idsStr.split(",");
  let totalCount = 0;
  ids.forEach(id => {
    totalCount += applyPastGradesAuto(id, mode);
  });
  saveDatabase();
  closeModal();
  showToast(`Berhasil memberikan nilai tugas lalu untuk ${ids.length} siswa baru!`);
  if (document.getElementById("siswa-table-body")) filterSiswaTable();
}

// Save settings from Profil view
function saveSettingsSiswaBaru() {
  const modeEl = document.querySelector('input[name="settings-siswa-baru-mode"]:checked');
  const mode = modeEl ? modeEl.value : "prompt";
  const defaultScore = parseInt(document.getElementById("settings-siswa-baru-score").value) || 75;
  
  db.settingsSiswaBaru = { mode, defaultScore };
  saveDatabase();
  showToast("Pengaturan Nilai Siswa Baru berhasil disimpan!");
}

// ------------------------------------------
// 3. DATA SISWA VIEW RENDER
// ------------------------------------------
function renderSiswa(container) {
  const classOptionsHtml = db.kelas.map(k => `<option value="${k.id}">${k.nama}</option>`).join("");

  container.innerHTML = `
    <div class="card">
      <div class="card-header" style="flex-wrap: wrap; gap: 15px;">
        <h3 class="card-title">Pengelolaan Data Siswa</h3>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="btn btn-primary" onclick="showSyncMasterSekolahModal()" style="background: #2563eb; border-color: #2563eb;">
            <i class="fas fa-cloud-arrow-down"></i> Tarik dari Spreadsheet Master
          </button>
          <button class="btn btn-secondary" onclick="showImportSiswaModal()"><i class="fas fa-file-import"></i> Import CSV</button>
          <button class="btn btn-secondary" onclick="showAddSiswaModal()"><i class="fas fa-plus"></i> Tambah Siswa</button>
        </div>
      </div>

      <!-- Filters & Search -->
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 20px;">
        <div class="search-wrapper" style="margin-bottom:0;">
          <i class="fas fa-search"></i>
          <input type="text" id="siswa-search-input" class="form-control" placeholder="Cari NISN atau Nama Siswa..." oninput="filterSiswaTable()">
        </div>
        <div>
          <select id="siswa-class-filter" class="form-control" onchange="filterSiswaTable()">
            <option value="">Semua Kelas</option>
            ${classOptionsHtml}
            <option value="none">Tanpa Kelas</option>
          </select>
        </div>
      </div>

      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>NISN</th>
              <th>Nama Siswa</th>
              <th>Kelas</th>
              <th>Gender</th>
              <th class="actions-cell">Aksi</th>
            </tr>
          </thead>
          <tbody id="siswa-table-body">
            <!-- loaded dynamically -->
          </tbody>
        </table>
      </div>
    </div>
  `;

  loadSiswaTable();
}

function loadSiswaTable(filteredSiswa = null) {
  const tbody = document.getElementById("siswa-table-body");
  if (!tbody) return;

  const list = filteredSiswa || db.siswa;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Tidak ada data siswa ditemukan.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((s, idx) => {
    const kelasObj = db.kelas.find(k => k.id === s.kelasId);
    const kelasNama = kelasObj ? kelasObj.nama : `<span style="color:var(--alpa);">Belum Diatur</span>`;
    const missingPast = getMissingPastAssignmentsForStudent(s.id);
    const missingBadge = missingPast.length > 0 
      ? `<span class="badge badge-sakit" style="font-size:0.7rem; margin-left:6px;" title="${missingPast.length} nilai tugas lalu belum terisi">${missingPast.length} nilai lalu !</span>` 
      : '';

    return `
      <tr>
        <td>${idx + 1}</td>
        <td><code>${s.nisn}</code></td>
        <td><strong>${s.nama}</strong>${missingBadge}</td>
        <td>${kelasNama}</td>
        <td><span class="badge ${s.gender === 'L' ? 'badge-izin' : 'badge-terlambat'}">${s.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</span></td>
        <td class="actions-cell">
          <button class="btn btn-secondary btn-sm" onclick="showInputPastGradesModal('${s.id}')" title="Input / Edit Nilai Tugas Lalu"><i class="fas fa-history"></i> Nilai Lalu</button>
          <button class="btn btn-secondary btn-sm" onclick="showEditSiswaModal('${s.id}')"><i class="fas fa-edit"></i> Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSiswa('${s.id}')"><i class="fas fa-trash"></i> Hapus</button>
        </td>
      </tr>
    `;
  }).join("");
}

function filterSiswaTable() {
  const searchQuery = document.getElementById("siswa-search-input").value.toLowerCase().trim();
  const classFilter = document.getElementById("siswa-class-filter").value;

  let result = db.siswa;

  // Search filter
  if (searchQuery) {
    result = result.filter(s => 
      s.nama.toLowerCase().includes(searchQuery) || 
      s.nisn.includes(searchQuery)
    );
  }

  // Class filter
  if (classFilter) {
    if (classFilter === "none") {
      result = result.filter(s => !s.kelasId);
    } else {
      result = result.filter(s => s.kelasId === classFilter);
    }
  }

  loadSiswaTable(result);
}

function showAddSiswaModal() {
  const classOptions = db.kelas.map(k => `<option value="${k.id}">${k.nama}</option>`).join("");
  
  const formHtml = `
    <div class="form-group">
      <label class="form-label" for="siswa-nisn">NISN</label>
      <input type="text" id="siswa-nisn" class="form-control" placeholder="Contoh: 0098123456" required>
    </div>
    <div class="form-group">
      <label class="form-label" for="siswa-nama">Nama Lengkap</label>
      <input type="text" id="siswa-nama" class="form-control" placeholder="Nama Lengkap Siswa" required>
    </div>
    <div class="form-group">
      <label class="form-label" for="siswa-kelas">Kelas</label>
      <select id="siswa-kelas" class="form-control" required>
        <option value="">Pilih Kelas...</option>
        ${classOptions}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Jenis Kelamin</label>
      <div style="display: flex; gap: 20px; padding: 10px 0;">
        <label><input type="radio" name="siswa-gender" value="L" checked> Laki-laki</label>
        <label><input type="radio" name="siswa-gender" value="P"> Perempuan</label>
      </div>
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="submitAddSiswa()">Simpan</button>
  `;

  openModal("Tambah Siswa Baru", formHtml, footerHtml);
}

function submitAddSiswa() {
  const nisn = document.getElementById("siswa-nisn").value.trim();
  const nama = document.getElementById("siswa-nama").value.trim();
  const kelasId = document.getElementById("siswa-kelas").value;
  const gender = document.querySelector('input[name="siswa-gender"]:checked').value;

  if (!nisn || !nama || !kelasId) {
    alert("Semua field wajib diisi!");
    return;
  }

  // Check unique NISN
  if (db.siswa.some(s => s.nisn === nisn)) {
    alert("NISN sudah terdaftar di sistem!");
    return;
  }

  const id = "s-" + Date.now();
  db.siswa.push({ id, nisn, nama, kelasId, gender });

  saveDatabase();
  closeModal();
  filterSiswaTable();
  showToast(`Siswa ${nama} berhasil didaftarkan!`);

  // Handle past assignments for newly added student
  checkAndHandleNewStudentPastGrades(id);
}

function showEditSiswaModal(id) {
  const s = db.siswa.find(siswa => siswa.id === id);
  if (!s) return;

  const classOptions = db.kelas.map(k => 
    `<option value="${k.id}" ${s.kelasId === k.id ? 'selected' : ''}>${k.nama}</option>`
  ).join("");

  const formHtml = `
    <input type="hidden" id="edit-siswa-id" value="${s.id}">
    <div class="form-group">
      <label class="form-label" for="edit-siswa-nisn">NISN</label>
      <input type="text" id="edit-siswa-nisn" class="form-control" value="${s.nisn}" required>
    </div>
    <div class="form-group">
      <label class="form-label" for="edit-siswa-nama">Nama Lengkap</label>
      <input type="text" id="edit-siswa-nama" class="form-control" value="${s.nama}" required>
    </div>
    <div class="form-group">
      <label class="form-label" for="edit-siswa-kelas">Kelas</label>
      <select id="edit-siswa-kelas" class="form-control" required>
        <option value="">Pilih Kelas...</option>
        ${classOptions}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Jenis Kelamin</label>
      <div style="display: flex; gap: 20px; padding: 10px 0;">
        <label><input type="radio" name="edit-siswa-gender" value="L" ${s.gender === 'L' ? 'checked' : ''}> Laki-laki</label>
        <label><input type="radio" name="edit-siswa-gender" value="P" ${s.gender === 'P' ? 'checked' : ''}> Perempuan</label>
      </div>
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="submitEditSiswa()">Update</button>
  `;

  openModal("Edit Data Siswa", formHtml, footerHtml);
}

function submitEditSiswa() {
  const id = document.getElementById("edit-siswa-id").value;
  const nisn = document.getElementById("edit-siswa-nisn").value.trim();
  const nama = document.getElementById("edit-siswa-nama").value.trim();
  const kelasId = document.getElementById("edit-siswa-kelas").value;
  const gender = document.querySelector('input[name="edit-siswa-gender"]:checked').value;

  if (!nisn || !nama || !kelasId) {
    alert("Semua field wajib diisi!");
    return;
  }

  // Check unique NISN (excluding current student)
  if (db.siswa.some(s => s.nisn === nisn && s.id !== id)) {
    alert("NISN sudah terdaftar di sistem!");
    return;
  }

  const idx = db.siswa.findIndex(s => s.id === id);
  if (idx !== -1) {
    db.siswa[idx].nisn = nisn;
    db.siswa[idx].nama = nama;
    db.siswa[idx].kelasId = kelasId;
    db.siswa[idx].gender = gender;
    
    saveDatabase();
    closeModal();
    filterSiswaTable();
    showToast(`Data siswa ${nama} berhasil diupdate!`);
  }
}

function deleteSiswa(id) {
  const s = db.siswa.find(siswa => siswa.id === id);
  if (!s) return;

  if (confirm(`Apakah Anda yakin ingin menghapus siswa ${s.nama}? Data nilai dan absensinya juga akan dihapus.`)) {
    db.siswa = db.siswa.filter(siswa => siswa.id !== id);
    db.absensi = db.absensi.filter(a => a.siswaId !== id);
    db.nilai = db.nilai.filter(n => n.siswaId !== id);
    
    saveDatabase();
    filterSiswaTable();
    showToast(`Siswa ${s.nama} dihapus.`);
  }
}

// --- IMPORT SISWA CSV FUNCTIONS ---

function showImportSiswaModal() {
  const formHtml = `
    <div style="font-family: var(--font-primary); color: var(--text-main);">
      <p style="margin-bottom: 15px; font-size: 0.9rem; line-height: 1.5;">
        Silakan unduh template CSV di bawah ini, isi data siswa Anda, lalu unggah kembali berkas tersebut.
      </p>
      
      <!-- Download Template Section -->
      <div style="margin-bottom: 20px; background-color: var(--primary-light); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <i class="fas fa-file-csv" style="font-size: 1.8rem; color: var(--hadir);"></i>
          <div>
            <div style="font-weight: 600; font-size: 0.85rem;">Template Siswa.csv</div>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Format kolom: NISN, Nama, Gender, Kelas</span>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="downloadTemplateSiswa()">
          <i class="fas fa-download"></i> Unduh
        </button>
      </div>
      
      <!-- Dropzone Area -->
      <div id="import-dropzone" class="import-dropzone" 
           onclick="document.getElementById('import-siswa-file').click()"
           ondragover="handleImportDragOver(event)"
           ondragleave="handleImportDragLeave(event)"
           ondrop="handleImportDrop(event)">
        <i class="fas fa-cloud-upload-alt" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: 10px;"></i>
        <p style="margin: 0; font-weight: 600; font-size: 0.9rem;">Pilih berkas CSV data siswa</p>
        <span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">atau seret dan letakkan berkas di sini</span>
        <input type="file" id="import-siswa-file" accept=".csv" style="display: none;" onchange="handleImportFileSelect(event)">
      </div>
      
      <!-- Settings / Options Section -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; background-color: var(--bg-app); padding: 12px; border-radius: 8px; font-size: 0.85rem;">
        <div>
          <div style="font-weight: 600; margin-bottom: 8px;">Penanganan Duplikasi NISN:</div>
          <label style="display: block; margin-bottom: 6px; cursor: pointer;">
            <input type="radio" name="import-dup-mode" value="skip" checked onchange="reparseCurrentImport()"> Lewati (Skip)
          </label>
          <label style="display: block; cursor: pointer;">
            <input type="radio" name="import-dup-mode" value="update" onchange="reparseCurrentImport()"> Perbarui (Update)
          </label>
        </div>
        <div>
          <div style="font-weight: 600; margin-bottom: 8px;">Pengaturan Kelas:</div>
          <label style="display: block; cursor: pointer;">
            <input type="checkbox" id="import-auto-class" checked onchange="reparseCurrentImport()"> Buat kelas baru jika belum ada
          </label>
        </div>
      </div>
      
      <!-- Preview Table Container -->
      <div id="import-preview-section" style="display: none;">
        <h4 style="margin: 15px 0 8px 0; font-family: var(--font-display); font-size: 0.95rem; display: flex; align-items: center; justify-content: space-between;">
          <span>Pratinjau Data Siswa</span>
          <span id="import-preview-count" class="badge badge-izin">0 baris</span>
        </h4>
        <div class="table-responsive" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
            <thead>
              <tr style="position: sticky; top: 0; background-color: var(--primary-light); z-index: 10;">
                <th style="padding: 8px; text-align: left;">NISN</th>
                <th style="padding: 8px; text-align: left;">Nama</th>
                <th style="padding: 8px; text-align: center; width: 60px;">Gender</th>
                <th style="padding: 8px; text-align: left;">Kelas</th>
                <th style="padding: 8px; text-align: left; width: 150px;">Status</th>
              </tr>
            </thead>
            <tbody id="import-preview-tbody">
            </tbody>
          </table>
        </div>
        <div id="import-summary-msg" style="margin-top: 10px; font-size: 0.8rem; font-weight: 600; color: var(--hadir);">
        </div>
      </div>
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" id="btn-process-import" disabled onclick="processImportSiswa()">Proses Import</button>
  `;

  // Global temporary storage for parsed data
  window.currentImportData = null;
  window.rawImportCSVText = null;
  window.validImportList = null;

  openModal("Import Data Siswa", formHtml, footerHtml, true);
}

function handleImportDragOver(e) {
  e.preventDefault();
  const dropzone = document.getElementById("import-dropzone");
  if (dropzone) {
    dropzone.style.borderColor = "var(--hadir)";
    dropzone.style.backgroundColor = "var(--hadir-bg)";
  }
}

function handleImportDragLeave(e) {
  e.preventDefault();
  const dropzone = document.getElementById("import-dropzone");
  if (dropzone) {
    dropzone.style.borderColor = "var(--border-color)";
    dropzone.style.backgroundColor = "var(--bg-input)";
  }
}

function handleImportDrop(e) {
  e.preventDefault();
  const dropzone = document.getElementById("import-dropzone");
  if (dropzone) {
    dropzone.style.borderColor = "var(--border-color)";
    dropzone.style.backgroundColor = "var(--bg-input)";
  }
  
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    if (file.name.toLowerCase().endsWith(".csv")) {
      const fileInput = document.getElementById("import-siswa-file");
      if (fileInput) {
        fileInput.files = e.dataTransfer.files;
      }
      processSelectedImportFile(file);
    } else {
      alert("Hanya file CSV yang didukung!");
    }
  }
}

function downloadTemplateSiswa() {
  const csvContent = "NISN,Nama,Jenis Kelamin,Kelas\n0098123471,Ahmad Dhani,L,X IPA 1\n0098123472,Rossa Rosliana,P,X IPA 2\n0098123473,Muhammad Ali,L,X IPA 1\n0098123474,Siti Nurhaliza,P,X IPA 2";
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "format_import_siswa.csv");
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function handleImportFileSelect(e) {
  if (e.target.files && e.target.files.length > 0) {
    processSelectedImportFile(e.target.files[0]);
  }
}

function processSelectedImportFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    window.rawImportCSVText = text;
    
    // Update dropzone label to show selected file name
    const dropzone = document.getElementById("import-dropzone");
    if (dropzone) {
      dropzone.innerHTML = `
        <i class="fas fa-file-csv" style="font-size: 2.5rem; color: var(--hadir); margin-bottom: 10px;"></i>
        <p style="margin: 0; font-weight: 600; font-size: 0.9rem; color: var(--hadir);">${file.name}</p>
        <span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Klik atau seret file lain untuk mengganti</span>
      `;
    }
    
    reparseCurrentImport();
  };
  reader.readAsText(file);
}

function reparseCurrentImport() {
  const text = window.rawImportCSVText;
  if (!text) return;

  const dupModeOption = document.querySelector('input[name="import-dup-mode"]:checked');
  const dupMode = dupModeOption ? dupModeOption.value : 'skip'; // 'skip' or 'update'
  
  const autoClassCheckbox = document.getElementById("import-auto-class");
  const autoClass = autoClassCheckbox ? autoClassCheckbox.checked : true;

  const parsedRows = parseCSV(text);
  if (parsedRows.length === 0) {
    alert("File CSV kosong atau format tidak sesuai!");
    return;
  }

  const validatedList = [];
  let validCount = 0;
  let errorCount = 0;
  const seenNisns = new Set();

  parsedRows.forEach((row) => {
    const nisn = (row.nisn || '').trim();
    const nama = (row.nama || '').trim();
    const rawGender = (row.gender || '').trim();
    const className = (row.kelas || '').trim();

    let status = "";
    let statusClass = "badge-hadir";
    let isValid = true;

    if (!nisn) {
      status = "NISN kosong";
      statusClass = "badge-alpa";
      isValid = false;
    } else if (!nama) {
      status = "Nama kosong";
      statusClass = "badge-alpa";
      isValid = false;
    } else if (seenNisns.has(nisn)) {
      status = "Duplikat di file";
      statusClass = "badge-alpa";
      isValid = false;
    } else {
      seenNisns.add(nisn);

      let gender = rawGender.toUpperCase();
      if (gender.startsWith('L') || gender === 'MALE' || gender === 'M') {
        gender = 'L';
      } else if (gender.startsWith('P') || gender === 'FEMALE' || gender === 'F') {
        gender = 'P';
      } else {
        status = "Gender salah (harus L/P)";
        statusClass = "badge-alpa";
        isValid = false;
      }

      if (isValid) {
        const existingClass = db.kelas.find(k => k.nama.toLowerCase() === className.toLowerCase());
        const existingSiswa = db.siswa.find(s => s.nisn === nisn);
        
        if (existingSiswa) {
          if (dupMode === "skip") {
            status = "Duplikat NISN (Lewati)";
            statusClass = "badge-bolos";
            isValid = false;
          } else {
            status = "Duplikat (Perbarui)";
            statusClass = "badge-terlambat";
            isValid = true;
          }
        } else {
          if (!className) {
            status = "Valid (Tanpa Kelas)";
            statusClass = "badge-izin";
          } else if (existingClass) {
            status = "Valid";
            statusClass = "badge-hadir";
          } else {
            if (autoClass) {
              status = "Valid (Kelas Baru)";
              statusClass = "badge-sakit";
            } else {
              status = "Valid (Abaikan Kelas)";
              statusClass = "badge-izin";
            }
          }
        }

        validatedList.push({
          nisn,
          nama,
          gender,
          className,
          status,
          statusClass,
          isValid,
          isUpdate: !!existingSiswa,
          namaWali: row.namaWali || '',
          hubungan: row.hubungan || '',
          noHp: row.noHp || ''
        });
      }
    }

    if (!isValid && statusClass === "badge-alpa") {
      validatedList.push({
        nisn,
        nama,
        gender: rawGender,
        className,
        status,
        statusClass,
        isValid: false
      });
      errorCount++;
    } else if (isValid) {
      validCount++;
    } else {
      errorCount++;
    }
  });

  const tbody = document.getElementById("import-preview-tbody");
  if (tbody) {
    tbody.innerHTML = validatedList.map(item => {
      const genderLabel = item.gender === 'L' ? 'L' : (item.gender === 'P' ? 'P' : item.gender || '-');
      return `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 8px;"><code>${item.nisn || '-'}</code></td>
          <td style="padding: 8px;"><strong>${item.nama || '-'}</strong></td>
          <td style="padding: 8px; text-align: center;">${genderLabel}</td>
          <td style="padding: 8px;">${item.className || '<span style="color:var(--text-muted)">-</span>'}</td>
          <td style="padding: 8px;"><span class="badge ${item.statusClass}">${item.status}</span></td>
        </tr>
      `;
    }).join("");
  }

  const countBadge = document.getElementById("import-preview-count");
  if (countBadge) {
    countBadge.textContent = `${validatedList.length} baris`;
  }

  const summaryMsg = document.getElementById("import-summary-msg");
  if (summaryMsg) {
    summaryMsg.innerHTML = `
      <div style="display: flex; gap: 15px; margin-top: 10px; font-size: 0.85rem;">
        <span style="color: var(--hadir);"><i class="fas fa-check-circle"></i> Siap diimpor: <strong>${validCount} siswa</strong></span>
        ${errorCount > 0 ? `<span style="color: var(--alpa);"><i class="fas fa-exclamation-circle"></i> Diabaikan/Error: <strong>${errorCount} baris</strong></span>` : ''}
      </div>
    `;
  }

  const previewSection = document.getElementById("import-preview-section");
  if (previewSection) {
    previewSection.style.display = "block";
  }

  const btnProcess = document.getElementById("btn-process-import");
  if (btnProcess) {
    if (validCount > 0) {
      btnProcess.removeAttribute("disabled");
    } else {
      btnProcess.setAttribute("disabled", "true");
    }
  }

  window.validImportList = validatedList.filter(item => item.isValid);
}

// ==========================================
// ROBUST SPREADSHEET / CSV HEADER DETECTORS
// ==========================================
function isPhoneHeader(h) {
  if (!h || typeof h !== 'string') return false;
  const s = h.toLowerCase().trim().replace(/[\s\.\-_]+/g, ' ');
  if (s.includes('induk') || s.includes('urut') || s.includes('peserta') || s.includes('siswa')) return false;
  if (s.includes('nama wali') || s === 'wali' || s.includes('wali kelas') || s.includes('walikelas') || s.includes('hubungan')) return false;
  if (s.includes('whatsapp') || s.includes('telepon') || s.includes('telp') || s.includes('ponsel') || s.includes('phone') || s.includes('handphone')) return true;
  if (s.includes('kontak') && !s.includes('nama')) return true;
  if (/\b(hp|wa|nohp|nowa|notelp)\b/.test(s) || s.includes('no hp') || s.includes('no wa') || s.includes('no telp') || s.includes('nomor hp') || s.includes('nomor wa')) return true;
  return false;
}

function isWaliHeader(h) {
  if (!h || typeof h !== 'string') return false;
  const s = h.toLowerCase().trim().replace(/[\s\.\-_]+/g, ' ');
  if (isPhoneHeader(h)) return false;
  if (s.includes('nama wali') || s.includes('nama orang tua') || s.includes('nama ortu') || s.includes('nama ayah') || s.includes('nama ibu')) return true;
  if (s.includes('orang tua') || s.includes('orangtua') || s.includes('ortu') || s.includes('ayah') || s.includes('ibu') || s.includes('bapak') || s.includes('parent')) return true;
  if (s.includes('wali') && !s.includes('wali kelas') && !s.includes('walikelas')) return true;
  return false;
}

function isGenderHeader(h) {
  if (!h || typeof h !== 'string') return false;
  const s = h.toLowerCase().trim().replace(/[\s\.\-_/]+/g, ' ');
  if (s.includes('gender') || s.includes('kelamin') || s.includes('jk') || s.includes('sex')) return true;
  if (s === 'l p' || s === 'p l' || s === 'lp' || s === 'pl' || s === 'l' || s === 'p') return true;
  if (s.includes('l') && s.includes('p')) return true;
  return false;
}

function isHubunganHeader(h) {
  if (!h || typeof h !== 'string') return false;
  const s = h.toLowerCase().trim().replace(/[\s\.\-_]+/g, ' ');
  if (s.includes('status siswa') || s.includes('status murid') || s.includes('status anak')) return false;
  return s.includes('hubungan') || s.includes('relasi') || s === 'status' || s.includes('status wali') || s.includes('status keluarga');
}

function isNamaSiswaHeader(h) {
  if (!h || typeof h !== 'string') return false;
  const s = h.toLowerCase().trim().replace(/[\s\.\-_]+/g, ' ');
  if (isWaliHeader(h) || isPhoneHeader(h) || s.includes('sekolah') || s.includes('guru')) return false;
  if (s.includes('nama siswa') || s.includes('nama murid') || s.includes('nama lengkap') || s.includes('nama peserta')) return true;
  if (s === 'nama' || s === 'name') return true;
  if (s.includes('siswa') || s.includes('murid')) return true;
  if (s.includes('nama') && !s.includes('wali') && !s.includes('ortu') && !s.includes('ayah') && !s.includes('ibu')) return true;
  return false;
}

function isNisnHeader(h) {
  if (!h || typeof h !== 'string') return false;
  const s = h.toLowerCase().trim().replace(/[\s\.\-_]+/g, ' ');
  return s.includes('nisn') || s.includes('nis') || s.includes('nik') || s.includes('induk');
}

function isKelasHeader(h) {
  if (!h || typeof h !== 'string') return false;
  const s = h.toLowerCase().trim().replace(/[\s\.\-_]+/g, ' ');
  if (s.includes('wali kelas') || s.includes('walikelas')) return false;
  return s.includes('kelas') || s.includes('rombel') || s.includes('class') || s.includes('tingkat');
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];

  const nonEmptyLines = lines.map(line => line.trim()).filter(line => line.length > 0);
  if (nonEmptyLines.length === 0) return [];

  const cleanHeaderLine = nonEmptyLines[0].replace(/^\uFEFF/, '').trim();
  const delimiter = cleanHeaderLine.includes('\t') ? '\t' : (cleanHeaderLine.includes(';') ? ';' : ',');

  const headers = parseCSVLine(cleanHeaderLine, delimiter).map(h => h.toLowerCase().trim().replace(/["']/g, ''));
  
  let nisnIdx = headers.findIndex(isNisnHeader);
  let namaIdx = headers.findIndex(isNamaSiswaHeader);
  let genderIdx = headers.findIndex(isGenderHeader);
  let kelasIdx = headers.findIndex(isKelasHeader);
  let waliIdx = headers.findIndex(isWaliHeader);
  let hubIdx = headers.findIndex(isHubunganHeader);
  let hpIdx = headers.findIndex(isPhoneHeader);

  // Fallback pintas jika kolom HP tidak terdeteksi via nama kolom
  if (hpIdx === -1 && nonEmptyLines.length > 1) {
    let bestColIdx = -1;
    let maxPhoneMatches = 0;
    const sampleLimit = Math.min(10, nonEmptyLines.length - 1);
    for (let c = 0; c < headers.length; c++) {
      let count = 0;
      for (let r = 1; r <= sampleLimit; r++) {
        const row = parseCSVLine(nonEmptyLines[r], delimiter);
        const val = (row[c] || '').replace(/[\s\-\.\(\)\+]/g, '');
        if (!/[a-zA-Z]/.test(val) && val.length >= 8 && (val.startsWith('08') || val.startsWith('628') || val.startsWith('8'))) {
          count++;
        }
      }
      if (count > maxPhoneMatches) {
        maxPhoneMatches = count;
        bestColIdx = c;
      }
    }
    if (maxPhoneMatches >= 1) {
      hpIdx = bestColIdx;
    }
  }

  if (nisnIdx === -1) nisnIdx = 0;
  if (namaIdx === -1) namaIdx = 1;
  if (genderIdx === -1) genderIdx = 2;
  if (kelasIdx === -1) kelasIdx = 3;

  const results = [];
  for (let i = 1; i < nonEmptyLines.length; i++) {
    const rowData = parseCSVLine(nonEmptyLines[i], delimiter);
    if (rowData.length < 2) continue;

    let parsedHp = "";
    if (hpIdx !== -1 && rowData[hpIdx]) {
      const rawVal = rowData[hpIdx].trim();
      if (!/[a-zA-Z]/.test(rawVal) && rawVal.replace(/\D/g, '').length >= 7) {
        let digits = rawVal.replace(/^['"`\s]+/, '').replace(/[\s\-\.\(\)]/g, '').replace(/\D/g, '');
        if (digits.startsWith('8')) {
          parsedHp = '0' + digits;
        } else if (digits.startsWith('62')) {
          parsedHp = '0' + digits.substring(2);
        } else if (digits.startsWith('0')) {
          parsedHp = digits;
        } else {
          parsedHp = digits;
        }
      }
    }

    results.push({
      nisn: rowData[nisnIdx] || '',
      nama: rowData[namaIdx] || '',
      gender: rowData[genderIdx] || '',
      kelas: rowData[kelasIdx] || '',
      namaWali: (waliIdx !== -1 && rowData[waliIdx]) ? rowData[waliIdx].trim() : '',
      hubungan: (hubIdx !== -1 && rowData[hubIdx]) ? rowData[hubIdx].trim() : 'Orang Tua',
      noHp: parsedHp
    });
  }

  return results;
}

function parseCSVLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

function processImportSiswa() {
  const list = window.validImportList;
  if (!list || list.length === 0) {
    alert("Tidak ada data siswa valid untuk diimpor!");
    return;
  }

  const autoClassCheckbox = document.getElementById("import-auto-class");
  const autoClass = autoClassCheckbox ? autoClassCheckbox.checked : true;
  let addedCount = 0;
  let updatedCount = 0;

  const classCache = {};
  db.kelas.forEach(k => {
    classCache[k.nama.toLowerCase()] = k.id;
  });

  list.forEach(student => {
    let kelasId = null;
    
    if (student.className) {
      const classLower = student.className.toLowerCase();
      if (classCache[classLower]) {
        kelasId = classCache[classLower];
      } else if (autoClass) {
        const newClassId = "k-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
        const newClass = {
          id: newClassId,
          nama: student.className,
          waliKelas: "Belum Diatur"
        };
        db.kelas.push(newClass);
        classCache[classLower] = newClassId;
        kelasId = newClassId;
      }
    }

    const userSchool = getCurrentSchoolName();
    db.kontakWali = db.kontakWali || [];

    if (student.isUpdate) {
      const idx = db.siswa.findIndex(s => s.nisn === student.nisn);
      if (idx !== -1) {
        db.siswa[idx].nama = student.nama;
        db.siswa[idx].kelasId = kelasId;
        db.siswa[idx].gender = student.gender;
        if (student.namaWali) db.siswa[idx].namaWali = student.namaWali;
        if (student.hubungan) db.siswa[idx].hubungan = student.hubungan;
        if (student.noHp) db.siswa[idx].noHp = student.noHp;
        updatedCount++;
      }
    } else {
      const studentId = "s-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
      const newStudent = {
        id: studentId,
        nisn: student.nisn,
        nama: student.nama,
        kelasId: kelasId,
        gender: student.gender
      };
      if (student.namaWali) newStudent.namaWali = student.namaWali;
      if (student.hubungan) newStudent.hubungan = student.hubungan;
      if (student.noHp) newStudent.noHp = student.noHp;
      db.siswa.push(newStudent);
      addedCount++;
    }

    if (student.noHp || student.namaWali) {
      const existingKw = db.kontakWali.find(k => {
        const kSchool = (k.sekolah || userSchool).trim().toLowerCase();
        if (kSchool !== userSchool.toLowerCase()) return false;
        if (student.nisn && k.nisn === student.nisn) return true;
        return k.namaSiswa && k.namaSiswa.toLowerCase() === student.nama.toLowerCase();
      });

      if (existingKw) {
        if (student.namaWali) existingKw.namaWali = student.namaWali;
        if (student.hubungan) existingKw.hubungan = student.hubungan;
        if (student.noHp) existingKw.noHp = student.noHp;
        if (student.className) existingKw.kelasNama = student.className;
      } else {
        db.kontakWali.push({
          id: "kw-" + Date.now() + "-" + Math.floor(Math.random() * 10000),
          sekolah: userSchool,
          nisn: student.nisn,
          namaSiswa: student.nama,
          kelasNama: student.className,
          namaWali: student.namaWali || 'Orang Tua / Wali',
          hubungan: student.hubungan || 'Orang Tua',
          noHp: student.noHp || '',
          catatan: ''
        });
      }
    }
  });

  saveDatabase();
  closeModal();
  filterSiswaTable();

  let msg = `Berhasil mengimpor ${addedCount + updatedCount} siswa!`;
  if (addedCount > 0 && updatedCount > 0) {
    msg = `Berhasil menambah ${addedCount} siswa baru dan memperbarui ${updatedCount} siswa!`;
  } else if (updatedCount > 0) {
    msg = `Berhasil memperbarui ${updatedCount} data siswa!`;
  } else if (addedCount > 0) {
    msg = `Berhasil menambah ${addedCount} siswa baru!`;
  }
  
  showToast(msg);

  // Check if imported students need past assignment grades
  const newlyAddedIds = list.map(item => {
    const s = db.siswa.find(siswa => siswa.nisn === item.nisn);
    return s ? s.id : null;
  }).filter(Boolean);

  const settings = getSettingsSiswaBaru();
  if (newlyAddedIds.length > 0) {
    // Check if any of these students have missing past assignments
    const studentsWithMissing = newlyAddedIds.filter(id => getMissingPastAssignmentsForStudent(id).length > 0);
    if (studentsWithMissing.length > 0) {
      if (settings.mode === "prompt") {
        setTimeout(() => {
          showBatchInputPastGradesModal(studentsWithMissing);
        }, 400);
      } else if (settings.mode === "auto_kkm" || settings.mode === "auto_avg") {
        let totalCount = 0;
        studentsWithMissing.forEach(id => {
          totalCount += applyPastGradesAuto(id, settings.mode);
        });
        if (totalCount > 0) {
          showToast(`Otomatis memberikan ${totalCount} nilai tugas lalu untuk siswa baru yang diimpor.`);
        }
      }
    }
  }

  window.validImportList = null;
  window.rawImportCSVText = null;
  window.currentImportData = null;
}

// ------------------------------------------
// 3.5 KONTAK ORANG TUA / WALI SISWA MODULE
// ------------------------------------------

function formatPhoneNumber(phone) {
  if (!phone) return "";
  if (/[a-zA-Z]/.test(String(phone))) return "";
  let cleaned = String(phone).replace(/\D/g, "");
  if (cleaned.length < 7) return "";
  if (cleaned.startsWith("62")) {
    return cleaned;
  }
  if (cleaned.startsWith("0")) {
    return "62" + cleaned.substring(1);
  }
  if (cleaned.startsWith("8")) {
    return "62" + cleaned;
  }
  return cleaned;
}

function displayPhoneNumber(phone) {
  if (!phone) return "-";
  if (/[a-zA-Z]/.test(String(phone))) return "-";
  let cleaned = String(phone).replace(/\D/g, "");
  if (cleaned.length < 7) return "-";
  if (cleaned.startsWith("62")) {
    cleaned = "0" + cleaned.substring(2);
  } else if (cleaned.startsWith("8")) {
    cleaned = "0" + cleaned;
  }
  if (cleaned.length >= 10) {
    return cleaned.replace(/(\d{4})(\d{4})(\d+)/, "$1-$2-$3");
  }
  return cleaned;
}

function getCurrentSchoolName() {
  if (db.guruProfile && db.guruProfile.sekolah && db.guruProfile.sekolah.trim() && db.guruProfile.sekolah.trim() !== "SMA Negeri 1 Jakarta") {
    return db.guruProfile.sekolah.trim();
  }
  return "SMA Negeri 1 Lasolo";
}

function getAllDistinctSchools() {
  const set = new Set();
  const current = getCurrentSchoolName();
  if (current && current !== "Nama Sekolah") set.add(current);

  (db.kontakWali || []).forEach(kw => {
    if (kw.sekolah && kw.sekolah.trim() && kw.sekolah.trim() !== "Nama Sekolah") {
      set.add(kw.sekolah.trim());
    }
  });

  return Array.from(set);
}

function getAllKontakWali(schoolFilter = null) {
  const session = getSession();
  const isAdmin = session && session.role === "admin";
  const userSchool = getCurrentSchoolName();

  // Jika bukan Admin, sekolah selalu dikunci ke sekolah guru saat ini
  let effectiveSchool = isAdmin 
    ? (schoolFilter !== null ? schoolFilter : (window.activeKontakSchoolFilter || "all")) 
    : userSchool;

  const list = [];
  const nisnMap = new Map();

  // 1. Ambil data dari db.siswa (Siswa saat ini selalu terdaftar di userSchool)
  if (effectiveSchool === "all" || isSameSchool(effectiveSchool, userSchool)) {
    (db.siswa || []).forEach(s => {
      const k = db.kelas ? db.kelas.find(item => item.id === s.kelasId) : null;
      const kelasNama = k ? k.nama : "Tanpa Kelas";
      
      // Sinkronkan data wali dari db.kontakWali jika ada rekaman yang cocok di SEKOLAH YANG SAMA
      const matchedContact = (db.kontakWali || []).find(kw => {
        if (!isSameSchool(kw.sekolah || userSchool, userSchool)) return false;
        
        if (kw.nisn && kw.nisn !== "-" && s.nisn && s.nisn !== "-") {
          return String(kw.nisn).trim() === String(s.nisn).trim();
        }
        return kw.namaSiswa && s.nama && kw.namaSiswa.trim().toLowerCase() === s.nama.trim().toLowerCase();
      });

      const waliNama = (matchedContact && matchedContact.namaWali) ? matchedContact.namaWali : (s.namaWali || "");
      const hubungan = (matchedContact && matchedContact.hubungan) ? matchedContact.hubungan : (s.hubungan || "Orang Tua");
      const noHp = (matchedContact && matchedContact.noHp) ? matchedContact.noHp : (s.noHp || "");
      const catatan = (matchedContact && matchedContact.catatan) ? matchedContact.catatan : (s.catatan || "");

      const item = {
        id: "siswa-" + s.id,
        siswaId: s.id,
        sekolah: userSchool,
        nisn: s.nisn || "-",
        namaSiswa: s.nama,
        kelasId: s.kelasId,
        kelasNama: kelasNama,
        namaWali: waliNama,
        hubungan: hubungan,
        noHp: noHp,
        catatan: catatan
      };
      list.push(item);
      if (s.nisn && s.nisn !== "-") {
        nisnMap.set(normalizeSchoolName(userSchool) + "_" + String(s.nisn).trim(), item);
      }
      nisnMap.set(normalizeSchoolName(userSchool) + "_" + s.nama.trim().toLowerCase(), item);
    });
  }

  // 2. Tambahkan data dari db.kontakWali (Master list)
  (db.kontakWali || []).forEach(kw => {
    const kwSchool = (kw.sekolah || userSchool).trim();
    
    // Filter sekolah: jika bukan "all" dan tidak cocok dengan filter, lewati!
    if (effectiveSchool !== "all" && !isSameSchool(kwSchool, effectiveSchool)) {
      return;
    }

    // Cek apakah sudah terwakili oleh data siswa di sekolah yang sama
    const keyNisn = normalizeSchoolName(kwSchool) + "_" + String(kw.nisn || "").trim();
    const keyNama = normalizeSchoolName(kwSchool) + "_" + (kw.namaSiswa || "").trim().toLowerCase();

    if ((kw.nisn && kw.nisn !== "-" && nisnMap.has(keyNisn)) || nisnMap.has(keyNama)) {
      const existing = (kw.nisn && kw.nisn !== "-" && nisnMap.get(keyNisn)) || nisnMap.get(keyNama);
      if (!existing.noHp && kw.noHp) existing.noHp = kw.noHp;
      if (!existing.namaWali && kw.namaWali) existing.namaWali = kw.namaWali;
      if (!existing.catatan && kw.catatan) existing.catatan = kw.catatan;
    } else {
      list.push({
        id: kw.id || ("kw-" + Math.random().toString(36).substring(2, 9)),
        siswaId: kw.siswaId || null,
        sekolah: kwSchool,
        nisn: kw.nisn || "-",
        namaSiswa: kw.namaSiswa || kw.nama || "Siswa",
        kelasId: kw.kelasId || null,
        kelasNama: kw.kelasNama || kw.kelas || "Umum",
        namaWali: kw.namaWali || "",
        hubungan: kw.hubungan || "Orang Tua",
        noHp: kw.noHp || "",
        catatan: kw.catatan || ""
      });
    }
  });

  return list;
}

function handleAdminSchoolChange(schoolVal) {
  window.activeKontakSchoolFilter = schoolVal;
  filterKontakList();
}

function renderKontak(container) {
  const session = getSession();
  const isAdmin = session && session.role === "admin";
  const userSchool = getCurrentSchoolName();

  if (typeof window.activeKontakSchoolFilter === "undefined") {
    window.activeKontakSchoolFilter = isAdmin ? "all" : userSchool;
  }

  const distinctSchools = getAllDistinctSchools();
  const contacts = getAllKontakWali(window.activeKontakSchoolFilter);
  const totalSiswa = contacts.length;
  const adaHp = contacts.filter(c => c.noHp && c.noHp.trim().length >= 8).length;
  const belumAdaHp = totalSiswa - adaHp;

  const classOptionsHtml = (db.kelas || []).map(k => `<option value="${k.id}">${k.nama}</option>`).join("");

  // Options for Admin School Selector
  const schoolOptionsHtml = distinctSchools.map(sch => {
    const isSelected = window.activeKontakSchoolFilter === sch ? "selected" : "";
    return `<option value="${sch}" ${isSelected}>🏫 ${sch}</option>`;
  }).join("");

  container.innerHTML = `
    <!-- Administrator Multi-School Banner -->
    ${isAdmin ? `
      <div style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95)); border: 1px solid rgba(255, 255, 255, 0.15); padding: 14px 18px; border-radius: 14px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; box-shadow: var(--shadow-sm); color: #fff;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="badge badge-hadir" style="padding: 4px 8px; font-size: 0.75rem;"><i class="fas fa-shield-alt"></i> Administrator</span>
          <div>
            <div style="font-weight: 700; font-size: 0.92rem;">Pengaturan Kontak Multi-Sekolah</div>
            <div style="font-size: 0.75rem; color: #94a3b8;">Data kontak orang tua terisolasi otomatis berdasarkan nama sekolah masing-masing.</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="font-size: 0.8rem; font-weight: 600; color: #cbd5e1;">Pilih Tampilan Sekolah:</label>
          <select id="kontak-admin-school-select" class="form-control" style="width: auto; padding: 6px 12px; font-size: 0.85rem; background: #1e293b; color: #fff; border-color: #475569;" onchange="handleAdminSchoolChange(this.value)">
            <option value="all" ${window.activeKontakSchoolFilter === 'all' ? 'selected' : ''}>🏢 Semua Sekolah (Master List)</option>
            ${schoolOptionsHtml}
          </select>
        </div>
      </div>
    ` : `
      <!-- Teacher School Scope Badge -->
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 10px 14px; border-radius: 10px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; font-size: 0.84rem;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <i class="fas fa-school" style="color: var(--primary);"></i>
          <span style="color: var(--text-muted);">Sekolah Aktif:</span>
          <b style="color: var(--text-main);">${userSchool}</b>
        </div>
        <span class="badge badge-izin" style="font-size: 0.72rem; padding: 3px 8px;">
          <i class="fas fa-lock"></i> Kontak Terfilter Khusus Sekolah Ini
        </span>
      </div>
    `}

    <!-- Top Summary Stats -->
    <div class="stats-grid" style="margin-bottom: 20px;">
      <div class="stat-card">
        <div class="stat-card-info">
          <p>Total Siswa Terdata</p>
          <h3 id="stat-total-siswa">${totalSiswa}</h3>
        </div>
        <div class="stat-card-icon" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">
          <i class="fas fa-user-graduate"></i>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-info">
          <p>Kontak Wali Tersedia</p>
          <h3 id="stat-ada-hp" style="color: var(--hadir);">${adaHp}</h3>
        </div>
        <div class="stat-card-icon" style="background: var(--hadir-bg); color: var(--hadir);">
          <i class="fas fa-phone-volume"></i>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-info">
          <p>Belum Ada Nomor HP</p>
          <h3 id="stat-belum-ada-hp" style="color: var(--alpa);">${belumAdaHp}</h3>
        </div>
        <div class="stat-card-icon" style="background: var(--alpa-bg); color: var(--alpa);">
          <i class="fas fa-phone-slash"></i>
        </div>
      </div>
    </div>

    <!-- Main Card -->
    <div class="card">
      <div class="card-header" style="flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--text-main);">
            <i class="fas fa-address-book" style="color: var(--primary); margin-right: 6px;"></i> Buku Kontak Wali Siswa
          </h2>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
            Hubungi orang tua/wali siswa secara langsung jika ada kendala kehadiran atau proses belajar.
          </p>
        </div>
        <div class="actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${isAdmin ? `
            <button class="btn btn-primary" id="btn-broadcast-kontak" onclick="broadcastKontakToTeachers()" style="background: #0284c7; border-color: #0284c7; color: #fff; font-weight: 600;">
              <i class="fas fa-paper-plane"></i> Distribusikan ke Semua Guru
            </button>
          ` : `
            <button class="btn btn-secondary" id="btn-manual-sync-kontak" onclick="manualSyncTeacherContacts()" style="border-color: #0284c7; color: #0284c7; font-weight: 600;">
              <i class="fas fa-cloud-arrow-down"></i> Tarik Kontak dari Admin
            </button>
          `}
          <button class="btn btn-secondary" onclick="showSyncSpreadsheetModal()" style="border-color: #10b981; color: #10b981;">
            <i class="fas fa-sync-alt"></i> Sinkron Spreadsheet
          </button>
          <button class="btn btn-secondary" onclick="showImportKontakCSVModal()">
            <i class="fas fa-file-csv"></i> Import CSV
          </button>
          <button class="btn btn-secondary" onclick="downloadTemplateKontakCSV()">
            <i class="fas fa-download"></i> Unduh Format
          </button>
          <button class="btn btn-primary" onclick="showAddEditKontakModal()">
            <i class="fas fa-plus"></i> Tambah / Edit
          </button>
        </div>
      </div>

      <!-- Search & Filters -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px; background: var(--bg-app); padding: 14px; border-radius: 12px;">
        <div style="position: relative;">
          <input type="text" id="kontak-search-input" class="form-control" placeholder="Cari nama siswa, wali, NISN, atau no HP..." oninput="filterKontakList()" style="padding-left: 36px;">
          <i class="fas fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.85rem;"></i>
        </div>
        <div>
          <select id="kontak-filter-kelas" class="form-control" onchange="filterKontakList()">
            <option value="">Semua Kelas</option>
            ${classOptionsHtml}
          </select>
        </div>
        <div>
          <select id="kontak-filter-status" class="form-control" onchange="filterKontakList()">
            <option value="">Semua Status Kontak</option>
            <option value="ada">Hanya yang Memiliki No HP</option>
            <option value="kosong">Hanya yang Belum Ada No HP</option>
          </select>
        </div>
      </div>

      <!-- Kontak Container List -->
      <div id="kontak-list-container">
        <!-- Rendered by filterKontakList() -->
      </div>
    </div>
  `;

  filterKontakList();
}

function filterKontakList() {
  const container = document.getElementById("kontak-list-container");
  if (!container) return;

  const session = getSession();
  const isAdmin = session && session.role === "admin";
  const userSchool = getCurrentSchoolName();
  const schoolFilter = isAdmin ? (window.activeKontakSchoolFilter || "all") : userSchool;

  const searchEl = document.getElementById("kontak-search-input");
  const kelasEl = document.getElementById("kontak-filter-kelas");
  const statusEl = document.getElementById("kontak-filter-status");

  const query = searchEl ? searchEl.value.toLowerCase().trim() : "";
  const kelasVal = kelasEl ? kelasEl.value : "";
  const statusVal = statusEl ? statusEl.value : "";

  let list = getAllKontakWali(schoolFilter);

  if (query) {
    list = list.filter(item => 
      (item.namaSiswa && item.namaSiswa.toLowerCase().includes(query)) ||
      (item.namaWali && item.namaWali.toLowerCase().includes(query)) ||
      (item.nisn && item.nisn.includes(query)) ||
      (item.noHp && item.noHp.includes(query)) ||
      (item.sekolah && item.sekolah.toLowerCase().includes(query))
    );
  }

  if (kelasVal) {
    list = list.filter(item => item.kelasId === kelasVal || item.kelasNama === kelasVal);
  }

  if (statusVal === "ada") {
    list = list.filter(item => item.noHp && item.noHp.trim().length >= 8);
  } else if (statusVal === "kosong") {
    list = list.filter(item => !item.noHp || item.noHp.trim().length < 8);
  }

  // Update dynamic stats counters
  const statTotal = document.getElementById("stat-total-siswa");
  const statAda = document.getElementById("stat-ada-hp");
  const statKosong = document.getElementById("stat-belum-ada-hp");
  if (statTotal) statTotal.textContent = list.length;
  if (statAda) statAda.textContent = list.filter(c => c.noHp && c.noHp.trim().length >= 8).length;
  if (statKosong) statKosong.textContent = list.filter(c => !c.noHp || c.noHp.trim().length < 8).length;

  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
        <i class="fas fa-search" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.5;"></i>
        <p style="font-weight: 600; font-size: 1rem;">Tidak ada kontak wali yang sesuai.</p>
        <p style="font-size: 0.85rem; margin-top: 4px;">Periksa kembali filter sekolah, kata kunci pencarian, atau sinkronkan data dari spreadsheet.</p>
      </div>
    `;
    return;
  }

  let html = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px;">`;

  list.forEach(item => {
    const hasPhone = item.noHp && item.noHp.trim().length >= 8;
    const cleanPhone = formatPhoneNumber(item.noHp);
    const dispPhone = displayPhoneNumber(item.noHp);
    const waliName = item.namaWali ? item.namaWali : `<span style="color: var(--text-muted); font-style: italic;">Belum diisi</span>`;
    const hubunganLabel = item.hubungan ? item.hubungan : "Orang Tua";

    // Avatar initials
    const initials = item.namaSiswa.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();

    html += `
      <div class="kontak-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 14px; padding: 16px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; justify-content: space-between; transition: all var(--transition-fast);">
        <div>
          <!-- Header Siswa & Sekolah -->
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--primary-light); color: var(--text-main); font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; flex-shrink: 0;">
                ${initials}
              </div>
              <div>
                <h4 style="font-size: 0.98rem; font-weight: 700; color: var(--text-main); margin: 0; line-height: 1.2;">
                  ${item.namaSiswa}
                </h4>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                  NISN: ${item.nisn} &bull; <span style="font-weight: 600;">${item.kelasNama}</span>
                </div>
              </div>
            </div>
            ${item.sekolah ? `
              <span class="badge ${item.sekolah === userSchool ? 'badge-hadir' : 'badge-izin'}" style="font-size: 0.68rem; padding: 2px 7px; flex-shrink: 0;" title="Sekolah asal">
                <i class="fas fa-school"></i> ${item.sekolah}
              </span>
            ` : ''}
          </div>

          <!-- Info Orang Tua / Wali -->
          <div style="background: var(--bg-app); padding: 10px 12px; border-radius: 10px; font-size: 0.84rem; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="color: var(--text-muted); font-size: 0.75rem;"><i class="fas fa-user-shield"></i> ${hubunganLabel}:</span>
              <span style="font-weight: 600; color: var(--text-main);">${waliName}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: var(--text-muted); font-size: 0.75rem;"><i class="fas fa-phone"></i> No. HP / WA:</span>
              <span style="font-weight: 700; color: ${hasPhone ? 'var(--hadir)' : 'var(--alpa)'};">
                ${dispPhone}
              </span>
            </div>
            ${item.catatan ? `
              <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border-color); font-size: 0.75rem; color: var(--text-muted);">
                <i class="fas fa-info-circle"></i> ${item.catatan}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Tombol Aksi Kontak -->
        <div style="display: flex; gap: 8px; align-items: center; padding-top: 8px; border-top: 1px solid var(--border-color);">
          ${hasPhone ? `
            <button class="btn btn-sm" onclick="openWhatsAppModal('${item.id}')" style="background: #25D366; color: #fff; flex: 2; justify-content: center; font-weight: 600; border: none; padding: 7px 10px;">
              <i class="fab fa-whatsapp" style="font-size: 1rem;"></i> WhatsApp
            </button>
            <a href="tel:${cleanPhone}" class="btn btn-secondary btn-sm" style="flex: 1; justify-content: center; padding: 7px 8px; color: #3b82f6; border-color: #3b82f6; text-decoration: none;" title="Telepon">
              <i class="fas fa-phone"></i> Panggil
            </a>
          ` : `
            <button class="btn btn-sm btn-secondary" onclick="showAddEditKontakModal('${item.id}')" style="flex: 1; justify-content: center; color: var(--alpa); border-color: var(--alpa); font-size: 0.78rem;">
              <i class="fas fa-plus-circle"></i> Masukkan No HP
            </button>
          `}
          <button class="btn btn-secondary btn-sm" onclick="showAddEditKontakModal('${item.id}')" style="padding: 7px 10px;" title="Edit Kontak">
            <i class="fas fa-pen"></i>
          </button>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

// ------------------------------------------
// MODAL WHATSAPP DENGAN TEMPLATE PESAN
// ------------------------------------------
function openWhatsAppModal(kontakId) {
  const session = getSession();
  const isAdmin = session && session.role === "admin";
  const userSchool = getCurrentSchoolName();
  const contacts = getAllKontakWali(isAdmin ? (window.activeKontakSchoolFilter || "all") : userSchool);
  const contact = contacts.find(c => c.id === kontakId);
  if (!contact || !contact.noHp) {
    showToast("Nomor HP orang tua belum tersedia!");
    return;
  }

  const guruNama = db.guruProfile && db.guruProfile.nama ? db.guruProfile.nama : "Guru Mata Pelajaran";
  const sekolah = contact.sekolah || (db.guruProfile && db.guruProfile.sekolah ? db.guruProfile.sekolah : "Sekolah");
  const mapel = db.guruProfile && db.guruProfile.mapel ? db.guruProfile.mapel : "Mata Pelajaran";
  const namaWali = contact.namaWali || "Bapak/Ibu";
  const namaSiswa = contact.namaSiswa;
  const kelas = contact.kelasNama;
  const tglHariIni = new Date().toLocaleDateString("id-ID", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Template Pesan 1: Kehadiran / Absensi
  const tplAbsensi = `Assalamu'alaikum Wr. Wb. / Selamat Pagi/Siang Bapak/Ibu ${namaWali},

Mohon maaf mengganggu waktunya. Kami dari ${sekolah} ingin mengonfirmasikan bahwa ananda:
- Nama: *${namaSiswa}*
- Kelas: *${kelas}*

Pada hari ini, *${tglHariIni}*, ananda tercatat *tidak hadir / ada kendala kehadiran* di sekolah pada mata pelajaran ${mapel}.

Mohon informasi atau konfirmasinya nggih Bapak/Ibu terkait kondisi ananda hari ini. Terima kasih atas kerja sama dan perhatiannya.

Wassalamu'alaikum Wr. Wb. / Salam hormat,
*${guruNama}*
${sekolah}`;

  // Template Pesan 2: Masalah Pembelajaran / Nilai
  const tplBelajar = `Assalamu'alaikum Wr. Wb. / Selamat Pagi/Siang Bapak/Ibu ${namaWali},

Semoga Bapak/Ibu senantiasa dalam keadaan sehat. Kami dari ${sekolah} ingin menyampaikan informasi mengenai perkembangan belajar ananda:
- Nama: *${namaSiswa}*
- Kelas: *${kelas}*
- Mata Pelajaran: *${mapel}*

Ada beberapa tugas / pemahaman materi ananda yang perlu mendapatkan perhatian dan bimbingan bersama di rumah agar ananda dapat mencapai hasil belajar yang optimal.

Jika Bapak/Ibu memiliki waktu luang, kami sangat terbuka untuk berdiskusi demi kemajuan belajar ananda. Terima kasih atas perhatian dan dukungannya.

Wassalamu'alaikum Wr. Wb. / Salam hormat,
*${guruNama}*
${sekolah}`;

  // Template Pesan 3: Pesan Umum
  const tplUmum = `Assalamu'alaikum Wr. Wb. / Selamat Pagi/Siang Bapak/Ibu ${namaWali},

Terkait ananda *${namaSiswa}* (${kelas}) di ${sekolah}:

(Silakan tuliskan pesan Anda di sini...)

Terima kasih atas perhatiannya.

Salam hormat,
*${guruNama}*
${sekolah}`;

  const cleanPhone = formatPhoneNumber(contact.noHp);

  const modalHtml = `
    <div style="font-size: 0.9rem;">
      <div style="background: var(--bg-app); padding: 12px; border-radius: 10px; margin-bottom: 15px;">
        <div style="font-weight: 700; color: var(--text-main);">${namaSiswa} (${kelas}) &bull; <span style="font-weight: 500; font-size: 0.8rem; color: var(--text-muted);">${sekolah}</span></div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
          Wali: <b>${namaWali}</b> (${contact.hubungan || 'Orang Tua'}) &bull; No. WA: <b>${displayPhoneNumber(contact.noHp)}</b>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" style="font-weight: 600;">Pilih Template Pesan:</label>
        <div style="display: grid; grid-template-columns: 1fr; gap: 8px; margin-bottom: 12px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; background: var(--bg-input); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-color);">
            <input type="radio" name="wa-tpl" value="absensi" checked onchange="updateWATextArea(1)">
            <span><i class="fas fa-clipboard-user" style="color: var(--sakit);"></i> <b>Pemberitahuan Kehadiran / Absensi</b></span>
          </label>
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; background: var(--bg-input); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-color);">
            <input type="radio" name="wa-tpl" value="belajar" onchange="updateWATextArea(2)">
            <span><i class="fas fa-book-reader" style="color: var(--primary);"></i> <b>Perkembangan Belajar / Nilai & Tugas</b></span>
          </label>
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; background: var(--bg-input); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-color);">
            <input type="radio" name="wa-tpl" value="umum" onchange="updateWATextArea(3)">
            <span><i class="fas fa-comment-dots" style="color: var(--hadir);"></i> <b>Pesan Kustom</b></span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="wa-message-text" style="font-weight: 600;">Isi Pesan (Dapat Diedit):</label>
        <textarea id="wa-message-text" class="form-control" rows="8" style="font-family: inherit; font-size: 0.85rem; line-height: 1.5; resize: vertical;"></textarea>
      </div>
    </div>
  `;

  window.waTemplates = {
    1: tplAbsensi,
    2: tplBelajar,
    3: tplUmum
  };

  window.currentWATargetPhone = cleanPhone;

  window.updateWATextArea = function(tplId) {
    const area = document.getElementById("wa-message-text");
    if (area && window.waTemplates[tplId]) {
      area.value = window.waTemplates[tplId];
    }
  };

  openModal("Kirim Pesan WhatsApp ke Orang Tua", modalHtml, `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn" onclick="executeSendWhatsApp()" style="background: #25D366; color: #fff; border: none; font-weight: 700;">
      <i class="fab fa-whatsapp"></i> Buka WhatsApp & Kirim
    </button>
  `);

  window.updateWATextArea(1);
}

function executeSendWhatsApp() {
  const area = document.getElementById("wa-message-text");
  const text = area ? area.value.trim() : "";
  const phone = window.currentWATargetPhone;

  if (!phone) {
    showToast("Nomor WhatsApp tidak valid!");
    return;
  }

  const encoded = encodeURIComponent(text);
  const waUrl = `https://wa.me/${phone}?text=${encoded}`;
  
  window.open(waUrl, "_blank");
  closeModal();
  showToast("Membuka aplikasi WhatsApp...");
}

// ----------------------------------------------------
// SINKRONISASI MASTER SEKOLAH (KELAS, SISWA & KONTAK)
// DARI SPREADSHEET DATABASE_SMAN_SAKU_2026
// ----------------------------------------------------
const CENTRAL_MASTER_SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1Er0-r3YCnWzjPDjC-fkN6f9HPBef7KFFSMi56UTala8/edit?usp=sharing";
const CENTRAL_ABSENSI_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyXf1l3RkTCCXegsjbn6br0NEWut2MW4zzQjEnfjcRhO1f4uN9kHqJfcI1drCZFohig/exec";

async function getMasterSpreadsheetUrl() {
  const local = localStorage.getItem("sman_saku_master_sheet_url");
  if (local && local.trim()) return local.trim();

  if (db && db.masterSheetUrl && db.masterSheetUrl.trim()) {
    localStorage.setItem("sman_saku_master_sheet_url", db.masterSheetUrl.trim());
    return db.masterSheetUrl.trim();
  }

  if (isCloudMode && supabase) {
    try {
      const { data } = await supabase
        .from("saku_guru_databases")
        .select("data")
        .eq("email", "admin@smansaku.id")
        .maybeSingle();
      if (data && data.data && data.data.masterSheetUrl) {
        localStorage.setItem("sman_saku_master_sheet_url", data.data.masterSheetUrl);
        return data.data.masterSheetUrl;
      }
    } catch (e) {
      console.warn("Gagal mengambil masterSheetUrl dari Supabase:", e);
    }
  }

  return localStorage.getItem("saku_guru_sheets_kontak_url") || CENTRAL_MASTER_SPREADSHEET_URL;
}

async function showSyncMasterSekolahModal() {
  const session = getSession();
  const isAdmin = session && session.role === "admin";
  const currentUrl = await getMasterSpreadsheetUrl();

  const modalHtml = `
    <div style="font-size: 0.88rem; line-height: 1.5;">
      <div style="background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.25); padding: 12px 14px; border-radius: 10px; margin-bottom: 16px;">
        <div style="font-weight: 700; color: #2563eb; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
          <i class="fas fa-file-excel"></i> Sinkronisasi Master Sekolah (DATABASE_SMAN_SAKU_2026)
        </div>
        <p style="margin: 0; font-size: 0.82rem; color: var(--text-main);">
          Tarik data <b>Kelas</b>, <b>Siswa</b>, dan <b>Kontak Wali</b> sekaligus secara otomatis dari Google Spreadsheet ke akun Anda.
        </p>
      </div>

      <div class="form-group">
        <label class="form-label" for="master-sheets-sync-url" style="font-weight: 600;">
          Tautan (Link) Google Spreadsheet:
        </label>
        <input type="url" id="master-sheets-sync-url" class="form-control" placeholder="https://docs.google.com/spreadsheets/d/..." value="${currentUrl}">
        <small style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-top: 4px;">
          ${isAdmin 
            ? "Sebagai <b>Administrator</b>, link yang Anda simpan di sini akan otomatis tersimpan ke Cloud dan menjadi acuan untuk seluruh akun guru." 
            : "Tautan spreadsheet master telah dimuat otomatis dari sekolah. Klik tombol di bawah untuk langsung memperbarui data kelas & siswa Anda."}
        </small>
      </div>

      <div class="form-group" style="margin-top: 10px;">
        <label class="form-label" for="master-sheets-tab-name" style="font-weight: 600;">
          Nama Tab / Sheet Data Siswa (Opsional):
        </label>
        <input type="text" id="master-sheets-tab-name" class="form-control" placeholder="Contoh: MASTER_SISWA (atau kosongkan)" value="${localStorage.getItem('sman_saku_master_tab_name') || 'MASTER_SISWA'}">
        <small style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-top: 3px;">
          Jika spreadsheet memiliki beberapa tab (misal ada tab DATA_ABSENSI dan MASTER_SISWA), sebutkan nama tab tempat data siswa berada.
        </small>
      </div>

      <div style="background: var(--bg-app); padding: 12px; border-radius: 8px; font-size: 0.78rem; color: var(--text-muted); margin-bottom: 15px;">
        <b>Kolom Spreadsheet yang Dibaca Otomatis:</b>
        <div style="margin-top: 4px; font-family: monospace; background: var(--bg-input); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-color); overflow-x: auto;">
          NISN | Nama Siswa | Jenis Kelamin (L/P) | Kelas | Nama Wali | Hubungan | No HP / WhatsApp
        </div>
        <div style="margin-top: 6px; font-size: 0.75rem; color: var(--text-muted);">
          <i class="fas fa-check-circle" style="color: #10b981;"></i> Nomor HP tanpa angka 0 di depan (awalan 8...) otomatis dinormalisasi menjadi 08... dan 628...
        </div>
      </div>

      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--border-color); display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.8rem; color: var(--text-muted);">
          <i class="fas fa-paper-plane" style="color: #10b981;"></i> Kirim Absensi Siswa ke Spreadsheet?
        </span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showSpreadsheetAbsensiModal()" style="font-size: 0.78rem; padding: 4px 10px; color: #10b981; border-color: #10b981; font-weight: 600;">
          <i class="fas fa-cog"></i> Atur Sinkron Absensi
        </button>
      </div>
    </div>
  `;

  openModal("Sinkronisasi Data Sekolah (Kelas, Siswa & Kontak)", modalHtml, `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" id="btn-do-sync-master" onclick="executeSyncMasterSekolah()" style="background: #2563eb; border-color: #2563eb;">
      <i class="fas fa-cloud-arrow-down"></i> Tarik & Sinkronkan Sekarang
    </button>
  `);
}

async function executeSyncMasterSekolah() {
  const urlInput = document.getElementById("master-sheets-sync-url");
  const tabInput = document.getElementById("master-sheets-tab-name");
  if (!urlInput) return;
  const rawUrl = urlInput.value.trim();
  const specifiedTab = tabInput ? tabInput.value.trim() : "";

  if (!rawUrl) {
    alert("Silakan masukkan atau tempelkan tautan Google Spreadsheet terlebih dahulu!");
    return;
  }

  const sheetIdMatch = rawUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const sheetId = sheetIdMatch && sheetIdMatch[1] ? sheetIdMatch[1] : null;

  const btn = document.getElementById("btn-do-sync-master");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Mengunduh Spreadsheet...`;
  }

  try {
    let cleanText = "";
    let lines = [];

    // Helper untuk mencoba fetch CSV
    async function tryFetchCsv(targetUrl) {
      try {
        const res = await fetch(targetUrl);
        if (!res.ok) return null;
        let text = await res.text();
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const l = text.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
        return { text, lines: l };
      } catch (e) {
        return null;
      }
    }

    // 1. Jika user menentukan nama tab, atau default MASTER_SISWA
    const primaryTab = specifiedTab || "MASTER_SISWA";
    if (sheetId && primaryTab) {
      const tabUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(primaryTab)}`;
      const result = await tryFetchCsv(tabUrl);
      if (result && result.lines.length >= 2) {
        cleanText = result.text;
        lines = result.lines;
        localStorage.setItem("sman_saku_master_tab_name", primaryTab);
        console.log(`[SyncMaster] Berhasil mengambil data siswa dari tab: ${primaryTab}`);
      }
    }

    // 2. Jika belum berhasil, cari tab alternatif master siswa
    if (lines.length < 2 && sheetId) {
      const candidates = ["MASTER_SISWA", "Master Siswa", "DATA_SISWA", "Data Siswa", "SISWA", "Siswa", "Sheet2", "Sheet1"];
      for (const cand of candidates) {
        if (cand === primaryTab) continue;
        const candUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cand)}`;
        const result = await tryFetchCsv(candUrl);
        if (result && result.lines.length >= 2) {
          cleanText = result.text;
          lines = result.lines;
          localStorage.setItem("sman_saku_master_tab_name", cand);
          console.log(`[SyncMaster] Otomatis menemukan data siswa pada tab: ${cand}`);
          break;
        }
      }
    }

    // 3. Jika belum berhasil dan ada #gid di URL asli
    if (lines.length < 2 && sheetId) {
      const gidMatch = rawUrl.match(/gid=([0-9]+)/);
      if (gidMatch && gidMatch[1]) {
        const gidUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gidMatch[1]}`;
        const result = await tryFetchCsv(gidUrl);
        if (result && result.lines.length >= 2) {
          cleanText = result.text;
          lines = result.lines;
        }
      }
    }

    // 4. Jika masih belum berhasil, coba ekspor default (gid=0) sebagai fallback terakhir
    if (lines.length < 2 && sheetId) {
      const defaultUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
      const result = await tryFetchCsv(defaultUrl);
      if (result && result.lines.length >= 2) {
        cleanText = result.text;
        lines = result.lines;
      }
    }

    // Jika masih gagal mendapatkan data
    if (lines.length < 2) {
      throw new Error(
        "Spreadsheet hanya berisi 1 baris (judul) atau kosong.\n\n" +
        "Kemungkinan Penyebab:\n" +
        "1. Data siswa berada di Tab ke-2 (misal tab 'MASTER_SISWA'), sedangkan link Google Sheets membuka Tab pertama yang masih kosong.\n" +
        "2. Di lembar kerja, belum ada baris data siswa yang diisi di bawah baris judul.\n\n" +
        "Solusi Mudah:\n" +
        "• Ketik nama tab pada kolom 'Nama Tab / Sheet' di atas (contoh: MASTER_SISWA).\n" +
        "• ATAU di Google Sheets Anda, geser/drag tab 'MASTER_SISWA' ke urutan paling pertama (paling kiri).\n" +
        "• ATAU buka tab 'MASTER_SISWA' di browser, lalu salin link dari address bar atas (yang berakhiran #gid=...)."
      );
    }

    localStorage.setItem("sman_saku_master_sheet_url", rawUrl);
    localStorage.setItem("saku_guru_sheets_kontak_url", rawUrl);

    const session = getSession();
    if (session && session.role === "admin") {
      db.masterSheetUrl = rawUrl;
    }

    const cleanHeaderLine = lines[0].replace(/^\uFEFF/, '').trim();
    const delimiter = cleanHeaderLine.includes('\t') ? '\t' : (cleanHeaderLine.includes(';') ? ';' : ',');
    const rawHeaders = parseCSVLine(cleanHeaderLine, delimiter);
    const headers = rawHeaders.map(h => (h || '').toLowerCase().trim().replace(/["']/g, ''));

    const nisnIdx = headers.findIndex(isNisnHeader);
    const namaIdx = headers.findIndex(isNamaSiswaHeader);
    const kelasIdx = headers.findIndex(isKelasHeader);
    const genderIdx = headers.findIndex(isGenderHeader);
    const waliIdx = headers.findIndex(isWaliHeader);
    const hubIdx = headers.findIndex(isHubunganHeader);
    let hpIdx = headers.findIndex(isPhoneHeader);
    const catIdx = headers.findIndex(h => h.includes('catatan') || h.includes('keterangan') || h.includes('alamat') || h.includes('note'));

    // Fallback cerdas: Jika nama kolom belum dikenali, cari kolom dengan isi nomor HP (awalan 08/628/8)
    if (hpIdx === -1 && lines.length > 1) {
      let bestColIdx = -1;
      let maxPhoneMatches = 0;
      const sampleLimit = Math.min(10, lines.length - 1);
      for (let c = 0; c < headers.length; c++) {
        let count = 0;
        for (let r = 1; r <= sampleLimit; r++) {
          const row = parseCSVLine(lines[r], delimiter);
          const val = (row[c] || '').replace(/[\s\-\.\(\)\+]/g, '');
          if (!/[a-zA-Z]/.test(val) && val.length >= 8 && (val.startsWith('08') || val.startsWith('628') || val.startsWith('8'))) {
            count++;
          }
        }
        if (count > maxPhoneMatches) {
          maxPhoneMatches = count;
          bestColIdx = c;
        }
      }
      if (maxPhoneMatches >= 1) {
        hpIdx = bestColIdx;
      }
    }

    if (namaIdx === -1 && nisnIdx === -1) {
      throw new Error("Kolom 'Nama Siswa' atau 'NISN' tidak dapat dikenali pada baris judul spreadsheet.");
    }

    db.kelas = db.kelas || [];
    db.siswa = db.siswa || [];
    db.kontakWali = db.kontakWali || [];

    const userSchool = getCurrentSchoolName();
    const classCache = {};
    db.kelas.forEach(k => {
      classCache[k.nama.trim().toLowerCase()] = k.id;
    });

    let newClassesCount = 0;
    let newStudentsCount = 0;
    let updatedStudentsCount = 0;
    let contactsCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i], delimiter);
      if (cols.length < 2 || cols.every(c => !c.trim())) continue;

      const rNama = (namaIdx !== -1 && cols[namaIdx]) ? cols[namaIdx].trim() : "";
      const rNisn = (nisnIdx !== -1 && cols[nisnIdx]) ? cols[nisnIdx].trim() : "";
      const rKelas = (kelasIdx !== -1 && cols[kelasIdx]) ? cols[kelasIdx].trim() : "Umum";
      const rGenderRaw = (genderIdx !== -1 && cols[genderIdx]) ? cols[genderIdx].trim().toUpperCase() : "L";
      const rGender = (rGenderRaw.startsWith("P") || rGenderRaw.includes("PEREMPUAN") || rGenderRaw.includes("WANITA")) ? "P" : "L";
      const rWali = (waliIdx !== -1 && cols[waliIdx]) ? cols[waliIdx].trim() : "Orang Tua / Wali";
      const rHub = (hubIdx !== -1 && cols[hubIdx]) ? cols[hubIdx].trim() : "Orang Tua";
      const rCat = (catIdx !== -1 && cols[catIdx]) ? cols[catIdx].trim() : "";

      let rHp = "";
      if (hpIdx !== -1 && cols[hpIdx]) {
        const rawHpVal = cols[hpIdx].trim();
        if (!/[a-zA-Z]/.test(rawHpVal) && rawHpVal.replace(/\D/g, '').length >= 7) {
          let digits = rawHpVal.replace(/^['"`\s]+/, '').replace(/[\s\-\.\(\)]/g, '').replace(/\D/g, '');
          if (digits.startsWith('8')) {
            rHp = '0' + digits;
          } else if (digits.startsWith('62')) {
            rHp = '0' + digits.substring(2);
          } else if (digits.startsWith('0')) {
            rHp = digits;
          } else {
            rHp = digits;
          }
        }
      }

      if (!rNama && !rNisn) continue;

      // 1. Kelola Kelas (Auto Create)
      let kelasId = null;
      if (rKelas) {
        const classKey = rKelas.toLowerCase();
        if (classCache[classKey]) {
          kelasId = classCache[classKey];
        } else {
          kelasId = "k-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
          db.kelas.push({
            id: kelasId,
            nama: rKelas,
            waliKelas: "Belum Diatur"
          });
          classCache[classKey] = kelasId;
          newClassesCount++;
        }
      }

      // 2. Kelola Siswa (Add or Update)
      let matchedStudent = null;
      if (rNisn && rNisn !== "-") {
        matchedStudent = db.siswa.find(s => isSameNisn(s.nisn, rNisn));
      }
      if (!matchedStudent && rNama) {
        matchedStudent = db.siswa.find(s => s.nama && s.nama.trim().toLowerCase() === rNama.toLowerCase() && s.kelasId === kelasId);
      }

      if (matchedStudent) {
        if (rNama) matchedStudent.nama = rNama;
        if (kelasId) matchedStudent.kelasId = kelasId;
        if (rGender) matchedStudent.gender = rGender;
        if (rWali && rWali !== "-") matchedStudent.namaWali = rWali;
        if (rHub) matchedStudent.hubungan = rHub;
        if (rHp) matchedStudent.noHp = rHp;
        if (rCat) matchedStudent.catatan = rCat;
        updatedStudentsCount++;
      } else {
        const newStudentId = "s-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
        db.siswa.push({
          id: newStudentId,
          nisn: rNisn || "-",
          nama: rNama || "Siswa Baru",
          kelasId: kelasId,
          gender: rGender,
          namaWali: (rWali && rWali !== "-") ? rWali : "",
          hubungan: rHub,
          noHp: rHp,
          catatan: rCat
        });
        newStudentsCount++;
      }

      // 3. Kelola Kontak Wali
      let existingKw = db.kontakWali.find(k => {
        if (rNisn && rNisn !== "-" && k.nisn && k.nisn !== "-") {
          return isSameNisn(k.nisn, rNisn);
        }
        return k.namaSiswa && rNama && k.namaSiswa.trim().toLowerCase() === rNama.toLowerCase();
      });

      if (existingKw) {
        if (rWali && rWali !== "-") existingKw.namaWali = rWali;
        if (rHub) existingKw.hubungan = rHub;
        if (rHp) existingKw.noHp = rHp;
        if (rCat) existingKw.catatan = rCat;
        if (rKelas) existingKw.kelasNama = rKelas;
        if (rNama) existingKw.namaSiswa = rNama;
        if (rNisn) existingKw.nisn = rNisn;
        if (rHp) contactsCount++;
      } else {
        db.kontakWali.push({
          id: "kw-" + Date.now() + "-" + i + "-" + Math.floor(Math.random() * 1000),
          sekolah: userSchool,
          nisn: rNisn,
          namaSiswa: rNama,
          kelasNama: rKelas,
          namaWali: (rWali && rWali !== "-") ? rWali : "",
          hubungan: rHub,
          noHp: rHp,
          catatan: rCat
        });
        if (rHp) contactsCount++;
      }
    }

    await saveDatabase(true);
    closeModal();

    const summaryHtml = `
      <div style="text-align: center; padding: 16px 10px;">
        <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); color: #10b981; display: inline-flex; align-items: center; justify-content: center; font-size: 2rem; margin-bottom: 14px;">
          <i class="fas fa-check"></i>
        </div>
        <h4 style="margin: 0; font-weight: 700; color: var(--text-main); font-size: 1.2rem;">Sinkronisasi Master Berhasil!</h4>
        <p style="margin: 10px 0 16px; color: var(--text-muted); font-size: 0.88rem; line-height: 1.6;">
          Data master sekolah berhasil disinkronkan ke akun Anda:
        </p>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px;">
          <div style="background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px;">
            <div style="font-size: 1.3rem; font-weight: 700; color: #2563eb;">${db.kelas.length}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Total Kelas (+${newClassesCount})</div>
          </div>
          <div style="background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px;">
            <div style="font-size: 1.3rem; font-weight: 700; color: #10b981;">${db.siswa.length}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Total Siswa (+${newStudentsCount})</div>
          </div>
          <div style="background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px;">
            <div style="font-size: 1.3rem; font-weight: 700; color: #f59e0b;">${db.kontakWali.length}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Kontak Wali (${contactsCount} No WA)</div>
          </div>
        </div>
        <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0;">
          Semua modul (Absensi, Nilai, Jurnal, dan Kontak) kini siap digunakan dengan data ini.
        </p>
      </div>
    `;

    openModal("Sinkronisasi Selesai", summaryHtml, `
      <button class="btn btn-primary" onclick="closeModal(); location.reload();" style="width: 100%; justify-content: center;">
        <i class="fas fa-check"></i> Selesai
      </button>
    `);

  } catch (err) {
    console.error("Sync Master error:", err);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-cloud-arrow-down"></i> Tarik & Sinkronkan Sekarang`;
    }
    alert("Gagal menyinkronkan data master sekolah:\n" + err.message + "\n\nPastikan:\n1. Tautan Google Spreadsheet benar.\n2. Hak akses Google Sheets disetel ke 'Siapa saja yang memiliki link' (Pelihat/Viewer).");
  }
}

// ============================================================
// SINKRONISASI ABSENSI SISWA KE GOOGLE SPREADSHEET
// ============================================================

const GOOGLE_APPS_SCRIPT_ABSENSI_CODE = `/**
 * ============================================================
 * SMAN SAKU - SINKRONISASI ABSENSI SISWA KE GOOGLE SPREADSHEET
 * ============================================================
 * Fitur Unggulan:
 * - Smart Upsert: Otomatis memperbarui baris (Update in-place) jika data sudah ada,
 *   dan hanya membuat baris baru (Insert) jika belum pernah ada.
 * - Deteksi Presisi Ganda: Pencocokan dengan kombinasi Tanggal + Kelas + Mapel + NISN (atau Nama Siswa).
 * - Anti-Duplikat: Kebal terhadap perbedaan timezone server/script dan format tanggal/angka.
 * - Dilengkapi fungsi 'hapusDuplikatAbsensi()' untuk membersihkan baris ganda yang sudah terlanjur ada.
 * 
 * Petunjuk Pemasangan / Pembaruan:
 * 1. Buka spreadsheet Anda (DATABASE_SMAN_SAKU_2026) di Google Sheets.
 * 2. Klik menu Ekstensi (Extensions) > Apps Script.
 * 3. Hapus kode bawaan / kode lama jika ada, lalu tempel (Paste) seluruh kode ini.
 * 4. Simpan proyek script (ikon disket atau tekan Ctrl+S).
 * 5. Klik tombol biru 'Terapkan' (Deploy) di kanan atas:
 *    - Jika sebelumnya SUDAH PERNAH deploy: Pilih 'Kelola deployment' (Manage deployments) >
 *      Klik ikon Pensil (Edit) > Pada 'Versi' pilih 'Versi baru' > Klik 'Terapkan' (Deploy).
 *    - Jika BARU PERTAMA KALI: Pilih 'Deployment baru' (New deployment) > Jenis 'Aplikasi web' >
 *      Jalankan sebagai: 'Saya' > Akses: 'Siapa saja' (Anyone) > Klik 'Terapkan' (Deploy).
 * 6. Salin URL Web App yang berakhiran /exec lalu tempelkan ke aplikasi SMAN SAKU.
 */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    message: "Layanan Sinkronisasi Absensi SMAN SAKU Aktif",
    waktu: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function normalizeDateStr(dispVal, rawVal, tz) {
  if (dispVal) {
    var s = String(dispVal).trim();
    var isoMatch = s.match(/^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})/);
    if (isoMatch) return isoMatch[1] + "-" + ("0" + isoMatch[2]).slice(-2) + "-" + ("0" + isoMatch[3]).slice(-2);
    var dmyMatch = s.match(/^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})/);
    if (dmyMatch) return dmyMatch[3] + "-" + ("0" + dmyMatch[2]).slice(-2) + "-" + ("0" + dmyMatch[1]).slice(-2);
  }
  if (rawVal && (rawVal instanceof Date || (typeof rawVal === 'object' && typeof rawVal.getTime === 'function'))) {
    return Utilities.formatDate(rawVal, tz || "Asia/Jakarta", "yyyy-MM-dd");
  }
  if (dispVal) {
    var p = new Date(String(dispVal));
    if (!isNaN(p.getTime())) {
      return Utilities.formatDate(p, tz || "Asia/Jakarta", "yyyy-MM-dd");
    }
  }
  return String(dispVal || rawVal || "").trim();
}

function normalizeNisn(val) {
  if (!val) return "";
  var s = String(val).trim();
  if (s === "-" || s === "null" || s === "undefined") return "";
  var digits = s.replace(/\\D/g, "");
  return digits.replace(/^0+/, "") || digits;
}

function normalizeText(val) {
  return String(val || "").trim().toLowerCase().replace(/\\s+/g, " ");
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // Cegah konflik saat banyak guru menyimpan bersamaan
    
    var raw = e.postData.contents;
    var data = JSON.parse(raw);
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = ss.getSpreadsheetTimeZone() || "Asia/Jakarta";
    var sheetName = data.sheetName || "DATA_ABSENSI";
    var sheet = ss.getSheetByName(sheetName);
    
    var defaultHeaders = [
      "Waktu Input",
      "Tanggal",
      "Kelas",
      "NISN",
      "Nama Siswa",
      "Jenis Kelamin",
      "Status Kehadiran",
      "Mata Pelajaran",
      "Guru Pengampu",
      "Catatan"
    ];
    
    // Buat tab sheet otomatis jika belum ada
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(defaultHeaders);
      
      var headerRange = sheet.getRange(1, 1, 1, defaultHeaders.length);
      headerRange.setBackground("#1e40af"); // Biru SMAN SAKU
      headerRange.setFontColor("#ffffff");
      headerRange.setFontWeight("bold");
      headerRange.setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
    }
    
    if (data.action === "test") {
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Koneksi ke tab " + sheetName + " berhasil!"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var records = data.records || [];
    if (records.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Tidak ada data absensi untuk diproses."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var lastRow = sheet.getLastRow();
    var lastCol = Math.max(sheet.getLastColumn(), 10);
    
    // Deteksi posisi indeks kolom dari baris header secara dinamis
    var headerValues = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    function findCol(keywords, fallbackIdx) {
      for (var k = 0; k < headerValues.length; k++) {
        var h = String(headerValues[k] || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        for (var w = 0; w < keywords.length; w++) {
          if (h.indexOf(keywords[w]) !== -1) return k + 1;
        }
      }
      return fallbackIdx;
    }
    
    var colTimestamp = findCol(["timestamp", "waktu"], 1);
    var colTanggal   = findCol(["tanggal", "tgl", "date"], 2);
    var colKelas     = findCol(["kelas", "rombel", "class"], 3);
    var colNisn      = findCol(["nisn", "nis"], 4);
    var colNama      = findCol(["nama", "siswa", "student"], 5);
    var colGender    = findCol(["kelamin", "gender", "pl", "jk"], 6);
    var colStatus    = findCol(["status", "kehadiran", "presensi", "absen"], 7);
    var colMapel     = findCol(["mapel", "pelajaran", "subject"], 8);
    var colGuru      = findCol(["guru", "pengampu", "teacher"], 9);
    var colCatatan   = findCol(["catatan", "tindak", "lanjut", "note", "keterangan"], 10);
    
    // Pindai data yang sudah ada di sheet (menggunakan getDisplayValues & getValues)
    var existingMap = {};
    if (lastRow > 1) {
      var numRows = lastRow - 1;
      var dispRange = sheet.getRange(2, 1, numRows, lastCol).getDisplayValues();
      var rawRange  = sheet.getRange(2, 1, numRows, lastCol).getValues();
      
      for (var r = 0; r < numRows; r++) {
        var dRow = dispRange[r];
        var rRow = rawRange[r];
        
        var rTanggal = normalizeDateStr(dRow[colTanggal - 1], rRow[colTanggal - 1], tz);
        var rKelas   = normalizeText(dRow[colKelas - 1] || rRow[colKelas - 1]);
        var rMapel   = normalizeText(dRow[colMapel - 1] || rRow[colMapel - 1]);
        var rNisn    = normalizeNisn(dRow[colNisn - 1] || rRow[colNisn - 1]);
        var rNama    = normalizeText(dRow[colNama - 1] || rRow[colNama - 1]);
        var actualRow = r + 2;
        
        if (rNisn) {
          existingMap[rTanggal + "_" + rKelas + "_" + rMapel + "_nisn_" + rNisn] = actualRow;
        }
        if (rNama) {
          existingMap[rTanggal + "_" + rKelas + "_" + rMapel + "_nama_" + rNama] = actualRow;
        }
      }
    }
    
    var nowStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
    var updatedCount = 0;
    var insertedRows = [];
    
    for (var i = 0; i < records.length; i++) {
      var item = records[i];
      var tgl = normalizeDateStr(String(item.tanggal || data.tanggal || "").trim(), null, tz);
      var kls = normalizeText(item.kelas || data.kelas || "");
      var mpl = normalizeText(item.mapel || data.mapel || "");
      var nisnNorm = normalizeNisn(item.nisn);
      var namaNorm = normalizeText(item.nama);
      
      var rawKls   = String(item.kelas || data.kelas || "").trim();
      var rawNisn  = String(item.nisn || "").trim();
      var rawNama  = String(item.nama || "").trim();
      var rawJk    = String(item.gender || item.jk || "").trim();
      var status   = String(item.status || "").trim();
      var rawMpl   = String(item.mapel || data.mapel || "").trim();
      var guru     = String(item.guru || data.guru || "").trim();
      var catatan  = String(item.catatan || "").trim();
      
      var matchRow = null;
      if (nisnNorm && existingMap[tgl + "_" + kls + "_" + mpl + "_nisn_" + nisnNorm]) {
        matchRow = existingMap[tgl + "_" + kls + "_" + mpl + "_nisn_" + nisnNorm];
      } else if (namaNorm && existingMap[tgl + "_" + kls + "_" + mpl + "_nama_" + namaNorm]) {
        matchRow = existingMap[tgl + "_" + kls + "_" + mpl + "_nama_" + namaNorm];
      }
      
      if (matchRow) {
        // UPDATE BARIS YANG SUDAH ADA (TIDAK DOBEL)
        sheet.getRange(matchRow, colTimestamp).setValue(nowStr);
        sheet.getRange(matchRow, colStatus).setValue(status);
        if (guru) sheet.getRange(matchRow, colGuru).setValue(guru);
        if (catatan) sheet.getRange(matchRow, colCatatan).setValue(catatan);
        updatedCount++;
      } else {
        // SISIPKAN BARIS BARU HANYA JIKA BELUM PERNAH ADA
        var newRow = new Array(lastCol);
        for (var c = 0; c < lastCol; c++) newRow[c] = "";
        
        newRow[colTimestamp - 1] = nowStr;
        newRow[colTanggal - 1]   = tgl;
        newRow[colKelas - 1]     = rawKls;
        newRow[colNisn - 1]      = rawNisn ? "'" + rawNisn : ""; // Cegah Google Sheets memotong angka 0 di depan
        newRow[colNama - 1]      = rawNama;
        newRow[colGender - 1]    = rawJk;
        newRow[colStatus - 1]    = status;
        newRow[colMapel - 1]     = rawMpl;
        newRow[colGuru - 1]      = guru;
        newRow[colCatatan - 1]   = catatan;
        
        insertedRows.push(newRow);
        
        var newlyAssignedRow = lastRow + insertedRows.length;
        if (nisnNorm) existingMap[tgl + "_" + kls + "_" + mpl + "_nisn_" + nisnNorm] = newlyAssignedRow;
        if (namaNorm) existingMap[tgl + "_" + kls + "_" + mpl + "_nama_" + namaNorm] = newlyAssignedRow;
      }
    }
    
    if (insertedRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, insertedRows.length, lastCol).setValues(insertedRows);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      updated: updatedCount,
      inserted: insertedRows.length,
      total: records.length,
      timestamp: nowStr
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Fungsi Bantuan: Hapus Duplikat Absensi
 * Jalankan fungsi ini langsung dari editor Apps Script jika spreadsheet Anda terlanjur memiliki baris dobel dari pengujian sebelumnya.
 */
function hapusDuplikatAbsensi() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("DATA_ABSENSI");
  if (!sheet) {
    Logger.log("Tab DATA_ABSENSI tidak ditemukan.");
    return;
  }
  var lastRow = sheet.getLastRow();
  if (lastRow <= 2) {
    Logger.log("Tidak ada cukup data untuk diperiksa.");
    return;
  }
  
  var tz = ss.getSpreadsheetTimeZone() || "Asia/Jakarta";
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var disp = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getDisplayValues();
  
  var seen = {};
  var rowsToDelete = [];
  
  // Baca dari baris paling bawah ke atas agar baris terbaru yang dipertahankan
  for (var i = data.length - 1; i >= 0; i--) {
    var tgl = normalizeDateStr(disp[i][1], data[i][1], tz);
    var kls = normalizeText(disp[i][2]);
    var nisn = normalizeNisn(disp[i][3]);
    var nama = normalizeText(disp[i][4]);
    var mpl = normalizeText(disp[i][7]);
    
    var key = tgl + "_" + kls + "_" + mpl + "_" + (nisn || nama);
    if (seen[key]) {
      rowsToDelete.push(i + 2);
    } else {
      seen[key] = true;
    }
  }
  
  for (var d = 0; d < rowsToDelete.length; d++) {
    sheet.deleteRow(rowsToDelete[d]);
  }
  Logger.log("Sukses! Berhasil membersihkan " + rowsToDelete.length + " baris duplikat.");
}`;

async function getAbsensiScriptUrl() {
  const local = localStorage.getItem("sman_saku_absensi_script_url");
  if (local && local.trim()) return local.trim();

  if (db && db.absensiScriptUrl && db.absensiScriptUrl.trim()) {
    localStorage.setItem("sman_saku_absensi_script_url", db.absensiScriptUrl.trim());
    return db.absensiScriptUrl.trim();
  }

  if (isCloudMode && supabase) {
    try {
      const { data } = await supabase
        .from("saku_guru_databases")
        .select("data")
        .eq("email", "admin@smansaku.id")
        .maybeSingle();
      if (data && data.data && data.data.absensiScriptUrl) {
        localStorage.setItem("sman_saku_absensi_script_url", data.data.absensiScriptUrl);
        if (db) db.absensiScriptUrl = data.data.absensiScriptUrl;
        return data.data.absensiScriptUrl;
      }
    } catch (e) {
      console.warn("Gagal mengambil absensiScriptUrl dari Supabase:", e);
    }
  }

  // Standar default pusat sekolah SMAN SAKU
  return CENTRAL_ABSENSI_SCRIPT_URL;
}

function copyAbsensiAppsScriptCode() {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_ABSENSI_CODE).then(() => {
      showToast("<i class='fas fa-check-circle' style='color:#10b981;'></i> Kode Google Apps Script berhasil disalin ke clipboard!", "success");
    }).catch(() => {
      fallbackCopyText(GOOGLE_APPS_SCRIPT_ABSENSI_CODE);
    });
  } else {
    fallbackCopyText(GOOGLE_APPS_SCRIPT_ABSENSI_CODE);
  }
}

function fallbackCopyText(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    showToast("<i class='fas fa-check-circle' style='color:#10b981;'></i> Kode Google Apps Script berhasil disalin ke clipboard!", "success");
  } catch (e) {
    alert("Gagal menyalin otomatis. Anda dapat menyalin teks kode secara manual.");
  }
  document.body.removeChild(ta);
}

async function testAbsensiScriptUrl() {
  const input = document.getElementById("absensi-sheets-script-url");
  if (!input) return;
  const url = input.value.trim();
  if (!url) {
    alert("Silakan masukkan URL Web App terlebih dahulu!");
    return;
  }

  showToast("<i class='fas fa-spinner fa-spin'></i> Menguji koneksi ke Google Spreadsheet...");
  try {
    const payload = {
      action: "test",
      sheetName: "DATA_ABSENSI"
    };

    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    alert("✅ Permintaan uji koneksi berhasil dikirim ke Google Apps Script!\n\nJika deployment disetel dengan benar, tab 'DATA_ABSENSI' telah dibuat di Google Spreadsheet Anda.");
  } catch (e) {
    alert("Gagal menghubungi Google Apps Script: " + e.message);
  }
}

async function saveAbsensiScriptUrlFromModal() {
  const input = document.getElementById("absensi-sheets-script-url");
  if (!input) return;
  const url = input.value.trim();

  localStorage.setItem("sman_saku_absensi_script_url", url);
  db.absensiScriptUrl = url;

  const session = getSession();
  if (session && session.role === "admin") {
    if (isCloudMode && supabase) {
      try {
        await supabase
          .from("saku_guru_databases")
          .update({ data: db, updated_at: new Date().toISOString() })
          .eq("email", "admin@smansaku.id");
      } catch (err) {
        console.warn("Gagal update cloud absensiScriptUrl:", err);
      }
    }
  }

  await saveDatabase(false);
  showToast("Pengaturan URL Spreadsheet Absensi berhasil disimpan!", "success");
  closeModal();
}

async function showSpreadsheetAbsensiModal() {
  const currentUrl = await getAbsensiScriptUrl();
  const isConnected = !!currentUrl;
  const masterSheetUrl = await getMasterSpreadsheetUrl();

  const modalHtml = `
    <div style="font-size: 0.88rem; line-height: 1.5;">
      <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); padding: 12px 14px; border-radius: 10px; margin-bottom: 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px; flex-wrap:wrap; gap:8px;">
          <div style="font-weight: 700; color: #10b981; display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-file-excel"></i> Database Absensi ke Spreadsheet
          </div>
          <span class="badge" style="background: ${isConnected ? '#10b981' : '#f59e0b'}; color: #fff; font-size: 0.75rem;">
            <i class="fas fa-${isConnected ? 'check-circle' : 'exclamation-circle'}"></i> ${isConnected ? 'Terkoneksi Otomatis' : 'Belum Terhubung'}
          </span>
        </div>
        <p style="margin: 0; font-size: 0.82rem; color: var(--text-main);">
          Setiap kali guru menyimpan absensi kelas, data kehadiran (Waktu, Tanggal, Kelas, NISN, Nama Siswa, L/P, Status, Mapel, Guru) akan otomatis tersimpan ke tab <b>DATA_ABSENSI</b> di Google Spreadsheet.
        </p>
      </div>

      <div class="form-group">
        <label class="form-label" for="absensi-sheets-script-url" style="font-weight: 600;">
          URL Aplikasi Web Google Apps Script (Web App):
        </label>
        <div style="display:flex; gap:8px;">
          <input type="url" id="absensi-sheets-script-url" class="form-control" placeholder="https://script.google.com/macros/s/.../exec" value="${currentUrl}">
          <button class="btn btn-secondary" type="button" onclick="testAbsensiScriptUrl()" title="Uji Koneksi" style="white-space:nowrap;">
            <i class="fas fa-vial"></i> Uji
          </button>
        </div>
        <small style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-top: 4px;">
          Tempelkan URL Web App yang berakhiran <b>/exec</b> yang didapat dari deployment Google Apps Script.
        </small>
      </div>

      <div style="display:flex; gap:10px; margin-top:12px; margin-bottom: 16px; flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="saveAbsensiScriptUrlFromModal()" style="flex:1; min-width:180px; justify-content:center; background:#2563eb; border-color:#2563eb;">
          <i class="fas fa-save"></i> Simpan URL Pengaturan
        </button>
        <button class="btn btn-secondary" onclick="copyAbsensiAppsScriptCode()" style="color:#2563eb; border-color:#2563eb; font-weight:600;">
          <i class="fas fa-copy"></i> Salin Kode Script
        </button>
      </div>

      <details style="background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.82rem;">
        <summary style="font-weight: 700; cursor: pointer; color: var(--text-main);">
          <i class="fas fa-circle-question" style="color:#2563eb;"></i> Panduan 3 Langkah Memasang di Google Sheets
        </summary>
        <ol style="margin: 10px 0 0; padding-left: 20px; line-height: 1.6; color: var(--text-muted);">
          <li>Buka spreadsheet Google Anda <b>${masterSheetUrl ? `<a href="${masterSheetUrl}" target="_blank" style="color:#2563eb;">(Klik Di Sini untuk Membuka)</a>` : ''}</b>.</li>
          <li>Klik menu <b>Ekstensi (Extensions) > Apps Script</b>.</li>
          <li>Hapus kode bawaan jika ada, klik tombol <b>Salin Kode Script</b> di atas, lalu tempelkan (Paste). Simpan (Ctrl+S).</li>
          <li>Klik tombol biru <b>Terapkan (Deploy) > Deployment baru (New deployment)</b> di kanan atas.</li>
          <li>Pilih jenis (ikon roda gigi): <b>Aplikasi web (Web app)</b>.
            <div style="font-size: 0.76rem; background: var(--bg-input); padding: 6px 10px; border-radius: 6px; margin: 4px 0;">
              • Execute as (Jalankan sebagai): <b>Saya (email Anda)</b><br>
              • Who has access (Yang memiliki akses): <b>Siapa saja (Anyone)</b>
            </div>
          </li>
          <li>Klik <b>Terapkan (Deploy)</b>, izinkan akses akun Google jika diminta, lalu salin <b>Web App URL</b> yang berakhiran <code>/exec</code> dan tempelkan ke kolom form di atas.</li>
        </ol>
      </details>

      <div style="border-top: 1px dashed var(--border-color); padding-top: 12px;">
        <button class="btn btn-secondary" id="btn-sync-all-absensi" onclick="syncAllAbsensiToSpreadsheet()" style="width: 100%; justify-content: center; color: #10b981; border-color: #10b981; font-weight: 600;">
          <i class="fas fa-cloud-arrow-up"></i> Sinkronkan Seluruh Riwayat Absensi (${(db.absensi || []).length} Data) ke Spreadsheet
        </button>
      </div>
    </div>
  `;

  openModal("Pengaturan Sinkronisasi Absensi ke Spreadsheet", modalHtml, `
    <button class="btn btn-secondary" onclick="closeModal()">Tutup</button>
  `);
}

async function syncSessionAbsensiToSpreadsheet({ tanggal, kelasId, mapel }) {
  try {
    const scriptUrl = await getAbsensiScriptUrl();
    if (!scriptUrl) return;

    const cls = (db.kelas || []).find(k => k.id === kelasId);
    const className = cls ? cls.nama : "Umum";
    const session = getSession();
    const guruNama = (db.guruProfile && db.guruProfile.nama) || (session && session.name) || "Guru Pengampu";
    const userSchool = getCurrentSchoolName();

    const sessionRecords = (db.absensi || []).filter(a => a.tanggal === tanggal && a.kelasId === kelasId && a.mapel === mapel);
    if (sessionRecords.length === 0) return;

    const payloadRecords = sessionRecords.map(att => {
      const student = (db.siswa || []).find(s => s.id === att.siswaId) || {};
      return {
        tanggal: tanggal,
        kelas: className,
        mapel: mapel,
        nisn: student.nisn || "-",
        nama: student.nama || "Siswa",
        gender: student.gender || "L",
        status: att.status || "Hadir",
        guru: guruNama,
        catatan: (att.followUp && att.followUp.catatan) ? att.followUp.catatan : ""
      };
    });

    const payload = {
      action: "sync_absensi",
      sheetName: "DATA_ABSENSI",
      sekolah: userSchool,
      guru: guruNama,
      email: session ? session.email : "",
      tanggal: tanggal,
      kelas: className,
      mapel: mapel,
      records: payloadRecords
    };

    fetch(scriptUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).then(() => {
      showToast(`<i class="fas fa-file-excel" style="color:#10b981;"></i> Absensi ${className} (${payloadRecords.length} siswa) tersinkron ke Spreadsheet!`, "success");
    }).catch(err => {
      console.warn("Gagal menyinkronkan absensi ke Google Spreadsheet:", err);
    });

  } catch (err) {
    console.warn("Error syncSessionAbsensiToSpreadsheet:", err);
  }
}

async function syncSpecificSessionToSpreadsheet(tanggal) {
  const kelasId = document.getElementById("absensi-kelas-select").value;
  const mapel = document.getElementById("absensi-mapel-select").value;
  if (!kelasId || !mapel || !tanggal) return;

  const scriptUrl = await getAbsensiScriptUrl();
  if (!scriptUrl) {
    showSpreadsheetAbsensiModal();
    return;
  }

  showToast("<i class='fas fa-spinner fa-spin'></i> Menyinkronkan sesi ke Spreadsheet...");
  await syncSessionAbsensiToSpreadsheet({ tanggal, kelasId, mapel });
}

async function syncAllAbsensiToSpreadsheet() {
  const scriptUrl = await getAbsensiScriptUrl();
  if (!scriptUrl) {
    alert("URL Google Apps Script belum diisi! Silakan simpan URL Web App terlebih dahulu.");
    return;
  }

  const allAbs = db.absensi || [];
  if (allAbs.length === 0) {
    alert("Belum ada data absensi di aplikasi yang dapat disinkronkan.");
    return;
  }

  if (!confirm(`Apakah Anda ingin menyinkronkan seluruh riwayat absensi (${allAbs.length} catatan kehadiran) ke Google Spreadsheet?`)) {
    return;
  }

  const btn = document.getElementById("btn-sync-all-absensi");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Menyinkronkan ${allAbs.length} data...`;
  }

  try {
    const session = getSession();
    const guruNama = (db.guruProfile && db.guruProfile.nama) || (session && session.name) || "Guru Pengampu";
    const userSchool = getCurrentSchoolName();

    const classMap = {};
    (db.kelas || []).forEach(k => { classMap[k.id] = k.nama; });

    const studentMap = {};
    (db.siswa || []).forEach(s => { studentMap[s.id] = s; });

    const records = allAbs.map(att => {
      const student = studentMap[att.siswaId] || {};
      return {
        tanggal: att.tanggal,
        kelas: classMap[att.kelasId] || "Umum",
        mapel: att.mapel || "Umum",
        nisn: student.nisn || "-",
        nama: student.nama || "Siswa",
        gender: student.gender || "L",
        status: att.status || "Hadir",
        guru: guruNama,
        catatan: (att.followUp && att.followUp.catatan) ? att.followUp.catatan : ""
      };
    });

    const payload = {
      action: "sync_absensi",
      sheetName: "DATA_ABSENSI",
      sekolah: userSchool,
      guru: guruNama,
      records: records
    };

    await fetch(scriptUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    alert(`✅ Berhasil mengirim ${records.length} data absensi ke tab DATA_ABSENSI pada Google Spreadsheet!`);
  } catch (err) {
    console.error("Gagal sinkron semua absensi:", err);
    alert("Gagal menyinkronkan data: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-cloud-arrow-up"></i> Sinkronkan Seluruh Riwayat Absensi (${allAbs.length} Data) ke Spreadsheet`;
    }
  }
}

// ------------------------------------------
// GOOGLE SHEETS / SPREADSHEET SINKRONISASI
// ------------------------------------------
function showSyncSpreadsheetModal() {
  const savedUrl = localStorage.getItem("saku_guru_sheets_kontak_url") || "";
  const session = getSession();
  const isAdmin = session && session.role === "admin";
  const userSchool = getCurrentSchoolName();

  const modalHtml = `
    <div style="font-size: 0.88rem; line-height: 1.5;">
      <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); padding: 12px 14px; border-radius: 10px; margin-bottom: 16px;">
        <div style="font-weight: 700; color: #10b981; margin-bottom: 4px;">
          <i class="fas fa-file-excel"></i> Sinkronisasi Spreadsheet Kontak Wali
        </div>
        <p style="margin: 0; font-size: 0.8rem; color: var(--text-main);">
          ${isAdmin 
            ? "Sebagai <b>Administrator</b>, Anda dapat mengunggah spreadsheet master berisi nomor HP orang tua dari berbagai sekolah. Data akan otomatis terisolasi per sekolah." 
            : `Hanya kontak orang tua dengan nama sekolah <b>"${userSchool}"</b> yang akan disinkronkan ke aplikasi Anda.`}
        </p>
      </div>

      <div class="form-group">
        <label class="form-label" for="sheets-sync-url" style="font-weight: 600;">Tautan (Link) Google Sheets:</label>
        <input type="url" id="sheets-sync-url" class="form-control" placeholder="https://docs.google.com/spreadsheets/d/..." value="${savedUrl}">
        <small style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-top: 4px;">
          Cukup tempelkan tautan Google Sheets Anda (pastikan hak akses disetel ke <b>"Siapa saja yang memiliki link"</b> atau <b>Publikasikan ke Web</b>).
        </small>
      </div>

      <div style="background: var(--bg-app); padding: 12px; border-radius: 8px; font-size: 0.78rem; color: var(--text-muted); margin-bottom: 15px;">
        <b>Format Kolom Spreadsheet:</b>
        <div style="margin-top: 4px; font-family: monospace; background: var(--bg-input); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-color); overflow-x: auto;">
          sekolah | nisn | nama_siswa | kelas | nama_wali | hubungan | no_hp | catatan
        </div>
        <div style="margin-top: 6px; display: flex; gap: 8px; align-items: center;">
          <button class="btn btn-secondary btn-sm" onclick="downloadTemplateKontakCSV()" style="font-size: 0.72rem; padding: 4px 8px;">
            <i class="fas fa-download"></i> Unduh Format Master Spreadsheet
          </button>
        </div>
      </div>
    </div>
  `;

  openModal("Sinkronisasi Kontak dari Google Sheets", modalHtml, `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" id="btn-do-sync-sheets" onclick="executeSyncSpreadsheet()">
      <i class="fas fa-cloud-download-alt"></i> Tarik Data Sekarang
    </button>
  `);
}

async function executeSyncSpreadsheet() {
  const urlInput = document.getElementById("sheets-sync-url");
  if (!urlInput) return;
  const rawUrl = urlInput.value.trim();

  if (!rawUrl) {
    alert("Silakan masukkan tautan Google Sheets terlebih dahulu!");
    return;
  }

  // Convert regular Google Sheets link to CSV export URL
  let csvUrl = rawUrl;
  const sheetIdMatch = rawUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (sheetIdMatch && sheetIdMatch[1]) {
    const sheetId = sheetIdMatch[1];
    const gidMatch = rawUrl.match(/gid=([0-9]+)/);
    const gid = gidMatch ? gidMatch[1] : "0";
    csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  }

  const btn = document.getElementById("btn-do-sync-sheets");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Mengunduh Spreadsheet...`;
  }

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) {
      throw new Error(`Gagal mengunduh spreadsheet (Status HTTP: ${res.status}). Pastikan dokumen disetel Publik / Share Anyone.`);
    }

    const csvText = await res.text();
    localStorage.setItem("saku_guru_sheets_kontak_url", rawUrl);

    // Buka Column Mapper & Data Quality Preview
    parseAndPreviewKontakCSV(csvText, "Google Sheets");
  } catch (err) {
    console.error("Sync Google Sheets error:", err);
    alert("Gagal menyinkronkan dari Google Sheets:\n" + err.message + "\n\nTips: Di Google Sheets, klik menu File > Bagikan > Publikasikan ke web > pilih CSV, lalu salin link yang muncul.");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-cloud-download-alt"></i> Coba Lagi`;
    }
  }
}

// ------------------------------------------
// PROSES CSV UNTUK KONTAK WALI (MULTI-SEKOLAH)
// ------------------------------------------
function processImportedKontakCSV(csvInput, mapping = null) {
  if (!csvInput) return { updated: 0, total: 0, withPhone: 0 };
  
  let lines = [];
  let delimiter = ',';
  if (Array.isArray(csvInput)) {
    lines = csvInput;
  } else if (typeof csvInput === 'string') {
    let cleanText = csvInput;
    if (cleanText.charCodeAt(0) === 0xFEFF) cleanText = cleanText.slice(1);
    lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  }
  if (lines.length < 2) {
    return { updated: 0, total: 0, withPhone: 0 };
  }

  const cleanHeaderLine = lines[0].replace(/^\uFEFF/, '').trim();
  delimiter = cleanHeaderLine.includes('\t') ? '\t' : (cleanHeaderLine.includes(';') ? ';' : ',');

  let sekolahIdx = -1;
  let nisnIdx = -1;
  let namaIdx = -1;
  let kelasIdx = -1;
  let waliIdx = -1;
  let hubIdx = -1;
  let hpIdx = -1;
  let catIdx = -1;
  let useActiveSchool = false;
  const userSchool = getCurrentSchoolName();

  if (mapping) {
    sekolahIdx = mapping.sekolahIdx === 'USE_ACTIVE_SCHOOL' ? -1 : parseInt(mapping.sekolahIdx);
    useActiveSchool = mapping.sekolahIdx === 'USE_ACTIVE_SCHOOL' || mapping.sekolahIdx === '-1';
    nisnIdx = parseInt(mapping.nisnIdx);
    namaIdx = parseInt(mapping.namaIdx);
    kelasIdx = parseInt(mapping.kelasIdx);
    waliIdx = parseInt(mapping.waliIdx);
    hubIdx = parseInt(mapping.hubIdx);
    hpIdx = parseInt(mapping.hpIdx);
    catIdx = parseInt(mapping.catIdx);
  } else {
    const rawHeaders = parseCSVLine(cleanHeaderLine, delimiter);
    const headers = rawHeaders.map(h => (h || '').toLowerCase().trim().replace(/["']/g, ''));

    sekolahIdx = headers.findIndex(h => h.includes('sekolah') || h.includes('school') || h.includes('instansi') || h.includes('lembaga'));
    nisnIdx = headers.findIndex(isNisnHeader);
    namaIdx = headers.findIndex(isNamaSiswaHeader);
    kelasIdx = headers.findIndex(isKelasHeader);
    waliIdx = headers.findIndex(isWaliHeader);
    hubIdx = headers.findIndex(isHubunganHeader);
    hpIdx = headers.findIndex(isPhoneHeader);
    catIdx = headers.findIndex(h => h.includes('catatan') || h.includes('keterangan') || h.includes('alamat') || h.includes('notes'));

    if (headers.length >= 7) {
      if (sekolahIdx === -1) sekolahIdx = 0;
      if (nisnIdx === -1) nisnIdx = 1;
      if (namaIdx === -1) namaIdx = 2;
      if (kelasIdx === -1) kelasIdx = 3;
      if (waliIdx === -1) waliIdx = 4;
      if (hubIdx === -1) hubIdx = 5;
      if (hpIdx === -1) hpIdx = 6;
      if (catIdx === -1) catIdx = 7;
    }
  }

  let updateCount = 0;
  let totalValidRows = 0;
  let withPhoneCount = 0;
  db.kontakWali = db.kontakWali || [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i], delimiter);
    if (cols.length < 2 || cols.every(c => !c.trim())) continue;

    const rowSekolah = (!useActiveSchool && sekolahIdx !== -1 && cols[sekolahIdx]) ? cols[sekolahIdx].trim() : userSchool;
    const rowNisn = (nisnIdx !== -1 && cols[nisnIdx]) ? cols[nisnIdx].trim() : "";
    const rowNama = (namaIdx !== -1 && cols[namaIdx]) ? cols[namaIdx].trim() : "";
    const rowKelas = (kelasIdx !== -1 && cols[kelasIdx]) ? cols[kelasIdx].trim() : "";
    const rowWali = (waliIdx !== -1 && cols[waliIdx]) ? cols[waliIdx].trim() : "";
    const rowHub = (hubIdx !== -1 && cols[hubIdx]) ? cols[hubIdx].trim() : "Orang Tua";
    
    let rowHp = "";
    if (hpIdx !== -1 && cols[hpIdx]) {
      const rawVal = cols[hpIdx].trim();
      if (!/[a-zA-Z]/.test(rawVal) && rawVal.replace(/\D/g, '').length >= 7) {
        let digits = rawVal.replace(/^['"`\s]+/, '').replace(/[\s\-\.\(\)]/g, '').replace(/\D/g, '');
        if (digits.startsWith('8')) {
          rowHp = '0' + digits;
        } else if (digits.startsWith('62')) {
          rowHp = '0' + digits.substring(2);
        } else if (digits.startsWith('0')) {
          rowHp = digits;
        } else {
          rowHp = digits;
        }
      }
    }
    if (rowHp) withPhoneCount++;
    const rowCat = (catIdx !== -1 && cols[catIdx]) ? cols[catIdx].trim() : "";

    if (!rowNama && !rowNisn && !rowWali && !rowHp) continue;
    totalValidRows++;

    // 1. Cocokkan dengan db.siswa jika sekolah baris ini sama dengan sekolah aplikasi saat ini
    let matchedSiswa = null;
    if (isSameSchool(rowSekolah, userSchool)) {
      if (rowNisn && rowNisn !== "-") {
        matchedSiswa = db.siswa.find(s => isSameNisn(s.nisn, rowNisn));
      }
      if (!matchedSiswa && rowNama) {
        matchedSiswa = db.siswa.find(s => s.nama && s.nama.trim().toLowerCase() === rowNama.trim().toLowerCase());
      }

      if (matchedSiswa) {
        if (rowWali && rowWali !== "-") matchedSiswa.namaWali = rowWali;
        if (rowHub) matchedSiswa.hubungan = rowHub;
        if (rowHp) matchedSiswa.noHp = rowHp;
        if (rowCat) matchedSiswa.catatan = rowCat;
        updateCount++;
      }
    }

    // 2. Simpan ke db.kontakWali dengan identitas sekolahnya masing-masing
    const existingKw = db.kontakWali.find(k => {
      if (!isSameSchool(k.sekolah || userSchool, rowSekolah)) return false;
      
      if (rowNisn && rowNisn !== "-" && k.nisn && k.nisn !== "-") {
        return isSameNisn(k.nisn, rowNisn);
      }
      return k.namaSiswa && rowNama && k.namaSiswa.trim().toLowerCase() === rowNama.trim().toLowerCase();
    });

    if (existingKw) {
      if (rowWali && rowWali !== "-") existingKw.namaWali = rowWali;
      if (rowHub) existingKw.hubungan = rowHub;
      if (rowHp) existingKw.noHp = rowHp;
      if (rowCat) existingKw.catatan = rowCat;
      if (rowKelas) existingKw.kelasNama = rowKelas;
      if (rowNama && !existingKw.namaSiswa) existingKw.namaSiswa = rowNama;
      if (rowNisn && !existingKw.nisn) existingKw.nisn = rowNisn;
    } else {
      db.kontakWali.push({
        id: "kw-" + Date.now() + "-" + i + "-" + Math.floor(Math.random() * 1000),
        sekolah: rowSekolah,
        nisn: rowNisn,
        namaSiswa: rowNama,
        kelasNama: rowKelas,
        namaWali: (rowWali && rowWali !== "-") ? rowWali : "",
        hubungan: rowHub,
        noHp: rowHp,
        catatan: rowCat
      });
    }
    if (!matchedSiswa) updateCount++;
  }

  saveDatabase(true);
  return { updated: updateCount, total: totalValidRows, withPhone: withPhoneCount };
}

// ------------------------------------------
// UNDUH TEMPLATE & IMPORT FILE CSV (MULTI-SEKOLAH)
// ------------------------------------------
function downloadTemplateKontakCSV() {
  const headers = ["sekolah", "nisn", "nama_siswa", "kelas", "nama_wali", "hubungan", "no_hp", "catatan"];
  const rows = [headers.join(",")];
  const userSchool = getCurrentSchoolName();

  // Pre-fill dengan data siswa yang ada di sekolah saat ini
  if (db.siswa && db.siswa.length > 0) {
    db.siswa.forEach(s => {
      const k = db.kelas ? db.kelas.find(item => item.id === s.kelasId) : null;
      const kelasNama = k ? k.nama : "";
      rows.push([
        `"${userSchool}"`,
        `"${s.nisn || ''}"`,
        `"${(s.nama || '').replace(/"/g, '""')}"`,
        `"${kelasNama}"`,
        `"${(s.namaWali && s.namaWali !== '-' ? s.namaWali : '').replace(/"/g, '""')}"`,
        `"${s.hubungan || 'Ayah'}"`,
        `"${s.noHp || ''}"`,
        `"${(s.catatan || '').replace(/"/g, '""')}"`
      ].join(","));
    });
  } else {
    rows.push(`"${userSchool}","0098991122","Aditya Pratama","X A","Drs. Hendro Wibowo","Ayah","081234567890",""`);
    rows.push(`"${userSchool}","0098991123","Rizky Ramadhan","X B","Hj. Siti Aminah","Ibu","081398765432",""`);
  }

  const csvContent = rows.join("\r\n");
  downloadCSV(csvContent, "format_master_kontak_wali_sekolah.csv");
}

function showImportKontakCSVModal() {
  const userSchool = getCurrentSchoolName();
  const session = getSession();
  const isAdmin = session && session.role === "admin";

  window.pendingKontakImportData = null;

  const modalHtml = `
    <div style="font-size: 0.88rem;">
      <p style="color: var(--text-muted); margin-bottom: 12px; line-height: 1.5;">
        Unggah berkas CSV daftar kontak orang tua/wali siswa. Anda dapat mencocokkan kolom secara interaktif setelah berkas dipilih.
      </p>

      <div style="background: var(--bg-app); padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 0.8rem; border-left: 4px solid var(--primary);">
        <div><b>Sekolah Aktif Anda:</b> ${userSchool}</div>
        <div style="color: var(--text-muted); margin-top: 2px;">
          ${isAdmin ? '<span style="color: #10b981; font-weight: 600;"><i class="fas fa-shield-alt"></i> Mode Administrator:</span> Anda bisa mengimpor kontak dari banyak sekolah sekaligus dalam 1 berkas master.' : 'Hanya baris dengan sekolah ini yang akan disinkronkan ke daftar siswa Anda.'}
        </div>
      </div>

      <div style="display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; align-items: center;">
        <button type="button" class="btn btn-secondary btn-sm" onclick="downloadTemplateKontakCSV()">
          <i class="fas fa-download"></i> Unduh Format Master (.CSV)
        </button>
      </div>

      <!-- Dropzone Area -->
      <div id="import-kontak-dropzone" class="import-dropzone" 
           onclick="document.getElementById('import-kontak-file').click()"
           ondragover="handleKontakDragOver(event)"
           ondragleave="handleKontakDragLeave(event)"
           ondrop="handleKontakDrop(event)"
           style="cursor: pointer; padding: 26px 16px; text-align: center; border: 2px dashed var(--border-color); border-radius: 12px; transition: all 0.2s ease;">
        <i class="fas fa-file-csv" style="font-size: 2.5rem; color: #10b981; margin-bottom: 10px;"></i>
        <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">Klik untuk Memilih Berkas CSV Kontak</div>
        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">atau seret dan lepaskan berkas di sini</div>
        <div style="margin-top: 12px;">
          <label for="import-kontak-file" class="btn btn-primary btn-sm" onclick="event.stopPropagation()" style="cursor: pointer; pointer-events: auto;">
            <i class="fas fa-folder-open"></i> Cari Berkas di Perangkat
          </label>
        </div>
        <input type="file" id="import-kontak-file" accept=".csv,text/csv,text/plain,application/vnd.ms-excel,text/comma-separated-values,*" style="display: none;" onchange="handleKontakFileSelected(event)">
      </div>

      <!-- Status Indicator -->
      <div id="import-kontak-status" style="margin-top: 12px; font-weight: 600; font-size: 0.85rem; color: var(--hadir); display: none;"></div>
    </div>
  `;

  openModal("Import Kontak Wali dari Berkas CSV", modalHtml, `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
  `, false);
}

function handleKontakDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const dz = document.getElementById("import-kontak-dropzone");
  if (dz) dz.style.borderColor = "var(--primary)";
}

function handleKontakDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const dz = document.getElementById("import-kontak-dropzone");
  if (dz) dz.style.borderColor = "var(--border-color)";
}

function handleKontakDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const dz = document.getElementById("import-kontak-dropzone");
  if (dz) dz.style.borderColor = "var(--border-color)";

  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    readAndPreviewKontakFile(e.dataTransfer.files[0]);
  }
}

function handleKontakFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  readAndPreviewKontakFile(file);
}

function readAndPreviewKontakFile(file) {
  const statusEl = document.getElementById("import-kontak-status");
  if (statusEl) {
    statusEl.style.display = "block";
    statusEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Membaca berkas ${file.name}...`;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const text = evt.target.result;
      parseAndPreviewKontakCSV(text, file.name);
    } catch (err) {
      console.error("Gagal membaca file kontak CSV:", err);
      alert("Gagal membaca file: " + err.message);
      if (statusEl) statusEl.style.display = "none";
    }
  };
  reader.onerror = function() {
    alert("Gagal membaca file berkas!");
    if (statusEl) statusEl.style.display = "none";
  };
  reader.readAsText(file);
}

function parseAndPreviewKontakCSV(csvText, fileName) {
  if (csvText.charCodeAt(0) === 0xFEFF) {
    csvText = csvText.slice(1);
  }
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) {
    alert("Berkas tidak memiliki baris data (kosong atau hanya baris judul).");
    return;
  }

  const cleanHeaderLine = lines[0].replace(/^\uFEFF/, '').trim();
  const delimiter = cleanHeaderLine.includes('\t') ? '\t' : (cleanHeaderLine.includes(';') ? ';' : ',');
  const rawHeaders = parseCSVLine(cleanHeaderLine, delimiter);
  const cleanHeaders = rawHeaders.map((h, idx) => (h && h.trim()) ? h.trim() : `Kolom ${idx + 1}`);
  const hLower = cleanHeaders.map(h => h.toLowerCase());

  // Filter valid data rows
  const dataRows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i], delimiter);
    if (cols.length >= 2 && !cols.every(c => !c.trim())) {
      dataRows.push(cols);
    }
  }

  if (dataRows.length === 0) {
    alert("Tidak ditemukan baris data kontak yang valid dalam berkas.");
    return;
  }

  // 1. Deteksi otomatis indeks kolom
  let sekolahIdx = hLower.findIndex(h => h.includes('sekolah') || h.includes('school') || h.includes('instansi') || h.includes('lembaga'));
  let nisnIdx = hLower.findIndex(isNisnHeader);
  let namaIdx = hLower.findIndex(isNamaSiswaHeader);
  let kelasIdx = hLower.findIndex(isKelasHeader);
  let waliIdx = hLower.findIndex(isWaliHeader);
  let hubIdx = hLower.findIndex(isHubunganHeader);
  let catIdx = hLower.findIndex(h => h.includes('catatan') || h.includes('keterangan') || h.includes('alamat') || h.includes('notes'));

  // Deteksi kolom HP (berdasarkan nama header)
  let hpIdx = hLower.findIndex(isPhoneHeader);

  // FALLBACK PINTAR: Jika header tidak memuat kata 'hp', pindai baris data untuk mencari kolom yang berisi nomor telepon
  if (hpIdx === -1 && dataRows.length > 0) {
    let bestColIdx = -1;
    let maxPhoneMatches = 0;
    const sampleLimit = Math.min(10, dataRows.length);
    for (let c = 0; c < cleanHeaders.length; c++) {
      let count = 0;
      for (let r = 0; r < sampleLimit; r++) {
        const val = (dataRows[r][c] || '').replace(/[\s\-\.\(\)\+]/g, '');
        if (!/[a-zA-Z]/.test(val) && val.length >= 8 && (val.startsWith('08') || val.startsWith('628') || val.startsWith('8'))) {
          count++;
        }
      }
      if (count > maxPhoneMatches) {
        maxPhoneMatches = count;
        bestColIdx = c;
      }
    }
    if (maxPhoneMatches >= 1) {
      hpIdx = bestColIdx;
    }
  }

  // Positional fallback jika header 7-8 kolom
  if (cleanHeaders.length >= 7) {
    if (sekolahIdx === -1) sekolahIdx = 0;
    if (nisnIdx === -1) nisnIdx = 1;
    if (namaIdx === -1) namaIdx = 2;
    if (kelasIdx === -1) kelasIdx = 3;
    if (waliIdx === -1) waliIdx = 4;
    if (hubIdx === -1) hubIdx = 5;
    if (hpIdx === -1) hpIdx = 6;
    if (catIdx === -1) catIdx = 7;
  }

  const userSchool = getCurrentSchoolName();

  // Simpan data di memori untuk manipulasi pemetaan
  window.pendingKontakImportData = {
    fileName: fileName || "Berkas Kontak",
    delimiter: delimiter,
    headers: cleanHeaders,
    rawLines: lines,
    rows: dataRows
  };

  // Helper untuk membuat opsi select
  const buildOptions = (selectedIdx, includeActiveSchool = false) => {
    let opts = `<option value="-1">-- Tidak Dipetakan / Kosong --</option>`;
    if (includeActiveSchool) {
      const isSel = (selectedIdx === 'USE_ACTIVE_SCHOOL' || selectedIdx === -1);
      opts += `<option value="USE_ACTIVE_SCHOOL" ${isSel ? 'selected' : ''}>🏫 Gunakan Sekolah Aktif Saya: "${userSchool}"</option>`;
    }
    cleanHeaders.forEach((h, idx) => {
      const colLetter = String.fromCharCode(65 + (idx % 26)) + (idx >= 26 ? Math.floor(idx/26) : '');
      const isSel = (selectedIdx === idx) ? 'selected' : '';
      opts += `<option value="${idx}" ${isSel}>Kolom ${colLetter}: ${h}</option>`;
    });
    return opts;
  };

  const modalHtml = `
    <div style="font-size: 0.88rem;">
      <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 10px; padding: 12px 14px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="font-weight: 700; color: #10b981; font-size: 0.95rem;">
            <i class="fas fa-file-csv"></i> ${fileName || 'Berkas Kontak'}
          </span>
          <span class="badge badge-hadir">${dataRows.length} Baris Data Ditemukan</span>
        </div>
        <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">
          Pastikan setiap kolom di bawah ini telah sesuai dengan isi spreadsheet Anda.
        </p>
      </div>

      <!-- Live Quality Alert Banner -->
      <div id="import-kontak-quality-alert"></div>

      <!-- Column Mapping Form Card -->
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 14px; margin-bottom: 16px;">
        <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-main); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <i class="fas fa-columns" style="color: var(--primary);"></i> Pemetaan Kolom Spreadsheet
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; font-size: 0.82rem;">
          <div>
            <label style="font-weight: 700; display: block; margin-bottom: 4px; color: var(--text-main);">
              👤 Nama Siswa <span style="color: #ef4444;">*</span>
            </label>
            <select id="map-kontak-nama" class="form-control form-control-sm" onchange="renderKontakImportPreviewFromMapping()">
              ${buildOptions(namaIdx)}
            </select>
          </div>
          <div>
            <label style="font-weight: 700; display: block; margin-bottom: 4px; color: #10b981;">
              📱 Nomor HP / WhatsApp <span style="color: #ef4444;">*</span>
            </label>
            <select id="map-kontak-hp" class="form-control form-control-sm" style="font-weight: 700; border-color: #10b981;" onchange="renderKontakImportPreviewFromMapping()">
              ${buildOptions(hpIdx)}
            </select>
          </div>
          <div>
            <label style="font-weight: 600; display: block; margin-bottom: 4px; color: var(--text-main);">
              🆔 NISN
            </label>
            <select id="map-kontak-nisn" class="form-control form-control-sm" onchange="renderKontakImportPreviewFromMapping()">
              ${buildOptions(nisnIdx)}
            </select>
          </div>
          <div>
            <label style="font-weight: 600; display: block; margin-bottom: 4px; color: var(--text-main);">
              🏷️ Kelas / Rombel
            </label>
            <select id="map-kontak-kelas" class="form-control form-control-sm" onchange="renderKontakImportPreviewFromMapping()">
              ${buildOptions(kelasIdx)}
            </select>
          </div>
          <div>
            <label style="font-weight: 600; display: block; margin-bottom: 4px; color: var(--text-main);">
              🛡️ Nama Wali / Orang Tua
            </label>
            <select id="map-kontak-wali" class="form-control form-control-sm" onchange="renderKontakImportPreviewFromMapping()">
              ${buildOptions(waliIdx)}
            </select>
          </div>
          <div>
            <label style="font-weight: 600; display: block; margin-bottom: 4px; color: var(--text-main);">
              👥 Hubungan (Ayah/Ibu/Wali)
            </label>
            <select id="map-kontak-hub" class="form-control form-control-sm" onchange="renderKontakImportPreviewFromMapping()">
              ${buildOptions(hubIdx)}
            </select>
          </div>
          <div>
            <label style="font-weight: 600; display: block; margin-bottom: 4px; color: var(--text-main);">
              🏫 Asal Sekolah
            </label>
            <select id="map-kontak-sekolah" class="form-control form-control-sm" onchange="renderKontakImportPreviewFromMapping()">
              ${buildOptions(sekolahIdx !== -1 ? sekolahIdx : 'USE_ACTIVE_SCHOOL', true)}
            </select>
          </div>
          <div>
            <label style="font-weight: 600; display: block; margin-bottom: 4px; color: var(--text-main);">
              📝 Catatan / Alamat
            </label>
            <select id="map-kontak-cat" class="form-control form-control-sm" onchange="renderKontakImportPreviewFromMapping()">
              ${buildOptions(catIdx)}
            </select>
          </div>
        </div>
      </div>

      <!-- Preview Table Container -->
      <div id="import-kontak-preview-table-container"></div>

      <!-- Modal Actions -->
      <div style="display: flex; gap: 10px; justify-content: flex-end; padding-top: 14px; border-top: 1px solid var(--border-color); margin-top: 14px;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Batal</button>
        <button type="button" class="btn btn-primary" id="btn-submit-import-kontak" onclick="confirmExecuteImportKontak()" style="background: #10b981; border-color: #10b981;">
          <i class="fas fa-file-import"></i> Proses Impor Kontak
        </button>
      </div>
    </div>
  `;

  openModal("Pemetaan Kolom & Pratinjau Kontak", modalHtml, "", true);

  // Render preview pertama kali
  renderKontakImportPreviewFromMapping();
}

function renderKontakImportPreviewFromMapping() {
  if (!window.pendingKontakImportData) return;
  const { rows, headers } = window.pendingKontakImportData;
  const userSchool = getCurrentSchoolName();

  const elNama = document.getElementById("map-kontak-nama");
  const elHp = document.getElementById("map-kontak-hp");
  const elNisn = document.getElementById("map-kontak-nisn");
  const elKelas = document.getElementById("map-kontak-kelas");
  const elWali = document.getElementById("map-kontak-wali");
  const elHub = document.getElementById("map-kontak-hub");
  const elSekolah = document.getElementById("map-kontak-sekolah");
  const elCat = document.getElementById("map-kontak-cat");

  const namaIdx = elNama ? parseInt(elNama.value) : -1;
  const hpIdx = elHp ? parseInt(elHp.value) : -1;
  const nisnIdx = elNisn ? parseInt(elNisn.value) : -1;
  const kelasIdx = elKelas ? parseInt(elKelas.value) : -1;
  const waliIdx = elWali ? parseInt(elWali.value) : -1;
  const hubIdx = elHub ? parseInt(elHub.value) : -1;
  const sekolahVal = elSekolah ? elSekolah.value : 'USE_ACTIVE_SCHOOL';
  const sekolahIdx = sekolahVal === 'USE_ACTIVE_SCHOOL' ? -1 : parseInt(sekolahVal);
  const catIdx = elCat ? parseInt(elCat.value) : -1;

  // Analisis kualitas data
  let validPhoneCount = 0;
  let emptyPhoneCount = 0;
  let invalidTextCount = 0;

  const previewList = [];
  const maxPreview = Math.min(5, rows.length);

  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i];
    const rNama = (namaIdx !== -1 && cols[namaIdx]) ? cols[namaIdx].trim() : "";
    const rNisn = (nisnIdx !== -1 && cols[nisnIdx]) ? cols[nisnIdx].trim() : "";
    const rKelas = (kelasIdx !== -1 && cols[kelasIdx]) ? cols[kelasIdx].trim() : "";
    const rWali = (waliIdx !== -1 && cols[waliIdx]) ? cols[waliIdx].trim() : "";
    const rHub = (hubIdx !== -1 && cols[hubIdx]) ? cols[hubIdx].trim() : "Orang Tua";
    const rSekolah = (sekolahIdx !== -1 && cols[sekolahIdx]) ? cols[sekolahIdx].trim() : userSchool;

    let rHp = "";
    let isPhoneValid = false;
    let isPhoneText = false;

    if (hpIdx !== -1 && cols[hpIdx]) {
      const raw = cols[hpIdx].trim();
      if (/[a-zA-Z]/.test(raw)) {
        isPhoneText = true;
        invalidTextCount++;
      } else if (raw.replace(/\D/g, '').length >= 7) {
        isPhoneValid = true;
        validPhoneCount++;
        let digits = raw.replace(/^['"`\s]+/, '').replace(/[\s\-\.\(\)]/g, '').replace(/\D/g, '');
        if (digits.startsWith('8')) {
          rHp = '0' + digits;
        } else if (digits.startsWith('62')) {
          rHp = '0' + digits.substring(2);
        } else if (digits.startsWith('0')) {
          rHp = digits;
        } else {
          rHp = digits;
        }
      } else {
        emptyPhoneCount++;
      }
    } else {
      emptyPhoneCount++;
    }

    if (i < maxPreview) {
      previewList.push({
        sekolah: rSekolah,
        nisn: rNisn,
        namaSiswa: rNama,
        kelas: rKelas,
        namaWali: rWali,
        hubungan: rHub,
        rawHp: (hpIdx !== -1 && cols[hpIdx]) ? cols[hpIdx].trim() : "",
        noHp: rHp,
        isPhoneValid,
        isPhoneText
      });
    }
  }

  // Update Alert Kualitas
  const alertEl = document.getElementById("import-kontak-quality-alert");
  if (alertEl) {
    if (hpIdx === -1) {
      alertEl.innerHTML = `
        <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; color: #b45309; font-size: 0.84rem; line-height: 1.4;">
          <div style="font-weight: 700; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <i class="fas fa-exclamation-circle"></i> Kolom Nomor HP Belum Dipetakan!
          </div>
          Silakan pilih kolom yang memuat nomor telepon/WhatsApp orang tua pada dropdown <b>"Nomor HP / WhatsApp"</b> di atas.
        </div>
      `;
    } else if (validPhoneCount === 0) {
      alertEl.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid #ef4444; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; color: #b91c1c; font-size: 0.84rem; line-height: 1.4;">
          <div style="font-weight: 700; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <i class="fas fa-exclamation-triangle"></i> PERINGATAN: 0 Nomor HP Valid Terdeteksi!
          </div>
          Semua baris pada kolom yang Anda pilih (${headers[hpIdx] || 'Kolom terpilih'}) kosong atau bukan nomor HP yang valid ${invalidTextCount > 0 ? `(terdeteksi ${invalidTextCount} baris berupa teks/huruf)` : ''}. Mohon periksa kembali pilihan kolom Anda.
        </div>
      `;
    } else {
      alertEl.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; color: #047857; font-size: 0.84rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <i class="fas fa-check-circle" style="color: #10b981; margin-right: 4px;"></i> 
            <b>${validPhoneCount} dari ${rows.length} siswa</b> terdeteksi memiliki nomor HP valid.
          </div>
          ${emptyPhoneCount > 0 ? `<span style="font-size: 0.78rem; color: #d97706; background: rgba(245, 158, 11, 0.1); padding: 2px 8px; border-radius: 12px;">${emptyPhoneCount} nomor kosong</span>` : ''}
        </div>
      `;
    }
  }

  // Update Table Preview
  const tableContainer = document.getElementById("import-kontak-preview-table-container");
  if (tableContainer) {
    const tableRows = previewList.map(r => {
      let hpBadge = "";
      if (r.isPhoneValid) {
        hpBadge = `<span style="color: #10b981; font-weight: 700; font-family: monospace; font-size: 0.78rem;"><i class="fab fa-whatsapp"></i> ${displayPhoneNumber(r.noHp)}</span>`;
      } else if (r.isPhoneText) {
        hpBadge = `<span style="color: #ef4444; font-size: 0.74rem;" title="${r.rawHp}"><i class="fas fa-times-circle"></i> Berupa teks ("${r.rawHp.substring(0, 15)}")</span>`;
      } else {
        hpBadge = `<span style="color: var(--text-muted); font-size: 0.74rem; font-style: italic;"><i class="fas fa-minus"></i> Kosong</span>`;
      }

      return `
        <tr>
          <td style="padding: 6px 8px; font-size: 0.76rem; color: var(--text-muted);">${r.sekolah}</td>
          <td style="padding: 6px 8px; font-size: 0.8rem; font-weight: 600; color: var(--text-main);">${r.namaSiswa || '<span style="color:#ef4444;">[Wajib Dipilih]</span>'}</td>
          <td style="padding: 6px 8px; font-size: 0.76rem;">${r.kelas || '-'}</td>
          <td style="padding: 6px 8px; font-size: 0.76rem;">${r.namaWali || '-'} <small style="color: var(--text-muted);">(${r.hubungan})</small></td>
          <td style="padding: 6px 8px;">${hpBadge}</td>
        </tr>
      `;
    }).join("");

    tableContainer.innerHTML = `
      <div style="font-weight: 600; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 6px;">
        Pratinjau 5 Baris Pertama Berdasarkan Pemetaan Saat Ini:
      </div>
      <div class="table-responsive" style="max-height: 180px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: var(--bg-app); border-bottom: 1px solid var(--border-color); font-size: 0.75rem; text-align: left;">
              <th style="padding: 6px 8px;">Sekolah</th>
              <th style="padding: 6px 8px;">Nama Siswa</th>
              <th style="padding: 6px 8px;">Kelas</th>
              <th style="padding: 6px 8px;">Wali</th>
              <th style="padding: 6px 8px;">No HP / WA</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    `;
  }

  // Update Tombol Submit
  const submitBtn = document.getElementById("btn-submit-import-kontak");
  if (submitBtn) {
    submitBtn.innerHTML = `<i class="fas fa-file-import"></i> Proses Impor (${rows.length} Siswa, ${validPhoneCount} No HP)`;
  }
}

function confirmExecuteImportKontak() {
  if (!window.pendingKontakImportData) {
    alert("Tidak ada data untuk diimpor!");
    return;
  }

  const elNama = document.getElementById("map-kontak-nama");
  const elHp = document.getElementById("map-kontak-hp");
  const elNisn = document.getElementById("map-kontak-nisn");
  const elKelas = document.getElementById("map-kontak-kelas");
  const elWali = document.getElementById("map-kontak-wali");
  const elHub = document.getElementById("map-kontak-hub");
  const elSekolah = document.getElementById("map-kontak-sekolah");
  const elCat = document.getElementById("map-kontak-cat");

  const namaIdx = elNama ? parseInt(elNama.value) : -1;
  const hpIdx = elHp ? parseInt(elHp.value) : -1;

  if (namaIdx === -1) {
    alert("Kolom 'Nama Siswa' wajib dipilih sebelum memproses impor!");
    return;
  }

  const mapping = {
    namaIdx,
    hpIdx,
    nisnIdx: elNisn ? parseInt(elNisn.value) : -1,
    kelasIdx: elKelas ? parseInt(elKelas.value) : -1,
    waliIdx: elWali ? parseInt(elWali.value) : -1,
    hubIdx: elHub ? parseInt(elHub.value) : -1,
    sekolahIdx: elSekolah ? elSekolah.value : 'USE_ACTIVE_SCHOOL',
    catIdx: elCat ? parseInt(elCat.value) : -1
  };

  // Validasi jika hpIdx kosong
  if (hpIdx === -1) {
    if (!confirm("⚠️ PERHATIAN:\nKolom Nomor HP belum dipilih (tidak dipetakan).\n\nApakah Anda yakin ingin tetap mengimpor kontak tanpa nomor HP?")) {
      return;
    }
  }

  const result = processImportedKontakCSV(window.pendingKontakImportData.rawLines, mapping);
  window.pendingKontakImportData = null;
  closeModal();

  const session = getSession();
  const isAdmin = session && session.role === "admin";

  if (isAdmin && result.total > 0) {
    const alertBody = `
      <div style="text-align: center; padding: 16px 10px;">
        <div style="width: 52px; height: 52px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); color: #10b981; display: inline-flex; align-items: center; justify-content: center; font-size: 1.8rem; margin-bottom: 12px;">
          <i class="fas fa-check"></i>
        </div>
        <h4 style="margin: 0; font-weight: 700; color: var(--text-main); font-size: 1.15rem;">Impor Kontak Sukses!</h4>
        <p style="margin: 8px 0 14px; color: var(--text-muted); font-size: 0.88rem; line-height: 1.5;">
          Sebanyak <b>${result.total} data kontak</b> (<b style="color: #10b981;">${result.withPhone}</b> memiliki nomor HP) berhasil disimpan ke database Anda.
        </p>
        <div style="background: rgba(2, 132, 199, 0.08); border: 1px solid rgba(2, 132, 199, 0.25); border-radius: 8px; padding: 12px; font-size: 0.82rem; color: var(--text-main); text-align: left; line-height: 1.4;">
          <i class="fas fa-info-circle" style="color: #0284c7;"></i> <b>Langkah Selanjutnya:</b><br>
          Untuk membagikan kontak ini ke aplikasi semua guru, silakan klik tombol <b>"Distribusikan ke Semua Guru Sekarang"</b> di bawah.
        </div>
      </div>
    `;

    openModal("Impor Selesai", alertBody, `
      <button class="btn btn-secondary" onclick="closeModal(); renderPage('kontak');">Tutup</button>
      <button class="btn btn-primary" onclick="closeModal(); broadcastKontakToTeachers();" style="background: #0284c7; border-color: #0284c7;">
        <i class="fas fa-paper-plane"></i> Distribusikan ke Semua Guru Sekarang
      </button>
    `);
  } else {
    showToast(`Berhasil mengimpor ${result.total} kontak (${result.withPhone} memiliki nomor HP)!`);
    renderPage("kontak");
  }
}

// ------------------------------------------
// TAMBAH / EDIT MANUAL KONTAK WALI (MULTI-SEKOLAH)
// ------------------------------------------
function showAddEditKontakModal(targetId = null, prefillSiswaId = null) {
  const session = getSession();
  const isAdmin = session && session.role === "admin";
  const userSchool = getCurrentSchoolName();

  let targetItem = null;
  let defaultSekolah = userSchool;
  let defaultWali = "";
  let defaultHubungan = "Ayah";
  let defaultHp = "";
  let defaultCatatan = "";

  if (targetId) {
    const contacts = getAllKontakWali(isAdmin ? (window.activeKontakSchoolFilter || "all") : userSchool);
    targetItem = contacts.find(c => c.id === targetId);
    if (targetItem) {
      defaultSekolah = targetItem.sekolah || userSchool;
      defaultWali = targetItem.namaWali || "";
      defaultHubungan = targetItem.hubungan || "Ayah";
      defaultHp = targetItem.noHp || "";
      defaultCatatan = targetItem.catatan || "";
    }
  } else if (prefillSiswaId) {
    const s = (db.siswa || []).find(item => item.id === prefillSiswaId);
    if (s) {
      defaultWali = s.namaWali || "";
      defaultHubungan = s.hubungan || "Ayah";
      defaultHp = s.noHp || "";
      defaultCatatan = s.catatan || "";
    }
  }

  const selectedSiswaId = prefillSiswaId || (targetItem ? targetItem.siswaId : "");
  const siswaOptions = (db.siswa || []).map(s => {
    const k = db.kelas ? db.kelas.find(item => item.id === s.kelasId) : null;
    const isSelected = selectedSiswaId === s.id ? "selected" : "";
    return `<option value="${s.id}" ${isSelected}>${s.nama} (${k ? k.nama : 'Tanpa Kelas'} - ${s.nisn})</option>`;
  }).join("");

  const modalHtml = `
    <form id="form-edit-kontak" onsubmit="handleSaveKontak(event)">
      <!-- Sekolah Input -->
      <div class="form-group">
        <label class="form-label">Nama Sekolah Asal Siswa</label>
        <input type="text" id="edit-kontak-sekolah" class="form-control" value="${defaultSekolah}" ${!isAdmin ? 'readonly style="background: var(--bg-app); cursor: not-allowed;"' : ''} required>
        <small style="color: var(--text-muted); font-size: 0.75rem;">
          ${isAdmin ? 'Administrator dapat menentukan atau mengganti sekolah kontak ini.' : 'Kontak ini terikat secara otomatis ke sekolah Anda.'}
        </small>
      </div>

      <div class="form-group">
        <label class="form-label">Pilih Siswa (Dari Sekolah Ini)</label>
        <select id="edit-kontak-siswa-id" class="form-control" ${targetItem && targetItem.siswaId ? 'disabled' : ''}>
          <option value="">-- Pilih Siswa atau Isi Manual di Bawah --</option>
          ${siswaOptions}
        </select>
        ${targetItem && targetItem.siswaId ? `<input type="hidden" id="edit-kontak-hidden-id" value="${targetItem.siswaId}">` : ''}
      </div>

      ${!targetItem || !targetItem.siswaId ? `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Nama Siswa Manual (Jika belum di daftar)</label>
            <input type="text" id="edit-kontak-nama-manual" class="form-control" placeholder="Contoh: Aditya Pratama" value="${targetItem ? targetItem.namaSiswa : ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Kelas Siswa</label>
            <input type="text" id="edit-kontak-kelas-manual" class="form-control" placeholder="Contoh: X IPA 1" value="${targetItem ? targetItem.kelasNama : ''}">
          </div>
        </div>
      ` : ''}

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Nama Orang Tua / Wali</label>
          <input type="text" id="edit-kontak-nama-wali" class="form-control" placeholder="Contoh: Bambang Pratama" value="${defaultWali}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Hubungan</label>
          <select id="edit-kontak-hubungan" class="form-control">
            <option value="Ayah" ${defaultHubungan === 'Ayah' ? 'selected' : ''}>Ayah</option>
            <option value="Ibu" ${defaultHubungan === 'Ibu' ? 'selected' : ''}>Ibu</option>
            <option value="Wali" ${defaultHubungan === 'Wali' ? 'selected' : ''}>Wali / Keluarga</option>
            <option value="Kakek/Nenek" ${defaultHubungan === 'Kakek/Nenek' ? 'selected' : ''}>Kakek / Nenek</option>
            <option value="Lainnya" ${defaultHubungan === 'Lainnya' ? 'selected' : ''}>Lainnya</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Nomor HP / WhatsApp</label>
        <input type="tel" id="edit-kontak-hp" class="form-control" placeholder="Contoh: 081234567890" value="${defaultHp}" required>
        <small style="color: var(--text-muted); font-size: 0.75rem;">Awali dengan 08... atau 628...</small>
      </div>

      <div class="form-group">
        <label class="form-label">Catatan Khusus (Opsional)</label>
        <input type="text" id="edit-kontak-catatan" class="form-control" placeholder="Contoh: Bisa dihubungi sore hari" value="${defaultCatatan}">
      </div>

      <input type="hidden" id="edit-kontak-target-item-id" value="${targetId || ''}">
    </form>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button type="submit" form="form-edit-kontak" class="btn btn-primary"><i class="fas fa-save"></i> Simpan Kontak</button>
  `;

  openModal(targetId ? "Edit Kontak Orang Tua / Wali" : "Tambah Kontak Orang Tua", modalHtml, footerHtml);
}

async function handleSaveKontak(e) {
  e.preventDefault();
  const hiddenEl = document.getElementById("edit-kontak-hidden-id");
  const selectEl = document.getElementById("edit-kontak-siswa-id");
  const targetItemId = document.getElementById("edit-kontak-target-item-id").value;
  const siswaId = hiddenEl ? hiddenEl.value : (selectEl ? selectEl.value : "");

  const sekolah = document.getElementById("edit-kontak-sekolah").value.trim();
  const namaManualEl = document.getElementById("edit-kontak-nama-manual");
  const kelasManualEl = document.getElementById("edit-kontak-kelas-manual");
  const namaManual = namaManualEl ? namaManualEl.value.trim() : "";
  const kelasManual = kelasManualEl ? kelasManualEl.value.trim() : "";

  const namaWali = document.getElementById("edit-kontak-nama-wali").value.trim();
  const hubungan = document.getElementById("edit-kontak-hubungan").value;
  const noHp = document.getElementById("edit-kontak-hp").value.trim();
  const catatan = document.getElementById("edit-kontak-catatan").value.trim();

  const userSchool = getCurrentSchoolName();
  db.kontakWali = db.kontakWali || [];

  // Jika terhubung ke siswa di db.siswa (dan sekolahnya sama)
  if (siswaId) {
    const s = db.siswa.find(item => item.id === siswaId);
    if (s && sekolah.toLowerCase() === userSchool.toLowerCase()) {
      s.namaWali = namaWali;
      s.hubungan = hubungan;
      s.noHp = noHp;
      s.catatan = catatan;
    }
  }

  // Simpan / update di db.kontakWali
  if (targetItemId && targetItemId.startsWith("kw-")) {
    const existing = db.kontakWali.find(k => k.id === targetItemId);
    if (existing) {
      existing.sekolah = sekolah;
      existing.namaWali = namaWali;
      existing.hubungan = hubungan;
      existing.noHp = noHp;
      existing.catatan = catatan;
      if (namaManual) existing.namaSiswa = namaManual;
      if (kelasManual) existing.kelasNama = kelasManual;
    }
  } else {
    let studentName = namaManual;
    let studentClass = kelasManual;
    let studentNisn = "-";

    if (siswaId) {
      const s = db.siswa.find(item => item.id === siswaId);
      if (s) {
        studentName = s.nama;
        studentNisn = s.nisn;
        const k = db.kelas ? db.kelas.find(item => item.id === s.kelasId) : null;
        studentClass = k ? k.nama : "Umum";
      }
    }

    db.kontakWali.push({
      id: "kw-" + Date.now(),
      sekolah: sekolah,
      siswaId: siswaId || null,
      nisn: studentNisn,
      namaSiswa: studentName || "Siswa",
      kelasNama: studentClass || "Umum",
      namaWali: namaWali,
      hubungan: hubungan,
      noHp: noHp,
      catatan: catatan
    });
  }

  await saveDatabase(true);
  closeModal();
  showToast("Kontak wali siswa berhasil disimpan!");
  const activeHash = window.location.hash.replace("#", "") || "dashboard";
  if (activeHash === "dashboard") {
    renderDashboard(document.getElementById("content-area"));
  } else {
    renderPage("kontak");
  }
}

// ----------------------------------------------------
// SINKRONISASI KONTAK ANTAR-AKUN (ADMIN -> GURU)
// ----------------------------------------------------

async function syncAdminContactsToTeacher(targetDb, teacherSchool, isManual = false) {
  if (!isCloudMode || !supabase) {
    if (isManual) showToast("Aplikasi dalam Mode Offline/Lokal. Tidak dapat terhubung ke Cloud.");
    return { updated: 0, total: 0 };
  }

  if (!teacherSchool || teacherSchool === "Nama Sekolah") {
    if (isManual) showToast("Silakan atur nama sekolah Anda terlebih dahulu di menu Profil.");
    return { updated: 0, total: 0 };
  }

  try {
    // 1. Ambil data master kontak dari akun Administrator di Supabase
    const { data, error } = await supabase
      .from("saku_guru_databases")
      .select("data")
      .eq("email", "admin@smansaku.id")
      .maybeSingle();

    if (error || !data || !data.data || !Array.isArray(data.data.kontakWali)) {
      if (isManual) showToast("Belum ada data kontak wali di akun Administrator.");
      return { updated: 0, total: 0 };
    }

    const adminContacts = data.data.kontakWali;
    if (adminContacts.length === 0) {
      if (isManual) showToast("Akun Administrator belum memiliki daftar kontak.");
      return { updated: 0, total: 0 };
    }

    // 2. Filter kontak yang sekolahnya cocok dengan sekolah guru
    const matchedContacts = adminContacts.filter(kw => isSameSchool(kw.sekolah, teacherSchool));
    if (matchedContacts.length === 0) {
      if (isManual) {
        showToast(`Tidak ditemukan kontak untuk sekolah "${teacherSchool}" di akun Administrator.`);
      }
      return { updated: 0, total: 0 };
    }

    targetDb.kontakWali = targetDb.kontakWali || [];
    let updatedCount = 0;

    matchedContacts.forEach(admKw => {
      // Validasi noHp: hanya simpan jika bukan teks nama siswa & minimal 7 digit
      const validPhone = (!/[a-zA-Z]/.test(admKw.noHp || "") && String(admKw.noHp || "").replace(/\D/g, '').length >= 7)
        ? admKw.noHp
        : "";

      const existingKw = targetDb.kontakWali.find(k => {
        if (!isSameSchool(k.sekolah || teacherSchool, teacherSchool)) return false;
        if (admKw.nisn && isSameNisn(admKw.nisn, k.nisn)) {
          return true;
        }
        return admKw.namaSiswa && k.namaSiswa && 
          admKw.namaSiswa.trim().toLowerCase() === k.namaSiswa.trim().toLowerCase();
      });

      if (existingKw) {
        let changed = false;
        if (validPhone && existingKw.noHp !== validPhone) {
          existingKw.noHp = validPhone;
          changed = true;
        }
        if (admKw.namaWali && admKw.namaWali !== "-" && (!existingKw.namaWali || existingKw.namaWali === "-")) {
          existingKw.namaWali = admKw.namaWali;
          changed = true;
        }
        if (admKw.hubungan && !existingKw.hubungan) {
          existingKw.hubungan = admKw.hubungan;
          changed = true;
        }
        if (admKw.catatan && !existingKw.catatan) {
          existingKw.catatan = admKw.catatan;
          changed = true;
        }
        if (admKw.kelasNama && (!existingKw.kelasNama || existingKw.kelasNama === "Umum")) {
          existingKw.kelasNama = admKw.kelasNama;
          changed = true;
        }
        if (changed) updatedCount++;
      } else {
        targetDb.kontakWali.push({
          id: admKw.id || ("kw-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7)),
          sekolah: teacherSchool,
          nisn: admKw.nisn || "-",
          namaSiswa: admKw.namaSiswa || admKw.nama || "",
          kelasNama: admKw.kelasNama || admKw.kelas || "",
          namaWali: (admKw.namaWali && admKw.namaWali !== "-") ? admKw.namaWali : "",
          hubungan: admKw.hubungan || "Orang Tua",
          noHp: validPhone,
          catatan: admKw.catatan || ""
        });
        updatedCount++;
      }
    });

    // 3. Hubungkan langsung ke db.siswa guru jika ada siswa yang cocok
    if (Array.isArray(targetDb.siswa)) {
      targetDb.siswa.forEach(s => {
        const kwMatch = targetDb.kontakWali.find(kw => {
          if (!isSameSchool(kw.sekolah || teacherSchool, teacherSchool)) return false;
          if (s.nisn && isSameNisn(s.nisn, kw.nisn)) {
            return true;
          }
          return s.nama && kw.namaSiswa && 
            s.nama.trim().toLowerCase() === kw.namaSiswa.trim().toLowerCase();
        });

        if (kwMatch) {
          if (kwMatch.noHp && s.noHp !== kwMatch.noHp) {
            s.noHp = kwMatch.noHp;
          }
          if (kwMatch.namaWali && (!s.namaWali || s.namaWali === "-")) {
            s.namaWali = kwMatch.namaWali;
          }
          if (kwMatch.hubungan && !s.hubungan) {
            s.hubungan = kwMatch.hubungan;
          }
        }
      });
    }

    if (updatedCount > 0 || isManual) {
      await saveDatabase(false);
      if (isManual) {
        showToast(`Berhasil menyinkronkan ${matchedContacts.length} kontak dari Administrator untuk sekolah Anda!`);
        renderPage("kontak");
      }
    }

    return { updated: updatedCount, total: matchedContacts.length };
  } catch(e) {
    console.warn("syncAdminContactsToTeacher error:", e);
    if (isManual) showToast("Gagal menyinkronkan kontak: " + e.message);
    return { updated: 0, total: 0 };
  }
}

async function manualSyncTeacherContacts() {
  const userSchool = getCurrentSchoolName();
  
  // 1. Tampilkan modal loading interaktif
  const loadingHtml = `
    <div style="text-align: center; padding: 24px 16px;">
      <div style="font-size: 2.5rem; color: #0284c7; margin-bottom: 16px;">
        <i class="fas fa-sync fa-spin"></i>
      </div>
      <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-main); font-weight: 700;">Menghubungkan ke Administrator...</h3>
      <p style="margin-top: 8px; font-size: 0.85rem; color: var(--text-muted); line-height: 1.5;">
        Sedang membaca data master kontak orang tua/wali dari server Cloud Supabase...
      </p>
    </div>
  `;
  openModal("Sinkronisasi Kontak Guru", loadingHtml, ``, false);

  if (!isCloudMode || !supabase) {
    const errorHtml = `
      <div style="text-align: center; padding: 16px;">
        <div style="font-size: 2.5rem; color: var(--alpa); margin-bottom: 12px;">
          <i class="fas fa-wifi-slash"></i>
        </div>
        <h4 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--text-main);">Koneksi Cloud Tidak Aktif</h4>
        <p style="margin-top: 6px; font-size: 0.85rem; color: var(--text-muted);">
          Aplikasi sedang berjalan dalam mode offline / lokal. Pastikan perangkat Anda terhubung ke internet.
        </p>
      </div>
    `;
    openModal("Koneksi Offline", errorHtml, `<button class="btn btn-secondary" onclick="closeModal()">Tutup</button>`);
    return;
  }

  try {
    // 2. Ambil master kontak dari akun Administrator di Supabase
    const { data, error } = await supabase
      .from("saku_guru_databases")
      .select("data")
      .eq("email", "admin@smansaku.id")
      .maybeSingle();

    if (error || !data || !data.data || !Array.isArray(data.data.kontakWali)) {
      const emptyHtml = `
        <div style="text-align: center; padding: 16px;">
          <div style="font-size: 2.5rem; color: var(--terlambat); margin-bottom: 12px;">
            <i class="fas fa-folder-open"></i>
          </div>
          <h4 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--text-main);">Belum Ada Kontak di Admin</h4>
          <p style="margin-top: 6px; font-size: 0.85rem; color: var(--text-muted);">
            Administrator belum menambahkan atau mengimpor data kontak wali di server Cloud.
          </p>
        </div>
      `;
      openModal("Kontak Belum Tersedia", emptyHtml, `<button class="btn btn-secondary" onclick="closeModal()">Tutup</button>`);
      return;
    }

    const adminContacts = data.data.kontakWali;
    if (adminContacts.length === 0) {
      const emptyHtml = `
        <div style="text-align: center; padding: 16px;">
          <div style="font-size: 2.5rem; color: var(--terlambat); margin-bottom: 12px;">
            <i class="fas fa-folder-open"></i>
          </div>
          <h4 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--text-main);">Daftar Kontak Admin Kosong</h4>
          <p style="margin-top: 6px; font-size: 0.85rem; color: var(--text-muted);">
            Tidak ada nomor kontak tersimpan pada akun Administrator.
          </p>
        </div>
      `;
      openModal("Kontak Kosong", emptyHtml, `<button class="btn btn-secondary" onclick="closeModal()">Tutup</button>`);
      return;
    }

    // 3. Kumpulkan daftar sekolah yang ada di database Admin
    const adminSchoolsMap = new Map();
    adminContacts.forEach(c => {
      const sName = (c.sekolah || "").trim();
      if (sName) {
        adminSchoolsMap.set(sName, (adminSchoolsMap.get(sName) || 0) + 1);
      }
    });

    // 4. Cari kontak yang cocok dengan sekolah guru saat ini
    const matchedContacts = adminContacts.filter(kw => isSameSchool(kw.sekolah, userSchool));

    if (matchedContacts.length === 0) {
      // Tidak cocok! Tampilkan pilihan sekolah dari Admin agar guru bisa memilih sekolahnya
      let optionsHtml = "";
      adminSchoolsMap.forEach((count, sName) => {
        optionsHtml += `<option value="${sName}">🏫 ${sName} (${count} kontak wali)</option>`;
      });

      const mismatchHtml = `
        <div style="font-size: 0.88rem; line-height: 1.5;">
          <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px;">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(245, 158, 11, 0.15); color: #f59e0b; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">
              <i class="fas fa-school"></i>
            </div>
            <div>
              <h4 style="margin: 0; font-weight: 700; color: var(--text-main); font-size: 1rem;">Perbedaan Nama Sekolah</h4>
              <p style="margin: 4px 0 0; color: var(--text-muted); font-size: 0.8rem;">
                Sekolah pada profil akun Anda: <b style="color: #ef4444;">"${userSchool}"</b>
              </p>
            </div>
          </div>

          <p style="color: var(--text-muted); font-size: 0.82rem; margin-bottom: 12px;">
            Data kontak orang tua di akun Administrator saat ini terdaftar untuk sekolah berikut. Silakan pilih sekolah Anda untuk menyamakan profil dan menarik kontaknya:
          </p>

          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" style="font-weight: 600;">Pilih Sekolah Asal Anda:</label>
            <select id="select-adopt-school-sync" class="form-control" style="font-weight: 600;">
              ${optionsHtml}
            </select>
          </div>
        </div>
      `;

      openModal("Pilih Sekolah Kontak", mismatchHtml, `
        <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
        <button class="btn btn-primary" onclick="confirmAdoptSchoolAndSync()">
          <i class="fas fa-check-circle"></i> Terapkan Sekolah & Tarik Kontak
        </button>
      `);
      return;
    }

    // 5. Sekolah cocok! Lakukan merge kontak ke db.kontakWali & db.siswa
    db.kontakWali = db.kontakWali || [];
    let updatedCount = 0;

    matchedContacts.forEach(admKw => {
      const validPhone = (!/[a-zA-Z]/.test(admKw.noHp || "") && String(admKw.noHp || "").replace(/\D/g, '').length >= 7)
        ? admKw.noHp
        : "";

      const existingKw = db.kontakWali.find(k => {
        if (!isSameSchool(k.sekolah || userSchool, userSchool)) return false;
        if (admKw.nisn && admKw.nisn !== "-" && k.nisn && k.nisn !== "-") {
          return String(admKw.nisn).trim() === String(k.nisn).trim();
        }
        return admKw.namaSiswa && k.namaSiswa && 
          admKw.namaSiswa.trim().toLowerCase() === k.namaSiswa.trim().toLowerCase();
      });

      if (existingKw) {
        let changed = false;
        if (validPhone && existingKw.noHp !== validPhone) { existingKw.noHp = validPhone; changed = true; }
        if (admKw.namaWali && admKw.namaWali !== "-" && existingKw.namaWali !== admKw.namaWali) { existingKw.namaWali = admKw.namaWali; changed = true; }
        if (admKw.hubungan && !existingKw.hubungan) { existingKw.hubungan = admKw.hubungan; changed = true; }
        if (admKw.catatan && !existingKw.catatan) { existingKw.catatan = admKw.catatan; changed = true; }
        if (admKw.kelasNama && (!existingKw.kelasNama || existingKw.kelasNama === "Umum")) { existingKw.kelasNama = admKw.kelasNama; changed = true; }
        if (changed) updatedCount++;
      } else {
        db.kontakWali.push({
          id: admKw.id || ("kw-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7)),
          sekolah: userSchool,
          nisn: admKw.nisn || "-",
          namaSiswa: admKw.namaSiswa || admKw.nama || "",
          kelasNama: admKw.kelasNama || admKw.kelas || "",
          namaWali: (admKw.namaWali && admKw.namaWali !== "-") ? admKw.namaWali : "",
          hubungan: admKw.hubungan || "Orang Tua",
          noHp: validPhone,
          catatan: admKw.catatan || ""
        });
        updatedCount++;
      }
    });

    // Hubungkan juga ke db.siswa
    if (Array.isArray(db.siswa)) {
      db.siswa.forEach(s => {
        const kwMatch = db.kontakWali.find(kw => {
          if (!isSameSchool(kw.sekolah || userSchool, userSchool)) return false;
          if (s.nisn && isSameNisn(s.nisn, kw.nisn)) {
            return true;
          }
          return s.nama && kw.namaSiswa && 
            s.nama.trim().toLowerCase() === kw.namaSiswa.trim().toLowerCase();
        });

        if (kwMatch) {
          if (kwMatch.noHp && s.noHp !== kwMatch.noHp) s.noHp = kwMatch.noHp;
          if (kwMatch.namaWali && (!s.namaWali || s.namaWali === "-")) s.namaWali = kwMatch.namaWali;
          if (kwMatch.hubungan && !s.hubungan) s.hubungan = kwMatch.hubungan;
        }
      });
    }

    await saveDatabase(false);

    // Hitung kontak yang memiliki nomor HP
    const contactsWithPhone = matchedContacts.filter(k => k.noHp && k.noHp.trim().length >= 8).length;
    const contactsWithoutPhone = matchedContacts.length - contactsWithPhone;

    let resultHtml = "";
    if (contactsWithPhone === 0) {
      resultHtml = `
        <div style="text-align: center; padding: 18px 10px;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(245, 158, 11, 0.15); color: #f59e0b; display: inline-flex; align-items: center; justify-content: center; font-size: 1.8rem; margin-bottom: 14px;">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <h4 style="margin: 0; font-weight: 700; color: var(--text-main); font-size: 1.15rem;">Data Ditarik, Namun Nomor HP Belum Ada</h4>
          <p style="margin: 8px 0 14px; color: var(--text-muted); font-size: 0.88rem; line-height: 1.5;">
            Sebanyak <b style="color: #f59e0b;">${matchedContacts.length} data siswa</b> untuk sekolah <b>${userSchool}</b> berhasil dimuat, namun <b style="color: #ef4444;">semua nomor HP kontak orang tua masih kosong di server Administrator</b>.
          </p>
          <div style="background: var(--bg-app); border: 1px solid var(--border-color); border-left: 4px solid #f59e0b; border-radius: 8px; padding: 12px 14px; text-align: left; font-size: 0.82rem; color: var(--text-main); line-height: 1.5;">
            <b>Panduan untuk Administrator:</b><br>
            Akun Administrator (admin@smansaku.id) perlu mengimpor ulang spreadsheet kontak orang tua yang telah terisi nomor HP/WA menggunakan menu <b>Import CSV / Sinkron Spreadsheet</b>, lalu menekan tombol <b>"Distribusikan ke Semua Guru"</b>.
          </div>
        </div>
      `;
    } else {
      resultHtml = `
        <div style="text-align: center; padding: 20px 10px;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); color: #10b981; display: inline-flex; align-items: center; justify-content: center; font-size: 1.8rem; margin-bottom: 14px;">
            <i class="fas fa-check"></i>
          </div>
          <h4 style="margin: 0; font-weight: 700; color: var(--text-main); font-size: 1.15rem;">Sinkronisasi Kontak Berhasil!</h4>
          <p style="margin: 8px 0 0; color: var(--text-muted); font-size: 0.88rem; line-height: 1.5;">
            Sebanyak <b style="color: #10b981;">${contactsWithPhone} dari ${matchedContacts.length} siswa</b> telah terhubung dengan nomor HP orang tua/wali untuk sekolah <b>${userSchool}</b>.
            ${contactsWithoutPhone > 0 ? `<br><small style="color: var(--text-muted);">(${contactsWithoutPhone} siswa belum memiliki nomor HP)</small>` : ''}
          </p>
        </div>
      `;
    }

    openModal(contactsWithPhone > 0 ? "Sinkronisasi Selesai" : "Perhatian Sinkronisasi", resultHtml, `
      <button class="btn btn-primary" onclick="closeModal(); renderPage('kontak');">
        <i class="fas fa-address-book"></i> Lihat Daftar Kontak
      </button>
    `);

    // Refresh contact list di belakang modal
    filterKontakList();

  } catch(e) {
    console.error("manualSyncTeacherContacts error:", e);
    const errHtml = `
      <div style="text-align: center; padding: 16px;">
        <div style="font-size: 2.2rem; color: #ef4444; margin-bottom: 12px;">
          <i class="fas fa-exclamation-circle"></i>
        </div>
        <h4 style="margin: 0; font-weight: 700; color: var(--text-main);">Gagal Sinkronisasi</h4>
        <p style="margin-top: 6px; font-size: 0.85rem; color: var(--text-muted);">${e.message || e}</p>
      </div>
    `;
    openModal("Terjadi Kesalahan", errHtml, `<button class="btn btn-secondary" onclick="closeModal()">Tutup</button>`);
  }
}

async function confirmAdoptSchoolAndSync() {
  const selectEl = document.getElementById("select-adopt-school-sync");
  if (!selectEl) return;
  const chosenSchool = selectEl.value;

  db.guruProfile = db.guruProfile || {};
  db.guruProfile.sekolah = chosenSchool;
  await saveDatabase(true);
  updateHeaderProfile();

  // Sekarang jalankan sinkronisasi dengan sekolah yang baru dipilih
  await manualSyncTeacherContacts();
}

async function broadcastKontakToTeachers() {
  const session = getSession();
  if (!session || session.role !== "admin") {
    alert("Hanya akun Administrator yang dapat mendistribusikan data kontak ke semua guru.");
    return;
  }

  if (!isCloudMode || !supabase) {
    alert("Fitur ini memerlukan koneksi Cloud Supabase yang aktif.");
    return;
  }

  const adminContacts = db.kontakWali || [];
  if (adminContacts.length === 0) {
    alert("Daftar kontak wali di akun Administrator masih kosong. Silakan impor atau tambahkan kontak terlebih dahulu.");
    return;
  }

  const withPhone = adminContacts.filter(k => k.noHp && k.noHp.trim().length >= 8).length;
  if (withPhone === 0) {
    if (!confirm(`⚠️ PERINGATAN:\nSemua ${adminContacts.length} kontak di akun Administrator saat ini BELUM memiliki nomor HP (masih kosong).\n\nApakah Anda yakin ingin tetap mendistribusikan data tanpa nomor HP ke semua guru?\n\nDisarankan untuk mengimpor ulang berkas kontak yang memiliki nomor HP terlebih dahulu.`)) {
      return;
    }
  }

  const confirmMsg = `Anda akan mendistribusikan ${adminContacts.length} data kontak orang tua/wali (${withPhone} memiliki nomor HP) ke semua akun guru di Cloud.\n\nSistem akan secara otomatis mencocokkan kontak ke akun masing-masing guru berdasarkan nama sekolah mereka.\n\nLanjutkan?`;
  
  if (!confirm(confirmMsg)) return;

  const btn = document.getElementById("btn-broadcast-kontak");
  let origHtml = "";
  if (btn) {
    origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Mendistribusikan...`;
  }

  try {
    const { data: dbList, error } = await supabase
      .from("saku_guru_databases")
      .select("email, data, updated_at");

    if (error || !dbList) {
      throw new Error(error ? error.message : "Gagal membaca database guru dari server.");
    }

    let updatedTeacherCount = 0;
    const schoolStats = {};

    for (const teacherRow of dbList) {
      if (teacherRow.email.toLowerCase() === "admin@smansaku.id") continue;
      
      const teacherDb = teacherRow.data;
      if (!teacherDb || typeof teacherDb !== 'object') continue;

      const teacherSchool = (teacherDb.guruProfile && teacherDb.guruProfile.sekolah) ? teacherDb.guruProfile.sekolah.trim() : "";
      if (!teacherSchool || teacherSchool === "Nama Sekolah") continue;

      const matchingContacts = adminContacts.filter(kw => isSameSchool(kw.sekolah, teacherSchool));
      if (matchingContacts.length === 0) continue;

      teacherDb.kontakWali = teacherDb.kontakWali || [];
      let teacherChanged = false;

      matchingContacts.forEach(admKw => {
        const validPhone = (!/[a-zA-Z]/.test(admKw.noHp || "") && String(admKw.noHp || "").replace(/\D/g, '').length >= 7)
          ? admKw.noHp
          : "";

        const existingKw = teacherDb.kontakWali.find(k => {
          if (!isSameSchool(k.sekolah || teacherSchool, teacherSchool)) return false;
          if (admKw.nisn && admKw.nisn !== "-" && k.nisn && k.nisn !== "-") {
            return String(admKw.nisn).trim() === String(k.nisn).trim();
          }
          return admKw.namaSiswa && k.namaSiswa && 
            admKw.namaSiswa.trim().toLowerCase() === k.namaSiswa.trim().toLowerCase();
        });

        if (existingKw) {
          if (validPhone && existingKw.noHp !== validPhone) { existingKw.noHp = validPhone; teacherChanged = true; }
          if (admKw.namaWali && admKw.namaWali !== "-" && existingKw.namaWali !== admKw.namaWali) { existingKw.namaWali = admKw.namaWali; teacherChanged = true; }
          if (admKw.hubungan && !existingKw.hubungan) { existingKw.hubungan = admKw.hubungan; teacherChanged = true; }
          if (admKw.catatan && !existingKw.catatan) { existingKw.catatan = admKw.catatan; teacherChanged = true; }
          if (admKw.kelasNama && (!existingKw.kelasNama || existingKw.kelasNama === "Umum")) { existingKw.kelasNama = admKw.kelasNama; teacherChanged = true; }
        } else {
          teacherDb.kontakWali.push({
            id: admKw.id || ("kw-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7)),
            sekolah: teacherSchool,
            nisn: admKw.nisn || "-",
            namaSiswa: admKw.namaSiswa || admKw.nama || "",
            kelasNama: admKw.kelasNama || admKw.kelas || "",
            namaWali: (admKw.namaWali && admKw.namaWali !== "-") ? admKw.namaWali : "",
            hubungan: admKw.hubungan || "Orang Tua",
            noHp: validPhone,
            catatan: admKw.catatan || ""
          });
          teacherChanged = true;
        }
      });

      if (Array.isArray(teacherDb.siswa)) {
        teacherDb.siswa.forEach(s => {
          const kwMatch = teacherDb.kontakWali.find(kw => {
            if (!isSameSchool(kw.sekolah || teacherSchool, teacherSchool)) return false;
            if (s.nisn && s.nisn !== "-" && kw.nisn && kw.nisn !== "-") {
              return String(s.nisn).trim() === String(kw.nisn).trim();
            }
            return s.nama && kw.namaSiswa && 
              s.nama.trim().toLowerCase() === kw.namaSiswa.trim().toLowerCase();
          });

          if (kwMatch) {
            if (kwMatch.noHp && s.noHp !== kwMatch.noHp) {
              s.noHp = kwMatch.noHp;
              teacherChanged = true;
            }
            if (kwMatch.namaWali && (!s.namaWali || s.namaWali === "-")) {
              s.namaWali = kwMatch.namaWali;
              teacherChanged = true;
            }
            if (kwMatch.hubungan && !s.hubungan) {
              s.hubungan = kwMatch.hubungan;
              teacherChanged = true;
            }
          }
        });
      }

      if (teacherChanged) {
        teacherDb.last_updated = new Date().toISOString();
        const { error: upErr } = await supabase
          .from("saku_guru_databases")
          .update({ data: teacherDb, updated_at: new Date().toISOString() })
          .eq("email", teacherRow.email.toLowerCase());

        if (!upErr) {
          updatedTeacherCount++;
          const schKey = teacherSchool;
          schoolStats[schKey] = (schoolStats[schKey] || 0) + 1;
        } else {
          console.warn(`Gagal memperbarui database guru ${teacherRow.email}:`, upErr);
        }
      }
    }

    let statsDetail = Object.entries(schoolStats).map(([sch, count]) => `<li><b>${sch}</b>: ${count} akun guru</li>`).join("");
    if (!statsDetail) statsDetail = `<li>Semua akun guru sudah tersinkronkan.</li>`;

    const summaryHtml = `
      <div style="font-size: 0.9rem; line-height: 1.6;">
        <div style="text-align: center; margin-bottom: 16px;">
          <div style="width: 56px; height: 56px; background: rgba(16, 185, 129, 0.15); color: #10b981; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 1.8rem; margin-bottom: 8px;">
            <i class="fas fa-check"></i>
          </div>
          <h4 style="margin: 0; font-size: 1.1rem; color: var(--text-main); font-weight: 700;">Distribusi Kontak Selesai!</h4>
          <p style="color: var(--text-muted); font-size: 0.82rem; margin-top: 4px;">Data kontak orang tua berhasil didistribusikan ke database masing-masing guru.</p>
        </div>

        <div style="background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 10px; padding: 14px; margin-bottom: 15px;">
          <div style="font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
            <i class="fas fa-info-circle" style="color: var(--primary);"></i> Rincian Distribusi:
          </div>
          <ul style="margin: 0; padding-left: 20px; font-size: 0.85rem; color: var(--text-muted);">
            <li>Total Akun Guru Diperbarui: <b style="color: #10b981;">${updatedTeacherCount} Guru</b></li>
            ${statsDetail}
          </ul>
        </div>
        <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0;">
          Ketika guru membuka aplikasi di HP atau komputer mereka, data kontak wali dan nomor WhatsApp akan otomatis muncul di menu Kontak dan Dashboard Tindak Lanjut!
        </p>
      </div>
    `;

    openModal("Hasil Distribusi Kontak", summaryHtml, `
      <button class="btn btn-primary" onclick="closeModal()">Tutup</button>
    `);

  } catch(e) {
    console.error("broadcastKontakToTeachers error:", e);
    alert("Gagal mendistribusikan kontak ke akun guru:\n" + e.message);
  } finally {
    if (btn && origHtml) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

// ------------------------------------------
// 4. JADWAL MENGAJAR VIEW RENDER
// ------------------------------------------
function renderJadwal(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Jadwal Mengajar Anda</h3>
        <button class="btn btn-primary" onclick="showAddJadwalModal()"><i class="fas fa-plus"></i> Tambah Jadwal</button>
      </div>

      <!-- Weekly Schedule visual board -->
      <div class="schedule-container">
        <!-- Vertical Column for Hours indicator -->
        <div class="schedule-header-col">
          <i class="fas fa-clock" style="font-size: 1.2rem; color: var(--text-muted); margin-bottom: 10px;"></i>
          <p style="font-size: 0.7rem; color:var(--text-muted);">Sesi</p>
        </div>

        <div class="schedule-days-grid" id="schedule-board-days">
          <!-- Days Monday-Friday injected here -->
        </div>
      </div>
      
      <p style="margin-top: 15px; font-size: 0.85rem; color: var(--text-muted);">
        <i class="fas fa-circle-info"></i> Klik ganda pada kartu jadwal untuk menghapus jadwal tersebut.
      </p>
    </div>
  `;

  loadScheduleBoard();
}

function loadScheduleBoard() {
  const days = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const container = document.getElementById("schedule-board-days");
  if (!container) return;

  container.innerHTML = days.map(day => {
    // Filter schedules for this day and sort by start time
    const dayJadwal = db.jadwal.filter(j => j.hari === day).sort((a,b) => a.jamMulai.localeCompare(b.jamMulai));
    
    const cardsHtml = dayJadwal.map(j => {
      const kelasObj = db.kelas.find(k => k.id === j.kelasId);
      const kelasNama = kelasObj ? kelasObj.nama : "Tidak Diketahui";
      return `
        <div class="schedule-card" ondblclick="deleteJadwal('${j.id}', '${j.hari}')" title="Klik ganda untuk menghapus">
          <div class="time"><i class="far fa-clock"></i> ${j.jamMulai} - ${j.jamSelesai}</div>
          <div class="subject">${j.mapel}</div>
          <div class="class">${kelasNama}</div>
        </div>
      `;
    }).join("");

    return `
      <div class="schedule-day-column">
        <div class="schedule-day-header">${day}</div>
        <div style="min-height: 250px; background-color: rgba(0,0,0,0.01); padding-bottom: 20px;">
          ${cardsHtml || '<p style="text-align:center; color:var(--text-muted); font-size:0.75rem; padding-top:40px;">(Kosong)</p>'}
        </div>
      </div>
    `;
  }).join("");
}

function showAddJadwalModal() {
  const classOptions = db.kelas.map(k => `<option value="${k.id}">${k.nama}</option>`).join("");
  const subjectOptions = db.mapel.map(m => `<option value="${m}">${m}</option>`).join("");

  const formHtml = `
    <div class="form-group">
      <label class="form-label" for="j-hari">Hari</label>
      <select id="j-hari" class="form-control" required>
        <option value="Senin">Senin</option>
        <option value="Selasa">Selasa</option>
        <option value="Rabu">Rabu</option>
        <option value="Kamis">Kamis</option>
        <option value="Jumat">Jumat</option>
        <option value="Sabtu">Sabtu</option>
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="j-jam-mulai">Jam Mulai</label>
        <input type="time" id="j-jam-mulai" class="form-control" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="j-jam-selesai">Jam Selesai</label>
        <input type="time" id="j-jam-selesai" class="form-control" required>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="j-kelas">Kelas</label>
      <select id="j-kelas" class="form-control" required>
        <option value="">Pilih Kelas...</option>
        ${classOptions}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label" for="j-mapel">Mata Pelajaran</label>
      <select id="j-mapel" class="form-control" required>
        ${subjectOptions}
      </select>
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="submitAddJadwal()">Simpan</button>
  `;

  openModal("Tambah Jadwal Mengajar", formHtml, footerHtml);
}

function submitAddJadwal() {
  const hari = document.getElementById("j-hari").value;
  const jamMulai = document.getElementById("j-jam-mulai").value;
  const jamSelesai = document.getElementById("j-jam-selesai").value;
  const kelasId = document.getElementById("j-kelas").value;
  const mapel = document.getElementById("j-mapel").value;

  if (!jamMulai || !jamSelesai || !kelasId || !mapel) {
    alert("Semua input wajib diisi!");
    return;
  }

  const id = "j-" + Date.now();
  db.jadwal.push({ id, hari, jamMulai, jamSelesai, kelasId, mapel });
  saveDatabase();
  closeModal();
  loadScheduleBoard();
  showToast("Jadwal mengajar ditambahkan!");
}

function deleteJadwal(id, hari) {
  if (confirm("Apakah Anda yakin ingin menghapus jadwal mengajar ini?")) {
    db.jadwal = db.jadwal.filter(j => j.id !== id);
    saveDatabase();
    loadScheduleBoard();
    showToast("Jadwal mengajar dihapus.");
  }
}


// ------------------------------------------
// 5. ABSENSI SISWA VIEW RENDER
// ------------------------------------------
// Migrate old absensi format (without mapel) to include mapel field
function migrateAbsensiData() {
  let changed = false;
  const defaultMapel = db.mapel && db.mapel.length > 0 ? db.mapel[0] : (db.guruProfile.mapel || "Umum");
  if (db.absensi && Array.isArray(db.absensi)) {
    db.absensi.forEach(a => {
      if (!a.mapel) {
        a.mapel = defaultMapel;
        changed = true;
      }
    });
  }
  if (changed) {
    saveDatabase();
    console.log("Absensi data migrated to include mapel field.");
  }
}

// ------------------------------------------
// 5. ABSENSI SISWA VIEW RENDER
// ------------------------------------------
function renderAbsensi(container) {
  migrateAbsensiData();
  const classOptionsHtml = db.kelas.map(k => `<option value="${k.id}">${k.nama}</option>`).join("");
  const mapelList = db.mapel && db.mapel.length > 0 ? db.mapel : [db.guruProfile.mapel || "Umum"];
  const mapelOptionsHtml = mapelList.map(m => `<option value="${m}">${m}</option>`).join("");
  const todayStr = getLocalDateString();

  container.innerHTML = `
    <div class="card">
      <div class="card-header" style="flex-wrap:wrap; gap:15px; justify-content: space-between; align-items: center;">
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <h3 class="card-title" style="margin:0;">Matriks Absensi Siswa</h3>
          <span class="badge badge-hadir" id="absensi-status-badge">Silakan Pilih Kelas</span>
        </div>
        <div>
          <button class="btn btn-secondary btn-sm" onclick="showSpreadsheetAbsensiModal()" title="Pengaturan Database Spreadsheet Absensi" style="color: #10b981; border-color: #10b981; font-weight: 600;">
            <i class="fas fa-file-excel"></i> Database Spreadsheet
          </button>
        </div>
      </div>

      <!-- Controls -->
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom: 25px;">
        <div>
          <label class="form-label" for="absensi-kelas-select">Kelas</label>
          <select id="absensi-kelas-select" class="form-control" onchange="onAbsensiFilterChange()">
            <option value="">-- Pilih Kelas --</option>
            ${classOptionsHtml}
          </select>
        </div>
        <div>
          <label class="form-label" for="absensi-mapel-select">Mata Pelajaran</label>
          <select id="absensi-mapel-select" class="form-control" onchange="onAbsensiFilterChange()">
            ${mapelOptionsHtml}
          </select>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="absensi-tabs" id="absensi-tabs">
        <button class="absensi-tab active" data-tab="input" onclick="switchAbsensiTab('input')">
          <i class="fas fa-edit"></i> Input Absensi
        </button>
        <button class="absensi-tab" data-tab="riwayat" onclick="switchAbsensiTab('riwayat')">
          <i class="fas fa-history"></i> Riwayat Absensi
        </button>
        <button class="absensi-tab" data-tab="rekap" onclick="switchAbsensiTab('rekap')">
          <i class="fas fa-chart-bar"></i> Rekap Absensi
        </button>
      </div>

      <!-- Tab Content -->
      <div id="absensi-tab-input" class="absensi-tab-content active">
        <div style="margin-bottom: 20px; max-width: 250px;">
          <label class="form-label" for="absensi-tanggal-input">Tanggal</label>
          <input type="date" id="absensi-tanggal-input" class="form-control" value="${todayStr}" onchange="loadAbsensiForm()">
        </div>
        
        <!-- Grid Formulir Absensi -->
        <div id="absensi-form-wrapper">
          <p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Silakan pilih kelas terlebih dahulu untuk mengisi absensi.</p>
        </div>
      </div>

      <div id="absensi-tab-riwayat" class="absensi-tab-content">
        <div id="absensi-riwayat-wrapper">
          <p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Silakan pilih kelas dan mata pelajaran untuk melihat riwayat absensi.</p>
        </div>
      </div>

      <div id="absensi-tab-rekap" class="absensi-tab-content">
        <div id="absensi-rekap-wrapper">
          <p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Silakan pilih kelas dan mata pelajaran untuk melihat rekap absensi.</p>
        </div>
      </div>
    </div>
  `;
}

function switchAbsensiTab(tabName) {
  // Update tab buttons
  document.querySelectorAll(".absensi-tab").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
  });
  // Update tab content
  document.querySelectorAll(".absensi-tab-content").forEach(content => {
    content.classList.remove("active");
  });
  document.getElementById(`absensi-tab-${tabName}`).classList.add("active");

  // Refresh content
  if (tabName === "input") loadAbsensiForm();
  else if (tabName === "riwayat") loadAbsensiRiwayat();
  else if (tabName === "rekap") loadAbsensiRekap();
}

function onAbsensiFilterChange() {
  const activeTab = document.querySelector(".absensi-tab.active");
  if (activeTab) {
    switchAbsensiTab(activeTab.getAttribute("data-tab"));
  }
}

function loadAbsensiForm() {
  const kelasId = document.getElementById("absensi-kelas-select").value;
  const mapel = document.getElementById("absensi-mapel-select").value;
  const tanggal = document.getElementById("absensi-tanggal-input").value;
  const wrapper = document.getElementById("absensi-form-wrapper");
  const badge = document.getElementById("absensi-status-badge");

  if (!kelasId) {
    wrapper.innerHTML = `<p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Silakan pilih kelas terlebih dahulu untuk mengisi absensi.</p>`;
    badge.textContent = "Silakan Pilih Kelas";
    badge.className = "badge badge-hadir";
    return;
  }

  if (!mapel) {
    wrapper.innerHTML = `<p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Silakan pilih mata pelajaran terlebih dahulu.</p>`;
    return;
  }

  if (!tanggal) {
    wrapper.innerHTML = `<p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Silakan pilih tanggal terlebih dahulu.</p>`;
    return;
  }

  const students = db.siswa.filter(s => s.kelasId === kelasId);

  if (students.length === 0) {
    wrapper.innerHTML = `<p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Kelas ini belum memiliki siswa terdaftar.</p>`;
    badge.textContent = "Tidak Ada Siswa";
    badge.className = "badge badge-alpa";
    return;
  }

  // Check if attendance already exists for this date, class, and mapel
  const classAttendance = db.absensi.filter(a => a.tanggal === tanggal && a.kelasId === kelasId && a.mapel === mapel);
  const isUpdate = classAttendance.length > 0;
  
  badge.textContent = isUpdate ? "Mode Edit: Absensi Terisi" : "Mode Input: Belum Terisi";
  badge.className = isUpdate ? "badge badge-izin" : "badge badge-sakit";

  let rowsHtml = students.map((s, idx) => {
    // Check if individual record exists
    const record = classAttendance.find(a => a.siswaId === s.id);
    const currentStatus = record ? record.status : "Hadir"; // Default is present

    return `
      <div class="attendance-row" data-siswa-id="${s.id}">
        <div>
          <span style="font-size:0.8rem; color:var(--text-muted); display:block;">No ${idx + 1}</span>
          <strong>${s.nama}</strong>
          <span style="font-size:0.75rem; color:var(--text-muted); display:block;">NISN: ${s.nisn}</span>
        </div>
        
        <div class="attendance-options">
          <div class="attendance-radio">
            <input type="radio" name="status-${s.id}" id="h-${s.id}" value="Hadir" ${currentStatus === 'Hadir' ? 'checked' : ''}>
            <label for="h-${s.id}">Hadir</label>
          </div>
          <div class="attendance-radio">
            <input type="radio" name="status-${s.id}" id="s-${s.id}" value="Sakit" ${currentStatus === 'Sakit' ? 'checked' : ''}>
            <label for="s-${s.id}">Sakit</label>
          </div>
          <div class="attendance-radio">
            <input type="radio" name="status-${s.id}" id="i-${s.id}" value="Izin" ${currentStatus === 'Izin' ? 'checked' : ''}>
            <label for="i-${s.id}">Izin</label>
          </div>
          <div class="attendance-radio">
            <input type="radio" name="status-${s.id}" id="a-${s.id}" value="Alpa" ${currentStatus === 'Alpa' ? 'checked' : ''}>
            <label for="a-${s.id}">Alpa</label>
          </div>
          <div class="attendance-radio">
            <input type="radio" name="status-${s.id}" id="t-${s.id}" value="Terlambat" ${currentStatus === 'Terlambat' ? 'checked' : ''}>
            <label for="t-${s.id}">Terlambat</label>
          </div>
          <div class="attendance-radio">
            <input type="radio" name="status-${s.id}" id="b-${s.id}" value="Bolos" ${currentStatus === 'Bolos' ? 'checked' : ''}>
            <label for="b-${s.id}">Bolos</label>
          </div>
        </div>
      </div>
    `;
  }).join("");

  wrapper.innerHTML = `
    <div class="attendance-grid">
      ${rowsHtml}
    </div>
    <div style="margin-top: 25px; display:flex; justify-content: flex-end;">
      <button class="btn btn-primary" onclick="submitAbsensiForm()"><i class="fas fa-save"></i> Simpan Absensi Kelas</button>
    </div>
  `;
}

function submitAbsensiForm() {
  const kelasId = document.getElementById("absensi-kelas-select").value;
  const mapel = document.getElementById("absensi-mapel-select").value;
  const tanggal = document.getElementById("absensi-tanggal-input").value;
  const rows = document.querySelectorAll(".attendance-row");

  if (!kelasId || !tanggal || !mapel) return;

  const previousFollowUpMap = {};
  (db.absensi || []).forEach(a => {
    if (a.tanggal === tanggal && a.kelasId === kelasId && a.mapel === mapel && a.followUp) {
      previousFollowUpMap[a.siswaId] = a.followUp;
    }
  });

  // Clear existing attendance for this class, date, and mapel
  db.absensi = db.absensi.filter(a => !(a.tanggal === tanggal && a.kelasId === kelasId && a.mapel === mapel));

  rows.forEach(row => {
    const siswaId = row.getAttribute("data-siswa-id");
    const status = row.querySelector(`input[name="status-${siswaId}"]:checked`).value;
    
    db.absensi.push({
      id: "a-" + Date.now() + Math.random().toString(36).substr(2, 5),
      tanggal,
      kelasId,
      siswaId,
      status,
      mapel,
      followUp: previousFollowUpMap[siswaId] || null
    });
  });

  saveDatabase(true);
  loadAbsensiForm();
  showToast("Absensi berhasil disimpan!");

  // Sinkronisasi otomatis ke database Google Spreadsheet (jika dikonfigurasi)
  syncSessionAbsensiToSpreadsheet({ tanggal, kelasId, mapel });
}

function loadAbsensiRiwayat() {
  const kelasId = document.getElementById("absensi-kelas-select").value;
  const mapel = document.getElementById("absensi-mapel-select").value;
  const wrapper = document.getElementById("absensi-riwayat-wrapper");
  const badge = document.getElementById("absensi-status-badge");

  if (!kelasId || !mapel) {
    wrapper.innerHTML = `<p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Silakan pilih kelas dan mata pelajaran terlebih dahulu.</p>`;
    badge.textContent = "Silakan Pilih Kelas";
    badge.className = "badge badge-hadir";
    return;
  }

  const classAbsList = db.absensi.filter(a => a.kelasId === kelasId && a.mapel === mapel);
  const uniqueDates = [...new Set(classAbsList.map(a => a.tanggal))].sort((a, b) => b.localeCompare(a));

  if (uniqueDates.length === 0) {
    wrapper.innerHTML = `<p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Belum ada riwayat absensi yang tercatat untuk kelas dan pelajaran ini.</p>`;
    badge.textContent = "Belum Ada Riwayat";
    badge.className = "badge badge-sakit";
    return;
  }

  badge.textContent = `Riwayat: ${uniqueDates.length} Sesi`;
  badge.className = "badge badge-hadir";

  let rowsHtml = uniqueDates.map((d, idx) => {
    const dayAbs = classAbsList.filter(a => a.tanggal === d);
    const H = dayAbs.filter(a => a.status === "Hadir").length;
    const S = dayAbs.filter(a => a.status === "Sakit").length;
    const I = dayAbs.filter(a => a.status === "Izin").length;
    const A = dayAbs.filter(a => a.status === "Alpa").length;
    const T = dayAbs.filter(a => a.status === "Terlambat").length;
    const B = dayAbs.filter(a => a.status === "Bolos").length;

    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${formatDateIndo(d)}</strong></td>
        <td style="color:var(--hadir); font-weight:600;">${H}</td>
        <td style="color:var(--sakit); font-weight:600;">${S}</td>
        <td style="color:var(--izin); font-weight:600;">${I}</td>
        <td style="color:var(--alpa); font-weight:600;">${A}</td>
        <td style="color:var(--terlambat); font-weight:600;">${T}</td>
        <td style="color:var(--bolos); font-weight:600;">${B}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-primary btn-sm" onclick="viewAbsensiSession('${d}')" title="Lihat Detail">
              <i class="fas fa-eye"></i> Lihat
            </button>
            <button class="btn btn-secondary btn-sm" onclick="editAbsensiSession('${d}')" title="Edit Absensi">
              <i class="fas fa-pen"></i> Edit
            </button>
            <button class="btn btn-secondary btn-sm" onclick="syncSpecificSessionToSpreadsheet('${d}')" title="Kirim/Sinkronkan Sesi Ini ke Spreadsheet" style="color: #10b981; border-color: #10b981;">
              <i class="fas fa-file-excel"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteAbsensiSession('${d}')" title="Hapus Absensi">
              <i class="fas fa-trash"></i> Hapus
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  wrapper.innerHTML = `
    <div class="table-responsive">
      <table class="nilai-entries-table" style="width:100%;">
        <thead>
          <tr>
            <th style="width: 50px;">No</th>
            <th>Tanggal</th>
            <th style="color:var(--hadir);">Hadir</th>
            <th style="color:var(--sakit);">Sakit</th>
            <th style="color:var(--izin);">Izin</th>
            <th style="color:var(--alpa);">Alpa</th>
            <th style="color:var(--terlambat);">Terlambat</th>
            <th style="color:var(--bolos);">Bolos</th>
            <th style="width: 220px;">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

function viewAbsensiSession(tanggal) {
  const kelasId = document.getElementById("absensi-kelas-select").value;
  const mapel = document.getElementById("absensi-mapel-select").value;
  
  const kelasObj = db.kelas.find(k => k.id === kelasId);
  const kelasNama = kelasObj ? kelasObj.nama : "Tidak Diketahui";
  
  const sessionAbsensi = db.absensi.filter(a => a.tanggal === tanggal && a.kelasId === kelasId && a.mapel === mapel);
  
  if (sessionAbsensi.length === 0) {
    alert("Data absensi tidak ditemukan.");
    return;
  }
  
  // Sort students by name
  const sortedAbsensi = [...sessionAbsensi].sort((a, b) => {
    const sA = db.siswa.find(s => s.id === a.siswaId);
    const sB = db.siswa.find(s => s.id === b.siswaId);
    const nameA = sA ? sA.nama.toLowerCase() : "";
    const nameB = sB ? sB.nama.toLowerCase() : "";
    return nameA.localeCompare(nameB);
  });
  
  let rowsHtml = sortedAbsensi.map((a, idx) => {
    const student = db.siswa.find(s => s.id === a.siswaId);
    const studentName = student ? student.nama : "Siswa Tidak Ditemukan";
    const studentNisn = student ? student.nisn : "-";
    
    let badgeClass = "badge-hadir";
    if (a.status === "Sakit") badgeClass = "badge-sakit";
    else if (a.status === "Izin") badgeClass = "badge-izin";
    else if (a.status === "Alpa") badgeClass = "badge-alpa";
    else if (a.status === "Terlambat") badgeClass = "badge-terlambat";
    else if (a.status === "Bolos") badgeClass = "badge-bolos";
    
    return `
      <tr>
        <td>${idx + 1}</td>
        <td>
          <div style="font-weight: 600; color: var(--text-main);">${studentName}</div>
          <span style="font-size: 0.75rem; color: var(--text-muted);">NISN: ${studentNisn}</span>
        </td>
        <td><span class="badge ${badgeClass}">${a.status}</span></td>
      </tr>
    `;
  }).join("");
  
  const bodyHtml = `
    <div style="font-family: var(--font-primary); color: var(--text-main);">
      <div style="margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; background: var(--bg-app); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">
        <div>
          <span style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom: 2px;">Kelas</span>
          <strong>${kelasNama}</strong>
        </div>
        <div>
          <span style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom: 2px;">Mata Pelajaran</span>
          <strong>${mapel}</strong>
        </div>
        <div>
          <span style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom: 2px;">Tanggal</span>
          <strong>${formatDateIndo(tanggal)}</strong>
        </div>
        <div>
          <span style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom: 2px;">Total Siswa</span>
          <strong>${sessionAbsensi.length} Siswa</strong>
        </div>
      </div>
      
      <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
        <table class="nilai-entries-table" style="width:100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="width: 50px;">No</th>
              <th>Nama Siswa</th>
              <th style="width: 120px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
  
  const footerHtml = `
    <button class="btn btn-secondary" onclick="closeModal()">Tutup</button>
  `;
  
  openModal(`Detail Absensi - ${formatDateIndo(tanggal)}`, bodyHtml, footerHtml);
}

function editAbsensiSession(tanggal) {
  document.getElementById("absensi-tanggal-input").value = tanggal;
  switchAbsensiTab('input');
}

function deleteAbsensiSession(tanggal) {
  const kelasId = document.getElementById("absensi-kelas-select").value;
  const mapel = document.getElementById("absensi-mapel-select").value;
  
  if (confirm(`Apakah Anda yakin ingin menghapus seluruh data absensi tanggal ${formatDateIndo(tanggal)}?`)) {
    db.absensi = db.absensi.filter(a => !(a.tanggal === tanggal && a.kelasId === kelasId && a.mapel === mapel));
    saveDatabase();
    loadAbsensiRiwayat();
    showToast("Data absensi berhasil dihapus!");
  }
}

function loadAbsensiRekap() {
  const kelasId = document.getElementById("absensi-kelas-select").value;
  const mapel = document.getElementById("absensi-mapel-select").value;
  const wrapper = document.getElementById("absensi-rekap-wrapper");
  const badge = document.getElementById("absensi-status-badge");

  if (!kelasId || !mapel) {
    wrapper.innerHTML = `<p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Silakan pilih kelas dan mata pelajaran terlebih dahulu.</p>`;
    badge.textContent = "Silakan Pilih Kelas";
    badge.className = "badge badge-hadir";
    return;
  }

  const students = db.siswa.filter(s => s.kelasId === kelasId);
  if (students.length === 0) {
    wrapper.innerHTML = `<p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Kelas ini belum memiliki siswa terdaftar.</p>`;
    badge.textContent = "Tidak Ada Siswa";
    badge.className = "badge badge-alpa";
    return;
  }

  const classAbsList = db.absensi.filter(a => a.kelasId === kelasId && a.mapel === mapel);
  const uniqueDates = [...new Set(classAbsList.map(a => a.tanggal))];
  const totalSessions = uniqueDates.length;

  badge.textContent = `Rekap: ${totalSessions} Sesi`;
  badge.className = "badge badge-hadir";

  // Sort students alphabetically by name
  const sortedStudents = [...students].sort((a, b) => a.nama.localeCompare(b.nama));

  let rowsHtml = sortedStudents.map((s, idx) => {
    const studentAbs = classAbsList.filter(a => a.siswaId === s.id);
    const total = studentAbs.length;
    
    const H = studentAbs.filter(a => a.status === "Hadir").length;
    const S = studentAbs.filter(a => a.status === "Sakit").length;
    const I = studentAbs.filter(a => a.status === "Izin").length;
    const A = studentAbs.filter(a => a.status === "Alpa").length;
    const T = studentAbs.filter(a => a.status === "Terlambat").length;
    const B = studentAbs.filter(a => a.status === "Bolos").length;
    
    const attendancePct = total > 0 ? Math.round(((H + T) / total) * 100) : 100;

    return `
      <tr>
        <td>${idx + 1}</td>
        <td><code>${s.nisn}</code></td>
        <td><strong>${s.nama}</strong></td>
        <td>${s.gender}</td>
        <td style="color:var(--hadir); font-weight:600;">${H}</td>
        <td style="color:var(--sakit); font-weight:600;">${S}</td>
        <td style="color:var(--izin); font-weight:600;">${I}</td>
        <td style="color:var(--alpa); font-weight:600;">${A}</td>
        <td style="color:var(--terlambat); font-weight:600;">${T}</td>
        <td style="color:var(--bolos); font-weight:600;">${B}</td>
        <td style="font-weight:700;">${attendancePct}%</td>
      </tr>
    `;
  }).join("");

  wrapper.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
      <h4 style="margin:0; font-size:0.95rem; color:var(--text-main);"><i class="fas fa-list"></i> Ringkasan Kehadiran Siswa</h4>
      <button class="btn btn-secondary btn-sm" onclick="exportAbsensiRekap('${kelasId}', '${mapel}')">
        <i class="fas fa-file-excel" style="color:#217346;"></i> Ekspor ke Excel (CSV)
      </button>
    </div>
    <div class="table-responsive">
      <table class="nilai-entries-table" style="width:100%;">
        <thead>
          <tr>
            <th style="width: 50px;">No</th>
            <th>NISN</th>
            <th>Nama Siswa</th>
            <th>L/P</th>
            <th style="color:var(--hadir);">Hadir</th>
            <th style="color:var(--sakit);">Sakit</th>
            <th style="color:var(--izin);">Izin</th>
            <th style="color:var(--alpa);">Alpa</th>
            <th style="color:var(--terlambat);">Terlambat</th>
            <th style="color:var(--bolos);">Bolos</th>
            <th>% Kehadiran</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

function exportAbsensiRekap(kelasId, mapel) {
  const kelasObj = db.kelas.find(k => k.id === kelasId);
  const kelasNama = kelasObj ? kelasObj.nama : "Kelas";
  
  const csvRows = [];
  csvRows.push(`Rekap Kehadiran Siswa - Kelas ${kelasNama}`);
  csvRows.push(`Mata Pelajaran: ${mapel}`);
  csvRows.push("No;NISN;Nama Siswa;Gender;Hadir;Sakit;Izin;Alpa;Terlambat;Bolos;Persentase Kehadiran");

  const students = db.siswa.filter(s => s.kelasId === kelasId);
  const sortedStudents = [...students].sort((a, b) => a.nama.localeCompare(b.nama));
  
  sortedStudents.forEach((s, idx) => {
    const studentAbs = db.absensi.filter(a => a.kelasId === kelasId && a.siswaId === s.id && a.mapel === mapel);
    const total = studentAbs.length;
    
    const H = studentAbs.filter(a => a.status === "Hadir").length;
    const S = studentAbs.filter(a => a.status === "Sakit").length;
    const I = studentAbs.filter(a => a.status === "Izin").length;
    const A = studentAbs.filter(a => a.status === "Alpa").length;
    const T = studentAbs.filter(a => a.status === "Terlambat").length;
    const B = studentAbs.filter(a => a.status === "Bolos").length;
    
    const attendancePct = total > 0 ? Math.round(((H + T) / total) * 100) : 100;
    
    csvRows.push(`${idx + 1};${s.nisn};${s.nama};${s.gender};${H};${S};${I};${A};${T};${B};${attendancePct}%`);
  });

  const csvContent = csvRows.join("\n");
  downloadCSV(csvContent, `rekap_absensi_${kelasNama}_${mapel.replace(/\s+/g, '_')}.csv`);
}


// ------------------------------------------
// 6. NILAI SISWA VIEW RENDER
// ------------------------------------------
function getBobotNilai() {
  if (!db.bobotNilai || typeof db.bobotNilai !== 'object' || Object.keys(db.bobotNilai).length === 0) {
    db.bobotNilai = {
      "Tugas": 30,
      "UTS": 25,
      "UAS": 25,
      "Ulangan Harian": 10,
      "Nilai Praktek": 10
    };
  }
  return db.bobotNilai;
}

function getActiveCategories() {
  const bobotMap = getBobotNilai();
  return Object.keys(bobotMap).filter(cat => (parseFloat(bobotMap[cat]) || 0) > 0);
}

function getBadgeClassByJenis(jenis) {
  switch(jenis) {
    case "Tugas": return "badge-izin";
    case "UTS": return "badge-sakit";
    case "UAS": return "badge-terlambat";
    case "Ulangan Harian": return "badge-hadir";
    case "Nilai Praktek": return "badge-alpa";
    default: return "badge-izin";
  }
}

function openModalBobotNilai() {
  const bobot = getBobotNilai();
  const categories = Object.keys(bobot);

  let inputsHtml = categories.map(cat => `
    <div class="form-group" style="margin-bottom: 12px;">
      <label class="form-label" style="font-weight:600;">Bobot ${cat} (%)</label>
      <input type="number" class="form-control bobot-input" data-cat="${cat}" min="0" max="100" value="${bobot[cat] || 0}" oninput="updateTotalBobotDisplay()">
    </div>
  `).join("");

  const bodyHtml = `
    <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:12px;">
      Atur persentase bobot tiap kategori nilai untuk menentukan perhitungan Nilai Akhir siswa. Total bobot idealnya adalah <strong>100%</strong>.
    </p>
    <p style="font-size:0.82rem; color:var(--info, #3b82f6); margin-bottom:15px; background:rgba(59,130,246,0.08); padding:8px 12px; border-radius:6px; border:1px solid rgba(59,130,246,0.2);">
      <i class="fas fa-info-circle"></i> <strong>Catatan:</strong> Jika bobot disetel <strong>0%</strong>, jenis nilai tersebut tidak akan dimasukkan/ditampilkan dalam tabel Rekap Nilai Akhir, Cetak Laporan, maupun Ekspor Excel.
    </p>
    <form id="form-bobot-nilai" onsubmit="event.preventDefault(); submitBobotNilai();">
      ${inputsHtml}
      <div style="padding: 10px 14px; background: var(--bg-hover, #f8f9fa); border-radius: 6px; display:flex; justify-content:space-between; align-items:center; margin-top:15px; border:1px solid var(--border-color, #e0e0e0);">
        <span style="font-weight:600;">Total Bobot Saat Ini:</span>
        <span id="total-bobot-badge" class="badge badge-hadir" style="font-size:0.95rem; font-weight:700;">100%</span>
      </div>
    </form>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="submitBobotNilai()"><i class="fas fa-save"></i> Simpan Bobot</button>
  `;

  openModal("Pengaturan Bobot Nilai", bodyHtml, footerHtml);
  setTimeout(updateTotalBobotDisplay, 50);
}

function updateTotalBobotDisplay() {
  const inputs = document.querySelectorAll(".bobot-input");
  let total = 0;
  inputs.forEach(inp => {
    total += (parseFloat(inp.value) || 0);
  });
  const badge = document.getElementById("total-bobot-badge");
  if (badge) {
    badge.textContent = total + "%";
    if (total === 100) {
      badge.className = "badge badge-hadir";
    } else {
      badge.className = "badge badge-sakit";
    }
  }
}

function submitBobotNilai() {
  const inputs = document.querySelectorAll(".bobot-input");
  const newBobot = {};
  let total = 0;

  inputs.forEach(inp => {
    const cat = inp.getAttribute("data-cat");
    const val = parseFloat(inp.value) || 0;
    newBobot[cat] = Math.max(0, val);
    total += newBobot[cat];
  });

  if (total <= 0) {
    alert("Total bobot nilai tidak boleh 0%!");
    return;
  }

  db.bobotNilai = newBobot;
  saveDatabase();
  closeModal();
  showToast("Pengaturan bobot nilai berhasil disimpan!");

  const activePage = window.location.hash.substring(1) || "dashboard";
  if (activePage === "nilai") {
    renderPage("nilai");
  }
}

function renderNilai(container) {
  // Migrate old data format if needed
  migrateNilaiData();

  const classOptionsHtml = db.kelas.map(k => `<option value="${k.id}">${k.nama}</option>`).join("");
  const subjectOptionsHtml = db.mapel.map(m => `<option value="${m}">${m}</option>`).join("");
  const bobotMap = getBobotNilai();
  const jenisOptionsHtml = Object.keys(bobotMap).map(j => `<option value="${j}">${j} (${bobotMap[j]}%)</option>`).join("");

  container.innerHTML = `
    <div class="card">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <h3 class="card-title">Input & Kelola Nilai Siswa</h3>
          <span class="badge badge-hadir">KKM: 75</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="openModalBobotNilai()" style="font-size:0.8rem; padding:6px 12px;">
          <i class="fas fa-sliders-h"></i> Pengaturan Bobot Nilai
        </button>
      </div>

      <!-- Filters -->
      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:20px; margin-bottom: 25px;">
        <div>
          <label class="form-label" for="nilai-kelas-select">Kelas</label>
          <select id="nilai-kelas-select" class="form-control" onchange="onNilaiFilterChange()">
            <option value="">-- Pilih Kelas --</option>
            ${classOptionsHtml}
          </select>
        </div>
        <div>
          <label class="form-label" for="nilai-mapel-select">Mata Pelajaran</label>
          <select id="nilai-mapel-select" class="form-control" onchange="onNilaiFilterChange()">
            ${subjectOptionsHtml}
          </select>
        </div>
        <div>
          <label class="form-label" for="nilai-jenis-select">Jenis Nilai</label>
          <select id="nilai-jenis-select" class="form-control" onchange="onNilaiFilterChange()">
            ${jenisOptionsHtml}
          </select>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="nilai-tabs" id="nilai-tabs">
        <button class="nilai-tab active" data-tab="input" onclick="switchNilaiTab('input')">
          <i class="fas fa-edit"></i> Input Nilai
        </button>
        <button class="nilai-tab" data-tab="riwayat" onclick="switchNilaiTab('riwayat')">
          <i class="fas fa-history"></i> Riwayat Nilai
        </button>
        <button class="nilai-tab" data-tab="rekap" onclick="switchNilaiTab('rekap')">
          <i class="fas fa-chart-bar"></i> Rekap Nilai Akhir
        </button>
      </div>

      <!-- Tab Content -->
      <div id="nilai-tab-input" class="nilai-tab-content active">
        <div id="nilai-table-wrapper">
          <p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Pilih kelas, mata pelajaran, dan jenis nilai untuk memasukkan nilai.</p>
        </div>
      </div>

      <div id="nilai-tab-riwayat" class="nilai-tab-content">
        <div id="nilai-riwayat-wrapper">
          <p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Pilih kelas dan mata pelajaran untuk melihat riwayat nilai.</p>
        </div>
      </div>

      <div id="nilai-tab-rekap" class="nilai-tab-content">
        <div id="nilai-rekap-wrapper">
          <p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Pilih kelas dan mata pelajaran untuk melihat rekap nilai akhir.</p>
        </div>
      </div>
    </div>
  `;
}

// Migrate old nilai format { tugas, uts, uas } to new multi-entry format { jenis, label, nilai, tanggal }
function migrateNilaiData() {
  if (!db.nilai || db.nilai.length === 0) return;

  const needsMigration = db.nilai.some(n => n.hasOwnProperty("tugas") || n.hasOwnProperty("uts") || n.hasOwnProperty("uas"));
  if (!needsMigration) return;

  const newNilai = [];
  const today = getLocalDateString();

  db.nilai.forEach(n => {
    if (n.hasOwnProperty("jenis")) {
      // Already new format
      newNilai.push(n);
      return;
    }
    // Old format: convert tugas/uts/uas to separate entries
    if (n.tugas && n.tugas > 0) {
      newNilai.push({ id: n.id + "_t", siswaId: n.siswaId, mapel: n.mapel, jenis: "Tugas", label: "Tugas 1", nilai: n.tugas, tanggal: n.tanggal || today });
    }
    if (n.uts && n.uts > 0) {
      newNilai.push({ id: n.id + "_u", siswaId: n.siswaId, mapel: n.mapel, jenis: "UTS", label: "UTS 1", nilai: n.uts, tanggal: n.tanggal || today });
    }
    if (n.uas && n.uas > 0) {
      newNilai.push({ id: n.id + "_a", siswaId: n.siswaId, mapel: n.mapel, jenis: "UAS", label: "UAS 1", nilai: n.uas, tanggal: n.tanggal || today });
    }
  });

  db.nilai = newNilai;
  saveDatabase();
  console.log("Nilai data migrated to new multi-entry format.");
}

// Helper: get average of a specific jenis for a student+mapel
function getAverageByJenis(siswaId, mapel, jenis) {
  const entries = db.nilai.filter(n => n.siswaId === siswaId && n.mapel === mapel && n.jenis === jenis);
  if (entries.length === 0) return 0;
  const sum = entries.reduce((acc, n) => acc + (n.nilai || 0), 0);
  return Math.round(sum / entries.length);
}

// Helper: compute final grade for a student using configured bobotNilai weights
function computeFinalGrade(siswaId, mapel) {
  const bobotMap = getBobotNilai();
  const categories = Object.keys(bobotMap);
  let weightedSum = 0;
  let totalWeight = 0;

  categories.forEach(cat => {
    const weight = parseFloat(bobotMap[cat]) || 0;
    if (weight > 0) {
      const avg = getAverageByJenis(siswaId, mapel, cat);
      weightedSum += (avg * weight);
      totalWeight += weight;
    }
  });

  if (totalWeight === 0) return 0;
  return Math.round(weightedSum / totalWeight);
}

// Helper: get next label number for a jenis (e.g., "Tugas 3")
function getNextLabel(siswaId, mapel, jenis) {
  const entries = db.nilai.filter(n => n.siswaId === siswaId && n.mapel === mapel && n.jenis === jenis);
  return `${jenis} ${entries.length + 1}`;
}

// Tab switching
function switchNilaiTab(tabName) {
  // Update tab buttons
  document.querySelectorAll(".nilai-tab").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
  });
  // Update tab content
  document.querySelectorAll(".nilai-tab-content").forEach(content => {
    content.classList.remove("active");
  });
  document.getElementById(`nilai-tab-${tabName}`).classList.add("active");

  // Refresh content
  if (tabName === "input") loadNilaiTable();
  else if (tabName === "riwayat") loadNilaiRiwayat();
  else if (tabName === "rekap") loadNilaiRekap();
}

function onNilaiFilterChange() {
  // Refresh currently active tab
  const activeTab = document.querySelector(".nilai-tab.active");
  if (activeTab) {
    switchNilaiTab(activeTab.getAttribute("data-tab"));
  }
}

// TAB 1: Input Nilai
function loadNilaiTable() {
  const kelasId = document.getElementById("nilai-kelas-select").value;
  const mapel = document.getElementById("nilai-mapel-select").value;
  const jenis = document.getElementById("nilai-jenis-select").value;
  const wrapper = document.getElementById("nilai-table-wrapper");

  if (!kelasId || !mapel || !jenis) {
    wrapper.innerHTML = `<p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Pilih kelas, mata pelajaran, dan jenis nilai untuk memasukkan nilai.</p>`;
    return;
  }

  const students = db.siswa.filter(s => s.kelasId === kelasId);

  if (students.length === 0) {
    wrapper.innerHTML = `<p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Kelas ini belum memiliki siswa terdaftar.</p>`;
    return;
  }

  // Determine next label for each student
  const todayStr = getLocalDateString();

  let tableRows = students.map((s, idx) => {
    const nextLabel = getNextLabel(s.id, mapel, jenis);
    const existingCount = db.nilai.filter(n => n.siswaId === s.id && n.mapel === mapel && n.jenis === jenis).length;

    return `
      <tr class="grade-row" data-siswa-id="${s.id}">
        <td>${idx + 1}</td>
        <td>
          <strong>${s.nama}</strong><br>
          <span style="font-size:0.75rem; color:var(--text-muted);">NISN: ${s.nisn}</span>
        </td>
        <td>
          <span class="badge badge-izin">${existingCount} entri</span>
        </td>
        <td style="font-weight:600; color:var(--text-muted); font-size:0.85rem;">${nextLabel}</td>
        <td>
          <input type="number" class="nilai-input" min="0" max="100" value="" placeholder="0-100" data-siswa-id="${s.id}" data-label="${nextLabel}">
        </td>
      </tr>
    `;
  }).join("");

  wrapper.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="badge badge-hadir" style="font-size:0.85rem; padding:6px 12px;">
          <i class="fas fa-pen"></i> ${jenis}
        </span>
        <span style="font-size:0.85rem; color:var(--text-muted);">
          Input tanggal: <strong>${formatDateIndo(todayStr)}</strong>
        </span>
      </div>
    </div>
    <div class="table-responsive">
      <table class="grade-table">
        <thead>
          <tr>
            <th style="width:50px;">No</th>
            <th>Nama Siswa</th>
            <th>Entri Sebelumnya</th>
            <th>Label</th>
            <th style="width:120px;">Nilai (0-100)</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
    <div style="margin-top: 25px; display:flex; justify-content: flex-end;">
      <button class="btn btn-primary" onclick="submitNilaiForm()"><i class="fas fa-save"></i> Simpan Nilai ${jenis}</button>
    </div>
  `;
}

// TAB 2: Riwayat Nilai
function loadNilaiRiwayat() {
  const kelasId = document.getElementById("nilai-kelas-select").value;
  const mapel = document.getElementById("nilai-mapel-select").value;
  const wrapper = document.getElementById("nilai-riwayat-wrapper");

  if (!kelasId || !mapel) {
    wrapper.innerHTML = `<p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Pilih kelas dan mata pelajaran untuk melihat riwayat nilai.</p>`;
    return;
  }

  const students = db.siswa.filter(s => s.kelasId === kelasId);
  if (students.length === 0) {
    wrapper.innerHTML = `<p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Kelas ini belum memiliki siswa terdaftar.</p>`;
    return;
  }

  const bobotMap = getBobotNilai();
  const activeCategories = getActiveCategories();
  const displayCategories = activeCategories.length > 0 ? activeCategories : Object.keys(bobotMap);

  let cardsHtml = students.map(s => {
    const entries = db.nilai.filter(n => n.siswaId === s.id && n.mapel === mapel)
      .sort((a, b) => {
        return a.tanggal.localeCompare(b.tanggal);
      });

    if (entries.length === 0) {
      return `
        <div class="nilai-riwayat-card">
          <div class="nilai-riwayat-header">
            <strong>${s.nama}</strong>
            <span style="font-size:0.75rem; color:var(--text-muted);">NISN: ${s.nisn}</span>
          </div>
          <p style="text-align:center; padding:12px 0; color:var(--text-muted); font-size:0.85rem;">Belum ada nilai diinput.</p>
        </div>
      `;
    }

    const finalGrade = computeFinalGrade(s.id, mapel);
    const passClass = finalGrade >= 75 ? "pass" : "fail";
    const statusText = finalGrade >= 75 ? "Lulus" : "Remedial";

    const summaryItemsHtml = displayCategories.map(cat => {
      const avg = getAverageByJenis(s.id, mapel, cat);
      return `<span><strong>${cat}:</strong> ${avg}</span>`;
    }).join(` <span style="color:var(--text-muted);">|</span> `);

    let entriesHtml = entries.map(e => {
      const badgeClass = getBadgeClassByJenis(e.jenis);
      return `
        <tr>
          <td><span class="badge ${badgeClass}">${e.jenis}</span></td>
          <td>${e.label}</td>
          <td style="font-weight:700;">${e.nilai}</td>
          <td>${formatDateIndo(e.tanggal)}</td>
          <td>
            <div style="display:flex; gap:4px;">
              <button class="btn btn-secondary btn-sm" onclick="editNilaiEntry('${e.id}')" style="padding:3px 8px; font-size:0.7rem;">
                <i class="fas fa-pen"></i>
              </button>
              <button class="btn btn-danger btn-sm" onclick="deleteNilaiEntry('${e.id}')" style="padding:3px 8px; font-size:0.7rem;">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    return `
      <div class="nilai-riwayat-card">
        <div class="nilai-riwayat-header">
          <div>
            <strong>${s.nama}</strong>
            <span style="font-size:0.75rem; color:var(--text-muted); margin-left:8px;">NISN: ${s.nisn}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="final-grade-cell ${passClass}" style="font-size:1.1rem;">${finalGrade}</span>
            <span class="badge ${finalGrade >= 75 ? 'badge-hadir' : 'badge-alpa'}">${statusText}</span>
          </div>
        </div>
        <div class="nilai-riwayat-summary" style="display:flex; flex-wrap:wrap; gap:6px 10px; font-size:0.82rem; padding:8px 12px; background:var(--bg-hover, #f8f9fa); border-radius:6px; margin: 10px 0; border:1px solid var(--border-color, #eee);">
          ${summaryItemsHtml}
        </div>
        <table class="nilai-entries-table">
          <thead>
            <tr>
              <th>Jenis</th>
              <th>Label</th>
              <th>Nilai</th>
              <th>Tanggal</th>
              <th style="width:50px;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${entriesHtml}
          </tbody>
        </table>
      </div>
    `;
  }).join("");

  wrapper.innerHTML = cardsHtml;
}

// TAB 3: Rekap Nilai Akhir
function loadNilaiRekap() {
  const kelasId = document.getElementById("nilai-kelas-select").value;
  const mapel = document.getElementById("nilai-mapel-select").value;
  const wrapper = document.getElementById("nilai-rekap-wrapper");

  if (!kelasId || !mapel) {
    wrapper.innerHTML = `<p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Pilih kelas dan mata pelajaran untuk melihat rekap nilai akhir.</p>`;
    return;
  }

  const students = db.siswa.filter(s => s.kelasId === kelasId);
  if (students.length === 0) {
    wrapper.innerHTML = `<p style="text-align:center; padding: 40px 0; color:var(--text-muted);">Kelas ini belum memiliki siswa terdaftar.</p>`;
    return;
  }

  const bobotMap = getBobotNilai();
  const activeCategories = getActiveCategories();
  const displayCategories = activeCategories.length > 0 ? activeCategories : Object.keys(bobotMap);

  const headerCatCols = displayCategories.map(cat => `<th>Rata ${cat} (${bobotMap[cat]}%)</th>`).join("");

  let tableRows = students.map((s, idx) => {
    const finalGrade = computeFinalGrade(s.id, mapel);
    const passClass = finalGrade >= 75 ? "pass" : "fail";
    const statusText = finalGrade >= 75 ? "Lulus" : "Remedial";

    const catCells = displayCategories.map(cat => {
      const avg = getAverageByJenis(s.id, mapel, cat);
      const count = db.nilai.filter(n => n.siswaId === s.id && n.mapel === mapel && n.jenis === cat).length;
      return `<td>${avg} <span style="font-size:0.7rem; color:var(--text-muted);">(${count}x)</span></td>`;
    }).join("");

    return `
      <tr>
        <td>${idx + 1}</td>
        <td>
          <strong>${s.nama}</strong><br>
          <span style="font-size:0.75rem; color:var(--text-muted);">NISN: ${s.nisn}</span>
        </td>
        ${catCells}
        <td class="final-grade-cell ${passClass}">${finalGrade}</td>
        <td><span class="badge ${finalGrade >= 75 ? 'badge-hadir' : 'badge-alpa'}">${statusText}</span></td>
      </tr>
    `;
  }).join("");

  wrapper.innerHTML = `
    <div class="table-responsive">
      <table class="grade-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Nama Siswa</th>
            ${headerCatCols}
            <th>Nilai Akhir</th>
            <th>Status (KKM 75)</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  `;
}

// Format date helper
function formatDateIndo(dateStr) {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Submit new nilai entries
function submitNilaiForm() {
  const kelasId = document.getElementById("nilai-kelas-select").value;
  const mapel = document.getElementById("nilai-mapel-select").value;
  const jenis = document.getElementById("nilai-jenis-select").value;
  const todayStr = getLocalDateString();

  if (!kelasId || !mapel || !jenis) return;

  const inputs = document.querySelectorAll(".nilai-input");
  let savedCount = 0;

  inputs.forEach(input => {
    const nilai = parseFloat(input.value);
    if (isNaN(nilai) || nilai < 0 || nilai > 100) return; // Skip empty or invalid
    if (input.value.trim() === "") return; // Skip truly empty

    const siswaId = input.getAttribute("data-siswa-id");
    const label = input.getAttribute("data-label");

    db.nilai.push({
      id: "n-" + Date.now() + Math.random().toString(36).substr(2, 5),
      siswaId,
      mapel,
      jenis,
      label,
      nilai,
      tanggal: todayStr
    });
    savedCount++;
  });

  if (savedCount === 0) {
    showToast("Tidak ada nilai yang diisi. Masukkan minimal satu nilai.");
    return;
  }

  saveDatabase();
  loadNilaiTable(); // Refresh to show updated labels
  showToast(`${savedCount} nilai ${jenis} berhasil disimpan!`);
}

// Edit a single nilai entry
function editNilaiEntry(id) {
  const entry = db.nilai.find(n => n.id === id);
  if (!entry) return;

  const formHtml = `
    <input type="hidden" id="edit-nilai-id" value="${entry.id}">
    <div class="form-group">
      <label class="form-label">Jenis Nilai</label>
      <input type="text" class="form-control" value="${entry.jenis}" disabled style="opacity:0.6;">
    </div>
    <div class="form-group">
      <label class="form-label" for="edit-nilai-label">Label</label>
      <input type="text" id="edit-nilai-label" class="form-control" value="${entry.label}">
    </div>
    <div class="form-group">
      <label class="form-label" for="edit-nilai-score">Nilai (0-100)</label>
      <input type="number" id="edit-nilai-score" class="form-control" min="0" max="100" value="${entry.nilai}" required>
    </div>
    <div class="form-group">
      <label class="form-label" for="edit-nilai-tanggal">Tanggal</label>
      <input type="date" id="edit-nilai-tanggal" class="form-control" value="${entry.tanggal}">
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="submitEditNilai()"><i class="fas fa-save"></i> Simpan Perubahan</button>
  `;

  openModal(`Edit ${entry.label}`, formHtml, footerHtml);
}

function submitEditNilai() {
  const id = document.getElementById("edit-nilai-id").value;
  const label = document.getElementById("edit-nilai-label").value.trim();
  const nilai = parseFloat(document.getElementById("edit-nilai-score").value);
  const tanggal = document.getElementById("edit-nilai-tanggal").value;

  if (isNaN(nilai) || nilai < 0 || nilai > 100) {
    alert("Nilai harus berupa angka antara 0-100!");
    return;
  }

  const idx = db.nilai.findIndex(n => n.id === id);
  if (idx !== -1) {
    if (label) db.nilai[idx].label = label;
    db.nilai[idx].nilai = nilai;
    if (tanggal) db.nilai[idx].tanggal = tanggal;

    saveDatabase();
    closeModal();
    loadNilaiRiwayat();
    showToast("Nilai berhasil diperbarui!");
  }
}

// Delete a single nilai entry
function deleteNilaiEntry(id) {
  if (confirm("Apakah Anda yakin ingin menghapus entri nilai ini?")) {
    db.nilai = db.nilai.filter(n => n.id !== id);
    saveDatabase();
    loadNilaiRiwayat();
    showToast("Entri nilai berhasil dihapus.");
  }
}


// ------------------------------------------
// 7. JURNAL MENGAJAR VIEW RENDER
// ------------------------------------------
function renderJurnal(container) {
  activeEditJurnalId = null; // Reset edit state on load
  const classOptionsHtml = db.kelas.map(k => `<option value="${k.id}">${k.nama}</option>`).join("");
  const subjectOptionsHtml = db.mapel.map(m => `<option value="${m}">${m}</option>`).join("");
  const todayStr = getLocalDateString();

  container.innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:30px;">
      <!-- Left column: Add Entry Form -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Catat Jurnal Harian</h3>
        </div>
        
        <div class="form-group">
          <label class="form-label" for="jr-tanggal">Tanggal</label>
          <input type="date" id="jr-tanggal" class="form-control" value="${todayStr}" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="jr-kelas">Kelas</label>
          <select id="jr-kelas" class="form-control" required>
            <option value="">-- Pilih Kelas --</option>
            ${classOptionsHtml}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="jr-mapel">Mata Pelajaran</label>
          <select id="jr-mapel" class="form-control" required>
            ${subjectOptionsHtml}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="jr-materi">Materi Pembelajaran</label>
          <input type="text" id="jr-materi" class="form-control" placeholder="Contoh: Diskriminan Persamaan Kuadrat" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="jr-hambatan">Hambatan/Masalah</label>
          <textarea id="jr-hambatan" class="form-control" rows="3" placeholder="Masalah yang ditemui (kosongkan jika tidak ada)"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="jr-solusi">Solusi / Tindak Lanjut</label>
          <textarea id="jr-solusi" class="form-control" rows="3" placeholder="Rencana tindak lanjut atau solusi atas hambatan"></textarea>
        </div>
        
        <div style="display:flex; justify-content: flex-end;">
          <button class="btn btn-primary" onclick="submitJurnal()"><i class="fas fa-save"></i> Simpan Jurnal</button>
        </div>
      </div>

      <!-- Right column: Journal History Timeline -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Riwayat Jurnal Mengajar</h3>
        </div>
        <div id="jurnal-history-list" style="max-height: 520px; overflow-y: auto; padding-right:5px; display:flex; flex-direction:column; gap:16px;">
          <!-- Loaded dynamically -->
        </div>
      </div>
    </div>
  `;

  loadJurnalHistory();
}

function loadJurnalHistory() {
  const listWrapper = document.getElementById("jurnal-history-list");
  if (!listWrapper) return;

  // Sort journals descending by date
  const sortedJurnal = [...db.jurnal].sort((a,b) => b.tanggal.localeCompare(a.tanggal));

  if (sortedJurnal.length === 0) {
    listWrapper.innerHTML = `<p style="text-align:center; padding-top: 50px; color:var(--text-muted);">Belum ada riwayat jurnal mengajar.</p>`;
    return;
  }

  listWrapper.innerHTML = sortedJurnal.map(j => {
    const kelasObj = db.kelas.find(k => k.id === j.kelasId);
    const kelasNama = kelasObj ? kelasObj.nama : "Tidak Diketahui";
    
    // Format date Indo
    const dateParts = j.tanggal.split('-');
    const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

    return `
      <div style="background-color: var(--bg-input); border: 1px solid var(--border-color); border-left: 4px solid var(--primary); padding:16px; border-radius:10px; position:relative;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items:center;">
          <span style="font-size:0.75rem; font-weight:600; color:var(--text-muted);"><i class="far fa-calendar-alt"></i> ${formattedDate}</span>
          <span class="badge badge-izin">${kelasNama} - ${j.mapel}</span>
        </div>
        
        <h4 style="font-family:var(--font-display); font-size:0.95rem; font-weight:600; margin-bottom:8px;">${j.materi}</h4>
        
        ${j.hambatan ? `
          <div style="font-size:0.8rem; margin-bottom:6px; color:var(--text-main);">
            <strong style="color:var(--alpa);">Hambatan:</strong> ${j.hambatan}
          </div>
        ` : ''}
        
        ${j.solusi ? `
          <div style="font-size:0.8rem; color:var(--text-main);">
            <strong style="color:var(--hadir);">Solusi:</strong> ${j.solusi}
          </div>
        ` : ''}

        <div style="position:absolute; bottom:12px; right:12px; display:flex; gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="editJurnal('${j.id}')" style="padding:3px 8px; font-size:0.7rem;" title="Edit Jurnal">
            <i class="fas fa-pen"></i>
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteJurnal('${j.id}')" style="padding:3px 8px; font-size:0.7rem;" title="Hapus Jurnal">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function editJurnal(id) {
  const journal = db.jurnal.find(j => j.id === id);
  if (!journal) return;

  activeEditJurnalId = id;
  
  // Fill the form fields on the left
  document.getElementById("jr-tanggal").value = journal.tanggal;
  document.getElementById("jr-kelas").value = journal.kelasId;
  document.getElementById("jr-mapel").value = journal.mapel;
  document.getElementById("jr-materi").value = journal.materi;
  document.getElementById("jr-hambatan").value = journal.hambatan || "";
  document.getElementById("jr-solusi").value = journal.solusi || "";

  // Update card header/title to show editing mode
  const titleEl = document.querySelector("#content-container .card-title");
  if (titleEl) {
    titleEl.innerHTML = `Catat Jurnal Harian <span style="font-size:0.8rem; color:var(--alpa); font-weight:normal;">(Mode Edit)</span>`;
  }
  
  // Show save button with different text and add a cancel button
  const formCard = document.querySelector("#content-container .card");
  if (formCard) {
    const btnContainer = formCard.querySelector("div[style*='justify-content: flex-end']");
    if (btnContainer) {
      btnContainer.innerHTML = `
        <button class="btn btn-secondary" onclick="cancelEditJurnal()" style="margin-right:8px;"><i class="fas fa-times"></i> Batal</button>
        <button class="btn btn-primary" onclick="submitJurnal()"><i class="fas fa-save"></i> Simpan Perubahan</button>
      `;
    }
  }
}

function cancelEditJurnal() {
  activeEditJurnalId = null;
  
  // Reset form inputs
  const todayStr = getLocalDateString();
  document.getElementById("jr-tanggal").value = todayStr;
  document.getElementById("jr-kelas").value = "";
  const mapelSelect = document.getElementById("jr-mapel");
  if (mapelSelect && mapelSelect.options.length > 0) {
    mapelSelect.selectedIndex = 0;
  }
  document.getElementById("jr-materi").value = "";
  document.getElementById("jr-hambatan").value = "";
  document.getElementById("jr-solusi").value = "";

  // Restore title
  const titleEl = document.querySelector("#content-container .card-title");
  if (titleEl) {
    titleEl.textContent = "Catat Jurnal Harian";
  }

  // Restore button
  const formCard = document.querySelector("#content-container .card");
  if (formCard) {
    const btnContainer = formCard.querySelector("div[style*='justify-content: flex-end']");
    if (btnContainer) {
      btnContainer.innerHTML = `
        <button class="btn btn-primary" onclick="submitJurnal()"><i class="fas fa-save"></i> Simpan Jurnal</button>
      `;
    }
  }
}

function submitJurnal() {
  const tanggal = document.getElementById("jr-tanggal").value;
  const kelasId = document.getElementById("jr-kelas").value;
  const mapel = document.getElementById("jr-mapel").value;
  const materi = document.getElementById("jr-materi").value.trim();
  const hambatan = document.getElementById("jr-hambatan").value.trim();
  const solusi = document.getElementById("jr-solusi").value.trim();

  if (!tanggal || !kelasId || !materi) {
    alert("Tanggal, Kelas, dan Materi wajib diisi!");
    return;
  }

  if (activeEditJurnalId) {
    // Update existing journal
    const jIdx = db.jurnal.findIndex(j => j.id === activeEditJurnalId);
    if (jIdx !== -1) {
      db.jurnal[jIdx] = { ...db.jurnal[jIdx], tanggal, kelasId, mapel, materi, hambatan, solusi };
      saveDatabase();
      showToast("Catatan jurnal berhasil diperbarui!");
    }
    cancelEditJurnal();
  } else {
    // Create new journal
    const id = "jrn-" + Date.now();
    db.jurnal.push({ id, tanggal, kelasId, mapel, materi, hambatan, solusi });
    saveDatabase();
    
    // Clear inputs
    document.getElementById("jr-materi").value = "";
    document.getElementById("jr-hambatan").value = "";
    document.getElementById("jr-solusi").value = "";
    showToast("Jurnal harian berhasil dicatat!");
  }

  loadJurnalHistory();
}

function deleteJurnal(id) {
  if (confirm("Apakah Anda yakin ingin menghapus catatan jurnal ini?")) {
    db.jurnal = db.jurnal.filter(j => j.id !== id);
    saveDatabase();
    loadJurnalHistory();
    showToast("Jurnal berhasil dihapus.");
  }
}


// ------------------------------------------
// 8. REKAP & CETAK VIEW RENDER
// ------------------------------------------
function renderRekap(container) {
  const classOptionsHtml = db.kelas.map(k => `<option value="${k.id}">${k.nama}</option>`).join("");
  const subjectOptionsHtml = `<option value="ALL">-- Semua Pelajaran --</option>` + db.mapel.map(m => `<option value="${m}">${m}</option>`).join("");

  container.innerHTML = `
    <!-- Selection controls -->
    <div class="card no-print">
      <div class="card-header">
        <h3 class="card-title">Pilih Rekapitulasi Data</h3>
      </div>
      
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px; margin-bottom: 20px;">
        <div>
          <label class="form-label" for="rekap-tipe-select">Tipe Rekap</label>
          <select id="rekap-tipe-select" class="form-control" onchange="toggleRekapControls()">
            <option value="absensi">Rekap Kehadiran (Absensi)</option>
            <option value="nilai">Rekap Nilai Siswa</option>
            <option value="jurnal">Rekap Jurnal Mengajar</option>
            <option value="jadwal">Rekap Jadwal Mengajar</option>
          </select>
        </div>
        <div id="rekap-kelas-wrapper">
          <label class="form-label" for="rekap-kelas-select">Kelas</label>
          <select id="rekap-kelas-select" class="form-control" onchange="generateRekapTable()">
            <option value="">-- Pilih Kelas --</option>
            ${classOptionsHtml}
          </select>
        </div>
        <div id="rekap-mapel-wrapper" style="display:none;">
          <label class="form-label" for="rekap-mapel-select">Mata Pelajaran</label>
          <select id="rekap-mapel-select" class="form-control" onchange="generateRekapTable()">
            ${subjectOptionsHtml}
          </select>
        </div>
      </div>

      <div style="display:flex; gap:12px; justify-content: flex-end;" id="rekap-actions-btn" style="display:none;">
        <button class="btn btn-secondary" onclick="exportToExcel()"><i class="fas fa-file-excel" style="color:var(--hadir);"></i> Unduh Excel (CSV)</button>
        <button class="btn btn-primary" onclick="printReport()"><i class="fas fa-file-pdf" style="color:#fff;"></i> Cetak PDF / Cetak Kertas</button>
      </div>
    </div>

    <!-- Printable Report View -->
    <div class="card" id="rekap-report-card" style="display:none;">
      <!-- Header Cetak Kertas -->
      <div id="report-print-header" style="display: flex; align-items: center; justify-content: center; gap: 25px; margin-bottom: 30px; border-bottom: 3px double var(--text-main); padding-bottom: 15px;">
        ${db.guruProfile.logo ? `<img id="report-school-logo" src="${db.guruProfile.logo}" style="max-height: 80px; max-width: 80px; object-fit: contain;">` : ''}
        <div style="text-align:center;">
          <h2 style="font-family:var(--font-display); font-size:1.6rem; font-weight:700; margin-bottom:5px; margin-top:0;">LAPORAN ADMINISTRASI GURU</h2>
          <h3 id="report-school-title" style="font-size:1.1rem; font-weight:600; margin-bottom:5px;">${db.guruProfile.sekolah}</h3>
          <p id="report-school-alamat" style="font-size:0.85rem; color:var(--text-muted); margin-bottom: 0;">Alamat: ${db.guruProfile.alamat || ''}</p>
        </div>
      </div>

      <!-- Report Metadata -->
      <div style="display:grid; grid-template-columns: 1.5fr 1fr; margin-bottom:20px; font-size:0.9rem; line-height:1.6;">
        <div>
          <p><strong>Mata Pelajaran:</strong> <span id="meta-mapel">${db.guruProfile.mapel}</span></p>
          <p><strong>Kelas:</strong> <span id="meta-kelas">-</span></p>
          <p><strong>Guru Pengampu:</strong> ${db.guruProfile.nama}</p>
        </div>
        <div style="text-align: right;">
          <p><strong>Tanggal Cetak:</strong> ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p><strong>Status:</strong> Resmi / Dokumen Kelas</p>
        </div>
      </div>

      <!-- Report Title -->
      <h3 id="report-type-title" style="text-align:center; font-family:var(--font-display); margin-bottom:20px; border-bottom: 1px solid var(--border-color); padding-bottom:8px;">REKAPITULASI ABSENSI SISWA</h3>

      <!-- Report Table Injector -->
      <div id="rekap-table-content" class="table-responsive">
        <!-- Injected rekap table -->
      </div>

      <!-- Signature Section (Print Only style or simple styling) -->
      <div style="display:flex; justify-content: space-between; margin-top: 50px; text-align: center; font-size:0.9rem;">
        <div style="width: 240px;">
          <p>Mengetahui,</p>
          <p>Kepala Sekolah</p>
          <div style="height: 70px;"></div>
          <p style="text-decoration: underline; font-weight:700;" id="report-kepsek-nama">${db.guruProfile.kepalaSekolah || '-'}</p>
          <p id="report-kepsek-nip">NIP: ${db.guruProfile.kepalaSekolahNip || '-'}</p>
        </div>
        <div style="width: 240px;">
          <p>${(db.guruProfile.sekolah && !db.guruProfile.sekolah.includes("Jakarta")) ? (db.guruProfile.sekolah.split(" ").slice(-1)[0] || "Lasolo") : "Lasolo"}, ${new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p>Guru Pengampu,</p>
          <div style="height: 70px;"></div>
          <p style="text-decoration: underline; font-weight:700;">${db.guruProfile.nama}</p>
          <p>NIP: ${db.guruProfile.nip}</p>
        </div>
      </div>
    </div>
  `;
  toggleRekapControls();
}

function toggleRekapControls() {
  const type = document.getElementById("rekap-tipe-select").value;
  const mapelWrapper = document.getElementById("rekap-mapel-wrapper");
  const kelasWrapper = document.getElementById("rekap-kelas-wrapper");
  const mapelSelect = document.getElementById("rekap-mapel-select");
  
  // Reset visibility
  kelasWrapper.style.display = "block";
  mapelWrapper.style.display = "none";

  if (type === "nilai") {
    mapelWrapper.style.display = "block";
    if (mapelSelect.value === "ALL") {
      mapelSelect.value = db.mapel[0] || "";
    }
    const allOption = mapelSelect.querySelector('option[value="ALL"]');
    if (allOption) allOption.style.display = "none";
  } else if (type === "jurnal" || type === "absensi") {
    mapelWrapper.style.display = "block";
    const allOption = mapelSelect.querySelector('option[value="ALL"]');
    if (allOption) allOption.style.display = "block";
  } else if (type === "jadwal") {
    kelasWrapper.style.display = "none";
  }
  generateRekapTable();
}

function generateRekapTable() {
  const type = document.getElementById("rekap-tipe-select").value;
  const kelasId = document.getElementById("rekap-kelas-select").value;
  const mapel = document.getElementById("rekap-mapel-select").value;

  const reportCard = document.getElementById("rekap-report-card");
  const tableContent = document.getElementById("rekap-table-content");
  const metaKelas = document.getElementById("meta-kelas");
  const metaMapel = document.getElementById("meta-mapel");
  const reportTypeTitle = document.getElementById("report-type-title");

  if (!kelasId && type !== "jadwal") {
    reportCard.style.display = "none";
    return;
  }

  reportCard.style.display = "block";
  if (kelasId) {
    const kelasObj = db.kelas.find(k => k.id === kelasId);
    metaKelas.textContent = kelasObj ? kelasObj.nama : "-";
  } else {
    metaKelas.textContent = "Semua Kelas";
  }

  if (type === "absensi") {
    const students = db.siswa.filter(s => s.kelasId === kelasId);
    if (students.length === 0) {
      tableContent.innerHTML = `<p style="text-align:center; padding:30px; color:var(--text-muted);">Tidak ada siswa di kelas ini.</p>`;
      return;
    }
    metaMapel.textContent = mapel === "ALL" ? "Semua Mata Pelajaran" : mapel;
    reportTypeTitle.textContent = mapel === "ALL" ? "REKAPITULASI KEHADIRAN (ABSENSI) SISWA" : `REKAPITULASI KEHADIRAN (ABSENSI) SISWA - ${mapel.toUpperCase()}`;
    
    let rowsHtml = students.map((s, idx) => {
      const studentAbs = db.absensi.filter(a => {
        const matchKelas = a.kelasId === kelasId;
        const matchSiswa = a.siswaId === s.id;
        const matchMapel = mapel === "ALL" || a.mapel === mapel;
        return matchKelas && matchSiswa && matchMapel;
      });
      const total = studentAbs.length;
      
      const H = studentAbs.filter(a => a.status === "Hadir").length;
      const S = studentAbs.filter(a => a.status === "Sakit").length;
      const I = studentAbs.filter(a => a.status === "Izin").length;
      const A = studentAbs.filter(a => a.status === "Alpa").length;
      const T = studentAbs.filter(a => a.status === "Terlambat").length;
      const B = studentAbs.filter(a => a.status === "Bolos").length;
      
      const attendancePct = total > 0 ? Math.round(((H + T) / total) * 100) : 100;

      return `
        <tr>
          <td>${idx + 1}</td>
          <td><code>${s.nisn}</code></td>
          <td><strong>${s.nama}</strong></td>
          <td>${s.gender}</td>
          <td style="color:var(--hadir); font-weight:600;">${H}</td>
          <td style="color:var(--sakit); font-weight:600;">${S}</td>
          <td style="color:var(--izin); font-weight:600;">${I}</td>
          <td style="color:var(--alpa); font-weight:600;">${A}</td>
          <td style="color:var(--terlambat); font-weight:600;">${T}</td>
          <td style="color:var(--bolos); font-weight:600;">${B}</td>
          <td style="font-weight:700;">${attendancePct}%</td>
        </tr>
      `;
    }).join("");

    tableContent.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>NISN</th>
            <th>Nama Siswa</th>
            <th>L/P</th>
            <th>Hadir</th>
            <th>Sakit</th>
            <th>Izin</th>
            <th>Alpa</th>
            <th>Terlambat</th>
            <th>Bolos</th>
            <th>% Kehadiran</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  } else if (type === "nilai") {
    const students = db.siswa.filter(s => s.kelasId === kelasId);
    if (students.length === 0) {
      tableContent.innerHTML = `<p style="text-align:center; padding:30px; color:var(--text-muted);">Tidak ada siswa di kelas ini.</p>`;
      return;
    }
    metaMapel.textContent = mapel;
    reportTypeTitle.textContent = `REKAPITULASI NILAI AKADEMIK - ${mapel.toUpperCase()}`;

    const bobotMap = getBobotNilai();
    const activeCategories = getActiveCategories();
    const displayCategories = activeCategories.length > 0 ? activeCategories : Object.keys(bobotMap);
    const headerCatCols = displayCategories.map(cat => `<th>Rata ${cat} (${bobotMap[cat]}%)</th>`).join("");

    let rowsHtml = students.map((s, idx) => {
      const finalGrade = computeFinalGrade(s.id, mapel);
      const passClass = finalGrade >= 75 ? "pass" : "fail";
      const statusText = finalGrade >= 75 ? "LULUS" : "REMEDIAL";

      const catCells = displayCategories.map(cat => {
        const avg = getAverageByJenis(s.id, mapel, cat);
        return `<td>${avg}</td>`;
      }).join("");

      return `
        <tr>
          <td>${idx + 1}</td>
          <td><code>${s.nisn}</code></td>
          <td><strong>${s.nama}</strong></td>
          <td>${s.gender}</td>
          ${catCells}
          <td class="final-grade-cell ${passClass}" style="font-weight:700;">${finalGrade}</td>
          <td style="font-weight:600;"><span class="badge ${finalGrade >= 75 ? 'badge-hadir' : 'badge-alpa'}">${statusText}</span></td>
        </tr>
      `;
    }).join("");

    tableContent.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>NISN</th>
            <th>Nama Siswa</th>
            <th>L/P</th>
            ${headerCatCols}
            <th>Nilai Akhir</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  } else if (type === "jurnal") {
    metaMapel.textContent = mapel === "ALL" ? "Semua Mata Pelajaran" : mapel;
    reportTypeTitle.textContent = "REKAPITULASI JURNAL MENGAJAR HARIAN GURU";

    let filteredJournals = db.jurnal.filter(j => j.kelasId === kelasId);
    if (mapel !== "ALL") {
      filteredJournals = filteredJournals.filter(j => j.mapel === mapel);
    }
    
    // Sort journals chronologically
    filteredJournals.sort((a, b) => a.tanggal.localeCompare(b.tanggal));

    if (filteredJournals.length === 0) {
      tableContent.innerHTML = `<p style="text-align:center; padding:30px; color:var(--text-muted);">Tidak ada catatan jurnal mengajar untuk kelas/pelajaran ini.</p>`;
      return;
    }

    let rowsHtml = filteredJournals.map((j, idx) => {
      const dateParts = j.tanggal.split('-');
      const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

      // Get attendance records matching date, class, and mapel
      const absList = db.absensi.filter(a => a.tanggal === j.tanggal && a.kelasId === j.kelasId && a.mapel === j.mapel);
      
      let attendanceHtml = "";
      
      if (absList.length === 0) {
        attendanceHtml = `<span style="color:var(--text-muted); font-style:italic;">Belum diisi</span>`;
      } else {
        const H = absList.filter(a => a.status === "Hadir").length;
        const S = absList.filter(a => a.status === "Sakit").length;
        const I = absList.filter(a => a.status === "Izin").length;
        const A = absList.filter(a => a.status === "Alpa").length;
        const T = absList.filter(a => a.status === "Terlambat").length;
        const B = absList.filter(a => a.status === "Bolos").length;

        attendanceHtml = `
          <div style="font-size:0.8rem; display:flex; flex-wrap:wrap; gap:2px 6px; margin-bottom: 2px;">
            <span><span style="color:var(--hadir); font-weight:600;">H:</span>${H}</span>
            <span><span style="color:var(--sakit); font-weight:600;">S:</span>${S}</span>
            <span><span style="color:var(--izin); font-weight:600;">I:</span>${I}</span>
            <span><span style="color:var(--alpa); font-weight:600;">A:</span>${A}</span>
            <span><span style="color:var(--terlambat); font-weight:600;">T:</span>${T}</span>
            <span><span style="color:var(--bolos); font-weight:600;">B:</span>${B}</span>
          </div>
        `;

        const absentList = absList.filter(a => a.status !== "Hadir" && a.status !== "Terlambat");
        if (absentList.length > 0) {
          const absentNames = absentList.map(a => {
            const student = db.siswa.find(s => s.id === a.siswaId);
            const name = student ? student.nama : "Siswa";
            let statusChar = a.status[0]; // S, I, A, B
            return `${name} (${statusChar})`;
          }).join(", ");
          
          attendanceHtml += `<div style="font-size:0.7rem; color:var(--text-muted); line-height:1.2; max-width: 160px; word-break: break-word;">${absentNames}</div>`;
        }
      }

      return `
        <tr>
          <td>${idx + 1}</td>
          <td style="white-space: nowrap;">${formattedDate}</td>
          <td><strong>${j.mapel}</strong></td>
          <td>${j.materi}</td>
          <td>${attendanceHtml}</td>
          <td>${j.hambatan || '<span style="color:var(--text-muted); font-style:italic;">Tidak ada</span>'}</td>
          <td>${j.solusi || '<span style="color:var(--text-muted); font-style:italic;">Tidak ada</span>'}</td>
        </tr>
      `;
    }).join("");

    tableContent.innerHTML = `
      <table>
        <thead>
          <tr>
            <th style="width: 50px;">No</th>
            <th style="width: 100px;">Tanggal</th>
            <th style="width: 140px;">Pelajaran</th>
            <th>Materi Pembelajaran</th>
            <th style="width: 180px;">Kehadiran Siswa</th>
            <th>Hambatan / Masalah</th>
            <th>Solusi / Tindak Lanjut</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  } else if (type === "jadwal") {
    const list = db.jadwal || [];
    if (list.length === 0) {
      tableContent.innerHTML = `<p style="text-align:center; padding:30px; color:var(--text-muted);">Belum ada jadwal mengajar yang terdaftar.</p>`;
      return;
    }
    
    const dayOrder = { "Senin": 1, "Selasa": 2, "Rabu": 3, "Kamis": 4, "Jumat": 5, "Sabtu": 6, "Minggu": 7 };
    const sortedList = [...list].sort((a, b) => {
      if (dayOrder[a.hari] !== dayOrder[b.hari]) {
        return (dayOrder[a.hari] || 99) - (dayOrder[b.hari] || 99);
      }
      return a.jamMulai.localeCompare(b.jamMulai);
    });

    metaMapel.textContent = "Semua Mata Pelajaran";
    reportTypeTitle.textContent = "REKAPITULASI JADWAL MENGAJAR GURU";

    let rowsHtml = sortedList.map((j, idx) => {
      const kelasObj = db.kelas.find(k => k.id === j.kelasId);
      const kelasNama = kelasObj ? kelasObj.nama : j.kelasId;
      return `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${j.hari}</strong></td>
          <td><code>${j.jamMulai} - ${j.jamSelesai}</code></td>
          <td>${kelasNama}</td>
          <td><strong>${j.mapel}</strong></td>
        </tr>
      `;
    }).join("");

    tableContent.innerHTML = `
      <table>
        <thead>
          <tr>
            <th style="width: 50px;">No</th>
            <th>Hari</th>
            <th>Waktu / Jam</th>
            <th>Kelas</th>
            <th>Mata Pelajaran</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }
}

function printReport() {
  window.print();
}

function exportToExcel() {
  const type = document.getElementById("rekap-tipe-select").value;
  const kelasId = document.getElementById("rekap-kelas-select").value;
  const mapel = document.getElementById("rekap-mapel-select").value;

  if (!kelasId && type !== "jadwal") return;
  const kelasObj = kelasId ? db.kelas.find(k => k.id === kelasId) : null;
  const kelasNama = kelasObj ? kelasObj.nama.replace(/\s+/g, '_') : 'semua_kelas';

  let csvRows = [];
  
  if (type === "absensi") {
    const students = db.siswa.filter(s => s.kelasId === kelasId);
    // Header
    csvRows.push(`Rekap Absensi: ${mapel === "ALL" ? "Semua Mata Pelajaran" : mapel}`);
    csvRows.push("No;NISN;Nama Siswa;Gender;Hadir;Sakit;Izin;Alpa;Terlambat;Bolos;Persentase Kehadiran");
    
    students.forEach((s, idx) => {
      const studentAbs = db.absensi.filter(a => {
        const matchKelas = a.kelasId === kelasId;
        const matchSiswa = a.siswaId === s.id;
        const matchMapel = mapel === "ALL" || a.mapel === mapel;
        return matchKelas && matchSiswa && matchMapel;
      });
      const total = studentAbs.length;
      
      const H = studentAbs.filter(a => a.status === "Hadir").length;
      const S = studentAbs.filter(a => a.status === "Sakit").length;
      const I = studentAbs.filter(a => a.status === "Izin").length;
      const A = studentAbs.filter(a => a.status === "Alpa").length;
      const T = studentAbs.filter(a => a.status === "Terlambat").length;
      const B = studentAbs.filter(a => a.status === "Bolos").length;
      
      const attendancePct = total > 0 ? Math.round(((H + T) / total) * 100) : 100;
      
      csvRows.push(`${idx + 1};${s.nisn};${s.nama};${s.gender};${H};${S};${I};${A};${T};${B};${attendancePct}%`);
    });

    const csvContent = csvRows.join("\n");
    downloadCSV(csvContent, `rekap_absensi_${kelasNama}_${mapel.replace(/\s+/g, '_')}.csv`);
  } else if (type === "nilai") {
    const students = db.siswa.filter(s => s.kelasId === kelasId);
    const bobotMap = getBobotNilai();
    const activeCategories = getActiveCategories();
    const displayCategories = activeCategories.length > 0 ? activeCategories : Object.keys(bobotMap);

    const catHeaders = displayCategories.map(cat => `Rata-rata ${cat}(${bobotMap[cat]}%)`).join(";");

    csvRows.push(`Rekap Nilai: ${mapel}`);
    csvRows.push(`No;NISN;Nama Siswa;Gender;${catHeaders};Nilai Akhir;Status`);
    
    students.forEach((s, idx) => {
      const finalGrade = computeFinalGrade(s.id, mapel);
      const statusText = finalGrade >= 75 ? "LULUS" : "REMEDIAL";
      const catValues = displayCategories.map(cat => getAverageByJenis(s.id, mapel, cat)).join(";");
      
      csvRows.push(`${idx + 1};${s.nisn};${s.nama};${s.gender};${catValues};${finalGrade};${statusText}`);
    });

    const csvContent = csvRows.join("\n");
    downloadCSV(csvContent, `rekap_nilai_${kelasNama}_${mapel.replace(/\s+/g, '_')}.csv`);
  } else if (type === "jurnal") {
    // Jurnal
    csvRows.push(`Rekap Jurnal Mengajar: ${mapel === "ALL" ? "Semua Pelajaran" : mapel}`);
    csvRows.push("No;Tanggal;Mata Pelajaran;Materi Pembelajaran;Kehadiran Siswa;Hambatan/Masalah;Solusi/Tindak Lanjut");
    
    let filteredJournals = db.jurnal.filter(j => j.kelasId === kelasId);
    if (mapel !== "ALL") {
      filteredJournals = filteredJournals.filter(j => j.mapel === mapel);
    }
    filteredJournals.sort((a, b) => a.tanggal.localeCompare(b.tanggal));
    
    filteredJournals.forEach((j, idx) => {
      const dateParts = j.tanggal.split('-');
      const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
      
      // Get attendance records matching date, class, and mapel
      const absList = db.absensi.filter(a => a.tanggal === j.tanggal && a.kelasId === j.kelasId && a.mapel === j.mapel);
      
      let attendanceCsvStr = "";
      if (absList.length === 0) {
        attendanceCsvStr = "Belum diisi";
      } else {
        const H = absList.filter(a => a.status === "Hadir").length;
        const S = absList.filter(a => a.status === "Sakit").length;
        const I = absList.filter(a => a.status === "Izin").length;
        const A = absList.filter(a => a.status === "Alpa").length;
        const T = absList.filter(a => a.status === "Terlambat").length;
        const B = absList.filter(a => a.status === "Bolos").length;
        
        attendanceCsvStr = `H:${H}, S:${S}, I:${I}, A:${A}, T:${T}, B:${B}`;
        
        const absentList = absList.filter(a => a.status !== "Hadir" && a.status !== "Terlambat");
        if (absentList.length > 0) {
          const absentNames = absentList.map(a => {
            const student = db.siswa.find(s => s.id === a.siswaId);
            const name = student ? student.nama : "Siswa";
            let statusChar = a.status[0]; // S, I, A, B
            return `${name} (${statusChar})`;
          }).join(", ");
          attendanceCsvStr += ` (${absentNames})`;
        }
      }

      const materiEscaped = j.materi.replace(/"/g, '""');
      const hambatanEscaped = (j.hambatan || "").replace(/"/g, '""');
      const solusiEscaped = (j.solusi || "").replace(/"/g, '""');
      
      csvRows.push(`${idx + 1};${formattedDate};"${j.mapel}";"${materiEscaped}";"${attendanceCsvStr}";"${hambatanEscaped}";"${solusiEscaped}"`);
    });

    const csvContent = csvRows.join("\n");
    downloadCSV(csvContent, `rekap_jurnal_${kelasNama}.csv`);
  } else if (type === "jadwal") {
    const list = db.jadwal || [];
    // Header
    csvRows.push("Rekap Jadwal Mengajar Guru");
    csvRows.push("No;Hari;Jam Mulai;Jam Selesai;Kelas;Mata Pelajaran");

    const dayOrder = { "Senin": 1, "Selasa": 2, "Rabu": 3, "Kamis": 4, "Jumat": 5, "Sabtu": 6, "Minggu": 7 };
    const sortedList = [...list].sort((a, b) => {
      if (dayOrder[a.hari] !== dayOrder[b.hari]) {
        return (dayOrder[a.hari] || 99) - (dayOrder[b.hari] || 99);
      }
      return a.jamMulai.localeCompare(b.jamMulai);
    });

    sortedList.forEach((j, idx) => {
      const kObj = db.kelas.find(c => c.id === j.kelasId);
      const kNama = kObj ? kObj.nama : j.kelasId;
      csvRows.push(`${idx + 1};${j.hari};${j.jamMulai};${j.jamSelesai};${kNama};${j.mapel}`);
    });

    const csvContent = csvRows.join("\n");
    downloadCSV(csvContent, `rekap_jadwal_mengajar.csv`);
  }
  showToast("File laporan CSV Excel berhasil diunduh!");
}

function downloadCSV(csvContent, fileName) {
  // Use BOM prefix to ensure Excel reads semicolons and UTF-8 characters correctly in Indonesian Windows locales
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


// ------------------------------------------
// 9. PROFIL GURU & SEKOLAH VIEW RENDER
// ------------------------------------------
function renderProfil(container) {
  // Ensure profile values are initialized
  if (!db.guruProfile.alamat) db.guruProfile.alamat = "";
  if (!db.guruProfile.kepalaSekolah) db.guruProfile.kepalaSekolah = "";
  if (!db.guruProfile.kepalaSekolahNip) db.guruProfile.kepalaSekolahNip = "";

  const session = getSession();
  const isAdmin = session && session.role === "admin";
  const currSettings = getSettingsSiswaBaru();

  container.innerHTML = `
    <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:30px;">
      <!-- Column Left -->
      <div style="display:flex; flex-direction:column; gap:30px;">
        <!-- Profile Form -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Profil Guru & Sekolah</h3>
          </div>
          
          <!-- Foto Profil & Logo Sekolah Upload Row -->
          <div style="display:flex; gap:30px; margin-bottom: 25px; align-items: center; justify-content: flex-start; flex-wrap: wrap; background-color: var(--bg-app); padding: 15px; border-radius: 12px; border: 1px solid var(--border-color);">
            <div style="text-align: center; flex: 1; min-width: 120px;">
              <span class="form-label" style="margin-bottom:8px; display:block;">Foto Profil Guru</span>
              <div id="prof-photo-preview" style="width: 100px; height: 100px; border-radius: 50%; border: 2px dashed var(--border-color); background: var(--bg-input); display: flex; align-items: center; justify-content: center; overflow: hidden; margin: 0 auto 10px; cursor: pointer; position: relative;" onclick="document.getElementById('prof-photo-input').click()">
                ${db.guruProfile.foto ? `<img src="${db.guruProfile.foto}" style="width: 100%; height: 100%; object-fit: cover;">` : `<i class="fas fa-user-tie" style="font-size: 2.5rem; color: var(--text-muted);"></i>`}
              </div>
              <input type="file" id="prof-photo-input" accept="image/*" style="display: none;" onchange="handleImageUpload(this, 'foto')">
              <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('prof-photo-input').click()"><i class="fas fa-camera"></i> Unggah Foto</button>
            </div>
            
            <div style="text-align: center; flex: 1; min-width: 120px;">
              <span class="form-label" style="margin-bottom:8px; display:block;">Logo Sekolah</span>
              <div id="school-logo-preview" style="width: 100px; height: 100px; border-radius: 12px; border: 2px dashed var(--border-color); background: var(--bg-input); display: flex; align-items: center; justify-content: center; overflow: hidden; margin: 0 auto 10px; cursor: pointer; position: relative;" onclick="document.getElementById('school-logo-input').click()">
                ${db.guruProfile.logo ? `<img src="${db.guruProfile.logo}" style="width: 100%; height: 100%; object-fit: contain; padding: 4px;">` : `<i class="fas fa-school" style="font-size: 2.5rem; color: var(--text-muted);"></i>`}
              </div>
              <input type="file" id="school-logo-input" accept="image/*" style="display: none;" onchange="handleImageUpload(this, 'logo')">
              <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('school-logo-input').click()"><i class="fas fa-image"></i> Unggah Logo</button>
            </div>
          </div>

          <div class="form-row" style="margin-bottom: 20px;">
            <div class="form-group">
              <label class="form-label" for="prof-nama">Nama Guru Lengkap</label>
              <input type="text" id="prof-nama" class="form-control" value="${db.guruProfile.nama || ''}" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="prof-nip">NIP Guru</label>
              <input type="text" id="prof-nip" class="form-control" value="${db.guruProfile.nip || ''}" required>
            </div>
          </div>
          
          <div class="form-row" style="margin-bottom: 20px;">
            <div class="form-group">
              <label class="form-label" for="prof-sekolah">Nama Sekolah</label>
              <input type="text" id="prof-sekolah" class="form-control" value="${db.guruProfile.sekolah || ''}" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="prof-alamat">Alamat Sekolah</label>
              <input type="text" id="prof-alamat" class="form-control" value="${db.guruProfile.alamat || ''}" placeholder="Alamat lengkap sekolah..." required>
            </div>
          </div>

          <div class="form-row" style="margin-bottom: 20px;">
            <div class="form-group">
              <label class="form-label" for="prof-kepsek">Nama Kepala Sekolah</label>
              <input type="text" id="prof-kepsek" class="form-control" value="${db.guruProfile.kepalaSekolah || ''}" placeholder="Nama Kepala Sekolah..." required>
            </div>
            <div class="form-group">
              <label class="form-label" for="prof-kepsek-nip">NIP Kepala Sekolah</label>
              <input type="text" id="prof-kepsek-nip" class="form-control" value="${db.guruProfile.kepalaSekolahNip || ''}" placeholder="NIP Kepala Sekolah..." required>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Mata Pelajaran yang Diampu</label>
            <div id="subject-inputs-container" style="display:flex; flex-direction:column; gap:8px; margin-bottom:10px;">
              <!-- Dynamic subject input lines will be added here -->
            </div>
            <button class="btn btn-secondary btn-sm" onclick="addSubjectInputField()"><i class="fas fa-plus"></i> Tambah Pelajaran</button>
          </div>
          
          <div style="display:flex; justify-content: flex-end; margin-top:20px;">
            <button class="btn btn-primary" onclick="submitProfile()"><i class="fas fa-save"></i> Simpan Profil & Pelajaran</button>
          </div>
        </div>

        <!-- User Management Card -->
        ${isAdmin ? `
        <div class="card">
          <div class="card-header" style="justify-content: space-between; display: flex; align-items: center; flex-wrap: wrap; gap: 10px;">
            <h3 class="card-title">Manajemen Akun Guru / Pengguna</h3>
            <button class="btn btn-primary btn-sm" onclick="showAddUserModal()"><i class="fas fa-plus"></i> Tambah Akun</button>
          </div>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;">
            Kelola akun email dan password yang diperbolehkan masuk ke aplikasi Sman_Saku.<br>
            <span style="display:inline-flex; align-items:center; gap:6px; margin-top:5px; font-size:0.8rem; color:var(--primary); background:rgba(30,58,138,0.06); padding:4px 10px; border-radius:6px; border:1px solid rgba(30,58,138,0.12);">
              <i class="fas fa-shield-alt"></i> <span><strong>Akun Utama:</strong> <code>admin@smansaku.id</code> tidak dapat dihapus. Akun Administrator lain hanya dapat dihapus oleh Akun Utama.</span>
            </span>
          </p>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Nama</th>
                  <th>Email & Password</th>
                  <th>Role</th>
                  <th class="actions-cell">Aksi</th>
                </tr>
              </thead>
              <tbody id="users-table-body">
                <!-- Loaded dynamically -->
              </tbody>
            </table>
          </div>
        </div>
        ` : ''}
      </div>

      <!-- Settings & Tools Right Column -->
      <div style="display:flex; flex-direction:column; gap:30px;">
        <!-- Card Pengaturan Nilai Siswa Baru -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title"><i class="fas fa-tasks" style="color:var(--accent);"></i> Pengaturan Nilai Siswa Baru</h3>
          </div>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;">
            Tentukan perilaku sistem saat siswa baru dimasukkan ke kelas yang memiliki riwayat nilai tugas/ujian lalu.
          </p>
          <div class="form-group" style="margin-bottom: 15px;">
            <label class="form-label" style="font-weight:600; margin-bottom:8px;">Modus Penanganan Nilai Lalu:</label>
            <div style="display:flex; flex-direction:column; gap:10px; font-size:0.85rem; padding: 4px 0;">
              <label style="cursor:pointer; display:flex; align-items:flex-start; gap:10px;">
                <input type="radio" name="settings-siswa-baru-mode" value="prompt" ${currSettings.mode === 'prompt' ? 'checked' : ''} style="margin-top:3px;">
                <div>
                  <strong>Tanyakan & Input Modal (Rekomendasi)</strong>
                  <div style="font-size:0.75rem; color:var(--text-muted);">Menampilkan modal input nilai lalu secara otomatis saat siswa baru ditambahkan.</div>
                </div>
              </label>
              <label style="cursor:pointer; display:flex; align-items:flex-start; gap:10px;">
                <input type="radio" name="settings-siswa-baru-mode" value="auto_kkm" ${currSettings.mode === 'auto_kkm' ? 'checked' : ''} style="margin-top:3px;">
                <div>
                  <strong>Otomatis Isi KKM (75)</strong>
                  <div style="font-size:0.75rem; color:var(--text-muted);">Otomatis memberikan nilai KKM untuk seluruh tugas lalu di kelas tersebut.</div>
                </div>
              </label>
              <label style="cursor:pointer; display:flex; align-items:flex-start; gap:10px;">
                <input type="radio" name="settings-siswa-baru-mode" value="auto_avg" ${currSettings.mode === 'auto_avg' ? 'checked' : ''} style="margin-top:3px;">
                <div>
                  <strong>Otomatis Rata-Rata Kelas</strong>
                  <div style="font-size:0.75rem; color:var(--text-muted);">Otomatis mengisi nilai sesuai rata-rata kelas untuk setiap tugas/ujian lalu.</div>
                </div>
              </label>
              <label style="cursor:pointer; display:flex; align-items:flex-start; gap:10px;">
                <input type="radio" name="settings-siswa-baru-mode" value="manual" ${currSettings.mode === 'manual' ? 'checked' : ''} style="margin-top:3px;">
                <div>
                  <strong>Manual Nanti</strong>
                  <div style="font-size:0.75rem; color:var(--text-muted);">Jangan tampilkan prompt otomatis. Guru dapat mengisi dari tombol "Nilai Lalu" kapan saja.</div>
                </div>
              </label>
            </div>
          </div>
          <div class="form-group" style="margin-bottom: 18px;">
            <label class="form-label" for="settings-siswa-baru-score">Nilai Default KKM</label>
            <input type="number" id="settings-siswa-baru-score" class="form-control" min="0" max="100" value="${currSettings.defaultScore || 75}">
          </div>
          <button class="btn btn-primary" style="width:100%; justify-content:center;" onclick="saveSettingsSiswaBaru()">
            <i class="fas fa-save"></i> Simpan Pengaturan Nilai Siswa Baru
          </button>
        </div>

        <div class="card">
          <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <h3 class="card-title"><i class="fas fa-palette" style="color:var(--primary); margin-right:8px;"></i> Pengaturan Tampilan & Tema</h3>
            <span id="active-palette-badge" class="badge" style="background:var(--primary-light); color:var(--primary); font-size:0.75rem; padding:4px 10px; border-radius:8px; border:1px solid var(--primary); font-weight:600;">
              Aktif: ${getPaletteDisplayName(document.documentElement.getAttribute("data-palette") || "violet-modern")}
            </span>
          </div>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;">
            Pilih skema warna dan mode pencahayaan yang paling nyaman dan profesional untuk aktivitas mengajar Anda.
          </p>

          <!-- Mode Pencahayaan (Terang / Gelap) -->
          <div style="margin-bottom:18px;">
            <label class="form-label" style="font-size:0.82rem; font-weight:700; margin-bottom:8px; display:block; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted);">Mode Pencahayaan</label>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <button type="button" class="theme-mode-btn ${(document.documentElement.getAttribute('data-theme') || 'light') === 'light' ? 'active' : ''}" data-mode="light" onclick="setThemeMode('light')">
                <i class="fas fa-sun" style="color:#f59e0b; font-size:1.1rem;"></i>
                <span>Mode Terang</span>
              </button>
              <button type="button" class="theme-mode-btn ${(document.documentElement.getAttribute('data-theme') || 'light') === 'dark' ? 'active' : ''}" data-mode="dark" onclick="setThemeMode('dark')">
                <i class="fas fa-moon" style="color:#6366f1; font-size:1.1rem;"></i>
                <span>Mode Gelap</span>
              </button>
            </div>
          </div>

          <!-- Pilihan Palet Warna Sman_Saku -->
          <div>
            <label class="form-label" style="font-size:0.82rem; font-weight:700; margin-bottom:8px; display:block; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted);">Pilihan Palet Warna (5 Pilihan)</label>
            <div class="palette-grid">
              ${THEME_PALETTES.map(p => {
                const isAct = (document.documentElement.getAttribute('data-palette') || 'violet-modern') === p.id;
                return `
                  <div class="palette-card ${isAct ? 'active' : ''}" data-palette="${p.id}" onclick="setPalette('${p.id}')">
                    <div class="palette-swatch" style="background:${p.color};">
                      <i class="fas ${p.icon}"></i>
                    </div>
                    <div class="palette-name">${p.name}</div>
                    <div class="palette-tag">${p.tag}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Change Password Card -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Ubah Password</h3>
          </div>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;">Ubah password masuk untuk akun Anda.</p>
          <div class="form-group" style="margin-bottom: 12px;">
            <label class="form-label" for="change-pwd-old">Password Lama</label>
            <input type="password" id="change-pwd-old" class="form-control" placeholder="Masukkan password saat ini..." required>
          </div>
          <div class="form-group" style="margin-bottom: 12px;">
            <label class="form-label" for="change-pwd-new">Password Baru</label>
            <input type="password" id="change-pwd-new" class="form-control" placeholder="Masukkan password baru..." required>
          </div>
          <div class="form-group" style="margin-bottom: 15px;">
            <label class="form-label" for="change-pwd-confirm">Konfirmasi Password Baru</label>
            <input type="password" id="change-pwd-confirm" class="form-control" placeholder="Ulangi password baru..." required>
          </div>
          <button class="btn btn-primary" style="width:100%; justify-content:center;" onclick="changeUserPassword()">
            <i class="fas fa-key"></i> Perbarui Password
          </button>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Manajemen Database</h3>
          </div>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:15px;">Kelola penyimpanan database lokal (LocalStorage) aplikasi Sman_Saku.</p>
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div style="display:flex; gap:10px;">
              <button class="btn btn-secondary" style="justify-content:center; flex:1; padding:8px;" onclick="exportDatabaseJSON()">
                <i class="fas fa-file-download" style="color:var(--hadir);"></i> Ekspor (JSON)
              </button>
              <button class="btn btn-secondary" style="justify-content:center; flex:1; padding:8px;" onclick="document.getElementById('import-db-file').click()">
                <i class="fas fa-file-upload" style="color:var(--accent);"></i> Impor (JSON)
              </button>
            </div>
            <input type="file" id="import-db-file" accept=".json" style="display:none;" onchange="importDatabaseJSON(event)">
            <button class="btn btn-danger" style="justify-content:center; width:100%;" onclick="triggerResetDatabase()">
              <i class="fas fa-trash-alt"></i> Hapus Semua Data
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Inject current subjects
  const subjects = db.mapel || [];
  subjects.forEach(subj => {
    addSubjectInputField(subj);
  });
  if (subjects.length === 0) {
    addSubjectInputField();
  }

  // Load Users Table
  loadUsersTable();
}

async function changeUserPassword() {
  const oldPwd = document.getElementById("change-pwd-old").value;
  const newPwd = document.getElementById("change-pwd-new").value;
  const confirmPwd = document.getElementById("change-pwd-confirm").value;

  if (!oldPwd || !newPwd || !confirmPwd) {
    alert("Harap isi semua kolom password!");
    return;
  }

  const session = getSession();
  if (!session) {
    alert("Sesi tidak valid. Silakan login kembali.");
    return;
  }

  try {
    const users = await getRegisteredUsers();
    const userObj = users.find(u => u.email.toLowerCase() === session.email.toLowerCase());
    
    if (!userObj) {
      alert("Akun tidak ditemukan!");
      return;
    }

    if (userObj.password !== oldPwd) {
      alert("Password lama yang Anda masukkan salah!");
      return;
    }

    if (newPwd !== confirmPwd) {
      alert("Konfirmasi password baru tidak cocok!");
      return;
    }

    if (newPwd.length < 4) {
      alert("Password baru minimal harus 4 karakter!");
      return;
    }

    // Update in Supabase
    if (isCloudMode && supabase) {
      const { error } = await supabase.from("saku_guru_users").update({ password: newPwd }).eq("email", session.email.toLowerCase());
      if (error) {
        throw error;
      }
    }

    // Update in local users cache
    userObj.password = newPwd;
    await saveRegisteredUsers(users);

    // Clear inputs
    document.getElementById("change-pwd-old").value = "";
    document.getElementById("change-pwd-new").value = "";
    document.getElementById("change-pwd-confirm").value = "";

    showToast("Password berhasil diperbarui!");
    
    if (session.role === "admin") {
      await loadUsersTable();
    }
  } catch(e) {
    console.error("Gagal mengubah password:", e);
    alert("Terjadi kesalahan saat memperbarui password. Silakan coba lagi.");
  }
}

// Load Users Table
async function loadUsersTable() {
  const tbody = document.getElementById("users-table-body");
  if (!tbody) return;

  const users = await getRegisteredUsers();
  const session = getSession();
  const isAdmin = session && session.role === "admin";
  const currentEmail = session ? session.email.toLowerCase() : "";
  const isPrimaryAdmin = currentEmail === "admin@smansaku.id";

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${isAdmin ? 5 : 4}" style="text-align: center; color: var(--text-muted);">Belum ada data akun terdaftar.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map((u, idx) => {
    const targetEmail = u.email.toLowerCase();
    const isSelf = targetEmail === currentEmail;
    const isTargetPrimary = targetEmail === "admin@smansaku.id";
    const isTargetAdmin = u.role === "admin";

    let roleBadge = "badge-izin";
    let roleText = "Guru";
    let primaryBadge = "";

    if (isTargetPrimary) {
      roleBadge = "badge-hadir";
      roleText = "Super Admin";
      primaryBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 0.72rem; margin-left: 6px;"><i class="fas fa-crown"></i> Akun Utama</span>`;
    } else if (isTargetAdmin) {
      roleBadge = "badge-hadir";
      roleText = "Admin";
    }
    
    let actionsHtml = "";
    if (isAdmin) {
      // Edit button logic
      let editBtnHtml = "";
      if (isTargetPrimary && !isPrimaryAdmin) {
        editBtnHtml = `<button class="btn btn-secondary btn-sm" disabled style="opacity: 0.4; cursor: not-allowed;" title="Hanya Akun Utama yang dapat mengedit data admin@smansaku.id"><i class="fas fa-lock"></i> Terkunci</button>`;
      } else if (isTargetAdmin && !isTargetPrimary && !isPrimaryAdmin && !isSelf) {
        editBtnHtml = `<button class="btn btn-secondary btn-sm" disabled style="opacity: 0.4; cursor: not-allowed;" title="Hanya Akun Utama yang dapat mengedit sesama Administrator"><i class="fas fa-lock"></i> Terkunci</button>`;
      } else {
        editBtnHtml = `<button class="btn btn-secondary btn-sm" onclick="showEditUserModal('${u.email}')"><i class="fas fa-edit"></i> Edit</button>`;
      }

      // Delete button logic
      let deleteBtnHtml = "";
      if (isTargetPrimary) {
        // Akun Utama tidak pernah bisa dihapus oleh siapapun
        deleteBtnHtml = `<button class="btn btn-danger btn-sm" disabled style="opacity: 0.4; cursor: not-allowed;" title="Akun Utama (admin@smansaku.id) tidak dapat dihapus"><i class="fas fa-ban"></i> Terkunci</button>`;
      } else if (isSelf) {
        // Tidak dapat menghapus akun sendiri yang sedang aktif
        deleteBtnHtml = `<button class="btn btn-danger btn-sm" disabled style="opacity: 0.4; cursor: not-allowed;" title="Tidak dapat menghapus akun sendiri yang sedang aktif"><i class="fas fa-trash"></i> Hapus</button>`;
      } else if (isTargetAdmin) {
        // Akun admin lainnya HANYA bisa dihapus oleh akun admin@smansaku.id
        if (isPrimaryAdmin) {
          deleteBtnHtml = `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.email}')" title="Hapus akun Administrator"><i class="fas fa-trash"></i> Hapus</button>`;
        } else {
          deleteBtnHtml = `<button class="btn btn-danger btn-sm" disabled style="opacity: 0.4; cursor: not-allowed;" title="Hanya Akun Utama (admin@smansaku.id) yang dapat menghapus akun Administrator"><i class="fas fa-lock"></i> Terkunci</button>`;
        }
      } else {
        // Akun guru biasa: dapat dihapus oleh admin mana pun
        deleteBtnHtml = `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.email}')" title="Hapus akun guru"><i class="fas fa-trash"></i> Hapus</button>`;
      }

      actionsHtml = `
        <td class="actions-cell">
          ${editBtnHtml}
          ${deleteBtnHtml}
        </td>
      `;
    }

    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${u.nama}</strong>${primaryBadge}</td>
        <td><code>${u.email}</code><br><span style="font-size:0.75rem; color:var(--text-muted);">Password: ${u.password}</span></td>
        <td><span class="badge ${roleBadge}">${roleText}</span></td>
        ${actionsHtml}
      </tr>
    `;
  }).join("");
}

// Show Add User Modal
function showAddUserModal() {
  const session = getSession();
  const currentEmail = session ? session.email.toLowerCase() : "";
  const isPrimaryAdmin = currentEmail === "admin@smansaku.id";

  const formHtml = `
    <div class="form-group">
      <label class="form-label" for="user-email">Email</label>
      <input type="email" id="user-email" class="form-control" placeholder="Contoh: guru.baru@smansaku.id" required>
    </div>
    <div class="form-group">
      <label class="form-label" for="user-nama">Nama Lengkap</label>
      <input type="text" id="user-nama" class="form-control" placeholder="Nama Lengkap Guru" required>
    </div>
    <div class="form-group">
      <label class="form-label" for="user-password">Password</label>
      <input type="text" id="user-password" class="form-control" placeholder="Password untuk masuk" required>
    </div>
    <div class="form-group">
      <label class="form-label" for="user-role">Peran (Role)</label>
      <select id="user-role" class="form-control" required>
        <option value="guru" selected>Guru</option>
        ${isPrimaryAdmin ? '<option value="admin">Administrator</option>' : ''}
      </select>
      ${!isPrimaryAdmin ? '<small style="color:var(--text-muted); font-size:0.75rem; display:block; margin-top:4px;"><i class="fas fa-info-circle"></i> Hanya Akun Utama (admin@smansaku.id) yang dapat membuat akun Administrator baru.</small>' : ''}
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="submitAddUser()">Simpan</button>
  `;

  openModal("Tambah Akun Guru Baru", formHtml, footerHtml);
}

// Submit Add User
async function submitAddUser() {
  const email = document.getElementById("user-email").value.trim().toLowerCase();
  const nama = document.getElementById("user-nama").value.trim();
  const password = document.getElementById("user-password").value.trim();
  const role = document.getElementById("user-role").value;

  const session = getSession();
  const currentEmail = session ? session.email.toLowerCase() : "";
  const isPrimaryAdmin = currentEmail === "admin@smansaku.id";

  if (!email || !nama || !password) {
    alert("Semua field wajib diisi!");
    return;
  }

  // Simple email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    alert("Format email tidak valid!");
    return;
  }

  if (role === "admin" && !isPrimaryAdmin) {
    alert("Hanya Akun Utama (admin@smansaku.id) yang berhak menambahkan akun Administrator baru!");
    return;
  }

  const users = await getRegisteredUsers();
  if (users.some(u => u.email.toLowerCase() === email)) {
    alert("Email ini sudah terdaftar!");
    return;
  }

  // Save to Supabase cloud if available
  if (isCloudMode && supabase) {
    try {
      const { error } = await supabase.from("saku_guru_users").insert({ email, nama, password, role });
      if (error) {
        console.error("Supabase insert user error:", error);
        alert("Gagal menyimpan ke cloud: " + error.message);
        return;
      }
    } catch(e) {
      console.error("Supabase submitAddUser error:", e);
    }
  }

  users.push({ email, nama, password, role });
  await saveRegisteredUsers(users);
  closeModal();
  await loadUsersTable();
  showToast(`Akun ${nama} berhasil ditambahkan!`);
}

// Show Edit User Modal
async function showEditUserModal(email) {
  const users = await getRegisteredUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return;

  const session = getSession();
  const currentEmail = session ? session.email.toLowerCase() : "";
  const isPrimaryAdmin = currentEmail === "admin@smansaku.id";
  const targetEmail = user.email.toLowerCase();
  const isTargetPrimary = targetEmail === "admin@smansaku.id";
  const isSelf = targetEmail === currentEmail;

  // Proteksi: Jika target adalah admin@smansaku.id tapi yang login bukan admin@smansaku.id
  if (isTargetPrimary && !isPrimaryAdmin) {
    alert("Akses ditolak: Akun Utama (admin@smansaku.id) hanya dapat diedit oleh akun admin@smansaku.id!");
    return;
  }

  // Proteksi: Jika target adalah admin lain dan yang login bukan admin@smansaku.id dan bukan akun itu sendiri
  if (user.role === "admin" && !isPrimaryAdmin && !isSelf) {
    alert("Akses ditolak: Hanya Akun Utama yang dapat mengedit data Administrator lain!");
    return;
  }

  const isEmailLocked = isTargetPrimary;
  const isRoleLocked = isTargetPrimary || !isPrimaryAdmin;

  const formHtml = `
    <input type="hidden" id="edit-user-old-email" value="${user.email}">
    <div class="form-group">
      <label class="form-label" for="edit-user-email">Email ${isEmailLocked ? '<span style="color:var(--accent); font-size:0.75rem;">(Terkunci - Akun Utama)</span>' : ''}</label>
      <input type="email" id="edit-user-email" class="form-control" value="${user.email}" ${isEmailLocked ? 'readonly style="background-color:var(--bg-secondary); cursor:not-allowed;"' : ''} required>
    </div>
    <div class="form-group">
      <label class="form-label" for="edit-user-nama">Nama Lengkap</label>
      <input type="text" id="edit-user-nama" class="form-control" value="${user.nama}" required>
    </div>
    <div class="form-group">
      <label class="form-label" for="edit-user-password">Password</label>
      <input type="text" id="edit-user-password" class="form-control" value="${user.password}" required>
    </div>
    <div class="form-group">
      <label class="form-label" for="edit-user-role">Peran (Role) ${isRoleLocked ? '<span style="color:var(--text-muted); font-size:0.75rem;">(Terkunci)</span>' : ''}</label>
      ${isRoleLocked ? `
        <input type="hidden" id="edit-user-role" value="${user.role}">
        <input type="text" class="form-control" value="${user.role === 'admin' ? (isTargetPrimary ? 'Super Admin (Akun Utama)' : 'Administrator') : 'Guru'}" disabled style="background-color:var(--bg-secondary); cursor:not-allowed;">
        ${!isPrimaryAdmin ? '<small style="color:var(--text-muted); font-size:0.75rem; display:block; margin-top:4px;"><i class="fas fa-info-circle"></i> Hanya Akun Utama yang berhak mengubah peran akun.</small>' : ''}
      ` : `
        <select id="edit-user-role" class="form-control" required>
          <option value="guru" ${user.role === 'guru' ? 'selected' : ''}>Guru</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrator</option>
        </select>
      `}
      ${isTargetPrimary ? '<small style="color:var(--text-muted); font-size:0.75rem; display:block; margin-top:4px;"><i class="fas fa-info-circle"></i> Peran Akun Utama selalu Administrator dan tidak dapat diubah.</small>' : ''}
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="submitEditUser()">Simpan Perubahan</button>
  `;

  openModal("Edit Akun Pengguna", formHtml, footerHtml);
}

// Submit Edit User
async function submitEditUser() {
  const oldEmail = document.getElementById("edit-user-old-email").value.toLowerCase();
  let email = document.getElementById("edit-user-email").value.trim().toLowerCase();
  const nama = document.getElementById("edit-user-nama").value.trim();
  const password = document.getElementById("edit-user-password").value.trim();
  let role = document.getElementById("edit-user-role").value;

  const session = getSession();
  const currentEmail = session ? session.email.toLowerCase() : "";
  const isPrimaryAdmin = currentEmail === "admin@smansaku.id";
  const isTargetPrimary = oldEmail === "admin@smansaku.id";

  if (isTargetPrimary && !isPrimaryAdmin) {
    alert("Akses ditolak: Hanya Akun Utama yang dapat memperbarui data admin@smansaku.id!");
    return;
  }

  // Akun utama (admin@smansaku.id) email dan peran tidak pernah boleh diubah
  if (isTargetPrimary) {
    email = "admin@smansaku.id";
    role = "admin";
  }

  // Jika bukan primary admin, tidak boleh mengangkat akun menjadi admin
  if (!isPrimaryAdmin && role === "admin") {
    const usersCheck = await getRegisteredUsers();
    const existing = usersCheck.find(u => u.email.toLowerCase() === oldEmail);
    if (!existing || existing.role !== "admin") {
      alert("Hanya Akun Utama (admin@smansaku.id) yang dapat menetapkan peran Administrator!");
      return;
    }
  }

  if (!email || !nama || !password) {
    alert("Semua field wajib diisi!");
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    alert("Format email tidak valid!");
    return;
  }

  const users = await getRegisteredUsers();
  if (email !== oldEmail && users.some(u => u.email.toLowerCase() === email)) {
    alert("Email ini sudah terdaftar untuk pengguna lain!");
    return;
  }

  const userIdx = users.findIndex(u => u.email.toLowerCase() === oldEmail);
  if (userIdx !== -1) {
    // If email changes, migrate database key in localStorage
    if (email !== oldEmail) {
      const oldKey = "saku_guru_db_" + oldEmail.replace(/[^a-z0-9]/g, "_");
      const newKey = "saku_guru_db_" + email.replace(/[^a-z0-9]/g, "_");
      const oldData = localStorage.getItem(oldKey);
      if (oldData) {
        localStorage.setItem(newKey, oldData);
        localStorage.removeItem(oldKey);
      }
    }

    // Save to Supabase cloud if available
    if (isCloudMode && supabase) {
      try {
        if (email !== oldEmail) {
          // Supabase Safe Migration: Write-Before-Delete
          const { data: dbRow } = await supabase.from("saku_guru_databases").select("data").eq("email", oldEmail).maybeSingle();
          const oldDbData = dbRow ? dbRow.data : null;

          await supabase.from("saku_guru_users").insert({ email, nama, password, role });

          if (oldDbData) {
            await supabase.from("saku_guru_databases").upsert({ email, data: oldDbData, updated_at: new Date().toISOString() }, { onConflict: "email" });
          }

          await supabase.from("saku_guru_users").delete().eq("email", oldEmail);
          if (oldDbData) {
            await supabase.from("saku_guru_databases").delete().eq("email", oldEmail);
          }
        } else {
          await supabase.from("saku_guru_users").update({ nama, password, role }).eq("email", email);
        }
      } catch(e) {
        console.error("Supabase submitEditUser error:", e);
      }
    }

    // If the edited user is the current session user, update the session name/role too
    if (session && session.email.toLowerCase() === oldEmail) {
      session.email = email;
      session.nama = nama;
      session.role = role;
      setSession(session);
      updateHeaderProfile();
    }

    users[userIdx] = { email, nama, password, role };
    await saveRegisteredUsers(users);
    closeModal();
    await loadUsersTable();
    showToast(`Akun ${nama} berhasil diperbarui!`);
  }
}

// Delete User
async function deleteUser(email) {
  const session = getSession();
  const currentEmail = session ? session.email.toLowerCase() : "";
  const isPrimaryAdmin = currentEmail === "admin@smansaku.id";
  const targetEmail = (email || "").toLowerCase().trim();

  // 1. Akun utama (admin@smansaku.id) tidak dapat dihapus oleh siapa pun
  if (targetEmail === "admin@smansaku.id") {
    alert("Akun Administrator Utama (admin@smansaku.id) adalah akun utama yang tidak dapat dihapus!");
    return;
  }

  // 2. Akun sendiri yang sedang aktif tidak dapat dihapus
  if (currentEmail === targetEmail) {
    alert("Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif!");
    return;
  }

  const users = await getRegisteredUsers();
  const targetUser = users.find(u => u.email.toLowerCase() === targetEmail);
  if (!targetUser) {
    alert("Akun tidak ditemukan!");
    return;
  }

  // 3. Akun admin lainnya hanya bisa dihapus oleh akun admin@smansaku.id
  if (targetUser.role === "admin") {
    if (!isPrimaryAdmin) {
      alert("Akses ditolak: Akun Administrator hanya bisa dihapus oleh Akun Utama (admin@smansaku.id)!");
      return;
    }
  }

  if (confirm(`Apakah Anda yakin ingin menghapus akun ${targetUser.nama} (${targetEmail})? Akun ini tidak akan dapat login lagi.`)) {
    // Delete from Supabase cloud if available
    if (isCloudMode && supabase) {
      try {
        // saku_guru_databases has ON DELETE CASCADE, so deleting user also deletes their database row
        await supabase.from("saku_guru_users").delete().eq("email", targetEmail);
      } catch(e) {
        console.error("Supabase deleteUser error:", e);
      }
    }

    let updatedUsers = await getRegisteredUsers();
    updatedUsers = updatedUsers.filter(u => u.email.toLowerCase() !== targetEmail);
    await saveRegisteredUsers(updatedUsers);

    // Delete database key for this user
    const dbKey = "saku_guru_db_" + targetEmail.replace(/[^a-z0-9]/g, "_");
    localStorage.removeItem(dbKey);

    await loadUsersTable();
    showToast(`Akun ${targetEmail} berhasil dihapus.`);
  }
}

function addSubjectInputField(value = "") {
  const container = document.getElementById("subject-inputs-container");
  if (!container) return;
  const div = document.createElement("div");
  div.style.display = "flex";
  div.style.gap = "8px";
  div.className = "subject-input-row";
  div.innerHTML = `
    <input type="text" class="form-control subject-input-item" value="${value}" placeholder="Nama Mata Pelajaran..." required>
    <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()" style="padding: 10px 14px;"><i class="fas fa-trash"></i></button>
  `;
  container.appendChild(div);
}

function submitProfile() {
  const nama = document.getElementById("prof-nama").value.trim();
  const nip = document.getElementById("prof-nip").value.trim();
  const sekolah = document.getElementById("prof-sekolah").value.trim();
  const alamat = document.getElementById("prof-alamat").value.trim();
  const kepalaSekolah = document.getElementById("prof-kepsek").value.trim();
  const kepalaSekolahNip = document.getElementById("prof-kepsek-nip").value.trim();

  if (!nama || !sekolah) {
    alert("Nama Guru dan Sekolah wajib diisi!");
    return;
  }

  // Collect subjects
  const inputItems = document.querySelectorAll(".subject-input-item");
  const subjects = [];
  inputItems.forEach(input => {
    const val = input.value.trim();
    if (val && !subjects.includes(val)) {
      subjects.push(val);
    }
  });

  if (subjects.length === 0) {
    alert("Harap masukkan minimal satu mata pelajaran!");
    return;
  }

  // Get image Base64 data from preview images
  const fotoImg = document.querySelector("#prof-photo-preview img");
  const logoImg = document.querySelector("#school-logo-preview img");
  const foto = fotoImg ? fotoImg.src : null;
  const logo = logoImg ? logoImg.src : null;

  // Update profile and subjects in state
  db.guruProfile = { 
    nama, 
    nip, 
    sekolah, 
    alamat,
    kepalaSekolah,
    kepalaSekolahNip,
    foto,
    logo,
    mapel: subjects.slice(0, 2).join(", ") + (subjects.length > 2 ? "..." : "") 
  };
  db.mapel = subjects;

  saveDatabase();
  showToast("Profil dan sekolah berhasil disimpan!");
}

function handleImageUpload(inputEl, type) {
  const file = inputEl.files[0];
  if (!file) return;

  compressImage(file, type, (dataUrl) => {
    if (type === 'foto') {
      const preview = document.getElementById("prof-photo-preview");
      preview.innerHTML = `<img src="${dataUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else if (type === 'logo') {
      const preview = document.getElementById("school-logo-preview");
      preview.innerHTML = `<img src="${dataUrl}" style="width: 100%; height: 100%; object-fit: contain; padding: 4px;">`;
    }
  });
}

function compressImage(file, type, callback) {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = function(event) {
    const img = new Image();
    img.src = event.target.result;
    img.onload = function() {
      const canvas = document.createElement("canvas");
      const max_size = 180; // Resize to max 180px for space efficiency in localStorage
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > max_size) {
          height *= max_size / width;
          width = max_size;
        }
      } else {
        if (height > max_size) {
          width *= max_size / height;
          height = max_size;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      if (type === 'logo') {
        makeBackgroundTransparent(canvas);
      }

      // 60% quality JPEG is lightweight for foto, PNG for logo to preserve transparency
      const outputFormat = type === 'logo' ? "image/png" : "image/jpeg";
      const dataUrl = canvas.toDataURL(outputFormat, outputFormat === "image/jpeg" ? 0.6 : undefined);
      callback(dataUrl);
    };
  };
}

function makeBackgroundTransparent(canvas) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Helper to get index
    const getIndex = (x, y) => (y * width + x) * 4;
    
    // Helper to check if a pixel is near white/light grey (background)
    const isNearWhite = (x, y) => {
      const idx = getIndex(x, y);
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      // Check if pixel is not already transparent and is light (near white)
      return a > 0 && r > 230 && g > 230 && b > 230;
    };
    
    const visited = new Uint8Array(width * height);
    const queue = [];
    
    // Add all border pixels that are near white to the queue
    for (let x = 0; x < width; x++) {
      if (isNearWhite(x, 0)) {
        const idx = 0 * width + x;
        visited[idx] = 1;
        queue.push([x, 0]);
      }
      if (isNearWhite(x, height - 1)) {
        const idx = (height - 1) * width + x;
        visited[idx] = 1;
        queue.push([x, height - 1]);
      }
    }
    for (let y = 0; y < height; y++) {
      if (isNearWhite(0, y)) {
        const idx = y * width + 0;
        if (!visited[idx]) {
          visited[idx] = 1;
          queue.push([0, y]);
        }
      }
      if (isNearWhite(width - 1, y)) {
        const idx = y * width + (width - 1);
        if (!visited[idx]) {
          visited[idx] = 1;
          queue.push([width - 1, y]);
        }
      }
    }
    
    // Breadth-First Search (BFS) to flood fill transparent background
    let head = 0;
    while (head < queue.length) {
      const [cx, cy] = queue[head++];
      
      const idx = getIndex(cx, cy);
      data[idx + 3] = 0; // Set alpha to 0 (fully transparent)
      
      // Check 4-way neighbors
      const neighbors = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1]
      ];
      
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx;
          if (!visited[nIdx] && isNearWhite(nx, ny)) {
            visited[nIdx] = 1;
            queue.push([nx, ny]);
          }
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  } catch (e) {
    console.error("Error making background transparent:", e);
  }
}

async function triggerSeedData() {
  if (confirm("Apakah Anda ingin memuat data awal? Tindakan ini akan menimpa data Anda saat ini.")) {
    await loadSeedData();
    // Re-render settings page to reflect new values
    renderPage("profil");
  }
}

async function triggerResetDatabase() {
  if (confirm("PENTING: Apakah Anda yakin ingin menghapus semua data? Seluruh data siswa, kelas, jadwal, nilai, dan absensi akan hilang selamanya.")) {
    await resetDatabase();
    renderPage("profil");
  }
}

function exportDatabaseJSON() {
  try {
    const dataStr = JSON.stringify(db, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    const session = getSession();
    const namePrefix = session && session.email ? session.email.split("@")[0] : "guest";
    const dateStr = new Date().toISOString().split("T")[0];
    
    link.href = url;
    link.download = `sman_saku_backup_${namePrefix}_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Database berhasil diekspor!");
  } catch (e) {
    console.error("Export database error:", e);
    alert("Gagal mengekspor database: " + e.message);
  }
}

function importDatabaseJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && typeof parsed === "object") {
        // Self-repair schema validation
        parsed.guruProfile = parsed.guruProfile || { nama: "Nama Guru, S.Pd.", nip: "" };
        parsed.kelas = parsed.kelas || [];
        parsed.siswa = parsed.siswa || [];
        parsed.absensi = parsed.absensi || [];
        parsed.nilai = parsed.nilai || [];
        parsed.jurnal = parsed.jurnal || [];
        parsed.jadwal = parsed.jadwal || [];
        parsed.mapel = parsed.mapel || ["Matematika", "Fisika", "Kimia", "Biologi", "Bahasa Indonesia", "Bahasa Inggris"];
        
        if (confirm("Apakah Anda yakin ingin memulihkan database dari file cadangan ini? Tindakan ini akan menimpa seluruh data Anda saat ini.")) {
          db = parsed;
          delete db.is_demo; // User uploaded database is not demo data
          await saveDatabase();
          showToast("Database berhasil dipulihkan dari file cadangan!");
          renderPage("profil"); // Re-render settings page
        }
      } else {
        alert("Format file JSON cadangan tidak valid!");
      }
    } catch (err) {
      console.error("Import database error:", err);
      alert("Gagal membaca berkas cadangan: Format JSON tidak valid.");
    }
    // Clear input value so same file can be selected again
    event.target.value = "";
  };
  reader.readAsText(file);
}

// ============================================================================
// SISTEM MULTI-MODE: GURU MAPEL, WALI KELAS, & GURU WALI (MENTOR ASUHAN)
// ============================================================================

let currentAppMode = localStorage.getItem("sman_saku_mode") || "mapel";

function getAppMode() {
  return currentAppMode;
}

function initAppMode() {
  const savedMode = localStorage.getItem("sman_saku_mode");
  if (savedMode && ["mapel", "walikelas", "guruwali"].includes(savedMode)) {
    currentAppMode = savedMode;
  } else {
    currentAppMode = "mapel";
  }

  // Self-repair DB structures for Wali Kelas & Guru Wali
  if (typeof db !== "undefined" && db) {
    db.catatanWali = db.catatanWali || [];
    db.siswaAsuhan = db.siswaAsuhan || [];
    db.jurnalBimbingan = db.jurnalBimbingan || [];
    db.academicFollowUp = db.academicFollowUp || {};

    if (db.siswaAsuhan.length === 0 && (db.siswa && db.siswa.length > 0)) {
      const candidates = ["s-3", "s-5", "s-8"].filter(id => db.siswa.some(s => s.id === id));
      db.siswaAsuhan = candidates.length > 0 ? candidates : db.siswa.slice(0, 3).map(s => s.id);
    }
  }

  updateModeSwitcherUI(currentAppMode);
  renderSidebarMenu();

  // Close dropdown on outside click
  document.addEventListener("click", function(e) {
    const container = document.getElementById("mode-switcher-container");
    if (container && !container.contains(e.target)) {
      closeModeDropdown();
    }
  });
}

function toggleModeDropdown(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById("mode-dropdown-menu");
  const container = document.getElementById("mode-switcher-container");
  if (!dropdown) return;
  const isHidden = dropdown.style.display === "none" || !dropdown.style.display;
  if (isHidden) {
    dropdown.style.display = "block";
    if (container) container.classList.add("open");
  } else {
    closeModeDropdown();
  }
}

function closeModeDropdown() {
  const dropdown = document.getElementById("mode-dropdown-menu");
  const container = document.getElementById("mode-switcher-container");
  if (dropdown) dropdown.style.display = "none";
  if (container) container.classList.remove("open");
}

function setAppMode(mode) {
  if (!["mapel", "walikelas", "guruwali"].includes(mode)) return;
  currentAppMode = mode;
  localStorage.setItem("sman_saku_mode", mode);
  closeModeDropdown();
  updateModeSwitcherUI(mode);
  renderSidebarMenu();

  let toastMsg = "Beralih ke Mode Guru Mapel";
  if (mode === "walikelas") toastMsg = "Beralih ke Mode Wali Kelas";
  if (mode === "guruwali") toastMsg = "Beralih ke Mode Guru Wali";
  showToast(toastMsg);

  navigate("dashboard");
}

function updateModeSwitcherUI(mode) {
  const btn = document.getElementById("btn-switch-mode");
  const icon = document.getElementById("mode-icon");
  const title = document.getElementById("mode-active-title");

  if (btn) {
    btn.className = `btn-mode-switcher mode-${mode}`;
  }

  if (icon) {
    if (mode === "walikelas") {
      icon.className = "fas fa-user-tie";
    } else if (mode === "guruwali") {
      icon.className = "fas fa-hand-holding-heart";
    } else {
      icon.className = "fas fa-chalkboard-user";
    }
  }

  if (title) {
    if (mode === "walikelas") {
      title.textContent = "Wali Kelas";
    } else if (mode === "guruwali") {
      title.textContent = "Guru Wali";
    } else {
      title.textContent = "Guru Mapel";
    }
  }

  document.querySelectorAll(".mode-dropdown-item").forEach(item => {
    const itemMode = item.getAttribute("data-mode");
    if (itemMode === mode) {
      item.classList.add("active");
      const badge = item.querySelector(".item-badge");
      if (badge) badge.textContent = "Aktif";
    } else {
      item.classList.remove("active");
      const badge = item.querySelector(".item-badge");
      if (badge) {
        if (itemMode === "mapel") badge.textContent = "Mapel";
        if (itemMode === "walikelas") badge.textContent = "Kelas Binaan";
        if (itemMode === "guruwali") badge.textContent = "Mentor Asuhan";
      }
    }
  });
}

function renderSidebarMenu() {
  const menuList = document.getElementById("sidebar-menu-list");
  if (!menuList) return;

  const currentHash = window.location.hash.substring(1) || "dashboard";

  let items = [];
  if (currentAppMode === "walikelas") {
    items = [
      { page: "dashboard", icon: "fas fa-chart-pie", label: "Dashboard" },
      { page: "rekap_final", icon: "fas fa-clipboard-check", label: "Rekap Final" },
      { page: "siswa_kelas", icon: "fas fa-users-rectangle", label: "Siswa Kelas" },
      { page: "ledger_nilai", icon: "fas fa-table-list", label: "Ledger Nilai" },
      { page: "catatan_wali", icon: "fas fa-book-bookmark", label: "Buku Kasus" },
      { page: "kontak", icon: "fas fa-address-book", label: "Kontak Wali" },
      { page: "profil", icon: "fas fa-user-cog", label: "Profil" }
    ];
  } else if (currentAppMode === "guruwali") {
    items = [
      { page: "dashboard", icon: "fas fa-chart-pie", label: "Dashboard" },
      { page: "siswa_asuhan", icon: "fas fa-users", label: "Siswa Asuhan" },
      { page: "tambah_siswa_asuhan", icon: "fas fa-user-plus", label: "+ Asuhan" },
      { page: "jurnal_bimbingan", icon: "fas fa-hand-holding-heart", label: "Bimbingan" },
      { page: "pantauan_absensi", icon: "fas fa-clipboard-user", label: "Presensi" },
      { page: "kontak", icon: "fas fa-address-book", label: "Kontak Wali" },
      { page: "profil", icon: "fas fa-user-cog", label: "Profil" }
    ];
  } else {
    items = [
      { page: "dashboard", icon: "fas fa-chart-pie", label: "Dashboard" },
      { page: "kelas", icon: "fas fa-school", label: "Data Kelas" },
      { page: "siswa", icon: "fas fa-user-graduate", label: "Data Siswa" },
      { page: "kontak", icon: "fas fa-address-book", label: "Kontak Wali" },
      { page: "jadwal", icon: "fas fa-calendar-alt", label: "Jadwal" },
      { page: "absensi", icon: "fas fa-clipboard-user", label: "Absensi" },
      { page: "nilai", icon: "fas fa-award", label: "Nilai Siswa" },
      { page: "jurnal", icon: "fas fa-book-open", label: "Jurnal" },
      { page: "rekap", icon: "fas fa-print", label: "Rekap" },
      { page: "profil", icon: "fas fa-user-cog", label: "Profil" }
    ];
  }

  menuList.innerHTML = items.map(item => `
    <li data-page="${item.page}" class="${item.page === currentHash ? 'active' : ''}">
      <a href="#${item.page}" onclick="navigate('${item.page}')">
        <i class="${item.icon}"></i>
        <span>${item.label}</span>
      </a>
    </li>
  `).join("");
}

function formatDateIndoFull(dateStr) {
  if (!dateStr) return "-";
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return dateStr;
  const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
  const hariArr = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const bulanArr = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const hari = hariArr[dateObj.getDay()] || "";
  const bulan = bulanArr[parts[1] - 1] || "";
  return `${hari}, ${parts[2]} ${bulan} ${parts[0]}`;
}

// ============================================================================
// MODE WALI KELAS IMPLEMENTATION
// ============================================================================

let currentWaliKelasClassId = localStorage.getItem("sman_saku_walikelas_kelasId") || "";
let currentWaliKelasDate = getLocalDateString();
let currentWaliKelasMonth = new Date().getMonth();
let currentWaliKelasYear = new Date().getFullYear();

function getWaliKelasClassId() {
  if (!db.kelas || db.kelas.length === 0) return "";
  if (currentWaliKelasClassId && db.kelas.some(k => k.id === currentWaliKelasClassId)) {
    return currentWaliKelasClassId;
  }
  const teacherName = (db.guruProfile && db.guruProfile.nama) ? db.guruProfile.nama.trim().toLowerCase() : "";
  if (teacherName) {
    const match = db.kelas.find(k => k.waliKelas && k.waliKelas.trim().toLowerCase().includes(teacherName));
    if (match) {
      currentWaliKelasClassId = match.id;
      localStorage.setItem("sman_saku_walikelas_kelasId", match.id);
      return match.id;
    }
  }
  currentWaliKelasClassId = db.kelas[0].id;
  localStorage.setItem("sman_saku_walikelas_kelasId", currentWaliKelasClassId);
  return currentWaliKelasClassId;
}

function setWaliKelasClassId(classId) {
  currentWaliKelasClassId = classId;
  localStorage.setItem("sman_saku_walikelas_kelasId", classId);
  const activePage = window.location.hash.substring(1) || "dashboard";
  renderPage(activePage);
}

function changeWaliKelasDate(dateVal) {
  if (!dateVal) return;
  currentWaliKelasDate = dateVal;
  window.activeDashboardInterventionDate = dateVal;
  const activePage = window.location.hash.substring(1) || "dashboard";
  renderPage(activePage);
}

function renderDashboardWaliKelas(container) {
  const classId = getWaliKelasClassId();
  const kelas = db.kelas.find(k => k.id === classId) || { nama: "Kelas Tidak Ditemukan", tingkat: "-" };
  const students = db.siswa.filter(s => s.kelasId === classId);
  
  // Ambil absensi kelas ini pada tanggal terpilih
  const absensiToday = (db.absensi || []).filter(a => a.kelasId === classId && a.tanggal === currentWaliKelasDate);
  const mapelsRecorded = [...new Set(absensiToday.map(a => a.mapel))];

  // Hitung status final harian per siswa
  const studentFinalStatusMap = {};
  const studentMapelDetailMap = {};

  students.forEach(s => {
    const records = absensiToday.filter(a => a.siswaId === s.id);
    studentMapelDetailMap[s.id] = records;
    if (records.length === 0) {
      studentFinalStatusMap[s.id] = "Belum Diabsen";
    } else {
      const statuses = records.map(r => r.status);
      if (statuses.includes("Bolos")) studentFinalStatusMap[s.id] = "Bolos";
      else if (statuses.includes("Alpa")) studentFinalStatusMap[s.id] = "Alpa";
      else if (statuses.includes("Sakit")) studentFinalStatusMap[s.id] = "Sakit";
      else if (statuses.includes("Izin")) studentFinalStatusMap[s.id] = "Izin";
      else if (statuses.includes("Terlambat")) studentFinalStatusMap[s.id] = "Terlambat";
      else if (statuses.every(st => st === "Hadir")) studentFinalStatusMap[s.id] = "Hadir";
      else studentFinalStatusMap[s.id] = records[0].status;
    }
  });

  const totalSiswa = students.length;
  let hadirCount = 0;
  let sakitCount = 0;
  let izinCount = 0;
  let alpaCount = 0;
  let terlambatCount = 0;
  let bolosCount = 0;

  students.forEach(s => {
    const st = studentFinalStatusMap[s.id];
    if (st === "Hadir") hadirCount++;
    else if (st === "Sakit") sakitCount++;
    else if (st === "Izin") izinCount++;
    else if (st === "Alpa") alpaCount++;
    else if (st === "Terlambat") terlambatCount++;
    else if (st === "Bolos") bolosCount++;
  });

  const persenKehadiran = totalSiswa > 0 ? Math.round(((hadirCount + terlambatCount) / totalSiswa) * 100) : 0;

  const kelasOptions = db.kelas.map(k => `
    <option value="${k.id}" ${k.id === classId ? 'selected' : ''}>
      ${k.tingkat ? k.tingkat + ' - ' : ''}${k.nama} ${k.waliKelas ? '(' + k.waliKelas + ')' : ''}
    </option>
  `).join("");

  container.innerHTML = `
    <!-- Control Bar Wali Kelas -->
    <div class="card" style="margin-bottom: 16px; border-top: 4px solid #10b981;">
      <div style="display: flex; justify-content: space-between; align-items: stretch; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: 1 1 280px;">
          <div style="flex: 1 1 140px; min-width: 130px;">
            <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px; text-transform: uppercase;">
              <i class="fas fa-school"></i> Kelas Binaan Anda:
            </label>
            <select class="form-control" style="font-weight: 600; width: 100%; min-width: 130px;" onchange="setWaliKelasClassId(this.value)">
              ${kelasOptions}
            </select>
          </div>
          <div style="flex: 1 1 130px; min-width: 130px;">
            <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px; text-transform: uppercase;">
              <i class="fas fa-calendar-day"></i> Tanggal Presensi:
            </label>
            <input type="date" id="walikelas-date-input" class="form-control" style="width: 100%; min-width: 130px;" value="${currentWaliKelasDate}" onchange="changeWaliKelasDate(this.value)">
          </div>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; flex: 1 1 auto;">
          <button type="button" class="btn btn-success" onclick="shareWaliKelasDailyRecapWA('${classId}', '${currentWaliKelasDate}')" style="box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3); width: 100%; justify-content: center;">
            <i class="fab fa-whatsapp" style="font-size: 1.05rem;"></i> Bagikan Rekap ke Grup WA Wali Murid
          </button>
        </div>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid" style="margin-bottom: 24px;">
      <div class="stat-card">
        <div class="stat-info">
          <h3>Total Siswa</h3>
          <div class="stat-value">${totalSiswa}</div>
        </div>
        <div class="stat-icon" style="color: #2563eb; background: rgba(37,99,235,0.1);"><i class="fas fa-users"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h3>Hadir Penuh</h3>
          <div class="stat-value" style="color: #10b981;">${hadirCount}</div>
        </div>
        <div class="stat-icon" style="color: #10b981; background: rgba(16,185,129,0.1);"><i class="fas fa-check-circle"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h3>Sakit & Izin</h3>
          <div class="stat-value" style="color: #8b5cf6;">${sakitCount + izinCount}</div>
        </div>
        <div class="stat-icon" style="color: #8b5cf6; background: rgba(139,92,246,0.1);"><i class="fas fa-notes-medical"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h3>Alpa & Bolos</h3>
          <div class="stat-value" style="color: #ef4444;">${alpaCount + bolosCount}</div>
        </div>
        <div class="stat-icon" style="color: #ef4444; background: rgba(239,68,68,0.1);"><i class="fas fa-triangle-exclamation"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h3>% Kehadiran Kelas</h3>
          <div class="stat-value">${persenKehadiran}%</div>
        </div>
        <div class="stat-icon" style="color: #f59e0b; background: rgba(245,158,11,0.1);"><i class="fas fa-chart-line"></i></div>
      </div>
    </div>

    <!-- PUSAT TINDAK LANJUT KEHADIRAN SISWA KELAS BINAAN (SUMBER: LAPORAN GURU MAPEL) -->
    <div id="dashboard-tindak-lanjut-section" class="tl-container" style="margin-bottom: 24px;"></div>

    <!-- PUSAT LAPORAN PENILAIAN & TUGAS SISWA (DI BAWAH KKM & BELUM SETOR) -->
    <div id="dashboard-akademik-section" class="tl-container" style="margin-bottom: 24px;"></div>

    <!-- TABEL REKAP PRESENSI FINAL SISWA HARI INI -->
    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <h3 style="margin: 0; font-size: 1.05rem;"><i class="fas fa-clipboard-list"></i> Rekapan Final Presensi Siswa Kelas ${kelas.nama}</h3>
          <p style="margin: 4px 0 0; font-size: 0.8rem; color: var(--text-muted);">
            Status kehadiran akhir siswa hari ini gabungan dari seluruh guru mata pelajaran yang mengajar (${mapelsRecorded.length > 0 ? mapelsRecorded.join(", ") : "Belum ada mapel"}).
          </p>
        </div>
      </div>

      <div class="table-responsive" style="margin-top: 14px;">
        <table class="table" style="width: 100%;">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">No</th>
              <th>NISN</th>
              <th>Nama Siswa</th>
              <th>Rincian Presensi Mapel</th>
              <th style="text-align: center;">Status Final</th>
              <th>Kontak Orang Tua / Wali</th>
              <th style="text-align: center; width: 120px;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${students.length === 0 ? `
              <tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">Belum ada data siswa di kelas ini.</td></tr>
            ` : students.map((s, idx) => {
              const records = studentMapelDetailMap[s.id] || [];
              const finalStatus = studentFinalStatusMap[s.id];
              const contact = getStudentParentContact(s);
              
              let statusBadge = `<span class="badge" style="background: var(--bg-app); color: var(--text-muted);">Belum Diabsen</span>`;
              if (finalStatus !== "Belum Diabsen") {
                statusBadge = `<span class="badge badge-${finalStatus.toLowerCase()}">${finalStatus}</span>`;
              }

              let mapelDetailHtml = "-";
              if (records.length > 0) {
                mapelDetailHtml = records.map(r => `
                  <span style="display: inline-block; font-size: 0.76rem; background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 6px; padding: 2px 7px; margin: 2px;">
                    ${r.mapel}: <strong>${r.status}</strong>
                  </span>
                `).join(" ");
              }

              return `
                <tr>
                  <td style="text-align: center;">${idx + 1}</td>
                  <td><code>${s.nisn || '-'}</code></td>
                  <td style="font-weight: 600;">${s.nama}</td>
                  <td>${mapelDetailHtml}</td>
                  <td style="text-align: center;">${statusBadge}</td>
                  <td>
                    <div style="font-size: 0.82rem; font-weight: 600;">${contact.namaWali}</div>
                    <div style="font-size: 0.76rem; color: var(--text-muted);">${contact.noHp || '<span style="color:var(--text-muted); font-style:italic;">Belum ada kontak</span>'}</div>
                  </td>
                  <td style="text-align: center;">
                    <div style="display: flex; justify-content: center; gap: 6px;">
                      ${contact.hasPhone ? `
                        <button type="button" class="btn btn-sm" style="background:#25D366; color:#fff; padding: 5px 8px; border-radius: 6px;" onclick="sendWaliKelasStudentWA('${s.id}', '${finalStatus}', 'Presensi Harian', '${currentWaliKelasDate}')" title="Kirim WA ke Orang Tua">
                          <i class="fab fa-whatsapp"></i>
                        </button>
                        <a href="tel:${contact.cleanPhone}" class="btn btn-secondary btn-sm" style="padding: 5px 8px; border-radius: 6px;" title="Telepon">
                          <i class="fas fa-phone"></i>
                        </a>
                      ` : `
                        <button type="button" class="btn btn-secondary btn-sm" style="opacity: 0.5;" title="Nomor WA belum tersedia" onclick="alert('Nomor HP orang tua belum diisi untuk siswa ini. Silakan perbarui di menu Kontak Wali.')">
                          <i class="fab fa-whatsapp"></i>
                        </button>
                      `}
                      <button type="button" class="btn btn-secondary btn-sm" style="padding: 5px 8px; border-radius: 6px;" onclick="openCatatanWaliModal(null, '${s.id}')" title="Buku Kasus">
                        <i class="fas fa-book-bookmark"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Render Tindak Lanjut & Laporan Penilaian Section otomatis
  setTimeout(() => {
    renderDashboardIntervention(currentWaliKelasDate);
    renderDashboardAcademicAlerts();
  }, 30);
}


function shareWaliKelasDailyRecapWA(classId, dateStr) {
  const kelas = db.kelas.find(k => k.id === classId) || { nama: "Kelas", tingkat: "-" };
  const students = db.siswa.filter(s => s.kelasId === classId);
  const absensiRecords = (db.absensi || []).filter(a => a.kelasId === classId && a.tanggal === dateStr);
  const teacherName = (db.guruProfile && db.guruProfile.nama) ? db.guruProfile.nama : (kelas.waliKelas || "Wali Kelas");

  const totalSiswa = students.length;
  const sakitList = [];
  const izinList = [];
  const alpaList = [];
  const terlambatList = [];
  const bolosList = [];
  let hadirCount = 0;

  students.forEach(s => {
    const recs = absensiRecords.filter(a => a.siswaId === s.id);
    if (recs.length === 0) return;
    const statuses = recs.map(r => r.status);
    if (statuses.includes("Bolos")) bolosList.push(s.nama);
    else if (statuses.includes("Alpa")) alpaList.push(s.nama);
    else if (statuses.includes("Sakit")) sakitList.push(s.nama);
    else if (statuses.includes("Izin")) izinList.push(s.nama);
    else if (statuses.includes("Terlambat")) terlambatList.push(s.nama);
    else if (statuses.every(st => st === "Hadir")) hadirCount++;
  });

  const persenKehadiran = totalSiswa > 0 ? Math.round(((hadirCount + terlambatList.length) / totalSiswa) * 100) : 0;

  let rincianTidakHadir = "";
  if (sakitList.length > 0) rincianTidakHadir += `\n- *Sakit (${sakitList.length}):* ${sakitList.join(", ")}`;
  if (izinList.length > 0) rincianTidakHadir += `\n- *Izin (${izinList.length}):* ${izinList.join(", ")}`;
  if (alpaList.length > 0) rincianTidakHadir += `\n- *Alpa (${alpaList.length}):* ${alpaList.join(", ")}`;
  if (terlambatList.length > 0) rincianTidakHadir += `\n- *Terlambat (${terlambatList.length}):* ${terlambatList.join(", ")}`;
  if (bolosList.length > 0) rincianTidakHadir += `\n- *Bolos (${bolosList.length}):* ${bolosList.join(", ")}`;

  if (!rincianTidakHadir) {
    rincianTidakHadir = "\n_Alhamdulillah, seluruh siswa hadir lengkap hari ini._";
  }

  const broadcastText = 
`*LAPORAN PRESENSI HARIAN SISWA*
*SMA NEGERI SAKU*
━━━━━━━━━━━━━━━━━━
🏫 *Kelas:* ${kelas.nama}
📅 *Hari/Tanggal:* ${formatDateIndoFull(dateStr)}
👨‍🏫 *Wali Kelas:* ${teacherName}

📊 *Ringkasan Kehadiran:*
• Total Siswa: ${totalSiswa} orang
• Hadir: ${hadirCount} orang (${persenKehadiran}%)
• Sakit: ${sakitList.length} orang
• Izin: ${izinList.length} orang
• Alpa: ${alpaList.length} orang
• Terlambat: ${terlambatList.length} orang
• Bolos: ${bolosList.length} orang

📝 *Rincian Keterangan Siswa:*${rincianTidakHadir}

Demikian laporan presensi harian kelas ini kami sampaikan. Mohon kerja sama Bapak/Ibu Wali Murid untuk senantiasa mendampingi ananda.
Terima kasih atas perhatiannya.
━━━━━━━━━━━━━━━━━━`;

  const modalHtml = `
    <div style="margin-bottom: 14px;">
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">
        Format pesan di bawah ini siap dibagikan ke Grup WhatsApp Wali Murid kelas <strong>${kelas.nama}</strong>:
      </p>
      <textarea id="walikelas-broadcast-textarea" class="form-control" rows="12" style="font-family: monospace; font-size: 0.85rem; line-height: 1.4;">${broadcastText}</textarea>
    </div>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" onclick="closeModal()">Tutup</button>
    <button type="button" class="btn btn-primary" onclick="copyWaliKelasBroadcastText()">
      <i class="fas fa-copy"></i> Salin Teks
    </button>
    <a href="https://wa.me/?text=${encodeURIComponent(broadcastText)}" target="_blank" class="btn btn-success" style="background: #25D366; border-color: #25D366; text-decoration: none;">
      <i class="fab fa-whatsapp"></i> Buka WhatsApp & Bagikan
    </a>
  `;

  openModal("📢 Bagikan Rekap Presensi ke Grup WA", modalHtml, footerHtml, true);
}

function copyWaliKelasBroadcastText() {
  const textarea = document.getElementById("walikelas-broadcast-textarea");
  if (!textarea) return;
  textarea.select();
  navigator.clipboard.writeText(textarea.value).then(() => {
    showToast("Teks rekap berhasil disalin ke clipboard!");
  }).catch(() => {
    document.execCommand("copy");
    showToast("Teks rekap berhasil disalin!");
  });
}

function sendWaliKelasStudentWA(siswaId, status, mapel, dateStr) {
  const student = db.siswa.find(s => s.id === siswaId);
  if (!student) return;
  const kelas = db.kelas.find(k => k.id === student.kelasId) || { nama: "-" };
  const contact = getStudentParentContact(student);
  const teacherName = (db.guruProfile && db.guruProfile.nama) ? db.guruProfile.nama : "Wali Kelas";

  if (!contact.hasPhone) {
    alert(`Nomor WhatsApp orang tua/wali dari ${student.nama} belum tercatat di sistem. Silakan input nomor HP di menu Kontak Wali terlebih dahulu.`);
    return;
  }

  let pesanStatus = `tercatat *${status}* pada jam mata pelajaran *${mapel}*`;
  if (status === "Belum Diabsen" || mapel === "Presensi Harian") {
    pesanStatus = `tercatat status kehadiran *${status}* pada presensi harian`;
  }

  const message = 
`Yth. Bapak/Ibu ${contact.namaWali} (Orang Tua / Wali dari ananda *${student.nama}*, Kelas ${kelas.nama}),

Assalamu'alaikum Warahmatullahi Wabarakatuh / Selamat Siang.

Kami dari pihak sekolah (${teacherName}, Wali Kelas ${kelas.nama} SMA Negeri Saku) ingin menginformasikan bahwa ananda pada hari ini (${formatDateIndoFull(dateStr)}) ${pesanStatus}.

Mohon konfirmasi atau perhatian Bapak/Ibu terkait kondisi ananda hari ini. Kami senantiasa mengharapkan kerja sama yang baik demi kelancaran pendidikan ananda di sekolah.

Atas perhatian dan kerja samanya, kami ucapkan terima kasih.

Hormat kami,
*${teacherName}*
Wali Kelas ${kelas.nama}
SMA Negeri Saku`;

  const waUrl = `https://wa.me/${contact.cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, "_blank");
}

function renderRekapFinalWaliKelas(container) {
  const classId = getWaliKelasClassId();
  const kelas = db.kelas.find(k => k.id === classId) || { nama: "Kelas", tingkat: "-" };
  const students = db.siswa.filter(s => s.kelasId === classId);

  const bulanNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  
  // Format filter bulan YYYY-MM
  const monthStr = String(currentWaliKelasMonth + 1).padStart(2, "0");
  const monthPrefix = `${currentWaliKelasYear}-${monthStr}`;

  // Filter absensi di bulan ini
  const monthAbsensi = (db.absensi || []).filter(a => a.kelasId === classId && a.tanggal && a.tanggal.startsWith(monthPrefix));
  
  // Tanggal-tanggal unik pada bulan ini yang tercatat
  const uniqueDates = [...new Set(monthAbsensi.map(a => a.tanggal))].sort();

  // Hitung matriks per siswa: per tanggal dihitung status dominan/terburuk
  const studentStats = students.map(s => {
    let h = 0, sCount = 0, i = 0, a = 0, t = 0, b = 0;
    
    uniqueDates.forEach(d => {
      const recs = monthAbsensi.filter(rec => rec.siswaId === s.id && rec.tanggal === d);
      if (recs.length === 0) return;
      const statuses = recs.map(r => r.status);
      if (statuses.includes("Bolos")) b++;
      else if (statuses.includes("Alpa")) a++;
      else if (statuses.includes("Sakit")) sCount++;
      else if (statuses.includes("Izin")) i++;
      else if (statuses.includes("Terlambat")) t++;
      else if (statuses.includes("Hadir")) h++;
    });

    const totalHari = h + sCount + i + a + t + b;
    const persen = totalHari > 0 ? Math.round(((h + t) / totalHari) * 100) : 0;

    return {
      student: s,
      hadir: h,
      sakit: sCount,
      izin: i,
      alpa: a,
      terlambat: t,
      bolos: b,
      totalHari,
      persen
    };
  });

  const kelasOptions = db.kelas.map(k => `
    <option value="${k.id}" ${k.id === classId ? 'selected' : ''}>${k.tingkat ? k.tingkat + ' - ' : ''}${k.nama}</option>
  `).join("");

  const bulanOptions = bulanNames.map((name, idx) => `
    <option value="${idx}" ${idx === currentWaliKelasMonth ? 'selected' : ''}>${name}</option>
  `).join("");

  container.innerHTML = `
    <div class="card" style="margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <div>
            <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">PILIH KELAS:</label>
            <select class="form-control" style="font-weight: 600;" onchange="setWaliKelasClassId(this.value)">
              ${kelasOptions}
            </select>
          </div>
          <div>
            <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">BULAN:</label>
            <select class="form-control" style="font-weight: 600;" onchange="currentWaliKelasMonth = parseInt(this.value); renderRekapFinalWaliKelas(document.getElementById('content-area'));">
              ${bulanOptions}
            </select>
          </div>
          <div>
            <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">TAHUN:</label>
            <input type="number" class="form-control" style="width: 100px; font-weight: 600;" value="${currentWaliKelasYear}" onchange="currentWaliKelasYear = parseInt(this.value); renderRekapFinalWaliKelas(document.getElementById('content-area'));">
          </div>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary" onclick="window.print()">
            <i class="fas fa-print"></i> Cetak Rekap Bulanan
          </button>
          <button type="button" class="btn btn-primary" onclick="exportRekapFinalWaliKelasCSV()">
            <i class="fas fa-file-excel"></i> Ekspor CSV / Excel
          </button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <h3 style="margin: 0; font-size: 1.1rem;"><i class="fas fa-calendar-check"></i> Matriks Presensi Final: ${kelas.nama}</h3>
          <p style="margin: 4px 0 0; font-size: 0.8rem; color: var(--text-muted);">
            Periode: ${bulanNames[currentWaliKelasMonth]} ${currentWaliKelasYear} • Total Hari Efektif Tercatat: ${uniqueDates.length} hari
          </p>
        </div>
      </div>

      <div class="table-responsive" style="margin-top: 14px;">
        <table class="table" style="width: 100%;">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">No</th>
              <th>NISN</th>
              <th>Nama Siswa</th>
              <th style="text-align: center; width: 45px;">L/P</th>
              <th style="text-align: center; color: #10b981; width: 45px;" title="Hadir">H</th>
              <th style="text-align: center; color: #8b5cf6; width: 45px;" title="Sakit">S</th>
              <th style="text-align: center; color: #3b82f6; width: 45px;" title="Izin">I</th>
              <th style="text-align: center; color: #ef4444; width: 45px;" title="Alpa">A</th>
              <th style="text-align: center; color: #f59e0b; width: 45px;" title="Terlambat">T</th>
              <th style="text-align: center; color: #b91c1c; width: 45px;" title="Bolos">B</th>
              <th style="text-align: center; width: 80px;">Total Hari</th>
              <th style="text-align: center; width: 90px;">% Hadir</th>
            </tr>
          </thead>
          <tbody>
            ${studentStats.length === 0 ? `
              <tr><td colspan="12" style="text-align: center; padding: 30px; color: var(--text-muted);">Belum ada data siswa di kelas ini.</td></tr>
            ` : studentStats.map((item, idx) => `
              <tr>
                <td style="text-align: center;">${idx + 1}</td>
                <td><code>${item.student.nisn || '-'}</code></td>
                <td style="font-weight: 600;">${item.student.nama}</td>
                <td style="text-align: center;">${item.student.jenisKelamin || '-'}</td>
                <td style="text-align: center; font-weight: 700; color: #10b981;">${item.hadir}</td>
                <td style="text-align: center; font-weight: 600; color: #8b5cf6;">${item.sakit}</td>
                <td style="text-align: center; font-weight: 600; color: #3b82f6;">${item.izin}</td>
                <td style="text-align: center; font-weight: 700; color: ${item.alpa > 0 ? '#ef4444' : 'inherit'};">${item.alpa}</td>
                <td style="text-align: center; font-weight: 600; color: #f59e0b;">${item.terlambat}</td>
                <td style="text-align: center; font-weight: 700; color: ${item.bolos > 0 ? '#b91c1c' : 'inherit'};">${item.bolos}</td>
                <td style="text-align: center; font-weight: 600;">${item.totalHari}</td>
                <td style="text-align: center;">
                  <span class="badge ${item.persen >= 85 ? 'badge-hadir' : item.persen >= 75 ? 'badge-terlambat' : 'badge-alpa'}" style="font-weight: 700;">
                    ${item.persen}%
                  </span>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function exportRekapFinalWaliKelasCSV() {
  const classId = getWaliKelasClassId();
  const kelas = db.kelas.find(k => k.id === classId) || { nama: "Kelas" };
  const students = db.siswa.filter(s => s.kelasId === classId);
  const bulanNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  
  const monthStr = String(currentWaliKelasMonth + 1).padStart(2, "0");
  const monthPrefix = `${currentWaliKelasYear}-${monthStr}`;
  const monthAbsensi = (db.absensi || []).filter(a => a.kelasId === classId && a.tanggal && a.tanggal.startsWith(monthPrefix));
  const uniqueDates = [...new Set(monthAbsensi.map(a => a.tanggal))].sort();

  let csv = `REKAPITULASI PRESENSI KELAS ${kelas.nama}\r\n`;
  csv += `Periode: ${bulanNames[currentWaliKelasMonth]} ${currentWaliKelasYear}\r\n\r\n`;
  csv += "No;NISN;Nama Siswa;L/P;Hadir;Sakit;Izin;Alpa;Terlambat;Bolos;Total Hari;Persentase Kehadiran\r\n";

  students.forEach((s, idx) => {
    let h = 0, sc = 0, i = 0, a = 0, t = 0, b = 0;
    uniqueDates.forEach(d => {
      const recs = monthAbsensi.filter(rec => rec.siswaId === s.id && rec.tanggal === d);
      if (recs.length === 0) return;
      const statuses = recs.map(r => r.status);
      if (statuses.includes("Bolos")) b++;
      else if (statuses.includes("Alpa")) a++;
      else if (statuses.includes("Sakit")) sc++;
      else if (statuses.includes("Izin")) i++;
      else if (statuses.includes("Terlambat")) t++;
      else if (statuses.includes("Hadir")) h++;
    });
    const total = h + sc + i + a + t + b;
    const persen = total > 0 ? Math.round(((h + t) / total) * 100) : 0;
    csv += `${idx + 1};"${s.nisn || ''}";"${s.nama}";"${s.jenisKelamin || ''}";${h};${sc};${i};${a};${t};${b};${total};${persen}%\r\n`;
  });

  downloadCSV(csv, `rekap_final_presensi_${kelas.nama}_${bulanNames[currentWaliKelasMonth]}_${currentWaliKelasYear}.csv`);
}

function renderSiswaKelasWaliKelas(container) {
  const classId = getWaliKelasClassId();
  const kelas = db.kelas.find(k => k.id === classId) || { nama: "Kelas", tingkat: "-" };
  const students = db.siswa.filter(s => s.kelasId === classId);

  const kelasOptions = db.kelas.map(k => `
    <option value="${k.id}" ${k.id === classId ? 'selected' : ''}>${k.tingkat ? k.tingkat + ' - ' : ''}${k.nama}</option>
  `).join("");

  container.innerHTML = `
    <div class="card" style="margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap; flex: 1 1 280px;">
          <div style="flex: 1 1 140px; min-width: 130px;">
            <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">PILIH KELAS BINAAN:</label>
            <select class="form-control" style="font-weight: 600; width: 100%; min-width: 130px;" onchange="setWaliKelasClassId(this.value)">
              ${kelasOptions}
            </select>
          </div>
          <div style="flex: 1 1 140px; min-width: 130px;">
            <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">CARI SISWA:</label>
            <input type="text" id="cari-siswa-kelas-input" class="form-control" placeholder="Ketik nama atau NISN..." oninput="filterSiswaKelasWaliTable()" style="width: 100%; min-width: 130px;">
          </div>
        </div>
        <div>
          <button type="button" class="btn btn-primary" onclick="openCatatanWaliModal()">
            <i class="fas fa-plus"></i> Catat Pembinaan Baru
          </button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <h3 style="margin: 0; font-size: 1.1rem;"><i class="fas fa-users-rectangle"></i> Daftar Siswa Kelas Binaan: ${kelas.nama}</h3>
          <p style="margin: 4px 0 0; font-size: 0.8rem; color: var(--text-muted);">
            Total: ${students.length} Siswa Terdaftar • Kelola kontak orang tua dan histori pembinaan kasus.
          </p>
        </div>
      </div>

      <div class="table-responsive" style="margin-top: 14px;">
        <table class="table" id="table-siswa-kelas-wali" style="width: 100%;">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">No</th>
              <th>NISN</th>
              <th>Nama Siswa</th>
              <th style="text-align: center; width: 45px;">L/P</th>
              <th>Nama Wali / Orang Tua</th>
              <th>No HP / WhatsApp</th>
              <th style="text-align: center;">Kasus / Pembinaan</th>
              <th style="text-align: center; width: 140px;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${students.length === 0 ? `
              <tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">Belum ada data siswa di kelas ini.</td></tr>
            ` : students.map((s, idx) => {
              const contact = getStudentParentContact(s);
              const catatanList = (db.catatanWali || []).filter(cw => cw.siswaId === s.id);

              return `
                <tr class="siswa-kelas-row" data-search="${s.nama.toLowerCase()} ${(s.nisn || '').toLowerCase()}">
                  <td style="text-align: center;">${idx + 1}</td>
                  <td><code>${s.nisn || '-'}</code></td>
                  <td style="font-weight: 600;">${s.nama}</td>
                  <td style="text-align: center;">${s.jenisKelamin || '-'}</td>
                  <td>${contact.namaWali}</td>
                  <td>
                    ${contact.hasPhone ? `
                      <a href="https://wa.me/${contact.cleanPhone}" target="_blank" style="color: #10b981; font-weight: 600; text-decoration: none;">
                        <i class="fab fa-whatsapp"></i> ${contact.noHp}
                      </a>
                    ` : `<span style="color: var(--text-muted); font-style: italic;">Belum diisi</span>`}
                  </td>
                  <td style="text-align: center;">
                    <span class="badge ${catatanList.length > 0 ? 'badge-alpa' : 'badge-hadir'}" style="font-weight: 600;">
                      ${catatanList.length} Catatan
                    </span>
                  </td>
                  <td style="text-align: center;">
                    <div style="display: flex; justify-content: center; gap: 6px;">
                      ${contact.hasPhone ? `
                        <a href="https://wa.me/${contact.cleanPhone}" target="_blank" class="btn btn-sm" style="background:#25D366; color:#fff; padding: 5px 8px; border-radius: 6px;" title="Chat WhatsApp">
                          <i class="fab fa-whatsapp"></i>
                        </a>
                      ` : ''}
                      <button type="button" class="btn btn-secondary btn-sm" style="padding: 5px 8px; border-radius: 6px;" onclick="openCatatanWaliModal(null, '${s.id}')" title="Tambah Kasus/Bimbingan">
                        <i class="fas fa-pen-to-square"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function filterSiswaKelasWaliTable() {
  const query = (document.getElementById("cari-siswa-kelas-input")?.value || "").toLowerCase().trim();
  const rows = document.querySelectorAll("#table-siswa-kelas-wali tbody tr.siswa-kelas-row");
  rows.forEach(row => {
    const text = row.getAttribute("data-search") || "";
    row.style.display = text.includes(query) ? "" : "none";
  });
}

function renderLedgerNilaiWaliKelas(container) {
  const classId = getWaliKelasClassId();
  const kelas = db.kelas.find(k => k.id === classId) || { nama: "Kelas", tingkat: "-" };
  const students = db.siswa.filter(s => s.kelasId === classId);
  const mapelList = db.mapel || ["Matematika", "Fisika", "Kimia", "Biologi", "Bahasa Indonesia", "Bahasa Inggris"];

  // Hitung rata-rata per mapel untuk setiap siswa
  const ledgerData = students.map(s => {
    let totalScore = 0;
    let mapelCount = 0;
    const scores = {};

    mapelList.forEach(m => {
      const studentGrades = (db.nilai || []).filter(n => n.siswaId === s.id && n.mapel === m);
      if (studentGrades.length > 0) {
        const sum = studentGrades.reduce((acc, curr) => acc + (parseFloat(curr.nilai) || 0), 0);
        const avg = Math.round(sum / studentGrades.length);
        scores[m] = avg;
        totalScore += avg;
        mapelCount++;
      } else {
        scores[m] = null;
      }
    });

    const finalAvg = mapelCount > 0 ? Math.round(totalScore / mapelCount) : 0;

    return {
      student: s,
      scores,
      totalScore,
      finalAvg
    };
  });

  // Urutkan berdasarkan rata-rata nilai akhir (Ranking)
  ledgerData.sort((a, b) => b.finalAvg - a.finalAvg);

  const kelasOptions = db.kelas.map(k => `
    <option value="${k.id}" ${k.id === classId ? 'selected' : ''}>${k.tingkat ? k.tingkat + ' - ' : ''}${k.nama}</option>
  `).join("");

  container.innerHTML = `
    <div class="card" style="margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap; flex: 1 1 200px;">
          <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">PILIH KELAS BINAAN:</label>
          <select class="form-control" style="font-weight: 600; width: 100%; min-width: 130px;" onchange="setWaliKelasClassId(this.value)">
            ${kelasOptions}
          </select>
        </div>
        <div style="display: flex; gap: 10px;">
          <button type="button" class="btn btn-secondary" onclick="window.print()">
            <i class="fas fa-print"></i> Cetak Ledger
          </button>
          <button type="button" class="btn btn-primary" onclick="exportLedgerNilaiCSV()">
            <i class="fas fa-file-excel"></i> Ekspor CSV
          </button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <h3 style="margin: 0; font-size: 1.1rem;"><i class="fas fa-table-list"></i> Ledger Nilai Multi-Mapel: Kelas ${kelas.nama}</h3>
          <p style="margin: 4px 0 0; font-size: 0.8rem; color: var(--text-muted);">
            Rekapitulasi perolehan nilai siswa di seluruh mata pelajaran beserta peringkat kelas.
          </p>
        </div>
      </div>

      <div class="table-responsive" style="margin-top: 14px;">
        <table class="table" style="width: 100%;">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">Peringkat</th>
              <th>NISN</th>
              <th>Nama Siswa</th>
              ${mapelList.map(m => `<th style="text-align: center; font-size: 0.78rem;">${m}</th>`).join("")}
              <th style="text-align: center; background: rgba(37,99,235,0.05);">Rata-rata</th>
            </tr>
          </thead>
          <tbody>
            ${ledgerData.length === 0 ? `
              <tr><td colspan="${4 + mapelList.length}" style="text-align: center; padding: 30px; color: var(--text-muted);">Belum ada data nilai untuk kelas ini.</td></tr>
            ` : ledgerData.map((item, idx) => `
              <tr>
                <td style="text-align: center; font-weight: 700;">
                  ${idx === 0 ? '🥇 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : (idx + 1)}
                </td>
                <td><code>${item.student.nisn || '-'}</code></td>
                <td style="font-weight: 600;">${item.student.nama}</td>
                ${mapelList.map(m => {
                  const val = item.scores[m];
                  return `<td style="text-align: center; font-size: 0.85rem;">${val !== null ? val : '<span style="color:var(--text-muted);">-</span>'}</td>`;
                }).join("")}
                <td style="text-align: center; font-weight: 700; color: #2563eb; background: rgba(37,99,235,0.05); font-size: 0.95rem;">
                  ${item.finalAvg}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function exportLedgerNilaiCSV() {
  const classId = getWaliKelasClassId();
  const kelas = db.kelas.find(k => k.id === classId) || { nama: "Kelas" };
  const students = db.siswa.filter(s => s.kelasId === classId);
  const mapelList = db.mapel || ["Matematika", "Fisika", "Kimia", "Biologi", "Bahasa Indonesia", "Bahasa Inggris"];

  const ledgerData = students.map(s => {
    let totalScore = 0;
    let mapelCount = 0;
    const scores = {};
    mapelList.forEach(m => {
      const studentGrades = (db.nilai || []).filter(n => n.siswaId === s.id && n.mapel === m);
      if (studentGrades.length > 0) {
        const sum = studentGrades.reduce((acc, curr) => acc + (parseFloat(curr.nilai) || 0), 0);
        const avg = Math.round(sum / studentGrades.length);
        scores[m] = avg;
        totalScore += avg;
        mapelCount++;
      } else {
        scores[m] = "";
      }
    });
    const finalAvg = mapelCount > 0 ? Math.round(totalScore / mapelCount) : 0;
    return { student: s, scores, finalAvg };
  });

  ledgerData.sort((a, b) => b.finalAvg - a.finalAvg);

  let csv = `LEDGER NILAI SISWA KELAS ${kelas.nama}\r\n\r\n`;
  csv += "Peringkat;NISN;Nama Siswa;" + mapelList.join(";") + ";Rata-rata Akhir\r\n";

  ledgerData.forEach((item, idx) => {
    const mapelValues = mapelList.map(m => item.scores[m]);
    csv += `${idx + 1};"${item.student.nisn || ''}";"${item.student.nama}";${mapelValues.join(";")};${item.finalAvg}\r\n`;
  });

  downloadCSV(csv, `ledger_nilai_${kelas.nama}.csv`);
}

function renderCatatanWaliKelas(container) {
  const classId = getWaliKelasClassId();
  const kelas = db.kelas.find(k => k.id === classId) || { nama: "Kelas", tingkat: "-" };
  const students = db.siswa.filter(s => s.kelasId === classId);
  const studentIds = students.map(s => s.id);

  // Ambil catatan pembinaan untuk siswa di kelas ini
  const catatanList = (db.catatanWali || []).filter(c => studentIds.includes(c.siswaId));
  catatanList.sort((a, b) => new Date(b.tanggal || b.createdAt) - new Date(a.tanggal || a.createdAt));

  const kelasOptions = db.kelas.map(k => `
    <option value="${k.id}" ${k.id === classId ? 'selected' : ''}>${k.tingkat ? k.tingkat + ' - ' : ''}${k.nama}</option>
  `).join("");

  container.innerHTML = `
    <div class="card" style="margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap; flex: 1 1 200px;">
          <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">PILIH KELAS BINAAN:</label>
          <select class="form-control" style="font-weight: 600; width: 100%; min-width: 130px;" onchange="setWaliKelasClassId(this.value)">
            ${kelasOptions}
          </select>
        </div>
        <div>
          <button type="button" class="btn btn-primary" onclick="openCatatanWaliModal()">
            <i class="fas fa-plus"></i> Tambah Catatan Kasus / Pembinaan
          </button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <h3 style="margin: 0; font-size: 1.1rem;"><i class="fas fa-book-bookmark"></i> Buku Kasus & Catatan Pembinaan: ${kelas.nama}</h3>
          <p style="margin: 4px 0 0; font-size: 0.8rem; color: var(--text-muted);">
            Catatan kedisiplinan, tindak lanjut pelanggaran/masalah siswa, dan komunikasi dengan orang tua murid.
          </p>
        </div>
        <span class="badge badge-hadir">${catatanList.length} Total Kasus Dicatat</span>
      </div>

      <div style="margin-top: 14px;">
        ${catatanList.length === 0 ? `
          <div style="text-align: center; padding: 36px 16px; background: var(--bg-app); border-radius: 12px; border: 1px dashed var(--border-color);">
            <i class="fas fa-clipboard-check" style="font-size: 2.2rem; color: var(--text-muted); margin-bottom: 10px; display: block;"></i>
            <h4 style="margin: 0 0 6px;">Belum Ada Catatan Kasus</h4>
            <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">
              Klik tombol <strong>"Tambah Catatan Kasus / Pembinaan"</strong> untuk mencatat kasus kedisiplinan atau pendampingan siswa di kelas ini.
            </p>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${catatanList.map(item => {
              const student = db.siswa.find(s => s.id === item.siswaId) || { nama: "Siswa Tidak Ditemukan", nisn: "-" };
              const contact = getStudentParentContact(student);

              return `
                <div class="card" style="padding: 16px; border: 1px solid var(--border-color); background: var(--bg-card); border-left: 4px solid ${item.status === 'Selesai' ? '#10b981' : '#ef4444'};">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
                    <div>
                      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span style="font-weight: 700; font-size: 1rem; color: var(--text-main);">${student.nama}</span>
                        <span class="badge" style="background: rgba(37,99,235,0.1); color: #2563eb;">${item.kategori}</span>
                        <span class="badge ${item.status === 'Selesai' ? 'badge-hadir' : 'badge-alpa'}">${item.status}</span>
                      </div>
                      <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 3px;">
                        <i class="fas fa-calendar-alt"></i> Tanggal: ${formatDateIndoFull(item.tanggal)} • NISN: ${student.nisn || '-'}
                      </div>
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                      <button type="button" class="btn btn-sm" style="background:#25D366; color:#fff; padding: 4px 8px; border-radius: 6px;" onclick="sendCatatanWaliToParentWA('${item.id}')" title="Kirim Laporan WA ke Orang Tua">
                        <i class="fab fa-whatsapp"></i> Laporkan ke Ortu
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm" style="padding: 4px 8px; border-radius: 6px;" onclick="openCatatanWaliModal('${item.id}')" title="Edit Catatan">
                        <i class="fas fa-edit"></i>
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm" style="padding: 4px 8px; border-radius: 6px; color: #ef4444;" onclick="deleteCatatanWali('${item.id}')" title="Hapus Catatan">
                        <i class="fas fa-trash-alt"></i>
                      </button>
                    </div>
                  </div>

                  <div style="font-size: 0.88rem; margin-bottom: 8px; line-height: 1.5; color: var(--text-main);">
                    <strong>Uraian Kejadian / Kasus:</strong><br>
                    ${item.kasus.replace(/\n/g, '<br>')}
                  </div>

                  <div style="font-size: 0.85rem; padding: 10px 12px; background: var(--bg-app); border-radius: 8px; border: 1px dashed var(--border-color); color: var(--text-main);">
                    <strong>Tindak Lanjut / Solusi Wali Kelas:</strong><br>
                    ${item.tindakLanjut ? item.tindakLanjut.replace(/\n/g, '<br>') : '<span style="color:var(--text-muted); font-style:italic;">Belum ada catatan tindak lanjut</span>'}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `}
      </div>
    </div>
  `;
}

function openCatatanWaliModal(catatanId = null, defaultSiswaId = null) {
  const classId = getWaliKelasClassId();
  const students = db.siswa.filter(s => s.kelasId === classId);
  const existing = catatanId ? (db.catatanWali || []).find(c => c.id === catatanId) : null;

  const activeSiswaId = existing ? existing.siswaId : (defaultSiswaId || (students[0]?.id || ""));
  const tanggal = existing ? existing.tanggal : getLocalDateString();
  const kategori = existing ? existing.kategori : "Kedisiplinan & Tata Tertib";
  const kasus = existing ? existing.kasus : "";
  const tindakLanjut = existing ? existing.tindakLanjut : "";
  const status = existing ? existing.status : "Dalam Proses";

  const siswaOptions = students.map(s => `
    <option value="${s.id}" ${s.id === activeSiswaId ? 'selected' : ''}>${s.nama} (${s.nisn || 'No NISN'})</option>
  `).join("");

  const kategoriList = [
    "Kedisiplinan & Tata Tertib",
    "Masalah Akademik & Belajar",
    "Perilaku & Karakter",
    "Prestasi & Apresiasi",
    "Konseling Pribadi / Keluarga",
    "Keterlambatan / Ketidakhadiran"
  ];

  const modalHtml = `
    <form id="form-catatan-wali" onsubmit="handleSaveCatatanWali(event, '${catatanId || ''}')">
      <div class="form-group" style="margin-bottom: 12px;">
        <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 4px;">Pilih Siswa:</label>
        <select id="modal-cw-siswa" class="form-control" required>
          ${siswaOptions}
        </select>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div>
          <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 4px;">Tanggal Kejadian:</label>
          <input type="date" id="modal-cw-tanggal" class="form-control" value="${tanggal}" required>
        </div>
        <div>
          <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 4px;">Status Penanganan:</label>
          <select id="modal-cw-status" class="form-control">
            <option value="Dalam Proses" ${status === 'Dalam Proses' ? 'selected' : ''}>Dalam Proses</option>
            <option value="Selesai" ${status === 'Selesai' ? 'selected' : ''}>Selesai / Tuntas</option>
          </select>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 4px;">Kategori Kasus / Pembinaan:</label>
        <select id="modal-cw-kategori" class="form-control">
          ${kategoriList.map(k => `<option value="${k}" ${k === kategori ? 'selected' : ''}>${k}</option>`).join("")}
        </select>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 4px;">Uraian Kejadian / Permasalahan Siswa:</label>
        <textarea id="modal-cw-kasus" class="form-control" rows="4" placeholder="Jelaskan secara jelas kronologi masalah atau alasan pembinaan..." required>${kasus}</textarea>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 4px;">Tindak Lanjut / Solusi Wali Kelas:</label>
        <textarea id="modal-cw-tindak-lanjut" class="form-control" rows="3" placeholder="Rencana bimbingan, pemanggilan orang tua, atau kesepakatan komitmen...">${tindakLanjut}</textarea>
      </div>
    </form>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button type="submit" form="form-catatan-wali" class="btn btn-primary">
      <i class="fas fa-save"></i> Simpan Catatan
    </button>
  `;

  openModal(existing ? "Edit Catatan Kasus Siswa" : "Tambah Catatan Kasus & Pembinaan", modalHtml, footerHtml, false);
}

function handleSaveCatatanWali(event, catatanId) {
  if (event) event.preventDefault();

  const siswaId = document.getElementById("modal-cw-siswa")?.value;
  const tanggal = document.getElementById("modal-cw-tanggal")?.value;
  const status = document.getElementById("modal-cw-status")?.value;
  const kategori = document.getElementById("modal-cw-kategori")?.value;
  const kasus = document.getElementById("modal-cw-kasus")?.value?.trim();
  const tindakLanjut = document.getElementById("modal-cw-tindak-lanjut")?.value?.trim();

  if (!siswaId || !kasus) {
    alert("Harap pilih siswa dan isi uraian kejadian.");
    return;
  }

  const student = db.siswa.find(s => s.id === siswaId);
  const kelasId = student ? student.kelasId : getWaliKelasClassId();

  db.catatanWali = db.catatanWali || [];

  if (catatanId) {
    const idx = db.catatanWali.findIndex(c => c.id === catatanId);
    if (idx !== -1) {
      db.catatanWali[idx] = {
        ...db.catatanWali[idx],
        siswaId,
        kelasId,
        tanggal,
        status,
        kategori,
        kasus,
        tindakLanjut,
        updatedAt: new Date().toISOString()
      };
    }
  } else {
    db.catatanWali.push({
      id: "cw-" + Date.now() + Math.random().toString(36).substr(2, 4),
      siswaId,
      kelasId,
      tanggal,
      status,
      kategori,
      kasus,
      tindakLanjut,
      createdAt: new Date().toISOString()
    });
  }

  saveDatabase(true);
  closeModal();
  showToast("Catatan pembinaan berhasil disimpan!");

  const activePage = window.location.hash.substring(1) || "dashboard";
  if (activePage === "catatan_wali" || activePage === "siswa_kelas") {
    renderPage(activePage);
  }
}

function deleteCatatanWali(id) {
  if (!confirm("Apakah Anda yakin ingin menghapus catatan kasus ini?")) return;
  db.catatanWali = (db.catatanWali || []).filter(c => c.id !== id);
  saveDatabase(true);
  showToast("Catatan berhasil dihapus.");
  renderCatatanWaliKelas(document.getElementById("content-area"));
}

function sendCatatanWaliToParentWA(id) {
  const item = (db.catatanWali || []).find(c => c.id === id);
  if (!item) return;

  const student = db.siswa.find(s => s.id === item.siswaId);
  if (!student) return;
  const kelas = db.kelas.find(k => k.id === student.kelasId) || { nama: "-" };
  const contact = getStudentParentContact(student);
  const teacherName = (db.guruProfile && db.guruProfile.nama) ? db.guruProfile.nama : "Wali Kelas";

  if (!contact.hasPhone) {
    alert("Nomor WhatsApp orang tua belum terdaftar di sistem. Silakan input nomor HP di menu Kontak Wali terlebih dahulu.");
    return;
  }

  const message = 
`Yth. Bapak/Ibu ${contact.namaWali} (Orang Tua / Wali dari ananda *${student.nama}*, Kelas ${kelas.nama}),

Assalamu'alaikum Warahmatullahi Wabarakatuh / Selamat Siang.

Kami dari pihak sekolah (${teacherName}, Wali Kelas ${kelas.nama} SMA Negeri Saku) ingin menginformasikan perihal pendampingan ananda:

📌 *Kategori:* ${item.kategori}
📅 *Tanggal:* ${formatDateIndoFull(item.tanggal)}
📝 *Uraian Permasalahan:*
${item.kasus}

💡 *Tindak Lanjut / Bimbingan:*
${item.tindakLanjut || "Telah dilakukan bimbingan dan pembinaan karakter di sekolah."}

Kami mengharapkan kerja sama dan perhatian Bapak/Ibu untuk turut mengarahkan dan memotivasi ananda di rumah demi kebaikan perkembangannya.

Terima kasih atas kerja sama dan perhatiannya.

Hormat kami,
*${teacherName}*
Wali Kelas ${kelas.nama}
SMA Negeri Saku`;

  window.open(`https://wa.me/${contact.cleanPhone}?text=${encodeURIComponent(message)}`, "_blank");
}

// ============================================================================
// MODE GURU WALI (MENTOR / PENDAMPING ASUHAN) IMPLEMENTATION
// ============================================================================

function getSiswaAsuhanList() {
  db.siswaAsuhan = db.siswaAsuhan || [];
  return (db.siswa || []).filter(s => db.siswaAsuhan.includes(s.id));
}

function renderDashboardGuruWali(container) {
  const asuhanList = getSiswaAsuhanList();
  const asuhanIds = asuhanList.map(s => s.id);
  const todayStr = getLocalDateString();

  // Ambil absensi hari ini khusus siswa asuhan lintas kelas
  const todayAbsensiAsuhan = (db.absensi || []).filter(a => asuhanIds.includes(a.siswaId) && a.tanggal === todayStr);

  // Radar masalah siswa asuhan hari ini
  const radarIssuesAsuhan = todayAbsensiAsuhan.filter(a => ["Alpa", "Bolos", "Terlambat", "Sakit", "Izin"].includes(a.status));

  // Siswa asuhan hadir hari ini
  const hadirAsuhanCount = asuhanList.filter(s => {
    const recs = todayAbsensiAsuhan.filter(a => a.siswaId === s.id);
    return recs.length > 0 && recs.every(r => r.status === "Hadir");
  }).length;

  const totalBimbingan = (db.jurnalBimbingan || []).length;
  const recentBimbingan = (db.jurnalBimbingan || []).slice(-5).reverse();

  container.innerHTML = `
    <!-- Welcome Banner Guru Wali -->
    <div class="welcome-banner" style="background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div style="max-width: 650px;">
          <h2><i class="fas fa-hand-holding-heart"></i> Dashboard Guru Wali (Mentor Asuhan)</h2>
          <p style="margin: 6px 0 0; opacity: 0.95;">
            Mendampingi perkembangan karakter, akhlak, disiplin kehadiran, dan motivasi belajar siswa asuhan Anda di SMA Negeri Saku secara personal.
          </p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="openPilihSiswaAsuhanModal()" style="background: rgba(255,255,255,0.22); color: #fff; border: 1px solid rgba(255,255,255,0.45); font-weight: 600; padding: 8px 14px; backdrop-filter: blur(8px);">
          <i class="fas fa-user-plus"></i> Tambah Siswa Asuhan dari Database
        </button>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid" style="margin-bottom: 24px;">
      <div class="stat-card">
        <div class="stat-info">
          <h3>Total Siswa Asuhan</h3>
          <div class="stat-value">${asuhanList.length}</div>
        </div>
        <div class="stat-icon" style="color: #7c3aed; background: rgba(124,58,237,0.1);"><i class="fas fa-user-graduate"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h3>Hadir Hari Ini</h3>
          <div class="stat-value" style="color: #10b981;">${hadirAsuhanCount}</div>
        </div>
        <div class="stat-icon" style="color: #10b981; background: rgba(16,185,129,0.1);"><i class="fas fa-check-double"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h3>Perlu Perhatian</h3>
          <div class="stat-value" style="color: #ef4444;">${radarIssuesAsuhan.length}</div>
        </div>
        <div class="stat-icon" style="color: #ef4444; background: rgba(239,68,68,0.1);"><i class="fas fa-triangle-exclamation"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h3>Total Jurnal Bimbingan</h3>
          <div class="stat-value">${totalBimbingan}</div>
        </div>
        <div class="stat-icon" style="color: #2563eb; background: rgba(37,99,235,0.1);"><i class="fas fa-book-open-reader"></i></div>
      </div>
    </div>

    <!-- PUSAT TINDAK LANJUT KEHADIRAN SISWA ASUHAN (SUMBER: LAPORAN GURU MAPEL LINTAS KELAS) -->
    <div id="dashboard-tindak-lanjut-section" class="tl-container" style="margin-bottom: 24px;"></div>

    <!-- PUSAT LAPORAN PENILAIAN & TUGAS SISWA ASUHAN (DI BAWAH KKM & BELUM SETOR) -->
    <div id="dashboard-akademik-section" class="tl-container" style="margin-bottom: 24px;"></div>

    <!-- Jurnal Bimbingan Terbaru -->
    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <h3 style="margin: 0; font-size: 1.05rem;"><i class="fas fa-book-open-reader"></i> Catatan Bimbingan & Konseling Terkini</h3>
          <p style="margin: 4px 0 0; font-size: 0.8rem; color: var(--text-muted);">Aktivitas pendampingan dan konseling terakhir siswa asuhan.</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" onclick="openJurnalBimbinganModal()">
          <i class="fas fa-plus"></i> Catat Bimbingan Baru
        </button>
      </div>

      <div style="margin-top: 14px;">
        ${recentBimbingan.length === 0 ? `
          <p style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.85rem;">Belum ada catatan bimbingan yang dibuat.</p>
        ` : `
          <div class="table-responsive">
            <table class="table" style="width: 100%;">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Siswa Asuhan</th>
                  <th>Bidang Bimbingan</th>
                  <th>Topik / Permasalahan</th>
                  <th style="text-align: center;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${recentBimbingan.map(jb => {
                  const student = db.siswa.find(s => s.id === jb.siswaId) || { nama: "Siswa", kelasId: "" };
                  const kelas = db.kelas.find(k => k.id === student.kelasId) || { nama: "-" };
                  return `
                    <tr>
                      <td style="font-size: 0.82rem;">${formatDateIndo(jb.tanggal)}</td>
                      <td style="font-weight: 600;">${student.nama} <small style="color:var(--text-muted);">(${kelas.nama})</small></td>
                      <td><span class="badge" style="background:rgba(124,58,237,0.1); color:#7c3aed;">${jb.bidang}</span></td>
                      <td style="font-size: 0.85rem;">${jb.pokokBahasan}</td>
                      <td style="text-align: center;"><span class="badge ${jb.status === 'Tuntas' ? 'badge-hadir' : 'badge-alpa'}">${jb.status}</span></td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </div>
  `;

  // Render Tindak Lanjut & Laporan Penilaian Section otomatis
  setTimeout(() => {
    renderDashboardIntervention();
    renderDashboardAcademicAlerts();
  }, 30);
}


function renderDaftarSiswaAsuhanGuruWali(container) {
  db.siswaAsuhan = db.siswaAsuhan || [];
  const asuhanList = getSiswaAsuhanList();

  const kelasList = [...new Set(asuhanList.map(s => s.kelasId))];
  const kelasOptions = [
    '<option value="ALL">Semua Kelas</option>',
    ...db.kelas.filter(k => kelasList.includes(k.id)).map(k => `<option value="${k.id}">${k.tingkat ? k.tingkat + ' - ' : ''}${k.nama}</option>`)
  ].join("");

  container.innerHTML = `
    <!-- Top Action Bar -->
    <div class="card" style="margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <div>
            <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">FILTER KELAS:</label>
            <select id="filter-daftar-asuhan-kelas" class="form-control" style="font-weight: 600;" onchange="filterDaftarAsuhanTable()">
              ${kelasOptions}
            </select>
          </div>
          <div>
            <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">CARI SISWA:</label>
            <input type="text" id="filter-daftar-asuhan-search" class="form-control" placeholder="Ketik nama atau NISN..." oninput="filterDaftarAsuhanTable()">
          </div>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button type="button" onclick="openPilihSiswaAsuhanModal()" class="btn btn-primary" style="box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3);">
            <i class="fas fa-user-plus"></i> Tambah Siswa Asuhan dari Database
          </button>
        </div>
      </div>
    </div>

    <!-- Active Mentee List -->
    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <h3 style="margin: 0; font-size: 1.1rem;"><i class="fas fa-users"></i> Daftar Siswa Asuhan Aktif</h3>
          <p style="margin: 4px 0 0; font-size: 0.8rem; color: var(--text-muted);">
            Siswa asuhan yang sedang dalam pendampingan Anda di SMA Negeri Saku.
          </p>
        </div>
        <span class="badge" style="background: rgba(124, 58, 237, 0.12); color: #7c3aed; font-size: 0.88rem; font-weight: 700; padding: 6px 12px;">
          <i class="fas fa-user-graduate"></i> ${asuhanList.length} Siswa Asuhan
        </span>
      </div>

      <div class="table-responsive" style="margin-top: 14px;">
        <table class="table" id="table-daftar-asuhan-aktif" style="width: 100%;">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">No</th>
              <th>Kelas</th>
              <th>NISN</th>
              <th>Nama Siswa</th>
              <th style="text-align: center; width: 45px;">L/P</th>
              <th>Orang Tua / Wali</th>
              <th>Kontak WhatsApp</th>
              <th style="text-align: center;">Jurnal Bimbingan</th>
              <th style="text-align: center; width: 140px;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${asuhanList.length === 0 ? `
              <tr>
                <td colspan="9" style="text-align: center; padding: 40px 16px;">
                  <i class="fas fa-user-plus" style="font-size: 2.4rem; color: var(--text-muted); margin-bottom: 10px; display: block;"></i>
                  <h4 style="margin: 0 0 6px;">Belum Ada Siswa Asuhan</h4>
                  <p style="margin: 0 0 16px; font-size: 0.85rem; color: var(--text-muted);">
                    Anda belum menambahkan siswa asuhan. Pilih siswa langsung dari database sekolah.
                  </p>
                  <button type="button" onclick="openPilihSiswaAsuhanModal()" class="btn btn-primary btn-sm">
                    <i class="fas fa-user-plus"></i> Tambah Siswa Asuhan dari Database Sekarang
                  </button>
                </td>
              </tr>
            ` : asuhanList.map((s, idx) => {
              const kelas = db.kelas.find(k => k.id === s.kelasId) || { nama: "-" };
              const contact = getStudentParentContact(s);
              const bimbinganCount = (db.jurnalBimbingan || []).filter(j => j.siswaId === s.id).length;
              const gender = s.jenisKelamin || s.gender || "-";

              return `
                <tr class="daftar-asuhan-row" data-kelas="${s.kelasId}" data-search="${(s.nama || '').toLowerCase()} ${(s.nisn || '').toLowerCase()}">
                  <td style="text-align: center;">${idx + 1}</td>
                  <td><span class="badge" style="background:var(--bg-app); border:1px solid var(--border-color); font-weight:600;">${kelas.nama}</span></td>
                  <td><code>${s.nisn || '-'}</code></td>
                  <td style="font-weight: 600;">${s.nama}</td>
                  <td style="text-align: center;">${gender}</td>
                  <td>${contact.namaWali}</td>
                  <td>
                    ${contact.hasPhone ? `
                      <a href="https://wa.me/${contact.cleanPhone}" target="_blank" style="color: #10b981; font-weight: 600; text-decoration: none;">
                        <i class="fab fa-whatsapp"></i> ${contact.noHp}
                      </a>
                    ` : `<span style="color: var(--text-muted); font-style: italic;">Belum diisi</span>`}
                  </td>
                  <td style="text-align: center;">
                    <span class="badge" style="background: rgba(124, 58, 237, 0.1); color: #7c3aed; font-weight: 600;">
                      ${bimbinganCount} Catatan
                    </span>
                  </td>
                  <td style="text-align: center;">
                    <div style="display: flex; justify-content: center; gap: 6px;">
                      ${contact.hasPhone ? `
                        <a href="https://wa.me/${contact.cleanPhone}" target="_blank" class="btn btn-sm" style="background:#25D366; color:#fff; padding: 5px 8px; border-radius: 6px;" title="Chat WhatsApp">
                          <i class="fab fa-whatsapp"></i>
                        </a>
                      ` : ''}
                      <button type="button" class="btn btn-secondary btn-sm" style="padding: 5px 8px; border-radius: 6px;" onclick="openJurnalBimbinganModal(null, '${s.id}')" title="Catat Bimbingan">
                        <i class="fas fa-hand-holding-heart"></i>
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm" style="padding: 5px 8px; border-radius: 6px; color: #ef4444;" onclick="hapusSiswaDariAsuhan('${s.id}')" title="Keluarkan dari Asuhan">
                        <i class="fas fa-trash-alt"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function filterDaftarAsuhanTable() {
  const selectedKelas = document.getElementById("filter-daftar-asuhan-kelas")?.value || "ALL";
  const query = (document.getElementById("filter-daftar-asuhan-search")?.value || "").toLowerCase().trim();
  const rows = document.querySelectorAll("#table-daftar-asuhan-aktif tbody tr.daftar-asuhan-row");

  rows.forEach(row => {
    const rowKelas = row.getAttribute("data-kelas");
    const rowSearch = row.getAttribute("data-search") || "";

    const matchKelas = selectedKelas === "ALL" || rowKelas === selectedKelas;
    const matchSearch = rowSearch.includes(query);

    row.style.display = (matchKelas && matchSearch) ? "" : "none";
  });
}

function renderTambahSiswaAsuhanGuruWali(container) {
  db.siswaAsuhan = db.siswaAsuhan || [];
  const totalSiswa = (db.siswa || []).length;
  const sudahAsuhan = db.siswaAsuhan.length;
  const tersedia = Math.max(0, totalSiswa - sudahAsuhan);

  const kelasOptions = [
    '<option value="ALL">Semua Kelas</option>',
    ...db.kelas.map(k => `<option value="${k.id}">${k.tingkat ? k.tingkat + ' - ' : ''}${k.nama}</option>`)
  ].join("");

  container.innerHTML = `
    <!-- Top Filter & Action Bar -->
    <div class="card" style="margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <div>
            <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">FILTER KELAS:</label>
            <select id="filter-tambah-asuhan-kelas" class="form-control" style="font-weight: 600;" onchange="filterTambahAsuhanTable()">
              ${kelasOptions}
            </select>
          </div>
          <div>
            <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">STATUS ASUHAN:</label>
            <select id="filter-tambah-asuhan-status" class="form-control" style="font-weight: 600;" onchange="filterTambahAsuhanTable()">
              <option value="ALL">Semua Siswa</option>
              <option value="AVAILABLE" selected>Hanya yang Dapat Ditambahkan</option>
              <option value="ALREADY">Sudah Menjadi Asuhan</option>
            </select>
          </div>
          <div>
            <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">CARI NAMA / NISN:</label>
            <input type="text" id="filter-tambah-asuhan-search" class="form-control" placeholder="Ketik nama atau NISN..." oninput="filterTambahAsuhanTable()">
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="openPilihSiswaAsuhanModal()">
            <i class="fas fa-window-restore"></i> Buka Modal Dialog
          </button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="toggleSelectAllTambahAsuhan(true)">
            Pilih Semua
          </button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="toggleSelectAllTambahAsuhan(false)">
            Batal Semua
          </button>
          <button type="button" class="btn btn-primary" onclick="tambahkanSiswaTercentang()" style="box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3);">
            <i class="fas fa-user-plus"></i> Tambahkan Siswa Terpilih
          </button>
        </div>
      </div>
    </div>

    <!-- Stats Summary Row -->
    <div class="stats-grid" style="margin-bottom: 20px;">
      <div class="stat-card">
        <div class="stat-info">
          <h3>Total Siswa Sekolah</h3>
          <div class="stat-value">${totalSiswa}</div>
        </div>
        <div class="stat-icon" style="color: #2563eb; background: rgba(37,99,235,0.1);"><i class="fas fa-school"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h3>Sudah Jadi Asuhan</h3>
          <div class="stat-value" style="color: #10b981;">${sudahAsuhan}</div>
        </div>
        <div class="stat-icon" style="color: #10b981; background: rgba(16,185,129,0.1);"><i class="fas fa-user-check"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h3>Dapat Ditambahkan</h3>
          <div class="stat-value" style="color: #7c3aed;">${tersedia}</div>
        </div>
        <div class="stat-icon" style="color: #7c3aed; background: rgba(124,58,237,0.1);"><i class="fas fa-user-plus"></i></div>
      </div>
    </div>

    <!-- Table of Available Students -->
    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <h3 style="margin: 0; font-size: 1.1rem;"><i class="fas fa-list-check"></i> Daftar Nama Siswa yang Dapat Ditambahkan</h3>
          <p style="margin: 4px 0 0; font-size: 0.8rem; color: var(--text-muted);">
            Pilih siswa dari kelas manapun untuk dijadikan anak bimbingan/mentee Anda.
          </p>
        </div>
        <span id="badge-tercentang-info" class="badge" style="background: rgba(124,58,237,0.1); color: #7c3aed; font-size: 0.85rem; padding: 6px 12px; font-weight: 700;">
          0 Siswa Tercentang
        </span>
      </div>

      <div class="table-responsive" style="margin-top: 14px;">
        <table class="table" id="table-tambah-siswa-asuhan" style="width: 100%;">
          <thead>
            <tr>
              <th style="width: 45px; text-align: center;">Pilih</th>
              <th style="width: 40px; text-align: center;">No</th>
              <th>Kelas</th>
              <th>NISN</th>
              <th>Nama Siswa</th>
              <th style="text-align: center; width: 45px;">L/P</th>
              <th>Kontak Orang Tua</th>
              <th style="text-align: center;">Status Asuhan</th>
              <th style="text-align: center; width: 140px;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${(db.siswa || []).length === 0 ? `
              <tr><td colspan="9" style="text-align: center; padding: 30px; color: var(--text-muted);">Belum ada data siswa di database.</td></tr>
            ` : db.siswa.map((s, idx) => {
              const kelas = db.kelas.find(k => k.id === s.kelasId) || { nama: "-" };
              const contact = getStudentParentContact(s);
              const isAsuhan = (db.siswaAsuhan || []).includes(s.id);
              const gender = s.jenisKelamin || s.gender || "-";

              return `
                <tr class="tambah-asuhan-row" data-kelas="${s.kelasId}" data-status="${isAsuhan ? 'ALREADY' : 'AVAILABLE'}" data-search="${(s.nama || '').toLowerCase()} ${(s.nisn || '').toLowerCase()}">
                  <td style="text-align: center;">
                    ${!isAsuhan ? `
                      <input type="checkbox" class="tambah-asuhan-checkbox" data-siswa-id="${s.id}" onchange="updateTercentangInfoBadge()">
                    ` : `
                      <i class="fas fa-check" style="color: #10b981;"></i>
                    `}
                  </td>
                  <td style="text-align: center;">${idx + 1}</td>
                  <td><span class="badge" style="background:var(--bg-app); border:1px solid var(--border-color); font-weight:600;">${kelas.nama}</span></td>
                  <td><code>${s.nisn || '-'}</code></td>
                  <td style="font-weight: 600;">${s.nama}</td>
                  <td style="text-align: center;">${gender}</td>
                  <td>
                    <div style="font-size: 0.82rem;">${contact.namaWali}</div>
                    <div style="font-size: 0.76rem; color: var(--text-muted);">${contact.noHp || '-'}</div>
                  </td>
                  <td style="text-align: center;">
                    ${isAsuhan ? `
                      <span class="badge badge-hadir"><i class="fas fa-check"></i> Sudah Jadi Asuhan</span>
                    ` : `
                      <span class="badge" style="background: rgba(124, 58, 237, 0.1); color: #7c3aed; border: 1px solid rgba(124, 58, 237, 0.25);">
                        <i class="fas fa-plus"></i> Dapat Ditambahkan
                      </span>
                    `}
                  </td>
                  <td style="text-align: center;">
                    ${!isAsuhan ? `
                      <button type="button" class="btn btn-primary btn-sm" onclick="tambahSiswaAsuhanSingle('${s.id}')" style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.78rem; padding: 5px 10px;">
                        <i class="fas fa-user-plus"></i> Tambahkan
                      </button>
                    ` : `
                      <button type="button" class="btn btn-secondary btn-sm" style="color: #ef4444; font-size: 0.78rem; padding: 5px 10px;" onclick="hapusSiswaDariAsuhan('${s.id}')" title="Keluarkan dari Asuhan">
                        <i class="fas fa-user-minus"></i> Hapus
                      </button>
                    `}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  setTimeout(() => {
    filterTambahAsuhanTable();
  }, 20);
}

function filterTambahAsuhanTable() {
  const selectedKelas = document.getElementById("filter-tambah-asuhan-kelas")?.value || "ALL";
  const selectedStatus = document.getElementById("filter-tambah-asuhan-status")?.value || "ALL";
  const query = (document.getElementById("filter-tambah-asuhan-search")?.value || "").toLowerCase().trim();
  const rows = document.querySelectorAll("#table-tambah-siswa-asuhan tbody tr.tambah-asuhan-row");

  rows.forEach(row => {
    const rowKelas = row.getAttribute("data-kelas");
    const rowStatus = row.getAttribute("data-status");
    const rowSearch = row.getAttribute("data-search") || "";

    const matchKelas = selectedKelas === "ALL" || rowKelas === selectedKelas;
    const matchStatus = selectedStatus === "ALL" || rowStatus === selectedStatus;
    const matchSearch = rowSearch.includes(query);

    row.style.display = (matchKelas && matchStatus && matchSearch) ? "" : "none";
  });

  updateTercentangInfoBadge();
}

function updateTercentangInfoBadge() {
  const checked = document.querySelectorAll(".tambah-asuhan-checkbox:checked");
  const badge = document.getElementById("badge-tercentang-info");
  if (badge) {
    badge.textContent = `${checked.length} Siswa Tercentang`;
  }
}

function toggleSelectAllTambahAsuhan(selectAll) {
  const rows = document.querySelectorAll("#table-tambah-siswa-asuhan tbody tr.tambah-asuhan-row");
  rows.forEach(row => {
    if (row.style.display !== "none") {
      const cb = row.querySelector(".tambah-asuhan-checkbox");
      if (cb) cb.checked = selectAll;
    }
  });
  updateTercentangInfoBadge();
}

function tambahSiswaAsuhanSingle(siswaId) {
  db.siswaAsuhan = db.siswaAsuhan || [];
  if (db.siswaAsuhan.includes(siswaId)) {
    showToast("Siswa sudah berada dalam daftar asuhan.");
    return;
  }
  db.siswaAsuhan.push(siswaId);
  saveDatabase(true);
  const student = db.siswa.find(s => s.id === siswaId);
  showToast(`${student ? student.nama : 'Siswa'} berhasil ditambahkan sebagai anak asuhan!`);
  
  const activePage = window.location.hash.substring(1) || "tambah_siswa_asuhan";
  renderPage(activePage);
}

function hapusSiswaDariAsuhan(siswaId) {
  const student = (db.siswa || []).find(s => s.id === siswaId);
  const name = student ? student.nama : "siswa ini";
  if (!confirm(`Apakah Anda yakin ingin mengeluarkan ${name} dari daftar siswa asuhan Anda?`)) return;

  db.siswaAsuhan = (db.siswaAsuhan || []).filter(id => id !== siswaId);
  saveDatabase(true);
  showToast(`${name} telah dikeluarkan dari daftar asuhan.`);

  const activePage = window.location.hash.substring(1) || "siswa_asuhan";
  renderPage(activePage);
}

function tambahkanSiswaTercentang() {
  const checkboxes = document.querySelectorAll(".tambah-asuhan-checkbox:checked");
  if (checkboxes.length === 0) {
    alert("Silakan centang minimal satu siswa yang ingin ditambahkan ke daftar asuhan.");
    return;
  }

  db.siswaAsuhan = db.siswaAsuhan || [];
  let addedCount = 0;

  checkboxes.forEach(cb => {
    const id = cb.getAttribute("data-siswa-id");
    if (id && !db.siswaAsuhan.includes(id)) {
      db.siswaAsuhan.push(id);
      addedCount++;
    }
  });

  saveDatabase(true);
  showToast(`${addedCount} Siswa berhasil ditambahkan ke daftar asuhan!`);
  renderPage("siswa_asuhan");
}

// ==========================================
// MODAL PILIH SISWA ASUHAN DARI DATABASE
// ==========================================
function openPilihSiswaAsuhanModal() {
  db.siswaAsuhan = db.siswaAsuhan || [];
  const allSiswa = db.siswa || [];

  if (allSiswa.length === 0) {
    alert("Database siswa masih kosong. Silakan tambahkan atau import data siswa terlebih dahulu di menu Data Siswa atau Sinkronisasi.");
    return;
  }

  const kelasList = db.kelas || [];
  const kelasOptions = [
    '<option value="ALL">Semua Kelas</option>',
    ...kelasList.map(k => `<option value="${k.id}">${k.tingkat ? k.tingkat + ' - ' : ''}${k.nama}</option>`)
  ].join('');

  const modalHtml = `
    <div style="font-size: 0.88rem;">
      <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0 0 12px;">
        Pilih siswa dari database sekolah untuk dijadikan anak bimbingan/mentee Anda. Anda dapat menyaring per kelas, mencari berdasarkan nama / NISN, atau mencentang beberapa siswa sekaligus.
      </p>

      <!-- Filter Bar -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
        <div>
          <label style="font-size: 0.74rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">FILTER KELAS:</label>
          <select id="modal-asuhan-filter-kelas" class="form-control" style="font-size: 0.82rem; padding: 6px 10px;" onchange="filterModalSiswaAsuhan()">
            ${kelasOptions}
          </select>
        </div>
        <div>
          <label style="font-size: 0.74rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">STATUS ASUHAN:</label>
          <select id="modal-asuhan-filter-status" class="form-control" style="font-size: 0.82rem; padding: 6px 10px;" onchange="filterModalSiswaAsuhan()">
            <option value="AVAILABLE" selected>Belum Jadi Asuhan (Tersedia)</option>
            <option value="ALL">Semua Siswa</option>
            <option value="ALREADY">Sudah Jadi Asuhan</option>
          </select>
        </div>
      </div>

      <div style="margin-bottom: 12px; position: relative;">
        <input type="text" id="modal-asuhan-search" class="form-control" placeholder="Ketik nama siswa atau NISN..." style="font-size: 0.85rem; padding-left: 34px;" oninput="filterModalSiswaAsuhan()">
        <i class="fas fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.85rem;"></i>
      </div>

      <!-- Quick Action Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; gap: 6px;">
          <button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 4px 8px;" onclick="toggleSelectAllModalAsuhan(true)">Pilih Semua (Terlihat)</button>
          <button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 4px 8px;" onclick="toggleSelectAllModalAsuhan(false)">Batal Centang</button>
        </div>
        <span id="modal-asuhan-checked-count" class="badge" style="background: rgba(124,58,237,0.12); color: #7c3aed; font-size: 0.78rem; font-weight: 700; padding: 4px 10px;">
          0 Siswa Tercentang
        </span>
      </div>

      <!-- Student List Table -->
      <div style="max-height: 360px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px;">
        <table class="table" id="modal-asuhan-table" style="width: 100%; margin: 0; font-size: 0.82rem;">
          <thead style="position: sticky; top: 0; background: var(--bg-card); z-index: 2; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            <tr>
              <th style="width: 38px; text-align: center;">Pilih</th>
              <th>Nama Siswa</th>
              <th>Kelas</th>
              <th>NISN</th>
              <th style="text-align: center; width: 40px;">L/P</th>
              <th style="text-align: center; width: 105px;">Aksi Cepat</th>
            </tr>
          </thead>
          <tbody>
            ${allSiswa.map((s, idx) => {
              const k = kelasList.find(c => c.id === s.kelasId) || { nama: "-" };
              const isAsuhan = db.siswaAsuhan.includes(s.id);
              const gender = s.jenisKelamin || s.gender || "-";
              return `
                <tr class="modal-asuhan-row" id="modal-row-${s.id}" data-siswa-id="${s.id}" data-kelas="${s.kelasId}" data-status="${isAsuhan ? 'ALREADY' : 'AVAILABLE'}" data-search="${(s.nama || '').toLowerCase()} ${(s.nisn || '').toLowerCase()}">
                  <td style="text-align: center;">
                    ${!isAsuhan ? `
                      <input type="checkbox" class="modal-asuhan-cb" data-siswa-id="${s.id}" onchange="updateModalAsuhanCheckedCount()">
                    ` : `
                      <i class="fas fa-check-circle" style="color: #10b981;" title="Sudah jadi asuhan"></i>
                    `}
                  </td>
                  <td>
                    <div style="font-weight: 600; color: var(--text-main);">${s.nama}</div>
                    <div id="modal-badge-${s.id}">
                      ${isAsuhan ? `<span class="badge badge-hadir" style="font-size: 0.68rem; padding: 2px 6px;"><i class="fas fa-check"></i> Asuhan Aktif</span>` : ''}
                    </div>
                  </td>
                  <td><span class="badge" style="background: var(--bg-app); border: 1px solid var(--border-color); font-size: 0.74rem;">${k.nama}</span></td>
                  <td><code>${s.nisn || '-'}</code></td>
                  <td style="text-align: center;"><span class="badge" style="background: rgba(0,0,0,0.04); font-size: 0.72rem;">${gender}</span></td>
                  <td style="text-align: center;" id="modal-action-${s.id}">
                    ${!isAsuhan ? `
                      <button type="button" class="btn btn-primary btn-sm" style="font-size: 0.74rem; padding: 4px 8px; width: 100%; justify-content: center;" onclick="tambahSiswaAsuhanFromModal('${s.id}')">
                        <i class="fas fa-plus"></i> Tambah
                      </button>
                    ` : `
                      <button type="button" class="btn btn-secondary btn-sm" style="color: #ef4444; font-size: 0.72rem; padding: 3px 6px; width: 100%; justify-content: center;" onclick="hapusSiswaAsuhanFromModal('${s.id}')" title="Keluarkan">
                        <i class="fas fa-minus"></i> Hapus
                      </button>
                    `}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" onclick="closeModal()">Tutup</button>
    <button type="button" class="btn btn-primary" onclick="simpanPilihanSiswaAsuhanModal()">
      <i class="fas fa-user-plus"></i> Tambahkan Siswa Tercentang
    </button>
  `;

  openModal("Pilih Siswa Asuhan dari Database", modalHtml, footerHtml, true);

  setTimeout(() => {
    filterModalSiswaAsuhan();
  }, 20);
}

function filterModalSiswaAsuhan() {
  const selectedKelas = document.getElementById("modal-asuhan-filter-kelas")?.value || "ALL";
  const selectedStatus = document.getElementById("modal-asuhan-filter-status")?.value || "ALL";
  const query = (document.getElementById("modal-asuhan-search")?.value || "").toLowerCase().trim();
  const rows = document.querySelectorAll("#modal-asuhan-table tbody tr.modal-asuhan-row");

  rows.forEach(row => {
    const rowKelas = row.getAttribute("data-kelas");
    const rowStatus = row.getAttribute("data-status");
    const rowSearch = row.getAttribute("data-search") || "";

    const matchKelas = selectedKelas === "ALL" || rowKelas === selectedKelas;
    const matchStatus = selectedStatus === "ALL" || rowStatus === selectedStatus;
    const matchSearch = rowSearch.includes(query);

    row.style.display = (matchKelas && matchStatus && matchSearch) ? "" : "none";
  });

  updateModalAsuhanCheckedCount();
}

function updateModalAsuhanCheckedCount() {
  const checked = document.querySelectorAll(".modal-asuhan-cb:checked");
  const badge = document.getElementById("modal-asuhan-checked-count");
  if (badge) {
    badge.textContent = `${checked.length} Siswa Tercentang`;
  }
}

function toggleSelectAllModalAsuhan(selectAll) {
  const rows = document.querySelectorAll("#modal-asuhan-table tbody tr.modal-asuhan-row");
  rows.forEach(row => {
    if (row.style.display !== "none") {
      const cb = row.querySelector(".modal-asuhan-cb");
      if (cb) cb.checked = selectAll;
    }
  });
  updateModalAsuhanCheckedCount();
}

function tambahSiswaAsuhanFromModal(siswaId) {
  db.siswaAsuhan = db.siswaAsuhan || [];
  if (!db.siswaAsuhan.includes(siswaId)) {
    db.siswaAsuhan.push(siswaId);
    saveDatabase(true);
  }
  const student = (db.siswa || []).find(s => s.id === siswaId);
  showToast(`${student ? student.nama : 'Siswa'} ditambahkan sebagai anak asuhan!`);

  // Update UI row in modal
  const row = document.getElementById(`modal-row-${siswaId}`);
  if (row) {
    row.setAttribute("data-status", "ALREADY");
    const firstTd = row.querySelector("td:first-child");
    if (firstTd) firstTd.innerHTML = `<i class="fas fa-check-circle" style="color: #10b981;" title="Sudah jadi asuhan"></i>`;
    const badgeDiv = document.getElementById(`modal-badge-${siswaId}`);
    if (badgeDiv) badgeDiv.innerHTML = `<span class="badge badge-hadir" style="font-size: 0.68rem; padding: 2px 6px;"><i class="fas fa-check"></i> Asuhan Aktif</span>`;
    const actionTd = document.getElementById(`modal-action-${siswaId}`);
    if (actionTd) {
      actionTd.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm" style="color: #ef4444; font-size: 0.72rem; padding: 3px 6px; width: 100%; justify-content: center;" onclick="hapusSiswaAsuhanFromModal('${siswaId}')" title="Keluarkan">
          <i class="fas fa-minus"></i> Hapus
        </button>
      `;
    }
  }

  updateModalAsuhanCheckedCount();
  // Refresh background page view
  const activePage = window.location.hash.substring(1) || "siswa_asuhan";
  renderPage(activePage);
}

function hapusSiswaAsuhanFromModal(siswaId) {
  db.siswaAsuhan = (db.siswaAsuhan || []).filter(id => id !== siswaId);
  saveDatabase(true);
  const student = (db.siswa || []).find(s => s.id === siswaId);
  showToast(`${student ? student.nama : 'Siswa'} dikeluarkan dari asuhan.`);

  // Update UI row in modal
  const row = document.getElementById(`modal-row-${siswaId}`);
  if (row) {
    row.setAttribute("data-status", "AVAILABLE");
    const firstTd = row.querySelector("td:first-child");
    if (firstTd) firstTd.innerHTML = `<input type="checkbox" class="modal-asuhan-cb" data-siswa-id="${siswaId}" onchange="updateModalAsuhanCheckedCount()">`;
    const badgeDiv = document.getElementById(`modal-badge-${siswaId}`);
    if (badgeDiv) badgeDiv.innerHTML = "";
    const actionTd = document.getElementById(`modal-action-${siswaId}`);
    if (actionTd) {
      actionTd.innerHTML = `
        <button type="button" class="btn btn-primary btn-sm" style="font-size: 0.74rem; padding: 4px 8px; width: 100%; justify-content: center;" onclick="tambahSiswaAsuhanFromModal('${siswaId}')">
          <i class="fas fa-plus"></i> Tambah
        </button>
      `;
    }
  }

  updateModalAsuhanCheckedCount();
  // Refresh background page view
  const activePage = window.location.hash.substring(1) || "siswa_asuhan";
  renderPage(activePage);
}

function simpanPilihanSiswaAsuhanModal() {
  const checkboxes = document.querySelectorAll(".modal-asuhan-cb:checked");
  if (checkboxes.length === 0) {
    alert("Silakan centang minimal satu siswa yang ingin ditambahkan ke daftar asuhan.");
    return;
  }

  db.siswaAsuhan = db.siswaAsuhan || [];
  let count = 0;
  checkboxes.forEach(cb => {
    const id = cb.getAttribute("data-siswa-id");
    if (id && !db.siswaAsuhan.includes(id)) {
      db.siswaAsuhan.push(id);
      count++;
    }
  });

  saveDatabase(true);
  closeModal();
  showToast(`${count} Siswa berhasil ditambahkan ke daftar asuhan!`);
  const activePage = window.location.hash.substring(1) || "siswa_asuhan";
  renderPage(activePage);
}

function renderSiswaAsuhanGuruWali(container) {
  renderDaftarSiswaAsuhanGuruWali(container);
}


function renderJurnalBimbinganGuruWali(container) {
  db.jurnalBimbingan = db.jurnalBimbingan || [];
  const list = [...db.jurnalBimbingan].sort((a, b) => new Date(b.tanggal || b.createdAt) - new Date(a.tanggal || a.createdAt));

  container.innerHTML = `
    <div class="card" style="margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div>
          <h3 style="margin: 0; font-size: 1.1rem;"><i class="fas fa-hand-holding-heart"></i> Jurnal Bimbingan & Konseling Guru Wali</h3>
          <p style="margin: 4px 0 0; font-size: 0.8rem; color: var(--text-muted);">
            Catatan pendampingan perkembangan moral, akademik, dan konseling pribadi siswa asuhan.
          </p>
        </div>
        <div>
          <button type="button" class="btn btn-primary" onclick="openJurnalBimbinganModal()">
            <i class="fas fa-plus"></i> Catat Bimbingan Baru
          </button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <span style="font-weight: 700; font-size: 0.95rem;">Riwayat Bimbingan Terdata</span>
        <span class="badge badge-hadir">${list.length} Sesi Bimbingan</span>
      </div>

      <div style="margin-top: 14px;">
        ${list.length === 0 ? `
          <div style="text-align: center; padding: 36px 16px; background: var(--bg-app); border-radius: 12px; border: 1px dashed var(--border-color);">
            <i class="fas fa-hand-holding-heart" style="font-size: 2.2rem; color: var(--text-muted); margin-bottom: 10px; display: block;"></i>
            <h4 style="margin: 0 0 6px;">Belum Ada Sesi Bimbingan</h4>
            <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">
              Klik tombol <strong>"Catat Bimbingan Baru"</strong> untuk mendokumentasikan konseling dan pendampingan anak asuhan Anda.
            </p>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${list.map(jb => {
              const student = db.siswa.find(s => s.id === jb.siswaId) || { nama: "Siswa Tidak Ditemukan", nisn: "-" };
              const kelas = db.kelas.find(k => k.id === student.kelasId) || { nama: "-" };

              return `
                <div class="card" style="padding: 16px; border: 1px solid var(--border-color); background: var(--bg-card); border-left: 4px solid ${jb.status === 'Tuntas' ? '#10b981' : '#7c3aed'};">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
                    <div>
                      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span style="font-weight: 700; font-size: 1rem; color: var(--text-main);">${student.nama}</span>
                        <span class="badge" style="background: var(--bg-app); border: 1px solid var(--border-color);">Kelas ${kelas.nama}</span>
                        <span class="badge" style="background: rgba(124,58,237,0.1); color: #7c3aed;">${jb.bidang}</span>
                        <span class="badge ${jb.status === 'Tuntas' ? 'badge-hadir' : 'badge-alpa'}">${jb.status}</span>
                      </div>
                      <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 3px;">
                        <i class="fas fa-calendar-alt"></i> Tanggal Bimbingan: ${formatDateIndoFull(jb.tanggal)}
                      </div>
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                      <button type="button" class="btn btn-sm" style="background:#25D366; color:#fff; padding: 4px 8px; border-radius: 6px;" onclick="sendJurnalBimbinganWA('${jb.id}')" title="Kirim Motivasi/Ringkasan WA">
                        <i class="fab fa-whatsapp"></i> Bagikan WA
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm" style="padding: 4px 8px; border-radius: 6px;" onclick="openJurnalBimbinganModal('${jb.id}')" title="Edit Jurnal">
                        <i class="fas fa-edit"></i>
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm" style="padding: 4px 8px; border-radius: 6px; color: #ef4444;" onclick="deleteJurnalBimbingan('${jb.id}')" title="Hapus Jurnal">
                        <i class="fas fa-trash-alt"></i>
                      </button>
                    </div>
                  </div>

                  <div style="font-size: 0.88rem; margin-bottom: 8px; line-height: 1.5; color: var(--text-main);">
                    <strong>Pokok Bahasan / Permasalahan:</strong><br>
                    ${jb.pokokBahasan.replace(/\n/g, '<br>')}
                  </div>

                  <div style="font-size: 0.85rem; padding: 10px 12px; background: var(--bg-app); border-radius: 8px; border: 1px dashed var(--border-color); color: var(--text-main);">
                    <strong>Rencana Tindak Lanjut / Arahan Mentor:</strong><br>
                    ${jb.tindakLanjut ? jb.tindakLanjut.replace(/\n/g, '<br>') : '<span style="color:var(--text-muted); font-style:italic;">Belum ada rencana tindak lanjut</span>'}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `}
      </div>
    </div>
  `;
}

function openJurnalBimbinganModal(jurnalId = null, defaultSiswaId = null) {
  const asuhanList = getSiswaAsuhanList();
  // Jika belum ada siswa asuhan, ambil seluruh siswa sebagai fallback
  const studentChoices = asuhanList.length > 0 ? asuhanList : db.siswa;
  const existing = jurnalId ? (db.jurnalBimbingan || []).find(j => j.id === jurnalId) : null;

  const activeSiswaId = existing ? existing.siswaId : (defaultSiswaId || (studentChoices[0]?.id || ""));
  const tanggal = existing ? existing.tanggal : getLocalDateString();
  const bidang = existing ? existing.bidang : "Perilaku & Karakter";
  const pokokBahasan = existing ? existing.pokokBahasan : "";
  const tindakLanjut = existing ? existing.tindakLanjut : "";
  const status = existing ? existing.status : "Dalam Proses";

  const siswaOptions = studentChoices.map(s => {
    const k = db.kelas.find(cl => cl.id === s.kelasId) || { nama: "-" };
    return `<option value="${s.id}" ${s.id === activeSiswaId ? 'selected' : ''}>${s.nama} (Kelas ${k.nama})</option>`;
  }).join("");

  const bidangList = [
    "Perilaku & Karakter",
    "Belajar & Prestasi Akademik",
    "Kedisiplinan & Presensi",
    "Sosial & Hubungan Pertemanan",
    "Karir, Cita-cita & Perguruan Tinggi",
    "Keluarga & Pribadi"
  ];

  const modalHtml = `
    <form id="form-jurnal-bimbingan" onsubmit="handleSaveJurnalBimbingan(event, '${jurnalId || ''}')">
      <div class="form-group" style="margin-bottom: 12px;">
        <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 4px;">Pilih Siswa Asuhan:</label>
        <select id="modal-jb-siswa" class="form-control" required>
          ${siswaOptions}
        </select>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div>
          <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 4px;">Tanggal Bimbingan:</label>
          <input type="date" id="modal-jb-tanggal" class="form-control" value="${tanggal}" required>
        </div>
        <div>
          <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 4px;">Status Konseling:</label>
          <select id="modal-jb-status" class="form-control">
            <option value="Dalam Proses" ${status === 'Dalam Proses' ? 'selected' : ''}>Dalam Proses</option>
            <option value="Tuntas" ${status === 'Tuntas' ? 'selected' : ''}>Tuntas / Selesai</option>
          </select>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 4px;">Bidang Bimbingan:</label>
        <select id="modal-jb-bidang" class="form-control">
          ${bidangList.map(b => `<option value="${b}" ${b === bidang ? 'selected' : ''}>${b}</option>`).join("")}
        </select>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 4px;">Pokok Bahasan / Uraian Bimbingan:</label>
        <textarea id="modal-jb-pokok" class="form-control" rows="4" placeholder="Jelaskan topik yang didiskusikan atau masalah yang dihadapi siswa asuhan..." required>${pokokBahasan}</textarea>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 4px;">Rencana Tindak Lanjut / Solusi Guru Wali:</label>
        <textarea id="modal-jb-tindak-lanjut" class="form-control" rows="3" placeholder="Saran perbaikan, target capaian siswa, atau rencana pertemuan berikutnya...">${tindakLanjut}</textarea>
      </div>
    </form>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button type="submit" form="form-jurnal-bimbingan" class="btn btn-primary">
      <i class="fas fa-save"></i> Simpan Jurnal
    </button>
  `;

  openModal(existing ? "Edit Jurnal Bimbingan" : "Catat Bimbingan Siswa Asuhan", modalHtml, footerHtml, false);
}

function handleSaveJurnalBimbingan(event, jurnalId) {
  if (event) event.preventDefault();

  const siswaId = document.getElementById("modal-jb-siswa")?.value;
  const tanggal = document.getElementById("modal-jb-tanggal")?.value;
  const status = document.getElementById("modal-jb-status")?.value;
  const bidang = document.getElementById("modal-jb-bidang")?.value;
  const pokokBahasan = document.getElementById("modal-jb-pokok")?.value?.trim();
  const tindakLanjut = document.getElementById("modal-jb-tindak-lanjut")?.value?.trim();

  if (!siswaId || !pokokBahasan) {
    alert("Harap pilih siswa dan isi pokok bahasan bimbingan.");
    return;
  }

  db.jurnalBimbingan = db.jurnalBimbingan || [];

  if (jurnalId) {
    const idx = db.jurnalBimbingan.findIndex(j => j.id === jurnalId);
    if (idx !== -1) {
      db.jurnalBimbingan[idx] = {
        ...db.jurnalBimbingan[idx],
        siswaId,
        tanggal,
        status,
        bidang,
        pokokBahasan,
        tindakLanjut,
        updatedAt: new Date().toISOString()
      };
    }
  } else {
    db.jurnalBimbingan.push({
      id: "jb-" + Date.now() + Math.random().toString(36).substr(2, 4),
      siswaId,
      tanggal,
      status,
      bidang,
      pokokBahasan,
      tindakLanjut,
      createdAt: new Date().toISOString()
    });
  }

  saveDatabase(true);
  closeModal();
  showToast("Catatan bimbingan berhasil disimpan!");

  const activePage = window.location.hash.substring(1) || "dashboard";
  if (activePage === "jurnal_bimbingan" || activePage === "dashboard") {
    renderPage(activePage);
  }
}

function deleteJurnalBimbingan(id) {
  if (!confirm("Apakah Anda yakin ingin menghapus jurnal bimbingan ini?")) return;
  db.jurnalBimbingan = (db.jurnalBimbingan || []).filter(j => j.id !== id);
  saveDatabase(true);
  showToast("Jurnal bimbingan berhasil dihapus.");
  renderJurnalBimbinganGuruWali(document.getElementById("content-area"));
}

function sendJurnalBimbinganWA(id) {
  const item = (db.jurnalBimbingan || []).find(j => j.id === id);
  if (!item) return;

  const student = db.siswa.find(s => s.id === item.siswaId);
  if (!student) return;
  const kelas = db.kelas.find(k => k.id === student.kelasId) || { nama: "-" };
  const contact = getStudentParentContact(student);
  const teacherName = (db.guruProfile && db.guruProfile.nama) ? db.guruProfile.nama : "Guru Wali";

  if (!contact.hasPhone) {
    alert("Nomor WhatsApp belum terdaftar di sistem.");
    return;
  }

  const message = 
`Yth. Bapak/Ibu ${contact.namaWali} / Ananda *${student.nama}* (Kelas ${kelas.nama}),

Assalamu'alaikum Warahmatullahi Wabarakatuh / Salam Sejahtera.

Berikut ringkasan catatan pembimbingan mentor/guru wali di sekolah:

🌱 *Bidang Bimbingan:* ${item.bidang}
📅 *Tanggal:* ${formatDateIndoFull(item.tanggal)}
📌 *Fokus Bimbingan:* ${item.pokokBahasan}
💡 *Rekomendasi & Tindak Lanjut:* ${item.tindakLanjut || "Terus semangat belajar dan konsisten dalam menjaga kedisiplinan serta akhlak terpuji."}

Semoga ananda senantiasa berkembang menjadi pribadi yang berprestasi dan berkarakter mulia.

Salam hangat,
*${teacherName}*
Guru Wali / Mentor Asuhan SMA Negeri Saku`;

  window.open(`https://wa.me/${contact.cleanPhone}?text=${encodeURIComponent(message)}`, "_blank");
}

function renderPantauanAbsensiGuruWali(container) {
  const asuhanList = getSiswaAsuhanList();
  const asuhanIds = asuhanList.map(s => s.id);
  const bulanNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  const monthStr = String(currentWaliKelasMonth + 1).padStart(2, "0");
  const monthPrefix = `${currentWaliKelasYear}-${monthStr}`;

  // Filter absensi siswa asuhan di bulan ini
  const monthAbsensi = (db.absensi || []).filter(a => asuhanIds.includes(a.siswaId) && a.tanggal && a.tanggal.startsWith(monthPrefix));
  const uniqueDates = [...new Set(monthAbsensi.map(a => a.tanggal))].sort();

  const studentStats = asuhanList.map(s => {
    let h = 0, sc = 0, i = 0, a = 0, t = 0, b = 0;
    uniqueDates.forEach(d => {
      const recs = monthAbsensi.filter(rec => rec.siswaId === s.id && rec.tanggal === d);
      if (recs.length === 0) return;
      const statuses = recs.map(r => r.status);
      if (statuses.includes("Bolos")) b++;
      else if (statuses.includes("Alpa")) a++;
      else if (statuses.includes("Sakit")) sc++;
      else if (statuses.includes("Izin")) i++;
      else if (statuses.includes("Terlambat")) t++;
      else if (statuses.includes("Hadir")) h++;
    });

    const totalHari = h + sc + i + a + t + b;
    const persen = totalHari > 0 ? Math.round(((h + t) / totalHari) * 100) : 0;
    const k = db.kelas.find(cl => cl.id === s.kelasId) || { nama: "-" };

    return {
      student: s,
      kelas: k,
      hadir: h,
      sakit: sc,
      izin: i,
      alpa: a,
      terlambat: t,
      bolos: b,
      totalHari,
      persen
    };
  });

  const bulanOptions = bulanNames.map((name, idx) => `
    <option value="${idx}" ${idx === currentWaliKelasMonth ? 'selected' : ''}>${name}</option>
  `).join("");

  container.innerHTML = `
    <div class="card" style="margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <div>
            <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">BULAN:</label>
            <select class="form-control" style="font-weight: 600;" onchange="currentWaliKelasMonth = parseInt(this.value); renderPantauanAbsensiGuruWali(document.getElementById('content-area'));">
              ${bulanOptions}
            </select>
          </div>
          <div>
            <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">TAHUN:</label>
            <input type="number" class="form-control" style="width: 100px; font-weight: 600;" value="${currentWaliKelasYear}" onchange="currentWaliKelasYear = parseInt(this.value); renderPantauanAbsensiGuruWali(document.getElementById('content-area'));">
          </div>
        </div>
        <div>
          <button type="button" class="btn btn-secondary" onclick="window.print()">
            <i class="fas fa-print"></i> Cetak Pantauan
          </button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <h3 style="margin: 0; font-size: 1.1rem;"><i class="fas fa-clipboard-user"></i> Pantauan Presensi Siswa Asuhan Lintas Kelas</h3>
          <p style="margin: 4px 0 0; font-size: 0.8rem; color: var(--text-muted);">
            Periode: ${bulanNames[currentWaliKelasMonth]} ${currentWaliKelasYear} • Memantau rekap ketidakhadiran anak asuhan dari laporan seluruh guru mapel.
          </p>
        </div>
        <span class="badge badge-hadir">${asuhanList.length} Siswa Asuhan</span>
      </div>

      <div class="table-responsive" style="margin-top: 14px;">
        <table class="table" style="width: 100%;">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">No</th>
              <th>Nama Siswa Asuhan</th>
              <th>Kelas</th>
              <th>NISN</th>
              <th style="text-align: center; color: #10b981; width: 45px;" title="Hadir">H</th>
              <th style="text-align: center; color: #8b5cf6; width: 45px;" title="Sakit">S</th>
              <th style="text-align: center; color: #3b82f6; width: 45px;" title="Izin">I</th>
              <th style="text-align: center; color: #ef4444; width: 45px;" title="Alpa">A</th>
              <th style="text-align: center; color: #f59e0b; width: 45px;" title="Terlambat">T</th>
              <th style="text-align: center; color: #b91c1c; width: 45px;" title="Bolos">B</th>
              <th style="text-align: center; width: 85px;">% Hadir</th>
              <th style="text-align: center; width: 100px;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${studentStats.length === 0 ? `
              <tr><td colspan="12" style="text-align: center; padding: 30px; color: var(--text-muted);">Belum ada siswa asuhan yang dipilih. Silakan tentukan siswa di menu Kelola Siswa Asuhan.</td></tr>
            ` : studentStats.map((item, idx) => `
              <tr>
                <td style="text-align: center;">${idx + 1}</td>
                <td style="font-weight: 600;">${item.student.nama}</td>
                <td><span class="badge" style="background:var(--bg-app); border:1px solid var(--border-color);">${item.kelas.nama}</span></td>
                <td><code>${item.student.nisn || '-'}</code></td>
                <td style="text-align: center; font-weight: 700; color: #10b981;">${item.hadir}</td>
                <td style="text-align: center; font-weight: 600; color: #8b5cf6;">${item.sakit}</td>
                <td style="text-align: center; font-weight: 600; color: #3b82f6;">${item.izin}</td>
                <td style="text-align: center; font-weight: 700; color: ${item.alpa > 0 ? '#ef4444' : 'inherit'};">${item.alpa}</td>
                <td style="text-align: center; font-weight: 600; color: #f59e0b;">${item.terlambat}</td>
                <td style="text-align: center; font-weight: 700; color: ${item.bolos > 0 ? '#b91c1c' : 'inherit'};">${item.bolos}</td>
                <td style="text-align: center;">
                  <span class="badge ${item.persen >= 85 ? 'badge-hadir' : item.persen >= 75 ? 'badge-terlambat' : 'badge-alpa'}" style="font-weight: 700;">
                    ${item.persen}%
                  </span>
                </td>
                <td style="text-align: center;">
                  <button type="button" class="btn btn-secondary btn-sm" onclick="openJurnalBimbinganModal(null, '${item.student.id}')" title="Bimbingan Siswa">
                    <i class="fas fa-hand-holding-heart"></i> Bimbing
                  </button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function sendDirectWA(phone, text) {
  if (!phone) {
    alert("Nomor telepon tidak valid.");
    return;
  }
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
}
