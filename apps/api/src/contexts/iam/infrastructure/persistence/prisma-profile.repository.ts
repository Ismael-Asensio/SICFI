import { Injectable } from '@nestjs/common';

import { PrismaRepositoryBase } from '../../../../shared/infrastructure/prisma/prisma-repository.base';
import { TenantScopedPrisma } from '../../../../shared/infrastructure/prisma/tenant-scoped-prisma';
import type { Profile } from '../../domain/profile.entity';
import type { ProfileRepository } from '../../domain/profile.repository';

import { ProfilePrismaMapper } from './profile.prisma-mapper';

@Injectable()
export class PrismaProfileRepository extends PrismaRepositoryBase implements ProfileRepository {
  constructor(scoped: TenantScopedPrisma) {
    super(scoped);
  }

  async findByUserId(userId: string): Promise<Profile | null> {
    const row = await this.client.profile.findUnique({ where: { userId } });
    return row ? ProfilePrismaMapper.toDomain(row) : null;
  }

  async save(profile: Profile): Promise<void> {
    const data = ProfilePrismaMapper.toPersistence(profile);
    await this.client.profile.upsert({
      where: { id: profile.id },
      create: data,
      update: {
        displayName: data.displayName,
        locale: data.locale,
        timezone: data.timezone,
        activeHouseholdId: data.activeHouseholdId,
      },
    });
  }
}
