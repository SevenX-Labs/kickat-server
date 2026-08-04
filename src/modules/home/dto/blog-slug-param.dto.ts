import { Matches } from 'class-validator';

export class BlogSlugParamDto {
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be in valid kebab-case format (e.g. pet-care-tips-2026)',
  })
  slug: string;
}
