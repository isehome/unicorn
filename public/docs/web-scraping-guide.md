# Web Scraping Product Data from Manufacturer Websites

## Comprehensive Guide (2025-2026)

This guide covers best practices, technical approaches, AI model comparisons, and recommended architectures for scraping and extracting product data from manufacturer websites.

---

## Table of Contents

1. [Web Scraping Best Practices for Product Data](#1-web-scraping-best-practices-for-product-data)
2. [Technical Approaches](#2-technical-approaches)
3. [AI Models for Product Data Extraction - Comparison](#3-ai-models-for-product-data-extraction---comparison)
4. [Recommended Architecture](#4-recommended-architecture)
5. [Code Examples](#5-code-examples)

---

## 1. Web Scraping Best Practices for Product Data

### 1.1 Legal Considerations

#### Understanding the Legal Landscape

The legality of web scraping depends on both the methods used and the data being scraped. The landmark case *hiQ Labs v. LinkedIn* established that scraping publicly accessible data does not violate the Computer Fraud and Abuse Act (CFAA) in the United States.

**Key Legal Principles:**

- **Public vs. Private Data**: Generally, scraping publicly available information is legal, as long as you don't violate a website's Terms of Service or bypass security measures
- **Copyrighted Content**: Scraping copyrighted content without permission can lead to legal issues
- **Personal Data**: Collecting personally identifiable information (PII) systematically without a lawful purpose can trigger privacy law violations

**Regional Regulations:**

| Region | Key Regulation | Notes |
|--------|---------------|-------|
| United States | CFAA, DMCA | Public data generally permissible; bypassing technical barriers may violate DMCA |
| European Union | GDPR | Personal data scraping requires lawful basis |
| United Kingdom | Data Protection Act | Similar to GDPR requirements |
| Canada | PIPEDA | Personal information has specific protection standards |

**Recent Legal Developments (2025):**

Reddit's lawsuit against Perplexity AI (October 2025) has introduced new considerations. The lawsuit alleges industrial-scale data collection and bypassing technical barriers, invoking DMCA Section 1201. This case may reshape the legal landscape for AI training data collection.

#### robots.txt Compliance

Always check and respect the `robots.txt` file located at the root of websites:

```
https://example.com/robots.txt
```

Key directives to honor:
- `User-agent`: Specifies which crawlers the rules apply to
- `Disallow`: Paths that should not be accessed
- `Crawl-delay`: Minimum time between requests
- `Allow`: Explicitly permitted paths

#### Terms of Service Review

Before scraping:
1. Read the ToS carefully for clauses about data usage, scraping, or automation
2. If scraping is prohibited, consider reaching out for permission
3. Explore alternative methods like public APIs

### 1.2 Rate Limiting and Respectful Scraping

**Core Principles:**

1. **Control Concurrent Requests**: Limit parallel connections to avoid overwhelming servers
2. **Add Delays**: Insert random delays between requests (1-5 seconds minimum)
3. **Off-Peak Hours**: Schedule heavy scraping during low-traffic periods
4. **Respect Crawl-delay**: Honor any delay specified in robots.txt
5. **Cache Responses**: Store data locally instead of repeatedly requesting the same pages

**Recommended Rate Limits:**

| Site Type | Requests/Second | Delay Between Requests |
|-----------|-----------------|------------------------|
| Small websites | 0.1-0.5 | 2-10 seconds |
| Medium websites | 0.5-1 | 1-2 seconds |
| Large platforms | 1-2 | 0.5-1 second |
| APIs with rate limits | As documented | Follow API guidelines |

**Why This Matters:**
Excessive requests mimic denial-of-service attacks and can:
- Crash small websites
- Get your IP permanently banned
- Lead to legal action

### 1.3 Handling Dynamic Content (JavaScript-Rendered Pages)

Modern websites increasingly rely on JavaScript for rendering content. From 2020 to 2025, JavaScript-heavy sites increased by 68%.

**Detection Methods:**

1. View page source vs. rendered DOM (significant differences indicate JS rendering)
2. Check Network tab for XHR/Fetch requests loading data
3. Look for frameworks (React, Vue, Angular) in source

**Solutions:**

| Approach | Use Case | Pros | Cons |
|----------|----------|------|------|
| Headless Browsers (Puppeteer/Playwright) | Complex JS apps | Full rendering support | Slower, more resources |
| Hidden API Discovery | Dynamic content | Fast, reliable data | May require auth tokens |
| Rendered HTML Services | Scale requirements | Offload processing | Additional cost |

### 1.4 Authentication and Session Handling

**Common Authentication Patterns:**

1. **Cookie-based Sessions**
   - Capture cookies after login
   - Include in subsequent requests
   - Monitor for session expiration

2. **Token-based Auth (JWT)**
   - Extract tokens from login response
   - Include in Authorization headers
   - Handle token refresh

3. **API Keys**
   - Often found in JavaScript source
   - May be rate-limited per key

**Best Practices:**

```javascript
// Store and reuse session cookies
const session = {
  cookies: [],
  lastRefresh: null,

  async refresh() {
    // Re-authenticate if session expired
    if (this.isExpired()) {
      await this.login();
    }
  },

  isExpired() {
    return Date.now() - this.lastRefresh > 3600000; // 1 hour
  }
};
```

### 1.5 Dealing with Anti-Bot Measures

**Common Detection Methods:**

1. **Request Pattern Analysis**: Too many requests from one IP, perfect timing between requests
2. **Browser Fingerprinting**: Missing mouse movements, headless browser detection
3. **CAPTCHAs**: Human verification challenges
4. **Rate Limiting**: Blocking after threshold exceeded

**Countermeasures:**

| Technique | Implementation |
|-----------|----------------|
| Rotating User Agents | Use realistic, varied browser strings |
| Proxy Rotation | Cycle through IP addresses |
| Request Randomization | Vary timing, order, and headers |
| Stealth Plugins | Use puppeteer-extra-plugin-stealth |
| Residential Proxies | Appear as real users |
| Human-like Behavior | Add mouse movements, scrolling |

**Headers to Include:**

```javascript
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Referer': 'https://www.google.com/'
};
```

---

## 2. Technical Approaches

### 2.1 Server-Side Scraping Libraries

#### Cheerio (Static HTML Parsing)

Cheerio is a fast, lightweight HTML parser that implements jQuery syntax on the server.

**Best For:**
- Static pages without JavaScript rendering
- High-volume scraping where speed matters
- Simple data extraction tasks

**Characteristics:**
- Does not execute JavaScript
- Very fast (no browser overhead)
- Low memory footprint
- jQuery-like syntax

```javascript
const cheerio = require('cheerio');
const axios = require('axios');

async function scrapeProduct(url) {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  return {
    name: $('h1.product-title').text().trim(),
    price: $('.price-current').text().trim(),
    sku: $('[data-sku]').attr('data-sku'),
    description: $('.product-description').text().trim()
  };
}
```

#### Puppeteer (Chrome Automation)

Created by the Chrome DevTools team, Puppeteer provides headless Chrome control.

**Best For:**
- JavaScript-rendered content
- Complex interactions (clicks, forms)
- Screenshots and PDFs
- Sites requiring full browser environment

```javascript
const puppeteer = require('puppeteer');

async function scrapeWithPuppeteer(url) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Stealth mode
  await page.setUserAgent('Mozilla/5.0...');

  await page.goto(url, { waitUntil: 'networkidle2' });

  // Wait for dynamic content
  await page.waitForSelector('.product-info');

  const product = await page.evaluate(() => {
    return {
      name: document.querySelector('h1').innerText,
      price: document.querySelector('.price').innerText,
      specs: Array.from(document.querySelectorAll('.spec-row'))
        .map(row => ({
          label: row.querySelector('.label').innerText,
          value: row.querySelector('.value').innerText
        }))
    };
  });

  await browser.close();
  return product;
}
```

#### Playwright (Multi-Browser Automation)

Microsoft's browser automation tool supporting Chrome, Firefox, and WebKit.

**Best For:**
- Cross-browser testing
- Complex web apps with login flows
- When Firefox/Safari compatibility needed
- Superior to Puppeteer for reliability

```javascript
const { chromium } = require('playwright');

async function scrapeWithPlaywright(url) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0...',
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // Block unnecessary resources
  await page.route('**/*.{png,jpg,jpeg,gif,svg,css,font,woff,woff2}', route => route.abort());

  await page.goto(url);
  await page.waitForLoadState('networkidle');

  // Extract data
  const data = await page.locator('.product-card').evaluateAll(cards =>
    cards.map(card => ({
      name: card.querySelector('.name')?.textContent,
      price: card.querySelector('.price')?.textContent
    }))
  );

  await browser.close();
  return data;
}
```

### 2.2 API-First Approaches (Hidden API Discovery)

Hidden APIs return structured JSON data directly, eliminating HTML parsing complexity.

**Why Hidden APIs Are Better:**
- Faster than rendering full pages
- More reliable (structured data)
- Often include more data than visible on page
- Less susceptible to layout changes

**Discovery Methods:**

1. **Browser DevTools Network Tab**
   - Open DevTools (F12)
   - Go to Network tab
   - Filter by XHR/Fetch
   - Interact with the page
   - Look for JSON responses

2. **Common API URL Patterns:**
   ```
   /api/
   /v1/, /v2/
   /graphql
   /ajax/
   /json/
   /_next/data/
   /__data.json
   ```

3. **JavaScript Source Analysis**
   - Search for `fetch(`, `axios.`, `$.ajax`
   - Look for API base URLs
   - Find authentication token patterns

4. **Postman Interceptor**
   - Chrome extension captures requests
   - Replicates in Postman for testing
   - Helps identify required headers

**Example API Discovery:**

```javascript
// Once API endpoint discovered
async function scrapeViaAPI(productId) {
  const response = await axios.get(`https://api.example.com/v2/products/${productId}`, {
    headers: {
      'X-API-Key': 'discovered-key',
      'Accept': 'application/json',
      'Referer': 'https://www.example.com/'
    }
  });

  return response.data;
}
```

### 2.3 Headless Browsers vs. Simple HTTP Requests

**Decision Matrix:**

| Factor | HTTP Requests | Headless Browser |
|--------|---------------|------------------|
| Speed | 10-100x faster | Slower |
| Resource Usage | Minimal | High (memory/CPU) |
| JavaScript Support | None | Full |
| Detection Risk | Lower | Higher (fingerprintable) |
| Cost at Scale | Low | High |
| Complexity | Simple | Complex |

**When to Use What:**

- **HTTP Requests + Cheerio**: Static HTML, simple structures, high volume
- **Hidden APIs**: Dynamic content with discoverable endpoints
- **Headless Browser**: Complex JS apps, login flows, no API available

### 2.4 Handling Pagination and Infinite Scroll

#### Traditional Pagination

```javascript
async function scrapePaginatedProducts(baseUrl, maxPages = 10) {
  const allProducts = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = `${baseUrl}?page=${page}`;
    const products = await scrapePage(url);

    if (products.length === 0) break; // No more products

    allProducts.push(...products);

    // Respectful delay
    await delay(1000 + Math.random() * 2000);
  }

  return allProducts;
}
```

#### Infinite Scroll

```javascript
async function scrapeInfiniteScroll(page, maxScrolls = 20) {
  const products = new Set();
  let scrollCount = 0;
  let previousHeight = 0;

  while (scrollCount < maxScrolls) {
    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Wait for new content
    await page.waitForTimeout(2000);

    // Check if more content loaded
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);

    if (currentHeight === previousHeight) {
      // No new content, try clicking "Load More" if exists
      const loadMore = await page.$('.load-more-btn');
      if (loadMore) {
        await loadMore.click();
        await page.waitForTimeout(2000);
      } else {
        break; // Truly done
      }
    }

    // Extract current products
    const currentProducts = await page.$$eval('.product', els =>
      els.map(el => el.dataset.id)
    );
    currentProducts.forEach(p => products.add(p));

    previousHeight = currentHeight;
    scrollCount++;
  }

  return Array.from(products);
}
```

### 2.5 Extracting Structured Data (JSON-LD, Microdata, Open Graph)

Modern websites embed structured data for SEO purposes. This data is often the cleanest source.

**Formats:**

| Format | Location | Best For |
|--------|----------|----------|
| JSON-LD | `<script type="application/ld+json">` | Most reliable, Google-recommended |
| Microdata | HTML attributes (itemscope, itemprop) | Covers visible page data |
| Open Graph | `<meta property="og:*">` | Social sharing, basic info |
| Twitter Cards | `<meta name="twitter:*">` | Similar to Open Graph |

**Extraction Example:**

```javascript
const cheerio = require('cheerio');

