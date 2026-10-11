const homeView = document.querySelector('#homeView');
const roomView = document.querySelector('#roomView');
const entryDialog = document.querySelector('#entryDialog');
const entryForm = document.querySelector('#entryForm');
const displayNameInput = document.querySelector('#displayName');
const profilePhotoInput = document.querySelector('#profilePhotoInput');
const rememberProfileInput = document.querySelector('#rememberProfile');
const meetingNameInput = document.querySelector('#meetingName');
const inviteCodeInput = document.querySelector('#inviteCode');
const createFields = document.querySelector('#createFields');
const joinFields = document.querySelector('#joinFields');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogCopy = document.querySelector('#dialogCopy');
const dialogEyebrow = document.querySelector('#dialogEyebrow');
const entrySubmit = document.querySelector('#entrySubmit');
const roomTitle = document.querySelector('#roomTitle');
const callLayout = document.querySelector('.call-layout');
const sidePanel = document.querySelector('#sidePanel');
const peoplePanel = document.querySelector('#peoplePanel');
const chatPanel = document.querySelector('#chatPanel');
const selfVideo = document.querySelector('#selfVideo');
const selfPlaceholder = document.querySelector('#selfPlaceholder');
const toast = document.querySelector('#toast');
const leaveDialog = document.querySelector('#leaveDialog');

let dialogMode = 'create';
let activeRoomCode = '';
let activeRoomName = 'Encontro de hoje';
let activeName = '';
let activeProfilePhoto = '';
let audioStream = null;
let cameraStream = null;
let screenStream = null;
let toastTimer;
let reactionTimer;
let isRoomCreator = false;
let roomSettings = {
  microphone: true,
  camera: true,
  reactions: true,
  privateRoom: false,
  chat: true,
  showClosedChat: true,
};
let selectedParticipantId = '';
const removedParticipants = new Set();
const defaultQuickReactions = ['👏', '👍', '❤️', '😂', '🙏'];
const quickReactionStorageKey = 'entre-nos-quick-reactions';
const reactionEmojiPattern = /^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u200D\u20E3\u{E0020}-\u{E007F}#*0-9]+$/u;

function isReactionEmoji(value) {
  const emoji = value.trim();
  if (!emoji || !reactionEmojiPattern.test(emoji)) return false;
  const hasPictograph = /\p{Extended_Pictographic}/u.test(emoji);
  const hasFlag = (emoji.match(/\p{Regional_Indicator}/gu) || []).length >= 2;
  const hasKeycap = /[#*0-9]\uFE0F?\u20E3/u.test(emoji);
  if (!hasPictograph && !hasFlag && !hasKeycap) return false;
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(emoji)].length === 1;
  }
  return true;
}

function loadQuickReactions() {
  try {
    const saved = JSON.parse(localStorage.getItem(quickReactionStorageKey) || '[]');
    return [...new Set([...saved.filter(isReactionEmoji), ...defaultQuickReactions])].slice(0, 5);
  } catch {
    return [...defaultQuickReactions];
  }
}

let quickReactions = loadQuickReactions();
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3000);
}

function loadSavedProfile() {
  try {
    return JSON.parse(localStorage.getItem('entre-nos-profile') || 'null');
  } catch {
    return null;
  }
}

function updateProfilePreview(name = displayNameInput.value, photo = activeProfilePhoto) {
  const preview = document.querySelector('#profilePreview');
  preview.textContent = photo ? '' : firstLetter(name);
  preview.style.backgroundImage = photo ? `url("${photo}")` : '';
  preview.classList.toggle('has-photo', Boolean(photo));
}

function applyProfilePhoto(photo = '') {
  activeProfilePhoto = photo;
  const targets = [
    document.querySelector('#selfPlaceholder .avatar'),
    document.querySelector('#personInitial'),
    document.querySelector('.self-tile .caption-avatar'),
  ];
  targets.forEach((target) => {
    if (!target) return;
    target.style.backgroundImage = photo ? `url("${photo}")` : '';
    target.classList.toggle('has-profile-photo', Boolean(photo));
    target.textContent = photo ? '' : firstLetter(activeName);
  });
}

function resizeProfileImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Não consegui abrir essa imagem.'));
    };
    image.src = objectUrl;
  });
}

