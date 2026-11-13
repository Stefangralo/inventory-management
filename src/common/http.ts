import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiPropertyOptional,
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { QueryFailedError } from 'typeorm';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export function pageResult<T>(data: T[], total: number, query: PaginationDto) {
  return { data, total, page: query.page, limit: query.limit };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    let statusCode = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown;
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      const payload = typeof body === 'string' ? { message: body } : body;
      const error = payload as { code?: string; message?: string | string[] };
      code =
        error.code ??
        {
          400: 'INVALID_REQUEST',
          404: 'NOT_FOUND',
          409: 'CONFLICT',
          503: 'UNAVAILABLE',
        }[statusCode] ??
        'HTTP_ERROR';
      if (Array.isArray(error.message)) {
        message = 'Request validation failed';
        details = error.message;
      } else {
        message = error.message ?? exception.message;
      }
    } else if (exception instanceof QueryFailedError) {
      const pgCode = (exception.driverError as { code?: string }).code;
      if (pgCode === '23505') {
        statusCode = 409;
        code = 'DUPLICATE_RESOURCE';
        message = 'A resource with this SKU or code already exists';
      } else if (pgCode === '22003') {
        statusCode = 409;
        code = 'STOCK_OVERFLOW';
        message = 'Stock exceeds the supported quantity range';
      }
    }
    if (statusCode === 500) console.error(exception);
    host
      .switchToHttp()
      .getResponse()
      .status(statusCode)
      .json({ statusCode, code, message, ...(details ? { details } : {}) });
  }
}

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  const config = new DocumentBuilder()
    .setTitle('Inventory Management API')
    .setDescription(
      'Transactional integer stock management. No authentication is included in this MVP.',
    )
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
}
