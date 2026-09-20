export interface GenreItem {
  id: number
  slug: string
  label_pt: string
  kind: 'ficcao' | 'nao_ficcao' | 'outro'
}

/**
 * The 26 canonical seeded genres in the catalog.
 * Corresponds to the database genres table (seeded in TASK-004).
 */
export const GENRES: readonly GenreItem[] = [
  { id: 1, slug: 'ficcao', label_pt: 'Ficção', kind: 'ficcao' },
  { id: 2, slug: 'nao-ficcao', label_pt: 'Não Ficção', kind: 'nao_ficcao' },
  { id: 3, slug: 'romance', label_pt: 'Romance', kind: 'ficcao' },
  { id: 4, slug: 'aventura', label_pt: 'Aventura', kind: 'ficcao' },
  { id: 5, slug: 'fantasia', label_pt: 'Fantasia', kind: 'ficcao' },
  { id: 6, slug: 'ficcao-cientifica', label_pt: 'Ficção Científica', kind: 'ficcao' },
  { id: 7, slug: 'novela', label_pt: 'Novela', kind: 'ficcao' },
  { id: 8, slug: 'misterio', label_pt: 'Suspense e Mistério', kind: 'ficcao' },
  { id: 9, slug: 'distopia', label_pt: 'Distopia', kind: 'ficcao' },
  { id: 10, slug: 'contos', label_pt: 'Contos', kind: 'ficcao' },
  { id: 11, slug: 'terror', label_pt: 'Terror', kind: 'ficcao' },
  { id: 12, slug: 'historia', label_pt: 'História', kind: 'nao_ficcao' },
  { id: 13, slug: 'biografia', label_pt: 'Biografia e Autobiografia', kind: 'nao_ficcao' },
  { id: 14, slug: 'politica', label_pt: 'Política', kind: 'nao_ficcao' },
  { id: 15, slug: 'filosofia', label_pt: 'Filosofia', kind: 'nao_ficcao' },
  { id: 16, slug: 'desenvolvimento-pessoal', label_pt: 'Desenvolvimento Pessoal', kind: 'nao_ficcao' },
  { id: 17, slug: 'fabula', label_pt: 'Fábula', kind: 'ficcao' },
  { id: 18, slug: 'graphic-novel', label_pt: 'Graphic Novel', kind: 'outro' },
  { id: 19, slug: 'matematica', label_pt: 'Matemática', kind: 'nao_ficcao' },
  { id: 20, slug: 'ciencia', label_pt: 'Ciência', kind: 'nao_ficcao' },
  { id: 21, slug: 'economia', label_pt: 'Economia', kind: 'nao_ficcao' },
  { id: 22, slug: 'ensaio', label_pt: 'Ensaios e Crônicas', kind: 'nao_ficcao' },
  { id: 23, slug: 'tecnologia', label_pt: 'Tecnologia', kind: 'nao_ficcao' },
  { id: 24, slug: 'dramaturgia', label_pt: 'Dramaturgia', kind: 'outro' },
  { id: 25, slug: 'comedia', label_pt: 'Comédia', kind: 'ficcao' },
  { id: 26, slug: 'poesia', label_pt: 'Poesia', kind: 'outro' },
] as const
