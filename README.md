# Inventory Management API

A transactional inventory REST API built with NestJS 12, TypeScript, TypeORM and PostgreSQL 18. Manage products and warehouses, receive and issue stock, transfer stock atomically, and query immutable movement history.

## Quick start with Docker

Install Docker with Compose, then run:

```sh
docker compose up --build
```

Compose starts PostgreSQL, waits for its health check, runs migrations in a separate one-shot container, and starts the API only when migration succeeds.

- API: <http://localhost:3000/api/v1>
- Swagger UI: <http://localhost:3000/docs>
- OpenAPI JSON: <http://localhost:3000/docs-json>
- Database health: <http://localhost:3000/health>

The local database uses the deliberately public development credentials `inventory` / `inventory`. They are not production secrets. Compose binds exposed ports to loopback. Set `POSTGRES_PASSWORD` to a URL-safe value for a different local password, `DB_PORT` for a different host database port, or `PORT` for a different API port. Changing the database password after initializing its volume also requires changing the database role password. Application connection URLs must percent-encode special characters in credentials.

If the default ports are already occupied, launch with alternate host ports:

```sh
DB_PORT=55433 PORT=3300 docker compose up --build
```

In this case, Swagger is at <http://localhost:3300/docs> and local Node execution needs a `DATABASE_URL` using port 55433. Use the same overrides for subsequent Compose commands.

Stop with `docker compose down`; data persists in a named volume. `docker compose down -v` also permanently removes local database data.

## Local development

Use Node.js **24.9 or later on the 24.x LTS line**, npm, and PostgreSQL 18. The minimum accommodates NestJS's ESM packages and Jest's native `require(esm)` support. `.nvmrc`, Docker and CI use Node 24.

```sh
nvm install
nvm use
npm ci
cp .env.example .env
docker compose up -d db
npm run migration:run
npm run start:dev
```

`start:dev` runs TypeScript using ts-node; restart it after source changes. For compiled execution:

```sh
npm run build
npm start
```

Configuration is loaded from environment variables and optionally `.env`. Environment variables take precedence. `DATABASE_URL` is required and must be a PostgreSQL URL; `PORT` defaults to 3000 and must be an integer from 1 to 65535. Startup fails if configuration or the database connection is invalid. SQL and connection details are never returned to HTTP clients.

## API contract

All business routes are under `/api/v1`. IDs are UUIDs. Dates are UTC timestamps. SKU and warehouse codes are trimmed and uppercased; names and descriptions are trimmed. SKU/code length is 1–64, name length is 1–200, and description length is at most 5,000 characters. Descriptions may be cleared with `null`; required fields cannot be set to `null`. PATCH accepts partial updates, including an empty no-op object.

| Method      | Route                                      | Purpose                                                          |
| ----------- | ------------------------------------------ | ---------------------------------------------------------------- |
| POST / GET  | `/products`                                | Create / list products                                           |
| GET / PATCH | `/products/:id`                            | Retrieve / update a product                                      |
| POST / GET  | `/warehouses`                              | Create / list warehouses                                         |
| GET / PATCH | `/warehouses/:id`                          | Retrieve / update a warehouse                                    |
| GET         | `/inventory/stock`                         | List registered balances; optional `productId`, `warehouseId`    |
| GET         | `/inventory/stock/:productId/:warehouseId` | Get balance; zero for an unregistered pair of existing resources |
| POST        | `/inventory/receipts`                      | Receive stock                                                    |
| POST        | `/inventory/issues`                        | Issue stock                                                      |
| POST        | `/inventory/transfers`                     | Transfer stock                                                   |
| GET         | `/inventory/movements`                     | List movements; optional `productId`, `warehouseId`, `type`      |

Collection endpoints accept `page` (default 1, range 1–1,000,000) and `limit` (default 20, range 1–100) and return `{ data, total, page, limit }`. Ordering is stable: creation time and ID for catalogs/history, product and warehouse ID for balances. Offset pagination can shift between requests when new records are inserted. Warehouse movement filtering includes both incoming and outgoing movements. Unknown query/body fields are rejected.

Quantities are JSON numbers representing integers from 1 to 2,147,483,647. Balances range from zero to that maximum. Stock lists include registered zero balances but omit pairs never successfully operated on. List filters with nonexistent UUIDs return an empty collection; individual lookups and stock operations return 404 for missing resources.

Creation and inventory operations return 201; reads and updates return 200. Every successful inventory request creates one movement (`receipt`, `issue` or `transfer`). Retried requests are separate operations: idempotency is intentionally deferred.

Errors have the following shape:

```json
{
  "statusCode": 409,
  "code": "INSUFFICIENT_STOCK",
  "message": "Insufficient stock in the source warehouse"
}
```

Validation errors use `400 INVALID_REQUEST` with a `details` array. Invalid UUIDs and same-warehouse transfers also return 400. Missing resources use `404 NOT_FOUND`; duplicate SKU/codes use `409 DUPLICATE_RESOURCE`; stock overflow uses `409 STOCK_OVERFLOW`. Unexpected errors return a generic `500 INTERNAL_ERROR`; database health failures return `503 UNAVAILABLE`.

## Example requests

Create resources and copy the returned IDs into the shell variables below:

