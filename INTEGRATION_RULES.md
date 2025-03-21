# Voice Clone Integration Rules

This document outlines the critical rules and requirements for successfully integrating this backend with your Replit frontend.

## Voice ID Requirements

- **ONLY use the voice with ID: `TnVT7p6RBpw3AtQyx4cd`**
- Any other voices should be deleted or disabled
- For fallback, use the simple TTS

## JSON Response Format

All API endpoints return responses in the following standardized format:

```json
{
  "success": true|false,
  "data": {}, // The actual response data
  "message": "", // Error message or success information
  "timestamp": "2023-01-01T00:00:00.000Z" // ISO timestamp
}
```

## Content Requirements

- The voice clone must speak in the first person perspective ("I")
- All responses must be based on information found in the `maddox-content.html` file
- Do not hallucinate or invent new details not found in the source content

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET | Returns configuration including ElevenLabs API key and voice ID |
| `/api/documents` | GET | Returns list of available documents |
| `/api/documents/:id` | GET | Returns specific document content by ID |
| `/api/maddox` | GET | Returns Maddox content in standardized format |
| `/api/voice` | GET | Returns the voice information with preset settings |
| `/api/tts` | POST | Processes text-to-speech requests |

## Environment Variables

- Copy `.env.example` to `.env` and fill in your API keys
- Set `FRONTEND_URL` to your Replit frontend URL for CORS

## Integration Steps

1. Clone this repository
2. Install dependencies with `npm install`
3. Copy `.env.example` to `.env` and fill in your API keys
4. Start the server with `npm run dev`
5. Connect your Replit frontend to this backend
6. Use the standardized API response format for all requests

## Common Issues

- If experiencing CORS issues, ensure the `FRONTEND_URL` is set correctly
- Audio playback issues: Make sure to use the audio format returned by the TTS endpoint
- JSON parsing errors: Always use the standardized response format 