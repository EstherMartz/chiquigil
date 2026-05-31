/**
 * Seed script: clears the chistes table and inserts the curated joke set below.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/seed-chistes.ts
 *
 * Idempotent: re-running clears and re-seeds the table.
 */

import { createClient } from '@libsql/client';

// Curated jokes. Each entry is one row in the `joke` TEXT column. Question and
// answer are separated by " / "; multi-line dialogue jokes keep their turns
// separated by " / " too. The bot tells each one whole (see systemPrompt.ts).
const JOKES: string[] = [
  '¿Qué cartel ponía en la planta 92 de las torres gemelas? / SE TRASPASA',
  '¿Donde se sube Miguel Ángel Blanco en la feria? / En el Tiovivo seguro que no!',
  '¿Qué tienen en común las torres gemelas y una lasaña? / Que entre piso y piso hay carne triturada',
  '-Sabes por qué la torre de pisa está inclinada? Porque si tuvo reflejos, no como las gemelas. JAJAJAJ / -No juegues con eso por favor, mi tío murió en el atentado. / -Ostia lo siento, ¿de qué trabajaba? / -Era el mejor piloto de avión',
  '¿Que es Irene Villa al comerse un chile picantón? / Un misil termo nuclear',
  '¿Por qué Estados Unidos y Reino Unido no pueden jugar al ajedrez? / Porque les faltan torres y la reina',
  '¿Cual es el videojuego preferido por los terroristas? / El Counter Strike',
  '¿Qué fue lo último que le pasó por la cabeza a Irene Villa en el accidente? / El tobillo.',
  '¿Cual es la diferencia entre una paloma y un niño Sirio? / Que la paloma vuela entera.',
  '¿Que usa Irene Villa de zapatillas? / Las tapas del colacao',
  '¿Cómo duerme Irene Villa? / A pierna suelta.',
  '¿Cómo juega Irene Villa al fútbol? / Con bragas de tacos.',
  '¿Cómo caga Irene Villa? / Agarrada a la cadena.',
  '¿Qué hace Irene Villa en un orinal? / Jugar al proaction football.',
  '¿Cuál es la moto favorita de Irene Villa? / La Honda expansiva.',
  '¿Qué hace Irene Villa en una piscina? / Hacer pie, desde luego que no.',
  '¿Cómo se pone Irene Villa las compresas? / Con tirantes.',
  '¿En qué se parece Miguel Ángel Blanco a un delfín? / En el agujero de la nuca',
  '¿Por qué Irene Villa dejó el trabajo? / Porque la explotaban',
  '¿Por qué Irene Villa no puede ir por el campo? / Porque los conejos se comen la hierba',
  '¿Como va Irene Villa al colegio? / En mochila',
  '¿Por qué Irene Villa no se baña? / Porque hace ventosa',
  '¿Cuál es el único coche que no puede conducir Irene Villa? / El troncomóvil',
  'Va Miguel Ángel Blanco por el bosque con el etarra que lo mató y dice: / -Joder, qué oscuro está esto, qué miedo... / -Pues dímelo a mí que tengo que volver solo.',
  '¿Qué le dijo Miguel Ángel Blanco al etarra antes de morir? / Oye, tronco, me das un par de tiros...',
  '¿Cuál es la planta que puede aguantar tres años sin la luz del sol? / La Ortiga Lara.',
  '¿Que es Irene Villa encima de un autobús? / Un transformer',
  '¿Que son 8 palestinos cogidos de la mano? / Una traca',
  '¿Que hace Irene Villa con la regla? / Un rotulador rojo.',
  '¿Que hace Irene Villa pintada de verde? / El icono del messenger',
  '¿Cual es el estadio de fútbol preferido de Irene Villa? / El Mestalla.',
  '¿Cuál es el baile que más odia Irene Villa? / El Paso-doble.',
  '¿Cuál es el foro favorito de Irene Villa? / Mediavida.',
  '¿Por qué suspendió la carrera Irene Villa? / Porque en vez de tesis hizo una prótesis.',
  '¿Que dicen los ex novios de Irene Villa? / Que siempre vuelve arrastrándose.',
  '¿En qué se diferencian el Betis e Irene Villa? / En que uno Empata y la otra Sinpata.',
  '¿Qué es lo primero que se le pasó a Irene Villa por la cabeza? / Las piernas.',
  'Un musulmán entra en un bar... / Ninguno sobrevivió a la explosión.',
  '¿Qué es Irene Villa vestida de novia? / Una pelota de Badminton.',
  'Según una estadística, 9 de cada 10 personas disfrutan de las violaciones en grupo.',
  '¿Por qué no se detuvo al escuchar la sirena? / -Porque son seres mitológicos. / -Sople aquí.',
  '¿Cuál es el pez que da leche? / El pezón',
  '¿Cómo estornuda un musulmán? / ¡Jachís!',
  '¿Por qué el estadio del Cádiz es el más grande del mundo? / Porque nunca se llena',
  'Si los ciempiés tienen 100 pies... / ¿los piojos tienen 3,14084 ojos?',
];

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set');

  const isLocal = url === ':memory:' || url.startsWith('file:');
  const client = createClient({
    url: url === ':memory:' ? 'file::memory:' : url,
    ...(isLocal ? {} : { authToken }),
  });

  console.log('🗄️  Setting up chistes table…');
  await client.execute(`
    CREATE TABLE IF NOT EXISTS chistes (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      joke    TEXT NOT NULL
    )
  `);

  // Clear existing data so re-runs are idempotent.
  console.log('🧹 Clearing existing jokes…');
  await client.execute('DELETE FROM chistes');

  console.log(`📝 Inserting ${JOKES.length} jokes…`);
  await client.batch(
    JOKES.map((joke) => ({ sql: 'INSERT INTO chistes (joke) VALUES (?)', args: [joke] as [string] })),
    'write',
  );

  const count = await client.execute('SELECT COUNT(*) as n FROM chistes');
  console.log(`🎉 Done! ${count.rows[0].n} jokes in DB.`);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
