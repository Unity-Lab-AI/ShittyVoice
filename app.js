
const visualization = document.getElementById('visualization');
const background = document.getElementById('background');
const muteIndicator = document.getElementById('mute-indicator');
let currentImageModel = 'flux';
let chatHistory = [];
let systemPrompt = "";

// --- App Initialization ---
window.onload = async () => {
    // Fetch the system prompt
    try {
        const response = await fetch('ai-instruct.txt');
        systemPrompt = await response.text();
    } catch (error) {
        console.error('Error fetching system prompt:', error);
        systemPrompt = "You are Unity, a helpful AI assistant."; // Fallback prompt
    }

    initializeVoiceControl();\r\n};

async function initializeVoiceControl() {
    if (!recognition) {
        console.error('Speech recognition is not supported in this browser.');
        alert('Speech recognition is not supported in this browser.');
        return;
    }

    const granted = await requestMicPermission();
    if (!granted) {
        alert('Microphone access is required for voice control.');
        return;
    }

    if (!isMuted) {
        recognition.start();
    }

    updateMuteIndicator();
}

async function requestMicPermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Microphone access is not supported in this browser.');
        return false;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (error) {
        console.error('Microphone permission denied:', error);
        return false;
    }
}

// --- Speech Recognition ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        console.log('Voice recognition started.');
        visualization.style.borderColor = '#ff0000'; // Red when listening
    };

    recognition.onend = () => {
        console.log('Voice recognition stopped.');
        visualization.style.borderColor = '#ffffff'; // White when not listening
        // Restart recognition if it stops unexpectedly
        if (!isMuted) {
            recognition.start();
        }
    };

    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        console.log('User said:', transcript);
        const isLocalCommand = handleVoiceCommand(transcript);
        // If it's not a local command, send it to the AI model
        if (!isLocalCommand) {
            getAIResponse(transcript);
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
    };

} else {
    console.error('Speech recognition not supported in this browser.');
    alert('Speech recognition not supported in this browser.');
}

// --- Speech Synthesis ---
const synth = window.speechSynthesis;
let isMuted = false;

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

if (muteIndicator) {
    muteIndicator.addEventListener('click', () => {
        if (isMuted) {
            isMuted = false;
            updateMuteIndicator();
            if (recognition) {
                recognition.start();
            }
        }
    });
}

function speak(text) {
    if (synth.speaking) {
        console.error('Speech synthesis is already speaking.');
        return;
    }
    if (text !== '') {
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = synth.getVoices();
        const ukFemaleVoice = voices.find(voice => voice.name.includes('Google UK English Female') || voice.lang === 'en-GB' && voice.gender === 'female');
        
        if (ukFemaleVoice) {
            utterance.voice = ukFemaleVoice;
        } else {
            // Fallback to default voice if UK female voice is not found
            console.warn("UK English female voice not found, using default.");
        }

        utterance.onstart = () => {
            console.log('AI is speaking...');
            visualization.style.animation = 'pulse 1s infinite';
        };

        utterance.onend = () => {
            console.log('AI finished speaking.');
            visualization.style.animation = '';
        };
        
        synth.speak(utterance);
    }
}

// --- Voice Commands ---
function handleVoiceCommand(command) {
    const lowerCaseCommand = command.toLowerCase();
    if (lowerCaseCommand.includes('mute my mic') || lowerCaseCommand.includes('mute microphone')) {
        isMuted = true;
        recognition.stop();
        speak("Microphone muted.");
        updateMuteIndicator();
        return true;
    } else if (lowerCaseCommand.includes('unmute my mic') || lowerCaseCommand.includes('unmute microphone')) {
        isMuted = false;
        recognition.start();
        speak("Microphone unmuted.");
        updateMuteIndicator();
        return true;
    } else if (lowerCaseCommand.includes('shut up') || lowerCaseCommand.includes('be quiet')) {
        synth.cancel();
        return true;
    } else if (lowerCaseCommand.includes('copy image') || lowerCaseCommand.includes('copy this image')) {
        copyImageToClipboard();
        return true;
    } else if (lowerCaseCommand.includes('save image') || lowerCaseCommand.includes('download image')) {
        saveImage();
        return true;
    } else if (lowerCaseCommand.includes('open image') || lowerCaseCommand.includes('open this image')) {
        openImageInNewTab();
        return true;
    } else if (lowerCaseCommand.includes('use flux model') || lowerCaseCommand.includes('switch to flux')) {
        currentImageModel = 'flux';
        speak("Image model set to flux.");
        return true;
    } else if (lowerCaseCommand.includes('use turbo model') || lowerCaseCommand.includes('switch to turbo')) {
        currentImageModel = 'turbo';
        speak("Image model set to turbo.");
        return true;
    } else if (lowerCaseCommand.includes('use kontext model') || lowerCaseCommand.includes('switch to kontext')) {
        currentImageModel = 'kontext';
        speak("Image model set to kontext.");
        return true;
    } else if (lowerCaseCommand.includes('clear history') || lowerCaseCommand.includes('delete history') || lowerCaseCommand.includes('clear chat')) {
        chatHistory = [];
        speak("Chat history cleared.");
        return true;
    }
    return false;
}

// --- AI Model Interaction ---
async function getAIResponse(userInput) {
    console.log(`Sending to AI: ${userInput}`);

    // Add user message to chat history
    chatHistory.push({ role: "user", content: userInput });

    // Keep only the last 12 messages (excluding the system prompt)
    if (chatHistory.length > 12) {
        chatHistory.splice(0, chatHistory.length - 12);
    }

    let aiText = "";

    // 1. Get text response from Pollinations AI (unity model)
    try {
        const messages = [
            { role: "system", content: systemPrompt },
            ...chatHistory
        ];

        const textResponse = await fetch('https://text.pollinations.ai/openai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "messages": messages,
                "model": "unity"
            })
        });

        const data = await textResponse.json();
        aiText = data.choices[0].message.content;

        // Add AI response to chat history
        chatHistory.push({ role: "assistant", content: aiText });

        // Speak the AI's text response
        speak(aiText);

    } catch (error) {
        console.error('Error getting text from Pollinations AI:', error);
        speak("Sorry, I couldn't get a text response.");
    }

    // 2. Get image from Pollinations AI (using the current image model)
    try {
        // Use the user's input as the prompt for image generation
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(userInput)}?model=${currentImageModel}`;
        background.style.backgroundImage = `url(${imageUrl})`;
    } catch (error) {
        console.error('Error getting image from Pollinations AI:', error);
        // You might want to set a default background image here
    }
}\n


// --- App Initialization ---


// --- Image Actions (Voice Controlled) ---

function getImageUrl() {
    const style = window.getComputedStyle(background);
    const backgroundImage = style.getPropertyValue('background-image');
    // Extract URL from 'url("...")'
    return backgroundImage.slice(5, -2);
}

async function copyImageToClipboard() {
    const imageUrl = getImageUrl();
    if (imageUrl) {
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            speak('Image copied to clipboard.');
        } catch (err) {
            console.error('Failed to copy image: ', err);
            speak('Sorry, I could not copy the image. This might be due to browser limitations.');
        }
    }
}

async function saveImage() {
    const imageUrl = getImageUrl();
    if (imageUrl) {
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'pollination_image.png'; // Or generate a more descriptive name
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            speak('Image saved.');
        } catch (err) {
            console.error('Failed to save image: ', err);
            speak('Sorry, I could not save the image.');
        }
    }
}

function openImageInNewTab() {
    const imageUrl = getImageUrl();
    if (imageUrl) {
        window.open(imageUrl, '_blank');
        speak('Image opened in new tab.');
    }
}






