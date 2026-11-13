import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const MAX_QUANTITY = 2147483647;
export enum MovementType {
  RECEIPT = 'receipt',
  ISSUE = 'issue',
  TRANSFER = 'transfer',
}

@Entity('products')
export class Product {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @ApiProperty({ maxLength: 64 })
  @Column({ length: 64, unique: true })
  sku!: string;
  @ApiProperty({ maxLength: 200 })
  @Column({ length: 200 })
  name!: string;
  @ApiProperty({ type: String, nullable: true })
  @Column({ type: 'text', nullable: true })
  description!: string | null;
  @ApiProperty({ type: String, format: 'date-time' })
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

@Entity('warehouses')
export class Warehouse {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @ApiProperty({ maxLength: 64 })
  @Column({ length: 64, unique: true })
  code!: string;
  @ApiProperty({ maxLength: 200 })
  @Column({ length: 200 })
  name!: string;
  @ApiProperty({ type: String, nullable: true })
  @Column({ type: 'text', nullable: true })
  description!: string | null;
  @ApiProperty({ type: String, format: 'date-time' })
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

@Entity('stock')
export class Stock {
  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', primary: true })
  productId!: string;
  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid', primary: true })
  warehouseId!: string;
  @ApiProperty({ minimum: 0, maximum: MAX_QUANTITY })
  @Column({ type: 'integer', default: 0 })
  quantity!: number;
}

@Entity('movements')
export class Movement {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @ApiProperty({ enum: MovementType })
  @Column({ type: 'varchar' })
  type!: MovementType;
  @ApiProperty({ format: 'uuid' })
  @Column({ type: 'uuid' })
  productId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @Column({ type: 'uuid', nullable: true })
  sourceWarehouseId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @Column({ type: 'uuid', nullable: true })
  destinationWarehouseId!: string | null;
  @ApiProperty({ minimum: 1, maximum: MAX_QUANTITY })
  @Column({ type: 'integer' })
  quantity!: number;
  @ApiProperty({ type: String, format: 'date-time' })
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
