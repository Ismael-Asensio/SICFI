import type { HouseholdMember } from '../../src/contexts/iam/domain/household-member.entity';
import type { HouseholdMemberRepository } from '../../src/contexts/iam/domain/household-member.repository';
import type { Household } from '../../src/contexts/iam/domain/household.entity';
import type { HouseholdRepository } from '../../src/contexts/iam/domain/household.repository';
import type { HouseholdRole } from '../../src/contexts/iam/domain/household-policy';
import type { Profile } from '../../src/contexts/iam/domain/profile.entity';
import type { ProfileRepository } from '../../src/contexts/iam/domain/profile.repository';
import type { User } from '../../src/contexts/iam/domain/user.entity';
import type { UserRepository } from '../../src/contexts/iam/domain/user.repository';

export class InMemoryUserRepository implements UserRepository {
  private rows = new Map<string, User>();

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findByEmail(email: string): Promise<User | null> {
    for (const row of this.rows.values()) if (row.email === email) return Promise.resolve(row);
    return Promise.resolve(null);
  }

  save(user: User): Promise<void> {
    this.rows.set(user.id, user);
    return Promise.resolve();
  }
}

export class InMemoryHouseholdRepository implements HouseholdRepository {
  private rows = new Map<string, Household>();

  findById(id: string): Promise<Household | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  save(household: Household): Promise<void> {
    this.rows.set(household.id, household);
    return Promise.resolve();
  }
}

export class InMemoryHouseholdMemberRepository implements HouseholdMemberRepository {
  private rows = new Map<string, HouseholdMember>();

  findById(householdId: string, id: string): Promise<HouseholdMember | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row && row.householdId === householdId ? row : null);
  }

  findByUser(householdId: string, userId: string): Promise<HouseholdMember | null> {
    for (const row of this.rows.values()) {
      if (row.householdId === householdId && row.userId === userId) return Promise.resolve(row);
    }
    return Promise.resolve(null);
  }

  findByUserAcrossHouseholds(userId: string): Promise<HouseholdMember[]> {
    return Promise.resolve([...this.rows.values()].filter((row) => row.userId === userId));
  }

  findByHousehold(householdId: string): Promise<HouseholdMember[]> {
    return Promise.resolve([...this.rows.values()].filter((row) => row.householdId === householdId));
  }

  countByRole(householdId: string, role: HouseholdRole): Promise<number> {
    const count = [...this.rows.values()].filter(
      (row) => row.householdId === householdId && row.role === role
    ).length;
    return Promise.resolve(count);
  }

  save(member: HouseholdMember): Promise<void> {
    this.rows.set(member.id, member);
    return Promise.resolve();
  }

  delete(householdId: string, id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.householdId === householdId) this.rows.delete(id);
    return Promise.resolve();
  }
}

export class InMemoryProfileRepository implements ProfileRepository {
  private rows = new Map<string, Profile>();

  findByUserId(userId: string): Promise<Profile | null> {
    for (const row of this.rows.values()) if (row.userId === userId) return Promise.resolve(row);
    return Promise.resolve(null);
  }

  save(profile: Profile): Promise<void> {
    this.rows.set(profile.id, profile);
    return Promise.resolve();
  }
}
