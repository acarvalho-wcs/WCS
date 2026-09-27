const labels = {
  pt: {
    liveMedia: 'MÍDIA AO VIVO',
    liveRadio: 'RÁDIO AO VIVO',
    liveCamera: 'CÂMERA AO VIVO',
    playing: 'Reproduzindo',
    trying: 'Tentando stream',
    unavailable: 'Transmissão direta indisponível no momento.',
    pressPlay: 'Pressione play no controle de áudio para iniciar.',
    openSource: 'Abrir fonte original',
    snapshot: 'Imagem ao vivo / snapshot',
    embedNotice: 'Transmissão incorporada da fonte original.',
    snapshotNotice: 'A fonte oferece uma imagem atualizada em vez de um vídeo incorporável.',
    noCameraEmbed: 'Esta câmera não oferece um stream incorporável verificável. A fonte original continua disponível.',
    minimize: 'Minimizar',
    restore: 'Restaurar',
    close: 'Fechar',
    provider: 'Fonte'
  },
  en: {
    liveMedia: 'LIVE MEDIA',
    liveRadio: 'LIVE RADIO',
    liveCamera: 'LIVE CAMERA',
    playing: 'Playing',
    trying: 'Trying stream',
    unavailable: 'Direct stream is currently unavailable.',
    pressPlay: 'Press play in the audio controls to start.',
    openSource: 'Open original source',
    snapshot: 'Live image / snapshot',
    embedNotice: 'Embedded transmission from the original source.',
    snapshotNotice: 'The source provides an updated image rather than an embeddable video stream.',
    noCameraEmbed: 'This camera does not expose a verifiable embeddable stream. The original source remains available.',
    minimize: 'Minimize',
    restore: 'Restore',
    close: 'Close',
    provider: 'Source'
  },
  es: {
    liveMedia: 'MEDIOS EN VIVO',
    liveRadio: 'RADIO EN VIVO',
    liveCamera: 'CÁMARA EN VIVO',
    playing: 'Reproduciendo',
    trying: 'Probando stream',
    unavailable: 'La transmisión directa no está disponible en este momento.',
    pressPlay: 'Pulse play en los controles de audio para iniciar.',
    openSource: 'Abrir fuente original',
    snapshot: 'Imagen en vivo / snapshot',
    embedNotice: 'Transmisión incorporada desde la fuente original.',
    snapshotNotice: 'La fuente ofrece una imagen actualizada en lugar de un video incorporable.',
    noCameraEmbed: 'Esta cámara no expone un stream incorporable verificable. La fuente original sigue disponible.',
    minimize: 'Minimizar',
    restore: 'Restaurar',
    close: 'Cerrar',
    provider: 'Fuente'
  }
};

let mode = null;
let currentId = null;
let currentAudio = null;
let snapshotTimer = null;
let minimized = false;

const $ = (selector) => document.querySelector(selector);

function lang() {
  const saved = localStorage.getItem('amazon-observatory-language');
  return ['pt', 'en', 'es'].includes(saved) ? saved : 'pt';
}

function l() {
  return labels[lang()] || labels.pt;
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[char]));
}

function stopCurrentMedia() {
  if (currentAudio) {
    try { currentAudio.pause(); } catch {}
    currentAudio.removeAttribute('src');
    try { currentAudio.load(); } catch {}
    currentAudio = null;
  }
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
}

function sourceLink(url) {
  if (!url) return '';
  return '<a class="media-dock-source" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">↗ ' + esc(l().openSource) + '</a>';
}

function setHeader(kicker, title, meta = '') {
  $('#media-dock-kicker').textContent = kicker;
  $('#media-dock-title').textContent = title || '—';
  $('#media-dock-meta').textContent = meta || '';
}

function showDock() {
  const dock = $('#media-dock');
  if (!dock) return;
  dock.hidden = false;
  dock.classList.toggle('minimized', minimized);
  syncButtons();
}

function syncButtons() {
  const min = $('#media-dock-minimize');
  const close = $('#media-dock-close');
  if (min) {
    min.textContent = minimized ? '+' : '—';
    min.setAttribute('aria-label', minimized ? l().restore : l().minimize);
    min.title = minimized ? l().restore : l().minimize;
  }
  if (close) {
    close.setAttribute('aria-label', l().close);
    close.title = l().close;
  }
}

