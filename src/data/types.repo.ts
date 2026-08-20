import { addDoc, collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';

import type { AssignmentType } from '../domain/types';
import { db } from './firebase';
import { assignmentTypeFromDoc } from './mappers';

const COLLECTION = 'assignmentTypes';

/** Todos los tipos de asignación, activos e inactivos. Nunca se borra ninguno. */
export async function listAssignmentTypes(): Promise<AssignmentType[]> {
  const snapshot = await getDocs(collection(db, COLLECTION));
  return snapshot.docs
    .map((d) => assignmentTypeFromDoc(d.id, d.data()))
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

export async function getAssignmentType(id: string): Promise<AssignmentType | null> {
  const snapshot = await getDoc(doc(db, COLLECTION, id));
  if (!snapshot.exists()) return null;
  return assignmentTypeFromDoc(snapshot.id, snapshot.data());
}

export async function createAssignmentType(input: Omit<AssignmentType, 'id' | 'active'>): Promise<AssignmentType> {
  const data = { ...input, active: true };
  const ref = await addDoc(collection(db, COLLECTION), data);
  return { id: ref.id, ...data };
}

export async function updateAssignmentType(
  id: string,
  changes: Partial<Omit<AssignmentType, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), changes);
}

/** No hay `deleteAssignmentType`: nunca se borra nada, solo se desactiva. */
export async function deactivateAssignmentType(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { active: false });
}
