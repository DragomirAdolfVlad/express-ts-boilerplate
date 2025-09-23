# Express TypeScript Boilerplate

> Production-ready Express.js TypeScript boilerplate for blockchain microservices with enterprise-grade features

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3%2B-blue.svg)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.19%2B-lightgrey.svg)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.8%2B-2D3748.svg)](https://www.prisma.io/)
[![Redis](https://img.shields.io/badge/Redis-5.3%2B-red.svg)](https://redis.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

- **🏗️ Clean Architecture** - Layered architecture with dependency injection
- **🔐 Authentication & Authorization** - JWT + API Key authentication with RBAC
- **📊 Database Integration** - Prisma ORM with PostgreSQL
- **⚡ Redis Caching** - Caching with invalidation strategies
- **📝 API Documentation** - Interactive Swagger UI with modular OpenAPI specs
- **🛡️ Security** - Helmet, CORS, rate limiting, input validation
- **📈 Monitoring** - Structured logging, health checks
- **🧪 Developer Experience** - Hot reload, linting, formatting, type safety
- **🔧 Production Ready** - Error handling, graceful shutdown, environment configs

## 📋 Prerequisites

- **Node.js** 20.0.0 or higher
- **PostgreSQL** 12.0 or higher
- **Redis** 6.0 or higher
- **npm** or **yarn**

## 🛠️ Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/afterglow420/express-ts-boilerplate.git
cd express-ts-boilerplate
npm install
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# Required: DATABASE_URL, JWT_SECRET
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# (Optional) Seed database
npm run db:seed
```

### 4. Start Development Server

```bash
# Start with hot reload
npm run dev

# Or build and start production
npm run build
npm start
```

The API will be available at `http://localhost:3000`

## 📚 API Documentation

Interactive API documentation is available at:

- **Swagger UI**: http://localhost:3000/api-docs
- **Alternative UI**: http://localhost:3000/docs
- **OpenAPI JSON**: http://localhost:3000/api-docs.json
- **OpenAPI YAML**: http://localhost:3000/openapi.yaml

### Available Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/v1/auth/login` | POST | User authentication | ❌ |
| `/api/v1/auth/refresh` | POST | Refresh JWT token | ❌ |
| `/api/v1/users` | GET | List users (paginated) | ✅ |
| `/api/v1/users/me` | GET | Get current user profile | ✅ |
| `/api/v1/health` | GET | Basic health check | ❌ |
| `/api/v1/health/detailed` | GET | Detailed health status | ❌ |

## 🏗️ Architecture

```
┌─────────────────┐
│   API Routes    │ ← HTTP endpoints and middleware
├─────────────────┤
│   Controllers   │ ← Request/response handling
├─────────────────┤
│   Services      │ ← Business logic and data access
├─────────────────┤
│   Database      │ ← Prisma ORM and PostgreSQL
└─────────────────┘
```

### Project Structure

```
src/
├── api/
│   ├── controllers/     # Request/response handling
│   ├── routes/         # Route definitions and middleware
│   └── middleware/     # Custom middleware (auth, validation, etc.)
├── services/
│   ├── database/       # Database services and business logic
│   ├── redis/         # Redis services and caching
│   └── di/            # Dependency injection container
├── utils/             # Utility functions and helpers
├── config/            # Configuration files
└── types/             # TypeScript type definitions

docs/
├── api/               # Modular OpenAPI documentation
│   ├── base.yaml      # Shared components and schemas
│   └── paths/         # Individual endpoint documentation
├── openapi.yaml       # Generated complete OpenAPI spec
├── README.md          # API documentation guide
└── DEVELOPMENT_GUIDE.md # Complete development workflow
```

## 🔧 Available Scripts

### Development
```bash
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript
npm start           # Start production server
```

### Code Quality
```bash
npm run lint        # Run ESLint
npm run lint:fix    # Fix ESLint issues automatically
npm run format      # Format code with Prettier
npm run format:check # Check code formatting
```

### Database
```bash
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run database migrations
npm run db:seed      # Seed database with sample data
npm run db:reset     # Reset database (destructive)
npm run db:studio    # Open Prisma Studio
```

### Documentation
```bash
npm run docs:build   # Build OpenAPI documentation
npm run docs:watch   # Watch and rebuild docs on changes
npm run docs:dev     # Build docs and start watching
```

## 🔐 Authentication

The API supports two authentication methods:

### 1. JWT Bearer Token
```bash
# Login to get JWT token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'

# Use token in requests
curl -X GET http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 2. API Key
```bash
# Use API key in header
curl -X GET http://localhost:3000/api/v1/users \
  -H "X-API-Key: your-api-key-id.your-api-key"
```

## 🛡️ Security Features

- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **Rate Limiting** - Request rate limiting with Redis
- **Input Validation** - Joi schema validation
- **Password Hashing** - bcrypt with configurable rounds
- **JWT Security** - Secure token generation and validation
- **API Key Management** - Secure API key generation and validation

## 📊 Monitoring & Health Checks

### Health Endpoints
- `GET /api/v1/health` - Basic health check
- `GET /api/v1/health/detailed` - Detailed service health
- `GET /api/v1/health/ready` - Readiness probe
- `GET /api/v1/health/live` - Liveness probe

### Metrics
- `GET /api/v1/metrics` - Prometheus metrics

### Logging
Structured logging with Winston:
- Request/response logging
- Error tracking
- Performance metrics
- Contextual logging with request IDs

## 🧪 Testing

```bash
# Run tests (when implemented)
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 🚀 Deployment

### Environment Variables

Key environment variables for production:

```bash
# Required
DATABASE_URL=postgresql://user:password@host:port/database
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
REDIS_HOST=your-redis-host
REDIS_PORT=6379

# Optional but recommended
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
RATE_LIMIT_MAX_REQUESTS=100
```

### Docker Support

```dockerfile
# Example Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 📖 Developer Documentation

### For New Developers

1. **[Development Guide](docs/DEVELOPMENT_GUIDE.md)** - Complete workflow for adding new features
2. **[API Documentation](docs/README.md)** - Guide to the modular documentation system
3. **Architecture Overview** - Understanding the layered architecture and DI system

### Adding New Features

The boilerplate includes a comprehensive guide for adding new features. See [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) for:

- Step-by-step workflow
- Database model creation
- Service layer implementation
- API endpoint development
- Documentation generation

### Key Patterns

- **Dependency Injection** - Services are managed through a DI container
- **Service Layer** - Business logic separated from HTTP handling
- **Error Handling** - Consistent error responses with proper HTTP status codes
- **Validation** - Input validation using Joi schemas
- **Caching** - Redis-based caching with automatic invalidation
- **Health Checks** - Built-in health monitoring for all services

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write comprehensive tests
- Update documentation for new features
- Follow the existing code style (ESLint + Prettier)
- Add proper error handling and logging

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Express.js** - Fast, unopinionated web framework
- **Prisma** - Next-generation ORM for TypeScript
- **Redis** - In-memory data structure store
- **TypeScript** - Typed superset of JavaScript
- **Winston** - Logging library for Node.js

## 📞 Support

- **Documentation**: Check the [docs](docs/) folder
- **Issues**: [GitHub Issues](https://github.com/afterglow420/express-ts-boilerplate/issues)
- **Discussions**: [GitHub Discussions](https://github.com/afterglow420/express-ts-boilerplate/discussions)

---

**Built with ❤️ for the blockchain and microservices community**