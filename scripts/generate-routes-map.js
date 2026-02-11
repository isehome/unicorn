#!/usr/bin/env node
/**
 * Route Discovery Script
 *
 * Parses App.js to extract route definitions and traces imports
 * to build a comprehensive routes-map.json for the bug analyzer.
 *
 * Run: node scripts/generate-routes-map.js
 * Output: shared/routesMap.json
 *
 * This runs automatically during build (prebuild script in package.json)
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const APP_JS = path.join(SRC_DIR, 'App.js');
const OUTPUT_FILE = path.join(ROOT_DIR, 'shared', 'routesMap.json');

// Service inference patterns - maps component patterns to likely service files
const SERVICE_PATTERNS = {
  Service: ['src/services/serviceService.js', 'src/services/serviceTicketService.js'],
  Project: ['src/services/projectService.js'],
  Equipment: ['src/services/equipmentService.js'],
  Parts: ['src/services/partsService.js', 'src/services/equipmentService.js'],
  WireDrop: ['src/services/wireDropService.js'],
  Shade: ['src/services/shadeService.js'],
  Contact: ['src/services/contactService.js'],
  People: ['src/services/contactService.js'],
  Todo: ['src/services/todoService.js'],
  Issue: ['src/services/issueService.js'],
  Vendor: ['src/services/vendorService.js'],
  Procurement: ['src/services/procurementService.js'],
  Career: ['src/services/careerDevelopmentService.js'],
  HR: ['src/services/careerDevelopmentService.js'],
  Skill: ['src/services/careerDevelopmentService.js'],
  Admin: ['src/services/adminService.js'],
  Rack: ['src/services/rackService.js'],
  HomeAssistant: ['src/services/homeAssistantService.js'],
};

function main() {
  console.log('[RouteDiscovery] Starting route extraction...');
  console.log(`[RouteDiscovery] Reading ${APP_JS}`);

  if (!fs.existsSync(APP_JS)) {
    console.error(`[RouteDiscovery] ERROR: App.js not found at ${APP_JS}`);
    process.exit(1);
  }

  const appContent = fs.readFileSync(APP_JS, 'utf8');

  // Step 1: Extract lazy imports
  const lazyImports = extractLazyImports(appContent);
  console.log(`[RouteDiscovery] Found ${Object.keys(lazyImports).length} lazy-loaded components`);

  // Step 2: Extract route definitions
  const routes = extractRoutes(appContent);
  console.log(`[RouteDiscovery] Found ${routes.length} route definitions`);

  // Step 3: Build route map with related files
  const routeMap = buildRouteMap(routes, lazyImports);

  // Step 4: Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Step 5: Write output
  const output = {
    generated_at: new Date().toISOString(),
    version: '1.0',
    total_routes: Object.keys(routeMap).length,
    routes: routeMap,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`[RouteDiscovery] Written ${OUTPUT_FILE}`);
  console.log(`[RouteDiscovery] Total routes mapped: ${Object.keys(routeMap).length}`);

  // Print summary
  const missingPrimary = Object.entries(routeMap).filter(([_, v]) => !v.primary);
  if (missingPrimary.length > 0) {
    console.log(`[RouteDiscovery] Warning: ${missingPrimary.length} routes without primary file mapping`);
  }
}

/**
 * Extract lazy imports from App.js
 * Matches: const ComponentName = lazy(() => import('./path/to/Component'));
 */
function extractLazyImports(content) {
  const imports = {};

  // Pattern 1: const Foo = lazy(() => import('./path'))
  const lazyRegex = /const\s+(\w+)\s*=\s*lazy\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g;
  let match;

  while ((match = lazyRegex.exec(content)) !== null) {
    const [, componentName, importPath] = match;
    imports[componentName] = importPath;
  }

  // Also extract regular imports for non-lazy components
  const importRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = importRegex.exec(content)) !== null) {
    const [, componentName, importPath] = match;
    // Only track local imports
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      if (!imports[componentName]) {
        imports[componentName] = importPath;
      }
    }
  }

  return imports;
}

/**
 * Extract route definitions from App.js
 * Handles nested ProtectedRoute, OfflineGuard wrappers
 */
