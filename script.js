/* ============================================================
   Pinares Altoverde School — Lector de Oraciones en Pictogramas
   1. Consulta la API pública de ARASAAC (https://arasaac.org) para
      convertir cada palabra de una oración en su pictograma.
   2. Lee la oración en voz alta usando la Web Speech API del
      navegador, eligiendo automáticamente la voz en español más
      natural disponible en el dispositivo del docente.
   ============================================================ */

const ARASAAC_LANGUAGE = "es";
const ARASAAC_SEARCH_URL = (word) =>
  `https://api.arasaac.org/v1/pictograms/${ARASAAC_LANGUAGE}/bestsearch/${encodeURIComponent(word)}`;
const ARASAAC_IMAGE_URL = (id) =>
  `https://static.arasaac.org/pictograms/${id}/${id}_500.png`;
const ARASAAC_DOWNLOAD_URL = (id) =>
  `https://api.arasaac.org/v1/pictograms/${id}?download=true`;

const form = document.getElementById("search-form");
const input = document.getElementById("search-input");
const resultArea = document.getElementById("result-area");
const chips = document.querySelectorAll(".chip");

let currentSentence = "";
let availableVoices = [];

/* ---------------------------------------------------------
   Búsqueda de pictogramas
   --------------------------------------------------------- */

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const sentence = input.value.trim();
  if (sentence) buscarOracion(sentence);
});

chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const phrase = chip.dataset.word;
    input.value = phrase;
    buscarOracion(phrase);
  });
});

