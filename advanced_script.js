// DOM Elements
const voiceButton = document.getElementById('voiceButton');
const documentUpload = document.getElementById('documentUpload');
const uploadStatus = document.getElementById('uploadStatus');
const statusDiv = document.getElementById('status');

// State variables
let documentContent = '';
let documentTitle = '';
let isListening = false;
let recognition = null;
let synthesis = window.speechSynthesis;
let documentVectors = [];
let queryCache = {};
let voiceOptions = [];
let selectedVoice = null;
let structuredResponses = null; // For storing structured responses from JSON

// ElevenLabs variables
let elevenLabsApiKey = ''; 
let elevenLabsVoiceId = 'TnVT7p6RBpw3AtQyx4cd'; // Using only this voice
let useElevenLabs = true;

// Voice control variables
let currentAudio = null;
let isSpeaking = false;
let audioQueue = [];
let processingVoiceRequest = false;

// Load PDF.js
const pdfjsLib = window.pdfjsLib;
if (pdfjsLib) {
    // Set worker source
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Initialize speech recognition
function initSpeechRecognition() {
    // Check browser support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('Your browser does not support speech recognition. Try Chrome or Edge.');
        return false;
    }
    
    // Create speech recognition instance
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    // Handle results
    recognition.onresult = function(event) {
        const rawTranscript = event.results[0][0].transcript.trim();
        
        // Fix common speech recognition issues
        let transcript = rawTranscript;
        
        // Special case for "I" vs "hi" - very common recognition error
        if (transcript.toLowerCase() === 'i' || transcript.toLowerCase() === 'i.') {
            transcript = 'hi';
            console.log('Corrected transcript from "I" to "hi"');
        }
        
        showStatus(`You said: ${transcript}`, 'query');
        
        // Process query and respond
        processQuery(transcript);
    };
    
    // Handle errors
    recognition.onerror = function(event) {
        console.error('Speech recognition error', event.error);
        voiceButton.classList.remove('listening');
        isListening = false;
        showStatus('Error: ' + event.error, 'error');
    };
    
    // Handle end of speech
    recognition.onend = function() {
        voiceButton.classList.remove('listening');
        isListening = false;
    };
    
    return true;
}

// Initialize speech synthesis
function initSpeechSynthesis() {
    if (!synthesis) {
        console.error('Speech synthesis not supported');
        return;
    }
    
    // Get available voices
    function loadVoices() {
        voiceOptions = synthesis.getVoices();
        
        // Select a default voice (preferably a female English voice)
        selectedVoice = voiceOptions.find(voice => 
            voice.lang.includes('en-') && voice.name.includes('Female')
        ) || voiceOptions.find(voice => 
            voice.lang.includes('en-')
        ) || voiceOptions[0];
        
        console.log('Available voices:', voiceOptions.length);
        console.log('Selected voice:', selectedVoice ? selectedVoice.name : 'None');
    }
    
    if (synthesis.onvoiceschanged !== undefined) {
        synthesis.onvoiceschanged = loadVoices;
    }
    
    loadVoices();
}

// Load configurations from server
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const config = await response.json();
            elevenLabsApiKey = config.elevenlabsApiKey;
            elevenLabsVoiceId = config.elevenlabsVoiceId || elevenLabsVoiceId;
            useElevenLabs = true;
            console.log('ElevenLabs configuration loaded from server');
        } else {
            console.error('Failed to load config from server. Using browser speech.');
            useElevenLabs = false;
        }
    } catch (error) {
        console.error('Error loading config:', error);
        useElevenLabs = false;
    }
    
    // Load structured responses
    try {
        console.log('Loading structured responses...');
        const response = await fetch('/documents/maddox_responses.json');
        
        if (response.ok) {
            structuredResponses = await response.json();
            console.log('Structured responses loaded successfully:', structuredResponses);
            
            // Validate the structure
            if (!structuredResponses.categories || !structuredResponses.categories.greetings) {
                console.error('Structured responses file is missing expected categories');
                console.log('Loaded JSON structure:', JSON.stringify(structuredResponses, null, 2));
            } else {
                console.log('Verified structured responses categories:', Object.keys(structuredResponses.categories));
                console.log('Greetings available:', Object.keys(structuredResponses.categories.greetings.questions));
            }
            
            // Set the voice ID from the JSON if available
            if (structuredResponses.metadata && structuredResponses.metadata.voiceId) {
                elevenLabsVoiceId = structuredResponses.metadata.voiceId;
                console.log('Using voice ID from structured responses:', elevenLabsVoiceId);
            }
        } else {
            console.error('Failed to load structured responses, status:', response.status);
        }
    } catch (error) {
        console.error('Error loading structured responses:', error);
    }
}

