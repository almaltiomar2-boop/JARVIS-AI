const THREE_MODULE = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";
const MAX_COMMAND_LENGTH = 2000;
const PREFERS_REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const ui = {
  connectionLabel: document.querySelector("#connection-label"),
  statusDot: document.querySelector("#status-dot"),
  serverState: document.querySelector("#server-state"),
  latency: document.querySelector("#latency"),
  lastCheck: document.querySelector("#last-check"),
  meter: document.querySelector("#connection-meter"),
  brainState: document.querySelector("#brain-state"),
  brainDetail: document.querySelector("#brain-detail"),
  sceneLive: document.querySelector("#scene-live"),
  sceneLiveLabel: document.querySelector("#scene-live-label"),
  sceneClock: document.querySelector("#scene-clock"),
  renderState: document.querySelector("#render-state"),
  sceneStatus: document.querySelector("#scene-status"),
  sceneFallback: document.querySelector("#scene-fallback"),
  localTime: document.querySelector("#local-time"),
  messages: document.querySelector("#messages"),
  form: document.querySelector("#command-form"),
  input: document.querySelector("#command-input"),
  sendButton: document.querySelector("#send-button"),
  formStatus: document.querySelector("#form-status"),
  micButton: document.querySelector("#mic-button"),
  voiceState: document.querySelector("#voice-state"),
  voiceNote: document.querySelector("#voice-note"),
  voiceCard: document.querySelector(".voice-card"),
  voiceOutputToggle: document.querySelector("#voice-output-toggle"),
};

let voiceOutputEnabled = false;
let recognition = null;
let sceneController = null;

function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat("ar-JO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function updateClock() {
  const value = formatClock();
  ui.localTime.textContent = value;
  ui.sceneClock.textContent = `LOCAL / ${value}`;
}

function setConnectionState(online, latencyMs = null) {
  ui.statusDot.classList.toggle("online", online);
  ui.statusDot.classList.toggle("offline", !online);
  ui.connectionLabel.textContent = online ? "الخادم متصل" : "الخادم غير متصل";
  ui.serverState.textContent = online ? "متصل" : "غير متصل";
  ui.serverState.style.color = online ? "var(--cyan-bright)" : "var(--red)";
  ui.sceneLive.classList.toggle("online", online);
  ui.sceneLiveLabel.textContent = online ? "اتصال حي" : "بانتظار الاتصال";
  ui.lastCheck.textContent = formatClock();

  if (online && Number.isFinite(latencyMs)) {
    ui.latency.textContent = String(Math.round(latencyMs));
    const strength = Math.max(14, Math.min(100, 100 - Math.max(0, latencyMs - 80) * 0.6));
    ui.meter.style.width = `${strength}%`;
  } else {
    ui.latency.textContent = "—";
    ui.meter.style.width = "4%";
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
  } finally {
    window.clearTimeout(timer);
  }
}

async function checkServer() {
  const startedAt = performance.now();
  try {
    const response = await fetchWithTimeout("/health");
    const payload = await response.json();
    const online = response.ok && payload.healthy === true;
    const latency = performance.now() - startedAt;
    setConnectionState(online, latency);

    if (online) {
      ui.formStatus.textContent = "واجهة الأوامر متصلة بالخادم";
      if (sceneController) sceneController.setOnline(true);
      await refreshBrainStatus();
    } else {
      ui.formStatus.textContent = "تعذر تأكيد صحة الخادم";
      if (sceneController) sceneController.setOnline(false);
    }
  } catch {
    setConnectionState(false);
    ui.formStatus.textContent = "تعذر الوصول إلى API المشروع";
    if (sceneController) sceneController.setOnline(false);
  }
}

async function refreshBrainStatus() {
  try {
    const response = await fetchWithTimeout("/status");
    if (!response.ok) throw new Error("Status endpoint unavailable");
    const status = await response.json();
    const isRuleBased = status.brain_mode === "rules" || status.brain === "RULE_BASED";
    if (isRuleBased) {
      ui.brainState.textContent = "قواعد محلية";
      ui.brainDetail.textContent = "لا يوجد نموذج ذكاء اصطناعي موصول";
    } else if (status.model_configured === true) {
      ui.brainState.textContent = "نموذج موصول";
      ui.brainDetail.textContent = "تم الإبلاغ عن إعداد النموذج من الخادم";
    } else {
      ui.brainState.textContent = status.brain || "حالة غير معروفة";
      ui.brainDetail.textContent = "حالة الخادم لا تؤكد اتصال نموذج ذكاء";
    }
  } catch {
    ui.brainState.textContent = "تعذر قراءة الحالة";
    ui.brainDetail.textContent = "تأكد من نقطة /status";
  }
}

