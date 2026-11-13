import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/http';
import { databaseOptions } from '../src/database/data-source';
import { MAX_QUANTITY, Movement, Stock } from '../src/database/entities';

const prefix = '/api/v1';
let app: INestApplication;
let db: DataSource;
const api = () => request(app.getHttpServer());

beforeAll(async () => {
  const migrationDb = await new DataSource(databaseOptions()).initialize();
  try {
    // setup.ts validates this is a separately named disposable test database.
    await migrationDb.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrationDb.runMigrations();
  } finally {
    await migrationDb.destroy();
  }
  app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.init();
  db = app.get(DataSource);
});

afterAll(async () => {
  if (app) await app.close();
});

async function fixtures() {
  const product = (
    await api()
      .post(`${prefix}/products`)
      .send({ sku: randomUUID(), name: 'Widget' })
      .expect(201)
  ).body;
  const a = (
    await api()
      .post(`${prefix}/warehouses`)
      .send({ code: randomUUID(), name: 'A' })
      .expect(201)
  ).body;
  const b = (
    await api()
      .post(`${prefix}/warehouses`)
      .send({ code: randomUUID(), name: 'B' })
      .expect(201)
  ).body;
  return {
    productId: product.id as string,
    a: a.id as string,
    b: b.id as string,
  };
}
async function receive(
  productId: string,
  warehouseId: string,
  quantity: number,
) {
  return api()
    .post(`${prefix}/inventory/receipts`)
    .send({ productId, warehouseId, quantity });
}
async function balance(
  productId: string,
  warehouseId: string,
): Promise<number> {
  return (
    await api()
      .get(`${prefix}/inventory/stock/${productId}/${warehouseId}`)
      .expect(200)
  ).body.quantity;
}

it.each([
  ['products', 'sku'],
  ['warehouses', 'code'],
])(
  'manages %s, normalization, uniqueness and pagination',
  async (resource, key) => {
    const value = `item-${randomUUID()}`;
    const created = await api()
      .post(`${prefix}/${resource}`)
      .send({ [key]: ` ${value} `, name: '  Example  ', description: ' text ' })
      .expect(201);
    expect(created.body).toMatchObject({
      [key]: value.toUpperCase(),
      name: 'Example',
      description: 'text',
    });
    await api()
      .post(`${prefix}/${resource}`)
      .send({ [key]: value.toUpperCase(), name: 'Duplicate' })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('DUPLICATE_RESOURCE'));
    await api().get(`${prefix}/${resource}/${created.body.id}`).expect(200);
    await api()
      .patch(`${prefix}/${resource}/${created.body.id}`)
      .send({ name: 'Renamed', description: null })
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ name: 'Renamed', description: null }),
      );
    const another = await api()
      .post(`${prefix}/${resource}`)
      .send({ [key]: randomUUID(), name: 'Another' })
      .expect(201);
    await api()
      .patch(`${prefix}/${resource}/${another.body.id}`)
      .send({ [key]: value })
      .expect(409);
    await api()
      .patch(`${prefix}/${resource}/${created.body.id}`)
      .send({ name: null })
      .expect(400);
    const first = await api().get(`${prefix}/${resource}?limit=1`).expect(200);
    const second = await api()
      .get(`${prefix}/${resource}?limit=1&page=2`)
      .expect(200);
    expect(first.body).toMatchObject({ page: 1, limit: 1 });
    expect(first.body.total).toBeGreaterThanOrEqual(2);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.data[0].id).not.toBe(second.body.data[0].id);
    await api().get(`${prefix}/${resource}/${randomUUID()}`).expect(404);
    await api()
      .patch(`${prefix}/${resource}/${randomUUID()}`)
      .send({ name: 'Missing' })
      .expect(404);
  },
);

it.each([
  { sku: '', name: 'Name' },
  { sku: '   ', name: 'Name' },
  { sku: 'x', name: '' },
  { sku: 'x', name: 'Name', extra: true },
  { sku: 'x'.repeat(65), name: 'Name' },
  { sku: null, name: 'Name' },
  { sku: 'x', name: 'Name', description: 'x'.repeat(5001) },
])('rejects invalid product input %#', async (body) => {
  await api()
    .post(`${prefix}/products`)
    .send(body)
    .expect(400)
    .expect(({ body }) => {
      expect(body).toMatchObject({ statusCode: 400, code: 'INVALID_REQUEST' });
      expect(body.details.length).toBeGreaterThan(0);
    });
});

it('rejects malformed IDs, query parameters and unknown fields', async () => {
  await api().get(`${prefix}/products/no-uuid`).expect(400);
  for (const query of [
    'page=0',
    'limit=101',
    'page=1.5',
    'page=oops',
    'unknown=1',
  ]) {
    await api().get(`${prefix}/products?${query}`).expect(400);
  }
  await api().get(`${prefix}/inventory/stock?productId=bad`).expect(400);
  await api().get(`${prefix}/inventory/movements?type=bad`).expect(400);
});

