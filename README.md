# @rebus-industries/prism-shared

Shared TypeScript modules for PRISM microservices. Published to GitHub Packages.

## Contents

- **auth/** — admin session, API key, ORBIT bearer, middleware guards, principal types, provenance
- **db/** — Drizzle ORM client, schema, settings accessor, migrations
- **ws/** — Redis registry, session registry, admin protocol broadcaster, signalling proxy registry
- **jobs/** — shared Redis connections (BullMQ + general)
- **orbit/** — minimal ORBIT GraphQL client
- **visualiser/** — run registry (in-memory waiters), run log helper
- **contracts/** — typed agent ↔ server WS protocol

## Usage

```typescript
import { db, schema, runBootstrap, requireAuth } from '@rebus-industries/prism-shared';
```

## Auth

Requires a GitHub token with `read:packages` scope in `.npmrc`:

```
@rebus-industries:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<token>
```
