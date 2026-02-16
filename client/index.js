import { Client } from './client.js';

const BACKEND_URL = 'http://localhost:3000';

async function callBackend() {
  try {
    const response = await fetch(`${BACKEND_URL}/`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.text();
    console.log('✅ Response from server:', data);

    return data;
  } catch (error) {
    console.error('❌ Error calling backend:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

const client = new Client();
client.test();