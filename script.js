// DOM Elements
const voiceButton = document.getElementById('voiceButton');
const documentUpload = document.getElementById('documentUpload');
const uploadStatus = document.getElementById('uploadStatus');
const statusDiv = document.getElementById('status');
const loadingStatus = document.getElementById('loadingStatus');

// Variables to store document content and state
let documentContent = '';
let isListening = false;
let recognition = null;
let synthesis = window.speechSynthesis;
let elevenLabsApiKey = ''; // Will be loaded from server
let elevenLabsVoiceId = 'TnVT7p6RBpw3AtQyx4cd'; // Using only this voice
let useElevenLabs = true; // Default to using ElevenLabs
let documentLoaded = false;
let openaiEnabled = false; // Will be loaded from server
let structuredResponses = null; // For storing structured responses from JSON

// Voice control variables
let currentAudio = null;
let isSpeaking = false;
let audioQueue = [];
let processingVoiceRequest = false;
let selectedVoice = null;

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
        const response = findAnswer(transcript);
        speakResponse(response, transcript);
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

// Load configurations from server
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const config = await response.json();
            elevenLabsApiKey = config.elevenlabsApiKey;
            elevenLabsVoiceId = config.elevenlabsVoiceId || elevenLabsVoiceId;
            useElevenLabs = true;
            openaiEnabled = config.openaiEnabled || false;
            console.log('Configuration loaded from server');
            console.log('ElevenLabs enabled:', useElevenLabs);
            console.log('OpenAI enhancement enabled:', openaiEnabled);
        } else {
            console.error('Failed to load config from server. Using browser speech.');
            useElevenLabs = false;
            openaiEnabled = false;
        }
    } catch (error) {
        console.error('Error loading config:', error);
        useElevenLabs = false;
        openaiEnabled = false;
    }
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

// Handle document upload with improved error handling
if (documentUpload) {
    documentUpload.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (!file) {
            uploadStatus.textContent = 'No file selected.';
            return;
        }
        
        console.log(`File selected: ${file.name}, type: ${file.type}, size: ${file.size} bytes`);
        uploadStatus.textContent = `Reading document: ${file.name}...`;
        
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
                    
                    // Speak welcome message
                    if (typeof speakResponse === 'function') {
                        speakResponse(`I'm Maddox. Ask me anything about my thoughts on AI, technology, and the future.`);
                    }
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
                        
                        // Speak welcome message
                        speakResponse('I\'m Maddox. Ask me about my vision for AI, AR/VR, and the future of technology.');
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

// Load the Maddox document instead of sample document
async function loadMaddoxDocument() {
    try {
        if (loadingStatus) {
            loadingStatus.textContent = 'Loading knowledge base...';
        }
        
        console.log('Loading Maddox document...');
        
        // Specifically load Maddox content through the API endpoint
        const response = await fetch('/api/maddox');
        
        // Check if the document loaded successfully
        if (response.ok) {
            // Read the document content
            const text = await response.text();
            
            // Validate and clean the content
            if (text && text.trim().length > 0) {
                documentContent = text.trim();
                console.log('Maddox document loaded successfully');
                if (loadingStatus) {
                    // Add a link to view the content directly
                    loadingStatus.innerHTML = 'Knowledge base loaded! <a href="/content/maddox" target="_blank" style="font-size: 0.8em; margin-left: 10px; color: #3498db;">View Content</a>';
                    loadingStatus.classList.add('loaded');
                }
                documentLoaded = true;
                showStatus('I\'m Maddox. Ask me any questions about my ideas.', 'info');
                return true;
            } else {
                console.error('Empty document content received');
                if (loadingStatus) {
                    loadingStatus.textContent = 'Failed to load knowledge base. Please try again.';
                }
                return false;
            }
        } else {
            console.error('Failed to load Maddox content');
            if (loadingStatus) {
                loadingStatus.textContent = 'Failed to load knowledge base. Please try again.';
            }
            return false;
        }
    } catch (error) {
        console.error('Error loading Maddox content:', error);
        if (loadingStatus) {
            loadingStatus.textContent = 'Error loading knowledge base. Please try again.';
        }
        return false;
    }
}

// Voice button click handler with improved document validation
voiceButton.addEventListener('click', function() {
    // Remove the document check to allow interaction regardless of document loading
    
    if (!recognition && !initSpeechRecognition()) {
        return;
    }
    
    if (isListening) {
        recognition.stop();
        voiceButton.classList.remove('listening');
        isListening = false;
        return;
    }
    
    // Start listening
    try {
        recognition.start();
        voiceButton.classList.add('listening');
        isListening = true;
        showStatus('Listening...', 'listening');
    } catch (error) {
        console.error('Error starting speech recognition:', error);
        showStatus('Error starting speech recognition. Please try again.', 'error');
    }
});

// Load the structured responses JSON file
async function loadStructuredResponses() {
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
            
            return true;
        } else {
            console.error('Failed to load structured responses, status:', response.status);
            return false;
        }
    } catch (error) {
        console.error('Error loading structured responses:', error);
        return false;
    }
}

