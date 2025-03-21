// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;
const OpenAI = require('openai');

// Queue for ElevenLabs requests
const requestQueue = [];
let isProcessingQueue = false;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Enhanced CORS configuration for Replit
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow requests from any subdomain of replit.dev and replit.co and all local origins
    const allowedDomains = [
      /\.repl\.co$/,
      /\.replit\.dev$/,
      /localhost/,
      /127\.0\.0\.1/,
      /file:\/\//
    ].filter(Boolean);
    
    if (allowedDomains.some(domain => domain.test(origin))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));

// Serve static files
app.use(express.static(path.join(__dirname)));

// Parse JSON in requests with increased limit for larger payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Create documents directory if it doesn't exist
const documentsDir = path.join(__dirname, 'documents');
if (!fs.existsSync(documentsDir)) {
    fs.mkdirSync(documentsDir, { recursive: true });
    console.log('Created documents directory');
}

// Sample documents - only keeping Maddox content
const documents = [
  {
    id: 'maddox',
    title: 'Maddox Content',
    content: ''  // This will be loaded from Maddox.txt
  }
];

// Load Maddox content from file
try {
    const maddoxFilePath = path.join(documentsDir, 'Maddox.txt');
    if (fs.existsSync(maddoxFilePath)) {
        documents[0].content = fs.readFileSync(maddoxFilePath, 'utf8');
        console.log('Loaded Maddox content from file');
    } else {
        console.log('Maddox.txt not found, using empty content');
    }
} catch (error) {
    console.error('Error loading Maddox content:', error);
}

// Create JSON files for each document
documents.forEach(doc => {
    const filePath = path.join(documentsDir, `${doc.id}.json`);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), 'utf8');
        console.log(`Created document file: ${doc.id}.json`);
    }
});

// Add standardized API response helper
const apiResponse = (success, data = null, message = '', status = 200) => {
  return {
    success,
    data,
    message,
    timestamp: new Date().toISOString()
  };
};

// API endpoint to provide the ElevenLabs API key
app.get('/api/config', (req, res) => {
  try {
    res.json(apiResponse(true, {
      elevenlabsApiKey: process.env.ELEVEN_LABS_API_KEY,
      elevenlabsVoiceId: process.env.ELEVEN_LABS_VOICE_ID,
      openaiEnabled: !!process.env.OPENAI_API_KEY
    }));
  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json(apiResponse(false, null, 'Failed to get configuration', 500));
  }
});

// API endpoint to get list of available documents
app.get('/api/documents', (req, res) => {
    try {
        // Only return Maddox info as the single available document
        const maddoxDocument = {
            id: 'maddox',
            title: 'Maddox Information'
        };
        
        res.json(apiResponse(true, [maddoxDocument]));
    } catch (error) {
        console.error('Error getting documents list:', error);
        res.status(500).json(apiResponse(false, null, 'Failed to get documents list', 500));
    }
});

