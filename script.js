const burger = document.querySelector(".burger");
const nav = document.querySelector(".nav");

function setMenu(open) {
  nav.classList.toggle("is-open", open);
  burger.setAttribute("aria-expanded", String(open));
  burger.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
}

burger.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

const BARS = 150; 
let duration = 273;

const versions = {
  v1: { lufs: -12.4, peak: -1.8, comments: [
    { time: 8, text: "интро слишком длинное?", resolved: true },
    { time: 98, text: "барабаны тихие в припеве", resolved: true },
  ] },
  v2: { lufs: -10.6, peak: -0.9, comments: [
    { time: 42, text: "вокал тонет в куплете", resolved: true },
    { time: 240, text: "реверб на хвосте слишком длинный", resolved: false },
  ] },
  v3: { lufs: -9.8, peak: -0.6, comments: [
    { time: 42, text: "вокал тонет в куплете", resolved: false },
    { time: 82, text: "бочка бубнит, подрезать низ?", resolved: false },
    { time: 240, text: "реверб добавлен, проверь", resolved: true },
  ] },
};
const LOUDEST_LUFS = -9.8;
const TARGET_LUFS = -14

let currentVersion = "v3";
let position = 0; 
let pendingTime = null;
let peaks = null;

const audio = document.getElementById("audio");
const waveEl = document.getElementById("wave");
const waveSvg = document.getElementById("wave-svg");
const cursorEl = document.getElementById("wave-cursor");
const markersEl = document.getElementById("markers");
const timeNowEl = document.getElementById("time-now");
const timeTotalEl = document.getElementById("time-total");
const playBtn = document.getElementById("play-btn");
const lufsEl = document.getElementById("stat-lufs");
const peakEl = document.getElementById("stat-peak");
const abToggle = document.getElementById("ab-toggle");
const listEl = document.getElementById("comments-list");
const countEl = document.getElementById("comments-count");
const formEl = document.getElementById("comment-form");
const inputEl = document.getElementById("comment-input");
const commentTimeEl = document.getElementById("comment-time");
const commentBtn = document.getElementById("comment-btn");
const commentBtnTime = document.getElementById("comment-btn-time");
const hoverEl = document.getElementById("wave-hover");
const hoverTimeEl = document.getElementById("wave-hover-time");
const versionBtns = document.querySelectorAll(".versions__btn");

function formatTime(sec) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatDb(value) {
  return value.toFixed(1).replace(".", ",").replace("-", "−");
}

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

function fallbackPeaks() {
  let s = 5;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: BARS }, (_, i) => {
    const t = i / BARS;
    const shape = t < 0.07 ? 0.3 : t < 0.3 ? 0.55 : t < 0.46 ? 0.92 : t < 0.7 ? 0.55 : t < 0.9 ? 1 : 0.3;
    return shape * (0.45 + 0.55 * rnd());
  });
}

async function loadRealPeaks() {
  try {
    const response = await fetch(audio.currentSrc || audio.src);
    const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await response.arrayBuffer());
    const data = buffer.getChannelData(0);
    const chunk = Math.floor(data.length / BARS);
    const result = [];
    for (let i = 0; i < BARS; i++) {
      let sum = 0, count = 0;
      for (let j = i * chunk; j < (i + 1) * chunk; j += 16) { sum += data[j] * data[j]; count++; }
      result.push(Math.sqrt(sum / count));
    }
    const sorted = [...result].sort((a, b) => a - b);
    const low = sorted[Math.floor(BARS * 0.15)], high = sorted[Math.floor(BARS * 0.97)];
    peaks = result.map((r) => {
      const v = Math.min(Math.max((r - low) / (high - low), 0), 1);
      return 0.15 + 0.85 * Math.pow(v, 1.2);
    });
    drawWave();
    renderPosition();
  } catch {
  }
}

