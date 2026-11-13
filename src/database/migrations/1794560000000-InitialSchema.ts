import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1794560000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sku varchar(64) NOT NULL UNIQUE CHECK (sku = upper(btrim(sku)) AND length(sku) > 0),
        name varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
        description text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE warehouses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(64) NOT NULL UNIQUE CHECK (code = upper(btrim(code)) AND length(code) > 0),
        name varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
        description text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE stock (
        "productId" uuid NOT NULL REFERENCES products(id),
        "warehouseId" uuid NOT NULL REFERENCES warehouses(id),
        quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        PRIMARY KEY ("productId", "warehouseId")
      );
      CREATE INDEX stock_warehouse_idx ON stock ("warehouseId", "productId");
      CREATE TABLE movements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type varchar NOT NULL CHECK (type IN ('receipt', 'issue', 'transfer')),
        "productId" uuid NOT NULL REFERENCES products(id),
        "sourceWarehouseId" uuid REFERENCES warehouses(id),
        "destinationWarehouseId" uuid REFERENCES warehouses(id),
        quantity integer NOT NULL CHECK (quantity > 0),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT movement_shape CHECK (
          (type = 'receipt' AND "sourceWarehouseId" IS NULL AND "destinationWarehouseId" IS NOT NULL) OR
          (type = 'issue' AND "sourceWarehouseId" IS NOT NULL AND "destinationWarehouseId" IS NULL) OR
          (type = 'transfer' AND "sourceWarehouseId" IS NOT NULL AND "destinationWarehouseId" IS NOT NULL AND "sourceWarehouseId" <> "destinationWarehouseId")
        )
      );
      CREATE INDEX movements_created_idx ON movements ("createdAt", id);
      CREATE INDEX movements_product_idx ON movements ("productId", "createdAt", id);
      CREATE INDEX movements_source_idx ON movements ("sourceWarehouseId", "createdAt", id);
      CREATE INDEX movements_destination_idx ON movements ("destinationWarehouseId", "createdAt", id);
      CREATE FUNCTION reject_movement_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Inventory movements are immutable';
      END;
      $$;
      CREATE TRIGGER movements_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON movements
        FOR EACH STATEMENT EXECUTE FUNCTION reject_movement_mutation();
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      DROP TABLE movements;
      DROP FUNCTION reject_movement_mutation();
      DROP TABLE stock;
      DROP TABLE warehouses;
      DROP TABLE products;
    `);
  }
}
