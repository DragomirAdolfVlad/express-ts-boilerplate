/**
 * Swagger/OpenAPI configuration
 */

import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';
import { config } from './loader';
import { log } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Fallback Swagger JSDoc options (used only if YAML file is not found)
 */
const swaggerOptions: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'Express TypeScript Boilerplate API',
            version: '1.0.0',
            description: 'Production-ready Express.js TypeScript boilerplate for blockchain microservices'
        },
        servers: [
            {
                url: `http://localhost:${config.server.port}/api/v1`,
                description: 'Development server'
            }
        ]
    },
    apis: [] // No inline documentation - all documentation is in YAML
};

/**
 * Load OpenAPI specification from YAML files
 */
function loadOpenApiFromYaml(): object {
    try {
        const yamlPath = path.join(process.cwd(), 'docs/openapi.yaml');
        
        if (fs.existsSync(yamlPath)) {
            log.info('Loading OpenAPI specification from YAML file');
            const yamlContent = fs.readFileSync(yamlPath, 'utf8');
            const spec = yaml.load(yamlContent) as any;
            
            // Update server URLs with current config
            if (spec.servers) {
                spec.servers[0].url = `http://localhost:${config.server.port}/api/v1`;
            }
            
            return spec;
        } else {
            log.warn('YAML OpenAPI file not found, falling back to JS definition');
            return swaggerJsdoc(swaggerOptions);
        }
    } catch (error) {
        log.error('Failed to load YAML OpenAPI specification, falling back to JS definition', {
            error: error instanceof Error ? error.message : String(error)
        });
        return swaggerJsdoc(swaggerOptions);
    }
}

/**
 * Generate OpenAPI specification
 */
