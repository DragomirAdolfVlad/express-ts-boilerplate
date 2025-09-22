# Package Reference

This document maintains the current package versions and rationale for the Express.js TypeScript boilerplate.

## Current Package Versions (Updated: January 2025)

### Production Dependencies

| Package | Version | Purpose | Notes |
|---------|---------|---------|-------|
| express | ^4.19.2 | Web framework | Stable, mature ecosystem |
| @prisma/client | ^5.8.1 | Database client | Auto-generated with Prisma |
| prisma | ^5.8.1 | Database toolkit | Best TypeScript ORM |
| ioredis | ^5.3.2 | Redis client | Superior to redis package |
| jsonwebtoken | ^9.0.2 | JWT handling | Standard JWT library |
| bcrypt | ^5.1.1 | Password hashing | Secure password hashing |
| helmet | ^7.1.0 | Security headers | Essential security middleware |
| cors | ^2.8.5 | CORS handling | Cross-origin resource sharing |
| express-rate-limit | ^7.1.5 | Rate limiting | API rate limiting |
| joi | ^17.11.0 | Schema validation | Input validation |
| dotenv | ^16.3.1 | Environment variables | Configuration management |
| winston | ^3.11.0 | Logging | Structured logging |
| swagger-jsdoc | ^6.2.8 | OpenAPI generation | API documentation |
| swagger-ui-express | ^5.0.0 | Swagger UI | Interactive API docs |
| prom-client | ^15.1.0 | Prometheus metrics | Monitoring and metrics |

### Development Dependencies

| Package | Version | Purpose | Notes |
|---------|---------|---------|-------|
| typescript | ^5.3.3 | TypeScript compiler | Latest stable version |
| ts-node | ^10.9.2 | TypeScript execution | Development runtime |
| nodemon | ^3.0.3 | Development server | Auto-restart on changes |
| @types/node | ^20.11.5 | Node.js types | Match Node.js LTS version |
| @types/express | ^4.17.21 | Express types | Express type definitions |
| @types/jsonwebtoken | ^9.0.5 | JWT types | JWT type definitions |
| @types/bcrypt | ^5.0.2 | Bcrypt types | Bcrypt type definitions |
| @types/cors | ^2.8.17 | CORS types | CORS type definitions |
| @types/swagger-jsdoc | ^6.0.4 | Swagger JSDoc types | Swagger JSDoc types |
| @types/swagger-ui-express | ^4.1.6 | Swagger UI types | Swagger UI types |
| eslint | ^8.56.0 | Code linting | Stable version, not v9 |
| @typescript-eslint/parser | ^6.19.1 | TypeScript parser | ESLint TypeScript support |
| @typescript-eslint/eslint-plugin | ^6.19.1 | TypeScript rules | ESLint TypeScript rules |
| prettier | ^3.2.4 | Code formatting | Code formatter |
| eslint-config-prettier | ^9.1.0 | ESLint-Prettier integration | Disable conflicting rules |
| eslint-plugin-prettier | ^5.1.3 | Prettier ESLint plugin | Run Prettier as ESLint rule |

## Package Selection Rationale

### Core Decisions

1. **Node.js v20.x LTS**: Chosen for stability and long-term support
2. **Express.js v4.x**: Mature, stable, extensive ecosystem (v5 still in beta)
3. **TypeScript v5.3.x**: Latest stable with performance improvements
4. **Prisma v5.8.x**: Best TypeScript ORM experience
5. **ioredis over redis**: Better TypeScript support and features
6. **Winston over Pino**: Feature richness over raw performance
7. **ESLint v8 over v9**: Stability over latest features for boilerplate

### Alternative Packages Considered

| Category | Chosen | Alternatives | Reason for Choice |
|----------|--------|--------------|-------------------|
| ORM | Prisma | TypeORM, Drizzle | Best TypeScript DX |
| Redis Client | ioredis | redis | Better TypeScript support |
| Logging | Winston | Pino, Bunyan | Feature richness |
| Validation | Joi | Yup, Zod | Mature, well-documented |
| Testing | None | Jest, Vitest | Removed per requirements |

## Update Schedule

- **Monthly**: Check for patch updates
- **Quarterly**: Review minor updates
- **Bi-annually**: Evaluate major updates and alternatives

## Version Pinning Strategy

- **Development**: Use caret ranges (^) for automatic minor/patch updates
- **Production**: Consider exact versions or lockfiles for consistency
- **Security**: Monitor security advisories and update promptly

## Breaking Changes to Watch

1. **ESLint v9**: New flat config format
2. **Express v5**: When it reaches stable
3. **Node.js v22**: When it becomes LTS
4. **Prisma v6**: Future major version

Last Updated: January 2025