function extractStructuredData(html) {
  const $ = cheerio.load(html);
  const structuredData = {
    jsonLd: [],
    openGraph: {},
    microdata: []
  };

  // Extract JSON-LD
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const data = JSON.parse($(el).html());
      structuredData.jsonLd.push(data);
    } catch (e) {
      console.error('Invalid JSON-LD:', e.message);
    }
  });

  // Extract Open Graph
  $('meta[property^="og:"]').each((i, el) => {
    const property = $(el).attr('property').replace('og:', '');
    structuredData.openGraph[property] = $(el).attr('content');
  });

  // Extract Product microdata
  $('[itemtype*="Product"]').each((i, el) => {
    const product = {};
    $(el).find('[itemprop]').each((j, prop) => {
      const name = $(prop).attr('itemprop');
      product[name] = $(prop).attr('content') || $(prop).text().trim();
    });
    structuredData.microdata.push(product);
  });

  return structuredData;
}
```

**Node.js Libraries:**

- **metascraper**: Unified metadata extraction (Open Graph, Microdata, JSON-LD)
- **extruct** (Python): Extract all structured data formats with `uniform=True` option

---

## 3. AI Models for Product Data Extraction - Comparison

### 3.1 Model Overview (2025-2026)

The AI landscape for data extraction has evolved significantly. Here's a comprehensive comparison of leading models.

### 3.2 Google Gemini Models

#### Gemini 2.5 Flash

| Attribute | Value |
|-----------|-------|
| Context Window | 1M tokens |
| Input Cost | $0.30/M tokens |
| Output Cost | $2.50/M tokens |
| Hallucination Rate | ~6.3% (Vectara benchmark) |
| Best For | Cost-effective extraction at scale |

**Strengths:**
- Controllable thinking mode for quality/cost balance
- Excellent multimodal understanding
- Lowest hallucination rates among tested models
- Best value for high-volume extraction

#### Gemini 2.5 Pro

| Attribute | Value |
|-----------|-------|
| Context Window | 1M tokens |
| Input Cost | $1.25/M tokens |
| Output Cost | $10/M tokens |
| Best For | Complex extraction, research tasks |

**Strengths:**
- 80% research accuracy with better citations
- Superior for scientific and mathematical content
- Long context enables entire HTML pages

#### Gemini 3 Pro Preview (November 2025)

| Attribute | Value |
|-----------|-------|
| Context Window | 1M tokens input, 64K output |
| Architecture | MoE (1T+ total params, 15-20B active) |
| Knowledge Cutoff | January 2025 |
| Best For | State-of-the-art reasoning |

**Strengths:**
- 91.9% on GPQA Diamond (exceeds human experts)
- 1501 LMArena Elo (first to break 1500)
- Powerful agentic and coding capabilities

### 3.3 OpenAI GPT Models

#### GPT-4o

| Attribute | Value |
|-----------|-------|
| Context Window | 128K tokens |
| Input Cost | $2.50-5.00/M tokens |
| Output Cost | $10-15/M tokens |
| Hallucination Rate | ~1.5% (simple) / ~15.8% (grounded) |
| Best For | Balanced performance, multimodal tasks |

**Strengths:**
- Reliable 82% accuracy with structured prompts
- Strong tool execution capabilities
- Mature API ecosystem
- Good JSON output adherence

**Weaknesses:**
- Smaller context window than Gemini
- Higher cost than Flash models
- 71% of reviewers noted "confidently wrong" outputs in niche topics

#### GPT-4o Mini

| Attribute | Value |
|-----------|-------|
| Context Window | 128K tokens |
| Input Cost | $0.15/M tokens |
| Output Cost | $0.60/M tokens |
| Best For | High-volume, simpler extractions |

**Strengths:**
- Extremely cost-effective
- Fast response times
- Good for straightforward product specs

### 3.4 Anthropic Claude Models

#### Claude Opus 4.5

| Attribute | Value |
|-----------|-------|
| Context Window | 200K tokens |
| Input Cost | ~$15/M tokens |
| Output Cost | ~$75/M tokens |
| Hallucination Rate | ~10.1% |
| Best For | Complex coding, nuanced extraction |

**Strengths:**
- 92% success on complex code generation
- 77.2% on SWE-Bench (best for real-world fixes)
- 89.2% on HumanEval coding challenges
- Best confidence calibration (-0.04 deviation)
- Only 29% of users reported hallucination issues
- Explicit uncertainty disclaimers

**Weaknesses:**
- Highest cost among major models
- Higher hallucination rate in benchmarks
- Smaller context than Gemini models

#### Claude Sonnet 4

| Attribute | Value |
|-----------|-------|
| Context Window | 200K tokens |
| Input Cost | $3/M tokens |
| Output Cost | $15/M tokens |
| Hallucination Rate | ~4.4% (model-specific) / ~16% (grounded) |
| Best For | Balanced extraction tasks |

**Strengths:**
- Good balance of cost and capability
- Strong for structured JSON output
- Reliable for product specifications

### 3.5 Open Source Alternatives

#### Llama 3.3 / Llama 3.1 405B

| Attribute | Value |
|-----------|-------|
| Context Window | 128K tokens |
| Cost | Self-hosted or ~$0.50-2/M tokens (providers) |
| Best For | Privacy-sensitive, custom deployments |

**Strengths:**
- Strong logical reasoning (outperforms Mistral Large 2)
- Flexible, developer-friendly integration
- No data leaves your infrastructure
- 128K context supports large HTML pages

**Weaknesses:**
- Slower processing for large documents
- Requires infrastructure management
- May need fine-tuning for optimal extraction

#### Mistral (7B / Large 2)

| Attribute | Value |
|-----------|-------|
| Context Window | 32K-128K tokens |
| Cost | Self-hosted or ~$0.50/M tokens |
| Best For | Efficient summarization, real-time extraction |

**Strengths:**
- Best efficiency for size class
- Superior HumanEval (coding) performance
- Low latency for real-time use
- Excellent for detailed summarization

**Weaknesses:**
- Some incorrect explanations in complex reasoning
- Less suited for very large documents

#### DeepSeek V3.2

| Attribute | Value |
|-----------|-------|
| Input Cost | $0.27/M tokens |
| Output Cost | $1.10/M tokens |
| Best For | Cost-sensitive high-volume extraction |

**Strengths:**
- Revolutionary pricing (30x cheaper than GPT-5)
- Strong benchmark performance
- Good for budget-constrained projects

### 3.6 Comparison Summary Table

| Model | Context | Input $/M | Output $/M | Hallucination | JSON Adherence | Speed | Best Use Case |
|-------|---------|-----------|------------|---------------|----------------|-------|---------------|
| Gemini 2.5 Flash | 1M | $0.30 | $2.50 | ~6.3% | Excellent | Fast | High-volume extraction |
| Gemini 2.5 Pro | 1M | $1.25 | $10.00 | Low | Excellent | Medium | Complex analysis |
| Gemini 3 Pro | 1M | TBD | TBD | Very Low | Excellent | Medium | State-of-art reasoning |
| GPT-4o | 128K | $2.50 | $10.00 | ~1.5-15.8% | Good | Fast | Balanced extraction |
| GPT-4o Mini | 128K | $0.15 | $0.60 | Medium | Good | Very Fast | Budget extraction |
| Claude Opus 4.5 | 200K | $15.00 | $75.00 | ~10.1% | Excellent | Slow | Complex/coding tasks |
| Claude Sonnet 4 | 200K | $3.00 | $15.00 | ~4.4-16% | Excellent | Medium | Balanced extraction |
| Llama 3.3 | 128K | Variable | Variable | Medium | Good | Medium | Self-hosted/privacy |
| Mistral Large 2 | 128K | ~$2.00 | ~$6.00 | Medium | Good | Fast | Real-time extraction |
| DeepSeek V3.2 | 64K+ | $0.27 | $1.10 | Medium | Good | Fast | Budget scale |

### 3.7 Recommendations by Use Case

| Use Case | Recommended Model | Rationale |
|----------|-------------------|-----------|
| High-volume product scraping | Gemini 2.5 Flash | Best cost/hallucination balance |
| Complex spec sheets | Claude Sonnet 4 or Gemini 2.5 Pro | Strong structured output |
| Budget-constrained | DeepSeek V3.2 or GPT-4o Mini | Extremely low cost |
| Maximum accuracy | Gemini 3 Pro + Claude verification | Multi-model validation |
| Self-hosted/privacy | Llama 3.3 | No data leaves infrastructure |
| Real-time extraction | Mistral or GPT-4o Mini | Low latency |

---

## 4. Recommended Architecture

### 4.1 Hybrid Scraping + AI Pipeline

```
[URL Queue] --> [Scraper Layer] --> [Data Extraction] --> [AI Processing] --> [Validation] --> [Storage]
     |               |                    |                    |                  |
     |          Cheerio/Puppeteer    JSON-LD/APIs          LLM Extraction    Verification
     |          /Playwright          first attempt          fallback            layer
     |               |                    |                    |                  |
     v               v                    v                    v                  v
  Rate Limiter   Anti-detection      Structured           Prompt             De-duplication
                   Headers           Data Parser          Engineering           & Cache
