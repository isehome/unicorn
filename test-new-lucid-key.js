#!/usr/bin/env node

// Test script for new Lucid API key permissions
const API_KEY = 'key-NDBmNzBhMWRiNWNmMmM3ZmQ4YTJlM2FhNDQ3NGE4M2JiYTA1MTQ1MjZmNzg1NGQxZDgwNDcyMTJkZTE0ODk0Yi11PTIwOTU0NDQ5MA==-vEImeiZi0XID3ARqI3Hp3xr1wNeMbEvnh4oNYNDutE8-Lucid-US';
const DOC_ID = 'f0e89b19-d72d-4ab1-8cb9-2712dbca4bc1';
const PAGE_ID = '0_0';

async function testLucidAPI() {
  console.log('Testing new Lucid API key permissions...\n');
  
  // Test 1: Metadata (should work)
  console.log('1. Testing metadata fetch...');
  try {
    const metaResponse = await fetch(`https://api.lucid.co/documents/${DOC_ID}`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Lucid-Api-Version': '1'
      }
    });
    const metadata = await metaResponse.json();
    console.log('✅ Metadata: SUCCESS - Title:', metadata.title);
  } catch (error) {
    console.log('❌ Metadata: FAILED -', error.message);
  }
  
  // Test 2: Generate Image (testing new permissions)
  console.log('\n2. Testing image generation...');
  try {
    const generateResponse = await fetch(
      `https://api.lucid.co/documents/${DOC_ID}/pages/${PAGE_ID}/generate-image`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Lucid-Api-Version': '1',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          imageType: 'png',
          scale: 1
        })
      }
    );
    
    if (generateResponse.ok) {
      const data = await generateResponse.json();
      console.log('✅ Generate Image: SUCCESS');
      console.log('   Image URL:', data.link || data.url || 'URL found in response');
    } else {
      console.log(`❌ Generate Image: FAILED - ${generateResponse.status} ${generateResponse.statusText}`);
      const errorText = await generateResponse.text();
      console.log('   Error:', errorText);
    }
  } catch (error) {
    console.log('❌ Generate Image: FAILED -', error.message);
  }
  
  // Test 3: Embed Token (testing new permissions)
  console.log('\n3. Testing embed token creation...');
  try {
    const embedResponse = await fetch('https://api.lucid.co/embeds/token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Lucid-Api-Version': '1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        documentId: DOC_ID,
        type: 'document',
        permissions: ['view'],
        expiresInSeconds: 3600
      })
    });
    
    if (embedResponse.ok) {
      const data = await embedResponse.json();
      console.log('✅ Embed Token: SUCCESS');
      console.log('   Token received:', data.token ? 'Yes' : 'No');
    } else {
      console.log(`❌ Embed Token: FAILED - ${embedResponse.status} ${embedResponse.statusText}`);
      const errorText = await embedResponse.text();
      console.log('   Error:', errorText);
    }
  } catch (error) {
    console.log('❌ Embed Token: FAILED -', error.message);
  }
  
  console.log('\n-----------------------------------');
  console.log('Test complete! Update your Vercel environment variable with this key if the tests passed.');
}

testLucidAPI();
