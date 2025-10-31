const visualization = document.getElementById('visualization');
const background = document.getElementById('background');
const muteIndicator = document.getElementById('mute-indicator');

let currentImageModel = 'flux';
let chatHistory = [];
let systemPrompt = '';
let recognition = null;
let isMuted = true;
let hasMicPermission = false;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

window.addEventListener('load', async () => {
    await loadSystemPrompt();
    setupSpeechRecognition();
    updateMuteIndicator();
    await initializeVoiceControl();
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

function setupSpeechRecognition() {
    if (!SpeechRecognition) {
        console.error('Speech recognition is not supported in this browser.');
        alert('Speech recognition is not supported in this browser.');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        console.log('Voice recognition started.');
        if (visualization) {
            visualization.style.borderColor = '#ff0000';
        }
    };

    recognition.onend = () => {
        console.log('Voice recognition stopped.');
        if (visualization) {
            visualization.style.borderColor = '#ffffff';
        }

        if (!isMuted) {
            try {
                recognition.start();
            } catch (error) {
                console.error('Failed to restart recognition:', error);
            }
        }
    };

    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        console.log('User said:', transcript);
        const isLocalCommand = handleVoiceCommand(transcript);
        if (!isLocalCommand) {
            getAIResponse(transcript);
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
    };
}

async function initializeVoiceControl() {
    if (!recognition) {
        return;
    }

    hasMicPermission = await requestMicPermission();
    if (!hasMicPermission) {
        alert('Microphone access is required for voice control.');
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
        return false;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        return true;
    } catch (error) {
        console.error('Microphone permission denied:', error);
        return false;
    }
}

function updateMuteIndicator() {
    if (!muteIndicator) {
        return;
    }

    if (isMuted) {
        muteIndicator.classList.remove('hidden');
    } else {
        muteIndicator.classList.add('hidden');
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
    updateMuteIndicator();
    try {
        recognition.start();
    } catch (error) {
        console.error('Failed to start recognition:', error);
    }
}

if (muteIndicator) {
    muteIndicator.addEventListener('click', async (event) => {
        event.stopPropagation();
        await attemptUnmute();
    });
}

document.addEventListener('click', async () => {
    await attemptUnmute();
});

const synth = window.speechSynthesis;

function speak(text) {
    if (synth.speaking) {
        console.error('Speech synthesis is already speaking.');
        return;
    }

    if (text !== '') {
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
            if (visualization) {
                visualization.style.animation = 'pulse 1s infinite';
            }
        };

        utterance.onend = () => {
            console.log('AI finished speaking.');
            if (visualization) {
                visualization.style.animation = '';
            }
        };

        synth.speak(utterance);
    }
}

function handleVoiceCommand(command) {
    const lowerCaseCommand = command.toLowerCase();

    if (lowerCaseCommand.includes('mute my mic') || lowerCaseCommand.includes('mute microphone')) {
        isMuted = true;
        updateMuteIndicator();
        if (recognition) {
            recognition.stop();
        }
        speak('Microphone muted.');
        return true;
    }

    if (lowerCaseCommand.includes('unmute my mic') || lowerCaseCommand.includes('unmute microphone')) {
        isMuted = false;
        updateMuteIndicator();
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

async function getAIResponse(userInput) {
    console.log(`Sending to AI: ${userInput}`);

    chatHistory.push({ role: 'user', content: userInput });

    if (chatHistory.length > 12) {
        chatHistory.splice(0, chatHistory.length - 12);
    }

    let aiText = '';

    try {
        const messages = [{ role: 'system', content: systemPrompt }, ...chatHistory];

        const textResponse = await fetch('https://text.pollinations.ai/openai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages,
                model: 'unity'
            })
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
