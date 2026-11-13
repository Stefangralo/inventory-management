import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PaginationDto } from '../common/http';
import { MAX_QUANTITY, MovementType } from '../database/entities';

export class StockOperationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  warehouseId!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_QUANTITY })
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity!: number;
}

export class TransferDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sourceWarehouseId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  destinationWarehouseId!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_QUANTITY })
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity!: number;
}

export class StockQueryDto extends PaginationDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class MovementQueryDto extends StockQueryDto {
  @ApiPropertyOptional({ enum: MovementType })
  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;
}
