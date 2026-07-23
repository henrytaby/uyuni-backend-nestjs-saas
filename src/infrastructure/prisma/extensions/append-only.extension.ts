import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function appendOnlyExtension() {
  return Prisma.defineExtension((client) => {
    return client.$extends({
      name: 'appendOnly',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (
              (model as string) === 'AccessLog' ||
              (model as string) === 'ChangeRecord'
            ) {
              if (
                operation === 'update' ||
                operation === 'updateMany' ||
                operation === 'delete' ||
                operation === 'deleteMany' ||
                operation === 'upsert'
              ) {
                throw new ForbiddenException(
                  `Operation ${operation} is forbidden on append-only model ${model}.`,
                );
              }
            }
            return query(args);
          },
        },
      },
    });
  });
}