```

### 4.2 When to Use AI vs. Traditional Parsing

**Use Traditional Parsing (Regex/DOM) When:**

1. Data is in consistent, well-structured HTML
2. JSON-LD or structured data is available
3. High volume with tight cost constraints
4. Simple, repetitive extractions
5. Speed is critical (10-100x faster)

**Use AI Extraction When:**

1. HTML structure varies significantly across products
2. Specifications are in unstructured prose
3. Need to normalize inconsistent formats
4. Complex reasoning required (unit conversions, etc.)
5. No structured data available

**Hybrid Approach (Recommended):**

```javascript
async function extractProductData(html, url) {
  // Step 1: Try structured data first (fastest, most reliable)
  const structuredData = extractStructuredData(html);

  if (structuredData.jsonLd.length > 0) {
    const product = findProductInJsonLd(structuredData.jsonLd);
    if (isComplete(product)) {
      return { source: 'json-ld', data: product, confidence: 'high' };
    }
  }

  // Step 2: Try DOM parsing with known selectors
  const domData = extractWithSelectors(html, getSiteSelectors(url));

  if (isComplete(domData)) {
    return { source: 'dom', data: domData, confidence: 'high' };
  }

  // Step 3: Fall back to AI extraction for remaining/all fields
  const aiData = await extractWithAI(html, domData);

  return { source: 'ai', data: aiData, confidence: 'medium' };
}
```

### 4.3 Verification Strategies to Catch Hallucinations

AI models can hallucinate product specifications. Implement these verification strategies:

#### Strategy 1: Multi-Model Consensus

```javascript
async function verifyWithConsensus(html, initialExtraction) {
  const models = ['gemini-2.5-flash', 'gpt-4o-mini', 'claude-sonnet'];
  const extractions = await Promise.all(
    models.map(model => extractWithModel(html, model))
  );

  const verified = {};

  for (const field of Object.keys(initialExtraction)) {
    const values = extractions.map(e => e[field]).filter(Boolean);
    const consensus = findConsensus(values);

    if (consensus.agreement >= 2) {
      verified[field] = consensus.value;
    } else {
      verified[field] = { value: initialExtraction[field], confidence: 'low' };
    }
  }

  return verified;
}
```

#### Strategy 2: Source Text Verification

```javascript
function verifyAgainstSource(extraction, sourceHtml) {
  const text = stripHtml(sourceHtml).toLowerCase();
  const verified = {};

  for (const [field, value] of Object.entries(extraction)) {
    const valueStr = String(value).toLowerCase();

    // Check if value appears in source
    if (text.includes(valueStr)) {
      verified[field] = { value, verified: true };
    } else if (findSimilar(text, valueStr)) {
      verified[field] = { value, verified: 'partial' };
    } else {
      verified[field] = { value, verified: false, warning: 'Not found in source' };
    }
  }

  return verified;
}
```

#### Strategy 3: Schema Validation

```javascript
const productSchema = {
  type: 'object',
  required: ['name', 'sku'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 500 },
    sku: { type: 'string', pattern: '^[A-Z0-9-]+$' },
    price: { type: 'number', minimum: 0, maximum: 1000000 },
    weight: { type: 'number', minimum: 0 },
    dimensions: {
      type: 'object',
      properties: {
        length: { type: 'number', minimum: 0 },
        width: { type: 'number', minimum: 0 },
        height: { type: 'number', minimum: 0 },
        unit: { type: 'string', enum: ['in', 'cm', 'mm', 'ft'] }
      }
    }
  }
};

