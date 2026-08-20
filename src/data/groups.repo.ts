import { addDoc, collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';

import type { Group } from '../domain/types';
import { db } from './firebase';
import { groupFromDoc } from './mappers';

const COLLECTION = 'groups';

/** Todos los grupos, activos e inactivos. Nunca se borra ninguno. */
export async function listGroups(): Promise<Group[]> {
  const snapshot = await getDocs(collection(db, COLLECTION));
  return snapshot.docs
    .map((d) => groupFromDoc(d.id, d.data()))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export async function getGroup(id: string): Promise<Group | null> {
  const snapshot = await getDoc(doc(db, COLLECTION, id));
  if (!snapshot.exists()) return null;
  return groupFromDoc(snapshot.id, snapshot.data());
}

export async function createGroup(input: Omit<Group, 'id' | 'active'>): Promise<Group> {
  const data = { ...input, active: true };
  const ref = await addDoc(collection(db, COLLECTION), data);
  return { id: ref.id, ...data };
}

export async function updateGroup(
  id: string,
  changes: Partial<Pick<Group, 'name' | 'teamId' | 'order' | 'active'>>
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), changes);
}

/** No hay `deleteGroup`: nunca se borra nada, solo se desactiva. */
export async function deactivateGroup(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { active: false });
}
