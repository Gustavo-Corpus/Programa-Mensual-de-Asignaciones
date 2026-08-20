/**
 * Carga inicial de Firestore. Usa `firebase-admin` (Node), NO el SDK web:
 * son APIs distintas y no se mezclan aquí.
 *
 * Ejecutar con `npm run seed`. Necesita `firebase-service-account.json` en
 * la raíz del proyecto (docs/FIREBASE.md, paso 9).
 *
 * Idempotente: usa los ids fijos de scripts/seed-data.json (p01, g1, e1, t1,
 * "2026-08"...) y escribe con `.set()`, así que ejecutarlo dos veces deja la
 * base igual, no duplica nada.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { expandHistoricalProgram, verifyExpandedProgram, type SeedData } from './seedExpand';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const SERVICE_ACCOUNT_PATH = join(ROOT_DIR, 'firebase-service-account.json');
const SEED_DATA_PATH = join(__dirname, 'seed-data.json');

function loadServiceAccount(): Record<string, unknown> {
  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(
      [
        '',
        'Falta el archivo firebase-service-account.json en la raíz del proyecto.',
        'Sigue el paso 9 de docs/FIREBASE.md para generarlo y colocarlo ahí.',
        '',
      ].join('\n')
    );
    process.exit(1);
  }

  try {
    return JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8')) as Record<string, unknown>;
  } catch {
    console.error(
      [
        '',
        'firebase-service-account.json existe pero no se pudo leer como JSON válido.',
        'Vuelve a generarlo siguiendo el paso 9 de docs/FIREBASE.md.',
        '',
      ].join('\n')
    );
    process.exit(1);
  }
}

function loadSeedData(): SeedData {
  const raw = readFileSync(SEED_DATA_PATH, 'utf-8');
  return JSON.parse(raw) as SeedData;
}

async function main(): Promise<void> {
  const serviceAccount = loadServiceAccount();
  initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]) });
  const db = getFirestore();

  const seedData = loadSeedData();

  console.log('Expandiendo el programa histórico...');
  const expanded = expandHistoricalProgram(seedData);
  const verification = verifyExpandedProgram(seedData, expanded);
  if (!verification.ok) {
    console.error('\nLa expansión del programa histórico no coincide con _verificacion:\n');
    for (const detail of verification.details) console.error(`  - ${detail}`);
    console.error('\nRevisa scripts/seed-data.json: la carga se detuvo antes de escribir nada.\n');
    process.exit(1);
  }

  console.log('Cifras verificadas contra _verificacion: OK.');
  console.log('Escribiendo catálogo en Firestore...');

  let assignmentTypesWritten = 0;
  for (const type of seedData.assignmentTypes) {
    const { id, ...data } = type;
    await db.collection('assignmentTypes').doc(id).set(data);
    assignmentTypesWritten++;
  }

  let peopleWritten = 0;
  for (const person of seedData.people) {
    const { id, ...data } = person;
    await db.collection('people').doc(id).set(data);
    peopleWritten++;
  }

  let teamsWritten = 0;
  for (const team of seedData.teams) {
    const { id, ...data } = team;
    await db.collection('teams').doc(id).set(data);
    teamsWritten++;
  }

  let groupsWritten = 0;
  for (const group of seedData.groups) {
    const { id, ...data } = group;
    await db.collection('groups').doc(id).set(data);
    groupsWritten++;
  }

  await db.collection('settings').doc('app').set(seedData.settings);

  const now = Timestamp.now();
  await db
    .collection('programs')
    .doc(expanded.id)
    .set({
      year: expanded.year,
      month: expanded.month,
      status: expanded.status,
      seed: expanded.seed,
      settingsSnapshot: seedData.settings,
      warnings: [],
      createdAt: now,
      updatedAt: now,
      dates: expanded.dates,
    });

  console.log('\nCarga inicial completada:');
  console.log(`  - ${assignmentTypesWritten} tipos de asignación`);
  console.log(`  - ${peopleWritten} personas`);
  console.log(`  - ${teamsWritten} equipos`);
  console.log(`  - ${groupsWritten} grupos`);
  console.log('  - 1 documento de configuración (settings/app)');
  console.log(`  - 1 programa histórico (programs/${expanded.id}), ${expanded.dates.length} fechas`);
  console.log('');
}

main().catch((error: unknown) => {
  console.error('\nLa carga inicial falló:\n');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
