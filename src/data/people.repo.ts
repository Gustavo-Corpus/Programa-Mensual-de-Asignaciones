import { addDoc, collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';

import type { Person } from '../domain/types';
import { db } from './firebase';
import { personFromDoc, personToDoc } from './mappers';

const COLLECTION = 'people';

/**
 * Todas las personas, activas e inactivas. Nunca se borra nadie
 * (docs/arquitectura.md §8): la UI decide si oculta las inactivas.
 */
export async function listPeople(): Promise<Person[]> {
  const snapshot = await getDocs(collection(db, COLLECTION));
  return snapshot.docs.map((d) => personFromDoc(d.id, d.data())).sort((a, b) => a.id.localeCompare(b.id));
}

export async function getPerson(id: string): Promise<Person | null> {
  const snapshot = await getDoc(doc(db, COLLECTION, id));
  if (!snapshot.exists()) return null;
  return personFromDoc(snapshot.id, snapshot.data());
}

/**
 * Nace sin grupo, como miembro y sin ninguna restricción: entra en todo el
 * reparto desde el primer momento. Las restricciones son una excepción que
 * alguien declara, nunca algo que haya que desactivar una por una.
 */
export async function createPerson(name: string): Promise<Person> {
  const person: Omit<Person, 'id'> = {
    name,
    active: true,
    groupId: null,
    role: 'MEMBER',
    allowedTypeKeys: null,
    blockedDaysOfWeek: [],
  };
  const ref = await addDoc(collection(db, COLLECTION), personToDoc({ id: 'nuevo', ...person }));
  return { id: ref.id, ...person };
}

export type PersonChanges = Partial<
  Pick<Person, 'name' | 'active' | 'groupId' | 'role' | 'allowedTypeKeys' | 'blockedDaysOfWeek'>
>;

export async function updatePerson(id: string, changes: PersonChanges): Promise<void> {
  // Los arrays se copian a uno mutable: el SDK de Firestore no acepta
  // `readonly T[]` y copiarlos aquí evita tener que quitarle el `readonly` al
  // tipo del dominio, que sí lo quiere.
  const data: Record<string, unknown> = { ...changes };
  if (changes.allowedTypeKeys !== undefined) {
    data.allowedTypeKeys = changes.allowedTypeKeys === null ? null : [...changes.allowedTypeKeys];
  }
  if (changes.blockedDaysOfWeek !== undefined) {
    data.blockedDaysOfWeek = [...changes.blockedDaysOfWeek];
  }
  await updateDoc(doc(db, COLLECTION, id), data);
}

/** No hay `deletePerson`: nunca se borra nadie, solo se desactiva. */
export async function deactivatePerson(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { active: false });
}