// Helper function to extract Maddox content from HTML file
function extractMaddoxContent() {
  try {
    const maddoxHtmlPath = path.join(__dirname, 'maddox-content.html');
    
    if (!fs.existsSync(maddoxHtmlPath)) {
      console.error('maddox-content.html not found');
      return null;
    }
    
    // Read the HTML file
    const htmlContent = fs.readFileSync(maddoxHtmlPath, 'utf8');
    
    // Extract the content from the hidden div with id="maddox-data"
    const regex = /<div\s+id=["']maddox-data["']\s+class=["']hidden-data["']>\s*([\s\S]*?)\s*<\/div>/;
    const match = htmlContent.match(regex);
    
    if (match && match[1]) {
      return match[1].trim();
    } else {
      console.error('Could not extract Maddox content from HTML using regex');
      
      // Fallback: try to get content from the visible paragraphs
      const paragraphRegex = /<div\s+class=["']content["']>([\s\S]*?)<\/div>/;
      const paragraphMatch = htmlContent.match(paragraphRegex);
      
      if (paragraphMatch && paragraphMatch[1]) {
        // Extract text content from paragraphs, removing HTML tags
        let content = paragraphMatch[1].replace(/<\/?[^>]+(>|$)/g, ' ');
        // Normalize whitespace
        content = content.replace(/\s+/g, ' ').trim();
        console.log('Using fallback content extraction method');
        return content;
      }
      
      console.error('Both content extraction methods failed');
      return null;
    }
  } catch (error) {
    console.error('Error extracting Maddox content:', error);
    return null;
  }
}

// API endpoint to get a specific document by ID
app.get('/api/documents/:id', (req, res) => {
    try {
        // Check if requesting the structured responses file
        if (req.params.id === 'maddox_responses') {
            const responsesPath = path.join(documentsDir, 'maddox_responses.json');
            
            if (fs.existsSync(responsesPath)) {
                const structuredResponses = JSON.parse(fs.readFileSync(responsesPath, 'utf8'));
                return res.json(apiResponse(true, structuredResponses));
            }
        }
        
        // Extract Maddox content from HTML file
        const maddoxContent = extractMaddoxContent();
        
        if (maddoxContent) {
            const document = {
                id: 'maddox',
                title: 'Maddox Information',
                content: maddoxContent
            };
            res.json(apiResponse(true, document));
        } else {
            res.status(500).json(apiResponse(false, null, 'Failed to extract Maddox content', 500));
        }
    } catch (error) {
        console.error(`Error reading Maddox content:`, error);
        res.status(500).json(apiResponse(false, null, 'Failed to read document', 500));
    }
});

// Add a dedicated endpoint for Maddox content from HTML
app.get('/api/maddox', (req, res) => {
    try {
        // Extract Maddox content from HTML file
        const maddoxContent = extractMaddoxContent();
        
        if (maddoxContent) {
            // Send standardized JSON response
            res.json(apiResponse(true, { content: maddoxContent }));
            console.log('Served Maddox content from HTML');
        } else {
            res.status(500).json(apiResponse(false, null, 'Failed to extract Maddox content', 500));
        }
    } catch (error) {
        console.error('Error serving Maddox content:', error);
        res.status(500).json(apiResponse(false, null, 'Error reading Maddox document', 500));
    }
});

// Helper function to filter out hallucinations
function filterHallucinations(text) {
  // Simple pass-through function now
  return text;
}

// Helper function to enhance text with OpenAI
async function enhanceWithOpenAI(text, context = '') {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.log('OpenAI API key not configured, skipping enhancement');
      return text;
    }

    const prompt = `
You are Maddox Sciuchetti. Your task is to respond to questions as if you are Maddox himself.

IMPORTANT GUIDELINES:
1. Always respond in first person as Maddox
2. Express opinions and thoughts as if they are your own
3. Use a confident, thoughtful tone consistent with Maddox's writing
4. Stick to the content from Maddox's document - do not invent new details
5. Keep the factual information from the original response, but convert it to first person

Original response: "${text}"

${context ? `User's question/input: ${context}` : ''}

Enhanced first-person response as Maddox:`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are Maddox Sciuchetti. You respond to questions in first person, as if you are Maddox himself. Your tone is confident and thoughtful. Only use information from the Maddox document and don't invent new details." },
        { role: "user", content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const enhancedText = response.choices[0].message.content.trim();
    console.log('Enhanced text with OpenAI to first-person perspective');
    
    return enhancedText;
  } catch (error) {
    console.error('Error enhancing text with OpenAI:', error);
    return text; // Return original text if enhancement fails
  }
}

// Proxy endpoint for ElevenLabs to handle CORS and hide API key from client
app.post('/api/tts', async (req, res) => {
  // Add request to queue and process
  addToQueueAndProcess(req, res);
});

// Function to add request to queue and start processing if not already running
function addToQueueAndProcess(req, res) {
  // Add to queue
  requestQueue.push({ req, res });
  console.log(`Request added to queue. Queue length: ${requestQueue.length}`);
  
  // Start processing if not already doing so
  if (!isProcessingQueue) {
    processNextInQueue();
  }
}

// Process next request in queue
async function processNextInQueue() {
  // If queue is empty, stop processing
  if (requestQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }
  
  isProcessingQueue = true;
  const { req, res } = requestQueue.shift();
  
  try {
    const { text, voiceId, model_id, voice_settings, context } = req.body;
    
    // Input validation
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      res.status(400).json(apiResponse(false, null, 'Invalid or missing text parameter', 400));
      processNextInQueue(); // Continue with next request
      return;
    }
    
    // Limit text length to avoid API errors
    const truncatedText = text.length > 5000 ? text.substring(0, 5000) : text;
    
    // Use provided voice ID or fall back to environment variable
    // Always prefer the voice ID from the request if available (which comes from the structured JSON)
    const useVoiceId = voiceId || process.env.ELEVEN_LABS_VOICE_ID;
    if (!useVoiceId) {
      res.status(400).json(apiResponse(false, null, 'Voice ID is required', 400));
      processNextInQueue(); // Continue with next request
      return;
    }
    
    console.log(`TTS request for voice ${useVoiceId}, text length: ${truncatedText.length}`);
    
    // Enhance text with OpenAI if available
    const enhancedText = await enhanceWithOpenAI(truncatedText, context);
    
    // Prepare request to ElevenLabs API
    const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`;
    const headers = {
      'Accept': 'audio/mpeg',
      'xi-api-key': process.env.ELEVEN_LABS_API_KEY,
      'Content-Type': 'application/json'
    };
    
    // Prepare request body
    const requestBody = {
      text: enhancedText,
      model_id: model_id || 'eleven_monolingual_v1',
      voice_settings: voice_settings || {
        stability: 0.5,
        similarity_boost: 0.75
      }
    };
    
    // Make request to ElevenLabs API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    // Handle error responses from ElevenLabs
    if (!response.ok) {
      let errorMessage;
      try {
        // Try to parse error as JSON
        const errorData = await response.json();
        errorMessage = errorData.detail?.message || JSON.stringify(errorData);
      } catch (e) {
        // If not JSON, get as text
        errorMessage = await response.text();
      }
      
      console.error(`ElevenLabs API error (${response.status}):`, errorMessage);
      res.status(response.status).json(apiResponse(false, null, `ElevenLabs API error: ${errorMessage}`, response.status));
      processNextInQueue(); // Continue with next request
      return;
    }

    // Verify we got audio back
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('audio')) {
      res.status(500).json(apiResponse(false, null, `Invalid content type from ElevenLabs: ${contentType}`, 500));
      processNextInQueue(); // Continue with next request
      return;
    }

    // Get audio data as buffer
    const audioBuffer = await response.arrayBuffer();
    if (!audioBuffer || audioBuffer.byteLength === 0) {
      res.status(500).json(apiResponse(false, null, 'Received empty audio response from ElevenLabs', 500));
      processNextInQueue(); // Continue with next request
      return;
    }
    
    // Convert audio buffer to base64 for JSON response
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    
    // Send both the enhanced text and audio data
    res.json({
      enhancedText: enhancedText,
      audioContent: audioBase64
    });
    
    console.log('TTS response sent successfully');
    
  } catch (error) {
    console.error('Error with TTS proxy:', error);
    res.status(500).json(apiResponse(false, null, `Error processing text-to-speech request: ${error.message}`, 500));
  }
  
  // Process next request with slight delay to avoid any race conditions
  setTimeout(processNextInQueue, 100);
}

