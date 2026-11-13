import { ApiErrors, ApiPageResponse } from '../common/openapi';
import { Movement, Stock } from '../database/entities';
import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  MovementQueryDto,
  StockOperationDto,
  StockQueryDto,
  TransferDto,
} from './dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiErrors()
@Controller('inventory')
class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get('stock')
  @ApiPageResponse(Stock)
  @ApiOperation({ summary: 'List registered stock balances' })
  list(@Query() query: StockQueryDto) {
    return this.service.listStock(query);
  }

  @Get('stock/:productId/:warehouseId')
  @ApiOkResponse({ type: Stock })
  @ApiOperation({
    summary: 'Get a balance, including zero for an unregistered pair',
  })
  stock(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
  ) {
    return this.service.stock(productId, warehouseId);
  }

  @Post('receipts')
  @ApiCreatedResponse({ type: Movement })
  @ApiOperation({ summary: 'Receive stock atomically' })
  receipt(@Body() dto: StockOperationDto) {
    return this.service.receipt(dto);
  }

  @Post('issues')
  @ApiCreatedResponse({ type: Movement })
  @ApiOperation({ summary: 'Issue available stock atomically' })
  issue(@Body() dto: StockOperationDto) {
    return this.service.issue(dto);
  }

  @Post('transfers')
  @ApiCreatedResponse({ type: Movement })
  @ApiOperation({ summary: 'Transfer stock atomically between warehouses' })
  transfer(@Body() dto: TransferDto) {
    return this.service.transfer(dto);
  }

  @Get('movements')
  @ApiPageResponse(Movement)
  @ApiOperation({ summary: 'List immutable inventory movements' })
  movements(@Query() query: MovementQueryDto) {
    return this.service.movements(query);
  }
}

@Module({ controllers: [InventoryController], providers: [InventoryService] })
export class InventoryModule {}