// Find answer in document (updated to use structured responses)
function findAnswer(query) {
    query = query.toLowerCase();
    
    console.log('Finding answer for query:', query);
    
    // Try to find a match in structured responses FIRST
    if (structuredResponses) {
        console.log('Checking structured responses first');
        const matchedResponse = findStructuredResponse(query);
        if (matchedResponse) {
            console.log('Found match in structured responses:', matchedResponse);
            return matchedResponse;
        } else {
            console.log('No match found in structured responses, falling back to document search');
        }
    } else {
        console.warn('No structured responses available');
    }
    
    // Ensure we have document content before doing anything
    if (!documentContent || documentContent.trim().length === 0) {
        return "I don't have any information available. Please make sure Maddox content is properly loaded.";
    }
    
    // Original search logic follows
    // Convert document content to lowercase for case-insensitive matching
    const docContentLower = documentContent.toLowerCase();
    
    // Split the document into sentences
    const sentences = documentContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length === 0) {
        return "I don't have any information available in the Maddox document.";
    }
    
    // Extract keywords from query (excluding common words)
    const stopWords = ['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'about', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'may', 'might', 'must', 'what', 'who', 'when', 'where', 'why', 'how', 'you', 'your', 'me', 'my', 'i', 'we', 'our', 'us', 'they', 'their', 'them'];
    const queryWords = query.split(/\s+/).filter(word => word.length > 2 && !stopWords.includes(word));
    
    // If no meaningful keywords in query, explain the limitation
    if (queryWords.length === 0) {
        return "I can only answer questions about Maddox based on the document content. Please ask a specific question about Maddox's thoughts, projects, or ideas.";
    }
    
    console.log(`Search keywords: ${queryWords.join(', ')}`);
    
    // Check if any keywords appear in the document at all
    const keywordPresent = queryWords.some(word => docContentLower.includes(word));
    
    if (!keywordPresent) {
        return "I don't have information about that topic in the Maddox document. I can only answer questions based on the specific content in the document. Please ask about AI adoption, hardware products, AR/VR, mentorship, or other topics mentioned in Maddox's text.";
    }
    
    // Score each sentence based on keyword matches
    const scoredSentences = sentences.map(sentence => {
        const text = sentence.toLowerCase();
        
        // Count word matches
        let score = 0;
        let matchedWords = 0;
        let matchedWordsSet = new Set();
        
        for (const word of queryWords) {
            if (text.includes(word)) {
                score += 10;
                matchedWords++;
                matchedWordsSet.add(word);
            }
        }
        
        // Bonus for matching multiple unique words
        if (matchedWordsSet.size > 1) {
            score += matchedWordsSet.size * 5;
        }
        
        // Bonus for shorter, more focused sentences
        if (sentence.length < 100 && score > 0) {
            score += 5;
        }
        
        return { sentence, score, matchedWords };
    });
    
    // Sort by score and take top matches
    scoredSentences.sort((a, b) => b.score - a.score);
    const bestMatches = scoredSentences
        .filter(item => item.score > 0)
        .slice(0, 3);
        
    if (bestMatches.length > 0) {
        console.log(`Found ${bestMatches.length} matching sentences in Maddox document with scores: ${bestMatches.map(m => m.score).join(', ')}`);
        
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
    
    // No direct matches found, return clear limitation message
    return "I couldn't find specific information about that in the Maddox document. I can only provide answers based on what's explicitly mentioned in the document. Please try asking about AI, hardware products, AR/VR, mentorship, or other topics Maddox discusses.";
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
    
    // Special handling for voice-related queries
    if (cleanQuery.includes('voice') && (
        cleanQuery.includes('change') || 
        cleanQuery.includes('changing') || 
        cleanQuery.includes('different') || 
        cleanQuery.includes('switch'))) {
        console.log('Detected voice technology query');
        
        // First try to find a specific voice technology question in AI adoption
        if (structuredResponses.categories.ai_adoption && 
            structuredResponses.categories.ai_adoption.questions) {
            const aiQuestions = structuredResponses.categories.ai_adoption.questions;
            
            // Look for any hardware or AI related question
            for (const key of Object.keys(aiQuestions)) {
                if (key.includes('hardware') || key.includes('ai')) {
                    console.log('Found AI hardware question for voice query:', key);
                    return aiQuestions[key];
                }
            }
            
            // If no specific question found, return the AI adoption content
            if (structuredResponses.categories.ai_adoption.content) {
                console.log('Using AI adoption content for voice query');
                return structuredResponses.categories.ai_adoption.content;
            }
        }
    }
    
    // Special case for very short greetings - only match these exact patterns
    if (cleanQuery === 'hi' || cleanQuery === 'hello' || cleanQuery === 'hey' || cleanQuery === 'yo' || cleanQuery === 'whats up') {
        console.log('Detected greeting:', cleanQuery);
        
        const greetings = structuredResponses.categories.greetings;
        if (greetings && greetings.questions) {
            // Direct lookup for exact matches
            const greetingKey = cleanQuery === 'whats up' ? 'whats_up' : cleanQuery;
            
            if (greetings.questions[greetingKey]) {
                console.log(`Found exact greeting match for: ${greetingKey}`);
                return greetings.questions[greetingKey];
            }
            
            // Last resort - return hello greeting
            if (greetings.questions['hello']) {
                console.log('Using hello greeting as fallback');
                return greetings.questions['hello'];
            }
        } else {
            console.warn('No greetings category found in structured responses');
        }
    }
    
    // Check for "about yourself" or "about you" type queries
    if (cleanQuery.includes('about yourself') || cleanQuery.includes('about you') || 
        cleanQuery.includes('who are you') || cleanQuery.includes('tell me about you')) {
        console.log('Detected self-introduction query');
        if (structuredResponses.categories.greetings && 
            structuredResponses.categories.greetings.questions &&
            structuredResponses.categories.greetings.questions['who_are_you']) {
            return structuredResponses.categories.greetings.questions['who_are_you'];
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
            
            // Check for close match - stronger similarity check (0.5 instead of 0.7)
            if (cleanQuery.includes(cleanQuestionKey) || 
                cleanQuestionKey.includes(cleanQuery) ||
                calculateSimilarity(cleanQuery, cleanQuestionKey) > 0.5) {
                console.log('Found question match:', questionKey);
                return category.questions[questionKey];
            }
        }
        
        // Check if query contains the category title
        if (category.title && cleanQuery.includes(category.title.toLowerCase())) {
            // Return the general category content
            console.log('Found category match:', category.title);
            if (category.content) {
                return category.content;
            }
        }
    }
    
    // More sophisticated keywords search
    const queryWords = cleanQuery.split(' ').filter(word => word.length > 3);
    
    // Check against questions - more detailed matching
    for (const categoryKey in structuredResponses.categories) {
        const category = structuredResponses.categories[categoryKey];
        
        if (!category.questions) continue;
        
        // Map to store match scores for each question
        const matchScores = {};
        
        for (const questionKey in category.questions) {
            const cleanQuestionKey = questionKey.toLowerCase().replace(/_/g, ' ');
            let score = 0;
            
            // Check word matches
            for (const word of queryWords) {
                if (cleanQuestionKey.includes(word)) {
                    score += 1;
                }
            }
            
            if (score > 0) {
                matchScores[questionKey] = score;
            }
        }
        
        // If we found matches, return the best one
        if (Object.keys(matchScores).length > 0) {
            const bestMatch = Object.entries(matchScores)
                .sort((a, b) => b[1] - a[1])[0][0];
            console.log('Found keyword match:', bestMatch);
            return category.questions[bestMatch];
        }
    }
    
    // Look for category-specific fallbacks first before using general fallbacks
    // This helps with queries like "why is the voice changing" which should go to tech-related responses
    
    // Try to match categories by keywords
    const categoryKeywords = {
        'ai_adoption': ['ai', 'artificial intelligence', 'adoption', 'hardware', 'voice', 'robot'],
        'ar_vr': ['ar', 'vr', 'augmented', 'virtual', 'reality', 'metaverse'],
        'future_society': ['future', 'society', 'individual', 'automation', 'people'],
        'mentorship': ['mentor', 'coaching', 'project', 'help', 'learning'],
        'personal': ['feel', 'excited', 'optimistic']
    };
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(keyword => cleanQuery.includes(keyword))) {
            console.log(`Query matches ${category} category keywords`);
            
            // First try to return the category content
            if (structuredResponses.categories[category] && 
                structuredResponses.categories[category].content) {
                return structuredResponses.categories[category].content;
            }
            
            // Otherwise try to return the first question in that category
            if (structuredResponses.categories[category] && 
                structuredResponses.categories[category].questions) {
                const firstQuestion = Object.keys(structuredResponses.categories[category].questions)[0];
                if (firstQuestion) {
                    return structuredResponses.categories[category].questions[firstQuestion];
                }
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

// Filter for responses - simplified to allow normal conversation
function filterHallucinations(text) {
  return text;
}

// Text-to-speech using ElevenLabs API through our server proxy
async function speakWithElevenLabs(text, context = '') {
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
        
        // Sanitize the text to ensure it's a valid string
        const sanitizedText = text.toString().trim();
        if (!sanitizedText) {
            throw new Error('Empty or invalid text');
        }
        
        // Apply hallucination filter again as a safety measure
        const filteredText = filterHallucinations(sanitizedText);
        
        // Make the API request to our server proxy
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: filteredText,
                voiceId: elevenLabsVoiceId,
                model_id: 'eleven_monolingual_v1', // Specify model explicitly
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                },
                context: context // Pass the query context for better enhancement
            })
        });
        
        if (!response.ok) {
            const errorMessage = await response.text();
            throw new Error(errorMessage);
        }
        
        // Parse the JSON response
        const responseData = await response.json();
        
        // Get the enhanced text and audio content
        const enhancedText = responseData.enhancedText;
        const audioBase64 = responseData.audioContent;
        
        if (!audioBase64) {
            throw new Error('No audio data received');
        }
        
        // Convert base64 to blob
        const audioBlob = base64ToBlob(audioBase64, 'audio/mpeg');
        if (audioBlob.size === 0) {
            throw new Error('Received empty audio response');
        }
        
        // Update the displayed text with the enhanced version
        showStatus(`Answer: ${enhancedText}`, 'answer');
        
        // Create an audio element and play it
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        // Set as current audio
        currentAudio = audio;
        
        // Handle audio errors
        audio.onerror = (error) => {
            console.error('Audio playback error:', error);
            processingVoiceRequest = false;
            currentAudio = null;
            throw new Error('Failed to play audio');
        };
        
        // Clean up when done
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            processingVoiceRequest = false;
            currentAudio = null;
            console.log('Audio playback completed');
        };
        
        try {
            // Play the audio with user gesture handling
            await audio.play();
            isSpeaking = true;
        } catch (playError) {
            console.warn('Audio play error:', playError);
            processingVoiceRequest = false;
            currentAudio = null;
            
            if (playError.name === 'NotAllowedError') {
                // Instead of showing a button, try to play automatically
                console.log('Attempting automatic playback after a short delay...');
                // Add automated retry mechanism
                setTimeout(async () => {
                    try {
                        currentAudio = audio;
                        await audio.play();
                        isSpeaking = true;
                    } catch (retryError) {
                        console.error('Automatic playback retry failed:', retryError);
                        
                        // If automatic retry fails, create a play button with less visual prominence
                        const playButton = document.createElement('button');
                        playButton.textContent = 'Play Response';
                        playButton.style.padding = '8px 16px';
                        playButton.style.backgroundColor = '#3498db';
                        playButton.style.color = 'white';
                        playButton.style.border = 'none';
                        playButton.style.borderRadius = '4px';
                        playButton.style.cursor = 'pointer';
                        playButton.style.margin = '10px auto';
                        playButton.style.display = 'block';
                        
                        // Add click handler
                        playButton.onclick = async () => {
                            try {
                                currentAudio = audio;
                                await audio.play();
                                isSpeaking = true;
                                playButton.remove();
                            } catch (err) {
                                console.error('Still cannot play audio:', err);
                                currentAudio = null;
                                isSpeaking = false;
                                showStatus(`Cannot play audio: ${err.message}. Try refreshing the page.`, 'error');
                            }
                        };
                        
                        // Add to status div
                        if (statusDiv) {
                            statusDiv.innerHTML = `Answer: ${enhancedText}<br>`;
                            statusDiv.appendChild(playButton);
                        }
                    }
                }, 500); // 500ms delay before retry
            } else {
                throw playError;
            }
        }
        
    } catch (error) {
        console.error('Error with ElevenLabs TTS:', error);
        showStatus(`Error with voice synthesis: ${error.message}. Falling back to browser TTS.`, 'error');
        
        // Reset state
        processingVoiceRequest = false;
        currentAudio = null;
        
        // Fallback to browser speech synthesis
        const utterance = new SpeechSynthesisUtterance(text);
        // Make sure we use the same voice as in speakResponse for consistency
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

// Helper function to convert base64 to Blob
function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }
    
    return new Blob(byteArrays, { type: mimeType });
}

