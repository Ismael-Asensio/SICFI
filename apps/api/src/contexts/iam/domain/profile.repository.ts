import type { Profile } from './profile.entity';

export const PROFILE_REPOSITORY = Symbol('PROFILE_REPOSITORY');

export interface ProfileRepository {
  findByUserId(userId: string): Promise<Profile | null>;
  save(profile: Profile): Promise<void>;
}