function addMessage(kind, text, { allowSpeech = false } = {}) {
  const article = document.createElement("article");
  article.className = `message message-${kind}`;

  const avatar = document.createElement("span");
  avatar.className = "message-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = kind === "user" ? "أ" : "J";

  const body = document.createElement("div");
  body.className = "message-body";
  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = kind === "user" ? "أنت" : "J.A.R.V.I.S.";
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  body.append(label, paragraph);

  if (allowSpeech && "speechSynthesis" in window) {
    const speakButton = document.createElement("button");
    speakButton.type = "button";
    speakButton.className = "speak-message";
    speakButton.textContent = "استمع";
    speakButton.addEventListener("click", () => speak(text));
    label.append(speakButton);
  }

  article.append(avatar, body);
  ui.messages.append(article);
  ui.messages.scrollTop = ui.messages.scrollHeight;
  if (kind === "assistant" && voiceOutputEnabled) speak(text);
}

async function sendCommand(command) {
  const cleanCommand = command.trim();
  if (!cleanCommand) return;
  if (cleanCommand.length > MAX_COMMAND_LENGTH) {
    addMessage("assistant", "الأمر أطول من الحد المسموح به (2000 حرف).", { allowSpeech: false });
    return;
  }

  addMessage("user", cleanCommand);
  ui.input.value = "";
  ui.sendButton.disabled = true;
  ui.formStatus.textContent = "جارٍ إرسال الأمر إلى الخادم…";

  try {
    const response = await fetchWithTimeout("/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: cleanCommand }),
    }, 15000);
    const payload = await response.json();

    if (!response.ok) {
      const detail = typeof payload.detail === "string" ? payload.detail : `HTTP ${response.status}`;
      throw new Error(detail);
    }
    if (payload.success !== true) {
      addMessage("assistant", payload.message || "لم يتم قبول الأمر.", { allowSpeech: true });
    } else {
      addMessage("assistant", String(payload.response ?? "وصل الأمر إلى الخادم دون رد نصي."), { allowSpeech: true });
    }
    ui.formStatus.textContent = "تم استلام رد الخادم";
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "انتهت مهلة الاتصال. تحقق من أن الخادم يعمل."
      : `تعذر إرسال الأمر: ${error instanceof Error ? error.message : "خطأ غير معروف"}`;
    addMessage("assistant", message, { allowSpeech: false });
    ui.formStatus.textContent = "لم يصل رد من الخادم";
  } finally {
    ui.sendButton.disabled = false;
    ui.input.focus();
  }
}

function configureVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    ui.micButton.disabled = true;
    ui.voiceState.textContent = "الإملاء غير مدعوم";
    ui.voiceNote.textContent = "استخدم حقل الكتابة؛ هذا المتصفح لا يوفّر Web Speech API.";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "ar-JO";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.addEventListener("start", () => {
    ui.voiceCard.classList.add("listening");
    ui.micButton.classList.add("listening");
    ui.voiceState.textContent = "أستمع الآن…";
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (transcript) {
      ui.input.value = transcript.slice(0, MAX_COMMAND_LENGTH);
      ui.input.focus();
      ui.voiceState.textContent = "تم تحويل الصوت إلى نص";
      ui.formStatus.textContent = "راجع النص ثم اضغط إرسال";
    }
  });

  recognition.addEventListener("error", (event) => {
    ui.voiceState.textContent = event.error === "not-allowed" ? "إذن الميكروفون مرفوض" : "تعذر الإملاء الصوتي";
    ui.voiceNote.textContent = "يمكنك متابعة استخدام حقل الكتابة.";
  });

  recognition.addEventListener("end", () => {
    ui.voiceCard.classList.remove("listening");
    ui.micButton.classList.remove("listening");
    if (ui.voiceState.textContent === "أستمع الآن…") ui.voiceState.textContent = "انتهى الاستماع";
  });

  ui.voiceState.textContent = "الإملاء الصوتي متاح";
  ui.voiceNote.textContent = "اضغط الميكروفون؛ راجع النص قبل إرساله إلى الخادم.";
  ui.micButton.addEventListener("click", () => {
    try {
      recognition.start();
    } catch {
      ui.voiceState.textContent = "انتظر حتى ينتهي الطلب السابق";
    }
  });
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    ui.voiceState.textContent = "الرد الصوتي غير مدعوم";
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ar-JO";
  utterance.rate = 0.96;
  window.speechSynthesis.speak(utterance);
}

