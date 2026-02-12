const GAS_URL = "https://script.google.com/macros/s/AKfycbzpoj2ssnVZyJhpMkQoWx6KHlyuhXIW-WwYjUi3nB0M1SNbF24UMbjCiIm4tod_DIS2Fw/exec";//https://script.google.com/macros/s/AKfycbxTfhWbuhE87MEIi7pDywDJhpLLrAt8KnU4OJR3t_wgLsIjPVR5Ea2F_PyLBVQisM69aA/exec";
let currentQR = null;
const USER = "utilisateur_1"; // à changer par appareil
const VERSION = "1.1.3"; // augmente à chaque update
let html5QrcodeScanner;
// -------- LOG SUR PAGE --------
function log(msg) {
  console.log(msg);
  const logDiv = document.getElementById("log");
  if (logDiv) logDiv.innerHTML += msg + "<br>";
}

// -------- INDEXEDDB --------
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

// -------- CLEAR QUEUE AU DEMARRAGE --------
async function clearQueueOnStart() {
  const db = await openDB();
  const tx = db.transaction("queue", "readwrite");
  const store = tx.objectStore("queue");
  store.clear();
  tx.oncomplete = () => log("Queue vidée au démarrage");
}

// -------- SAVE OFFLINE --------
async function saveOffline(data) {
  const db = await openDB();
  const tx = db.transaction("queue", "readwrite");
  const store = tx.objectStore("queue");
  store.add(data);
  tx.oncomplete = () => log("Scan sauvegardé offline : " + data.qr);
  tx.onerror = e => log("Erreur sauvegarde DB : " + e);
}

// -------- DELETE ITEM SÉCURISÉ --------
function deleteItem(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("queue", "readwrite");
    const store = tx.objectStore("queue");
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e);
  });
}

// -------- TRY SEND --------
async function trySend() {
  if (!navigator.onLine) return log("Offline, envoi différé");

  const db = await openDB();
  const tx = db.transaction("queue", "readwrite");
  const store = tx.objectStore("queue");

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
        await deleteItem(db, item.id); // <-- suppression attendue
      } else {
        log("Erreur fetch : " + res.status);
      }
    } catch (err) {
      log("Impossible d'envoyer, réseau ? " + err);
      break;
    }
  }
}

// -------- SEND (bouton) --------
async function send() {
  if (!currentQR) return alert("Aucun QR scanné");

  /*const payload = {
    qr: currentQR,
    user: USER,
    device: navigator.userAgent,
    date: new Date().toISOString()
  };*/

const prenom = document.getElementById("prenom").value;
  const nom = document.getElementById("nom").value;
  const immat = document.getElementById("immat").value;
  const transporteur = document.getElementById("transporteur").value;

  if (!prenom || !nom) {
    alert("Prénom et nom obligatoires");
    return;
  }

  const payload = {
    qr: currentQR,
    prenom: prenom,
    nom: nom,
    immatriculation: immat,
    transporteur: transporteur,
    user: USER,
    device: navigator.userAgent,
    date: new Date().toISOString()
  };
  await saveOffline(payload);
  await trySend(); // tentative immédiate si online
  currentQR = null; // <-- reset pour éviter envoi fantôme
  const resultDiv = document.getElementById("result");
  if (resultDiv) resultDiv.innerText = "Aucun QR scanné";
}

// -------- START SCAN --------
function startScan() {
  html5QrcodeScanner = new Html5Qrcode("qr-reader");
  html5QrcodeScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    qrCodeMessage => {
      currentQR = qrCodeMessage;
      const resultDiv = document.getElementById("result");
      if (resultDiv) resultDiv.innerText = qrCodeMessage;
      html5QrcodeScanner.stop();
    },
    errorMessage => { /* ignore les erreurs */ }
  ).catch(err => log("Impossible de démarrer le scan : " + err));
}

// -------- STOP SCAN (facultatif) --------
function stopScan() {
  if (html5QrcodeScanner) html5QrcodeScanner.stop();
}

// -------- SYNC AUTOMATIQUE QUAND ONLINE --------
window.addEventListener("online", trySend);

// -------- DEMARRAGE DE L'APP --------
window.addEventListener("load", async () => {
  //await clearQueueOnStart();
  log("App démarrée");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(() => log("Service Worker enregistré"))
      .catch(err => log("Erreur SW : " + err));
  });
}

log("App version " + VERSION);








