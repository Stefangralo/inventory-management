import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, MaxLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const normalizeCode = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateWarehouseDto {
  @ApiProperty({ maxLength: 64, example: 'MAD-01' })
  @Transform(normalizeCode)
  @IsString()
  @Length(1, 64)
  code!: string;

  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  description?: string | null;
}

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto, {
  skipNullProperties: false,
}) {}
