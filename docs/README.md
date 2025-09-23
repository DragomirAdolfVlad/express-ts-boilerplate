# API Documentation

This directory contains the OpenAPI/Swagger documentation for the Express TypeScript Boilerplate API.

## Structure

The documentation follows a clean architecture pattern with modular YAML files:

```
docs/
├── README.md                          # This file
└── api/
    └── v1/                            # API version 1
        ├── openapi.yaml               # Main OpenAPI specification
        ├── paths/                     # Endpoint definitions
        │   ├── auth.yaml              # Authentication endpoints
        │   ├── users.yaml             # User management endpoints
        │   └── health.yaml            # Health and monitoring endpoints
        └── components/                # Reusable components
            ├── schemas/               # Data models
            │   ├── index.yaml         # Schema index
            │   ├── common.yaml        # Common schemas
            │   ├── auth.yaml          # Authentication schemas
            │   ├── users.yaml         # User schemas
            │   └── health.yaml        # Health schemas
            ├── responses/             # Response definitions
            │   ├── index.yaml         # Response index
            │   └── common.yaml        # Common responses
            ├── parameters/            # Parameter definitions
            │   ├── index.yaml         # Parameter index
            │   └── common.yaml        # Common parameters
            └── examples/              # Request/response examples
                ├── index.yaml         # Example index
                ├── auth.yaml          # Authentication examples
                ├── users.yaml         # User examples
                └── health.yaml        # Health examples
```

## Features

### 🏗️ **Clean Architecture**
- **Modular Structure**: Each resource has its own file
- **Reusable Components**: Shared schemas, responses, and parameters
- **Version Separation**: Clear versioning structure for API evolution
- **Organized Examples**: Comprehensive request/response examples

### 📚 **Comprehensive Documentation**
- **All Endpoints**: Complete coverage of all API endpoints
- **Authentication**: JWT and API key authentication examples
- **Error Handling**: Detailed error response documentation
- **Rate Limiting**: Rate limit information and headers
- **Security**: Security schemes and requirements

### 🎯 **Developer Experience**
- **Interactive UI**: Swagger UI for testing endpoints
- **Try It Out**: Built-in request testing functionality
- **Examples**: Real-world request/response examples
- **Validation**: Input validation documentation

## Accessing Documentation

### Development
- **Swagger UI**: http://localhost:3000/api-docs
- **Alternative UI**: http://localhost:3000/docs
- **OpenAPI JSON**: http://localhost:3000/api-docs.json
- **OpenAPI YAML**: http://localhost:3000/openapi.yaml

### Production
- **Swagger UI**: https://api.example.com/api-docs
- **OpenAPI JSON**: https://api.example.com/api-docs.json

## Authentication in Documentation

The documentation includes examples for both authentication methods:

### JWT Authentication
```bash
# Login to get token
curl -X POST /api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'

# Use token in requests
curl -X GET /api/v1/users/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### API Key Authentication
```bash
# Use API key in requests
curl -X GET /api/v1/users \
  -H "X-API-Key: ak_1234567890_user.9f4fc77dfd0664034f30b64e6720c53b..."
```

## Rate Limiting

All endpoints include rate limiting information:

- **Headers**: Rate limit headers in responses
- **Limits**: Different limits per endpoint type
- **Authentication-Aware**: Different limits for authenticated users
- **Custom Limits**: API keys can have custom rate limits

## Error Handling

Comprehensive error documentation includes:

- **Standard Format**: Consistent error response structure
- **HTTP Status Codes**: Appropriate status codes for each error type
- **Error Details**: Additional context for debugging
- **Examples**: Real error response examples

## Validation

Input validation is documented with:

- **Schema Validation**: Joi schema requirements
- **Field Constraints**: Min/max lengths, patterns, formats
- **Required Fields**: Clear indication of required vs optional
- **Examples**: Valid and invalid input examples

## Updating Documentation

### Adding New Endpoints

1. **Create Path Definition**: Add to appropriate `paths/*.yaml` file
2. **Define Schemas**: Add request/response schemas to `components/schemas/`
3. **Add Examples**: Include realistic examples in `components/examples/`
4. **Update Index**: Add references to index files

### Adding New Versions

1. **Create Version Directory**: `docs/api/v2/`
2. **Copy Structure**: Use v1 as template
3. **Update Main Spec**: Create new `openapi.yaml`
4. **Configure Routes**: Add v2 routes to application

### Best Practices

- **Consistent Naming**: Use consistent naming conventions
- **Detailed Descriptions**: Provide clear, helpful descriptions
- **Realistic Examples**: Use realistic data in examples
- **Error Coverage**: Document all possible error responses
- **Security**: Include security requirements and examples

## Tools and Validation

### Swagger Editor
Use [Swagger Editor](https://editor.swagger.io/) to validate and edit YAML files.

### OpenAPI Validation
The application includes built-in validation:
```typescript
import { validateOpenApiSpec } from '../config/swagger';
const isValid = validateOpenApiSpec();
```

### YAML Linting
Use YAML linters to ensure proper formatting:
```bash
yamllint docs/api/v1/**/*.yaml
```

## Contributing

When adding new features:

1. **Update Documentation First**: Document the API before implementation
2. **Include Examples**: Add realistic request/response examples
3. **Test Documentation**: Verify examples work in Swagger UI
4. **Review Structure**: Ensure consistent with existing patterns

## Support

For documentation issues or questions:
- Check existing examples in the documentation
- Review the OpenAPI 3.0.3 specification
- Test endpoints in Swagger UI
- Validate YAML syntax