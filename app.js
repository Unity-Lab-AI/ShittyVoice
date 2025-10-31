const visualization = document.getElementById('visualization');
const background = document.getElementById('background');
const activationOverlay = document.getElementById('voice-activation');

let currentImageModel = 'flux';
let chatHistory = [];
let systemPrompt = '';
let recognition = null;
let isMuted = false;
let isRecognitionActive = false;
let shouldAutoRestart = false;

window.addEventListener('load', async () => {
  await loadSystemPrompt();
  setupVoiceActivation();
  await attemptAutomaticActivation();
});

async function loadSystemPrompt() {
  try {
    const response = await fetch('ai-instruct.txt');
    systemPrompt = await response.text();
  } catch (error) {
    console.error('Error fetching system prompt:', error);
    systemPrompt = 'You are Unity, a helpful AI assistant.';
  }
}

function setupVoiceActivation() {
  if (!initializeSpeechRecognition()) {
    if (activationOverlay) {
      activationOverlay.textContent =
        'Speech recognition is not supported in this browser.';
      activationOverlay.style.cursor = 'default';
    }
    return;
  }

  if (!activationOverlay) {
    shouldAutoRestart = true;
    resumeListening();
    return;
  }

  if (activationOverlay.voiceActivationHandler) {
    const previousHandler = activationOverlay.voiceActivationHandler;
    const activationEvents = ['pointerdown', 'click', 'touchstart'];
    activationEvents.forEach((eventName) => {
      activationOverlay.removeEventListener(eventName, previousHandler);
      document.removeEventListener(eventName, previousHandler);
    });
    document.removeEventListener('keydown', previousHandler);
  }

  const activationHandler = async (event) => {
    if (
      event.type === 'keydown' &&
      event.key !== 'Enter' &&
      event.key !== ' '
    ) {
      return;
    }

    if (typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }

    activationOverlay.textContent = 'Requesting microphone permission...';

    const granted = await requestMicPermission();
    if (!granted) {
      activationOverlay.textContent =
        'Microphone access is required. Tap to try again.';
      return;
    }

    shouldAutoRestart = true;
    const started = await startListening();
    if (!started) {
      activationOverlay.textContent =
        'Unable to start voice recognition. Check browser permissions.';
      return;
    }

    hideActivationOverlay();
    removeActivationListeners();
  };

  const removeActivationListeners = () => {
    const activationEvents = ['pointerdown', 'click', 'touchstart'];
    activationEvents.forEach((eventName) => {
      activationOverlay.removeEventListener(eventName, activationHandler);
      document.removeEventListener(eventName, activationHandler);
    });

    document.removeEventListener('keydown', activationHandler);
    delete activationOverlay.voiceActivationHandler;
  };

  const activationEvents = ['pointerdown', 'click', 'touchstart'];
  activationEvents.forEach((eventName) => {
    activationOverlay.addEventListener(eventName, activationHandler, {
      once: false,
    });
    document.addEventListener(eventName, activationHandler, { once: false });
  });

  document.addEventListener('keydown', activationHandler);
  activationOverlay.voiceActivationHandler = activationHandler;
}

async function attemptAutomaticActivation() {
  if (!initializeSpeechRecognition()) {
    return;
  }

  if (!activationOverlay) {
    const granted = await requestMicPermission();
    if (!granted) {
      return;
    }

    shouldAutoRestart = true;
    await startListening();
    return;
  }

  if (activationOverlay.voiceActivationHandler) {
    try {
      await activationOverlay.voiceActivationHandler({ type: 'auto' });
    } catch (error) {
      console.error('Automatic microphone activation failed:', error);
    }
  }
}

function hideActivationOverlay() {
  if (!activationOverlay) {
    return;
  }

  activationOverlay.classList.add('hidden');
}

async function requestMicPermission() {
  const constraints = { audio: true };

  const stopTracks = (stream) => {
    if (!stream) {
      return;
    }

    stream.getTracks().forEach((track) => track.stop());
  };

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stopTracks(stream);
      return true;
    } catch (error) {
      console.error('Microphone permission denied:', error);
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
          resolve(true);
        },
        (error) => {
          console.error('Microphone permission denied (legacy API):', error);
          resolve(false);
        },
      );
    });
  }

  alert('Microphone access is not supported in this browser.');
  return false;
}

