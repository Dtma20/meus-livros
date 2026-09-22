import 'dotenv/config'
import postgres from 'postgres'

const REAL_EMAILS = ['diogo.tallys16@gmail.com', 'dtma@ic.ufal.br']

async function cleanup() {
  const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('Nenhuma string de conexão configurada.')
  }

  const sql = postgres(connectionString, { max: 1 })

  try {
    console.log('Iniciando limpeza do banco de dados...')

    await sql.begin(async (tx) => {
      // 1. Apagar blocos de leitura
      const delReadingBlocks = await tx`DELETE FROM reading_blocks`
      console.log(`- Removidos ${delReadingBlocks.count} registros de reading_blocks`)

      // 2. Apagar logs de leitura
      const delReadingLogs = await tx`DELETE FROM reading_logs`
      console.log(`- Removidos ${delReadingLogs.count} registros de reading_logs`)

      // 3. Apagar relações de gêneros dos livros
      const delWorkGenres = await tx`DELETE FROM work_genres`
      console.log(`- Removidos ${delWorkGenres.count} registros de work_genres`)

      // 4. Apagar relações de autores das obras
      const delWorkAuthors = await tx`DELETE FROM work_authors`
      console.log(`- Removidos ${delWorkAuthors.count} registros de work_authors`)

      // 5. Apagar edições dos livros
      const delEditions = await tx`DELETE FROM editions`
      console.log(`- Removidos ${delEditions.count} registros de editions`)

      // 6. Apagar todas as obras (livros)
      const delWorks = await tx`DELETE FROM works`
      console.log(`- Removidos ${delWorks.count} registros de works`)

      // 7. Apagar autores
      const delAuthors = await tx`DELETE FROM authors`
      console.log(`- Removidos ${delAuthors.count} registros de authors`)

      // 8. Apagar buscas não encontradas
      const delSearchMisses = await tx`DELETE FROM search_misses`
      console.log(`- Removidos ${delSearchMisses.count} registros de search_misses`)

      // 9. Apagar e-mails permitidos de teste
      const delAllowedEmails = await tx`
        DELETE FROM allowed_emails
        WHERE email NOT IN ${tx(REAL_EMAILS)}
      `
      console.log(`- Removidos ${delAllowedEmails.count} registros de allowed_emails de teste`)

      // 10. Apagar sessões de usuários de teste no better-auth
      const delSessions = await tx`
        DELETE FROM "session"
        WHERE "userId" IN (
          SELECT id FROM "ba_user" WHERE email NOT IN ${tx(REAL_EMAILS)}
        )
      `
      console.log(`- Removidos ${delSessions.count} sessões de teste`)

      // 11. Apagar contas de usuários de teste no better-auth
      const delAccounts = await tx`
        DELETE FROM "account"
        WHERE "userId" IN (
          SELECT id FROM "ba_user" WHERE email NOT IN ${tx(REAL_EMAILS)}
        )
      `
      console.log(`- Removidos ${delAccounts.count} contas de teste`)

      // 12. Apagar códigos de verificação de teste
      const delVerifications = await tx`
        DELETE FROM "verification"
        WHERE "identifier" NOT IN ${tx(REAL_EMAILS)}
      `
      console.log(`- Removidos ${delVerifications.count} códigos de verificação de teste`)

      // 13. Apagar usuários de teste da tabela ba_user
      const delBaUsers = await tx`
        DELETE FROM "ba_user"
        WHERE email NOT IN ${tx(REAL_EMAILS)}
      `
      console.log(`- Removidos ${delBaUsers.count} usuários de teste de ba_user`)

      // 14. Apagar usuários de teste da tabela principal users
      const delUsers = await tx`
        DELETE FROM users
        WHERE email NOT IN ${tx(REAL_EMAILS)}
      `
      console.log(`- Removidos ${delUsers.count} usuários de teste de users`)
    })

    console.log('\nLimpeza concluída com sucesso!')

    // Conferência final
    const remainingUsers = await sql`SELECT id, email, handle, display_name FROM users`
    console.log('\nUsuários restantes na tabela users:')
    console.table(remainingUsers)

    const remainingBaUsers = await sql`SELECT id, email FROM ba_user`
    console.log('Usuários restantes na tabela ba_user:')
    console.table(remainingBaUsers)

    const counts = await sql`
      SELECT 
        (SELECT COUNT(*) FROM works) as works_count,
        (SELECT COUNT(*) FROM reading_logs) as logs_count,
        (SELECT COUNT(*) FROM editions) as editions_count,
        (SELECT COUNT(*) FROM authors) as authors_count
    `
    console.log('Contagens após limpeza:', counts[0])
  } catch (err) {
    console.error('Erro durante a limpeza:', err)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

cleanup()