// Setup ElevenLabs API
function setupElevenLabs() {
    // Add ElevenLabs settings to the UI
    const settingsButton = document.createElement('button');
    settingsButton.innerHTML = '<i class="fas fa-cog"></i> Voice Settings';
    settingsButton.className = 'upload-button';
    settingsButton.style.marginTop = '20px';
    settingsButton.style.background = '#7f8c8d';
    
    const uploadForm = document.getElementById('upload-form');
    if (uploadForm) {
        uploadForm.appendChild(settingsButton);
    }
    
    settingsButton.addEventListener('click', showVoiceSettings);
}

// Show voice settings dialog
function showVoiceSettings() {
    const settingsDialog = document.createElement('div');
    settingsDialog.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000;">
            <div style="background: white; padding: 25px; border-radius: 8px; width: 500px; max-width: 90%; position: relative;">
                <span style="position: absolute; top: 10px; right: 15px; font-size: 24px; cursor: pointer;">&times;</span>
                <h3 style="margin-top: 0;">Voice Settings</h3>
                
                <div style="margin-bottom: 20px;">
                    <h4>ElevenLabs Text-to-Speech</h4>
                    <p style="font-size: 14px; color: #666;">For premium quality voices, including voice cloning.</p>
                    <label style="display: block; margin-bottom: 5px;">Voice ID:</label>
                    <input type="text" id="voiceIdInput" placeholder="Voice ID (leave empty for default)" 
                           style="width: 100%; padding: 8px; margin-bottom: 10px;"
                           value="${elevenLabsVoiceId !== 'EXAVITQu4vr4xnSDxMaL' ? elevenLabsVoiceId : ''}">
                    
                    <div style="display: flex; align-items: center; margin-top: 10px;">
                        <input type="checkbox" id="useElevenLabsCheck" ${useElevenLabs ? 'checked' : ''}>
                        <label for="useElevenLabsCheck" style="margin-left: 5px;">Use ElevenLabs for voice output</label>
                    </div>
                    
                    <p style="font-size: 12px; margin-top: 15px;">
                        <a href="https://elevenlabs.io" target="_blank">Get API Key</a> | 
                        <a href="https://elevenlabs.io/app/voice-lab" target="_blank">Clone Your Voice</a>
                    </p>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h4>Browser Voice (Fallback)</h4>
                    <p style="font-size: 14px; color: #666;">Uses your browser's built-in text-to-speech.</p>
                    <select id="browserVoiceSelect" style="width: 100%; padding: 8px;">
                        <option value="">Loading voices...</option>
                    </select>
                </div>
                
                <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
                    <button id="cancelVoiceSettings" style="padding: 8px 16px; margin-right: 10px;">Cancel</button>
                    <button id="saveVoiceSettings" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px;">Save Settings</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(settingsDialog);
    
    // Handle close by X button
    settingsDialog.querySelector('span').addEventListener('click', function() {
        document.body.removeChild(settingsDialog);
    });
    
    // Populate browser voices
    const voiceSelect = document.getElementById('browserVoiceSelect');
    voiceSelect.innerHTML = '';
    
    // Add available browser voices
    voiceOptions.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        
        if (selectedVoice && voice.name === selectedVoice.name) {
            option.selected = true;
        }
        
        voiceSelect.appendChild(option);
    });
    
    // Cancel button
    document.getElementById('cancelVoiceSettings').addEventListener('click', function() {
        document.body.removeChild(settingsDialog);
    });
    
    // Save settings
    document.getElementById('saveVoiceSettings').addEventListener('click', function() {
        const voiceId = document.getElementById('voiceIdInput').value.trim();
        const useEleven = document.getElementById('useElevenLabsCheck').checked;
        const selectedBrowserVoiceName = document.getElementById('browserVoiceSelect').value;
        
        // Update ElevenLabs settings
        useElevenLabs = useEleven;
        
        if (voiceId) {
            elevenLabsVoiceId = voiceId;
            localStorage.setItem('elevenLabsVoiceId', voiceId);
        }
        
        // Update browser voice selection
        if (selectedBrowserVoiceName) {
            selectedVoice = voiceOptions.find(voice => voice.name === selectedBrowserVoiceName);
        }
        
        document.body.removeChild(settingsDialog);
        showStatus('Voice settings updated!', 'success');
    });
}

