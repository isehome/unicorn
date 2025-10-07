#!/usr/bin/env node

// Test the CORRECT export endpoint from Lucid documentation
const API_KEY = 'key-NDBmNzBhMWRiNWNmMmM3ZmQ4YTJlM2FhNDQ3NGE4M2JiYTA1MTQ1MjZmNzg1NGQxZDgwNDcyMTJkZTE0ODk0Yi11PTIwOTU0NDQ5MA==-vEImeiZi0XID3ARqI3Hp3xr1wNeMbEvnh4oNYNDutE8-Lucid-US';
const DOC_ID = 'f0e89b19-d72d-4ab1-8cb9-2712dbca4bc1';
const PAGE_ID = '0_0';

async function testCorrectExport(name, acceptHeader, queryParams = '') {
  console.log(`\nTesting: ${name}`);
  console.log('Accept header:', acceptHeader);
  
  const url = `https://api.lucid.co/documents/${DOC_ID}${queryParams}`;
  console.log('URL:', url);
  
  try {
    const response = await fetch(url, {
      method: 'GET',  // GET not POST!
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Lucid-Api-Version': '1',
        'Accept': acceptHeader  // This specifies the export format
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));
    
    if (response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('image')) {
        console.log('✅ SUCCESS - Received image data!');
        const buffer = await response.arrayBuffer();
        console.log('   Image size:', buffer.byteLength, 'bytes');
        return true;
      } else {
        // Got JSON metadata instead
        const data = await response.json();
        console.log('📄 Got metadata (not image):', data.title);
        return false;
      }
    } else {
      const errorText = await response.text();
      console.log(`❌ FAILED - ${response.status}: ${errorText.substring(0, 100)}`);
      return false;
    }
  } catch (error) {
    console.log('❌ ERROR -', error.message);
    return false;
  }
}

async function runTests() {
  console.log('Testing CORRECT Lucid export endpoint from documentation...\n');
  console.log('Document:', DOC_ID);
  console.log('Page ID:', PAGE_ID);
  console.log('='.repeat(60));
  
  const tests = [
    {
      name: 'PNG export with pageId parameter',
      accept: 'image/png',
      query: `?pageId=${PAGE_ID}`
    },
    {
      name: 'PNG with low DPI (72)',
      accept: 'image/png;dpi=72',
      query: `?pageId=${PAGE_ID}`
    },
    {
      name: 'PNG with medium DPI (96)',
      accept: 'image/png;dpi=96', 
      query: `?pageId=${PAGE_ID}`
    },
    {
      name: 'JPEG export',
      accept: 'image/jpeg',
      query: `?pageId=${PAGE_ID}`
    },
    {
      name: 'JPEG with low DPI (64)', 
      accept: 'image/jpeg;dpi=64',
      query: `?pageId=${PAGE_ID}`
    },
    {
      name: 'PNG with page number instead of pageId',
      accept: 'image/png',
      query: '?page=1'
    },
    {
      name: 'PNG cropped to content',
      accept: 'image/png',
      query: `?pageId=${PAGE_ID}&crop=content`
    },
    {
      name: 'No Accept header (should return metadata)',
      accept: 'application/json',
      query: ''
    }
  ];
  
  let successCount = 0;
  for (const test of tests) {
    const success = await testCorrectExport(test.name, test.accept, test.query);
    if (success) successCount++;
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait between tests
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\nResults: ${successCount}/${tests.length} image exports succeeded`);
  
  if (successCount > 0) {
    console.log('\n✅ SUCCESS! The correct export endpoint works!');
    console.log('We need to update the proxy to use GET /documents/{id} with Accept header.');
  } else {
    console.log('\n❌ Export still not working even with correct endpoint.');
  }
}

runTests();
