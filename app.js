const background = document.getElementById('background');
const muteIndicator = document.getElementById('mute-indicator');
const indicatorText = muteIndicator?.querySelector('.indicator-text') ?? null;
const aiCircle = document.querySelector('[data-role="ai"]');
const userCircle = document.querySelector('[data-role="user"]');

let currentImageModel = 'flux';
let chatHistory = [];
let systemPrompt = '';
let recognition = null;
let isMuted = true;
let hasMicPermission = false;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;

const currentScript = document.currentScript;
const directoryUrl = (() => {
    if (currentScript?.src) {
        try {
            return new URL('./', currentScript.src).toString();
        } catch (error) {
            console.error('Failed to derive directory from script src:', error);
        }
    }

    const href = window.location.href;
    const pathname = window.location.pathname || '';
    const lastSegment = pathname.substring(pathname.lastIndexOf('/') + 1);

    if (href.endsWith('/')) {
        return href;
    }

    if (lastSegment && lastSegment.includes('.')) {
        return href.substring(0, href.lastIndexOf('/') + 1);
    }

    return `${href}/`;
})();

function resolveAssetPath(relativePath) {
    try {
        return new URL(relativePath, directoryUrl).toString();
    } catch (error) {
        console.error('Failed to resolve asset path:', error);
        return relativePath;
    }
}

window.addEventListener('load', async () => {
    await loadSystemPrompt();
    setupSpeechRecognition();
    updateMuteIndicator();
    await initializeVoiceControl();
});

function setCircleState(circle, { speaking = false, listening = false, error = false, label = '' } = {}) {
    if (!circle) {
        return;
    }

    circle.classList.toggle('is-speaking', speaking);
    circle.classList.toggle('is-listening', listening);
    circle.classList.toggle('is-error', error);

    if (label) {
        circle.setAttribute('aria-label', label);
    }
}

async function loadSystemPrompt() {
    try {
        const response = await fetch(resolveAssetPath('ai-instruct.txt'));
        systemPrompt = await response.text();
    } catch (error) {
        console.error('Error fetching system prompt:', error);
        systemPrompt = 'You are Unity, a helpful AI assistant.';
    }
}

function setupSpeechRecognition() {
    if (!SpeechRecognition) {
        console.error('Speech recognition is not supported in this browser.');
        alert('Speech recognition is not supported in this browser.');
        setCircleState(userCircle, {
            label: 'Speech recognition is not supported in this browser',
            error: true
        });
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        console.log('Voice recognition started.');
        setCircleState(userCircle, {
            listening: true,
            label: 'Listening for your voice'
        });
    };

    recognition.onaudiostart = () => {
        setCircleState(userCircle, {
            listening: true,
            label: 'Listening for your voice'
        });
    };

    recognition.onspeechstart = () => {
        setCircleState(userCircle, {
            speaking: true,
            listening: true,
            label: 'Hearing you speak'
        });
    };

    recognition.onspeechend = () => {
        setCircleState(userCircle, {
            listening: true,
            speaking: false,
            label: 'Processing what you said'
        });
    };

    recognition.onend = () => {
        console.log('Voice recognition stopped.');
        setCircleState(userCircle, {
            listening: false,
            speaking: false,
            label: isMuted ? 'Microphone is muted' : 'Listening for your voice'
        });

        if (!isMuted) {
            try {
                recognition.start();
            } catch (error) {
                console.error('Failed to restart recognition:', error);
                setCircleState(userCircle, {
                    error: true,
                    label: 'Unable to restart microphone recognition'
                });
            }
        }
    };

    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        console.log('User said:', transcript);

        setCircleState(userCircle, {
            listening: true,
            speaking: false,
            label: 'Processing what you said'
        });

        const isLocalCommand = handleVoiceCommand(transcript);
        if (!isLocalCommand) {
            getAIResponse(transcript);
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setCircleState(userCircle, {
            error: true,
            listening: false,
            speaking: false,
            label: `Microphone error: ${event.error}`
        });
    };
}

async function initializeVoiceControl() {
    if (!recognition) {
        return;
    }

    hasMicPermission = await requestMicPermission();
    if (!hasMicPermission) {
        alert('Microphone access is required for voice control.');
        updateMuteIndicator();
        return;
    }

    if (!isMuted) {
        try {
            recognition.start();
        } catch (error) {
            console.error('Failed to start recognition:', error);
        }
    }
}