// Check if a string contains mostly printable ASCII characters (basic text validation)
function isPrintableAscii(str) {
    if (!str || str.length === 0) return false;
    
    // Count printable characters
    let printableCount = 0;
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if ((code >= 32 && code <= 126) || // Basic ASCII printable
            (code === 9) || (code === 10) || (code === 13)) { // Tab, LF, CR
            printableCount++;
        }
    }
    
    // If over 80% is printable, consider it text
    return (printableCount / str.length) > 0.8;
}

// Parse PDF file and extract text
async function parsePdfFile(file) {
    try {
        uploadStatus.textContent = 'Processing PDF file...';
        
        // Check if PDF.js is available
        if (!pdfjsLib) {
            throw new Error('PDF.js library not loaded. Cannot process PDF files.');
        }
        
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Load PDF document
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        uploadStatus.textContent = `PDF loaded. Extracting text from ${pdf.numPages} pages...`;
        
        // Extract text from all pages
        let extractedText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
            // Update status with progress
            uploadStatus.textContent = `Extracting text: page ${i} of ${pdf.numPages}`;
            
            // Get page
            const page = await pdf.getPage(i);
            
            // Extract text content
            const textContent = await page.getTextContent();
            
            // Concatenate text items
            const pageText = textContent.items.map(item => item.str).join(' ');
            
            // Add page text to extracted text
            extractedText += pageText + '\n\n';
        }
        
        // Check if any text was extracted
        if (!extractedText.trim()) {
            throw new Error('No text content found in PDF. The file might be scanned or contain only images.');
        }
        
        uploadStatus.textContent = 'PDF text extraction complete!';
        return extractedText;
    } catch (error) {
        console.error('PDF parsing error:', error);
        throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
}

// Check if content contains binary data (common in PDFs, images, etc.)
function containsBinaryData(str) {
    // Check for common PDF header
    if (str.startsWith('%PDF-')) {
        return true;
    }
    
    // Check for other binary file signatures
    const binarySignatures = [
        '\x89PNG', // PNG
        'GIF8',    // GIF
        '\xFF\xD8\xFF', // JPEG
        'PK\x03\x04', // ZIP/DOCX/etc
        'BM',      // BMP
        '\x00\x01\x00\x00', // ICO
        '{\rtf',   // RTF
        '\x25\x21\x50\x53', // PS
        '\x7FELF'  // ELF
    ];
    
    for (const sig of binarySignatures) {
        if (str.indexOf(sig) === 0) {
            return true;
        }
    }
    
    // Count non-printable characters in the first 1000 chars
    const sampleSize = Math.min(1000, str.length);
    let nonPrintableCount = 0;
    
    for (let i = 0; i < sampleSize; i++) {
        const code = str.charCodeAt(i);
        // Count control characters (except common whitespace)
        if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || 
            (code >= 127 && code <= 159)) {
            nonPrintableCount++;
        }
    }
    
    // If more than 10% of characters are non-printable, likely binary
    return (nonPrintableCount / sampleSize) > 0.1;
}