export function generateOpenApiSpec(): object {
    try {
        const specs = loadOpenApiFromYaml();
        log.info('OpenAPI specification generated successfully');
        return specs;
    } catch (error) {
        log.error('Failed to generate OpenAPI specification', {
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}

/**
 * Swagger UI options with dark mode
 */
const swaggerUiOptions: swaggerUi.SwaggerUiOptions = {
    explorer: true,
    swaggerOptions: {
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
        showCommonExtensions: true,
        tryItOutEnabled: true,
        theme: 'dark',
        requestInterceptor: (req: any) => {
            // Add request ID header for tracing
            req.headers['X-Request-ID'] = `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
            return req;
        }
    },
    customCss: `
        /* Clean Dark Mode Theme */
        .swagger-ui {
            background-color: #1a1a1a;
            color: #e0e0e0;
        }
        
        /* Hide topbar */
        .swagger-ui .topbar { 
            display: none; 
        }
        
        /* Info section */
        .swagger-ui .info { 
            margin: 20px 0; 
            padding: 20px;
            background-color: #242424;
            border-radius: 6px;
            border: 1px solid #333;
        }
        
        .swagger-ui .info .title { 
            color: #ffffff; 
            margin-bottom: 10px;
        }
        
        .swagger-ui .info .description { 
            color: #c0c0c0; 
            line-height: 1.5;
        }
        
        .swagger-ui .info .description h2 {
            color: #49cc90;
            margin-top: 20px;
            margin-bottom: 8px;
        }
        
        /* Server selection */
        .swagger-ui .scheme-container { 
            background-color: #242424; 
            padding: 15px; 
            margin: 20px 0; 
            border-radius: 6px; 
            border: 1px solid #333;
        }
        
        /* Authorization button */
        .swagger-ui .btn.authorize { 
            background-color: #49cc90; 
            border-color: #49cc90; 
            color: #ffffff;
            border-radius: 4px;
        }
        
        .swagger-ui .btn.authorize:hover { 
            background-color: #41b883; 
            border-color: #41b883; 
        }
        
        /* Operation blocks */
        .swagger-ui .opblock { 
            background-color: #242424; 
            border: 1px solid #333; 
            margin-bottom: 10px;
            border-radius: 6px;
        }
        
        .swagger-ui .opblock .opblock-summary { 
            background-color: #2a2a2a; 
            border-bottom: 1px solid #333;
            padding: 12px 16px;
        }
        
        .swagger-ui .opblock .opblock-summary-method { 
            color: #ffffff; 
            font-weight: 600;
            text-transform: uppercase;
            padding: 4px 8px;
            border-radius: 3px;
            margin-right: 10px;
        }
        
        .swagger-ui .opblock .opblock-summary-path { 
            color: #e0e0e0; 
            font-family: monospace;
        }
        
        .swagger-ui .opblock .opblock-summary-description { 
            color: #b0b0b0; 
            margin-left: 10px;
        }
        
        /* Method colors - simple solid colors */
        .swagger-ui .opblock.opblock-get .opblock-summary-method {
            background-color: #61affe;
        }
        
        .swagger-ui .opblock.opblock-post .opblock-summary-method {
            background-color: #49cc90;
        }
        
        .swagger-ui .opblock.opblock-put .opblock-summary-method {
            background-color: #fca130;
        }
        
        .swagger-ui .opblock.opblock-delete .opblock-summary-method {
            background-color: #f93e3e;
        }
        
        /* Operation body */
        .swagger-ui .opblock-body { 
            background-color: #1e1e1e;
            padding: 16px;
        }
        
        .swagger-ui .parameters-container { 
            background-color: #1e1e1e;
        }
        
        .swagger-ui .parameter__name { 
            color: #e0e0e0; 
        }
        
        .swagger-ui .parameter__type { 
            color: #49cc90; 
        }
        
        /* Responses */
        .swagger-ui .response-col_status { 
            color: #e0e0e0; 
        }
        
        .swagger-ui .response-col_description { 
            color: #b0b0b0; 
        }
        
        .swagger-ui .responses-inner {
            background-color: #1e1e1e;
            padding: 12px;
            border-radius: 4px;
        }
        
        /* Models */
        .swagger-ui .model { 
            background-color: #242424;
            border: 1px solid #333;
            border-radius: 4px;
            padding: 12px;
            margin: 8px 0;
        }
        
        .swagger-ui .model-title { 
            color: #ffffff; 
        }
        
        .swagger-ui .prop-type { 
            color: #49cc90; 
        }
        
        .swagger-ui .prop-name { 
            color: #e0e0e0; 
        }
        
        .swagger-ui .prop-format { 
            color: #b0b0b0; 
        }
        
        /* Form elements */
        .swagger-ui input[type=text], 
        .swagger-ui input[type=password], 
        .swagger-ui input[type=email], 
        .swagger-ui textarea, 
        .swagger-ui select { 
            background-color: #333; 
            border: 1px solid #555; 
            color: #e0e0e0;
            border-radius: 4px;
            padding: 8px 10px;
        }
        
        .swagger-ui input:focus,
        .swagger-ui textarea:focus,
        .swagger-ui select:focus {
            border-color: #49cc90;
            outline: none;
        }
        
        /* Buttons */
        .swagger-ui .btn { 
            background-color: #333; 
            border: 1px solid #555; 
            color: #e0e0e0;
            border-radius: 4px;
            padding: 6px 12px;
        }
        
        .swagger-ui .btn:hover { 
            background-color: #404040; 
        }
        
        .swagger-ui .btn.execute { 
            background-color: #49cc90; 
            border-color: #49cc90; 
            color: #ffffff; 
        }
        
        .swagger-ui .btn.execute:hover { 
            background-color: #41b883; 
        }
        
        /* Error handling */
        .swagger-ui .errors-wrapper { 
            background-color: #2a1f1f; 
            border: 1px solid #d32f2f; 
            border-radius: 4px;
            padding: 12px;
            margin: 8px 0;
        }
        
        .swagger-ui .errors { 
            color: #ff6b6b; 
        }
        
        /* Filter box */
        .swagger-ui .filter .operation-filter-input {
            background-color: #333;
            border: 1px solid #555;
            color: #e0e0e0;
            border-radius: 4px;
            padding: 10px 12px;
        }
        
        /* Tags */
        .swagger-ui .opblock-tag {
            color: #ffffff;
            font-size: 1.2em;
            margin: 20px 0 10px 0;
            padding: 10px 0;
            border-bottom: 1px solid #49cc90;
        }
        
        /* Tables */
        .swagger-ui table {
            background-color: #242424;
        }
        
        .swagger-ui table thead tr th {
            color: #ffffff;
            background-color: #2a2a2a;
            border-bottom: 1px solid #333;
        }
        
        .swagger-ui table tbody tr td {
            color: #e0e0e0;
            border-bottom: 1px solid #333;
        }
    `,
    customSiteTitle: 'Express TypeScript Boilerplate API Documentation',
    customfavIcon: '/favicon.ico'
};

/**
 * Setup Swagger documentation
 */
export function setupSwagger(app: Application): void {
    try {
        log.info('Setting up Swagger documentation...');

        // Generate OpenAPI specification
        const specs = generateOpenApiSpec();

        // Serve OpenAPI JSON
        app.get('/api-docs.json', (_req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.send(specs);
        });

        // Serve Swagger UI
        app.use('/api-docs', swaggerUi.serve);
        app.get('/api-docs', swaggerUi.setup(specs, swaggerUiOptions));

        // Alternative documentation routes
        app.use('/docs', swaggerUi.serve);
        app.get('/docs', swaggerUi.setup(specs, swaggerUiOptions));

        // OpenAPI YAML endpoint
        app.get('/openapi.yaml', (_req, res) => {
            res.setHeader('Content-Type', 'application/x-yaml');
            res.send(require('js-yaml').dump(specs));
        });

        log.info('Swagger documentation setup completed', {
            endpoints: {
                ui: '/api-docs',
                json: '/api-docs.json',
                yaml: '/openapi.yaml',
                alternative: '/docs'
            }
        });

    } catch (error) {
        log.error('Failed to setup Swagger documentation', {
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}

/**
 * Get OpenAPI specification info
 */
export function getOpenApiInfo(): object {
    return {
        version: '3.0.3',
        title: 'Express TypeScript Boilerplate API',
        description: 'Production-ready Express.js TypeScript boilerplate',
        endpoints: {
            ui: '/api-docs',
            json: '/api-docs.json',
            yaml: '/openapi.yaml',
            alternative: '/docs'
        },
        features: [
            'Interactive Swagger UI',
            'OpenAPI 3.0.3 specification',
            'YAML-based documentation structure',
            'Authentication examples',
            'Request/response examples',
            'Error response documentation',
            'Rate limiting information',
            'Security scheme documentation'
        ]
    };
}

/**
 * Validate OpenAPI specification
 */
export function validateOpenApiSpec(): boolean {
    try {
        const specs = generateOpenApiSpec();

        // Basic validation
        if (!specs || typeof specs !== 'object') {
            throw new Error('Invalid OpenAPI specification format');
        }

        const spec = specs as any;

        // Check required fields
        if (!spec.openapi || !spec.info || !spec.paths) {
            throw new Error('Missing required OpenAPI fields');
        }

        // Check version
        if (!spec.openapi.startsWith('3.0')) {
            throw new Error('Unsupported OpenAPI version');
        }

        // Validate paths exist
        const pathCount = Object.keys(spec.paths).length;
        if (pathCount === 0) {
            throw new Error('No API paths defined');
        }

        log.info('OpenAPI specification validation passed', {
            version: spec.openapi,
            title: spec.info.title,
            pathCount,
            hasComponents: !!spec.components,
            hasSchemas: !!(spec.components && spec.components.schemas)
        });
        return true;

    } catch (error) {
        log.error('OpenAPI specification validation failed', {
            error: error instanceof Error ? error.message : String(error)
        });
        return false;
    }
}