async function requestMicPermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Microphone access is not supported in this browser.');
        setCircleState(userCircle, {
            error: true,
            label: 'Microphone access is not supported in this browser'
        });
        return false;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        setCircleState(userCircle, {
            label: 'Microphone is muted'
        });
        return true;
    } catch (error) {
        console.error('Microphone permission denied:', error);
        setCircleState(userCircle, {
            error: true,
            label: 'Microphone permission denied'
        });
        return false;
    }
}

function updateMuteIndicator() {
    if (!muteIndicator) {
        return;
    }

    muteIndicator.classList.add('is-visible');
    muteIndicator.setAttribute('aria-hidden', 'false');

    if (isMuted) {
        const message = hasMicPermission
            ? 'Tap or click anywhere to unmute'
            : 'Allow microphone access to start';
        indicatorText && (indicatorText.textContent = message);
        muteIndicator.dataset.state = 'muted';
        muteIndicator.setAttribute('aria-label', 'Microphone muted. Tap to enable listening.');
    } else {
        indicatorText && (indicatorText.textContent = 'Listening… tap to mute');
        muteIndicator.dataset.state = 'listening';
        muteIndicator.setAttribute('aria-label', 'Microphone active. Tap to mute.');
    }
}

async function attemptUnmute() {
    if (!recognition) {
        return;
    }

    if (!hasMicPermission) {
        hasMicPermission = await requestMicPermission();
        if (!hasMicPermission) {
            alert('Microphone access is required for voice control.');
            return;
        }
    }

    if (!isMuted) {
        return;
    }

    isMuted = false;
    setCircleState(userCircle, {
        listening: true,
        label: 'Listening for your voice'
    });
    updateMuteIndicator();

    try {
        recognition.start();
    } catch (error) {
        console.error('Failed to start recognition:', error);
        setCircleState(userCircle, {
            error: true,
            listening: false,
            label: 'Unable to start microphone recognition'
        });
        isMuted = true;
        updateMuteIndicator();
    }
}

function handleMuteToggle(event) {
    event?.stopPropagation();

    if (isMuted) {
        attemptUnmute();
        return;
    }

    isMuted = true;
    setCircleState(userCircle, {
        listening: false,
        speaking: false,
        label: 'Microphone is muted'
    });
    updateMuteIndicator();

    if (recognition) {
        recognition.stop();
    }
}

muteIndicator?.addEventListener('click', handleMuteToggle);

document.addEventListener('click', () => {
    if (isMuted) {
        attemptUnmute();
    }
});

document.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && isMuted) {
        event.preventDefault();
        attemptUnmute();
    }
});