// Handle document upload with improved error handling
documentUpload.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) {
        uploadStatus.textContent = 'No file selected.';
        return;
    }
    
    console.log(`File selected: ${file.name}, type: ${file.type}, size: ${file.size} bytes`);
    uploadStatus.textContent = `Reading document: ${file.name}...`;
    documentTitle = file.name;
    
    // Validate file size
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
        uploadStatus.textContent = 'File too large. Please upload a smaller document (under 10MB).';
        return;
    }
    
    // Check file type
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const validTextTypes = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];
    const isText = validTextTypes.includes(file.type) || (!file.type && file.name.toLowerCase().endsWith('.txt'));
    
    if (!isPdf && !isText) {
        uploadStatus.textContent = `Unsupported file type: ${file.type || 'unknown'}. Please upload a text or PDF file.`;
        console.warn(`Attempted to upload unsupported file type: ${file.type || 'unknown'}`);
        return;
    }
    
    // Process based on file type
    if (isPdf) {
        // Handle PDF file
        parsePdfFile(file)
            .then(extractedText => {
                documentContent = extractedText;
                console.log(`PDF processed successfully. Extracted ${extractedText.length} characters.`);
                uploadStatus.textContent = `Document "${file.name}" loaded successfully!`;
                
                // Enable voice button
                voiceButton.style.opacity = 1;
                voiceButton.style.pointerEvents = 'auto';
                
                // Process document for advanced features
                processDocument();
                
                // Speak welcome message
                speakResponse('PDF document loaded. Click the button and ask me anything about it.');
            })
            .catch(error => {
                console.error('PDF processing error:', error);
                uploadStatus.textContent = error.message;
                documentContent = '';
            });
    } else {
        // Handle text file
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                documentContent = e.target.result;
                
                // Validate content
                if (!documentContent || documentContent.trim().length === 0) {
                    uploadStatus.textContent = 'The document appears to be empty.';
                    console.error('Empty document content after reading file');
                    return;
                }
                
                // Check for binary content that might indicate a non-text file
                if (containsBinaryData(documentContent)) {
                    uploadStatus.textContent = 'This file contains binary data and cannot be processed. Please upload a plain text file.';
                    console.error('Binary data detected in file');
                    documentContent = '';
                    return;
                }
                
                // Basic validation that it's actually text content
                if (documentContent.length > 0 && isPrintableAscii(documentContent.substring(0, 100))) {
                    console.log(`Document loaded successfully. Content length: ${documentContent.length} characters`);
                    uploadStatus.textContent = `Document "${file.name}" loaded successfully!`;
                    
                    // Enable voice button
                    voiceButton.style.opacity = 1;
                    voiceButton.style.pointerEvents = 'auto';
                    
                    // Process document for advanced features
                    processDocument();
                    
                    // Speak welcome message
                    speakResponse('Document loaded. Click the button and ask me anything about it.');
                } else {
                    uploadStatus.textContent = 'The document contains non-text content that cannot be processed.';
                    console.error('Non-text content detected in file');
                    documentContent = ''; // Reset the content
                }
            } catch (error) {
                console.error('Error processing document:', error);
                uploadStatus.textContent = `Error processing document: ${error.message}`;
                documentContent = ''; // Reset the content
            }
        };
        
        reader.onerror = function(error) {
            console.error('FileReader error:', error);
            uploadStatus.textContent = `Error reading file: ${error.message || 'Unknown error'}`;
        };
        
        reader.onprogress = function(event) {
            if (event.lengthComputable) {
                const percentLoaded = Math.round((event.loaded / event.total) * 100);
                if (percentLoaded < 100) {
                    uploadStatus.textContent = `Loading: ${percentLoaded}%`;
                }
            }
        };
        
        // Read as text
        reader.readAsText(file);
    }
});