function openEntry(mode, invite = '') {
  dialogMode = mode;
  const creating = mode === 'create';
  meetingNameInput.required = creating;
  createFields.hidden = !creating;
  joinFields.hidden = creating;
  dialogEyebrow.textContent = 'FILHOS DE MARIA';
  dialogTitle.textContent = creating ? 'Abrir sala' : 'Entrar pelo convite';
  dialogCopy.textContent = creating
    ? 'Seu nome e o nome do encontro.'
    : 'Seu nome e o convite.';
  entrySubmit.innerHTML = creating
    ? 'Abrir sala <span aria-hidden="true">↗</span>'
    : 'Entrar agora <span aria-hidden="true">↗</span>';
  const savedProfile = loadSavedProfile();
  displayNameInput.value = savedProfile?.name || '';
  activeProfilePhoto = savedProfile?.photo || '';
  rememberProfileInput.checked = Boolean(savedProfile);
  profilePhotoInput.value = '';
  updateProfilePreview(displayNameInput.value, activeProfilePhoto);
  meetingNameInput.value = 'Encontro de hoje';
  inviteCodeInput.value = invite;
  if (!entryDialog.open) entryDialog.showModal();
  window.setTimeout(() => (creating ? displayNameInput : inviteCodeInput).focus(), 40);
}

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  return `EN-${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')}`;
}

function getRoomCode(raw) {
  const value = raw.trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    const queryCode = url.searchParams.get('sala');
    if (queryCode) return queryCode.toUpperCase();
  } catch {
    // The user may have pasted the short room code instead of a full link.
  }
  const match = value.match(/(?:sala=)?([a-z0-9-]{4,})/i);
  return match ? match[1].toUpperCase() : '';
}

function setRoomUrl(code, title) {
  const next = new URL(window.location.href);
  next.searchParams.set('sala', code);
  next.searchParams.set('titulo', title);
  window.history.replaceState({}, '', next);
}

function roomHostStorageKey(code) {
  return `entre-nos-host:${code.toUpperCase()}`;
}

function roomAppearanceStorageKey(code) {
  return `entre-nos-appearance:${code.toUpperCase()}`;
}

function rememberRoomHost(code) {
  try { sessionStorage.setItem(roomHostStorageKey(code), '1'); } catch { /* Browser storage may be unavailable for local files. */ }
}

function isRoomHostOnThisTab(code) {
  try { return sessionStorage.getItem(roomHostStorageKey(code)) === '1'; } catch { return false; }
}

function applyRoomAppearance(theme = 'light', accent = 'blue', roomCode = activeRoomCode) {
  const allowedThemes = ['light', 'dark'];
  const allowedAccents = ['blue', 'rose', 'lavender', 'gold'];
  const safeTheme = allowedThemes.includes(theme) ? theme : 'light';
  const safeAccent = allowedAccents.includes(accent) ? accent : 'blue';
  roomView.dataset.theme = safeTheme;
  roomView.dataset.accent = safeAccent;
  document.querySelector('#darkThemeToggle').checked = safeTheme === 'dark';
  document.querySelector('#callAccentSelect').value = safeAccent;
  if (roomCode) {
    try { sessionStorage.setItem(roomAppearanceStorageKey(roomCode), JSON.stringify({ theme: safeTheme, accent: safeAccent })); } catch { /* Browser storage may be unavailable for local files. */ }
  }
}

function restoreRoomAppearance(roomCode) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(roomAppearanceStorageKey(roomCode)) || 'null');
    applyRoomAppearance(saved?.theme, saved?.accent, roomCode);
  } catch {
    applyRoomAppearance('light', 'blue', roomCode);
  }
}

