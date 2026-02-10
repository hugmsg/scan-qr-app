/***********************
 * CONFIGURATION
 ***********************/
const GAS_URL = "https://script.google.com/macros/s/AKfycbzGKXa2AFXtl8JTjfxgP2NtVP47vOf0KYxvK7gnYOtUR512GqkFhy15dJOSlQ6jkfJAOA/exec";
const USER = "utilisateur_1";
const VERSION = "2.0.1";

/***********************
 * ETAT
 ***********************/
let currentQR = null;
let html5QrcodeScanner = null;

/***********************
 * LOG VISIBLE
 ***********************/
function log(msg) {
  console.log(msg);
  const div = document.getElementById("log");
  if (div) div.innerHTML += msg + "<br>";
}

/***********************
 * INDEXED DB
 ***********************/
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

async function saveOffline(data) {
  const db = await openDB();
  const tx = db.transaction("queue", "readwrite");
  tx.objectStore("queue").add(data);
  tx.oncomplete = () =>
    log("Sauvegardé offline : " + (data.qr || data.filename));
}

function deleteItem(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("queue", "readwrite");
    const req = tx.objectStore("queue").delete(id);
    req.onsuccess = resolve;
    req.onerror = reject;
  });
}

/***********************
 * ENVOI SERVEUR
 ***********************/
async function trySend() {
  if (!navigator.onLine) {
    log("Offline, envoi différé");
    return;
  }

  const db = await openDB();
  const store = db.transaction("queue", "readonly").objectStore("queue");

  const items = await new Promise(res => {
    const r = store.getAll();
    r.onsuccess = () => res(r.result || []);
  });

  log("Éléments à envoyer : " + items.length);

  for (const item of items) {
    try {
      const response = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item)
      });

      if (!response.ok) {
        log("Erreur serveur : " + response.status);
        return;
      }

      await deleteItem(db, item.id);
      log("Envoyé : " + (item.qr || item.filename));
    } catch (err) {
      log("Fetch échoué : " + err.message);
      return;
    }
  }
}

/***********************
 * QR CODE
 ***********************/
function startScan() {
  html5QrcodeScanner = new Html5Qrcode("qr-reader");
  html5QrcodeScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    qr => {
      currentQR = qr;
      document.getElementById("result").innerText = qr;
      html5QrcodeScanner.stop();
    }
  );
}

async function sendQR() {
  if (!currentQR) {
    alert("Aucun QR scanné");
    return;
  }

  await saveOffline({
    type: "qr",
    qr: currentQR,
    user: USER,
    device: navigator.userAgent,
    date: new Date().toISOString()
  });

  currentQR = null;
  document.getElementById("result").innerText = "Aucun QR scanné";

  await trySend();
}

/***********************
 * PHOTO
 ***********************/
function takePhoto() {
  document.getElementById("photoInput").click();
}

document.getElementById("photoInput").addEventListener("change", async e => {
  for (const file of e.target.files) {

    // 🔒 limite taille AVANT traitement
    if (file.size > 3_000_000) {
      alert("Photo trop lourde (>3 Mo)");
      continue;
    }

    const base64 = await compressToBase64(file);

    await saveOffline({
      type: "photo",
      filename: file.name,
      image: base64,
      user: USER,
      device: navigator.userAgent,
      date: new Date().toISOString()
    });
  }

  await trySend();
});

/***********************
 * COMPRESSION PHOTO
 ***********************/
function compressToBase64(file, maxWidth = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = e => {
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(blob => {
          const r = new FileReader();
          r.onload = () => resolve(r.result.split(",")[1]);
          r.readAsDataURL(blob);
        }, "image/jpeg", quality);
      };
      img.src = e.target.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/***********************
 * EVENTS
 ***********************/
window.addEventListener("online", trySend);

window.addEventListener("load", () => {
  log("App prête – version " + VERSION);
});