// Text-to-speech function
function speakResponse(text, context = '') {
    // Don't start a new speech if we're already processing or speaking
    if (processingVoiceRequest) {
        console.log('Voice request already in progress, queueing new request');
        
        // Queue this request for later
        audioQueue.push({text, context});
        return;
    }
    
    // Filter out hallucinations
    const filteredText = filterHallucinations(text);
    
    // Show response text (this will be updated with enhanced text if ElevenLabs is used)
    showStatus(`Answer: ${filteredText}`, 'answer');
    
    // Use ElevenLabs if enabled
    if (useElevenLabs) {
        speakWithElevenLabs(filteredText, context);
        return;
    }
    
    // Fallback to browser speech synthesis
    synthesis.cancel(); // Cancel any ongoing speech
    
    // Stop any currently playing audio
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.onended = null;
        currentAudio = null;
    }
    
    const utterance = new SpeechSynthesisUtterance(filteredText);
    // Make sure we consistently set a voice for the browser fallback
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
    synthesis.speak(utterance);
}

// Process the audio queue
function processAudioQueue() {
    // If we have queued audio and we're not currently processing
    if (audioQueue.length > 0 && !processingVoiceRequest) {
        const nextItem = audioQueue.shift();
        console.log(`Processing next queued voice request (${audioQueue.length} remaining in queue)`);
        speakResponse(nextItem.text, nextItem.context);
    }
}