async function playRadio(radio) {
  stopCurrentMedia();
  mode = 'radio';
  currentId = radio.id || radio.name || null;
  minimized = false;
  showDock();

  const meta = [radio.city, radio.state, radio.country].filter(Boolean).join(' • ');
  setHeader(l().liveRadio, radio.name || '—', meta);

  const body = $('#media-dock-body');
  if (!body) return;

  const streams = Array.isArray(radio.streams) && radio.streams.length
    ? radio.streams
    : (radio.stream_url ? [{ stream_url: radio.stream_url, provider: radio.stream_provider || radio.provider }] : []);

  if (!streams.length) {
    body.innerHTML = '<div class="media-dock-empty">' + esc(l().unavailable) + '</div>' + sourceLink(radio.url);
    return;
  }

  body.innerHTML = '<div class="media-radio-card"><div id="media-radio-status" class="media-radio-status">' + esc(l().trying) + '…</div><audio id="media-radio-audio" class="media-radio-audio" controls preload="auto"></audio></div>' + sourceLink(radio.url);

  const audio = $('#media-radio-audio');
  const status = $('#media-radio-status');
  if (!audio || !status) return;
  currentAudio = audio;

  let index = -1;

  const tryStream = async (nextIndex) => {
    if (nextIndex >= streams.length) {
      status.textContent = l().unavailable;
      return;
    }
    index = nextIndex;
    const candidate = streams[index];
    const url = candidate.stream_url || candidate.url;
    if (!url) return tryStream(index + 1);

    audio.src = url;
    status.textContent = l().trying + ' ' + (index + 1) + '/' + streams.length + (candidate.provider ? ' · ' + candidate.provider : '');

    try {
      await audio.play();
      status.textContent = l().playing + (candidate.provider ? ' · ' + candidate.provider : '');
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        status.textContent = l().pressPlay;
      } else {
        return tryStream(index + 1);
      }
    }
  };

  audio.addEventListener('error', () => {
    if (currentAudio === audio) tryStream(index + 1);
  });

  await tryStream(0);
}

function showCamera(camera) {
  stopCurrentMedia();
  mode = 'camera';
  currentId = camera.id || null;
  minimized = false;
  showDock();

  const name = camera.name?.[lang()] || camera.name?.pt || camera.name?.en || camera.name?.es || camera.name || '—';
  const meta = [camera.city, camera.state, camera.country].filter(Boolean).join(' • ');
  setHeader(l().liveCamera, name, meta);

  const body = $('#media-dock-body');
  if (!body) return;

  const original = camera.original_url || camera.public_url || camera.url || '';
  if (camera.embed_url) {
    body.innerHTML = '<div class="media-camera-frame"><iframe src="' + esc(camera.embed_url) + '" title="' + esc(name) + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe></div><div class="media-dock-note">' + esc(l().embedNotice) + '</div>' + sourceLink(original);
    return;
  }

  if (camera.snapshot_url) {
    const base = camera.snapshot_url;
    body.innerHTML = '<div class="media-camera-frame snapshot"><img id="media-camera-snapshot" src="' + esc(base) + '" alt="' + esc(name) + '" /></div><div class="media-dock-note">' + esc(l().snapshotNotice) + '</div>' + sourceLink(original);
    const img = $('#media-camera-snapshot');
    snapshotTimer = setInterval(() => {
      if (!img || currentId !== (camera.id || null)) return;
      try {
        const url = new URL(base, window.location.href);
        url.searchParams.set('_ts', Date.now());
        img.src = url.href;
      } catch {}
    }, 20000);
    return;
  }

  body.innerHTML = '<div class="media-dock-empty">' + esc(l().noCameraEmbed) + '</div>' + sourceLink(original);
}

function closeDock() {
  stopCurrentMedia();
  mode = null;
  currentId = null;
  const dock = $('#media-dock');
  if (dock) dock.hidden = true;
}

function toggleMinimize() {
  minimized = !minimized;
  const dock = $('#media-dock');
  if (dock) dock.classList.toggle('minimized', minimized);
  syncButtons();
}

window.AmazonMediaDock = {
  openRadio: (radio) => playRadio(radio),
  openCamera: (camera) => showCamera(camera),
  close: closeDock
};

$('#media-dock-close')?.addEventListener('click', closeDock);
$('#media-dock-minimize')?.addEventListener('click', toggleMinimize);

document.querySelectorAll('.lang').forEach((button) => {
  button.addEventListener('click', () => window.setTimeout(syncButtons, 0));
});

syncButtons();
