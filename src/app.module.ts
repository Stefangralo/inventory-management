import {
  Controller,
  Get,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { databaseOptions } from './database/data-source';
import { InventoryModule } from './inventory/inventory.module';
import { ProductsModule } from './products/products.module';
import { WarehousesModule } from './warehouses/warehouses.module';

@ApiTags('health')
@Controller('health')
class HealthController {
  constructor(private readonly dataSource: DataSource) {}
  @Get()
  async health() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseOptions()),
    ProductsModule,
    WarehousesModule,
    InventoryModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