function drawWave() {
  const source = peaks || fallbackPeaks();
  const scale = dbToGain(versions[currentVersion].lufs - LOUDEST_LUFS);
  const width = 1200, height = 100, step = width / BARS;
  const horizon = height * 0.66; // линия, от которой растут столбики
  let html = "";
  source.forEach((amp, i) => {
    const up = Math.max(2, amp * scale * horizon * 0.95);
    const down = up * 0.5;
    const x = i * step, w = step * 0.7;
    html += `<g class="bar"><rect x="${x}" y="${horizon - up}" width="${w}" height="${up}"/>` +
            `<rect class="mirror" x="${x}" y="${horizon + 1}" width="${w}" height="${down}"/></g>`;
  });
  waveSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  waveSvg.innerHTML = html;
}

function renderPosition() {
  const frac = position / duration;
  cursorEl.style.left = `${frac * 100}%`;
  timeNowEl.textContent = formatTime(position);
  commentBtnTime.textContent = formatTime(position);
  waveEl.setAttribute("aria-valuenow", String(Math.floor(position)));
  waveEl.setAttribute("aria-valuetext", formatTime(position));
  const played = Math.floor(frac * BARS);
  waveSvg.querySelectorAll(".bar").forEach((bar, i) => bar.classList.toggle("is-played", i < played));
}

function renderStats() {
  const v = versions[currentVersion];
  if (abToggle.checked) {
    const gain = TARGET_LUFS - v.lufs;
    lufsEl.textContent = `${formatDb(TARGET_LUFS)} LUFS (${formatDb(gain)} dB)`;
    audio.volume = dbToGain(TARGET_LUFS - LOUDEST_LUFS);
  } else {
    lufsEl.textContent = `${formatDb(v.lufs)} LUFS`;
    audio.volume = dbToGain(v.lufs - LOUDEST_LUFS);
  }
  peakEl.textContent = `${formatDb(v.peak)} dBTP`;
}

function renderComments(newIndex = -1) {
  const comments = versions[currentVersion].comments
    .map((c, index) => ({ ...c, index }))
    .sort((a, b) => a.time - b.time);

  markersEl.innerHTML = comments.map((c) => `
    <span class="marker${c.resolved ? " is-resolved" : ""}${c.index === newIndex ? " is-new" : ""}"
          style="left:${(c.time / duration) * 100}%"></span>`).join("");

  listEl.innerHTML = "";
  comments.forEach((c) => {
    const li = document.createElement("li");
    li.className = "comment" + (c.resolved ? " is-resolved" : "");

    const timeBtn = document.createElement("button");
    timeBtn.type = "button";
    timeBtn.className = "comment__time";
    timeBtn.textContent = formatTime(c.time);
    timeBtn.setAttribute("aria-label", `Перейти к ${formatTime(c.time)}`);
    timeBtn.addEventListener("click", () => seek(c.time));

    const text = document.createElement("span");
    text.className = "comment__text";
    text.textContent = c.text;

    const resolveBtn = document.createElement("button");
    resolveBtn.type = "button";
    resolveBtn.className = "comment__resolve";
    resolveBtn.textContent = c.resolved ? "вернуть" : "решено";
    resolveBtn.addEventListener("click", () => {
      versions[currentVersion].comments[c.index].resolved = !c.resolved;
      renderComments();
    });

    li.append(timeBtn, text, resolveBtn);
    listEl.append(li);
  });

  const open = comments.filter((c) => !c.resolved).length;
  countEl.textContent = `${comments.length} (открыто: ${open})`;
}