```sh
curl -sS http://localhost:3000/api/v1/products \
  -H 'Content-Type: application/json' \
  -d '{"sku":"WIDGET-001","name":"Widget","description":"Example product"}'

curl -sS http://localhost:3000/api/v1/warehouses \
  -H 'Content-Type: application/json' \
  -d '{"code":"MAD-01","name":"Madrid"}'

curl -sS http://localhost:3000/api/v1/warehouses \
  -H 'Content-Type: application/json' \
  -d '{"code":"BCN-01","name":"Barcelona"}'

PRODUCT_ID='<product UUID>'
MADRID_ID='<Madrid warehouse UUID>'
BARCELONA_ID='<Barcelona warehouse UUID>'

curl -sS http://localhost:3000/api/v1/inventory/receipts \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":\"$PRODUCT_ID\",\"warehouseId\":\"$MADRID_ID\",\"quantity\":10}"

curl -sS http://localhost:3000/api/v1/inventory/transfers \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":\"$PRODUCT_ID\",\"sourceWarehouseId\":\"$MADRID_ID\",\"destinationWarehouseId\":\"$BARCELONA_ID\",\"quantity\":4}"

curl -sS http://localhost:3000/api/v1/inventory/issues \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":\"$PRODUCT_ID\",\"warehouseId\":\"$BARCELONA_ID\",\"quantity\":1}"

curl -sS "http://localhost:3000/api/v1/inventory/stock?productId=$PRODUCT_ID"
curl -sS "http://localhost:3000/api/v1/inventory/movements?productId=$PRODUCT_ID&limit=20"
```

Expected balances: Madrid 6, Barcelona 3. Expected history: three movements.

## Transaction and persistence design

The `Products`, `Warehouses`, and `Inventory` modules contain controllers, validated DTOs, and focused services. Services use TypeORM directly. Entity metadata, data-source configuration, and explicit SQL migrations live in `src/database`; HTTP validation, pagination, and error handling live in `src/common`. Schema synchronization is disabled.

Every stock operation uses one PostgreSQL `READ COMMITTED` transaction and its transaction-scoped entity manager:

1. Check the product and participating warehouses exist.
2. In sorted warehouse UUID order, insert missing zero balances with `ON CONFLICT DO NOTHING` and acquire `SELECT ... FOR UPDATE` locks.
3. Check availability and overflow against the locked balances, then update them.
4. Append one movement and commit. Any failure rolls back all changes, including newly created zero balances.

Inserts also acquire locks, so insertion and row locking follow the same order. Opposite transfers therefore do not lock warehouses in opposite orders. UUID spelling is normalized before ordering. Requests on the same balance serialize in PostgreSQL, including requests from different application processes. No in-memory locks, distributed locks, or message brokers are required.

Primary keys, unique keys, foreign keys and CHECK constraints protect stored data. A database trigger rejects UPDATE, DELETE and TRUNCATE of movements. A database owner can intentionally remove triggers or tables; this is application-level history protection, not protection against a database administrator. Application users should not write stock directly through SQL, as that bypasses history recording.

Migrations run explicitly, never automatically on application bootstrap:

```sh
npm run migration:run       # compile and apply pending migrations
npm run migration:revert    # revert latest compiled migration; destroys MVP tables/data
```

For future schema changes, add a new migration and update entity metadata together; do not edit already deployed migrations. Docker's migration service uses the compiled migration runner. Concurrent production deployments should serialize their migration step.

## Tests and quality checks

Tests exercise the actual HTTP application and a real PostgreSQL database, using the production migrations. No database or transaction mocks are used. They cover catalog management and validation, inventory operations, filters and pagination, constraints, immutable history, overflow, transaction rollback after a real failed INSERT, concurrent first receipts, overselling, and opposite transfers.

**Tests reset the `public` schema of the configured test database. Use a dedicated disposable database.** The runner requires a database name ending in `_test` and refuses the same database name as `DATABASE_URL`.

```sh
docker compose up -d db
docker compose exec db createdb -U inventory inventory_test
# .env.example contains the matching TEST_DATABASE_URL.
npm test
npm run format:check
npm run lint
npm run typecheck
npm run build
```

If `inventory_test` already exists, skip `createdb`. The Jest runner is serial; concurrent HTTP tests still use independent pooled database connections. Do not run multiple suites against the same database simultaneously.

GitHub Actions runs formatting, lint, type checking, build, integration tests against PostgreSQL 18, and a Docker image build on Node 24. The workflow runs when the repository is pushed; this project does not publish itself or deploy automatically.

### Dependency review

At verification time (2026-11-13), `npm audit --omit=dev` reports no known production vulnerabilities. The full audit reports 27 findings (26 moderate, one low) in the Jest/ESLint development dependency trees, involving `glob`, `minimatch`, and `deepmerge`. npm's suggested forced changes include downgrading tools; no forced downgrades or incompatible dependency overrides have been applied. Recheck upstream fixes before public release. These development packages are excluded from the runtime image.

Jest requires the experimental VM modules flag to load NestJS 12's ESM packages; the test scripts already include it. Node's experimental-feature warning during tests is expected.

## Scope and roadmap

The MVP intentionally has no authentication/authorization, UI, catalog deletion, orders, reservations, multi-tenancy, microservices, brokers, or advanced reporting. It is a local-development foundation; adding access control is required before exposing write endpoints to untrusted users.

Potential next steps:

- Stock reservations with expiration.
- Idempotent inventory operations.
- Inventory reconciliation.
- Audit logging for catalog changes.
- Domain events and a transactional outbox.
- Authentication and authorization.
- Advanced inventory queries.

## License

[MIT](LICENSE).