function openRoom({ code, title, name, creator = false }) {
  activeRoomCode = code;
  activeRoomName = title || 'Encontro de hoje';
  activeName = name.trim();
  isRoomCreator = creator;
  removedParticipants.clear();
  roomSettings = { microphone: true, camera: true, reactions: true, privateRoom: false, chat: true, showClosedChat: true };
  document.querySelector('#personRole').textContent = isRoomCreator ? 'Anfitrião' : 'Participante';
  document.querySelectorAll('[data-admin-setting]').forEach((input) => { input.checked = roomSettings[input.dataset.adminSetting]; });
  document.querySelector('#emojiPickerAdmin').hidden = !isRoomCreator;
  document.querySelector('#participantMenu').hidden = true;
  closeReactionPanel();
  roomTitle.textContent = activeRoomName;
  restoreRoomAppearance(code);
  document.querySelector('#selfNameLabel').textContent = activeName;
  document.querySelector('#personName').textContent = activeName;
  document.querySelector('#personInitial').textContent = firstLetter(activeName);
  document.querySelector('.caption-avatar').textContent = firstLetter(activeName);
  document.querySelector('#selfPlaceholder .avatar').textContent = firstLetter(activeName);
  applyProfilePhoto(activeProfilePhoto);
  document.querySelector('#micToggle span:last-child').textContent = 'Ativar mic';
  document.querySelector('#cameraToggle span:last-child').textContent = 'Ligar câmera';
  document.querySelector('#micToggle').classList.remove('is-on', 'is-off');
  document.querySelector('#cameraToggle').classList.remove('is-on', 'is-off');
  document.querySelector('#micToggle').classList.add('is-off');
  document.querySelector('#cameraToggle').classList.add('is-off');
  document.querySelector('#micToggle').setAttribute('aria-pressed', 'false');
  document.querySelector('#cameraToggle').setAttribute('aria-pressed', 'false');
  document.querySelector('#screenToggle').classList.remove('is-on');
  document.querySelector('#screenToggle').setAttribute('aria-pressed', 'false');
  document.querySelector('#raiseHandBottom').classList.remove('is-on');
  document.querySelector('#raiseHandBottom').setAttribute('aria-pressed', 'false');
  document.querySelector('#handRaisedIndicator').hidden = true;
  document.querySelector('#liveReaction').hidden = true;
  document.querySelector('#micIndicator').classList.remove('is-on');
  document.querySelector('#micIndicator').setAttribute('aria-label', 'Microfone desligado');
  document.querySelector('#personMic').textContent = '⌁';
  updatePreview();
  homeView.hidden = true;
  roomView.hidden = false;
  callLayout.classList.add('panel-collapsed');
  sidePanel.classList.remove('panel-open');
  showPanel('people');
  closeSidePanel();
  window.scrollTo(0, 0);
}

function firstLetter(value) {
  return Array.from(value.trim())[0]?.toLocaleUpperCase('pt-BR') || '?';
}

function showPanel(tab) {
  if (tab === 'admin' && !isRoomCreator) tab = 'people';
  const showPeople = tab === 'people';
  const showAdmin = tab === 'admin';
  const showChat = tab === 'chat';
  peoplePanel.hidden = !showPeople;
  chatPanel.hidden = !showChat;
  document.querySelector('#adminPanel').hidden = !showAdmin;
  sidePanel.classList.toggle('chat-fullscreen', showChat);
  callLayout.classList.remove('panel-collapsed');
  if (window.matchMedia('(max-width: 700px)').matches) sidePanel.classList.add('panel-open');
  document.querySelector('#peopleToggle').setAttribute('aria-expanded', String(showPeople));
  document.querySelector('#chatToggle').setAttribute('aria-pressed', String(showChat));
}

function closeSidePanel() {
  if (window.matchMedia('(max-width: 700px)').matches) sidePanel.classList.remove('panel-open');
  else callLayout.classList.add('panel-collapsed');
  document.querySelector('#peopleToggle').setAttribute('aria-expanded', 'false');
  document.querySelector('#chatToggle').setAttribute('aria-pressed', 'false');
}

function toggleChatPanel() {
  const isMobile = window.matchMedia('(max-width: 700px)').matches;
  const panelIsVisible = isMobile ? sidePanel.classList.contains('panel-open') : !callLayout.classList.contains('panel-collapsed');
  if (panelIsVisible && !chatPanel.hidden) closeSidePanel();
  else openChatPanel();
}

function openChatPanel() {
  if (!roomSettings.chat && !roomSettings.showClosedChat) {
    showToast('O anfitrião fechou a conversa.');
    return;
  }
  document.querySelector('#chatForm').hidden = !roomSettings.chat;
  document.querySelector('#messages').hidden = !roomSettings.chat && !roomSettings.showClosedChat;
  showPanel('chat');
}

function getInviteUrl() {
  const inviteBase = window.location.protocol === 'file:'
    ? 'https://filhossdemaria.com.br/chamada/'
    : window.location.href;
  const link = new URL(inviteBase);
  link.search = '';
  link.hash = '';
  link.searchParams.set('sala', activeRoomCode);
  link.searchParams.set('titulo', activeRoomName);
  return link.toString();
}

