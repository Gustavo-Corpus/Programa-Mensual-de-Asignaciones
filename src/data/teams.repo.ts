import { addDoc, collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';

import type { Team } from '../domain/types';
import { db } from './firebase';
import { teamFromDoc } from './mappers';

const COLLECTION = 'teams';

/** Todos los equipos, activos e inactivos. Nunca se borra ninguno. */
export async function listTeams(): Promise<Team[]> {
  const snapshot = await getDocs(collection(db, COLLECTION));
  return snapshot.docs
    .map((d) => teamFromDoc(d.id, d.data()))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export async function getTeam(id: string): Promise<Team | null> {
  const snapshot = await getDoc(doc(db, COLLECTION, id));
  if (!snapshot.exists()) return null;
  return teamFromDoc(snapshot.id, snapshot.data());
}

export async function createTeam(input: Omit<Team, 'id' | 'active'>): Promise<Team> {
  const data = { ...input, active: true };
  const ref = await addDoc(collection(db, COLLECTION), data);
  return { id: ref.id, ...data };
}

export async function updateTeam(
  id: string,
  changes: Partial<Pick<Team, 'displayName' | 'order' | 'active'>>
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), changes);
}

/** No hay `deleteTeam`: nunca se borra nada, solo se desactiva. */
export async function deactivateTeam(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { active: false });
}