function makeEarthTexture(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#062642";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(93, 228, 239, .22)";
  ctx.lineWidth = 2;
  for (let x = 0; x <= canvas.width; x += 128) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  const land = "rgba(69, 203, 167, .9)";
  const continents = [
    [[120,90],[205,55],[285,83],[300,128],[262,166],[241,224],[200,230],[177,181],[138,160]],
    [[275,228],[319,252],[338,323],[315,389],[285,352],[267,292]],
    [[460,115],[505,90],[542,106],[535,137],[488,146]],
    [[470,155],[536,154],[558,207],[527,279],[501,321],[477,265],[454,203]],
    [[531,104],[623,64],[733,82],[788,120],[756,170],[694,164],[669,210],[617,190],[580,149]],
    [[723,247],[777,243],[803,272],[775,297],[737,284]],
  ];
  for (const points of continents) {
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fillStyle = land;
    ctx.fill();
    ctx.strokeStyle = "rgba(145, 255, 223, .4)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createHelmet(THREE) {
  const group = new THREE.Group();
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x173745, metalness: 0.82, roughness: 0.28, emissive: 0x06151b,
  });
  const faceMetal = new THREE.MeshStandardMaterial({
    color: 0x36828d, metalness: 0.72, roughness: 0.24, emissive: 0x06252c,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x6de4f3 });
  const visorMaterial = new THREE.MeshBasicMaterial({
    color: 0x9bf6ff, transparent: true, opacity: 0.88, side: THREE.DoubleSide,
  });

  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.72, 40, 28), darkMetal);
  crown.scale.set(0.9, 1.12, 0.66);
  crown.position.y = 0.18;
  group.add(crown);

  const faceShape = new THREE.Shape();
  faceShape.moveTo(-0.48, 0.47);
  faceShape.lineTo(0.48, 0.47);
  faceShape.lineTo(0.46, -0.12);
  faceShape.lineTo(0.28, -0.59);
  faceShape.lineTo(0, -0.76);
  faceShape.lineTo(-0.28, -0.59);
  faceShape.lineTo(-0.46, -0.12);
  faceShape.closePath();
  const face = new THREE.Mesh(
    new THREE.ExtrudeGeometry(faceShape, { depth: 0.13, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.035, bevelThickness: 0.035 }),
    faceMetal,
  );
  face.position.set(0, -0.02, 0.37);
  group.add(face);

  const visor = new THREE.Shape();
  visor.moveTo(-0.39, 0.22);
  visor.lineTo(-0.08, 0.28);
  visor.lineTo(-0.12, 0.15);
  visor.lineTo(-0.4, 0.1);
  visor.closePath();
  const eyeLeft = new THREE.Mesh(new THREE.ShapeGeometry(visor), visorMaterial);
  eyeLeft.position.set(0, -0.02, 0.53);
  group.add(eyeLeft);
  const eyeRight = eyeLeft.clone();
  eyeRight.scale.x = -1;
  group.add(eyeRight);

  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.025, 0.035), glowMaterial);
  brow.position.set(0, 0.36, 0.55);
  group.add(brow);
  const chinLine = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.018, 0.025), glowMaterial);
  chinLine.position.set(0, -0.5, 0.52);
  group.add(chinLine);

  const templeGeometry = new THREE.CylinderGeometry(0.13, 0.13, 0.1, 24);
  for (const side of [-1, 1]) {
    const temple = new THREE.Mesh(templeGeometry, darkMetal);
    temple.rotation.z = Math.PI / 2;
    temple.position.set(side * 0.61, 0.02, 0.05);
    group.add(temple);

    const templeLight = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 6, 24), glowMaterial);
    templeLight.position.set(side * 0.68, 0.02, 0.05);
    templeLight.rotation.y = Math.PI / 2;
    group.add(templeLight);
  }

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.SphereGeometry(0.72, 18, 12)),
    new THREE.LineBasicMaterial({ color: 0x65d9e8, transparent: true, opacity: 0.32 }),
  );
  outline.scale.set(0.9, 1.12, 0.66);
  outline.position.y = 0.18;
  group.add(outline);
  return group;
}