function speak(text) {
    if (synth.speaking) {
        console.error('Speech synthesis is already speaking.');
        return;
    }

    if (text === '') {
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const ukFemaleVoice = voices.find((voice) =>
        voice.name.includes('Google UK English Female') || (voice.lang === 'en-GB' && voice.gender === 'female')
    );

    if (ukFemaleVoice) {
        utterance.voice = ukFemaleVoice;
    } else {
        console.warn('UK English female voice not found, using default.');
    }

    utterance.onstart = () => {
        console.log('AI is speaking...');
        setCircleState(aiCircle, {
            speaking: true,
            label: 'Unity is speaking'
        });
    };

    utterance.onend = () => {
        console.log('AI finished speaking.');
        setCircleState(aiCircle, {
            speaking: false,
            label: 'Unity is idle'
        });
    };

    synth.speak(utterance);
}

function handleVoiceCommand(command) {
    const lowerCaseCommand = command.toLowerCase();

    if (lowerCaseCommand.includes('mute my mic') || lowerCaseCommand.includes('mute microphone')) {
        isMuted = true;
        updateMuteIndicator();
        setCircleState(userCircle, {
            listening: false,
            speaking: false,
            label: 'Microphone is muted'
        });
        if (recognition) {
            recognition.stop();
        }
        speak('Microphone muted.');
        return true;
    }

    if (lowerCaseCommand.includes('unmute my mic') || lowerCaseCommand.includes('unmute microphone')) {
        isMuted = false;
        updateMuteIndicator();
        setCircleState(userCircle, {
            listening: true,
            label: 'Listening for your voice'
        });
        if (recognition) {
            try {
                recognition.start();
            } catch (error) {
                console.error('Failed to start recognition:', error);
            }
        }
        speak('Microphone unmuted.');
        return true;
    }

    if (lowerCaseCommand.includes('shut up') || lowerCaseCommand.includes('be quiet')) {
        synth.cancel();
        setCircleState(aiCircle, {
            speaking: false,
            label: 'Unity is idle'
        });
        return true;
    }

    if (lowerCaseCommand.includes('copy image') || lowerCaseCommand.includes('copy this image')) {
        copyImageToClipboard();
        return true;
    }

    if (lowerCaseCommand.includes('save image') || lowerCaseCommand.includes('download image')) {
        saveImage();
        return true;
    }

    if (lowerCaseCommand.includes('open image') || lowerCaseCommand.includes('open this image')) {
        openImageInNewTab();
        return true;
    }

    if (lowerCaseCommand.includes('use flux model') || lowerCaseCommand.includes('switch to flux')) {
        currentImageModel = 'flux';
        speak('Image model set to flux.');
        return true;
    }

    if (lowerCaseCommand.includes('use turbo model') || lowerCaseCommand.includes('switch to turbo')) {
        currentImageModel = 'turbo';
        speak('Image model set to turbo.');
        return true;
    }

    if (lowerCaseCommand.includes('use kontext model') || lowerCaseCommand.includes('switch to kontext')) {
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

const POLLINATIONS_TEXT_URL = 'https://text.pollinations.ai/openai';
const UNITY_REFERRER = 'https://www.unityailab.com/';

function shouldUseUnityReferrer() {
    if (typeof window === 'undefined') {
        return true;
    }

    try {
        const unityOrigin = new URL(UNITY_REFERRER).origin;
        return window.location.origin === unityOrigin;
    } catch (error) {
        console.error('Failed to parse UNITY_REFERRER:', error);
        return false;
    }
}

async function getAIResponse(userInput) {
    console.log(`Sending to AI: ${userInput}`);

    chatHistory.push({ role: 'user', content: userInput });

    if (chatHistory.length > 12) {
        chatHistory.splice(0, chatHistory.length - 12);
    }

    let aiText = '';

    try {
        const messages = [{ role: 'system', content: systemPrompt }, ...chatHistory];

        const pollinationsPayload = JSON.stringify({
            messages,
            model: 'unity'
        });

        const useUnityReferrer = shouldUseUnityReferrer();

        if (!useUnityReferrer) {
            console.warn(
                'Pollinations referrer header disabled because the app is not '
                + 'being served from https://www.unityailab.com/'
            );
        }

        const textResponse = await fetch(POLLINATIONS_TEXT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // Explicitly identify the Unity AI Lab referrer so the public
            // Pollinations endpoint treats the request as coming from the
            // approved web client even when running the app from localhost.
            referrer: UNITY_REFERRER,
            referrerPolicy: 'strict-origin-when-cross-origin',
            body: pollinationsPayload,
            ...(useUnityReferrer
                ? {}
                : {
                      referrer: 'no-referrer',
                      referrerPolicy: 'no-referrer'
                  })
        });

        if (!textResponse.ok) {
            throw new Error(`Pollinations text API returned ${textResponse.status}`);
        }

        const data = await textResponse.json();
        aiText = data.choices?.[0]?.message?.content ?? '';

        if (!aiText) {
            throw new Error('Received empty response from Pollinations AI');
        }

        chatHistory.push({ role: 'assistant', content: aiText });
        speak(aiText);
    } catch (error) {
        console.error('Error getting text from Pollinations AI:', error);
        setCircleState(aiCircle, {
            error: true,
            label: 'Unity could not respond'
        });
        speak("Sorry, I couldn't get a text response.");
        setTimeout(() => {
            setCircleState(aiCircle, {
                error: false,
                label: 'Unity is idle'
            });
        }, 2400);
    }

    try {
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
            userInput
        )}?model=${currentImageModel}&referrer=unityailab.com`;
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
    return backgroundImage.slice(5, -2);
}

async function copyImageToClipboard() {
    const imageUrl = getImageUrl();
    if (!imageUrl) {
        return;
    }

    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        speak('Image copied to clipboard.');
    } catch (error) {
        console.error('Failed to copy image: ', error);
        speak('Sorry, I could not copy the image. This might be due to browser limitations.');
    }
}

async function saveImage() {
    const imageUrl = getImageUrl();
    if (!imageUrl) {
        return;
    }

    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        link.download = 'pollination_image.png';
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
        speak('Image saved.');
    } catch (error) {
        console.error('Failed to save image: ', error);
        speak('Sorry, I could not save the image.');
    }
}

function openImageInNewTab() {
    const imageUrl = getImageUrl();
    if (!imageUrl) {
        return;
    }

    window.open(imageUrl, '_blank');
    speak('Image opened in new tab.');
}
