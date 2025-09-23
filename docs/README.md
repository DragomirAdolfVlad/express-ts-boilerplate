# API Documentation

This directory contains the OpenAPI specification for the Express TypeScript Boilerplate API.

## Structure

```
docs/
├── openapi.yaml          # Generated complete OpenAPI specification
├── api/
│   ├── base.yaml         # Base specification with components and schemas
│   └── paths/
│       ├── auth.yaml     # Authentication endpoints
│       ├── users.yaml    # User management endpoints
│       ├── health.yaml   # Health check endpoints
│       └── _template.yaml # Template for new endpoints
└── README.md
```

## Features

- **Modular Structure**: Organized by resource with separate files for each endpoint group
- **Automatic Building**: Build script combines modular files into single OpenAPI spec
- **Complete Coverage**: All endpoints, request/response schemas, and error responses documented
- **Interactive Testing**: Full Swagger UI support with working examples
- **Industry Standard**: Follows OpenAPI 3.0.3 specification best practices
- **Decoupled from Code**: Documentation is separate from route files to avoid bloating

## Usage

The API documentation is automatically served at:
- `/api-docs` - Interactive Swagger UI
- `/docs` - Alternative Swagger UI endpoint
- `/api-docs.json` - OpenAPI specification in JSON format
- `/openapi.yaml` - OpenAPI specification in YAML format

## Adding New Endpoints

### Quick Start
1. **Copy the template**: `cp docs/api/paths/_template.yaml docs/api/paths/your-resource.yaml`
2. **Edit the file**: Replace placeholders with your actual resource details
3. **Add schemas**: Add any new schemas to `docs/api/base.yaml` under `components.schemas`
4. **Build docs**: Run `npm run docs:build`

### Example: Adding Products API

1. Create `docs/api/paths/products.yaml`:
```yaml
/products:
  get:
    tags:
      - Products
    summary: List products
    # ... rest of the endpoint definition
```

2. Add schemas to `docs/api/base.yaml`:
```yaml
components:
  schemas:
    Product:
      type: object
      properties:
        id:
          type: string
          example: "prod_123"
        name:
          type: string
          example: "Sample Product"
        # ... other properties
```

3. Build the documentation:
```bash
npm run docs:build
```

## Available Scripts

- `npm run docs:build` - Build the complete OpenAPI specification
- `npm run docs:watch` - Watch for changes and rebuild automatically
- `npm run docs:dev` - Build once and then watch for changes

## Development Workflow

1. **During development**: Run `npm run docs:dev` to automatically rebuild docs when files change
2. **Before committing**: Run `npm run docs:build` to ensure the final spec is up to date
3. **Adding new routes**: Use the template and follow the modular structure

## Best Practices

- **One file per resource**: Keep related endpoints together (e.g., all user endpoints in `users.yaml`)
- **Reuse components**: Define common schemas, responses, and parameters in `base.yaml`
- **Use the template**: Start with `_template.yaml` for consistency
- **Build before testing**: Always run `npm run docs:build` after making changes
- **Keep routes clean**: No inline documentation in route files - everything goes in the YAML files

## File Organization

- **`base.yaml`**: Contains all reusable components (schemas, responses, parameters, security)
- **`paths/*.yaml`**: Individual files for each resource's endpoints
- **`openapi.yaml`**: Generated file - don't edit directly, it gets overwritten