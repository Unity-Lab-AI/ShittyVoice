const UI = {
  visualization: document.getElementById('visualization'),
  background: document.getElementById('background'),
  activationOverlay: document.getElementById('voice-activation'),
};

const CONFIG = {
  POLLINATIONS_TEXT_ENDPOINT: 'https://text.pollinations.ai/openai',
  MAX_HISTORY_MESSAGES: 24, // ~12 back-and-forth exchanges
  IMAGE_MODELS: ['flux', 'turbo', 'kontext'],
};

const state = {
  recognition: null,
  isRecognitionActive: false,
  isMuted: false,
  shouldAutoRestart: false,
  hasMicPermission: false,
  chatHistory: [],
  systemPrompt: '',
  currentImageModel: 'flux',
  lastImageUrl: '',
};

const synth = window.speechSynthesis;
let preferredVoice = null;

window.addEventListener('load', () => {
  initializeApp().catch((error) => {
    console.error('Failed to initialize application:', error);
  });
});

async function initializeApp() {
  await loadSystemPrompt();
  setupVoiceActivation();
  await attemptAutomaticActivation();
  preloadVoices();
}

async function loadSystemPrompt() {
  try {
    const response = await fetch('ai-instruct.txt');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    state.systemPrompt = await response.text();
  } catch (error) {
    console.error('Error fetching system prompt:', error);
    state.systemPrompt = 'You are Unity, a helpful AI assistant.';
  }
}

function setupVoiceActivation() {
  if (!initializeSpeechRecognition()) {
    if (UI.activationOverlay) {
      UI.activationOverlay.textContent =
        'Speech recognition is not supported in this browser.';
      UI.activationOverlay.style.cursor = 'default';
    }
    return;
  }

  if (!UI.activationOverlay) {
    state.shouldAutoRestart = true;
    resumeListening();
    return;
  }

  detachActivationHandlers();

  const activationHandler = async (event) => {
    if (
      event.type === 'keydown' &&
      event.key !== 'Enter' &&
      event.key !== ' '
    ) {
      return;
    }

    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    if (typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }

    UI.activationOverlay.textContent = 'Requesting microphone permission...';

    const granted = await requestMicPermission();
    if (!granted) {
      UI.activationOverlay.textContent =
        'Microphone access is required. Tap to try again.';
      return;
    }

    state.shouldAutoRestart = true;
    const started = await startListening();
    if (!started) {
      UI.activationOverlay.textContent =
        'Unable to start voice recognition. Check browser permissions.';
      return;
    }

    hideActivationOverlay();
    detachActivationHandlers();
  };

  const activationEvents = ['pointerdown', 'click', 'touchstart'];
  activationEvents.forEach((eventName) => {
    UI.activationOverlay.addEventListener(eventName, activationHandler, {
      once: false,
    });
    document.addEventListener(eventName, activationHandler, { once: false });
  });
  document.addEventListener('keydown', activationHandler);
  UI.activationOverlay.voiceActivationHandler = activationHandler;
}

function detachActivationHandlers() {
  if (!UI.activationOverlay || !UI.activationOverlay.voiceActivationHandler) {
    return;
  }

  const activationEvents = ['pointerdown', 'click', 'touchstart'];
  activationEvents.forEach((eventName) => {
    UI.activationOverlay.removeEventListener(
      eventName,
      UI.activationOverlay.voiceActivationHandler,
    );
    document.removeEventListener(
      eventName,
      UI.activationOverlay.voiceActivationHandler,
    );
  });

  document.removeEventListener(
    'keydown',
    UI.activationOverlay.voiceActivationHandler,
  );

  delete UI.activationOverlay.voiceActivationHandler;
}

async function attemptAutomaticActivation() {
  if (!initializeSpeechRecognition()) {
    return;
  }

  if (!UI.activationOverlay) {
    const granted = await requestMicPermission();
    if (!granted) {
      return;
    }
    state.shouldAutoRestart = true;
    await startListening();
    return;
  }

  if (typeof UI.activationOverlay.voiceActivationHandler === 'function') {
    try {
      await UI.activationOverlay.voiceActivationHandler({ type: 'auto' });
    } catch (error) {
      console.error('Automatic microphone activation failed:', error);
    }
  }
}

function hideActivationOverlay() {
  if (UI.activationOverlay) {
    UI.activationOverlay.classList.add('hidden');
  }
}

async function requestMicPermission() {
  const constraints = { audio: true };

  const stopTracks = (stream) => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  if (navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stopTracks(stream);
      state.hasMicPermission = true;
      return true;
    } catch (error) {
      console.error('Microphone permission denied:', error);
      state.hasMicPermission = false;
      return false;
    }
  }

  const legacyGetUserMedia =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;

  if (legacyGetUserMedia) {
    return new Promise((resolve) => {
      legacyGetUserMedia.call(
        navigator,
        constraints,
        (stream) => {
          stopTracks(stream);
          state.hasMicPermission = true;
          resolve(true);
        },
        (error) => {
          console.error('Microphone permission denied (legacy API):', error);
          state.hasMicPermission = false;
          resolve(false);
        },
      );
    });
  }

  alert('Microphone access is not supported in this browser.');
  state.hasMicPermission = false;
  return false;
}