// Process uploaded document
function processDocument() {
    try {
        if (!documentContent || documentContent.trim().length === 0) {
            console.error('Cannot process document: empty content');
            return;
        }
        
        // Split into sections and sentences
        const sections = documentContent.split(/\n\n+/);
        const processedSections = sections.map((section, index) => {
            const sentences = section.split(/[.!?]+/).filter(s => s.trim().length > 0);
            return {
                id: index,
                title: sentences[0]?.trim() || `Section ${index + 1}`,
                content: section,
                sentences: sentences.map(s => s.trim())
            };
        });
        
        // Store processed document
        documentVectors = processedSections;
        
        // Clear any previous cache
        queryCache = {};
        
        console.log(`Processed document with ${documentVectors.length} sections and ${documentVectors.reduce((count, section) => count + section.sentences.length, 0)} sentences`);
    } catch (error) {
        console.error('Error processing document structure:', error);
        // Create a fallback simple structure
        documentVectors = [{
            id: 0,
            title: 'Document',
            content: documentContent,
            sentences: documentContent.split(/[.!?]+/).filter(s => s.trim().length > 0).map(s => s.trim())
        }];
    }
}

// Voice button click handler with improved document validation
voiceButton.addEventListener('click', function() {
    if (!documentContent || documentContent.trim().length === 0) {
        showStatus('Please upload a valid document first.', 'error');
        speakResponse('Please upload a valid document first.');
        console.warn('Voice button clicked but no document content available');
        
        // Reset and prompt for upload
        voiceButton.style.opacity = 0.5;
        voiceButton.style.pointerEvents = 'none';
        uploadStatus.textContent = 'Please upload a document.';
        return;
    }
    
    if (!recognition && !initSpeechRecognition()) {
        return;
    }
    
    if (!isListening) {
        // Start listening
        recognition.start();
        voiceButton.classList.add('listening');
        isListening = true;
        showStatus('Listening...', 'listening');
    }
});

// Process user query
function processQuery(query) {
    // Check cache first
    if (queryCache[query]) {
        speakResponse(queryCache[query]);
        return;
    }
    
    // Special commands
    if (query.toLowerCase().includes('help')) {
        const helpMessage = "You can ask me anything about the document you've uploaded. Try asking specific questions about the content.";
        speakResponse(helpMessage);
        return;
    }
    
    if (query.toLowerCase().includes('what is this document about')) {
        const summary = documentVectors.length > 0 ? 
            `This document is titled "${documentTitle}" and covers ${documentVectors[0].title}.` :
            `This document is titled "${documentTitle}".`;
        speakResponse(summary);
        return;
    }
    
    // Try to find a match in structured responses
    if (structuredResponses) {
        const structuredResponse = findStructuredResponse(query);
        if (structuredResponse) {
            // Cache result
            queryCache[query] = structuredResponse;
            
            // Speak response
            speakResponse(structuredResponse);
            return;
        }
    }
    
    // Normal search
    const answer = findAnswer(query);
    
    // Cache result
    queryCache[query] = answer;
    
    // Speak response
    speakResponse(answer);
}