function initializeSpeechRecognition() {
  if (recognition) {
    return true;
  }

  const RecognitionConstructor =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!RecognitionConstructor) {
    return false;
  }

  recognition = new RecognitionConstructor();
  recognition.continuous = true;
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    console.log('Voice recognition started.');
    isRecognitionActive = true;
    if (visualization) {
      visualization.style.borderColor = '#ff0000';
    }
  };

  recognition.onend = () => {
    console.log('Voice recognition stopped.');
    isRecognitionActive = false;
    if (visualization) {
      visualization.style.borderColor = '#ffffff';
    }

    if (shouldAutoRestart && !isMuted) {
      startListening();
    }
  };

  recognition.onresult = (event) => {
    const resultIndex = event.results.length - 1;
    const transcript = event.results[resultIndex][0].transcript.trim();
    console.log('User said:', transcript);
    const isLocalCommand = handleVoiceCommand(transcript);
    if (!isLocalCommand) {
      getAIResponse(transcript);
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);

    if (
      event.error === 'not-allowed' ||
      event.error === 'service-not-allowed'
    ) {
      shouldAutoRestart = false;
      if (activationOverlay) {
        activationOverlay.classList.remove('hidden');
        activationOverlay.textContent =
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

  if (isRecognitionActive) {
    return true;
  }

  try {
    recognition.start();
    return true;
  } catch (error) {
    if (error.name === 'InvalidStateError') {
      return true;
    }

    console.error('Failed to start speech recognition:', error);
    shouldAutoRestart = false;
    if (activationOverlay) {
      activationOverlay.classList.remove('hidden');
      activationOverlay.textContent =
        'Unable to start voice recognition. Tap to try again.';
      setupVoiceActivation();
    }
    return false;
  }
}

function resumeListening() {
  if (!isMuted) {
    startListening();
  }
}

const synth = window.speechSynthesis;

function speak(text) {
  if (!text) {
    return;
  }

  if (synth.speaking) {
    console.warn('Speech synthesis is already speaking.');
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  const ukFemaleVoice = voices.find(
    (voice) =>
      voice.name.includes('Google UK English Female') || voice.lang === 'en-GB',
  );

  if (ukFemaleVoice) {
    utterance.voice = ukFemaleVoice;
  }

  utterance.onstart = () => {
    console.log('AI is speaking...');
    if (visualization) {
      visualization.style.animation = 'pulse 1s infinite';
    }
  };

  utterance.onend = () => {
    console.log('AI finished speaking.');
    if (visualization) {
      visualization.style.animation = '';
    }

    resumeListening();
  };

  synth.speak(utterance);
}

function handleVoiceCommand(command) {
  const lowerCaseCommand = command.toLowerCase();

  if (
    lowerCaseCommand.includes('mute my mic') ||
    lowerCaseCommand.includes('mute microphone')
  ) {
    isMuted = true;
    shouldAutoRestart = false;
    if (recognition) {
      recognition.stop();
    }
    speak('Microphone muted.');
    return true;
  }

  if (
    lowerCaseCommand.includes('unmute my mic') ||
    lowerCaseCommand.includes('unmute microphone')
  ) {
    isMuted = false;
    shouldAutoRestart = true;
    resumeListening();
    speak('Microphone unmuted.');
    return true;
  }

  if (
    lowerCaseCommand.includes('shut up') ||
    lowerCaseCommand.includes('be quiet')
  ) {
    synth.cancel();
    return true;
  }

  if (
    lowerCaseCommand.includes('copy image') ||
    lowerCaseCommand.includes('copy this image')
  ) {
    copyImageToClipboard();
    return true;
  }

  if (
    lowerCaseCommand.includes('save image') ||
    lowerCaseCommand.includes('download image')
  ) {
    saveImage();
    return true;
  }

  if (
    lowerCaseCommand.includes('open image') ||
    lowerCaseCommand.includes('open this image')
  ) {
    openImageInNewTab();
    return true;
  }

  if (
    lowerCaseCommand.includes('use flux model') ||
    lowerCaseCommand.includes('switch to flux')
  ) {
    currentImageModel = 'flux';
    speak('Image model set to flux.');
    return true;
  }

  if (
    lowerCaseCommand.includes('use turbo model') ||
    lowerCaseCommand.includes('switch to turbo')
  ) {
    currentImageModel = 'turbo';
    speak('Image model set to turbo.');
    return true;
  }

  if (
    lowerCaseCommand.includes('use kontext model') ||
    lowerCaseCommand.includes('switch to kontext')
  ) {
    currentImageModel = 'kontext';
    speak('Image model set to kontext.');
    return true;
  }

  if (
    lowerCaseCommand.includes('clear history') ||
    lowerCaseCommand.includes('delete history') ||
    lowerCaseCommand.includes('clear chat')
  ) {
    chatHistory = [];
    speak('Chat history cleared.');
    return true;
  }

  return false;
}

async function getAIResponse(userInput) {
  console.log(`Sending to AI: ${userInput}`);

  chatHistory.push({ role: 'user', content: userInput });

  if (chatHistory.length > 12) {
    chatHistory.splice(0, chatHistory.length - 12);
  }

  let aiText = '';

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory,
    ];
    const textResponse = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        model: 'unity',
      }),
    });

    const data = await textResponse.json();
    aiText = data.choices[0].message.content;
    chatHistory.push({ role: 'assistant', content: aiText });
    speak(aiText);
  } catch (error) {
    console.error('Error getting text from Pollinations AI:', error);
    speak("Sorry, I couldn't get a text response.");
  }

  try {
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(userInput)}?model=${currentImageModel}`;
    if (background) {
      background.style.backgroundImage = `url(${imageUrl})`;
    }
  } catch (error) {
    console.error('Error getting image from Pollinations AI:', error);
  }
}

function getImageUrl() {
  if (!background) {
    return '';
  }

  const style = window.getComputedStyle(background);
  const backgroundImage = style.getPropertyValue('background-image');
  if (!backgroundImage || backgroundImage === 'none') {
    return '';
  }

  const urlMatch = backgroundImage.match(/url\("?(.*?)"?\)/);
  return urlMatch ? urlMatch[1] : '';
}

async function copyImageToClipboard() {
  const imageUrl = getImageUrl();
  if (!imageUrl) {
    speak('No image available to copy.');
    return;
  }

  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    speak('Image copied to clipboard.');
  } catch (error) {
    console.error('Failed to copy image:', error);
    speak(
      'Sorry, I could not copy the image. This might be due to browser limitations.',
    );
  }
}

async function saveImage() {
  const imageUrl = getImageUrl();
  if (!imageUrl) {
    speak('No image available to save.');
    return;
  }

  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'pollination_image.png';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    speak('Image saved.');
  } catch (error) {
    console.error('Failed to save image:', error);
    speak('Sorry, I could not save the image.');
  }
}

function openImageInNewTab() {
  const imageUrl = getImageUrl();
  if (!imageUrl) {
    speak('No image available to open.');
    return;
  }

  window.open(imageUrl, '_blank');
  speak('Image opened in new tab.');
}