async function copyInvite() {
  const link = getInviteUrl();
  try {
    await navigator.clipboard.writeText(link);
    showToast('Convite copiado. Pode mandar no grupo!');
  } catch {
    const helper = document.createElement('textarea');
    helper.value = link;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.append(helper);
    helper.select();
    const copied = document.execCommand('copy');
    helper.remove();
    showToast(copied ? 'Convite copiado. Pode mandar no grupo!' : link);
  }
}

function refreshMediaPreview() {
  const source = screenStream || cameraStream;
  const hasVideo = Boolean(source?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled));
  if (hasVideo) {
    selfVideo.srcObject = source;
    selfVideo.hidden = false;
    selfPlaceholder.hidden = true;
  } else {
    selfVideo.pause();
    selfVideo.srcObject = null;
    selfVideo.hidden = true;
    selfPlaceholder.hidden = false;
  }
}

function updatePreview() {
  if (roomView.hidden) return;
  refreshMediaPreview();
}

function syncLocalMedia() {
  const microphoneOn = Boolean(audioStream?.getAudioTracks().some((track) => track.enabled && track.readyState === 'live'));
  const cameraOn = Boolean(cameraStream?.getVideoTracks().some((track) => track.enabled && track.readyState === 'live'));
  const micButton = document.querySelector('#micToggle');
  const cameraButton = document.querySelector('#cameraToggle');
  micButton.classList.toggle('is-on', microphoneOn);
  micButton.classList.toggle('is-off', !microphoneOn);
  micButton.setAttribute('aria-pressed', String(microphoneOn));
  micButton.querySelector('span:last-child').textContent = microphoneOn ? 'Desligar mic' : 'Ativar mic';
  cameraButton.classList.toggle('is-on', cameraOn);
  cameraButton.classList.toggle('is-off', !cameraOn);
  cameraButton.setAttribute('aria-pressed', String(cameraOn));
  cameraButton.querySelector('span:last-child').textContent = cameraOn ? 'Desligar câmera' : 'Ligar câmera';
  document.querySelector('#micIndicator').classList.toggle('is-on', microphoneOn);
  document.querySelector('#micIndicator').setAttribute('aria-label', microphoneOn ? 'Microfone ligado' : 'Microfone desligado');
  document.querySelector('#personMic').textContent = microphoneOn ? '♫' : '⌁';
  refreshMediaPreview();
}

async function toggleMicrophone() {
  if (!audioStream) {
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('A prévia do microfone precisa abrir em uma conexão segura (HTTPS).');
      return;
    }
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      showToast(error.name === 'NotAllowedError' ? 'Permita o uso do microfone nas configurações do navegador.' : 'Não encontrei um microfone disponível.');
      return;
    }
  }
  const track = audioStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  syncLocalMedia();
}

async function toggleCamera() {
  if (!cameraStream) {
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('A prévia da câmera precisa abrir em uma conexão segura (HTTPS).');
      return;
    }
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (error) {
      showToast(error.name === 'NotAllowedError' ? 'Permita o uso da câmera nas configurações do navegador.' : 'Não encontrei uma câmera disponível.');
      return;
    }
  }
  const track = cameraStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  syncLocalMedia();
}

async function toggleScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach((track) => track.stop());
    screenStream = null;
    document.querySelector('#screenToggle').classList.remove('is-on');
    document.querySelector('#screenToggle').setAttribute('aria-pressed', 'false');
    refreshMediaPreview();
    showToast('Compartilhamento encerrado.');
    return;
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    showToast('O compartilhamento de tela não está disponível neste navegador.');
    return;
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    document.querySelector('#screenToggle').classList.add('is-on');
    document.querySelector('#screenToggle').setAttribute('aria-pressed', 'true');
    screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      screenStream = null;
      document.querySelector('#screenToggle').classList.remove('is-on');
      document.querySelector('#screenToggle').setAttribute('aria-pressed', 'false');
      refreshMediaPreview();
    }, { once: true });
    refreshMediaPreview();
  } catch (error) {
    if (error.name !== 'NotAllowedError') showToast('Não foi possível compartilhar a tela neste momento.');
  }
}

function toggleHand() {
  const button = document.querySelector('#raiseHandBottom');
  const raised = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(raised));
  button.classList.toggle('is-on', raised);
  document.querySelector('#handRaisedIndicator').hidden = !raised;
  showToast(raised ? 'Mão levantada.' : 'Mão abaixada.');
}

