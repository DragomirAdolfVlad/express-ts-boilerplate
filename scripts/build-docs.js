#!/usr/bin/env node

/**
 * Build OpenAPI documentation from modular YAML files
 * This script combines the base specification with individual path files
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const DOCS_DIR = path.join(__dirname, '../docs');
const API_DIR = path.join(DOCS_DIR, 'api');
const PATHS_DIR = path.join(API_DIR, 'paths');
const OUTPUT_FILE = path.join(DOCS_DIR, 'openapi.yaml');

/**
 * Load and parse YAML file
 */
function loadYaml(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return yaml.load(content);
    } catch (error) {
        console.error(`Error loading ${filePath}:`, error.message);
        process.exit(1);
    }
}

/**
 * Get all path files
 */
function getPathFiles() {
    try {
        return fs.readdirSync(PATHS_DIR)
            .filter(file => file.endsWith('.yaml'))
            .map(file => path.join(PATHS_DIR, file));
    } catch (error) {
        console.error('Error reading paths directory:', error.message);
        process.exit(1);
    }
}

/**
 * Build complete OpenAPI specification
 */
function buildOpenApiSpec() {
    console.log('Building OpenAPI specification...');

    // Load base specification
    const baseSpec = loadYaml(path.join(API_DIR, 'base.yaml'));

    // Initialize paths object
    baseSpec.paths = {};

    // Load all path files and merge them
    const pathFiles = getPathFiles();

    pathFiles.forEach(pathFile => {
        console.log(`Processing ${path.basename(pathFile)}...`);
        const pathSpec = loadYaml(pathFile);

        // Merge paths from this file
        Object.assign(baseSpec.paths, pathSpec);
    });

    // Write the combined specification
    const yamlOutput = yaml.dump(baseSpec, {
        indent: 2,
        lineWidth: 120,
        noRefs: true
    });

    fs.writeFileSync(OUTPUT_FILE, yamlOutput, 'utf8');

    const pathCount = Object.keys(baseSpec.paths).length;
    console.log(`✅ OpenAPI specification built successfully!`);
    console.log(`   - Output: ${OUTPUT_FILE}`);
    console.log(`   - Paths: ${pathCount} endpoints`);
    console.log(`   - Components: ${Object.keys(baseSpec.components.schemas).length} schemas`);
}

/**
 * Watch for changes in development
 */
function watchFiles() {
    console.log('👀 Watching for changes...');

    const watchPaths = [
        path.join(API_DIR, 'base.yaml'),
        PATHS_DIR
    ];

    watchPaths.forEach(watchPath => {
        fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
            if (filename && filename.endsWith('.yaml')) {
                console.log(`📝 File changed: ${filename}`);
                buildOpenApiSpec();
            }
        });
    });
}

// Main execution
function main() {
    const args = process.argv.slice(2);
    const shouldWatch = args.includes('--watch') || args.includes('-w');

    // Ensure output directory exists
    if (!fs.existsSync(DOCS_DIR)) {
        fs.mkdirSync(DOCS_DIR, { recursive: true });
    }

    // Build the specification
    buildOpenApiSpec();

    // Watch for changes if requested
    if (shouldWatch) {
        watchFiles();

        // Keep the process running
        process.on('SIGINT', () => {
            console.log('\n👋 Stopping documentation watcher...');
            process.exit(0);
        });
    }
}

if (require.main === module) {
    main();
}

module.exports = { buildOpenApiSpec };