// --- Firebase Auth Check ---
let currentUser = null;
firebase.auth().onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    if (calendar) generateCalendar(); // only run once user is confirmed
    if (window.location.pathname.includes("export.html")) {
      populateExportTable();
      document.querySelector("button")?.addEventListener("click", downloadCSV);
    }
  } else {
    alert("You must be logged in to view this page.");
    window.location.href = "login.html";
  }
});

// --- Constants ---
const calendar = document.getElementById("calendar");
const modal = document.getElementById("eventModal");
const closeModal = document.getElementById("closeModal");
const saveEvent = document.getElementById("saveEvent");

let selectedSlot = null;
let editingEventId = null;
let events = [];

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const times = [];
for (let h = 8; h < 16; h++) {
  times.push(`${String(h).padStart(2, "0")}:00`);
  times.push(`${String(h).padStart(2, "0")}:30`);
}

// --- Site Postcodes ---
const sitePostcodes = {
  Fourfields: "PE7 3ZT", Beeches: "PE1 2EH", Newton: "PE19 6TJ", Elsworth: "CB23 4JD",
  "Fen Drayton": "CB24 4SL", Pathfinder: "CB24 1AA", Swavesy: "CB24 4RN", Shirley: "CB4 1TF",
  "The Vine": "CB23 6DY", Thorndown: "PE27 6SE", UoCP: "CB3 0QZ", Willingham: "CB24 5LE",
  Wyton: "PE28 2JB", Sawtry: "PE28 5TQ", Callum: "PE7 1LF", Toby: "PE7 3HN", Sam: "CB6 2SE"
};

// --- Site Distances (partial) ---
const siteDistances = {
  Fourfields: { Beeches: 5.8, Newton: 26.3, Elsworth: 24.8, "Fen Drayton": 23, Pathfinder: 28.1, Swavesy: 25.9, Shirley: 33.7,
    "The Vine": 28.3, Thorndown: 18.9, UoCP: 30.5, Willingham: 29.8, Wyton: 17.2, Sawtry: 7.6, Callum: 7.4, Toby: 0.8, Sam: 31.9 },
  Beeches: { Fourfields: 5.8, Newton: 33.3, Elsworth: 33.3, "Fen Drayton": 30.6, Pathfinder: 35.9, Swavesy: 33.8, Shirley: 43.2,
    "The Vine": 36.1, Thorndown: 24.1, UoCP: 40, Willingham: 37.6, Wyton: 22.3, Sawtry: 14.2, Callum: 7.1, Toby: 6.9, Sam: 33.5 }
  // Add more rows as needed
};

// --- Calendar Generation ---
function generateCalendar() {
  if (!calendar) return;
  calendar.innerHTML = "";

  days.forEach(day => {
    const col = document.createElement("div");
    col.className = "calendar-day";

    times.forEach(time => {
      const slot = document.createElement("div");
      slot.className = "time-slot";
      slot.dataset.day = day;
      slot.dataset.time = time;
      slot.textContent = `${day} ${time}`;

      slot.addEventListener("click", () => {
        const existing = events.find(e => e.day === day && isTimeInRange(time, e.startTime, e.endTime));
        if (existing) {
          openModalWithEvent(existing);
        } else {
          selectedSlot = slot;
          document.getElementById("startTime").value = time;
          document.getElementById("endTime").value = time;
          openModal();
        }
      });

      col.appendChild(slot);
    });

    calendar.appendChild(col);
  });

  fetchEventsForUser();
}

function isTimeInRange(time, start, end) {
  return time >= start && time < end;
}

function renderAllEvents() {
  if (!calendar) return;

  document.querySelectorAll(".time-slot").forEach(slot => {
    slot.classList.remove("blocked");
    slot.textContent = `${slot.dataset.day} ${slot.dataset.time}`;
  });

  events.forEach(ev => {
    const affectedSlots = Array.from(document.querySelectorAll(`.time-slot[data-day="${ev.day}"]`))
      .filter(slot => isTimeInRange(slot.dataset.time, ev.startTime, ev.endTime));

    affectedSlots.forEach((slot, index) => {
      slot.classList.add("blocked");
      slot.textContent = index === 0 ? ev.name : "";
    });
  });
}