// Find a response from structured data
function findStructuredResponse(query) {
    if (!structuredResponses || !structuredResponses.categories) {
        return null;
    }
    
    // Clean the query for matching
    const cleanQuery = query.toLowerCase().trim()
        .replace(/[?.,!;:'"]/g, '')
        .replace(/\s+/g, ' ');
    
    console.log('Looking for structured response for:', cleanQuery);
    
    // Special case for very short greetings
    if (cleanQuery === 'hi' || cleanQuery === 'hello' || cleanQuery === 'hey' || cleanQuery === 'yo' || cleanQuery === 'whats up') {
        console.log('Detected greeting:', cleanQuery);
        
        const greetings = structuredResponses.categories.greetings;
        if (greetings && greetings.questions) {
            console.log('Available greetings in JSON:', Object.keys(greetings.questions));
            
            // Direct lookup for exact matches
            if (greetings.questions[cleanQuery]) {
                console.log('Found exact greeting match for:', cleanQuery);
                return greetings.questions[cleanQuery];
            }
            
            // Try with underscores for whats up -> whats_up
            if (cleanQuery === 'whats up' && greetings.questions['whats_up']) {
                console.log('Found match for whats_up');
                return greetings.questions['whats_up'];
            }
            
            // For any greeting, just return the first available greeting response
            for (const key of Object.keys(greetings.questions)) {
                if (key === 'hi' || key === 'hello' || key === 'hey' || key === 'whats_up') {
                    console.log('Returning greeting response for key:', key);
                    return greetings.questions[key];
                }
            }
            
            // Last resort - return any greeting
            const firstGreeting = Object.keys(greetings.questions)[0];
            if (firstGreeting) {
                console.log('Using first available greeting:', firstGreeting);
                return greetings.questions[firstGreeting];
            }
        } else {
            console.warn('No greetings category found in structured responses');
        }
    }
    
    // Search all categories for exact question matches
    for (const categoryKey in structuredResponses.categories) {
        const category = structuredResponses.categories[categoryKey];
        
        // Skip if no questions in this category
        if (!category.questions) continue;
        
        // Check for exact question matches
        for (const questionKey in category.questions) {
            // Clean the question for matching
            const cleanQuestionKey = questionKey.toLowerCase()
                .replace(/_/g, ' ');
            
            // Check for close match
            if (cleanQuery.includes(cleanQuestionKey) || 
                cleanQuestionKey.includes(cleanQuery) ||
                calculateSimilarity(cleanQuery, cleanQuestionKey) > 0.7) {
                console.log('Found question match:', questionKey);
                return category.questions[questionKey];
            }
        }
        
        // Check if query contains the category title
        if (cleanQuery.includes(category.title.toLowerCase())) {
            // Return the general category content
            console.log('Found category match:', category.title);
            return category.content;
        }
    }
    
    // Keywords search as a fallback
    const queryWords = cleanQuery.split(' ').filter(word => word.length > 3);
    
    // Check against questions
    for (const categoryKey in structuredResponses.categories) {
        const category = structuredResponses.categories[categoryKey];
        
        if (!category.questions) continue;
        
        for (const questionKey in category.questions) {
            const cleanQuestionKey = questionKey.toLowerCase().replace(/_/g, ' ');
            
            // Check if any significant query words match the question
            if (queryWords.some(word => cleanQuestionKey.includes(word))) {
                console.log('Found keyword match:', questionKey);
                return category.questions[questionKey];
            }
        }
    }
    
    // Return a fallback response if available
    if (structuredResponses.categories.general && 
        structuredResponses.categories.general.fallbacks) {
        console.log('Using fallback response');
        return structuredResponses.categories.general.fallbacks.unknown_question;
    }
    
    console.log('No structured response found');
    return null;
}

// Calculate text similarity (simple version)
function calculateSimilarity(text1, text2) {
    const words1 = text1.split(' ');
    const words2 = text2.split(' ');
    
    let matches = 0;
    for (const word of words1) {
        if (word.length > 3 && words2.includes(word)) {
            matches++;
        }
    }
    
    return matches / Math.max(words1.length, words2.length);
}

// Find answer in document using improved algorithm
function findAnswer(query) {
    query = query.toLowerCase();
    
    // Ensure we have document content
    if (!documentContent || documentContent.trim().length === 0) {
        console.error('No document content available when searching for answer');
        return "I don't have any information available. Please make sure the Maddox document is properly loaded.";
    }
    
    // Convert document content to lowercase for case-insensitive matching
    const docContentLower = documentContent.toLowerCase();
    
    // Extract important words from query (exclude common words)
    const stopWords = ['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'and', 'in', 'that', 'have', 'it', 'for', 'on', 'with', 'you', 'your', 'me', 'my', 'i', 'we', 'our', 'us', 'they', 'their', 'them'];
    const queryWords = query.split(/\s+/).filter(word => 
        word.length > 2 && !stopWords.includes(word)
    );
    
    if (queryWords.length === 0) {
        return "I can only answer questions about Maddox based on the document content. Please ask a specific question about Maddox's thoughts, projects, or ideas.";
    }
    
    // Check if any keywords appear in the document at all
    const keywordPresent = queryWords.some(word => docContentLower.includes(word));
    
    if (!keywordPresent) {
        return "I don't have information about that topic in the Maddox document. I can only answer questions based on the specific content in the document. Please ask about AI adoption, hardware products, AR/VR, mentorship, or other topics mentioned in Maddox's text.";
    }
    
    // Check if document vectors are available
    if (!documentVectors || documentVectors.length === 0) {
        console.warn('No document vectors available for search');
        return "I couldn't properly process the Maddox document. Please try reloading the page.";
    }
    
    console.log(`Searching for query: "${query}" with keywords: [${queryWords.join(', ')}]`);
    
    // Search through all sentences in all sections
    let bestMatches = [];
    
    // First pass: exact phrase match
    if (query.length > 10) {
        documentVectors.forEach(section => {
            if (section.content.toLowerCase().includes(query)) {
                bestMatches.push({
                    sentence: findSentenceWithPhrase(section.content, query),
                    score: 100,
                    section: section.title
                });
            }
        });
    }
    
    // Second pass: keyword matching if no exact matches
    if (bestMatches.length === 0) {
        let allSentences = [];
        
        documentVectors.forEach(section => {
            section.sentences.forEach(sentence => {
                const text = sentence.toLowerCase();
                
                // Count word matches
                let score = 0;
                let matchedWords = 0;
                let matchedWordsSet = new Set();
                
                queryWords.forEach(word => {
                    if (text.includes(word)) {
                        score += 10;
                        matchedWords++;
                        matchedWordsSet.add(word);
                    }
                });
                
                // Bonus for matching multiple unique words
                if (matchedWordsSet.size > 1) {
                    score += matchedWordsSet.size * 5;
                }
                
                // Bonus for shorter, more focused sentences
                if (sentence.length < 100 && score > 0) {
                    score += 5;
                }
                
                if (score > 0) {
                    allSentences.push({
                        sentence: sentence,
                        score: score,
                        section: section.title,
                        matchedWords: matchedWords
                    });
                }
            });
        });
        
        // Sort by score
        allSentences.sort((a, b) => b.score - a.score);
        
        // Take top results
        bestMatches = allSentences.slice(0, 3);
    }
    
    // Format response
    if (bestMatches.length > 0) {
        console.log(`Found ${bestMatches.length} matching sentences. Best score: ${bestMatches[0]?.score}`);
        
        // For single match or clear winner
        if (bestMatches.length === 1 || bestMatches[0].score > bestMatches[1].score * 1.5) {
            return bestMatches[0].sentence;
        }
        // For 2 good matches, combine them
        else if (bestMatches.length === 2) {
            return bestMatches[0].sentence + ". " + bestMatches[1].sentence;
        }
        // For 3 good matches, combine them
        else {
            return bestMatches[0].sentence + ". " + bestMatches[1].sentence + ". " + bestMatches[2].sentence;
        }
    }
    
    console.log('No matching sentences found');
    return "I couldn't find specific information about that in the Maddox document. I can only provide answers based on what's explicitly mentioned in the document. Please try asking about AI, hardware products, AR/VR, mentorship, or other topics Maddox discusses.";
}

// Find the specific sentence containing a phrase
function findSentenceWithPhrase(text, phrase) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceWithPhrase = sentences.find(s => 
        s.toLowerCase().includes(phrase)
    );
    
    return sentenceWithPhrase ? sentenceWithPhrase.trim() : text.substring(0, 150).trim() + "...";
}

// Text-to-speech using ElevenLabs API through our server proxy
async function speakWithElevenLabs(text) {
    try {
        // Stop any currently playing audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.onended = null;
            currentAudio = null;
        }
        
        // Stop any browser speech synthesis
        synthesis.cancel();
        
        // Show a loading indicator in the status
        showStatus(`Processing voice... (Request may be queued if system is busy)`, 'listening');
        
        // Set flag to indicate we're processing
        processingVoiceRequest = true;
        
        // Make the API request to our server proxy
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                voiceId: elevenLabsVoiceId
            })
        });
        
        if (!response.ok) {
            const errorMessage = await response.text();
            throw new Error(errorMessage);
        }
        
        // Convert the response to a blob
        const audioBlob = await response.blob();
        
        // Create an audio element and play it
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        // Set as current audio
        currentAudio = audio;
        
        // Update status when playing starts
        audio.onplay = () => {
            showStatus(`Answer: ${text}`, 'answer');
            isSpeaking = true;
        };
        
        // Clean up when done
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            processingVoiceRequest = false;
            currentAudio = null;
            isSpeaking = false;
            
            // Process any queued audio
            processAudioQueue();
        };
        
        // Play the audio
        try {
            await audio.play();
        } catch (error) {
            processingVoiceRequest = false;
            currentAudio = null;
            throw error;
        }
        
    } catch (error) {
        console.error('Error with ElevenLabs TTS:', error);
        showStatus(`Error with voice synthesis: ${error.message}. Falling back to browser TTS.`, 'error');
        
        // Reset processing state
        processingVoiceRequest = false;
        currentAudio = null;
        
        // Fallback to browser speech synthesis
        const utterance = new SpeechSynthesisUtterance(text);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        } else {
            // If no voice is selected, try to find a consistent voice
            const voices = synthesis.getVoices();
            if (voices.length > 0) {
                // Prefer an English voice
                selectedVoice = voices.find(voice => voice.lang.includes('en-')) || voices[0];
                utterance.voice = selectedVoice;
                console.log('Selected fallback voice:', selectedVoice.name);
            }
        }
        utterance.lang = 'en-US';
        synthesis.speak(utterance);
    }
}