// Serve the HTML files for any route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/advanced', (req, res) => {
  res.sendFile(path.join(__dirname, 'advanced.html'));
});

// Add route for Maddox content page
app.get('/content/maddox', (req, res) => {
  res.sendFile(path.join(__dirname, 'maddox-content.html'));
});

// Add health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Explicitly serve the sample_document.txt file
app.get('/sample_document.txt', (req, res) => {
    try {
        // Extract Maddox content from HTML file
        const maddoxContent = extractMaddoxContent();
        
        if (maddoxContent) {
            // Send text with appropriate content type
            res.setHeader('Content-Type', 'text/plain');
            res.send(maddoxContent);
            console.log('Served Maddox content from HTML via sample_document.txt endpoint');
        } else {
            res.status(500).send('Failed to extract Maddox content');
        }
    } catch (error) {
        console.error('Error serving Maddox content:', error);
        res.status(500).send('Error reading Maddox document');
    }
});

// New endpoint to get consistent voice information
app.get('/api/voice', (req, res) => {
  try {
    const voiceInfo = {
      voiceId: process.env.ELEVEN_LABS_VOICE_ID || 'TnVT7p6RBpw3AtQyx4cd', // Fallback to the voice ID in the rules
      settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true
      }
    };
    
    res.json(apiResponse(true, voiceInfo));
  } catch (error) {
    console.error('Error getting voice info:', error);
    res.status(500).json(apiResponse(false, null, 'Failed to get voice information', 500));
  }
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`For Replit: Check the 'Webview' tab or your deployment URL`);
  console.log(`ElevenLabs API key configured: ${!!process.env.ELEVEN_LABS_API_KEY}`);
}); 