function selectVersion(name) {
  currentVersion = name;
  versionBtns.forEach((btn) => {
    const active = btn.dataset.version === name;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
  closeForm();
  drawWave();
  renderPosition();
  renderStats();
  renderComments();
}

function seek(sec) {
  position = Math.min(Math.max(sec, 0), duration);
  audio.currentTime = position;
  renderPosition();
}

function tick() {
  if (audio.paused) return;
  position = audio.currentTime;
  renderPosition();
  requestAnimationFrame(tick);
}

function setPlayIcon(playing) {
  playBtn.setAttribute("aria-label", playing ? "Пауза" : "Воспроизвести");
  playBtn.querySelector(".play__icon").setAttribute("d", playing ? "M7 5h4v14H7zM13 5h4v14h-4z" : "M8 5v14l11-7z");
}

function togglePlay() {
  if (audio.paused) {
    audio.play().catch(() => setPlayIcon(false));
  } else {
    audio.pause();
  }
}

audio.addEventListener("play", () => { setPlayIcon(true); requestAnimationFrame(tick); });
audio.addEventListener("pause", () => setPlayIcon(false));
audio.addEventListener("ended", () => setPlayIcon(false));
audio.addEventListener("loadedmetadata", () => {
  duration = audio.duration;
  timeTotalEl.textContent = formatTime(duration);
  waveEl.setAttribute("aria-valuemax", String(Math.floor(duration)));
  renderPosition();
  renderComments();
});

function openForm(time) {
  pendingTime = time;
  commentTimeEl.textContent = formatTime(time);
  formEl.hidden = false;
  inputEl.value = "";
  inputEl.focus();
}

function closeForm() {
  formEl.hidden = true;
  pendingTime = null;
}

function fracFromEvent(e) {
  const rect = waveEl.getBoundingClientRect();
  return Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
}

waveEl.addEventListener("click", (e) => {
  seek(fracFromEvent(e) * duration);
  if (audio.paused) togglePlay();
});

waveEl.addEventListener("mousemove", (e) => {
  const frac = fracFromEvent(e);
  waveEl.classList.add("is-hovering");
  hoverEl.style.left = `${frac * 100}%`;
  hoverTimeEl.textContent = formatTime(frac * duration);
  const hovered = Math.floor(frac * BARS);
  waveSvg.querySelectorAll(".bar").forEach((bar, i) => bar.classList.toggle("is-hover", i < hovered));
});

waveEl.addEventListener("mouseleave", () => {
  waveEl.classList.remove("is-hovering");
  waveSvg.querySelectorAll(".bar.is-hover").forEach((bar) => bar.classList.remove("is-hover"));
});

commentBtn.addEventListener("click", () => {
  audio.pause();
  openForm(Math.floor(position));
});

waveEl.addEventListener("keydown", (e) => {
  const steps = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 };
  if (e.key in steps) {
    e.preventDefault();
    seek(position + steps[e.key]);
  } else if (e.key === "Home" || e.key === "End") {
    e.preventDefault();
    seek(e.key === "Home" ? 0 : duration);
  } else if (e.key === "Enter") {
    e.preventDefault();
    audio.pause();
    openForm(Math.floor(position));
  } else if (e.key === " ") {
    e.preventDefault();
    togglePlay();
  }
});

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text || pendingTime === null) { inputEl.focus(); return; }
  const list = versions[currentVersion].comments;
  list.push({ time: pendingTime, text, resolved: false });
  closeForm();
  renderComments(list.length - 1);
  waveEl.focus();
});

document.getElementById("comment-cancel").addEventListener("click", () => { closeForm(); waveEl.focus(); });
formEl.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeForm(); waveEl.focus(); } });

playBtn.addEventListener("click", togglePlay);
abToggle.addEventListener("change", renderStats);
versionBtns.forEach((btn) => btn.addEventListener("click", () => selectVersion(btn.dataset.version)));

selectVersion(currentVersion);
loadRealPeaks();

const signupForm = document.getElementById("signup-form");
const emailInput = document.getElementById("signup-email");
const signupMsg = document.getElementById("signup-error");

function showSignupMessage(text, type) {
  signupMsg.textContent = text;
  signupMsg.className = `signup__msg is-${type}`;
}

signupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

  if (!email) {
    emailInput.setAttribute("aria-invalid", "true");
    showSignupMessage("Введите адрес электронной почты.", "error");
    emailInput.focus();
    return;
  }
  if (!isValid) {
    emailInput.setAttribute("aria-invalid", "true");
    showSignupMessage("Похоже, в адресе ошибка. Пример: you@example.com", "error");
    emailInput.focus();
    return;
  }

  emailInput.removeAttribute("aria-invalid");
  showSignupMessage(`Готово! Пришлём приглашение на ${email}, как только откроем бету.`, "success");
  signupForm.reset();
});

emailInput.addEventListener("input", () => {
  if (emailInput.getAttribute("aria-invalid")) {
    emailInput.removeAttribute("aria-invalid");
    showSignupMessage("", "error");
  }
});