async function initScene() {
  const canvas = document.querySelector("#scene");
  try {
    const THREE = await import(THREE_MODULE);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0, 0, 5.4);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    scene.add(new THREE.HemisphereLight(0x9ceeff, 0x07111a, 1.6));
    const keyLight = new THREE.DirectionalLight(0x73efff, 2.4);
    keyLight.position.set(2, 3, 5);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x228fa8, 18, 10);
    rimLight.position.set(-3, 1, 1);
    scene.add(rimLight);

    const helmet = createHelmet(THREE);
    helmet.position.set(-0.34, 0.02, 0.14);
    helmet.scale.setScalar(1.06);
    scene.add(helmet);

    const orbitMaterial = new THREE.MeshBasicMaterial({ color: 0x66dce9, transparent: true, opacity: 0.22 });
    const orbitA = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.006, 4, 180), orbitMaterial);
    orbitA.rotation.set(1.16, 0.28, 0.05);
    orbitA.position.x = -0.3;
    scene.add(orbitA);
    const orbitB = new THREE.Mesh(new THREE.TorusGeometry(1.31, 0.005, 4, 160), new THREE.MeshBasicMaterial({ color: 0x9c8cff, transparent: true, opacity: 0.2 }));
    orbitB.rotation.set(0.62, -0.42, 0.75);
    orbitB.position.x = -0.3;
    scene.add(orbitB);

    const globeMaterial = new THREE.MeshPhongMaterial({
      map: makeEarthTexture(THREE), shininess: 28, specular: 0x80e8ee,
    });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.43, 48, 32), globeMaterial);
    globe.position.set(1.22, -0.91, 0.12);
    scene.add(globe);
    const globeHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.004, 4, 100),
      new THREE.MeshBasicMaterial({ color: 0x68dfea, transparent: true, opacity: 0.4 }),
    );
    globeHalo.position.copy(globe.position);
    globeHalo.rotation.x = 1.03;
    scene.add(globeHalo);

    const starsGeometry = new THREE.BufferGeometry();
    const starPositions = [];
    for (let i = 0; i < 180; i += 1) {
      starPositions.push((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2 - 1.5);
    }
    starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0x7ceaf5, size: 0.012, transparent: true, opacity: 0.65 }));
    scene.add(stars);

    const resizeObserver = new ResizeObserver(() => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.x = width < 520 ? 0.12 : 0;
      camera.updateProjectionMatrix();
      const mobile = width < 520;
      helmet.scale.setScalar(mobile ? 0.9 : 1.06);
      globe.position.set(mobile ? 0.86 : 1.22, mobile ? -0.9 : -0.91, 0.12);
      globe.scale.setScalar(mobile ? 0.78 : 1);
      globeHalo.position.copy(globe.position);
      globeHalo.scale.copy(globe.scale);
    });
    resizeObserver.observe(canvas);

    let frame = 0;
    let visible = true;
    let online = false;
    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!visible) return;
      const time = clock.getElapsedTime();
      if (!PREFERS_REDUCED_MOTION) {
        helmet.rotation.y = Math.sin(time * 0.22) * 0.09;
        helmet.position.y = 0.02 + Math.sin(time * 0.72) * 0.035;
        orbitA.rotation.z += 0.00065;
        orbitB.rotation.y += 0.00045;
        globe.rotation.y += 0.0015;
        globeHalo.rotation.z -= 0.001;
        stars.rotation.y += 0.00008;
      }
      const target = online ? 0.34 : 0.17;
      orbitA.material.opacity += (target - orbitA.material.opacity) * 0.03;
      renderer.render(scene, camera);
    };
    animate();
    document.addEventListener("visibilitychange", () => { visible = !document.hidden; });

    ui.sceneFallback.hidden = true;
    ui.renderState.textContent = "المشهد ثلاثي الأبعاد نشط";
    ui.sceneStatus.textContent = "المشهد يعمل";

    sceneController = {
      setOnline(value) { online = Boolean(value); },
      dispose() {
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        renderer.dispose();
        globeMaterial.map?.dispose();
      },
    };
  } catch (error) {
    ui.sceneFallback.hidden = false;
    ui.renderState.textContent = "عرض بديل";
    ui.sceneStatus.textContent = "رسوم بديلة";
    ui.voiceNote.textContent = ui.voiceNote.textContent || "";
    console.warn("3D scene could not be initialized.", error);
  }
}

ui.form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendCommand(ui.input.value);
});

ui.voiceOutputToggle.addEventListener("click", () => {
  voiceOutputEnabled = !voiceOutputEnabled;
  ui.voiceOutputToggle.setAttribute("aria-pressed", String(voiceOutputEnabled));
  ui.voiceOutputToggle.innerHTML = `<span class="toggle-indicator" aria-hidden="true"></span>${voiceOutputEnabled ? "الرد الصوتي مفعّل" : "الرد الصوتي متوقف"}`;
});

updateClock();
window.setInterval(updateClock, 1000);
configureVoice();
checkServer();
window.setInterval(checkServer, 12000);
initScene();

window.addEventListener("beforeunload", () => {
  if (recognition) recognition.abort();
  if (sceneController) sceneController.dispose();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
});