function tokenizar(sentence) {
  return sentence
    .split(/\s+/)
    .map((raw) => raw.replace(/^[¿¡"'“”«»(.,;:!?)]+|["'“”«»(.,;:!?)]+$/g, ""))
    .filter((word) => word.length > 0);
}

async function buscarOracion(sentence) {
  detenerLectura();
  currentSentence = sentence;
  const words = tokenizar(sentence);

  if (words.length === 0) return;

  mostrarCargando();

  const busquedas = words.map((word) => buscarPalabra(word));
  const resultados = await Promise.all(busquedas);

  renderResultado(sentence, resultados);
}

async function buscarPalabra(word) {
  try {
    const response = await fetch(ARASAAC_SEARCH_URL(word));
    if (!response.ok) throw new Error(`Estado ${response.status}`);
    const data = await response.json();
    return { word, opciones: Array.isArray(data) ? data.slice(0, 6) : [] };
  } catch (error) {
    console.error(`Error buscando "${word}":`, error);
    return { word, opciones: [] };
  }
}

function mostrarCargando() {
  resultArea.innerHTML = `
    <p class="state-message">Buscando los pictogramas de tu oración…</p>
  `;
}

function renderResultado(sentence, resultados) {
  const tilesHtml = resultados
    .map((item, index) => renderTile(item, index))
    .join("");

  resultArea.innerHTML = `
    <div class="sentence-result">
      <div class="pine-row" aria-hidden="true">
        <span class="pine"></span>
        <span class="pine"></span>
        <span class="pine"></span>
      </div>
      <div class="pictogram-strip" id="pictogram-strip">
        ${tilesHtml}
      </div>
      <div class="voice-bar">
        <button type="button" id="speak-btn" class="speak-btn">🔊 Leer en voz alta</button>
        <select id="voice-select" class="voice-select" aria-label="Elegir voz"></select>
        <select id="rate-select" class="rate-select" aria-label="Elegir velocidad de lectura">
          <option value="0.8">Velocidad lenta</option>
          <option value="1" selected>Velocidad normal</option>
        </select>
        <button type="button" id="print-btn" class="print-btn">Imprimir</button>
      </div>
      <p id="voice-note" class="voice-note"></p>
    </div>
  `;

  document.querySelectorAll(".picto-tile.has-alt").forEach((tile) => {
    tile.addEventListener("click", () => ciclarAlternativa(tile));
  });

  document.querySelectorAll(".picto-tile[data-ids]").forEach((tile) => {
    tile.querySelector(".picto-zoom-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      abrirZoom(tile);
    });
    tile.querySelector(".picto-download-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      descargarPictograma(idActual(tile), tile.dataset.word);
    });
  });

  document.getElementById("print-btn").addEventListener("click", () => window.print());
  document.getElementById("speak-btn").addEventListener("click", alternarLectura);

  poblarVoces();
}

function renderTile(item, index) {
  const { word, opciones } = item;

  if (opciones.length === 0) {
    return `
      <div class="picto-tile no-picto">
        <div class="no-picto-icon">✎</div>
        <p class="picto-word">${escapeHtml(word)}</p>
      </div>
    `;
  }

  const idPrincipal = opciones[0]._id;
  const tieneAlternativas = opciones.length > 1;

  return `
    <div class="picto-tile ${tieneAlternativas ? "has-alt" : ""}"
         data-word-index="${index}"
         data-current="0"
         data-ids='${JSON.stringify(opciones.map((o) => o._id))}'
         data-word="${escapeHtml(word)}"
         ${tieneAlternativas ? `title="Clic para ver otra opción (1/${opciones.length})"` : ""}>
      <img src="${ARASAAC_IMAGE_URL(idPrincipal)}" alt="Pictograma de ${escapeHtml(word)}">
      <p class="picto-word">${escapeHtml(word)}</p>
      ${tieneAlternativas ? `<p class="picto-alt-hint">1 / ${opciones.length} · clic para cambiar</p>` : ""}
      <div class="picto-actions">
        <button type="button" class="picto-action picto-zoom-btn" aria-label="Ampliar pictograma de ${escapeHtml(word)}" title="Ampliar">🔍</button>
        <button type="button" class="picto-action picto-download-btn" aria-label="Descargar pictograma de ${escapeHtml(word)}" title="Descargar">⬇</button>
      </div>
    </div>
  `;
}

function ciclarAlternativa(tile) {
  const ids = JSON.parse(tile.dataset.ids);
  let current = parseInt(tile.dataset.current, 10);
  current = (current + 1) % ids.length;
  tile.dataset.current = current;

  const img = tile.querySelector("img");
  img.src = ARASAAC_IMAGE_URL(ids[current]);

  const hint = tile.querySelector(".picto-alt-hint");
  if (hint) hint.textContent = `${current + 1} / ${ids.length} · clic para cambiar`;
  tile.title = `Clic para ver otra opción (${current + 1}/${ids.length})`;
}

function idActual(tile) {
  const ids = JSON.parse(tile.dataset.ids);
  return ids[parseInt(tile.dataset.current, 10)];
}

/* ---------------------------------------------------------
   Descarga de pictogramas
   --------------------------------------------------------- */

async function descargarPictograma(id, word) {
  const nombre = `${nombreArchivo(word)}_arasaac_${id}.png`;
  try {
    const response = await fetch(ARASAAC_IMAGE_URL(id));
    if (!response.ok) throw new Error(`Estado ${response.status}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    dispararDescarga(url, nombre);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    // Si el navegador bloquea la descarga directa, usamos el enlace de descarga de ARASAAC.
    console.warn("Descarga directa no disponible, usando ARASAAC:", error);
    dispararDescarga(ARASAAC_DOWNLOAD_URL(id), nombre);
  }
}

function dispararDescarga(url, nombre) {
  const link = document.createElement("a");
  link.href = url;
  link.download = nombre;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function nombreArchivo(word) {
  return (word || "pictograma")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "pictograma";
}

/* ---------------------------------------------------------
   Zoom individual de pictogramas
   --------------------------------------------------------- */

const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.5;

const zoomModal = document.getElementById("zoom-modal");
const zoomStage = document.getElementById("zoom-stage");
const zoomImg = document.getElementById("zoom-img");
const zoomTitle = document.getElementById("zoom-title");
const zoomLevel = document.getElementById("zoom-level");

const zoomState = { scale: 1, x: 0, y: 0, id: null, word: "", trigger: null };
const punteros = new Map();
let distanciaPellizco = 0;

function abrirZoom(tile) {
  zoomState.id = idActual(tile);
  zoomState.word = tile.dataset.word;
  zoomState.trigger = document.activeElement;
  zoomImg.src = ARASAAC_IMAGE_URL(zoomState.id);
  zoomImg.alt = `Pictograma de ${zoomState.word}`;
  zoomTitle.textContent = zoomState.word;
  reiniciarZoom();
  zoomModal.hidden = false;
  document.body.classList.add("modal-open");
  zoomModal.querySelector(".zoom-close").focus();
}

function cerrarZoom() {
  zoomModal.hidden = true;
  document.body.classList.remove("modal-open");
  punteros.clear();
  if (zoomState.trigger) zoomState.trigger.focus();
}

function aplicarZoom(scale) {
  zoomState.scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
  if (zoomState.scale === ZOOM_MIN) {
    zoomState.x = 0;
    zoomState.y = 0;
  }
  limitarDesplazamiento();
  actualizarTransformacion();
}

function reiniciarZoom() {
  zoomState.scale = 1;
  zoomState.x = 0;
  zoomState.y = 0;
  actualizarTransformacion();
}

function limitarDesplazamiento() {
  const maxX = (zoomStage.clientWidth * (zoomState.scale - 1)) / 2;
  const maxY = (zoomStage.clientHeight * (zoomState.scale - 1)) / 2;
  zoomState.x = Math.min(maxX, Math.max(-maxX, zoomState.x));
  zoomState.y = Math.min(maxY, Math.max(-maxY, zoomState.y));
}

function actualizarTransformacion() {
  zoomImg.style.transform = `translate(${zoomState.x}px, ${zoomState.y}px) scale(${zoomState.scale})`;
  zoomLevel.textContent = `${Math.round(zoomState.scale * 100)}%`;
  zoomStage.classList.toggle("zoomed", zoomState.scale > 1);
}

document.getElementById("zoom-in").addEventListener("click", () => aplicarZoom(zoomState.scale + ZOOM_STEP));
document.getElementById("zoom-out").addEventListener("click", () => aplicarZoom(zoomState.scale - ZOOM_STEP));
document.getElementById("zoom-reset").addEventListener("click", reiniciarZoom);
document.getElementById("zoom-download").addEventListener("click", () =>
  descargarPictograma(zoomState.id, zoomState.word)
);

zoomModal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", cerrarZoom));

document.addEventListener("keydown", (event) => {
  if (zoomModal.hidden) return;
  if (event.key === "Escape") cerrarZoom();
  else if (event.key === "+" || event.key === "=") aplicarZoom(zoomState.scale + ZOOM_STEP);
  else if (event.key === "-") aplicarZoom(zoomState.scale - ZOOM_STEP);
  else if (event.key === "0") reiniciarZoom();
});

zoomStage.addEventListener("wheel", (event) => {
  event.preventDefault();
  aplicarZoom(zoomState.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
}, { passive: false });

zoomStage.addEventListener("dblclick", () => {
  if (zoomState.scale > 1) reiniciarZoom();
  else aplicarZoom(2.5);
});

zoomStage.addEventListener("pointerdown", (event) => {
  zoomStage.setPointerCapture(event.pointerId);
  punteros.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (punteros.size === 2) distanciaPellizco = distanciaEntrePunteros();
});

zoomStage.addEventListener("pointermove", (event) => {
  const anterior = punteros.get(event.pointerId);
  if (!anterior) return;
  punteros.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (punteros.size === 2) {
    const distancia = distanciaEntrePunteros();
    if (distanciaPellizco > 0) aplicarZoom(zoomState.scale * (distancia / distanciaPellizco));
    distanciaPellizco = distancia;
  } else if (zoomState.scale > 1) {
    zoomState.x += event.clientX - anterior.x;
    zoomState.y += event.clientY - anterior.y;
    limitarDesplazamiento();
    actualizarTransformacion();
  }
});

["pointerup", "pointercancel"].forEach((tipo) =>
  zoomStage.addEventListener(tipo, (event) => {
    punteros.delete(event.pointerId);
    distanciaPellizco = 0;
  })
);

function distanciaEntrePunteros() {
  const [a, b] = [...punteros.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/* ---------------------------------------------------------
   Lectura en voz alta (Web Speech API)
   --------------------------------------------------------- */

function poblarVoces() {
  const select = document.getElementById("voice-select");
  const note = document.getElementById("voice-note");
  if (!select) return;

  if (!("speechSynthesis" in window)) {
    document.getElementById("speak-btn").disabled = true;
    note.textContent = "Tu navegador no soporta lectura en voz alta.";
    return;
  }

  const cargar = () => {
    availableVoices = window.speechSynthesis.getVoices();
    const spanishVoices = availableVoices.filter((v) => v.lang && v.lang.toLowerCase().startsWith("es"));
    const listaFinal = spanishVoices.length > 0 ? spanishVoices : availableVoices;

    const puntuar = (voice) => {
      const name = voice.name.toLowerCase();
      let score = 0;
      if (name.includes("google")) score += 4;
      if (name.includes("natural") || name.includes("neural")) score += 4;
      if (name.includes("enhanced") || name.includes("premium")) score += 3;
      if (name.includes("microsoft")) score += 2;
      if (!voice.localService) score += 2;
      return score;
    };

    const ordenada = [...listaFinal].sort((a, b) => puntuar(b) - puntuar(a));

    select.innerHTML = ordenada
      .map((v, i) => `<option value="${i}">${escapeHtml(v.name)} (${v.lang})</option>`)
      .join("");
    select.dataset.voices = JSON.stringify(ordenada.map((v) => v.name));

    if (spanishVoices.length === 0) {
      note.textContent = "No encontramos una voz en español instalada en este dispositivo; se usará la voz predeterminada.";
    } else {
      note.textContent = "";
    }
  };

  cargar();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = cargar;
  }
}

function alternarLectura() {
  if (!("speechSynthesis" in window)) return;

  if (window.speechSynthesis.speaking) {
    detenerLectura();
    return;
  }

  const select = document.getElementById("voice-select");
  const rateSelect = document.getElementById("rate-select");
  const voiceNames = JSON.parse(select.dataset.voices || "[]");
  const chosenName = voiceNames[select.value];
  const voice = availableVoices.find((v) => v.name === chosenName);

  const utterance = new SpeechSynthesisUtterance(currentSentence);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = "es-ES";
  }
  utterance.rate = parseFloat(rateSelect.value);
  utterance.pitch = 1;

  const btn = document.getElementById("speak-btn");
  utterance.onstart = () => {
    btn.textContent = "⏸️ Detener lectura";
    btn.classList.add("speaking");
  };
  utterance.onend = utterance.onerror = () => {
    btn.textContent = "🔊 Leer en voz alta";
    btn.classList.remove("speaking");
  };

  window.speechSynthesis.speak(utterance);
}

function detenerLectura() {
  if ("speechSynthesis" in window && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
  const btn = document.getElementById("speak-btn");
  if (btn) {
    btn.textContent = "🔊 Leer en voz alta";
    btn.classList.remove("speaking");
  }
}

/* ---------------------------------------------------------
   Utilidades
   --------------------------------------------------------- */

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}