function rememberQuickReaction(emoji) {
  quickReactions = [emoji, ...quickReactions.filter((item) => item !== emoji)].slice(0, 5);
  try {
    localStorage.setItem(quickReactionStorageKey, JSON.stringify(quickReactions));
  } catch { /* As reações continuam funcionando sem armazenamento local. */ }
  renderQuickReactions();
}

function renderQuickReactions() {
  const container = document.querySelector('#quickReactions');
  if (!container) return;
  container.replaceChildren();
  quickReactions.forEach((emoji) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quick-reaction-button';
    button.dataset.reaction = emoji;
    button.textContent = emoji;
    button.setAttribute('aria-label', `Reagir com ${emoji}`);
    button.title = `Reagir com ${emoji}`;
    container.append(button);
  });
}

function sendReaction(emoji) {
  rememberQuickReaction(emoji);
  const reaction = document.querySelector('#liveReaction');
  reaction.textContent = emoji;
  reaction.hidden = false;
  reaction.classList.remove('reaction-pop');
  void reaction.offsetWidth;
  reaction.classList.add('reaction-pop');
  window.clearTimeout(reactionTimer);
  reactionTimer = window.setTimeout(() => { reaction.hidden = true; }, 1700);
}

function closeReactionPanel() {
  document.querySelector('#reactionPicker').hidden = true;
  document.querySelector('#customEmojiForm').hidden = true;
  document.querySelector('#customEmojiInput').value = '';
  document.querySelector('#reactionToggle').setAttribute('aria-expanded', 'false');
  document.querySelector('#reactionToggle').classList.remove('is-on');
}

function openReactionPicker() {
  const picker = document.querySelector('#reactionPicker');
  const shouldOpen = picker.hidden;
  closeReactionPanel();
  if (!shouldOpen) return;
  renderQuickReactions();
  picker.hidden = false;
  document.querySelector('#emojiPickerAdmin').hidden = !isRoomCreator;
  document.querySelector('#reactionToggle').setAttribute('aria-expanded', 'true');
  document.querySelector('#reactionToggle').classList.add('is-on');
}
function updateAdminSetting(input) {
  const key = input.dataset.adminSetting;
  roomSettings[key] = input.checked;
  if (key === 'chat') {
    const form = document.querySelector('#chatForm');
    const historyHidden = !roomSettings.chat && !roomSettings.showClosedChat;
    document.querySelector('#chatPanel').classList.toggle('chat-is-closed', !roomSettings.chat);
    document.querySelector('#messages').hidden = historyHidden;
    document.querySelector('#chatForm').hidden = !roomSettings.chat;
    if (historyHidden && !document.querySelector('#chatPanel').hidden) showPanel('admin');
    else if (form) form.hidden = !roomSettings.chat;
  }
  if (key === 'showClosedChat') {
    document.querySelector('#messages').hidden = !roomSettings.chat && !roomSettings.showClosedChat;
    document.querySelector('#chatPanel').classList.toggle('chat-is-closed', !roomSettings.chat);
  }
  const descriptions = {
    microphone: `Microfone ${input.checked ? 'permitido' : 'bloqueado'} para participantes.`,
    camera: `Câmera ${input.checked ? 'permitida' : 'bloqueada'} para participantes.`,
    reactions: `Reações ${input.checked ? 'permitidas' : 'bloqueadas'} para participantes.`,
    privateRoom: input.checked ? 'Sala privada: novas entradas precisam de aprovação.' : 'Sala aberta para novos convites.',
    chat: input.checked ? 'Conversa aberta para mensagens.' : 'Conversa fechada para novas mensagens.',
    showClosedChat: input.checked ? 'Histórico visível quando a conversa estiver fechada.' : 'Histórico oculto quando a conversa estiver fechada.',
  };
  showToast(descriptions[key] || 'Opção atualizada.');
}

function openParticipantMenu(participant) {
  if (!isRoomCreator || !participant || participant.dataset.participantId === 'local-host') return;
  if (removedParticipants.has(participant.dataset.participantId)) return;
  const menu = document.querySelector('#participantMenu');
  selectedParticipantId = participant.dataset.participantId;
  document.querySelector('#participantMenuName').textContent = participant.dataset.participantName || participant.querySelector('.person-details strong')?.textContent || 'Participante';
  menu.hidden = false;
  const rect = participant.getBoundingClientRect();
  menu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - 250))}px`;
  menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 180)}px`;
}

