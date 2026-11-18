import { Prisma } from '@prisma/client'

import { disconnectTestDb, getTestDb, seedTask, truncateAll } from './db'

const REALTIME_TABLES = ['Tasks', 'TaskTemplates']

class Rollback extends Error {}

const rolledBack = async (fn: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> => {
  await getTestDb()
    .$transaction(async (tx) => {
      await fn(tx)
      throw new Rollback()
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error
    })
}

const asAnon = (sql: string) =>
  getTestDb().$transaction(async (tx) => {
    await tx.$executeRawUnsafe('set local role anon')
    return tx.$queryRawUnsafe<unknown[]>(sql)
  })

describe('database security', () => {
  beforeAll(truncateAll)
  afterAll(async () => {
    await truncateAll()
    await disconnectTestDb()
  })

  describe('anon role', () => {
    it.each(REALTIME_TABLES)('can read every column of %s', async (table) => {
      await expect(asAnon(`select * from "${table}" limit 1`)).resolves.toBeDefined()
    })

    it('sees Tasks rows, not just the grant', async () => {
      const id = await seedTask({ workspaceId: 'ws-security' })
      await expect(asAnon(`select id from "Tasks" where id = '${id}'`)).resolves.toEqual([{ id }])
    })

    it.each(['ActivityLogs', 'WorkspaceSettings'])('cannot read %s', async (table) => {
      await expect(asAnon(`select * from "${table}" limit 1`)).rejects.toThrow(/permission denied/)
    })

    it.each([
      `insert into "Tasks" (id) values (gen_random_uuid())`,
      `update "Tasks" set title = 'x'`,
      `delete from "Tasks"`,
      `truncate "Tasks"`,
      `insert into "TaskTemplates" (id) values (gen_random_uuid())`,
      `update "TaskTemplates" set title = 'x'`,
      `delete from "TaskTemplates"`,
      `update "WorkspaceSettings" set "updatedAt" = now()`,
      `delete from "Comments"`,
    ])('cannot write: %s', async (sql) => {
      await expect(asAnon(sql)).rejects.toThrow(/permission denied/)
    })
  })

  describe('catalog', () => {
    it('has RLS on every public table outside the Realtime allowlist', async () => {
      const rows = await getTestDb().$queryRaw<{ tablename: string }[]>`
        select tablename from pg_tables
        where schemaname = 'public' and not rowsecurity
          and tablename <> all(${REALTIME_TABLES})`
      expect(rows).toEqual([])
    })

    it('keeps RLS off on Realtime tables so postgres_changes reaches anon subscribers', async () => {
      const rows = await getTestDb().$queryRaw<{ tablename: string }[]>`
        select tablename from pg_tables
        where schemaname = 'public' and rowsecurity
          and tablename = any(${REALTIME_TABLES})`
      expect(rows).toEqual([])
    })

    it('never forces RLS on the table owner', async () => {
      const rows = await getTestDb().$queryRaw<{ relname: string }[]>`
        select relname from pg_class
        where relnamespace = 'public'::regnamespace and relforcerowsecurity`
      expect(rows).toEqual([])
    })

    it('grants API roles nothing beyond SELECT on Realtime tables', async () => {
      const rows = await getTestDb().$queryRaw<{ grantee: string; table_name: string; privilege_type: string }[]>`
        select grantee, table_name, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and grantee in ('anon', 'authenticated')
          and not (privilege_type = 'SELECT' and table_name = any(${REALTIME_TABLES}))`
      expect(rows).toEqual([])
    })

    it('grants API roles nothing on sequences', async () => {
      const rows = await getTestDb().$queryRaw<{ sequence_name: string }[]>`
        select sequence_name from information_schema.sequences s
        where sequence_schema = 'public'
          and (has_sequence_privilege('anon', format('public.%I', s.sequence_name), 'USAGE, SELECT, UPDATE')
            or has_sequence_privilege('authenticated', format('public.%I', s.sequence_name), 'USAGE, SELECT, UPDATE'))`
      expect(rows).toEqual([])
    })

    it('keeps replica identity full on Realtime tables', async () => {
      const rows = await getTestDb().$queryRaw<{ relname: string }[]>`
        select relname from pg_class
        where relnamespace = 'public'::regnamespace
          and relname = any(${REALTIME_TABLES}) and relreplident <> 'f'`
      expect(rows).toEqual([])
    })
  })

  describe('new tables', () => {
    it('get RLS enabled and no API role grants', async () => {
      await rolledBack(async (tx) => {
        await tx.$executeRawUnsafe('create table public.__rls_probe (id int)')
        const [probe] = await tx.$queryRaw<{ rls: boolean; anon: boolean; authenticated: boolean }[]>`
          select rowsecurity as rls,
                 has_table_privilege('anon', 'public.__rls_probe', 'SELECT, INSERT, UPDATE, DELETE') as anon,
                 has_table_privilege('authenticated', 'public.__rls_probe', 'SELECT, INSERT, UPDATE, DELETE') as authenticated
          from pg_tables where schemaname = 'public' and tablename = '__rls_probe'`
        expect(probe).toEqual({ rls: true, anon: false, authenticated: false })
      })
    })
  })
})
