import { ApiErrors, ApiPageResponse } from '../common/openapi';
import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaginationDto } from '../common/http';
import { Warehouse } from '../database/entities';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto';
import { WarehousesService } from './warehouses.service';

@ApiTags('warehouses')
@ApiErrors()
@Controller('warehouses')
class WarehousesController {
  constructor(private readonly service: WarehousesService) {}

  @Post()
  @ApiCreatedResponse({ type: Warehouse })
  @ApiOperation({ summary: 'Create a warehouse' })
  create(@Body() dto: CreateWarehouseDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiPageResponse(Warehouse)
  @ApiOperation({ summary: 'List warehouses' })
  list(@Query() query: PaginationDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: Warehouse })
  @ApiOperation({ summary: 'Get a warehouse' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: Warehouse })
  @ApiOperation({ summary: 'Update a warehouse' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.service.update(id, dto);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Warehouse])],
  controllers: [WarehousesController],
  providers: [WarehousesService],
})
export class WarehousesModule {}
