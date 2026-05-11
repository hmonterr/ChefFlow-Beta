import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, onSnapshot, deleteDoc, updateDoc, getDocFromServer, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const signInAsGuest = () => signInAnonymously(auth);
export const logout = () => signOut(auth);

export async function migrateGuestData(oldUid: string, newUid: string, userEmail: string | null) {
  try {
    const recipesQuery = query(collection(db, 'recipes'), where('userId', '==', oldUid));
    const ingredientsQuery = query(collection(db, 'ingredients'), where('userId', '==', oldUid));

    // Fetch concurrently to save round-trip time
    const [recipeDocs, ingredientDocs] = await Promise.all([
      getDocs(recipesQuery),
      getDocs(ingredientsQuery)
    ]);
// Consolidate all document references for the migration
    const allDocs = [
      ...recipeDocs.docs.map(d => ({ ref: doc(db, 'recipes', d.id) })),
      ...ingredientDocs.docs.map(d => ({ ref: doc(db, 'ingredients', d.id) }))
    ];

    // CHUNKING SAFETY NET: Firestore batch limit is 500 ops
    const chunkSize = 490; 
    for (let i = 0; i < allDocs.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = allDocs.slice(i, i + chunkSize);
      
      chunk.forEach(item => {
        batch.update(item.ref, { userId: newUid });
      });

      // Attach the user profile payload to the final batch chunk
      if (i + chunkSize >= allDocs.length) {
        const userRef = doc(db, 'users', newUid);
        batch.set(userRef, { 
          lastActive: new Date().toISOString(),
          isAnonymous: false,
          email: userEmail 
        }, { merge: true });
      }

      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.MIGRATE, 'migration_batch');
    throw error; 
  }
}

export const logActivity = async (
  userId: string | undefined,
  event: 'login' | 'parse_recipe' | 'library_save' | 'library_load' | 'export_pdf' | 'manual_edit',
  metadata: Record<string, any> = {}
) => {
  if (!userId) return; 

  try {
    // Using addDoc to auto-generate unique log IDs
    addDoc(collection(db, 'activity_logs'), {
      userId,
      event,
      metadata: {
        ...metadata,
        client_timestamp: new Date().toISOString(),
        manifest_version: 'v120', 
      },
      timestamp: serverTimestamp() 
    });
  } catch (error) {
    console.warn(`[Telemetry] Failed to log ${event}:`, error);
  }
};

// Error handling helper
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
  MIGRATE = 'migrate',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();
