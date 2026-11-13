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
import { Product } from '../database/entities';
import { CreateProductDto, UpdateProductDto } from './dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiErrors()
@Controller('products')
class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Post()
  @ApiCreatedResponse({ type: Product })
  @ApiOperation({ summary: 'Create a product' })
  create(@Body() dto: CreateProductDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiPageResponse(Product)
  @ApiOperation({ summary: 'List products' })
  list(@Query() query: PaginationDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: Product })
  @ApiOperation({ summary: 'Get a product' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: Product })
  @ApiOperation({ summary: 'Update a product' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.service.update(id, dto);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