function validateExtraction(data) {
  const valid = ajv.validate(productSchema, data);
  return { valid, errors: ajv.errors };
}
```

#### Strategy 4: Confidence Scoring

```javascript
function scoreConfidence(extraction, sourceHtml) {
  let score = 100;
  const issues = [];

  // Penalty: Fields not found in source
  const notFound = verifyAgainstSource(extraction, sourceHtml);
  const unverifiedCount = Object.values(notFound).filter(v => !v.verified).length;
  score -= unverifiedCount * 10;

  // Penalty: Suspicious values
  if (extraction.price && extraction.price < 1) {
    score -= 20;
    issues.push('Suspiciously low price');
  }

  // Penalty: Missing critical fields
  if (!extraction.name || !extraction.sku) {
    score -= 30;
    issues.push('Missing critical fields');
  }

  return { score: Math.max(0, score), issues };
}
```

### 4.4 Caching and Deduplication

**Caching Strategy:**

```javascript
const Redis = require('ioredis');
const crypto = require('crypto');

class ScraperCache {
  constructor() {
    this.redis = new Redis();
    this.TTL = 86400; // 24 hours
  }

  getKey(url) {
    return `scrape:${crypto.createHash('md5').update(url).digest('hex')}`;
  }

  async get(url) {
    const cached = await this.redis.get(this.getKey(url));
    return cached ? JSON.parse(cached) : null;
  }

