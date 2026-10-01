export async function setup(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      [
        '',
        'DATABASE_URL não configurada no ambiente.',
        'Os testes de integração necessitam de uma conexão ativa com o banco PostgreSQL de teste.',
        'Defina DATABASE_URL no seu arquivo .env ou no ambiente antes de executar.',
        '',
      ].join('\n'),
    )
  }
}