it('executes a full receipt, transfer, issue and history flow', async () => {
  const { productId, a, b } = await fixtures();
  expect(await balance(productId, a)).toBe(0);
  const initial = await api()
    .get(`${prefix}/inventory/stock?productId=${productId}`)
    .expect(200);
  expect(initial.body.total).toBe(0);
  expect((await receive(productId, a, 10)).status).toBe(201);
  await api()
    .post(`${prefix}/inventory/transfers`)
    .send({
      productId,
      sourceWarehouseId: a,
      destinationWarehouseId: b,
      quantity: 4,
    })
    .expect(201)
    .expect(({ body }) =>
      expect(body).toMatchObject({
        type: 'transfer',
        quantity: 4,
        sourceWarehouseId: a,
        destinationWarehouseId: b,
      }),
    );
  await api()
    .post(`${prefix}/inventory/issues`)
    .send({ productId, warehouseId: b, quantity: 4 })
    .expect(201);
  expect(await balance(productId, a)).toBe(6);
  expect(await balance(productId, b)).toBe(0);
  const stock = await api()
    .get(`${prefix}/inventory/stock?productId=${productId}&warehouseId=${b}`)
    .expect(200);
  expect(stock.body).toMatchObject({ total: 1, page: 1, limit: 20 });
  expect(stock.body.data[0].quantity).toBe(0);
  const history = await api()
    .get(`${prefix}/inventory/movements?productId=${productId}`)
    .expect(200);
  expect(history.body.total).toBe(3);
  const filtered = await api()
    .get(
      `${prefix}/inventory/movements?productId=${productId}&warehouseId=${b}&type=transfer&limit=1`,
    )
    .expect(200);
  expect(filtered.body.total).toBe(1);
  expect(filtered.body.data[0].type).toBe('transfer');
});

it('rejects insufficient stock without creating balances or movements', async () => {
  const { productId, a, b } = await fixtures();
  await api()
    .post(`${prefix}/inventory/issues`)
    .send({ productId, warehouseId: a, quantity: 1 })
    .expect(409)
    .expect(({ body }) => expect(body.code).toBe('INSUFFICIENT_STOCK'));
  await api()
    .post(`${prefix}/inventory/transfers`)
    .send({
      productId,
      sourceWarehouseId: a,
      destinationWarehouseId: b,
      quantity: 1,
    })
    .expect(409);
  expect(await db.getRepository(Stock).countBy({ productId })).toBe(0);
  expect(await db.getRepository(Movement).countBy({ productId })).toBe(0);
});

it.each([0, -1, 1.5, '2', null, MAX_QUANTITY + 1])(
  'rejects invalid quantities: %s',
  async (quantity) => {
    await api()
      .post(`${prefix}/inventory/receipts`)
      .send({ productId: randomUUID(), warehouseId: randomUUID(), quantity })
      .expect(400);
  },
);

it('rejects missing resources and same-warehouse transfers, including uppercase UUIDs', async () => {
  const { productId, a } = await fixtures();
  await api()
    .post(`${prefix}/inventory/receipts`)
    .send({ productId: randomUUID(), warehouseId: a, quantity: 1 })
    .expect(404);
  await api()
    .post(`${prefix}/inventory/issues`)
    .send({ productId, warehouseId: randomUUID(), quantity: 1 })
    .expect(404);
  await api()
    .get(`${prefix}/inventory/stock/${productId}/${randomUUID()}`)
    .expect(404);
  await api()
    .post(`${prefix}/inventory/transfers`)
    .send({
      productId,
      sourceWarehouseId: a,
      destinationWarehouseId: a.toUpperCase(),
      quantity: 1,
    })
    .expect(400);
  const receipt = await receive(productId.toUpperCase(), a.toUpperCase(), 1);
  expect(receipt.status).toBe(201);
  expect(await balance(productId, a)).toBe(1);
});

it('rejects overflow and atomically rolls back a transfer', async () => {
  const { productId, a, b } = await fixtures();
  expect((await receive(productId, a, 5)).status).toBe(201);
  expect((await receive(productId, b, MAX_QUANTITY)).status).toBe(201);
  const overflow = await receive(productId, b, 1);
  expect(overflow.status).toBe(409);
  expect(overflow.body.code).toBe('STOCK_OVERFLOW');
  await api()
    .post(`${prefix}/inventory/transfers`)
    .send({
      productId,
      sourceWarehouseId: a,
      destinationWarehouseId: b,
      quantity: 1,
    })
    .expect(409);
  expect(await balance(productId, a)).toBe(5);
  expect(await balance(productId, b)).toBe(MAX_QUANTITY);
  expect(await db.getRepository(Movement).countBy({ productId })).toBe(2);
});

