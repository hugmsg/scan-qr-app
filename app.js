const GAS_URL = "URL_DU_WEB_APP_ICI";
let currentQR = null;
const USER = "utilisateur_1"; // à changer par appareil

function startScan() {
  const scanner = new Html5Qrcode("video");
  scanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    qr => {
      currentQR = qr;
      document.getElementById("result").innerText = qr;
      scanner.stop();
    }
  );
}

async function send() {
  if (!currentQR) return alert("Aucun QR");

  const payload = {
    qr: currentQR,
    user: USER,
    device: navigator.userAgent,
    date: new Date().toISOString()
  };

  await saveOffline(payload);
  trySend();
}

async function saveOffline(data) {
  const db = await openDB();
  db.add("queue", data);
}

async function trySend() {
  if (!navigator.onLine) return;

  const db = await openDB();
  const tx = db.transaction("queue", "readwrite");
  const store = tx.objectStore("queue");
  const all = await store.getAll();

  for (const item of all) {
    try {
      await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(item)
      });
      store.delete(item.id);
    } catch {
      break;
    }
  }
}

window.addEventListener("online", trySend);

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("scanDB", 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore("queue", {
        keyPath: "id",
        autoIncrement: true
      });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = reject;
  });
}