// Text-to-speech function
function speakResponse(text) {
    // Don't start a new speech if we're already processing or speaking
    if (processingVoiceRequest) {
        console.log('Voice request already in progress, queueing new request');
        
        // Queue this request for later
        audioQueue.push({text});
        return;
    }
    
    // Show response text
    showStatus(`Answer: ${text}`, 'answer');
    
    // Use ElevenLabs if enabled
    if (useElevenLabs) {
        speakWithElevenLabs(text);
        return;
    }
    
    // Stop any currently playing audio
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.onended = null;
        currentAudio = null;
    }
    
    // Fallback to browser speech synthesis
    synthesis.cancel(); // Cancel any ongoing speech
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set voice
    if (selectedVoice) {
        utterance.voice = selectedVoice;
    } else {
        // If no voice is selected, try to find a consistent voice
        const voices = synthesis.getVoices();
        if (voices.length > 0) {
            // Prefer an English voice
            selectedVoice = voices.find(voice => voice.lang.includes('en-')) || voices[0];
            utterance.voice = selectedVoice;
            console.log('Selected fallback voice:', selectedVoice.name);
        }
    }
    
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    // Handle end of speech to process queue
    utterance.onend = function() {
        processingVoiceRequest = false;
        processAudioQueue();
    };
    
    processingVoiceRequest = true;
    
    // Speak
    synthesis.speak(utterance);
}

