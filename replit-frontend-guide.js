/**
 * REPLIT FRONTEND INTEGRATION GUIDE
 * 
 * This file contains sample code for integrating with the voice clone backend
 * from a Replit Vite frontend.
 */

// CORS Configuration in vite.config.js
/*
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
*/

// API Client
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Fetch wrapper that handles the standardized API response format
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'API request failed');
    }
    
    // Check standardized response format
    if (data.success === false) {
      throw new Error(data.message || 'Request unsuccessful');
    }
    
    return data.data; // Return just the data property from standardized response
  } catch (error) {
    console.error(`API Request Error (${endpoint}):`, error);
    throw error;
  }
}

/**
 * Get Maddox content
 */
async function getMaddoxContent() {
  return await apiRequest('/api/maddox');
}

/**
 * Get voice configuration
 */
async function getVoiceConfig() {
  return await apiRequest('/api/voice');
}

/**
 * Generate text-to-speech with proper voice settings
 */
async function generateSpeech(text) {
  try {
    // Get voice info from endpoint
    const voiceInfo = await getVoiceConfig();
    
    // Create request for TTS
    const response = await fetch(`${API_BASE_URL}/api/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        voiceId: voiceInfo.voiceId,
        voice_settings: voiceInfo.settings
      })
    });
    
    // Check if the response is JSON (error) or audio
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      // This is an error response
      const errorData = await response.json();
      console.error('TTS Error:', errorData);
      throw new Error(errorData.message || 'TTS request failed');
    }
    
    // This is audio data
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    
    // Play the audio
    const audio = new Audio(audioUrl);
    audio.play();
    
    return audioUrl;
  } catch (error) {
    console.error('Speech generation error:', error);
    
    // Fallback to browser TTS
    const utterance = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(utterance);
  }
}

/**
 * Example React component for a voice button
 */
/*
import React, { useState, useEffect } from 'react';
import { getMaddoxContent, generateSpeech } from './api';

function VoiceButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [question, setQuestion] = useState('');
  
  const handleAsk = async () => {
    if (!question) return;
    
    setIsLoading(true);
    try {
      // For a real application, you would send the question to an AI model
      // Here we're just using the Maddox content
      const content = await getMaddoxContent();
      
      // In a real app, you'd process the question against content
      const response = "This is a sample response from Maddox's content.";
      
      // Generate speech with the response
      await generateSpeech(response);
    } catch (error) {
      console.error('Error handling question:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div>
      <input 
        type="text" 
        value={question} 
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask Maddox a question..."
      />
      <button 
        onClick={handleAsk} 
        disabled={isLoading}
      >
        {isLoading ? 'Processing...' : 'Ask'}
      </button>
    </div>
  );
}

export default VoiceButton;
*/ 