function fetchEventsForUser() {
  if (!currentUser) return;

  db.collection("events")
    .where("userId", "==", currentUser.uid)
    .get()
    .then(snapshot => {
      events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderAllEvents();
    });
}

// --- Modal Logic ---
function openModal() {
  editingEventId = null;
  modal.classList.remove("hidden");
}

function openModalWithEvent(eventData) {
  editingEventId = eventData.id;
  document.getElementById("eventName").value = eventData.name;
  document.getElementById("startLocation").value = getSiteByPostcode(eventData.startPostcode);
  document.getElementById("endLocation").value = getSiteByPostcode(eventData.endPostcode);
  document.getElementById("purpose").value = eventData.purpose;
  document.getElementById("journeyType").value = eventData.type;
  document.getElementById("startTime").value = eventData.startTime;
  document.getElementById("endTime").value = eventData.endTime;
  modal.classList.remove("hidden");
}

function getSiteByPostcode(postcode) {
  return Object.keys(sitePostcodes).find(site => sitePostcodes[site] === postcode) || "";
}

if (closeModal) {
  closeModal.onclick = () => {
    modal.classList.add("hidden");
    editingEventId = null;
  };
}

// --- Save Event to Firestore ---
if (saveEvent) {
  saveEvent.onclick = async () => {
    const name = document.getElementById("eventName").value;
    const start = document.getElementById("startLocation").value;
    const end = document.getElementById("endLocation").value;
    const purpose = document.getElementById("purpose").value;
    const type = document.getElementById("journeyType").value;
    const startTime = document.getElementById("startTime").value;
    const endTime = document.getElementById("endTime").value;
    const day = selectedSlot ? selectedSlot.dataset.day : events.find(e => e.id === editingEventId)?.day;

    if (!day || !currentUser) return alert("Missing data or user.");

    const startPostcode = sitePostcodes[start] || "N/A";
    const endPostcode = sitePostcodes[end] || "N/A";
    const miles = siteDistances[start]?.[end] ?? "TBD";

    const newEvent = {
      userId: currentUser.uid,
      name,
      startPostcode,
      endPostcode,
      destination: end,
      purpose,
      type,
      miles,
      day,
      startTime,
      endTime
    };

    if (editingEventId) {
      await db.collection("events").doc(editingEventId).set(newEvent);
    } else {
      await db.collection("events").add(newEvent);
    }

    fetchEventsForUser();
    modal.classList.add("hidden");
    editingEventId = null;
    document.querySelectorAll("#eventModal input").forEach(i => i.value = "");
  };
}

// --- Export Logic ---
function populateExportTable() {
  const tableBody = document.getElementById("exportTable")?.querySelector("tbody");
  if (!tableBody || !currentUser) return;

  db.collection("events")
    .where("userId", "==", currentUser.uid)
    .get()
    .then(snapshot => {
      tableBody.innerHTML = "";
      snapshot.forEach(doc => {
        const ev = doc.data();
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${ev.day}</td>
          <td>${ev.type}</td>
          <td>${ev.startPostcode}</td>
          <td>${ev.endPostcode}</td>
          <td>${ev.destination}</td>
          <td>${ev.purpose}</td>
          <td>${ev.miles}</td>
        `;
        tableBody.appendChild(row);
      });
    });
}

function downloadCSV() {
  if (!currentUser) return;

  db.collection("events")
    .where("userId", "==", currentUser.uid)
    .get()
    .then(snapshot => {
      if (snapshot.empty) {
        alert("No data to export.");
        return;
      }

      let csv = "Date,Type,Postcode Start,Postcode End,Destination,Purpose,Miles\n";
      snapshot.forEach(doc => {
        const ev = doc.data();
        csv += `${ev.day},${ev.type},${ev.startPostcode},${ev.endPostcode},${ev.destination},${ev.purpose},${ev.miles}\n`;
      });

      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mileage-report.csv";
      a.click();
    });
}
