const GAS_URL = "https://script.google.com/macros/s/AKfycbzUgSDV_7MJsXy9LVDwESOTTtKlEveJtQvv88nNKVTi7iU0PFe56C7gw4gA9fSARffleQ/exec";
let currentQR = null;
const USER = "utilisateur_1"; // à changer par appareil
let html5QrcodeScanner;

// ----------- START SCAN ----------------
function startScan() {
  html5QrcodeScanner = new Html5Qrcode("qr-reader");

  html5QrcodeScanner.start(
    { facingMode: "environment" }, // caméra arrière
    { fps: 10, qrbox: 250 },
    qrCodeMessage => {
      currentQR = qrCodeMessage;
      document.getElementById("result").innerText = qrCodeMessage;
      html5QrcodeScanner.stop(); // stop après scan réussi
    },
    errorMessage => {
      // log("Scan error", errorMessage);
    }
  ).catch(err => console.error("Impossible de démarrer le scan", err));
}

// ----------- STOP SCAN ----------------
function stopScan() {
  if (html5QrcodeScanner) html5QrcodeScanner.stop();
}

// ----------- ENVOI ----------------
async function send() {
  if (!currentQR) return alert("Aucun QR scanné");

  const payload = {
    qr: currentQR,
    user: USER,
    device: navigator.userAgent,
    date: new Date().toISOString()
  };

  await saveOffline(payload);
  trySend();
}

// ----------- OFFLINE STORAGE ----------------
async function saveOffline(data) {
  const db = await openDB();
  const tx = db.transaction("queue", "readwrite");
  tx.objectStore("queue").add(data);
  await tx.complete;
}

// ----------- TRY SEND ----------------
async function trySend() {
  if (!navigator.onLine) return log("Offline, envoi différé");

  const db = await openDB();
  const tx = db.transaction("queue", "readwrite");
  const store = tx.objectStore("queue");

  // récupérer tous les items avec une promesse
  const all = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = e => reject(e);
  });

  log("Scans à envoyer : " + all.length);

  for (const item of all) {
    try {
      const res = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(item)
      });
      if (res.ok) {
        log("Envoi réussi : " + item.qr);
        store.delete(item.id);
      } else {
        log("Erreur fetch : " + res.status);
      }
    } catch (err) {
      log("Impossible d'envoyer, réseau ? " + err);
      break; // réessaiera plus tard
    }
  }
}


// ----------- OFFLINE DB ----------------
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("scanDB", 1);
    request.onupgradeneeded = e => {
      e.target.result.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = e => resolve(e.target.result);
    request.onerror = reject;
  });
}

// ----------- SYNC AUTOMATIQUE QUAND ONLINE ----------------
window.addEventListener("online", trySend);

async function testDB() {
  const db = await openDB();
  log("DB ouverte :", db);
}
testDB();

function log(msg){
  console.log(msg);
  const logDiv = document.getElementById("log");
  logDiv.innerHTML += msg + "<br>";
}