// Show status message
function showStatus(message, type) {
    if (!statusDiv) {
        console.warn('Status div not found');
        return;
    }
    
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

// Initialize speech synthesis
function initSpeechSynthesis() {
    if (!synthesis) {
        console.error('Speech synthesis not supported');
        return;
    }
    
    // Get available voices
    function loadVoices() {
        const voices = synthesis.getVoices();
        
        // Select a default voice (preferably an English voice)
        selectedVoice = voices.find(voice => 
            voice.lang.includes('en-')
        ) || voices[0];
        
        console.log('Available voices:', voices.length);
        console.log('Selected browser fallback voice:', selectedVoice ? selectedVoice.name : 'None');
    }
    
    if (synthesis.onvoiceschanged !== undefined) {
        synthesis.onvoiceschanged = loadVoices;
    }
    
    loadVoices();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM loaded, initializing voice assistant...');
    
    // Load configuration
    await loadConfig();
    
    // Load structured responses
    await loadStructuredResponses();
    
    // Initialize speech recognition and speech synthesis
    if (!initSpeechRecognition()) {
        showStatus('Speech recognition not available in this browser', 'error');
        if (voiceButton) {
            voiceButton.style.opacity = 0.5;
            voiceButton.style.pointerEvents = 'none';
        }
    } else {
        // Always enable voice button
        if (voiceButton) {
            voiceButton.style.opacity = 1;
            voiceButton.style.pointerEvents = 'auto';
        }
    }
    
    // Initialize speech synthesis for consistent voice
    initSpeechSynthesis();
    
    // Aggressively load Maddox document on startup
    let contentLoaded = false;
    
    // Try loading through the dedicated endpoint
    try {
        const response = await fetch('/api/maddox');
        if (response.ok) {
            documentContent = await response.text();
            if (documentContent && documentContent.trim().length > 0) {
                documentLoaded = true;
                contentLoaded = true;
                console.log('Successfully loaded Maddox content via primary endpoint');
                
                if (loadingStatus) {
                    loadingStatus.innerHTML = 'Knowledge base loaded! <a href="/content/maddox" target="_blank" style="font-size: 0.8em; margin-left: 10px; color: #3498db;">View Content</a>';
                    loadingStatus.classList.add('loaded');
                }
                
                showStatus('Ready to answer questions about Maddox', 'info');
            }
        }
    } catch (error) {
        console.error('Error loading from primary endpoint:', error);
    }
    
    // If that failed, try the documents API
    if (!contentLoaded) {
        try {
            const response = await fetch('/api/documents/maddox');
            if (response.ok) {
                const data = await response.json();
                if (data && data.content) {
                    documentContent = data.content;
                    documentLoaded = true;
                    contentLoaded = true;
                    console.log('Successfully loaded Maddox content via documents API');
                    
                    if (loadingStatus) {
                        loadingStatus.innerHTML = 'Knowledge base loaded! <a href="/content/maddox" target="_blank" style="font-size: 0.8em; margin-left: 10px; color: #3498db;">View Content</a>';
                        loadingStatus.classList.add('loaded');
                    }
                    
                    showStatus('Ready to answer questions about Maddox', 'info');
                }
            }
        } catch (error) {
            console.error('Error loading from documents API:', error);
        }
    }
    
    // If both failed, try fallback method
    if (!contentLoaded) {
        loadMaddoxDocument().then(success => {
            if (success) {
                console.log('Successfully loaded Maddox document through fallback method');
            } else {
                console.error('All methods to load Maddox content failed');
                if (loadingStatus) {
                    loadingStatus.textContent = 'Failed to load Maddox content. Please reload the page.';
                    loadingStatus.classList.add('error');
                }
            }
        });
    }
    
    // Setup floating widget functionality
    const floatingWidget = document.getElementById('floatingWidget');
    const widgetPanel = document.getElementById('widgetPanel');
    const closeBtn = document.querySelector('.widget-close');
    
    if (floatingWidget && widgetPanel) {
        // Toggle widget panel
        floatingWidget.addEventListener('click', function() {
            widgetPanel.classList.toggle('active');
            
            if (widgetPanel.classList.contains('active')) {
                this.style.animation = 'none';
            } else {
                setTimeout(() => {
                    this.style.animation = 'float 3s ease-in-out infinite';
                }, 10);
            }
        });
        
        // Close panel
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                widgetPanel.classList.remove('active');
                setTimeout(() => {
                    floatingWidget.style.animation = 'float 3s ease-in-out infinite';
                }, 10);
            });
        }
        
        // Setup widget buttons
        const activateVoiceBtn = document.getElementById('activateVoiceBtn');
        const switchDocBtn = document.getElementById('switchDocBtn');
        const clearHistoryBtn = document.getElementById('clearHistoryBtn');
        const helpBtn = document.getElementById('helpBtn');
        
        if (activateVoiceBtn) {
            activateVoiceBtn.addEventListener('click', function() {
                if (voiceButton) voiceButton.click();
                widgetPanel.classList.remove('active');
            });
        }
        
        if (switchDocBtn) {
            switchDocBtn.addEventListener('click', function() {
                loadMaddoxDocument();
                widgetPanel.classList.remove('active');
            });
        }
        
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', function() {
                const historyDiv = document.getElementById('history');
                if (historyDiv) {
                    historyDiv.innerHTML = '';
                }
                widgetPanel.classList.remove('active');
            });
        }
        
        if (helpBtn) {
            helpBtn.addEventListener('click', function() {
                alert('Voice Chat with Maddox:\n\n1. Click the microphone button\n2. Ask me a question about my ideas\n3. Listen to my response\n\nI\'ll share my thoughts on AI, hardware products, AR/VR, mentorship, and other topics from my perspective.');
                widgetPanel.classList.remove('active');
            });
        }
    }
}); 