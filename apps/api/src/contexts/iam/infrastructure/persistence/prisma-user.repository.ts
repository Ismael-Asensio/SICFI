import { Injectable } from '@nestjs/common';

import { PrismaRepositoryBase } from '../../../../shared/infrastructure/prisma/prisma-repository.base';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { User } from '../../domain/user.entity';
import type { UserRepository } from '../../domain/user.repository';

import { UserPrismaMapper } from './user.prisma-mapper';

@Injectable()
export class PrismaUserRepository extends PrismaRepositoryBase implements UserRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.client.user.findUnique({ where: { id } });
    return row ? UserPrismaMapper.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.client.user.findUnique({ where: { email } });
    return row ? UserPrismaMapper.toDomain(row) : null;
  }

  async save(user: User): Promise<void> {
    const data = UserPrismaMapper.toPersistence(user);
    await this.client.user.upsert({
      where: { id: user.id },
      create: data,
      update: { email: data.email },
    });
  }
}