  async set(url, data) {
    await this.redis.setex(
      this.getKey(url),
      this.TTL,
      JSON.stringify(data)
    );
  }

  async shouldRefresh(url, maxAge = 86400) {
    const ttl = await this.redis.ttl(this.getKey(url));
    return ttl < 0 || (this.TTL - ttl) > maxAge;
  }
}
```

**Deduplication:**

```javascript
function generateProductHash(product) {
  const normalizedName = product.name.toLowerCase().replace(/\s+/g, ' ').trim();
  const normalizedSku = (product.sku || '').toUpperCase();

  return crypto.createHash('sha256')
    .update(`${normalizedName}|${normalizedSku}|${product.manufacturerUrl}`)
    .digest('hex');
}

async function isDuplicate(product, db) {
  const hash = generateProductHash(product);
  const existing = await db.products.findOne({ hash });
  return !!existing;
}
```

---

## 5. Code Examples

### 5.1 Complete Scraping Example (Node.js)

```javascript
const axios = require('axios');
const cheerio = require('cheerio');
const { chromium } = require('playwright');
const Anthropic = require('@anthropic-ai/sdk');

class ProductScraper {
  constructor(options = {}) {
    this.anthropic = new Anthropic();
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
    ];
    this.requestDelay = options.delay || 2000;
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms + Math.random() * 1000));
  }

  // Simple HTTP request for static pages
  async fetchStatic(url) {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': this.getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      },
      timeout: 30000
    });
    return response.data;
  }

  // Playwright for JavaScript-rendered pages
  async fetchDynamic(url) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: this.getRandomUserAgent(),
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    // Block unnecessary resources
    await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2}', route => route.abort());

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      const html = await page.content();
      return html;
    } finally {
      await browser.close();
    }
  }

  // Extract JSON-LD structured data
  extractJsonLd(html) {
    const $ = cheerio.load(html);
    const jsonLdScripts = $('script[type="application/ld+json"]');
    const data = [];

    jsonLdScripts.each((i, el) => {
      try {
        const parsed = JSON.parse($(el).html());
        data.push(parsed);
      } catch (e) {
        // Invalid JSON, skip
      }
    });

    // Find Product schema
    for (const item of data) {
      if (item['@type'] === 'Product') {
        return item;
      }
      if (item['@graph']) {
        const product = item['@graph'].find(g => g['@type'] === 'Product');
        if (product) return product;
      }
    }

    return null;
  }

  // Extract using DOM selectors
  extractWithSelectors(html, selectors) {
    const $ = cheerio.load(html);
    const result = {};

    for (const [field, selector] of Object.entries(selectors)) {
      const element = $(selector);
      if (element.length > 0) {
        result[field] = element.first().text().trim() || element.first().attr('content');
      }
    }

    return result;
  }

  // Main extraction method
  async scrapeProduct(url, options = {}) {
    // Respectful delay
    await this.delay(this.requestDelay);

    // Fetch HTML (try static first, fall back to dynamic)
    let html;
    try {
      html = await this.fetchStatic(url);
    } catch (error) {
      console.log('Static fetch failed, trying dynamic...');
      html = await this.fetchDynamic(url);
    }

    // Step 1: Try JSON-LD extraction
    const jsonLdProduct = this.extractJsonLd(html);
    if (jsonLdProduct && this.isComplete(jsonLdProduct)) {
      return {
        source: 'json-ld',
        confidence: 'high',
        data: this.normalizeJsonLd(jsonLdProduct)
      };
    }

    // Step 2: Try DOM selectors (site-specific)
    const siteSelectors = options.selectors || this.getDefaultSelectors();
    const domProduct = this.extractWithSelectors(html, siteSelectors);

    if (this.isComplete(domProduct)) {
      return {
        source: 'dom',
        confidence: 'high',
        data: domProduct
      };
    }

    // Step 3: Use AI extraction
    const aiProduct = await this.extractWithAI(html, { ...jsonLdProduct, ...domProduct });

    return {
      source: 'ai',
      confidence: 'medium',
      data: aiProduct
    };
  }

  getDefaultSelectors() {
    return {
      name: 'h1, [itemprop="name"], .product-title, .product-name',
      price: '[itemprop="price"], .price, .product-price, [data-price]',
      sku: '[itemprop="sku"], .sku, [data-sku]',
      description: '[itemprop="description"], .product-description, .description',
      brand: '[itemprop="brand"], .brand, .manufacturer'
    };
  }

  isComplete(product) {
    return product && product.name && (product.sku || product.price);
  }

  normalizeJsonLd(jsonLd) {
    return {
      name: jsonLd.name,
      description: jsonLd.description,
      sku: jsonLd.sku,
      brand: jsonLd.brand?.name || jsonLd.brand,
      price: jsonLd.offers?.price || jsonLd.offers?.[0]?.price,
      currency: jsonLd.offers?.priceCurrency || jsonLd.offers?.[0]?.priceCurrency,
      availability: jsonLd.offers?.availability,
      image: jsonLd.image,
      url: jsonLd.url
    };
  }

  async extractWithAI(html, partialData = {}) {
    // Truncate HTML to fit context window
    const truncatedHtml = html.substring(0, 100000);

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `Extract product information from this HTML. Return ONLY valid JSON with these fields:
{
  "name": "Product name",
  "sku": "SKU/Model number or null",
  "brand": "Manufacturer/brand or null",
  "price": numeric price or null,
  "currency": "USD/EUR/etc or null",
  "description": "Brief description or null",
  "specifications": {
    "key": "value pairs for technical specs"
  },
  "images": ["array of image URLs"],
  "availability": "in_stock/out_of_stock/unknown"
}

IMPORTANT RULES:
- Use null for any field not clearly present in the HTML
- DO NOT make up or guess values
- Extract ONLY what is explicitly stated
- For price, extract numeric value only (no currency symbols)
- For specifications, extract technical details like dimensions, weight, materials, etc.

Partial data already extracted (verify and supplement): ${JSON.stringify(partialData)}

HTML:
${truncatedHtml}`
        }
      ]
    });

    try {
      const content = response.content[0].text;
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
                        content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
    } catch (e) {
      console.error('AI extraction parse error:', e.message);
    }

    return partialData;
  }
}

