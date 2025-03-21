# Voice Clone Assistant

A backend service for the Maddox voice clone that integrates with a Replit frontend.

## Features

- Voice interaction with Maddox content
- Integration with ElevenLabs for premium quality voice output
- Server-side API key management for improved security
- Standardized JSON response format
- Enhanced CORS support for Replit integration

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   - Copy `.env.example` to `.env` and fill in your API keys:
     ```
     ELEVEN_LABS_API_KEY=your-api-key-here
     ELEVEN_LABS_VOICE_ID=TnVT7p6RBpw3AtQyx4cd
     OPENAI_API_KEY=your-openai-api-key-here
     PORT=3001
     FRONTEND_URL=https://your-replit-frontend.repl.co
     ```

3. **Start the Server**
   ```bash
   npm run dev
   ```
   
4. **Access the API**
   - API will be available at `http://localhost:3001/api/`
   - Connect your Replit frontend to this API

## Integration with Replit Frontend

For smooth integration with your Replit frontend, please follow these rules:

1. **Read the Integration Rules**
   - See `INTEGRATION_RULES.md` for detailed requirements

2. **API Endpoints**
   All endpoints return a standardized JSON response:
   ```json
   {
     "success": true|false,
     "data": {}, 
     "message": "",
     "timestamp": "2023-01-01T00:00:00.000Z"
   }
   ```

3. **Key Endpoints**
   - `/api/config` - Get configuration including ElevenLabs API key and voice ID
   - `/api/maddox` - Get Maddox content in standardized format
   - `/api/voice` - Get voice information with preset settings
   - `/api/tts` - Process text-to-speech requests

4. **Voice Requirements**
   - ONLY use the voice with ID: `TnVT7p6RBpw3AtQyx4cd`
   - For fallback, use the simple TTS

## Technical Implementation

### Server Components

- **Express Server**: Handles API requests with standardized responses
- **Environment Variables**: Securely stores API keys
- **Enhanced CORS**: Configured to work with Replit frontend
- **Standardized Responses**: Consistent JSON response format

### Security Improvements

- API keys stored securely in `.env` file
- All ElevenLabs API requests proxied through the server
- Error handling with standardized response format

## Troubleshooting

- **CORS Issues**: Ensure `FRONTEND_URL` is set correctly in `.env`
- **JSON Parsing Errors**: Use the standardized response format in frontend
- **TTS Issues**: Check voice ID and ElevenLabs API key

For more detailed troubleshooting, see `INTEGRATION_RULES.md`.

## ElevenLabs Integration

The assistant uses ElevenLabs for high-quality voice output:

- **Voice ID**: Optional - use a specific voice or your own cloned voice
- **Default Voice**: If no voice ID is provided, it uses "Rachel" (a default ElevenLabs voice)
- **Voice Cloning**: Create your own custom voice at [ElevenLabs Voice Lab](https://elevenlabs.io/app/voice-lab)
- **Fallback**: Automatically falls back to browser speech if ElevenLabs is unavailable

## Browser Compatibility

- Chrome: Full support
- Edge: Full support
- Firefox: Limited support (speech recognition may not work)
- Safari: Limited support (speech recognition may not work)

## Privacy

- Document content stays on your device
- Voice recognition uses your browser's built-in capabilities
- Text content is sent to ElevenLabs via your server for voice synthesis

## Versions

- **Basic Version** (`index.html` + `script.js`): Simple implementation with core features
- **Advanced Version** (`advanced.html` + `advanced_script.js`): Enhanced UI with chat history, drag-and-drop, and better search algorithm

## Limitations

- Simple text matching (not AI-powered)
- Only supports basic text documents
- Limited PDF support
- May not understand complex queries
- Requires microphone access
- Browser compatibility issues with some browsers 