function handleParticipantAction(action) {
  const participant = document.querySelector(`[data-participant-id="${CSS.escape(selectedParticipantId)}"]`);
  const name = participant?.dataset.participantName || participant?.querySelector('.person-details strong')?.textContent || 'Participante';
  document.querySelector('#participantMenu').hidden = true;
  if (!participant) return;
  if (action === 'mute') {
    showToast(`${name} será silenciado quando a sala estiver conectada.`);
  } else if (action === 'camera') {
    showToast(`A câmera de ${name} será desligada quando a sala estiver conectada.`);
  } else if (action === 'remove') {
    removedParticipants.add(selectedParticipantId);
    participant.remove();
    showToast(`${name} removido desta demonstração. O bloqueio permanente depende do servidor.`);
  }
}

function leaveRoom() {
  [audioStream, cameraStream, screenStream].forEach((stream) => stream?.getTracks().forEach((track) => track.stop()));
  audioStream = null;
  cameraStream = null;
  screenStream = null;
  selfVideo.srcObject = null;
  document.querySelector('#screenToggle').classList.remove('is-on');
  document.querySelector('#screenToggle').setAttribute('aria-pressed', 'false');
  roomView.hidden = true;
  homeView.hidden = false;
  callLayout.classList.remove('panel-collapsed');
  sidePanel.classList.remove('panel-open');
  const cleanUrl = new URL(window.location.href);
  cleanUrl.search = '';
  window.history.replaceState({}, '', cleanUrl);
  window.scrollTo(0, 0);
}

function requestLeave() {
  if (!leaveDialog.open) leaveDialog.showModal();
}

function roundedRectPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function loadCanvasImage(source) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

async function captureParticipants() {
  const tiles = [...document.querySelectorAll('.video-tile[data-participant-id]')]
    .filter((tile) => !removedParticipants.has(tile.dataset.participantId));
  if (!tiles.length) {
    showToast('Não há blocos de pessoas para salvar.');
    return;
  }
  const columns = Math.ceil(Math.sqrt(tiles.length));
  const rows = Math.ceil(tiles.length / columns);
  const margin = 48;
  const gap = 24;
  const tileWidth = 720;
  const tileHeight = 405;
  const canvas = document.createElement('canvas');
  canvas.width = margin * 2 + columns * tileWidth + (columns - 1) * gap;
  canvas.height = margin * 2 + rows * tileHeight + (rows - 1) * gap;
  const context = canvas.getContext('2d');
  if (!context) {
    showToast('Não consegui preparar a imagem neste navegador.');
    return;
  }
  context.fillStyle = '#eef3f8';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index];
    const x = margin + (index % columns) * (tileWidth + gap);
    const y = margin + Math.floor(index / columns) * (tileHeight + gap);
    roundedRectPath(context, x, y, tileWidth, tileHeight, 25);
    context.save();
    context.clip();
    const gradient = context.createLinearGradient(x, y, x + tileWidth, y + tileHeight);
    gradient.addColorStop(0, '#e6eef6');
    gradient.addColorStop(1, '#cbdbea');
    context.fillStyle = gradient;
    context.fillRect(x, y, tileWidth, tileHeight);
    const video = tile.querySelector('video');
    if (video && !video.hidden && video.readyState >= 2 && video.videoWidth) {
      const scale = Math.max(tileWidth / video.videoWidth, tileHeight / video.videoHeight);
      const drawWidth = video.videoWidth * scale;
      const drawHeight = video.videoHeight * scale;
      context.drawImage(video, x + (tileWidth - drawWidth) / 2, y + (tileHeight - drawHeight) / 2, drawWidth, drawHeight);
    } else {
      const avatarText = tile.querySelector('.avatar')?.textContent || tile.dataset.participantName?.[0] || '?';
      const photoSource = tile.dataset.profilePhoto || (tile.id === 'selfTile' ? activeProfilePhoto : '');
      const avatarImage = photoSource ? await loadCanvasImage(photoSource) : null;
      const avatarSize = 142;
      const avatarX = x + (tileWidth - avatarSize) / 2;
      const avatarY = y + (tileHeight - avatarSize) / 2 - 20;
      context.save();
      context.beginPath();
      context.arc(x + tileWidth / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      context.clip();
      if (avatarImage) {
        const scale = Math.max(avatarSize / avatarImage.width, avatarSize / avatarImage.height);
        const drawWidth = avatarImage.width * scale;
        const drawHeight = avatarImage.height * scale;
        context.drawImage(avatarImage, x + tileWidth / 2 - drawWidth / 2, avatarY + avatarSize / 2 - drawHeight / 2, drawWidth, drawHeight);
      } else {
        context.fillStyle = '#f0d2b3';
        context.fill();
        context.fillStyle = '#735844';
        context.font = '64px Georgia, serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(avatarText, x + tileWidth / 2, avatarY + avatarSize / 2 + 3);
      }
      context.restore();
    }
    const fade = context.createLinearGradient(0, y + tileHeight - 100, 0, y + tileHeight);
    fade.addColorStop(0, 'rgba(31,49,66,0)');
    fade.addColorStop(1, 'rgba(31,49,66,.68)');
    context.fillStyle = fade;
    context.fillRect(x, y + tileHeight - 100, tileWidth, 100);
    const personName = tile.dataset.participantName || tile.querySelector('#selfNameLabel')?.textContent || tile.querySelector('.tile-caption span:nth-child(2)')?.textContent || 'Participante';
    context.fillStyle = '#fff';
    context.font = '600 23px Segoe UI, Arial, sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(personName, x + 28, y + tileHeight - 30, tileWidth - 56);
    context.restore();
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    showToast('Não consegui salvar a imagem. Tente novamente.');
    return;
  }
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `entre-nos-${new Date().toISOString().slice(0, 10)}.png`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  showToast('Imagem salva, somente com os blocos das pessoas.');
}