// Usage example
async function main() {
  const scraper = new ProductScraper({ delay: 2000 });

  const result = await scraper.scrapeProduct('https://example.com/product/12345');

  console.log('Extraction result:');
  console.log('Source:', result.source);
  console.log('Confidence:', result.confidence);
  console.log('Data:', JSON.stringify(result.data, null, 2));
}

module.exports = ProductScraper;
```

### 5.2 AI Prompt for Product Extraction

**Basic Extraction Prompt:**

```
You are a product data extraction assistant. Extract structured information from the provided HTML content.

Return a JSON object with the following structure:
{
  "name": "Full product name",
  "sku": "SKU, model number, or part number",
  "brand": "Manufacturer or brand name",
  "price": {
    "value": numeric_price,
    "currency": "USD",
    "originalText": "original price string"
  },
  "description": "Product description (max 500 chars)",
  "specifications": {
    "dimensions": { "length": 0, "width": 0, "height": 0, "unit": "in" },
    "weight": { "value": 0, "unit": "lbs" },
    "color": "color name",
    "material": "material type",
    // Additional specs as key-value pairs
  },
  "images": ["https://..."],
  "availability": "in_stock" | "out_of_stock" | "preorder" | "unknown",
  "category": ["Category", "Subcategory"],
  "features": ["Feature 1", "Feature 2"]
}

CRITICAL RULES:
1. Use null for any field NOT explicitly present in the HTML
2. NEVER invent, guess, or hallucinate data
3. If multiple prices exist, use the current/sale price
4. Convert all measurements to consistent units when possible
5. Extract specification keys exactly as shown on page
6. Return ONLY valid JSON, no explanation text
```

**Advanced Prompt with Edge Cases:**

```
Extract product specifications from the following HTML. Handle these edge cases:

PRICE HANDLING:
- If "sold out" or "unavailable" appears, set availability: "out_of_stock"
- Use lowest current price if multiple prices shown
- Ignore "was" or "original" prices for the main price field
- Parse price from formats: "$1,234.56", "1234.56 USD", "USD 1,234"

SPECIFICATIONS:
- Extract dimensions in format: L x W x H
- Convert fractions to decimals (1/2 = 0.5)
- Normalize units: inches/in/", centimeters/cm, etc.
- For weight: extract numeric value and unit separately