// Process the audio queue
function processAudioQueue() {
    // If we have queued audio and we're not currently processing
    if (audioQueue.length > 0 && !processingVoiceRequest) {
        const nextItem = audioQueue.shift();
        console.log(`Processing next queued voice request (${audioQueue.length} remaining in queue)`);
        speakResponse(nextItem.text);
    }
}

// Show status message
function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    
    // Set color based on message type
    switch(type) {
        case 'error':
            statusDiv.style.backgroundColor = '#ffebee';
            statusDiv.style.color = '#c62828';
            break;
        case 'listening':
            statusDiv.style.backgroundColor = '#e3f2fd';
            statusDiv.style.color = '#1565c0';
            break;
        case 'query':
            statusDiv.style.backgroundColor = '#e8f5e9';
            statusDiv.style.color = '#2e7d32';
            break;
        case 'answer':
            statusDiv.style.backgroundColor = '#fff8e1';
            statusDiv.style.color = '#ff8f00';
            break;
        case 'success':
            statusDiv.style.backgroundColor = '#e8f5e9';
            statusDiv.style.color = '#2e7d32';
            break;
        default:
            statusDiv.style.backgroundColor = '#f5f5f5';
            statusDiv.style.color = '#212121';
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    // Disable voice button until document is loaded
    voiceButton.style.opacity = 0.5;
    voiceButton.style.pointerEvents = 'none';
    
    // Set initial status message
    uploadStatus.textContent = 'Please upload a document to get started.';
    
    // Load config from server
    await loadConfig();
    
    // Initialize speech recognition and synthesis
    initSpeechRecognition();
    initSpeechSynthesis();
    setupElevenLabs();
}); 