function initializeSpeechRecognition() {
  if (state.recognition) {
    return true;
  }

  const RecognitionConstructor =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!RecognitionConstructor) {
    return false;
  }

  state.recognition = new RecognitionConstructor();
  state.recognition.continuous = true;
  state.recognition.lang = 'en-US';
  state.recognition.interimResults = false;
  state.recognition.maxAlternatives = 1;

  state.recognition.onstart = () => {
    state.isRecognitionActive = true;
    updateVisualizationState('listening');
  };

  state.recognition.onend = () => {
    state.isRecognitionActive = false;
    updateVisualizationState('idle');
    if (state.shouldAutoRestart && !state.isMuted) {
      startListening();
    }
  };

  state.recognition.onresult = (event) => {
    const resultIndex = event.results.length - 1;
    const transcript = event.results[resultIndex][0].transcript.trim();
    if (!transcript) {
      return;
    }
    console.log('User said:', transcript);
    const handledLocally = handleVoiceCommand(transcript);
    if (!handledLocally) {
      getAIResponse(transcript);
    }
  };

  state.recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      state.shouldAutoRestart = false;
      if (UI.activationOverlay) {
        UI.activationOverlay.classList.remove('hidden');
        UI.activationOverlay.textContent =
          'Microphone access blocked. Check browser settings and tap to retry.';
        setupVoiceActivation();
      }
    }
  };

  return true;
}

async function startListening() {
  if (!initializeSpeechRecognition()) {
    return false;
  }

  if (!state.hasMicPermission) {
    const granted = await requestMicPermission();
    if (!granted) {
      if (UI.activationOverlay) {
        UI.activationOverlay.classList.remove('hidden');
        UI.activationOverlay.textContent =
          'Microphone access is required. Tap to try again.';
      }
      return false;
    }
  }

  if (state.isRecognitionActive) {
    return true;
  }

  try {
    state.recognition.start();
    return true;
  } catch (error) {
    if (error.name === 'InvalidStateError') {
      return true;
    }
    console.error('Failed to start speech recognition:', error);
    state.shouldAutoRestart = false;
    if (UI.activationOverlay) {
      UI.activationOverlay.classList.remove('hidden');
      UI.activationOverlay.textContent =
        'Unable to start voice recognition. Tap to try again.';
      setupVoiceActivation();
    }
    return false;
  }
}

function resumeListening() {
  if (!state.isMuted) {
    startListening();
  }
}

function stopListening() {
  if (state.recognition && state.isRecognitionActive) {
    state.recognition.stop();
  }
}

function preloadVoices() {
  if (!synth) {
    return;
  }

  const selectPreferredVoice = () => {
    const voices = synth.getVoices();
    if (!voices.length) {
      return;
    }
    preferredVoice =
      voices.find((voice) =>
        voice.name.toLowerCase().includes('google uk english female'),
      ) || voices.find((voice) => voice.lang === 'en-GB') || null;
  };

  selectPreferredVoice();
  synth.addEventListener('voiceschanged', selectPreferredVoice);
}

function speak(text) {
  const trimmed = text?.trim();
  if (!trimmed) {
    resumeListening();
    return;
  }

  if (!synth) {
    console.warn('Speech synthesis is not available in this browser.');
    return;
  }

  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(trimmed);
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  utterance.onstart = () => {
    updateVisualizationState('speaking');
  };

  utterance.onend = () => {
    updateVisualizationState('idle');
    resumeListening();
  };

  utterance.onerror = (event) => {
    console.error('Speech synthesis error:', event.error);
    updateVisualizationState('idle');
    resumeListening();
  };

  synth.speak(utterance);
}

function updateVisualizationState(stateName) {
  if (!UI.visualization) {
    return;
  }

  switch (stateName) {
    case 'speaking':
      UI.visualization.style.animation = 'pulse 1s infinite';
      UI.visualization.style.borderColor = '#ff4081';
      break;
    case 'listening':
      UI.visualization.style.animation = '';
      UI.visualization.style.borderColor = '#03a9f4';
      break;
    default:
      UI.visualization.style.animation = '';
      UI.visualization.style.borderColor = '#ffffff';
      break;
  }
}

function trimChatHistory() {
  if (state.chatHistory.length > CONFIG.MAX_HISTORY_MESSAGES) {
    state.chatHistory = state.chatHistory.slice(-CONFIG.MAX_HISTORY_MESSAGES);
  }
}