MISSING DATA:
- Use null, never empty strings
- Never guess colors from product images
- Never infer specs from similar products

MULTIPLE VARIANTS:
- If product has variants (colors, sizes), extract base product info
- Include variant options as: "variants": [{"type": "color", "options": ["Red", "Blue"]}]

Return strict JSON matching this schema:
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["name"],
  "properties": {...}
}
```

### 5.3 Validation and Verification Code

```javascript
const Ajv = require('ajv');
const stringSimilarity = require('string-similarity');

class ProductValidator {
  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    this.schema = {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 500 },
        sku: { type: ['string', 'null'], pattern: '^[A-Za-z0-9-_.]+$' },
        brand: { type: ['string', 'null'] },
        price: {
          type: ['object', 'null'],
          properties: {
            value: { type: 'number', minimum: 0, maximum: 10000000 },
            currency: { type: 'string', pattern: '^[A-Z]{3}$' }
          }
        },
        description: { type: ['string', 'null'], maxLength: 5000 },
        specifications: { type: ['object', 'null'] },
        images: { type: 'array', items: { type: 'string', format: 'uri' } },
        availability: {
          type: 'string',
          enum: ['in_stock', 'out_of_stock', 'preorder', 'unknown']
        }
      }
    };
    this.validate = this.ajv.compile(this.schema);
  }

  // Schema validation
  validateSchema(product) {
    const valid = this.validate(product);
    return {
      valid,
      errors: this.validate.errors || []
    };
  }

  // Verify extracted values exist in source HTML
  verifyAgainstSource(product, sourceHtml) {
    const sourceText = this.stripHtml(sourceHtml).toLowerCase();
    const results = {};
    const fieldsToVerify = ['name', 'sku', 'brand'];

    for (const field of fieldsToVerify) {
      const value = product[field];
      if (!value) {
        results[field] = { status: 'missing' };
        continue;
      }

      const valueStr = String(value).toLowerCase();

      if (sourceText.includes(valueStr)) {
        results[field] = { status: 'verified', confidence: 1.0 };
      } else {
        // Check for partial match
        const similarity = this.findBestMatch(valueStr, sourceText);
        if (similarity > 0.8) {
          results[field] = { status: 'partial', confidence: similarity };
        } else {
          results[field] = {
            status: 'not_found',
            confidence: 0,
            warning: `Value "${value}" not found in source HTML`
          };
        }
      }
    }

    // Special handling for price
    if (product.price?.value) {
      const priceStr = String(product.price.value);
      const pricePatterns = [
        priceStr,
        priceStr.replace('.', ','),
        this.formatPrice(product.price.value)
      ];

      const found = pricePatterns.some(p => sourceText.includes(p.toLowerCase()));
      results.price = found
        ? { status: 'verified', confidence: 1.0 }
        : { status: 'not_found', confidence: 0 };
    }

    return results;
  }

  stripHtml(html) {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  findBestMatch(needle, haystack) {
    // Split haystack into chunks and find best match
    const words = haystack.split(/\s+/);
    const chunks = [];

    for (let i = 0; i < words.length - 5; i++) {
      chunks.push(words.slice(i, i + 10).join(' '));
    }

    const matches = stringSimilarity.findBestMatch(needle, chunks);
    return matches.bestMatch.rating;
  }

  formatPrice(value) {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2 });
  }

  // Calculate overall confidence score
  calculateConfidence(product, sourceHtml, extractionSource) {
    let score = 100;
    const issues = [];

    // Source-based scoring
    const sourceScores = {
      'json-ld': 95,
      'dom': 85,
      'ai': 70
    };
    score = sourceScores[extractionSource] || 70;

    // Schema validation
    const schemaResult = this.validateSchema(product);
    if (!schemaResult.valid) {
      score -= schemaResult.errors.length * 5;
      issues.push(...schemaResult.errors.map(e => e.message));
    }

    // Source verification
    const verification = this.verifyAgainstSource(product, sourceHtml);
    for (const [field, result] of Object.entries(verification)) {
      if (result.status === 'not_found') {
        score -= 15;
        issues.push(`${field}: ${result.warning}`);
      } else if (result.status === 'partial') {
        score -= 5;
      }
    }

    // Suspicious value checks
    if (product.price?.value === 0) {
      score -= 20;
      issues.push('Price is zero - likely extraction error');
    }

    if (product.name && product.name.length < 3) {
      score -= 15;
      issues.push('Product name suspiciously short');
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      grade: this.getGrade(score),
      issues,
      verification
    };
  }

  getGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}

// Multi-model consensus verification
class ConsensusVerifier {
  constructor(models) {
    this.models = models; // Array of model configs
  }

  async verify(html, field, value) {
    const extractions = await Promise.all(
      this.models.map(model => this.extractField(html, field, model))
    );

    const valueCounts = {};
    for (const extraction of extractions) {
      const normalized = this.normalize(extraction);
      valueCounts[normalized] = (valueCounts[normalized] || 0) + 1;
    }

    const consensus = Object.entries(valueCounts)
      .sort((a, b) => b[1] - a[1])[0];

    return {
      value: consensus[0],
      agreement: consensus[1] / this.models.length,
      allExtractions: extractions
    };
  }

  normalize(value) {
    if (typeof value === 'string') {
      return value.toLowerCase().trim();
    }
    return JSON.stringify(value);
  }

  async extractField(html, field, modelConfig) {
    // Implementation depends on model provider
    // Returns extracted value for specific field
  }
}

module.exports = { ProductValidator, ConsensusVerifier };
```

### 5.4 Complete Pipeline Example

```javascript
const ProductScraper = require('./scraper');
const { ProductValidator, ConsensusVerifier } = require('./validator');
const Redis = require('ioredis');

class ProductPipeline {
  constructor(config) {
    this.scraper = new ProductScraper({ delay: config.delay || 2000 });
    this.validator = new ProductValidator();
    this.cache = new Redis(config.redis);
    this.minConfidence = config.minConfidence || 70;
  }

