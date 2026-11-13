import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../database/entities';
import { PaginationDto, pageResult } from '../common/http';
import { CreateProductDto, UpdateProductDto } from './dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly repository: Repository<Product>,
  ) {}

  create(dto: CreateProductDto) {
    return this.repository.save(this.repository.create(dto));
  }

  async list(query: PaginationDto) {
    const [data, total] = await this.repository.findAndCount({
      order: { createdAt: 'ASC', id: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return pageResult(data, total, query);
  }

  async get(id: string) {
    const resource = await this.repository.findOneBy({ id });
    if (!resource) throw new NotFoundException('Product not found');
    return resource;
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.get(id);
    if (Object.keys(dto).length) await this.repository.update(id, dto);
    return this.get(id);
  }
}
