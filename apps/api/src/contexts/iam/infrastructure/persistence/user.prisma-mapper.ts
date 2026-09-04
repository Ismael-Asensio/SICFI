import type { User as PrismaUser } from '@prisma/client';

import { User } from '../../domain/user.entity';

export const UserPrismaMapper = {
  toDomain(row: PrismaUser): User {
    return new User({ id: row.id, email: row.email });
  },

  toPersistence(user: User): { id: string; email: string } {
    return { id: user.id, email: user.email };
  },
};
