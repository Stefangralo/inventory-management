import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  MAX_QUANTITY,
  Movement,
  MovementType,
  Product,
  Stock,
  Warehouse,
} from '../database/entities';
import { pageResult } from '../common/http';
import {
  MovementQueryDto,
  StockOperationDto,
  StockQueryDto,
  TransferDto,
} from './dto';

@Injectable()
export class InventoryService {
  constructor(private readonly dataSource: DataSource) {}

  private async requireResources(
    manager: EntityManager,
    productId: string,
    warehouseIds: string[],
  ) {
    if (!(await manager.existsBy(Product, { id: productId })))
      throw new NotFoundException('Product not found');
    for (const id of warehouseIds) {
      if (!(await manager.existsBy(Warehouse, { id })))
        throw new NotFoundException('Warehouse not found');
    }
  }

  async stock(productId: string, warehouseId: string) {
    await this.requireResources(this.dataSource.manager, productId, [
      warehouseId,
    ]);
    return (
      (await this.dataSource
        .getRepository(Stock)
        .findOneBy({ productId, warehouseId })) ?? {
        productId,
        warehouseId,
        quantity: 0,
      }
    );
  }

  async listStock(query: StockQueryDto) {
    const [data, total] = await this.dataSource
      .getRepository(Stock)
      .findAndCount({
        where: {
          ...(query.productId ? { productId: query.productId } : {}),
          ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        },
        order: { productId: 'ASC', warehouseId: 'ASC' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
    return pageResult(data, total, query);
  }

  async movements(query: MovementQueryDto) {
    const builder = this.dataSource
      .getRepository(Movement)
      .createQueryBuilder('movement');
    if (query.productId)
      builder.andWhere('movement.productId = :productId', {
        productId: query.productId,
      });
    if (query.warehouseId)
      builder.andWhere(
        '(movement.sourceWarehouseId = :warehouseId OR movement.destinationWarehouseId = :warehouseId)',
        { warehouseId: query.warehouseId },
      );
    if (query.type)
      builder.andWhere('movement.type = :type', { type: query.type });
    const [data, total] = await builder
      .orderBy('movement.createdAt', 'ASC')
      .addOrderBy('movement.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return pageResult(data, total, query);
  }

  receipt(dto: StockOperationDto) {
    return this.move(
      MovementType.RECEIPT,
      dto.productId,
      dto.quantity,
      null,
      dto.warehouseId,
    );
  }

  issue(dto: StockOperationDto) {
    return this.move(
      MovementType.ISSUE,
      dto.productId,
      dto.quantity,
      dto.warehouseId,
      null,
    );
  }

  transfer(dto: TransferDto) {
    if (
      dto.sourceWarehouseId.toLowerCase() ===
      dto.destinationWarehouseId.toLowerCase()
    )
      throw new BadRequestException('Transfer warehouses must be different');
    return this.move(
      MovementType.TRANSFER,
      dto.productId,
      dto.quantity,
      dto.sourceWarehouseId,
      dto.destinationWarehouseId,
    );
  }

  private move(
    type: MovementType,
    productId: string,
    quantity: number,
    sourceWarehouseId: string | null,
    destinationWarehouseId: string | null,
  ) {
    // UUID spelling must not change lock order or map lookup semantics.
    productId = productId.toLowerCase();
    sourceWarehouseId = sourceWarehouseId?.toLowerCase() ?? null;
    destinationWarehouseId = destinationWarehouseId?.toLowerCase() ?? null;
    const warehouseIds = [sourceWarehouseId, destinationWarehouseId]
      .filter((id): id is string => id !== null)
      .sort();
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await this.requireResources(manager, productId, warehouseIds);
      const stocks = new Map<string, Stock>();
      // Both INSERT and SELECT take locks; keep both in the same global order.
      for (const warehouseId of warehouseIds) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(Stock)
          .values({ productId, warehouseId, quantity: 0 })
          .orIgnore()
          .execute();
        const stock = await manager
          .getRepository(Stock)
          .createQueryBuilder('stock')
          .where(
            'stock.productId = :productId AND stock.warehouseId = :warehouseId',
            { productId, warehouseId },
          )
          .setLock('pessimistic_write')
          .getOneOrFail();
        stocks.set(warehouseId, stock);
      }
      if (sourceWarehouseId) {
        const source = stocks.get(sourceWarehouseId)!;
        if (source.quantity < quantity)
          throw new ConflictException({
            code: 'INSUFFICIENT_STOCK',
            message: 'Insufficient stock in the source warehouse',
          });
        source.quantity -= quantity;
      }
      if (destinationWarehouseId) {
        const destination = stocks.get(destinationWarehouseId)!;
        if (destination.quantity > MAX_QUANTITY - quantity)
          throw new ConflictException({
            code: 'STOCK_OVERFLOW',
            message: 'Stock exceeds the supported quantity range',
          });
        destination.quantity += quantity;
      }
      for (const stock of stocks.values()) {
        await manager.update(
          Stock,
          { productId, warehouseId: stock.warehouseId },
          { quantity: stock.quantity },
        );
      }
      return manager.save(
        Movement,
        manager.create(Movement, {
          type,
          productId,
          quantity,
          sourceWarehouseId,
          destinationWarehouseId,
        }),
      );
    });
  }
}