document.querySelectorAll('#heroCreate, #closingCreate').forEach((button) => button.addEventListener('click', () => openEntry('create')));
document.querySelectorAll('#heroJoin, #navJoin').forEach((button) => button.addEventListener('click', () => openEntry('join')));
document.querySelector('#entryForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = displayNameInput.value.trim();
  if (!name) {
    displayNameInput.focus();
    return;
  }
  if (profilePhotoInput.files[0]) {
    try {
      activeProfilePhoto = await resizeProfileImage(profilePhotoInput.files[0]);
    } catch {
      showToast('Não consegui abrir essa foto. Escolha outra imagem.');
      return;
    }
  }
  if (rememberProfileInput.checked) {
    try {
      localStorage.setItem('entre-nos-profile', JSON.stringify({ name, photo: activeProfilePhoto }));
    } catch {
      showToast('Não consegui salvar os dados neste aparelho.');
    }
  } else {
    try { localStorage.removeItem('entre-nos-profile'); } catch { /* Storage can be unavailable in private browsing. */ }
  }
  activeName = name;
  if (dialogMode === 'create') {
    const title = meetingNameInput.value.trim() || 'Encontro de hoje';
    const code = makeRoomCode();
    rememberRoomHost(code);
    setRoomUrl(code, title);
    entryDialog.close();
    openRoom({ code, title, name, creator: true });
    return;
  }
  const code = getRoomCode(inviteCodeInput.value);
  if (!code) {
    showToast('Cole um link ou código de convite para continuar.');
    inviteCodeInput.focus();
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const title = params.get('titulo') || 'Encontro do grupo';
  setRoomUrl(code, title);
  entryDialog.close();
  openRoom({ code, title, name, creator: isRoomHostOnThisTab(code) });
});

displayNameInput.addEventListener('input', () => updateProfilePreview(displayNameInput.value));
profilePhotoInput.addEventListener('change', async () => {
  if (!profilePhotoInput.files[0]) return;
  try {
    activeProfilePhoto = await resizeProfileImage(profilePhotoInput.files[0]);
    updateProfilePreview(displayNameInput.value, activeProfilePhoto);
  } catch {
    showToast('Não consegui abrir essa foto. Escolha outra imagem.');
    profilePhotoInput.value = '';
  }
});

