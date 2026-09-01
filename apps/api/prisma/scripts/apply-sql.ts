/**
 * Aplica un archivo `.sql` contra la base configurada en `DIRECT_URL`.
 *
 * Existe porque no hay `psql` en la máquina de desarrollo y porque el driver de
 * Prisma usa el protocolo extendido, que solo admite UNA sentencia por llamada:
 * hay que trocear el archivo. El troceo respeta el dollar-quoting de Postgres
 * (`$$ … $$`, `$tag$ … $tag$`), sin el cual un `DO $$ … END $$` con puntos y
 * coma dentro se partiría por la mitad.
 *
 *   pnpm exec ts-node --compiler-options '{"module":"CommonJS"}' \
 *     prisma/scripts/apply-sql.ts prisma/sql/rls-policies.sql
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

/**
 * Trocea un script SQL en sentencias, respetando cadenas simples, comentarios
 * de línea/bloque y dollar-quoting.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let index = 0;

  while (index < sql.length) {
    const rest = sql.slice(index);

    // Comentario de línea
    if (rest.startsWith('--')) {
      const newline = sql.indexOf('\n', index);
      const stop = newline === -1 ? sql.length : newline;
      current += sql.slice(index, stop);
      index = stop;
      continue;
    }

    // Comentario de bloque
    if (rest.startsWith('/*')) {
      const close = sql.indexOf('*/', index + 2);
      const stop = close === -1 ? sql.length : close + 2;
      current += sql.slice(index, stop);
      index = stop;
      continue;
    }

    // Cadena entre comillas simples ('' escapa una comilla)
    if (rest.startsWith("'")) {
      let cursor = index + 1;
      while (cursor < sql.length) {
        if (sql[cursor] === "'") {
          if (sql[cursor + 1] === "'") {
            cursor += 2;
            continue;
          }
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      current += sql.slice(index, cursor);
      index = cursor;
      continue;
    }

    // Dollar quoting: $$ … $$ o $etiqueta$ … $etiqueta$
    const dollarTag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(rest);
    if (dollarTag) {
      const tag = dollarTag[0];
      const close = sql.indexOf(tag, index + tag.length);
      const stop = close === -1 ? sql.length : close + tag.length;
      current += sql.slice(index, stop);
      index = stop;
      continue;
    }

    // Fin de sentencia
    if (sql[index] === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      index += 1;
      continue;
    }

    current += sql[index];
    index += 1;
  }

  if (current.trim()) statements.push(current.trim());

  // Descartar los trozos que solo son comentarios
  return statements.filter((statement) =>
    statement
      .split('\n')
      .some((line) => line.trim() && !line.trim().startsWith('--'))
  );
}

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error('Uso: apply-sql.ts <ruta-al-archivo.sql>');
    process.exitCode = 1;
    return;
  }

  const path = resolve(process.cwd(), target);
  const statements = splitSqlStatements(readFileSync(path, 'utf8'));

  console.log(`Aplicando ${statements.length} sentencias de ${target}…`);

  const prisma = new PrismaClient();
  let applied = 0;

  try {
    for (const [position, statement] of statements.entries()) {
      try {
        await prisma.$executeRawUnsafe(statement);
        applied += 1;
      } catch (error) {
        const preview = statement.replace(/\s+/g, ' ').slice(0, 120);
        console.error(`\n  ✗ sentencia ${position + 1}: ${preview}…`);
        throw error;
      }
    }
    console.log(`  ✓ ${applied} sentencias aplicadas`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