  async processUrl(url) {
    // Check cache
    const cacheKey = `product:${this.hashUrl(url)}`;
    const cached = await this.cache.get(cacheKey);

    if (cached) {
      const data = JSON.parse(cached);
      if (data.confidence.score >= this.minConfidence) {
        return { ...data, fromCache: true };
      }
    }

    // Scrape
    const html = await this.scraper.fetchStatic(url).catch(() =>
      this.scraper.fetchDynamic(url)
    );

    // Extract
    const result = await this.scraper.scrapeProduct(url);

    // Validate
    const confidence = this.validator.calculateConfidence(
      result.data,
      html,
      result.source
    );

    // Re-extract with AI if low confidence
    if (confidence.score < this.minConfidence && result.source !== 'ai') {
      const aiResult = await this.scraper.extractWithAI(html, result.data);
      const aiConfidence = this.validator.calculateConfidence(aiResult, html, 'ai');

      if (aiConfidence.score > confidence.score) {
        result.data = aiResult;
        result.source = 'ai';
        confidence.score = aiConfidence.score;
        confidence.issues = aiConfidence.issues;
      }
    }

    // Final result
    const finalResult = {
      url,
      data: result.data,
      source: result.source,
      confidence,
      extractedAt: new Date().toISOString()
    };

    // Cache if confidence is acceptable
    if (confidence.score >= this.minConfidence) {
      await this.cache.setex(cacheKey, 86400, JSON.stringify(finalResult));
    }

    return finalResult;
  }

  async processBatch(urls, concurrency = 3) {
    const results = [];
    const queue = [...urls];

    const workers = Array(concurrency).fill().map(async () => {
      while (queue.length > 0) {
        const url = queue.shift();
        if (!url) continue;

        try {
          const result = await this.processUrl(url);
          results.push(result);
        } catch (error) {
          results.push({
            url,
            error: error.message,
            extractedAt: new Date().toISOString()
          });
        }
      }
    });

    await Promise.all(workers);
    return results;
  }

  hashUrl(url) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(url).digest('hex');
  }
}

// Usage
async function main() {
  const pipeline = new ProductPipeline({
    delay: 2000,
    minConfidence: 75,
    redis: { host: 'localhost', port: 6379 }
  });

  const urls = [
    'https://example.com/product/1',
    'https://example.com/product/2',
    'https://example.com/product/3'
  ];

  const results = await pipeline.processBatch(urls, 2);

  console.log('Results:');
  for (const result of results) {
    if (result.error) {
      console.log(`ERROR: ${result.url} - ${result.error}`);
    } else {
      console.log(`${result.url} - Confidence: ${result.confidence.score} (${result.confidence.grade})`);
      console.log(`  Source: ${result.source}, From Cache: ${result.fromCache || false}`);
    }
  }
}

module.exports = ProductPipeline;
```

---

## References and Sources

### Legal and Ethical Guidelines
- [DOs and DON'Ts of Web Scraping 2026](https://medium.com/@datajournal/dos-and-donts-of-web-scraping-in-2025-e4f9b2a49431)
- [Is Web Scraping Legal? (Browserless)](https://www.browserless.io/blog/is-web-scraping-legal)
- [Web Scraping Ethics Benchmark 2026](https://research.aimultiple.com/web-scraping-ethics/)
- [ScrapingBee Best Practices](https://www.scrapingbee.com/blog/web-scraping-best-practices/)

### Technical Tools and Libraries
- [Best JavaScript Web Scraping Libraries (ScrapingBee)](https://www.scrapingbee.com/blog/best-javascript-web-scraping-libraries/)
- [Cheerio vs Puppeteer Comparison](https://research.aimultiple.com/cheerio-vs-puppeteer/)
- [Cheerio vs Puppeteer 2026 (Proxyway)](https://proxyway.com/guides/cheerio-vs-puppeteer-for-web-scraping)
- [Best JavaScript Libraries (Apify)](https://blog.apify.com/best-javascript-web-scraping-libraries/)

### AI Model Comparisons
- [LM Council Benchmarks Jan 2026](https://lmcouncil.ai/benchmarks)
- [AI Model Comparison 2025 (Collabnix)](https://collabnix.com/comparing-top-ai-models-in-2025-claude-grok-gpt-llama-gemini-and-deepseek-the-ultimate-guide/)
- [Vectara Hallucination Leaderboard](https://github.com/vectara/hallucination-leaderboard)
- [AI Hallucination Report 2026](https://www.allaboutai.com/resources/ai-statistics/ai-hallucinations/)
- [LLM Pricing Comparison 2026](https://www.cloudidr.com/blog/llm-pricing-comparison-2026)

### Hidden API Discovery
- [How to Scrape Hidden APIs (Scrapfly)](https://scrapfly.io/blog/posts/how-to-scrape-hidden-apis)
- [Finding Undocumented APIs](https://inspectelement.org/apis.html)
- [Chrome DevTools MCP for API Discovery](https://damimartinez.github.io/scraping-hidden-apis-chrome-mcp/)

### Structured Data
- [Extruct Library (GitHub)](https://github.com/scrapinghub/extruct)
- [Metascraper (GitHub)](https://github.com/microlinkhq/metascraper)
- [Scraping Microformats (Scrapfly)](https://scrapfly.io/blog/posts/web-scraping-microformats)

### AI-Powered Scraping
- [AI Web Scraping 2025 (GodOfPrompt)](https://www.godofprompt.ai/blog/easiest-ai-web-scraping-method-for-2025)
- [Top AI Web Scraping Solutions (Firecrawl)](https://www.firecrawl.dev/blog/ai-powered-web-scraping-solutions-2025)
- [Prompt Engineering for Scraping](https://webscraping.ai/faq/scraping-with-gpt/how-do-i-implement-prompt-engineering-for-web-scraping-tasks)

---

*Last Updated: January 2026*
