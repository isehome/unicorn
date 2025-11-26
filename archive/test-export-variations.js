#!/usr/bin/env node

// Test different export parameter variations
const API_KEY = 'key-NDBmNzBhMWRiNWNmMmM3ZmQ4YTJlM2FhNDQ3NGE4M2JiYTA1MTQ1MjZmNzg1NGQxZDgwNDcyMTJkZTE0ODk0Yi11PTIwOTU0NDQ5MA==-vEImeiZi0XID3ARqI3Hp3xr1wNeMbEvnh4oNYNDutE8-Lucid-US';
const DOC_ID = 'f0e89b19-d72d-4ab1-8cb9-2712dbca4bc1';
const PAGE_ID = '0_0';

async function testExportVariation(name, params) {
  console.log(`\nTesting: ${name}`);
  console.log('Parameters:', JSON.stringify(params, null, 2));
  
  try {
    const response = await fetch(
      `https://api.lucid.co/documents/${DOC_ID}/pages/${PAGE_ID}/generate-image`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Lucid-Api-Version': '1',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ SUCCESS - Response:', JSON.stringify(data, null, 2));
      return true;
    } else {
      console.log(`❌ FAILED - ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    console.log('❌ ERROR -', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('Testing Lucid export with different parameter variations...\n');
  console.log('Document:', DOC_ID);
  console.log('Page:', PAGE_ID);
  console.log('='.repeat(60));
  
  const variations = [
    {
      name: 'Minimal - just PNG',
      params: { imageType: 'png' }
    },
    {
      name: 'Low DPI (72)',
      params: { imageType: 'png', dpi: 72 }
    },
    {
      name: 'Medium DPI (96)', 
      params: { imageType: 'png', dpi: 96 }
    },
    {
      name: 'Standard DPI (150)',
      params: { imageType: 'png', dpi: 150 }
    },
    {
      name: 'Scale 0.5 (half size)',
      params: { imageType: 'png', scale: 0.5 }
    },
    {
      name: 'Scale 1 (normal)',
      params: { imageType: 'png', scale: 1 }
    },
    {
      name: 'JPEG format',
      params: { imageType: 'jpeg' }
    },
    {
      name: 'SVG format',
      params: { imageType: 'svg' }
    },
    {
      name: 'PDF format',
      params: { imageType: 'pdf' }
    }
  ];
  
  let successCount = 0;
  for (const variation of variations) {
    const success = await testExportVariation(variation.name, variation.params);
    if (success) successCount++;
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between tests
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\nResults: ${successCount}/${variations.length} tests succeeded`);
  
  if (successCount === 0) {
    console.log('\n❌ No export variations worked. The API endpoint appears to be unavailable.');
    console.log('This likely means your Lucid account/plan does not include API export permissions.');
    console.log('\n✅ Recommended solution: Use the iframe embed method instead (no API required).');
  }
}

runAllTests();
