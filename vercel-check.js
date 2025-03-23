// Voice Clone Verification Script for Vercel Deployment
// This script checks all critical components are properly configured

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration check
function checkConfig() {
  console.log('Checking configuration...');
  
  // Check for required files
  const requiredFiles = [
    '.env',
    'server.js',
    'index.html',
    'script.js',
    'maddox-content.html',
    'documents/maddox_responses.json'
  ];
  
  let allFilesExist = true;
  requiredFiles.forEach(file => {
    if (!fs.existsSync(path.join(__dirname, file))) {
      console.error(`❌ Missing required file: ${file}`);
      allFilesExist = false;
    } else {
      console.log(`✅ Found required file: ${file}`);
    }
  });
  
  if (!allFilesExist) {
    console.error('❌ Some required files are missing!');
    return false;
  }
  
  // Check for required environment variables
  try {
    require('dotenv').config();
    const requiredEnvVars = [
      'ELEVEN_LABS_API_KEY',
      'ELEVEN_LABS_VOICE_ID',
      'PORT'
    ];
    
    let allEnvVarsExist = true;
    requiredEnvVars.forEach(envVar => {
      if (!process.env[envVar]) {
        console.error(`❌ Missing required environment variable: ${envVar}`);
        allEnvVarsExist = false;
      } else {
        console.log(`✅ Found environment variable: ${envVar}`);
      }
    });
    
    if (!allEnvVarsExist) {
      console.error('❌ Some required environment variables are missing!');
      return false;
    }
    
    // Check voice ID is correct
    if (process.env.ELEVEN_LABS_VOICE_ID !== 'TnVT7p6RBpw3AtQyx4cd') {
      console.error(`❌ ElevenLabs voice ID is incorrect: ${process.env.ELEVEN_LABS_VOICE_ID}`);
      console.error('   Should be: TnVT7p6RBpw3AtQyx4cd');
      return false;
    } else {
      console.log('✅ ElevenLabs voice ID is correct');
    }
    
  } catch (error) {
    console.error('❌ Error loading environment variables:', error.message);
    return false;
  }
  
  // Check maddox-content.html file content
  try {
    const maddoxHtmlPath = path.join(__dirname, 'maddox-content.html');
    const maddoxContent = fs.readFileSync(maddoxHtmlPath, 'utf8');
    
    if (!maddoxContent.includes('id="maddox-data"')) {
      console.error('❌ maddox-content.html file does not contain the required data div');
      return false;
    } else {
      console.log('✅ maddox-content.html contains the required data div');
    }
  } catch (error) {
    console.error('❌ Error reading maddox-content.html:', error.message);
    return false;
  }
  
  // Check structured responses JSON
  try {
    const responsesPath = path.join(__dirname, 'documents/maddox_responses.json');
    const responses = JSON.parse(fs.readFileSync(responsesPath, 'utf8'));
    
    if (!responses.metadata || !responses.metadata.voiceId) {
      console.error('❌ maddox_responses.json does not contain the required metadata');
      return false;
    }
    
    if (responses.metadata.voiceId !== 'TnVT7p6RBpw3AtQyx4cd') {
      console.error(`❌ Voice ID in maddox_responses.json is incorrect: ${responses.metadata.voiceId}`);
      console.error('   Should be: TnVT7p6RBpw3AtQyx4cd');
      return false;
    } else {
      console.log('✅ Voice ID in maddox_responses.json is correct');
    }
    
    if (!responses.categories || Object.keys(responses.categories).length === 0) {
      console.error('❌ maddox_responses.json does not contain any response categories');
      return false;
    } else {
      console.log(`✅ Found ${Object.keys(responses.categories).length} response categories in maddox_responses.json`);
    }
  } catch (error) {
    console.error('❌ Error reading or parsing maddox_responses.json:', error.message);
    return false;
  }
  
  console.log('✅ All configuration checks passed!');
  return true;
}

// Check API accessibility with curl-like request
function checkApi() {
  console.log('\nChecking local API...');
  
  const port = process.env.PORT || 8080;
  
  // Check if server is running
  const req = require('http').request({
    hostname: 'localhost',
    port: port,
    path: '/api/config',
    method: 'GET'
  }, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const parsedData = JSON.parse(data);
        if (!parsedData.success) {
          console.error('❌ API response unsuccessful:', parsedData.message);
          return;
        }
        
        const config = parsedData.data;
        
        if (!config.elevenlabsVoiceId) {
          console.error('❌ API response missing elevenlabsVoiceId');
          return;
        }
        
        if (config.elevenlabsVoiceId !== 'TnVT7p6RBpw3AtQyx4cd') {
          console.error(`❌ API returning incorrect voice ID: ${config.elevenlabsVoiceId}`);
          console.error('   Should be: TnVT7p6RBpw3AtQyx4cd');
          return;
        }
        
        console.log('✅ API /api/config responding correctly');
        console.log('✅ API returning correct voice ID');
        console.log('✅ All API checks passed!');
        
        console.log('\n✅✅✅ All verification checks passed! Voice clone should work on Vercel. ✅✅✅');
      } catch (error) {
        console.error('❌ Error parsing API response:', error.message);
      }
    });
  });
  
  req.on('error', (error) => {
    console.error(`❌ Error connecting to API: ${error.message}`);
    console.error('   Is the server running?');
  });
  
  req.end();
}

// Create Vercel configuration if needed
function createVercelConfig() {
  console.log('\nChecking for Vercel configuration...');
  
  const vercelConfigPath = path.join(__dirname, 'vercel.json');
  
  if (fs.existsSync(vercelConfigPath)) {
    console.log('✅ vercel.json already exists');
    return;
  }
  
  // Create basic vercel.json
  const vercelConfig = {
    "version": 2,
    "builds": [
      { "src": "server.js", "use": "@vercel/node" }
    ],
    "routes": [
      { "src": "/(.*)", "dest": "/server.js" }
    ],
    "env": {
      "ELEVEN_LABS_API_KEY": "@eleven_labs_api_key",
      "ELEVEN_LABS_VOICE_ID": "TnVT7p6RBpw3AtQyx4cd",
      "OPENAI_API_KEY": "@openai_api_key"
    }
  };
  
  try {
    fs.writeFileSync(vercelConfigPath, JSON.stringify(vercelConfig, null, 2));
    console.log('✅ Created vercel.json configuration file');
    console.log('⚠️  Note: You will need to set the ELEVEN_LABS_API_KEY and OPENAI_API_KEY environment variables in your Vercel project settings');
  } catch (error) {
    console.error('❌ Error creating vercel.json:', error.message);
  }
}

// Run the checks
console.log('🔍 Starting voice clone verification for Vercel deployment...');
const configOk = checkConfig();

if (configOk) {
  createVercelConfig();
  
  // Check if server is already running
  console.log('\n⚠️  To complete API checks, please make sure your server is running.');
  console.log('   You can start it with: npm run dev');
  console.log('   Then run this script again to complete the API checks.');
  
  // Ask if server is running
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  readline.question('Is your server running already? (y/n): ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      checkApi();
    } else {
      console.log('Please start the server and run this script again to complete the API checks.');
    }
    readline.close();
  });
} 