it('rolls back changed balances when the movement INSERT fails', async () => {
  const { productId, a, b } = await fixtures();
  expect((await receive(productId, a, 10)).status).toBe(201);
  // A real database constraint causes failure AFTER stock UPDATEs; no mocked transaction.
  await db.query(
    `ALTER TABLE movements ADD CONSTRAINT test_injected_failure CHECK ("productId" <> '${productId}'::uuid)` +
      ' NOT VALID',
  );
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    await api()
      .post(`${prefix}/inventory/transfers`)
      .send({
        productId,
        sourceWarehouseId: a,
        destinationWarehouseId: b,
        quantity: 3,
      })
      .expect(500);
    expect(await balance(productId, a)).toBe(10);
    expect(
      await db.getRepository(Stock).countBy({ productId, warehouseId: b }),
    ).toBe(0);
    expect(await db.getRepository(Movement).countBy({ productId })).toBe(1);
  } finally {
    log.mockRestore();
    await db.query(
      'ALTER TABLE movements DROP CONSTRAINT test_injected_failure',
    );
  }
});

it('prevents overselling with concurrent outgoing requests', async () => {
  const { productId, a } = await fixtures();
  expect((await receive(productId, a, 10)).status).toBe(201);
  const responses = await Promise.all(
    Array.from({ length: 20 }, () =>
      api()
        .post(`${prefix}/inventory/issues`)
        .send({ productId, warehouseId: a, quantity: 1 }),
    ),
  );
  expect(responses.filter((response) => response.status === 201)).toHaveLength(
    10,
  );
  expect(responses.filter((response) => response.status === 409)).toHaveLength(
    10,
  );
  expect(await balance(productId, a)).toBe(0);
  expect(
    await db
      .getRepository(Movement)
      .countBy({ productId, type: 'issue' as Movement['type'] }),
  ).toBe(10);
});

it('serializes concurrent receipts when the first balance does not exist', async () => {
  const { productId, a } = await fixtures();
  const responses = await Promise.all(
    Array.from({ length: 20 }, () => receive(productId, a, 2)),
  );
  expect(responses.every((response) => response.status === 201)).toBe(true);
  expect(await balance(productId, a)).toBe(40);
  expect(await db.getRepository(Stock).countBy({ productId })).toBe(1);
  expect(await db.getRepository(Movement).countBy({ productId })).toBe(20);
});

it('handles opposite concurrent transfers without deadlocks or lost updates', async () => {
  const { productId, a, b } = await fixtures();
  await Promise.all([receive(productId, a, 20), receive(productId, b, 20)]);
  const responses = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      api()
        .post(`${prefix}/inventory/transfers`)
        .send({
          productId,
          sourceWarehouseId: i % 2 ? a : b,
          destinationWarehouseId: i % 2 ? b : a,
          quantity: 1,
        }),
    ),
  );
  expect(responses.map((response) => response.status)).toEqual(
    Array(20).fill(201),
  );
  expect(await balance(productId, a)).toBe(20);
  expect(await balance(productId, b)).toBe(20);
  expect(await db.getRepository(Movement).countBy({ productId })).toBe(22);
});

it('enforces database constraints and immutable movements', async () => {
  const { productId, a } = await fixtures();
  const receipt = await receive(productId, a, 1);
  expect(receipt.status).toBe(201);
  await expect(
    db.query('UPDATE movements SET quantity = 2 WHERE id = $1', [
      receipt.body.id,
    ]),
  ).rejects.toThrow('immutable');
  await expect(
    db.query('DELETE FROM movements WHERE id = $1', [receipt.body.id]),
  ).rejects.toThrow('immutable');
  await expect(db.query('TRUNCATE movements')).rejects.toThrow('immutable');
  await expect(
    db.query('UPDATE stock SET quantity = -1 WHERE "productId" = $1', [
      productId,
    ]),
  ).rejects.toThrow();
  await expect(
    db.query(
      'INSERT INTO movements (type, "productId", quantity) VALUES ($1, $2, $3)',
      ['receipt', productId, 1],
    ),
  ).rejects.toThrow();
  expect(await balance(productId, a)).toBe(1);
});

it('serves health and OpenAPI documentation', async () => {
  await api().get('/health').expect(200).expect({ status: 'ok' });
  const docs = await api().get('/docs-json').expect(200);
  expect(docs.body.paths[`${prefix}/inventory/transfers`].post).toBeDefined();
  expect(
    docs.body.paths[`${prefix}/inventory/transfers`].post.responses['201']
      .content['application/json'].schema.$ref,
  ).toBe('#/components/schemas/Movement');
  expect(
    docs.body.components.schemas.CreateProductDto.properties.description.type,
  ).toBe('string');
  expect(
    docs.body.components.schemas.TransferDto.properties.quantity.maximum,
  ).toBe(MAX_QUANTITY);
  await api().get('/docs/').expect(200);
});