async function getAIResponse(userInput) {
  state.chatHistory.push({ role: 'user', content: userInput });
  trimChatHistory();

  const payload = {
    messages: [
      { role: 'system', content: state.systemPrompt },
      {
        role: 'system',
        content: `Use the ${state.currentImageModel} image model when generating Pollinations image URLs. Share direct https://image.pollinations.ai links without additional commentary so they can be rendered visually.`,
      },
      ...state.chatHistory,
    ],
    model: 'unity',
  };

  let aiText = '';

  try {
    const response = await fetch(CONFIG.POLLINATIONS_TEXT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    aiText = data?.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('Error getting text from Pollinations AI:', error);
    speak("Sorry, I couldn't get a response right now.");
    return;
  }

  state.chatHistory.push({ role: 'assistant', content: aiText });
  trimChatHistory();

  const { cleanedText, imageUrls } = extractImagesAndCleanText(aiText);
  if (imageUrls.length > 0) {
    updateBackgroundWithImage(imageUrls[0]);
  } else {
    updateBackgroundFromPrompt(userInput);
  }

  if (cleanedText) {
    speak(cleanedText);
  } else if (imageUrls.length === 0) {
    speak('I received your message.');
  }
}

function extractImagesAndCleanText(text) {
  if (!text) {
    return { cleanedText: '', imageUrls: [] };
  }

  const imageUrlRegex =
    /https?:\/\/image\.pollinations\.ai[^\s)"']*/gi;
  const imageMatches = Array.from(text.matchAll(imageUrlRegex));
  const imageUrls = imageMatches
    .map((match) => sanitizeImageUrl(match[0]))
    .filter(Boolean);

  let cleanedText = text;
  imageMatches.forEach((match) => {
    cleanedText = cleanedText.replace(match[0], '');
  });

  cleanedText = cleanedText.replace(/\s{2,}/g, ' ').trim();

  return { cleanedText, imageUrls };
}

function sanitizeImageUrl(url) {
  if (!url) {
    return '';
  }

  return url.replace(/[.,!?]+$/, '');
}

function updateBackgroundWithImage(imageUrl) {
  if (!UI.background || !imageUrl) {
    return;
  }

  state.lastImageUrl = imageUrl;
  UI.background.style.backgroundImage = `url(${imageUrl})`;
}

function updateBackgroundFromPrompt(prompt) {
  if (!prompt) {
    return;
  }

  const imageUrl =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?model=${state.currentImageModel}`;

  updateBackgroundWithImage(imageUrl);
}

function copyImageToClipboard() {
  if (!state.lastImageUrl) {
    speak('No image available to copy.');
    return;
  }

  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    speak('Copying images is not supported in this browser.');
    return;
  }

  fetch(state.lastImageUrl)
    .then((response) => response.blob())
    .then((blob) =>
      navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]),
    )
    .then(() => speak('Image copied to clipboard.'))
    .catch((error) => {
      console.error('Failed to copy image:', error);
      speak('Sorry, I could not copy the image.');
    });
}

function saveImage() {
  if (!state.lastImageUrl) {
    speak('No image available to save.');
    return;
  }

  fetch(state.lastImageUrl)
    .then((response) => response.blob())
    .then((blob) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pollinations-image.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      speak('Image saved.');
    })
    .catch((error) => {
      console.error('Failed to save image:', error);
      speak('Sorry, I could not save the image.');
    });
}

function openImageInNewTab() {
  if (!state.lastImageUrl) {
    speak('No image available to open.');
    return;
  }

  window.open(state.lastImageUrl, '_blank', 'noopener');
  speak('Image opened in a new tab.');
}

function muteMicrophone() {
  state.isMuted = true;
  state.shouldAutoRestart = false;
  stopListening();
  speak('Microphone muted.');
}

function unmuteMicrophone() {
  state.isMuted = false;
  state.shouldAutoRestart = true;
  resumeListening();
  speak('Microphone unmuted and listening.');
}

function silenceAssistant() {
  synth?.cancel();
  resumeListening();
}

function clearChatHistory() {
  state.chatHistory = [];
  speak('Chat history cleared.');
}

function setImageModel(model) {
  if (!CONFIG.IMAGE_MODELS.includes(model)) {
    speak('I do not recognize that image model.');
    return;
  }

  state.currentImageModel = model;
  speak(`Image model set to ${model}.`);
}

function handleVoiceCommand(command) {
  const normalized = command.toLowerCase();

  for (const entry of VOICE_COMMANDS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      entry.action();
      return true;
    }
  }

  return false;
}

const VOICE_COMMANDS = [
  {
    keywords: ['mute my mic', 'mute microphone', 'stop listening', 'pause listening'],
    action: muteMicrophone,
  },
  {
    keywords: [
      'unmute my mic',
      'unmute microphone',
      'start listening',
      'resume listening',
    ],
    action: unmuteMicrophone,
  },
  {
    keywords: ['shut up', 'be quiet', 'stop talking', 'silence'],
    action: silenceAssistant,
  },
  {
    keywords: ['copy image', 'copy this image'],
    action: copyImageToClipboard,
  },
  {
    keywords: ['save image', 'download image'],
    action: saveImage,
  },
  {
    keywords: ['open image', 'open this image'],
    action: openImageInNewTab,
  },
  {
    keywords: ['use flux model', 'switch to flux'],
    action: () => setImageModel('flux'),
  },
  {
    keywords: ['use turbo model', 'switch to turbo'],
    action: () => setImageModel('turbo'),
  },
  {
    keywords: ['use kontext model', 'switch to kontext'],
    action: () => setImageModel('kontext'),
  },
  {
    keywords: ['clear chat', 'reset chat', 'clear history'],
    action: clearChatHistory,
  },
];
