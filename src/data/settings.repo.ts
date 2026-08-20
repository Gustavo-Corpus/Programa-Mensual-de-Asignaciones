import { doc, getDoc, setDoc } from 'firebase/firestore';

import type { GenerationSettings } from '../domain/types';
import { db } from './firebase';
import { settingsFromDoc, settingsToDoc } from './mappers';

const COLLECTION = 'settings';
const DOC_ID = 'app';

export async function getSettings(): Promise<GenerationSettings> {
  const snapshot = await getDoc(doc(db, COLLECTION, DOC_ID));
  if (!snapshot.exists()) {
    throw new Error(
      `No existe el documento ${COLLECTION}/${DOC_ID}. Ejecuta "npm run seed" para crear la configuración inicial.`
    );
  }
  return settingsFromDoc(snapshot.data());
}

export async function saveSettings(settings: GenerationSettings): Promise<void> {
  await setDoc(doc(db, COLLECTION, DOC_ID), settingsToDoc(settings));
}