function extractRoutes(content) {
  const routes = [];

  // Split by <Route to find each route definition
  const parts = content.split(/<Route\s+/);

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];

    // Extract path
    const pathMatch = part.match(/path\s*=\s*["']([^"']+)["']/);
    if (!pathMatch) continue;

    const routePath = pathMatch[1];

    // Skip catch-all routes
    if (routePath === '*') continue;

    // Find the component - need to look inside element={...}
    // Handle: element={<ProtectedRoute><Foo /></ProtectedRoute>}
    // or: element={<Foo />}
    const elementMatch = part.match(/element\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/);
    if (!elementMatch) continue;

    const elementContent = elementMatch[1];

    // Find actual component (skip wrappers)
    const wrappers = ['ProtectedRoute', 'OfflineGuard', 'Navigate', 'Suspense', 'ErrorBoundary'];
    const componentRegex = /<(\w+)(?:\s|\/|>)/g;
    let componentMatch;
    let componentName = null;

    while ((componentMatch = componentRegex.exec(elementContent)) !== null) {
      const name = componentMatch[1];
      if (!wrappers.includes(name) && name !== 'div' && name !== 'span') {
        componentName = name;
        break;
      }
    }

    if (componentName) {
      routes.push({ path: routePath, component: componentName });
    }
  }

  return routes;
}

/**
 * Build route map with primary and related files
 */
function buildRouteMap(routes, lazyImports) {
  const routeMap = {};

  for (const { path: routePath, component } of routes) {
    const importPath = lazyImports[component];

    // Resolve primary file path
    let primaryFile = null;
    if (importPath) {
      primaryFile = resolveImportPath(importPath);
    }

    // Find related files
    const relatedFiles = findRelatedFiles(primaryFile, component);

    routeMap[routePath] = {
      component: component,
      primary: primaryFile,
      related: relatedFiles,
    };
  }

  return routeMap;
}

/**
 * Convert import path to actual file path
 */
function resolveImportPath(importPath) {
  // ./components/Foo -> src/components/Foo.js
  // ./pages/Bar -> src/pages/Bar.js

  let resolved = importPath
    .replace(/^\.\//, 'src/')
    .replace(/^\.\.\//, 'src/');

  // Check if file exists with various extensions
  const extensions = ['.js', '.jsx', '.tsx', '.ts', ''];
  for (const ext of extensions) {
    const fullPath = path.join(ROOT_DIR, resolved + ext);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return resolved + ext;
    }
    // Also check if it's a directory with index file
    const indexPath = path.join(ROOT_DIR, resolved, 'index' + (ext || '.js'));
    if (fs.existsSync(indexPath)) {
      return resolved + '/index' + (ext || '.js');
    }
  }

  // Default to .js
  if (!resolved.match(/\.(js|jsx|tsx|ts)$/)) {
    resolved += '.js';
  }

  return resolved;
}

/**
 * Find related files (services, hooks, contexts) for a component
 */
function findRelatedFiles(primaryFile, componentName) {
  const related = new Set();

  // 1. Infer services from component name
  for (const [pattern, services] of Object.entries(SERVICE_PATTERNS)) {
    if (componentName.includes(pattern)) {
      for (const service of services) {
        const servicePath = path.join(ROOT_DIR, service);
        if (fs.existsSync(servicePath)) {
          related.add(service);
        }
      }
    }
  }

  // 2. Scan primary file for imports
  if (primaryFile) {
    const primaryPath = path.join(ROOT_DIR, primaryFile);
    if (fs.existsSync(primaryPath)) {
      const imports = scanFileImports(primaryPath);
      for (const imp of imports) {
        related.add(imp);
      }
    }
  }

  // Limit to 5 most relevant
  return [...related].slice(0, 5);
}

/**
 * Scan a file for service/context imports
 */
function scanFileImports(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const imports = [];

    // Match import statements
    const importRegex = /import\s+(?:\{[^}]+\}|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];

      // Only track service imports
      if (importPath.includes('services/') || importPath.includes('Service')) {
        const resolved = resolveRelativeImport(filePath, importPath);
        if (resolved && fs.existsSync(path.join(ROOT_DIR, resolved))) {
          imports.push(resolved);
        }
      }
    }

    return imports;
  } catch (e) {
    return [];
  }
}

/**
 * Resolve a relative import path from a source file
 */
function resolveRelativeImport(sourceFile, importPath) {
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const sourceDir = path.dirname(sourceFile);
    let resolved = path.join(sourceDir, importPath);

    // Normalize and make relative to root
    resolved = path.relative(ROOT_DIR, path.join(ROOT_DIR, resolved));

    // Add extension if needed
    if (!resolved.match(/\.(js|jsx|tsx|ts)$/)) {
      if (fs.existsSync(path.join(ROOT_DIR, resolved + '.js'))) {
        return resolved + '.js';
      }
    }
    return resolved;
  }
  return null;
}

// Run
main();