document.querySelector('#copyInvite').addEventListener('click', copyInvite);
document.querySelector('#stageInvite').addEventListener('click', copyInvite);
document.querySelector('#micToggle').addEventListener('click', toggleMicrophone);
document.querySelector('#cameraToggle').addEventListener('click', toggleCamera);
document.querySelector('#screenToggle').addEventListener('click', toggleScreenShare);
document.querySelector('#raiseHandBottom').addEventListener('click', toggleHand);
document.querySelector('#reactionToggle').addEventListener('click', openReactionPicker);
document.querySelector('#closeEmojiPicker').addEventListener('click', closeReactionPanel);
document.querySelector('#openAdminFromEmoji').addEventListener('click', () => {
  if (!isRoomCreator) return;
  closeReactionPanel();
  showPanel('admin');
});
document.querySelector('#adminBack').addEventListener('click', () => showPanel('people'));
document.querySelector('#quickReactions').addEventListener('click', (event) => {
  const reactionButton = event.target.closest('[data-reaction]');
  if (!reactionButton) return;
  sendReaction(reactionButton.dataset.reaction);
  closeReactionPanel();
});
document.querySelector('#customEmojiButton').addEventListener('click', () => {
  const form = document.querySelector('#customEmojiForm');
  const input = document.querySelector('#customEmojiInput');
  form.hidden = false;
  input.focus({ preventScroll: true });
});
document.querySelector('#customEmojiForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#customEmojiInput');
  const emoji = input.value.trim();
  if (!isReactionEmoji(emoji)) {
    showToast('Escolha um emoji no teclado do seu aparelho.');
    input.focus({ preventScroll: true });
    return;
  }
  sendReaction(emoji);
  closeReactionPanel();
});
document.addEventListener('click', (event) => {
  if (!document.querySelector('#reactionControl').contains(event.target) && !document.querySelector('#reactionPicker').contains(event.target)) closeReactionPanel();
  const menu = document.querySelector('#participantMenu');
  if (!menu.hidden && !menu.contains(event.target) && !event.target.closest('[data-participant-id]')) menu.hidden = true;
});
document.querySelectorAll('[data-admin-setting]').forEach((input) => input.addEventListener('change', () => updateAdminSetting(input)));
document.querySelector('#darkThemeToggle').addEventListener('change', (event) => {
  applyRoomAppearance(event.target.checked ? 'dark' : 'light', document.querySelector('#callAccentSelect').value);
});
document.querySelector('#callAccentSelect').addEventListener('change', (event) => {
  applyRoomAppearance(document.querySelector('#darkThemeToggle').checked ? 'dark' : 'light', event.target.value);
});
document.querySelector('#clearChatButton').addEventListener('click', () => {
  if (!isRoomCreator) return;
  document.querySelector('#messages').replaceChildren();
  showToast('Conversa limpa.');
});
document.querySelector('#participantMenu').addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-participant-action]');
  if (actionButton) handleParticipantAction(actionButton.dataset.participantAction);
});
document.querySelector('#peoplePanel').addEventListener('click', (event) => {
  const participant = event.target.closest('[data-participant-id]');
  if (participant?.dataset.participantId === 'local-host' && isRoomCreator) showToast('Você é o anfitrião desta sala.');
  else openParticipantMenu(participant);
});
document.querySelector('.video-grid').addEventListener('click', (event) => openParticipantMenu(event.target.closest('.video-tile[data-participant-id]')));
document.querySelector('#leaveCall').addEventListener('click', requestLeave);
document.querySelector('#leaveTop').addEventListener('click', requestLeave);
document.querySelector('#roomHome').addEventListener('click', (event) => { event.preventDefault(); requestLeave(); });
document.querySelector('#stayInRoom').addEventListener('click', () => leaveDialog.close());
document.querySelector('#confirmLeave').addEventListener('click', () => {
  leaveDialog.close();
  leaveRoom();
});
document.querySelector('#captureButton').addEventListener('click', captureParticipants);
document.querySelector('#chatToggle').addEventListener('click', toggleChatPanel);
document.querySelector('#peopleToggle').addEventListener('click', () => showPanel('people'));
document.querySelector('#panelClose').addEventListener('click', closeSidePanel);
document.querySelector('#chatClose').addEventListener('click', closeSidePanel);
document.querySelector('#chatForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!roomSettings.chat) {
    showToast('A conversa está fechada pelo anfitrião.');
    return;
  }
  const input = document.querySelector('#chatInput');
  const message = input.value.trim();
  if (!message) return;
  document.querySelector('.system-message')?.remove();
  const bubble = document.createElement('div');
  bubble.className = 'chat-message';
  const sender = document.createElement('small');
  sender.textContent = activeName;
  const body = document.createElement('span');
  body.textContent = message;
  bubble.append(sender, body);
  document.querySelector('#messages').append(bubble);
  input.value = '';
  bubble.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

const initialParams = new URLSearchParams(window.location.search);
const initialCode = initialParams.get('sala');
if (initialCode) openEntry('join', window.location.href);
