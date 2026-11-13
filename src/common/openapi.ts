import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

export function ApiPageResponse(model: Type<unknown>) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['data', 'total', 'page', 'limit'],
        properties: {
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          total: { type: 'integer', minimum: 0 },
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    }),
  );
}

export function ApiErrors() {
  return applyDecorators(
    ...[400, 404, 409, 500].map((status) =>
      ApiResponse({
        status,
        description: {
          400: 'Invalid request',
          404: 'Resource not found',
          409: 'Business conflict',
          500: 'Unexpected failure',
        }[status],
        schema: {
          type: 'object',
          required: ['statusCode', 'code', 'message'],
          properties: {
            statusCode: { type: 'integer', example: status },
            code: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'array', items: { type: 'string' } },
          },
        },
      }),
    ),
  );
}
